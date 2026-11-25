import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createAccountSetup, createSetupClient, readRecoveryHash, validateNewPassword } from "../js/account-setup-flow.mjs";

const userId = "10000000-0000-4000-8000-000000000001";
const operation = "20000000-0000-4000-8000-000000000001";
const recoveryId = "30000000-0000-4000-8000-000000000001";
const passwordId = "30000000-0000-4000-8000-000000000002";
const token = "a".repeat(56);
const email = "test@example.com";
const password = "synthetic-password";
const user = { id: userId, email, email_confirmed_at: "synthetic", is_anonymous: false, role: "authenticated", app_metadata: { csupak_provisioning_operation_id: operation } };
const ok = data => ({ data, error: null });
const fail = code => ({ data: null, error: { code, message: "DO NOT DISPLAY THIS RAW ERROR" } });

function fixture(overrides = {}) {
    const calls = [];
    const setup = createAccountSetup(purpose => {
        const access_token = `${purpose}-synthetic`;
        const record = (name, value) => calls.push([purpose, name, value]);
        return {
            auth: {
                verifyOtp(params) {
                    record("verifyOtp", params);
                    return overrides.verify?.() ?? ok({ session: { access_token } });
                },
                getUser(bearer) {
                    assert.equal(bearer, access_token);
                    return ok({ user: (purpose === "recovery" ? overrides.recoveryUser : overrides.passwordUser) ?? user });
                },
                getClaims(bearer) {
                    assert.equal(bearer, access_token);
                    return ok({ claims: {
                        sub: userId,
                        session_id: purpose === "recovery" ? recoveryId : overrides.passwordSessionId ?? passwordId,
                        amr: [{ method: purpose === "recovery" ? "otp" : overrides.passwordMethod ?? "password", timestamp: 1 }]
                    } });
                },
                updateUser(attributes) {
                    record("updateUser", attributes);
                    return overrides.update?.() ?? ok({ user });
                },
                signInWithPassword(params) {
                    record("signInWithPassword", params);
                    return overrides.signIn?.() ?? ok({ session: { access_token } });
                },
                signOut(options) {
                    record("signOut", options);
                    if (overrides.cleanupError) throw new Error("mock network failure");
                }
            },
            rpc(name) {
                record(name);
                return name === "get_account_setup_state"
                    ? overrides.state?.() ?? ok("pending")
                    : overrides.complete?.() ?? ok("completed");
            }
        };
    });
    return { setup, calls };
}

test("accepts only a single recovery token hash in the fragment and scrubs the URL once", () => {
    assert.equal(readRecoveryHash(`#token_hash=${token}`), token);
    for (const fragment of ["", "#type=recovery", "#access_token=ignored", `#token_hash=${token}&type=recovery`, `#token_hash=${token}&token_hash=${token}`, "#token_hash=short"]) {
        assert.equal(readRecoveryHash(fragment), null);
    }
    const page = readFileSync(new URL("../pages/account-setup.html", import.meta.url), "utf8");
    const bootstrap = page.match(/<script>([\s\S]*?)<\/script>/)[1];
    const location = { hash: `#token_hash=${token}`, search: "", pathname: "/pages/account-setup.html" };
    const history = { replaceState: (...args) => assert.deepEqual(args, [null, "", location.pathname]) };
    assert.deepEqual(Array.from(runInNewContext(`${bootstrap}\n;[takeSetupCallback(), takeSetupCallback()]`, { location, history })), [location.hash, ""]);
    history.replaceState = () => { throw new Error("blocked"); };
    assert.equal(runInNewContext(`${bootstrap}\n;takeSetupCallback()`, { location, history }), "");
});

test("password length is counted in characters and confirmation must match", () => {
    assert.match(validateNewPassword("short", "short"), /8 characters/);
    assert.match(validateNewPassword(password, "different"), /match/);
    assert.equal(validateNewPassword("🔐".repeat(8), "🔐".repeat(8)), null);
});

test("missing and expired links cannot show password setup", async () => {
    const { setup, calls } = fixture({ verify: () => fail("otp_expired") });
    assert.equal((await setup.open(null)).mode, "resume");
    assert.deepEqual(calls, []);
    assert.match((await setup.open(token)).message, /expired/);
    assert.deepEqual(calls.map(([, name]) => name), ["verifyOtp", "signOut"]);
});

test("an unrelated identity or unavailable setup state cannot edit a password", async () => {
    for (const overrides of [{ recoveryUser: { ...user, app_metadata: {} } }, { state: () => ok("unavailable") }, { state: () => fail("PGRST202") }, { verify: () => ok({}) }]) {
        const { setup, calls } = fixture(overrides);
        assert.equal((await setup.open(token)).mode, "resume");
        await setup.setPassword(password, password);
        assert.equal(calls.some(([, name]) => name === "updateUser"), false);
    }
});

test("the setup state is rechecked before changing a password", async () => {
    let counter = 0;
    const { setup, calls } = fixture({ state: () => ok(counter++ === 0 ? "pending" : "already_completed") });
    assert.equal((await setup.open(token)).mode, "password");
    assert.equal((await setup.setPassword(password, password)).mode, "success");
    assert.equal(calls.some(([, name]) => name === "updateUser"), false);
});

test("successful setup uses fresh password authorization and local-only session cleanup", async () => {
    const { setup, calls } = fixture();
    assert.equal((await setup.open(token)).mode, "password");
    assert.equal((await setup.setPassword(password, password)).mode, "success");
    assert.deepEqual(calls, [
        ["recovery", "verifyOtp", { type: "recovery", token_hash: token }], ["recovery", "get_account_setup_state", undefined],
        ["recovery", "get_account_setup_state", undefined], ["recovery", "updateUser", { password }],
        ["recovery", "signOut", { scope: "local" }], ["password", "signInWithPassword", { email, password }],
        ["password", "complete_account_onboarding", undefined], ["password", "signOut", { scope: "local" }]
    ]);
});

test("mismatched identities, old recovery sessions, and OTP or recovery AMR skip completion", async () => {
    for (const overrides of [{ passwordUser: { ...user, id: operation } }, { passwordUser: { ...user, email: "other@example.com" } }, { passwordSessionId: recoveryId }, { passwordMethod: "otp" }, { passwordMethod: "recovery" }]) {
        const { setup, calls } = fixture(overrides);
        await setup.open(token);
        const result = await setup.setPassword(password, password);
        assert.match(result.message, /password was set/);
        assert.equal(calls.some(([, name]) => name === "complete_account_onboarding"), false);
        assert.deepEqual(calls.at(-1), ["password", "signOut", { scope: "local" }]);
    }
});

test("interrupted password sign-in or completion can resume even after a reload or a lost response", async () => {
    for (const overrides of [{ signIn: () => fail("invalid_credentials") }, { complete: () => fail("network_failure") }, { complete: () => ok("unexpected") }]) {
        const { setup } = fixture(overrides);
        await setup.open(token);
        const result = await setup.setPassword(password, password);
        assert.equal(result.mode, "resume");
        assert.match(result.message, /password was set.*pending/);
        const reloaded = fixture({ complete: () => ok("already_completed") });
        await reloaded.setup.open(null);
        assert.equal((await reloaded.setup.resume(` ${email.toUpperCase()} `, password)).mode, "success");
        assert.equal(reloaded.calls.some(([purpose]) => purpose === "recovery"), false);
    }
    const existing = fixture();
    await existing.setup.open(token);
    assert.equal((await existing.setup.switchToResume()).email, email);
    assert.deepEqual(existing.calls.at(-1), ["recovery", "signOut", { scope: "local" }]);
    assert.equal((await existing.setup.resume(email, password)).mode, "success");
});

test("safe failures distinguish Auth policy errors, uncertain updates, and completion denials", async () => {
    for (const [code, mode, message] of [["weak_password", "password", /stronger/], ["reauthentication_needed", "resume", /additional verification/], ["fetch_failed", "resume", /could not be confirmed/]]) {
        const { setup, calls } = fixture({ update: () => fail(code) });
        await setup.open(token);
        const result = await setup.setPassword(password, password);
        assert.equal(result.mode, mode);
        assert.match(result.message, message);
        assert.equal(calls.some(([purpose]) => purpose === "password"), false);
    }
    const denied = fixture({ complete: () => fail("42501") });
    assert.match((await denied.setup.resume(email, password)).message, /could not be completed/);
});

test("duplicate submissions are ignored even while the update is waiting", async () => {
    let finish;
    const update = new Promise(resolve => { finish = resolve; });
    const { setup } = fixture({ update: () => update, cleanupError: true });
    await setup.open(token);
    const first = setup.setPassword(password, password);
    assert.equal(await setup.setPassword(password, password), null);
    finish(ok({ user }));
    assert.equal((await first).mode, "success");
    assert.equal(await setup.resume(email, password), null);
});

test("shared configuration preserves normal page initialization and skips it on setup", () => {
    const config = readFileSync(new URL("../js/supabase.js", import.meta.url), "utf8");
    let normalCalls = 0;
    const supabase = { createClient: () => { normalCalls++; return {}; } };
    for (const [configOnly, expected] of [[false, false], [true, true]]) {
        const actual = runInNewContext(`${config}\n;supabaseClient === null`, {
            document: { currentScript: { hasAttribute: name => configOnly && name === "data-supabase-config-only" } }, window: { supabase }
        });
        assert.equal(actual, expected);
    }
    assert.equal(normalCalls, 1);
    for (const purpose of ["recovery", "password"]) {
        createSetupClient((url, key, options) => {
            assert.equal(url, "https://test.invalid");
            assert.equal(key, "test-key");
            assert.deepEqual(options.auth, { storageKey: `csupak-account-setup-${purpose}`, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: "implicit" });
        }, "https://test.invalid", "test-key", purpose);
    }
});
