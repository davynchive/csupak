import { closeRecoveryClient, createRecoveryClient, isRecoveryHash, validateNewPassword } from "./recovery-shared.mjs";
export { readRecoveryHash, validateNewPassword } from "./recovery-shared.mjs";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function createSetupClient(createClient, url, key, purpose) {
    return createRecoveryClient(createClient, url, key, `account-setup-${purpose}`);
}

function identity(user) {
    const operation = user?.app_metadata?.csupak_provisioning_operation_id;
    if (typeof user?.id !== "string" || !uuid.test(user.id) || typeof operation !== "string" || !uuid.test(operation) || user.is_anonymous !== false ||
        user.role !== "authenticated" || !user.email_confirmed_at || typeof user.email !== "string" || !user.email.trim()) {
        return null;
    }
    return { id: user.id, email: user.email.trim().toLowerCase(), operation };
}

function sameIdentity(first, second) {
    return first && second && first.id === second.id && first.email === second.email && first.operation === second.operation;
}

async function verifiedIdentity(client, session) {
    if (!session?.access_token) return null;
    const result = await client.auth.getUser(session.access_token);
    if (result.error) throw result.error;
    return identity(result.data?.user);
}

async function verifiedClaims(client, session, recipient) {
    const result = await client.auth.getClaims(session.access_token);
    const claims = result.data?.claims;
    if (result.error) throw result.error;
    return claims?.sub === recipient.id && typeof claims.session_id === "string" && uuid.test(claims.session_id) ? claims : null;
}

const invalidLink = "This setup link is invalid, expired, or already used. If you set a password, sign in below to finish setup. Otherwise, ask your administrator for a new link.";
const serviceUnavailable = "Setup could not be verified right now. Try again, or ask your administrator for a new link.";
const pending = "Your password was set. Account setup is still pending. Sign in below with your new password to finish.";

export function createAccountSetup(makeClient) {
    let recovery;
    let recipient;
    let recoverySessionId;
    let busy = false;
    let finished = false;

    async function run(task) {
        if (busy || finished) return null;
        busy = true;
        try {
            const result = await task();
            if (result.mode === "success") finished = true;
            return result;
        } finally {
            busy = false;
        }
    }

    async function closeRecovery() {
        const client = recovery;
        recovery = undefined;
        await closeRecoveryClient(client);
    }

    async function complete(email, password) {
        const client = makeClient("password");
        try {
            const result = await client.auth.signInWithPassword({ email, password });
            if (result.error) {
                return result.error.code === "invalid_credentials" ? "credentials" : "pending";
            }
            const session = result.data?.session;
            const current = await verifiedIdentity(client, session);
            if (!current || current.email !== email || (recipient && !sameIdentity(current, recipient))) return "unavailable";
            const claims = await verifiedClaims(client, session, current);
            if (!claims || claims.session_id === recoverySessionId || !Array.isArray(claims.amr) ||
                !claims.amr.some(entry => entry?.method === "password" && Number.isInteger(entry.timestamp))) return "unavailable";

            const { data, error } = await client.rpc("complete_account_onboarding");
            if (!error && (data === "completed" || data === "already_completed")) return "success";
            return error?.code === "42501" ? "unavailable" : "pending";
        } catch {
            return "pending";
        } finally {
            await closeRecoveryClient(client);
        }
    }

    return {
        open(token) {
            return run(async () => {
                if (!isRecoveryHash(token)) {
                    return { mode: "resume", message: token === null ? "If you already set a password, sign in to finish setup. Otherwise, open the link from your setup email." : invalidLink };
                }
                let keepRecovery = false;
                try {
                    recovery = makeClient("recovery");
                    const result = await recovery.auth.verifyOtp({ type: "recovery", token_hash: token });
                    if (result.error) {
                        const invalid = ["otp_expired", "validation_failed", "invalid_credentials"].includes(result.error.code);
                        return { mode: "resume", message: invalid ? invalidLink : serviceUnavailable };
                    }
                    const session = result.data?.session;
                    recipient = await verifiedIdentity(recovery, session);
                    if (!recipient) return { mode: "resume", message: invalidLink };
                    const claims = await verifiedClaims(recovery, session, recipient);
                    if (!claims) return { mode: "resume", message: invalidLink };
                    recoverySessionId = claims.session_id;
                    const { data, error } = await recovery.rpc("get_account_setup_state");
                    if (error) return { mode: "resume", message: serviceUnavailable };
                    if (data === "already_completed") return { mode: "success" };
                    if (data !== "pending") return { mode: "resume", message: "Setup is unavailable for this account. Contact your administrator if you need help." };
                    keepRecovery = true;
                    return { mode: "password", email: recipient.email };
                } catch {
                    return { mode: "resume", message: serviceUnavailable };
                } finally {
                    if (!keepRecovery) await closeRecovery();
                }
            });
        },

        setPassword(password, confirmation) {
            return run(async () => {
                const problem = validateNewPassword(password, confirmation);
                if (problem) return { mode: "password", message: problem };
                if (!recovery || !recipient) return { mode: "resume", message: invalidLink };

                let updateStarted = false;
                try {
                    const state = await recovery.rpc("get_account_setup_state");
                    if (state.error) return { mode: "password", message: serviceUnavailable };
                    if (state.data !== "pending") {
                        await closeRecovery();
                        return state.data === "already_completed" ? { mode: "success" } : { mode: "resume", message: invalidLink };
                    }
                    updateStarted = true;
                    const updated = await recovery.auth.updateUser({ password });
                    if (updated.error?.code === "weak_password") {
                        return { mode: "password", message: "Choose a stronger password that meets the project's password policy." };
                    }
                    if (updated.error?.code === "same_password") {
                        await closeRecovery();
                        return { mode: "resume", message: "That password is already set. Sign in below to finish setup.", email: recipient.email };
                    }
                    if (updated.error && ["reauthentication_needed", "reauthentication_not_valid"].includes(updated.error.code)) {
                        await closeRecovery();
                        return { mode: "resume", message: "Supabase requires additional verification before changing this password. Contact your administrator for help." };
                    }
                    if (updated.error) throw updated.error;

                    await closeRecovery();
                    if (!sameIdentity(identity(updated.data?.user), recipient)) return { mode: "resume", message: pending, email: recipient.email };
                    const outcome = await complete(recipient.email, password);
                    return outcome === "success" ? { mode: "success" } : { mode: "resume", message: pending, email: recipient.email };
                } catch (error) {
                    if (!updateStarted) return { mode: "password", message: serviceUnavailable };
                    await closeRecovery();
                    if (["session_expired", "session_not_found", "bad_jwt"].includes(error?.code)) {
                        return { mode: "resume", message: invalidLink, email: recipient.email };
                    }
                    return {
                        mode: "resume", email: recipient.email,
                        message: "The password change could not be confirmed. If your new password works, sign in below to finish. Otherwise, ask your administrator for a new setup link."
                    };
                }
            });
        },

        switchToResume() {
            return run(async () => {
                await closeRecovery();
                return { mode: "resume", message: "Sign in with the email and password for your setup account.", email: recipient?.email };
            });
        },

        resume(email, password) {
            return run(async () => {
                await closeRecovery();
                const normalizedEmail = email.trim().toLowerCase();
                if (recipient && recipient.email !== normalizedEmail) {
                    return { mode: "resume", message: "Use the email address from your setup invitation.", email: recipient.email };
                }
                const outcome = await complete(normalizedEmail, password);
                if (outcome === "success") return { mode: "success" };
                const messages = {
                    credentials: "Sign-in failed. Check your email and password and try again.",
                    unavailable: "Setup could not be completed for this account. Contact your administrator for help.",
                    pending: "Setup completion could not be confirmed. Try signing in again to finish."
                };
                return { mode: "resume", message: messages[outcome], email: normalizedEmail };
            });
        }
    };
}
