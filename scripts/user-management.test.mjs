import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { accountStates, adminError, availableActions, createOperationJournal, createPager, emailOutcomeMessage, newUserInput }
    from "../js/user-management-model.mjs";

test("account actions respect the current actor, onboarding, and owner-only setup reference", () => {
    const user = { id: "target", email: "fixture@example.invalid", accountState: "setup_pending", setupOperationId: null };
    assert.deepEqual(availableActions(user, "admin", "roles"), ["change_role"]);
    assert.deepEqual(availableActions(user, "admin", "manage"), ["update_name"]);
    assert.deepEqual(availableActions({ ...user, setupOperationId: "original" }, "admin", "manage"), ["update_name", "resend_setup_email"]);
    for (const accountState of ["active", "awaiting_activation", "deactivated"]) {
        assert.ok(accountStates[accountState]);
        assert.deepEqual(availableActions({ ...user, accountState }, "admin", "roles"), ["change_role", "set_status"]);
        assert.deepEqual(availableActions({ ...user, accountState }, user.id, "roles"), []);
        assert.deepEqual(availableActions({ ...user, accountState }, "admin", "manage"), ["update_name", "request_password_reset"]);
    }
});

test("create validates the name, literal email and supported roles without accepting passwords", () => {
    assert.deepEqual(newUserInput(" Test User ", "Staff.1_test+tag@Example.invalid", "oswe_staff"),
        { action: "create_user", fullName: "Test User", email: "staff.1_test+tag@example.invalid", role: "oswe_staff" });
    assert.equal(newUserInput("A", "staff@example.invalid", "oswe_staff"), null);
    assert.equal(newUserInput("Valid Name", "staff@invalid", "oswe_staff"), null);
    assert.equal(newUserInput("Valid Name", "staff@example.invalid", "oswe_admin"), null);
});

test("each intent keeps its own operation ID until resolved and can resume a server-owned request", () => {
    let count = 0;
    const journal = createOperationJournal(() => `op-${++count}`);
    const first = { action: "request_password_reset", userId: "target" };
    const second = { action: "set_status", isActive: false, userId: "target" };
    assert.equal(journal.request(first).operationId, "op-1");
    assert.equal(journal.request(second).operationId, "op-2");
    assert.equal(journal.request(first).operationId, "op-1");
    journal.finish(first);
    assert.equal(journal.request(first).operationId, "op-3");
    assert.equal(journal.request(second, "server-operation").operationId, "server-operation");
    assert.equal(journal.request(second).operationId, "server-operation");
    journal.clear();
    assert.equal(journal.request(second).operationId, "op-4");
});

test("mail messages distinguish accepted, rejected, throttled and uncertain outcomes without confirming delivery", () => {
    assert.match(emailOutcomeMessage("requested"), /delivery is unconfirmed/);
    assert.match(emailOutcomeMessage("not_requested"), /not requested/);
    assert.match(emailOutcomeMessage("email_cooldown"), /one minute/);
    assert.match(emailOutcomeMessage("recovery_cooldown"), /one minute/);
    assert.match(emailOutcomeMessage("outcome_unknown"), /Check the recipient/);
    assert.equal(emailOutcomeMessage("toString"), null);
    assert.equal(adminError(503, "operation_outcome_unknown").definitive, false);
    assert.equal(adminError(409, "provisioning_conflict").definitive, true);
});

test("cursor navigation retries the failed page and returns to the previous cursor", async () => {
    const cursors = [];
    const results = [];
    let fail = true;
    const pager = createPager(async cursor => {
        cursors.push(cursor);
        if (cursor === "cursor-1" && fail) { fail = false; throw Error("offline"); }
        return { nextCursor: cursor ? null : "cursor-1" };
    }, state => results.push(state));
    await pager.load();
    await pager.load(1);
    assert.equal(results.at(-1).error.message, "offline");
    await pager.load("retry");
    assert.equal(results.at(-1).page, 1);
    await pager.load(-1);
    assert.deepEqual(cursors, [null, "cursor-1", "cursor-1", null]);
    assert.equal(results.at(-1).page, 0);
});

test("new filters invalidate stale in-flight responses", async () => {
    const pending = [];
    const results = [];
    const pager = createPager(() => new Promise(resolve => pending.push(resolve)), state => results.push(state));
    const first = pager.load();
    pager.reset();
    const second = pager.load();
    pending[1]({ users: ["current"] });
    await second;
    pending[0]({ users: ["stale"] });
    await first;
    assert.deepEqual(results.filter(state => state.result).map(state => state.result.users), [["current"]]);
});

test("Settings retains three entry points and the TEST launcher includes the shared frontend dependencies", () => {
    const source = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const page = source("pages/settings.html");
    assert.deepEqual([...page.matchAll(/data-user-management="([^"]+)"/g)].map(match => match[1]), ["manage", "add", "roles"]);
    assert.match(page, /id="systemAdministration"[^>]*\bhidden/);
    assert.doesNotMatch(page, /settingNotice/);
    const launcher = source("scripts/start-test.ps1");
    for (const file of ["pages/settings.html", "js/user-management.mjs", "js/user-management-model.mjs", "css/user-management.css"]) {
        assert.ok(launcher.includes(`'${file}'`), file);
    }
    assert.ok(launcher.includes("'src', 'css'"));
    assert.doesNotMatch(source("js/user-management.mjs"), /innerHTML|insertAdjacentHTML|sb_secret_/);
});
