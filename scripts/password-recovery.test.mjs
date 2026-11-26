import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { createPasswordReset, recoveryAcknowledged, requestOwnPasswordReset } from "../js/password-recovery-flow.mjs";
import { createRecoveryClient, readRecoveryHash } from "../js/recovery-shared.mjs";

const token = "a".repeat(56);
const email = "recipient@example.invalid";
const password = "synthetic-password";
const user = { id: "recipient", email, email_confirmed_at: "synthetic", role: "authenticated", is_anonymous: false };
const ok = data => ({ data, error: null });

function fixture(overrides = {}) {
    const calls = [];
    const flow = createPasswordReset(() => {
        calls.push(["create"]);
        return {
            auth: {
                verifyOtp(params) {
                    calls.push(["verifyOtp", params]);
                    return overrides.verify ?? ok({ session: { user, access_token: "fake" } });
                },
                getUser(token) {
                    calls.push(["getUser", token]);
                    return ok({ user: overrides.user ?? user });
                },
                updateUser(attributes) {
                    calls.push(["updateUser", attributes]);
                    return overrides.update?.() ?? ok({ user });
                },
                signOut(options) {
                    calls.push(["signOut", options]);
                    if (overrides.cleanupFailure) throw Error("mock cleanup failure");
                }
            },
            rpc(name) {
                calls.push(["rpc", name]);
                return overrides.state ?? ok("unavailable");
            }
        };
    });
    return { calls, flow };
}

test("forgot password uses a generic response for existing, missing, throttled and refused recipients", async () => {
    const callback = "https://frontend.example.invalid/pages/reset-password.html";
    for (const error of [null, { code: "user_not_found" }, { status: 429 }, { code: "email_address_not_authorized" },
        { name: "AuthRetryableFetchError", status: 504 }]) {
        const auth = { resetPasswordForEmail(recipient, options) {
            assert.equal(recipient, email);
            assert.deepEqual(options, { redirectTo: callback });
            return { error };
        } };
        assert.equal(await requestOwnPasswordReset(auth, ` ${email} `, callback), recoveryAcknowledged);
    }
    const neverSend = { resetPasswordForEmail: () => assert.fail("invalid email reached Auth") };
    assert.match(await requestOwnPasswordReset(neverSend, "invalid@", callback), /valid email/);
    const offline = { resetPasswordForEmail: () => { throw Error("mock network failure"); } };
    assert.match(await requestOwnPasswordReset(offline, email, callback), /could not be confirmed/);
});

test("reset callback scrubs the URL before the external SDK and rejects session flags", () => {
    const page = readFileSync(new URL("../pages/reset-password.html", import.meta.url), "utf8");
    const bootstrap = page.match(/<script>([\s\S]*?)<\/script>/)[1];
    const location = { hash: `#token_hash=${token}`, search: "", pathname: "/pages/reset-password.html" };
    const history = { replaceState: (...args) => assert.deepEqual(args, [null, "", location.pathname]) };
    assert(page.indexOf(bootstrap) < page.indexOf("cdn.jsdelivr.net"));
    const read = runInNewContext(`${bootstrap}\n;takeResetCallback()`, { location, history });
    assert.equal(readRecoveryHash(read), token);
    assert.equal(readRecoveryHash("#type=recovery&access_token=fake"), null);
});

test("missing, expired, unrelated and anonymous recovery sessions cannot update passwords", async () => {
    const missing = fixture();
    assert.equal((await missing.flow.open(null)).mode, "closed");
    assert.deepEqual(missing.calls, []);
    for (const overrides of [{ verify: { error: { code: "otp_expired" } } }, { verify: ok({}) },
        { user: { ...user, id: "other" } }, { user: { ...user, is_anonymous: true } }]) {
        const { flow, calls } = fixture(overrides);
        assert.match((await flow.open(token)).message, /expired/);
        assert.equal((await flow.reset(password, password)).mode, "closed");
        assert(!calls.some(([name]) => name === "updateUser"));
    }
});

test("pending onboarding must use its setup workflow and no recovery path invokes onboarding completion", async () => {
    for (const state of [ok("pending"), { error: { code: "PGRST202" } }]) {
        const { flow, calls } = fixture({ state });
        assert.equal((await flow.open(token)).mode, "closed");
        assert.deepEqual(calls.filter(([name]) => name === "rpc"), [["rpc", "get_account_setup_state"]]);
        assert(!calls.some(([name]) => name === "updateUser"));
    }
});

test("password reset validates length, confirmation and project policy, and cleans up only the recovery session", async () => {
    let attempt = 0;
    const { flow, calls } = fixture({ update: () => attempt++ ? ok({ user }) : { error: { code: "weak_password" } } });
    assert.equal((await flow.open(token)).mode, "password");
    assert.match((await flow.reset("short", "short")).message, /8 characters/);
    assert.match((await flow.reset(password, "different")).message, /match/);
    assert.match((await flow.reset(password, password)).message, /stronger/);
    assert.equal((await flow.reset(password, password)).mode, "success");
    assert.deepEqual(calls, [["create"], ["verifyOtp", { type: "recovery", token_hash: token }], ["getUser", "fake"],
        ["rpc", "get_account_setup_state"], ["updateUser", { password }], ["updateUser", { password }], ["signOut", { scope: "local" }]]);
    createRecoveryClient((url, key, options) => {
        assert.deepEqual(options.auth, { storageKey: "csupak-password-reset", persistSession: false,
            autoRefreshToken: false, detectSessionInUrl: false, flowType: "implicit" });
    }, "https://example.invalid", "public", "password-reset");
});

test("duplicate saves are dropped and uncertain outcomes advise the user to verify by signing in", async () => {
    let rejectUpdate;
    const update = new Promise((resolve, reject) => { rejectUpdate = reject; });
    const { flow, calls } = fixture({ update: () => update, cleanupFailure: true });
    await flow.open(token);
    const pending = flow.reset(password, password);
    assert.equal(await flow.reset(password, password), null);
    rejectUpdate(Error("mock network timeout"));
    const result = await pending;
    assert.equal(result.mode, "closed");
    assert.match(result.message, /could not be confirmed.*signing in/);
    assert.equal(calls.filter(([name]) => name === "updateUser").length, 1);
    assert.deepEqual(calls.at(-1), ["signOut", { scope: "local" }]);
});
