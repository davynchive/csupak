import { closeRecoveryClient, isRecoveryHash, validateNewPassword } from "./recovery-shared.mjs";

export const recoveryAcknowledged = "If an account can receive a reset email at that address, check your inbox. Wait a minute before requesting another email.";

export async function requestOwnPasswordReset(auth, address, redirectTo) {
    const email = address.trim();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
    try {
        const { error } = await auth.resetPasswordForEmail(email, { redirectTo });
        if (error?.name === "AuthRetryableFetchError" && error.status === 0) {
            return "The request could not be confirmed. Check your inbox before trying again.";
        }
        // Keep account-specific results, including throttling and rejected recipients, private.
        return recoveryAcknowledged;
    } catch {
        return "The request could not be confirmed. Check your inbox before trying again.";
    }
}

const invalidLink = "This reset link is invalid, expired, or already used. Return to login to request a new one.";
const unavailable = "The reset link could not be verified right now. Reopen the link from your email to try again.";
const uncertain = "The password update could not be confirmed. Try signing in with the new password. If it does not work, request a new reset link.";

export function createPasswordReset(makeClient) {
    let client;
    let recipientId;
    let busy = false;

    async function close() {
        const recovery = client;
        client = undefined;
        recipientId = undefined;
        await closeRecoveryClient(recovery);
    }

    return {
        async open(token) {
            if (busy || client) return null;
            if (!isRecoveryHash(token)) return { mode: "closed", message: invalidLink };
            busy = true;
            try {
                client = makeClient();
                const { data, error } = await client.auth.verifyOtp({ type: "recovery", token_hash: token });
                if (error || !data?.session?.access_token) {
                    const retryable = error?.name === "AuthRetryableFetchError" || [429, 500, 502, 503, 504].includes(error?.status);
                    return { mode: "closed", message: retryable ? unavailable : invalidLink };
                }
                const { data: verified, error: userError } = await client.auth.getUser(data.session.access_token);
                const user = verified?.user;
                if (userError || !user?.id || user.is_anonymous !== false || user.role !== "authenticated" ||
                    !user.email_confirmed_at || user.id !== data.session.user?.id) return { mode: "closed", message: invalidLink };

                const state = await client.rpc("get_account_setup_state");
                if (state.error || !["pending", "already_completed", "unavailable"].includes(state.data)) {
                    return { mode: "closed", message: unavailable };
                }
                if (state.data === "pending") return { mode: "closed", message: "Use your account setup email to choose your first password. Ask your administrator for a new setup link if needed." };

                recipientId = user.id;
                return { mode: "password", message: "Choose a new password for your CSUPAK account.", email: user.email };
            } catch {
                return { mode: "closed", message: unavailable };
            } finally {
                if (!recipientId) await close();
                busy = false;
            }
        },

        async reset(password, confirmation) {
            if (busy) return null;
            if (!client || !recipientId) return { mode: "closed", message: invalidLink };
            const problem = validateNewPassword(password, confirmation);
            if (problem) return { mode: "password", message: problem };
            busy = true;
            let keepSession = false;
            try {
                const { data, error } = await client.auth.updateUser({ password });
                if (!error && data?.user?.id === recipientId) {
                    return { mode: "success", message: "Your password was reset. Return to login and sign in with your new password." };
                }
                if (error?.code === "weak_password" || error?.code === "same_password") {
                    keepSession = true;
                    return { mode: "password", message: error.code === "weak_password"
                        ? "Choose a stronger password that meets the project's password policy."
                        : "Choose a password different from your current password." };
                }
                if (error?.code === "over_request_rate_limit") {
                    keepSession = true;
                    return { mode: "password", message: "Too many requests. Wait a minute before trying again." };
                }
                if (["reauthentication_needed", "reauthentication_not_valid", "current_password_required"].includes(error?.code)) {
                    return { mode: "closed", message: "Supabase requires additional verification. Request a fresh reset link. Contact your administrator if this continues." };
                }
                if (["session_expired", "session_not_found", "bad_jwt"].includes(error?.code)) return { mode: "closed", message: invalidLink };
                return { mode: "closed", message: uncertain };
            } catch {
                return { mode: "closed", message: uncertain };
            } finally {
                if (!keepSession) await close();
                busy = false;
            }
        }
    };
}
