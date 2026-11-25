import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

const root = new URL("../", import.meta.url);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fixtureUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const operatorModes = ["create", "inspect", "send-recovery", "send-otp", "cleanup"];
const knownErrors = new Set([
    "user_not_found", "email_exists", "user_already_exists", "email_address_not_authorized",
    "over_email_send_rate_limit", "over_request_rate_limit", "captcha_failed", "otp_expired",
    "weak_password", "reauthentication_needed", "email_not_confirmed", "current_password_required",
]);
const methods = new Set([
    "password", "recovery", "otp", "token_refresh", "magiclink", "email/signup", "invite", "totp",
]);
const marker = "csupak_auth_compat_probe";
let stage = "local configuration";

class ProbeFailure extends Error {}

function requireCheck(condition, message) {
    if (!condition) throw new ProbeFailure(message);
}

async function ask(label, hidden = false) {
    const sink = new Writable({ write(_chunk, _encoding, done) { done(); } });
    const input = createInterface({ input: process.stdin, output: hidden ? sink : process.stdout,
        terminal: true, historySize: 0 });
    try {
        if (hidden) process.stdout.write(label);
        return await input.question(hidden ? "" : label);
    } finally {
        input.close();
        if (hidden) process.stdout.write("\n");
    }
}

const read = (file) => readFileSync(new URL(file, root), "utf8");

function testConfig(ref) {
    const saved = JSON.parse(read(".csupak-test.local.json"));
    const production = read("js/supabase.js")
        .match(/const\s+supabaseUrl\s*=\s*["']https:\/\/([a-z0-9]{20})\.supabase\.co\/?["']/)?.[1];
    const base = `https://${ref}.supabase.co`;
    requireCheck(production && ref !== production && ref === saved.projectRef && saved.projectUrl === base,
        "Dashboard reference and local TEST configuration must match and differ from production.");
    requireCheck(typeof saved.publishableKey === "string" && /^sb_publishable_[\w-]+$/.test(saved.publishableKey),
        "The launcher config must contain a TEST publishable key.");
    return { base, publishable: saved.publishableKey };
}

async function request(base, key, path, { method = "GET", jwt, body } = {}) {
    const response = await fetch(`${base}/auth/v1${path}`, {
        method, redirect: "error", signal: AbortSignal.timeout(15000),
        headers: {
            apikey: key,
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: JSON.stringify(body),
    });
    const data = response.headers.get("content-type")?.includes("json") ? await response.json() : null;
    return { ok: response.ok, status: response.status, data, code: data?.error_code ?? data?.code };
}

function accepted(result) {
    const code = knownErrors.has(result.code) ? `, ${result.code}` : "";
    requireCheck(result.ok, `Request rejected (HTTP ${result.status}${code}).`);
    return result.data;
}

function matches(user, fixture) {
    return user?.id === fixture.userId && user.email?.toLowerCase() === fixture.email &&
        user.is_anonymous === false && user.app_metadata?.[marker] === fixture.operationId;
}

async function operator(mode, config, fixture) {
    stage = "TEST Auth admin lookup";
    const secret = (await ask("TEST secret API key (hidden): ", true)).trim();
    requireCheck(/^sb_secret_[\w-]+$/.test(secret), "A TEST secret API key is required for this mode.");
    const userPath = `/admin/users/${fixture.userId}`;
    const admin = (path, options) => request(config.base, secret, path, options);
    const lookup = await admin(userPath);
    if (lookup.status === 404 && lookup.code === "user_not_found") {
        if (mode === "inspect" || mode === "cleanup") {
            console.log("Reserved UUID absent. If an earlier create was uncertain, also check the TEST dashboard.");
            return;
        }
        requireCheck(mode === "create", "Reserved UUID is absent. Stop and reconcile this fixture.");
        requireCheck(await ask("After ruling out an existing account and prior uncertain creation, type CREATE DISPOSABLE: ") ===
            "CREATE DISPOSABLE", "Creation cancelled.");
        stage = "Auth create with reserved UUID";
        const created = accepted(await admin("/admin/users", {
            method: "POST", body: {
                id: fixture.userId, email: fixture.email, email_confirm: false,
                app_metadata: { [marker]: fixture.operationId },
            },
        }));
        if (created?.id !== fixture.userId && uuid.test(created?.id ?? "") &&
            matches(created, { ...fixture, userId: created.id })) {
            console.log(`Auth returned a different fixture UUID for cleanup only: ${created.id}`);
        }
        requireCheck(matches(created, fixture), "Auth did not return the reserved UUID, email, and marker. Stop and reconcile.");
        requireCheck(!created.email_confirmed_at, "Auth returned a confirmed account. Stop before sending email.");
        const reread = accepted(await admin(userPath));
        requireCheck(matches(reread, fixture) && !reread.email_confirmed_at,
            "Fresh lookup did not confirm an unconfirmed fixture with the reserved UUID and marker.");
        console.log("PASS reserved UUID and marker persisted, email initially unconfirmed, no password was supplied.");
        return;
    }

    const user = accepted(lookup);
    requireCheck(matches(user, fixture), "Fixture identity or server marker differs. No action taken.");
    if (mode === "cleanup") {
        stage = "disposable Auth user cleanup";
        requireCheck(await ask("After confirming the user is profileless in TEST, type DELETE DISPOSABLE: ") === "DELETE DISPOSABLE",
            "Cleanup cancelled.");
        accepted(await admin(userPath, { method: "DELETE" }));
        const after = await admin(userPath);
        requireCheck(after.status === 404 && after.code === "user_not_found", "Deletion could not be verified.");
        console.log("PASS disposable Auth UUID is absent.");
    } else if (mode === "send-recovery" || mode === "send-otp") {
        const recovery = mode === "send-recovery";
        stage = recovery ? "setup email request" : "OTP sign-in email request";
        requireCheck(Boolean(user.email_confirmed_at) !== recovery, "Fixture confirmation state does not match this phase.");
        accepted(await request(config.base, config.publishable, recovery ? "/recover" : "/otp", {
            method: "POST", body: recovery ? { email: fixture.email } : { email: fixture.email, create_user: false },
        }));
        console.log("Auth acknowledged the request. Verify receipt independently in the mailbox.");
    } else {
        console.log(`PASS existing fixture matched by reserved UUID and marker. Email confirmed: ${Boolean(user.email_confirmed_at)}. No write performed.`);
    }
}

async function recipient(mode, config, fixture) {
    const auth = (path, options) => request(config.base, config.publishable, path, options);
    async function evidence(label, session) {
        requireCheck(typeof session?.access_token === "string", "Auth did not return an access token.");
        const user = accepted(await auth("/user", { jwt: session.access_token }));
        requireCheck(matches(user, fixture), "Verified session does not belong to the intended fixture.");
        const claims = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString("utf8"));
        requireCheck(claims.sub === fixture.userId && uuid.test(claims.session_id ?? "") &&
            Number.isSafeInteger(claims.iat), "Session claims were missing or malformed.");
        // Successful GET /user checks the token against this project's Auth service.
        const amr = Array.isArray(claims.amr) ? claims.amr.map((entry) => ({
            method: methods.has(entry?.method) ? entry.method : "other",
            timestamp: Number.isSafeInteger(entry?.timestamp) ? entry.timestamp : null,
        })) : null;
        console.log(JSON.stringify({ phase: label, sessionId: claims.session_id, issuedAt: claims.iat, amr,
            emailConfirmed: Boolean(user.email_confirmed_at) }));
        return { id: claims.session_id, confirmed: Boolean(user.email_confirmed_at) };
    }

    async function refresh(label, session, originalId) {
        requireCheck(typeof session.refresh_token === "string", "No refresh token was issued.");
        const refreshed = accepted(await auth("/token?grant_type=refresh_token", {
            method: "POST", body: { refresh_token: session.refresh_token },
        }));
        const renewed = await evidence(label, refreshed);
        requireCheck(renewed.id === originalId, "Refresh changed the session ID. Review hosted behavior before continuing.");
        return refreshed;
    }

    const recovery = mode === "recipient";
    stage = recovery ? "verify recovery email code" : "verify sign-in email code";
    const code = (await ask("Email code (hidden): ", true)).trim();
    requireCheck(/^\d{6,10}$/.test(code), "Enter a numeric email code from the intended TEST message.");
    const verified = accepted(await auth("/verify", {
        method: "POST", body: { email: fixture.email, token: code, type: recovery ? "recovery" : "email" },
    }));
    const before = await evidence(recovery ? "recovery_before_password" : "email_otp", verified);
    if (!recovery) return;
    requireCheck(before.confirmed, "Recovery did not confirm the mailbox. Stop before password setup.");
    await ask("Allow the operator to record the recovery session row before refresh, then press Enter: ");
    stage = "refresh recovery session";
    const recoverySession = await refresh("recovery_session_refresh", verified, before.id);
    await ask("Allow the operator to recheck the recovery session row before password setup, then press Enter: ");

    stage = "set recipient password";
    const password = await ask("New disposable password (hidden): ", true);
    requireCheck(password.length >= 8 && password === await ask("Confirm disposable password (hidden): ", true),
        "Use matching passwords of at least eight characters and follow the TEST Auth policy.");
    accepted(await auth("/user", { method: "PUT", jwt: recoverySession.access_token, body: { password } }));

    stage = "fresh password sign-in";
    const signedIn = accepted(await auth("/token?grant_type=password", {
        method: "POST", body: { email: fixture.email, password },
    }));
    const fresh = await evidence("password_sign_in", signedIn);
    requireCheck(fresh.confirmed && fresh.id !== before.id, "Password sign-in did not establish a new confirmed session.");
    await ask("Allow the operator to record the password session row before refresh, then press Enter: ");

    stage = "refresh password session";
    await refresh("password_session_refresh", signedIn, fresh.id);
    console.log("PASS password sign-in succeeded and refresh reused its session ID. Compare AMR and SQL timestamps.");
}

try {
    const [mode, ref, ...extra] = process.argv.slice(2);
    if (mode === "plan" && ref === undefined) {
        console.log(`Local probe IDs\nOperation UUID: ${randomUUID()}\nProposed target UUID: ${randomUUID()}`);
    } else if (mode === "--help" && ref === undefined) {
        console.log("Usage: node scripts/test-auth-compatibility.mjs plan");
        console.log("       node scripts/test-auth-compatibility.mjs <create|inspect|send-recovery|recipient|send-otp|otp|cleanup> <TEST project ref>");
    } else {
        requireCheck([...operatorModes, "recipient", "otp"].includes(mode) && /^[a-z0-9]{20}$/.test(ref ?? "") &&
            extra.length === 0 && process.stdin.isTTY && process.stdout.isTTY,
        "Use --help and run from an interactive terminal with the TEST dashboard reference.");
        const config = testConfig(ref);
        requireCheck(await ask(`Target ${config.base}. Type CSUPAK-TEST to run ${mode}: `) === "CSUPAK-TEST",
            "TEST target was not confirmed.");
        const operationId = (await ask("Disposable operation UUID: ")).trim().toLowerCase();
        const userId = (await ask("Disposable Auth UUID: ")).trim().toLowerCase();
        const email = (await ask("Reachable disposable TEST email: ", true)).trim().toLowerCase();
        requireCheck(fixtureUuid.test(operationId) && fixtureUuid.test(userId) && operationId !== userId &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Invalid disposable UUIDs or email.");
        const fixture = { operationId, userId, email };
        stage = "TEST Auth health check";
        accepted(await request(config.base, config.publishable, "/health"));
        if (operatorModes.includes(mode)) await operator(mode, config, fixture);
        else await recipient(mode, config, fixture);
    }
} catch (error) {
    const message = error instanceof ProbeFailure ? error.message : "Request could not be completed or verified.";
    console.error(`FAIL ${stage}. ${message}`);
    process.exitCode = 1;
}
