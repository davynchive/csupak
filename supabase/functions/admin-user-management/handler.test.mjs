import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "./handler.ts";

const origin = "http://127.0.0.1:8765";
const environment = {
    supabaseUrl: "https://project.example.invalid",
    publishableKeys: JSON.stringify({ default: "sb_publishable_mock" }),
    allowedOrigins: origin,
};
const token = "Bearer mock.header.signature";
const user = {
    id: "11111111-1111-4111-8111-111111111111",
    role: "authenticated",
    is_anonymous: false,
    email: "mock@example.invalid",
};

function request({ method = "POST", authorization = token, site = origin,
    body = '{"action":"check_access"}', contentType = "application/json" } = {}) {
    const headers = new Headers({ "Content-Type": contentType, apikey: "untrusted-input" });
    if (site !== null) headers.set("Origin", site);
    if (authorization !== null) headers.set("Authorization", authorization);
    return new Request("https://edge.example.invalid/", { method, headers, body: method === "POST" ? body : undefined });
}

function harness(responses = [], config = environment) {
    const calls = [];
    const handle = createHandler(config, async (url, options) => {
        calls.push({ url, options });
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return response;
    });
    return { calls, handle };
}

async function expectError(response, status, code) {
    assert.equal(response.status, status);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { success: false, error: { code } });
}

const resetOperation = "b0000000-0000-4000-8000-000000000001";
const resetTarget = "b0000000-0000-4000-8000-000000000002";
const resetCallback = `${origin}/pages/reset-password.html`;
const resetEmail = "resolved@example.invalid";
const resetEnvironment = { ...environment, resetRedirect: resetCallback,
    setupRedirect: `${origin}/pages/account-setup.html`, secretKeys: JSON.stringify({ default: "sb_secret_mock" }) };
const resetBody = { action: "request_password_reset", operationId: resetOperation, userId: resetTarget };
const resetRequest = fields => request({ body: JSON.stringify({ ...resetBody, ...fields }) });
const authorizedReset = () => [Response.json(user), Response.json("oswe_admin")];
const resetClaimed = () => Response.json({ outcome: "claimed", email: resetEmail });

test("password reset forwards only the requested target and sends to the database-resolved address", async () => {
    const { handle, calls } = harness([...authorizedReset(), resetClaimed(), Response.json("oswe_admin"),
        Response.json({}), Response.json("requested")], resetEnvironment);
    const response = await handle(resetRequest());
    assert.deepEqual(await response.json(), { success: true, data: { operationId: resetOperation, outcome: "requested" } });
    const [, , claim, recheck, dispatch, record] = calls;
    assert(claim.url.endsWith("/admin_claim_password_recovery"));
    assert.deepEqual(JSON.parse(claim.options.body), { p_operation_id: resetOperation, p_target_id: resetTarget });
    assert.equal(claim.options.headers.Authorization, token);
    assert.equal(recheck.options.headers.Authorization, token);
    assert.equal(new URL(dispatch.url).pathname, "/auth/v1/recover");
    assert.equal(new URL(dispatch.url).searchParams.get("redirect_to"), resetCallback);
    assert.deepEqual(JSON.parse(dispatch.options.body), { email: resetEmail });
    assert.equal(dispatch.options.headers.apikey, "sb_publishable_mock");
    assert.equal(dispatch.options.headers.Authorization, undefined);
    assert(record.url.endsWith("/record_admin_password_recovery"));
    assert.equal(record.options.headers.apikey, "sb_secret_mock");
    assert.equal(record.options.headers.Authorization, undefined);
});

test("password reset rejects caller-supplied email, redirects, bad IDs and ineligible administrators", async () => {
    const invalid = harness([], resetEnvironment);
    for (const fields of [{ email: resetEmail }, { redirectTo: resetCallback }, { userId: false }, { operationId: "invalid" }]) {
        await expectError(await invalid.handle(resetRequest(fields)), 400, "invalid_parameters");
    }
    assert.equal(invalid.calls.length, 0);
    for (const role of ["oswe_staff", "security_office", null]) {
        const denied = harness([Response.json(user), Response.json(role)], resetEnvironment);
        await expectError(await denied.handle(resetRequest()), 403, "access_denied");
        assert.equal(denied.calls.length, 2);
    }
});

test("password reset maps target, setup and conflicting operation errors without dispatch", async () => {
    for (const [rpcError, status, code] of [
        [{ code: "P0002", message: "internal target details" }, 404, "recovery_target_unavailable"],
        [{ code: "55000", message: "Use account setup for this user" }, 409, "onboarding_required"],
        [{ code: "22023", message: "Operation UUID has already been used for a different request" }, 409, "operation_id_conflict"],
    ]) {
        const { handle, calls } = harness([...authorizedReset(), Response.json(rpcError, { status: 400 })], resetEnvironment);
        await expectError(await handle(resetRequest()), status, code);
        assert.equal(calls.length, 3);
    }
});

test("password reset replays cooldown, acknowledged, rejected and uncertain requests without sending", async () => {
    for (const outcome of ["recovery_cooldown", "requested", "not_requested", "outcome_unknown"]) {
        const { handle, calls } = harness([...authorizedReset(), Response.json({ outcome })], resetEnvironment);
        assert.deepEqual(await (await handle(resetRequest())).json(), { success: true, data: { operationId: resetOperation, outcome } });
        assert.equal(calls.length, 3);
    }
});

test("password reset records sanitized dispatch results and does not retry uncertain writes", async () => {
    for (const [dispatch, recorded, outcome] of [
        [Response.json({ error_code: "over_email_send_rate_limit" }, { status: 429 }), Response.json("not_requested"), "not_requested"],
        [new Error("network timeout"), Response.json("outcome_unknown"), "outcome_unknown"],
        [Response.json({}), new Error("lost receipt response"), "outcome_unknown"],
    ]) {
        const { handle, calls } = harness([...authorizedReset(), resetClaimed(), Response.json("oswe_admin"), dispatch, recorded], resetEnvironment);
        assert.deepEqual(await (await handle(resetRequest())).json(), { success: true, data: { operationId: resetOperation, outcome } });
        assert.equal(calls.length, 6);
        assert.equal(calls.filter(({ url }) => url.includes("/auth/v1/recover?")).length, 1);
    }
});

test("password reset rechecks the administrator and rejects malformed claims or callback configuration", async () => {
    const denied = harness([...authorizedReset(), resetClaimed(), Response.json(null), Response.json("not_requested")], resetEnvironment);
    await expectError(await denied.handle(resetRequest()), 403, "access_denied");
    assert(!denied.calls.some(({ url }) => url.includes("/auth/v1/recover?")));
    assert.deepEqual(JSON.parse(denied.calls.at(-1).options.body), { p_operation_id: resetOperation, p_outcome: "not_requested" });
    for (const claim of [{ outcome: "claimed", email: "bad" }, { outcome: ["requested"] }]) {
        const malformed = harness([...authorizedReset(), Response.json(claim)], resetEnvironment);
        await expectError(await malformed.handle(resetRequest()), 503, "service_unavailable");
        assert.equal(malformed.calls.length, 3);
    }
    const misconfigured = harness(authorizedReset(), { ...resetEnvironment, resetRedirect: resetEnvironment.setupRedirect });
    await expectError(await misconfigured.handle(resetRequest()), 503, "service_unavailable");
    assert.equal(misconfigured.calls.length, 2);
});

test("missing and malformed bearer credentials fail before calling Supabase", async () => {
    const { handle, calls } = harness();
    for (const authorization of [null, "Basic mock", "Bearer sb_publishable_mock", `${token}, ${token}`]) {
        const response = await handle(request({ authorization }));
        await expectError(response, 401, "invalid_access_token");
        assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    }
    assert.equal(calls.length, 0);
});

test("Auth rejects JWTs that are invalid or expired", async () => {
    const { handle, calls } = harness([
        Response.json({ message: "mock invalid token details" }, { status: 401 }),
        Response.json({ message: "mock expired token details" }, { status: 403 }),
    ]);
    await expectError(await handle(request()), 401, "invalid_access_token");
    await expectError(await handle(request()), 401, "invalid_access_token");
    assert(calls.every(({ url }) => url.endsWith("/auth/v1/user")));
    assert.equal(calls.length, 2);
});

test("anonymous identities and unverified identity types fail before role lookup", async () => {
    const { handle, calls } = harness([
        Response.json({ ...user, is_anonymous: true }),
        Response.json({ ...user, is_anonymous: undefined }),
        Response.json({ ...user, role: "service_role" }),
    ]);
    for (let index = 0; index < 3; index++) {
        await expectError(await handle(request()), 403, "access_denied");
    }
    assert(calls.every(({ url }) => url.endsWith("/auth/v1/user")));
    assert.equal(calls.length, 3);
});

test("Staff and Security Office are denied", async () => {
    const { handle } = harness([
        Response.json(user), Response.json("oswe_staff"),
        Response.json(user), Response.json("security_office"),
    ]);
    await expectError(await handle(request()), 403, "access_denied");
    await expectError(await handle(request()), 403, "access_denied");
});

test("NULL eligibility result denies missing profiles, inactive accounts, and stale sessions", async () => {
    const { handle, calls } = harness([Response.json(user), Response.json(null)]);
    await expectError(await handle(request()), 403, "access_denied");
    assert.equal(calls.length, 2);
});

test("Auth and role lookup outages return a sanitized error", async () => {
    for (const responses of [
        [new Error("mock network details")],
        [Response.json({ message: "mock Auth details" }, { status: 500 })],
        [Response.json(user), Response.json({ details: "mock database details" }, { status: 500 })],
        [Response.json(user), new Response("mock invalid role payload")],
    ]) {
        const { handle } = harness(responses);
        await expectError(await handle(request()), 503, "service_unavailable");
    }
});

test("eligible administrator receives only the authorization flag and both calls use the caller JWT", async () => {
    const { handle, calls } = harness([Response.json(user), Response.json("oswe_admin")]);
    const response = await handle(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { success: true, data: { authorized: true } });
    assert.deepEqual(calls.map(({ url, options }) => [url, options.method, options.body]), [
        [`${environment.supabaseUrl}/auth/v1/user`, "GET", undefined],
        [`${environment.supabaseUrl}/rest/v1/rpc/get_my_role`, "POST", "{}"],
    ]);
    for (const { options } of calls) {
        const headers = new Headers(options.headers);
        assert.equal(headers.get("Authorization"), token);
        assert.equal(headers.get("apikey"), "sb_publishable_mock");
        assert.equal(options.redirect, "error");
    }
});

test("unsupported methods, media types, JSON, and actions are rejected before Auth", async () => {
    const { handle, calls } = harness();
    const methodResponse = await handle(request({ method: "GET" }));
    await expectError(methodResponse, 405, "method_not_allowed");
    assert.equal(methodResponse.headers.get("Allow"), "POST, OPTIONS");
    await expectError(await handle(request({ contentType: "text/plain" })), 415, "expected_json");
    await expectError(await handle(request({ body: "{" })), 400, "invalid_json");
    for (const body of ["null", "[]", '{"action":"delete_user"}', '{"action":["list_users"]}',
        '{"action":{"toString":null}}', '{"action":"check_access","role":"oswe_admin"}',
        '{"action":"check_access","actorId":"mock","isAdmin":true}']) {
        await expectError(await handle(request({ body })), 400, "invalid_action");
    }
    assert.equal(calls.length, 0);
});

const firstRosterUser = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Roster Staff",
    email: "staff@example.invalid",
    role: "oswe_staff",
    isActive: false,
};
const secondRosterUser = {
    id: "33333333-3333-4333-8333-333333333333",
    fullName: "Roster Security",
    email: null,
    role: "security_office",
    isActive: true,
};

const listRequest = (params) => request({ body: JSON.stringify({ action: "list_users", ...params }) });
const rosterResponse = (page) => [Response.json(user), Response.json("oswe_admin"), Response.json(page)];

async function expectPage(response, page) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    assert.deepEqual(await response.json(), { success: true, data: page });
}

test("eligible administrator gets the roster with the caller JWT on all three upstream requests", async () => {
    const page = { users: [firstRosterUser, secondRosterUser], nextCursor: null };
    const { handle, calls } = harness(rosterResponse(page));
    await expectPage(await handle(listRequest()), page);
    assert.deepEqual(calls.map(({ url, options }) => [url, options.method, options.body]), [
        [`${environment.supabaseUrl}/auth/v1/user`, "GET", undefined],
        [`${environment.supabaseUrl}/rest/v1/rpc/get_my_role`, "POST", "{}"],
        [`${environment.supabaseUrl}/rest/v1/rpc/admin_list_users`, "POST", "{}"],
    ]);
    for (const { options } of calls) {
        const headers = new Headers(options.headers);
        assert.equal(headers.get("Authorization"), token);
        assert.equal(headers.get("apikey"), "sb_publishable_mock");
    }
});

test("forwards literal search, role, false status, cursor, and limit", async () => {
    const cursor = "00000000-0000-0000-0000-000000000000";
    const search = "  StaFF_%\\  ";
    const page = { users: [], nextCursor: null };
    const { handle, calls } = harness(rosterResponse(page));
    await expectPage(await handle(listRequest({ search, role: "oswe_staff", isActive: false, cursor, limit: 100 })), page);
    assert.deepEqual(JSON.parse(calls[2].options.body), {
        p_search: search, p_role: "oswe_staff", p_is_active: false, p_cursor: cursor, p_limit: 100,
    });
});

test("first page returns the last UUID as cursor and the next request forwards it", async () => {
    const first = { users: [firstRosterUser], nextCursor: firstRosterUser.id };
    const last = { users: [secondRosterUser], nextCursor: null };
    const { handle, calls } = harness([...rosterResponse(first), ...rosterResponse(last)]);
    await expectPage(await handle(listRequest({ limit: 1 })), first);
    await expectPage(await handle(listRequest({ limit: 1, cursor: first.nextCursor })), last);
    assert.deepEqual(JSON.parse(calls[2].options.body), { p_limit: 1 });
    assert.deepEqual(JSON.parse(calls[5].options.body), { p_cursor: first.nextCursor, p_limit: 1 });
});

test("rejects invalid roster parameters before making an upstream request", async () => {
    const { handle, calls } = harness();
    for (const params of [
        { actorId: user.id }, { isAdmin: true }, { p_limit: 10 },
        { search: 3 }, { search: null }, { search: "a".repeat(201) },
        { search: "\u0000" }, { search: "\uD800" }, { role: "admin" }, { role: [] }, { role: null },
        { isActive: "false" }, { isActive: null }, { cursor: "bad" }, { cursor: 42 }, { cursor: null },
        { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: "20" }, { limit: null },
    ]) {
        await expectError(await handle(listRequest(params)), 400, "invalid_parameters");
    }
    assert.equal(calls.length, 0);
});

test("non-admin and ineligible callers never invoke the roster RPC", async () => {
    for (const role of ["oswe_staff", "security_office", null]) {
        const { handle, calls } = harness([Response.json(user), Response.json(role)]);
        await expectError(await handle(listRequest()), 403, "access_denied");
        assert.equal(calls.length, 2);
    }
});

test("roster RPC failures are sanitized, including eligibility lost after the first check", async () => {
    for (const [upstream, status, code] of [
        [Response.json({ code: "42501", message: "private detail" }, { status: 403 }), 403, "access_denied"],
        [Response.json({ message: "private detail" }, { status: 500 }), 503, "service_unavailable"],
        [new Error("private detail"), 503, "service_unavailable"],
    ]) {
        const { handle } = harness([Response.json(user), Response.json("oswe_admin"), upstream]);
        await expectError(await handle(listRequest()), status, code);
    }
});

test("unexpected roster response data never reaches the client", async () => {
    for (const [page, params] of [
        [null],
        [{ users: {}, nextCursor: null }],
        [{ users: [firstRosterUser] }],
        [{ users: [firstRosterUser], nextCursor: null, count: 1 }],
        [{ users: [{ ...firstRosterUser, metadata: "private detail" }], nextCursor: null }],
        [{ users: [{ ...firstRosterUser, id: "bad" }], nextCursor: null }],
        [{ users: [{ ...firstRosterUser, email: 123 }], nextCursor: null }],
        [{ users: [firstRosterUser], nextCursor: null }, { isActive: true }],
        [{ users: [firstRosterUser], nextCursor: null }, { role: "security_office" }],
        [{ users: [firstRosterUser], nextCursor: null }, { cursor: firstRosterUser.id }],
        [{ users: [secondRosterUser, firstRosterUser], nextCursor: null }],
        [{ users: [firstRosterUser, secondRosterUser], nextCursor: null }, { limit: 1 }],
        [{ users: [firstRosterUser], nextCursor: firstRosterUser.id }],
        [{ users: [firstRosterUser], nextCursor: secondRosterUser.id }, { limit: 1 }],
    ]) {
        const { handle } = harness(rosterResponse(page));
        await expectError(await handle(listRequest(params)), 503, "service_unavailable");
    }
    const { handle } = harness([Response.json(user), Response.json("oswe_admin"), new Response("invalid JSON")]);
    await expectError(await handle(listRequest()), 503, "service_unavailable");
});

const roleChange = {
    action: "change_role",
    operationId: "44444444-4444-4444-8444-444444444444",
    userId: firstRosterUser.id,
    role: "security_office",
};
const statusChange = {
    action: "set_status",
    operationId: "55555555-5555-4555-8555-555555555555",
    userId: firstRosterUser.id,
    isActive: false,
};

const accessRequest = (params) => request({ body: JSON.stringify(params) });
const accessResponses = (result) => [Response.json(user), Response.json("oswe_admin"), result];

async function expectAccessResult(response, operationId, outcome) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    assert.deepEqual(await response.json(), { success: true, data: { operationId, outcome } });
}

test("change_role sends the exact RPC arguments and preserves the caller credentials", async () => {
    const { handle, calls } = harness(accessResponses(Response.json("applied")));
    await expectAccessResult(await handle(accessRequest(roleChange)), roleChange.operationId, "applied");
    assert.deepEqual(calls.map(({ url }) => url), [
        `${environment.supabaseUrl}/auth/v1/user`,
        `${environment.supabaseUrl}/rest/v1/rpc/get_my_role`,
        `${environment.supabaseUrl}/rest/v1/rpc/admin_change_account_access`,
    ]);
    const { options } = calls[2];
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), {
        p_operation_id: roleChange.operationId,
        p_target_id: roleChange.userId,
        p_action: "change_role",
        p_role: "security_office",
    });
    for (const { options } of calls) {
        const headers = new Headers(options.headers);
        assert.equal(headers.get("Authorization"), token);
        assert.equal(headers.get("apikey"), "sb_publishable_mock");
    }
});

test("set_status forwards activation and deactivation without a target-role lookup", async () => {
    for (const isActive of [true, false]) {
        const input = { ...statusChange, isActive, userId: "66666666-6666-4666-8666-666666666666" };
        const { handle, calls } = harness(accessResponses(Response.json("applied")));
        await expectAccessResult(await handle(accessRequest(input)), input.operationId, "applied");
        assert.deepEqual(JSON.parse(calls[2].options.body), {
            p_operation_id: input.operationId,
            p_target_id: input.userId,
            p_action: "set_status",
            p_is_active: isActive,
        });
    }
});

test("identical retries forward the same operation and return the original applied or no_change outcome", async () => {
    for (const outcome of ["applied", "no_change"]) {
        const { handle, calls } = harness([
            ...accessResponses(Response.json(outcome)),
            ...accessResponses(Response.json(outcome)),
        ]);
        await expectAccessResult(await handle(accessRequest(statusChange)), statusChange.operationId, outcome);
        await expectAccessResult(await handle(accessRequest(statusChange)), statusChange.operationId, outcome);
        assert.equal(calls.length, 6);
        assert.deepEqual(calls[2].options.headers, calls[5].options.headers);
        assert.equal(calls[2].options.body, calls[5].options.body);
    }
});

test("invalid access requests, administrator promotion, and extra fields are rejected locally", async () => {
    const { handle, calls } = harness();
    for (const payload of [
        { ...roleChange, operationId: undefined },
        { ...roleChange, operationId: "bad" },
        { ...roleChange, operationId: "00000000-0000-0000-0000-000000000000" },
        { ...roleChange, userId: null },
        { ...statusChange, userId: 1 },
        { ...statusChange, userId: "00000000-0000-0000-0000-000000000000" },
        { ...roleChange, role: "oswe_admin" },
        { ...roleChange, role: "admin" },
        { ...roleChange, role: undefined, actorId: user.id },
        { ...roleChange, isActive: true },
        { ...statusChange, isActive: "false" },
        { ...statusChange, isActive: null },
        { ...statusChange, isActive: undefined },
        { ...statusChange, role: "oswe_staff" },
        { ...statusChange, isAdmin: true },
    ]) {
        await expectError(await handle(accessRequest(payload)), 400, "invalid_parameters");
    }
    assert.equal(calls.length, 0);
});

test("non-admin and ineligible callers cannot dispatch either mutation", async () => {
    for (const mutation of [roleChange, statusChange]) {
        for (const role of ["oswe_staff", "security_office", null]) {
            const { handle, calls } = harness([Response.json(user), Response.json(role)]);
            await expectError(await handle(accessRequest(mutation)), 403, "access_denied");
            assert.equal(calls.length, 2);
        }
    }
});

test("conflicting operation ID reuse returns a sanitized 409", async () => {
    const conflict = Response.json({
        code: "22023", message: "Operation UUID has already been used for a different request", details: "private",
    }, { status: 400 });
    const { handle, calls } = harness([...accessResponses(Response.json("applied")), ...accessResponses(conflict)]);
    await expectAccessResult(await handle(accessRequest(roleChange)), roleChange.operationId, "applied");
    await expectError(await handle(accessRequest({ ...roleChange, role: "oswe_staff" })), 409, "operation_id_conflict");
    assert.equal(JSON.parse(calls[5].options.body).p_operation_id, roleChange.operationId);
    assert.equal(JSON.parse(calls[5].options.body).p_role, "oswe_staff");
});

test("maps database safeguard denials, missing targets, input errors, and lock contention", async () => {
    for (const [dbCode, message, upstreamStatus, status, code] of [
        ["42501", "Administrators cannot deactivate or demote themselves", 403, 403, "access_denied"],
        ["42501", "Administrator access required", 403, 403, "access_denied"],
        ["PGRST301", "JWT expired", 401, 401, "invalid_access_token"],
        ["23514", "At least one active OSWE Administrator is required", 400, 409, "last_active_administrator"],
        ["23514", "Complete account onboarding before activation", 400, 409, "onboarding_required"],
        ["22023", "Target profile not found", 400, 404, "profile_not_found"],
        ["22023", "Status changes require exactly one active status", 400, 400, "invalid_parameters"],
        ["55P03", "canceling statement due to lock timeout", 500, 503, "operation_busy"],
        ["0A000", "Account changes require READ COMMITTED isolation", 400, 503, "service_unavailable"],
        ["55000", "Target profile could not be updated", 500, 503, "service_unavailable"],
        ["PGRST202", "Function is absent from the schema cache", 404, 503, "service_unavailable"],
    ]) {
        const { handle } = harness(accessResponses(Response.json({ code: dbCode, message, hint: "private" },
            { status: upstreamStatus })));
        await expectError(await handle(accessRequest(statusChange)), status, code);
    }
});

test("network failures, unrecognized RPC errors, and malformed outcomes leave the outcome unknown", async () => {
    for (const result of [
        new TypeError("private network details"),
        new DOMException("private timeout details", "TimeoutError"),
        new Response(null, { status: 502 }),
        Response.json({ code: "XX000", message: "private" }, { status: 500 }),
        Response.json({ code: "23514", message: "unrelated constraint" }, { status: 400 }),
        Response.json(null),
        Response.json("success"),
        Response.json({ outcome: "applied", actorId: user.id }),
        new Response("not JSON"),
    ]) {
        const { handle, calls } = harness(accessResponses(result));
        await expectError(await handle(accessRequest(statusChange)), 503, "operation_outcome_unknown");
        assert.equal(calls.length, 3, "handler makes one mutation attempt");
    }
});

test("a retry after an unconfirmed response can recover the original outcome", async () => {
    const { handle, calls } = harness([
        ...accessResponses(new TypeError("mock response lost")),
        ...accessResponses(Response.json("applied")),
    ]);
    await expectError(await handle(accessRequest(statusChange)), 503, "operation_outcome_unknown");
    await expectAccessResult(await handle(accessRequest(statusChange)), statusChange.operationId, "applied");
    assert.equal(calls[2].options.body, calls[5].options.body);
});

const nameChange = {
    action: "update_name",
    operationId: "77777777-7777-4777-8777-777777777777",
    userId: firstRosterUser.id,
    fullName: "  Updated Name  ",
};

test("update_name forwards a normalized name with the caller credentials and supports normalized replay", async () => {
    for (const outcome of ["applied", "no_change"]) {
        const { handle, calls } = harness([
            ...accessResponses(Response.json(outcome)),
            ...accessResponses(Response.json(outcome)),
        ]);
        await expectAccessResult(await handle(accessRequest(nameChange)), nameChange.operationId, outcome);
        const retry = { ...nameChange, fullName: "Updated Name" };
        await expectAccessResult(await handle(accessRequest(retry)), nameChange.operationId, outcome);
        assert.equal(calls[2].url, `${environment.supabaseUrl}/rest/v1/rpc/admin_update_user_name`);
        assert.equal(calls[2].options.method, "POST");
        assert.equal(calls[2].options.headers.Authorization, token);
        assert.equal(calls[2].options.headers.apikey, "sb_publishable_mock");
        assert.deepEqual(JSON.parse(calls[2].options.body), {
            p_operation_id: nameChange.operationId,
            p_target_id: nameChange.userId,
            p_full_name: "Updated Name",
        });
        assert.equal(calls[2].options.body, calls[5].options.body);
    }
});

test("update_name rejects invalid names, IDs, and unexpected fields before upstream requests", async () => {
    const { handle, calls } = harness();
    for (const input of [
        { ...nameChange, fullName: undefined }, { ...nameChange, fullName: 42 },
        { ...nameChange, fullName: "    " }, { ...nameChange, fullName: " A " },
        { ...nameChange, fullName: "é".repeat(101) }, { ...nameChange, fullName: "\u0000A" },
        { ...nameChange, fullName: "\uD800A" }, { ...nameChange, userId: "invalid" },
        { ...nameChange, operationId: "00000000-0000-0000-0000-000000000000" },
        { ...nameChange, role: "oswe_admin" }, { ...nameChange, isActive: true },
        { ...nameChange, actorId: user.id }, { ...nameChange, email: "private@example.invalid" },
    ]) {
        await expectError(await handle(accessRequest(input)), 400, "invalid_parameters");
    }
    assert.equal(calls.length, 0);
    const valid = harness(accessResponses(Response.json("applied")));
    await expectAccessResult(await valid.handle(accessRequest({ ...nameChange, fullName: "𐐷".repeat(100) })),
        nameChange.operationId, "applied");
});

test("update_name requires an eligible administrator", async () => {
    for (const role of ["oswe_staff", "security_office", null]) {
        const { handle, calls } = harness([Response.json(user), Response.json(role)]);
        await expectError(await handle(accessRequest(nameChange)), 403, "access_denied");
        assert.equal(calls.length, 2);
    }
});

test("update_name sanitizes missing profile, conflict, recheck denial, and an uncertain outcome", async () => {
    for (const [upstream, status, code] of [
        [Response.json({ code: "22023", message: "Target profile not found" }, { status: 400 }),
            404, "profile_not_found"],
        [Response.json({ code: "22023", message: "Operation UUID has already been used for a different request" },
            { status: 400 }), 409, "operation_id_conflict"],
        [Response.json({ code: "42501", message: "private detail" }, { status: 403 }), 403, "access_denied"],
        [new TypeError("private network details"), 503, "operation_outcome_unknown"],
        [Response.json({ outcome: "applied", previousName: "private detail" }), 503, "operation_outcome_unknown"],
    ]) {
        const { handle, calls } = harness(accessResponses(upstream));
        await expectError(await handle(accessRequest(nameChange)), status, code);
        assert.equal(calls.length, 3);
    }
});

const createUser = {
    action: "create_user", operationId: "89abcdef-4444-4444-8444-444444444444",
    email: "  Example.Staff+TEST@Example.Invalid  ", fullName: "  Example Staff  ", role: "oswe_staff",
};
const provisioningId = "77777777-7777-4777-8777-777777777777";
const emailAttempt = "88888888-8888-4888-8888-888888888888";
const provisioningEmail = "example.staff+test@example.invalid";
const setupRedirect = "https://setup.example.invalid/account-setup.html";
const secret = "sb_secret_mock";
const provisionEnvironment = { ...environment, secretKeys: JSON.stringify({ default: secret }), setupRedirect };
const resend = { action: "resend_setup_email", operationId: createUser.operationId };
const reserve = (provisioningState = "reserved", emailState = "not_requested") => Response.json({
    operationId: createUser.operationId, targetUserId: provisioningId, provisioningState, emailState,
});
const claim = (outcome) => Response.json({ outcome });
const authClaim = () => Response.json({ outcome: "claimed", targetUserId: provisioningId, email: provisioningEmail });
const mailClaim = (overrides) => Response.json({
    outcome: "claimed", targetUserId: provisioningId, email: provisioningEmail, attemptId: emailAttempt, ...overrides,
});
const value = (result) => Response.json(result);
const dbError = (code, message) => Response.json({ code, message, details: "private upstream details" }, { status: 400 });
const pathOf = (call) => new URL(call.url).pathname;
const provisionHarness = (responses) => harness([value(user), value("oswe_admin"), ...responses], provisionEnvironment);
const provisionRequest = (body = createUser) => request({ body: JSON.stringify(body) });
const postAuth = (calls) => calls.filter((call) => pathOf(call) === "/auth/v1/admin/users");
const postMail = (calls) => calls.filter((call) => pathOf(call) === "/auth/v1/recover");
const readyStart = () => [reserve("profile_ready"), claim("profile_ready"), value("profile_ready")];
const creatingStart = () => [reserve(), authClaim(), value("auth_not_found"), value("oswe_admin")];

async function expectProvisioning(response, provisioningState, emailState, targetUserId = provisioningId) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { success: true, data: {
        operationId: createUser.operationId, provisioningState, emailState, targetUserId,
    } });
}

test("create_user reserves, reconciles, creates Auth with the reserved marker, and records email acknowledgement", async () => {
    const { handle, calls } = provisionHarness([
        ...creatingStart(), value({ id: provisioningId, privateMetadata: "do not return" }), value("profile_ready"),
        mailClaim(), value("oswe_admin"), value({}), value("requested"),
    ]);
    await expectProvisioning(await handle(provisionRequest()), "profile_ready", "requested");
    assert.deepEqual(calls.map((call) => pathOf(call).split("/").at(-1)), [
        "user", "get_my_role", "admin_reserve_account_provisioning", "admin_claim_provisioning_step",
        "reconcile_provisioned_auth_account", "get_my_role", "users", "reconcile_provisioned_auth_account",
        "admin_claim_provisioning_step", "get_my_role", "recover", "record_provisioning_email_outcome",
    ]);
    assert.deepEqual(JSON.parse(calls[2].options.body), {
        p_operation_id: createUser.operationId, p_email: provisioningEmail, p_full_name: "Example Staff", p_role: "oswe_staff",
    });
    assert.deepEqual(JSON.parse(calls[6].options.body), {
        id: provisioningId, email: provisioningEmail, email_confirm: false,
        app_metadata: { csupak_provisioning_operation_id: createUser.operationId },
    });
    assert.equal(new URL(calls[10].url).searchParams.get("redirect_to"), setupRedirect);
    assert.deepEqual(JSON.parse(calls[10].options.body), { email: provisioningEmail });
    assert.deepEqual(JSON.parse(calls[11].options.body), {
        p_operation_id: createUser.operationId, p_attempt_id: emailAttempt, p_outcome: "requested",
    });
    for (const [index, { options }] of calls.entries()) {
        const headers = new Headers(options.headers);
        const privileged = [4, 6, 7, 11].includes(index);
        assert.equal(headers.get("apikey"), privileged ? secret : "sb_publishable_mock");
        assert.equal(headers.get("Authorization"), privileged || index === 10 ? null : token);
        assert.equal(options.redirect, "error");
    }
});

test("provisioning rejects invalid input, arbitrary fields and ineligible administrators", async () => {
    const { handle, calls } = harness([], provisionEnvironment);
    for (const input of [
        { ...createUser, role: "oswe_admin" }, { ...createUser, email: "invalid" },
        { ...createUser, email: "a@b.c\u0000" }, { ...createUser, fullName: " A " },
        { ...createUser, fullName: "a".repeat(101) }, { ...createUser, operationId: "invalid" },
        { ...createUser, operationId: "00000000-0000-0000-0000-000000000000" },
        { ...createUser, password: "extra" }, { ...createUser, userId: provisioningId },
        { ...createUser, isActive: true }, { ...createUser, app_metadata: {} },
        { ...createUser, redirectTo: setupRedirect }, { ...resend, email: provisioningEmail },
    ]) await expectError(await handle(provisionRequest(input)), 400, "invalid_parameters");
    assert.equal(calls.length, 0);
    for (const body of [createUser, resend]) {
        for (const role of ["oswe_staff", "security_office", null]) {
            const denied = harness([value(user), value(role)], provisionEnvironment);
            await expectError(await denied.handle(provisionRequest(body)), 403, "access_denied");
            assert.equal(denied.calls.length, 2);
        }
    }
});

test("provisioning configuration fails closed without disabling existing actions", async () => {
    for (const config of [
        environment, { ...provisionEnvironment, secretKeys: '{"default":"sb_publishable_mock"}' },
        { ...provisionEnvironment, setupRedirect: "http://unsafe.example.invalid/setup" },
    ]) {
        const { handle, calls } = harness([value(user), value("oswe_admin"), value(user), value("oswe_admin")], config);
        await expectError(await handle(provisionRequest()), 503, "service_unavailable");
        assert.equal((await handle(request())).status, 200);
        assert.equal(calls.length, 4);
    }
});

test("creation timeout can reconcile immediately or on retry without dispatching a second create", async () => {
    const { handle, calls } = provisionHarness([
        ...creatingStart(), new TypeError("private network details"), value("auth_not_found"),
        value(user), value("oswe_admin"), reserve("auth_outcome_unknown"), claim("auth_outcome_unknown"),
        value("profile_ready"), claim("requested"),
    ]);
    await expectProvisioning(await handle(provisionRequest()), "auth_outcome_unknown", null);
    await expectProvisioning(await handle(provisionRequest()), "profile_ready", "requested");
    assert.equal(postAuth(calls).length, 1);
    assert.equal(postMail(calls).length, 0);

    const interrupted = provisionHarness([
        ...creatingStart(), new TypeError("response lost"), value("profile_ready"), claim("outcome_unknown"),
    ]);
    await expectProvisioning(await interrupted.handle(provisionRequest()), "profile_ready", "outcome_unknown");
    assert.equal(postAuth(interrupted.calls).length, 1);
    assert.equal(postMail(interrupted.calls).length, 0);
});

test("existing identities, operation conflicts, and profile reconciliation failures block setup mail", async () => {
    for (const [responses, status, code] of [
        [[dbError("22023", "Operation UUID has already been used for a different request")], 409, "operation_id_conflict"],
        [[dbError("22023", "Email already has a provisioning reservation")], 409, "provisioning_conflict"],
        [[reserve(), authClaim(), dbError("23514", "Reserved Auth identity or profile conflicts with provisioning")],
            409, "provisioning_conflict"],
        [[...creatingStart(), Response.json({ code: "email_exists", message: "private" }, { status: 422 }),
            value("auth_not_found")], 409, "provisioning_conflict"],
        [[...creatingStart(), value({ id: emailAttempt }), value("auth_not_found")], 409, "provisioning_conflict"],
        [[reserve("profile_ready"), claim("profile_ready"), dbError("55000", "Provisioned profile is missing")],
            409, "provisioning_not_ready"],
        [[...creatingStart(), value({ id: provisioningId }), dbError("XX000", "private database failure")],
            503, "service_unavailable"],
    ]) {
        const { handle, calls } = provisionHarness(responses);
        await expectError(await handle(provisionRequest()), status, code);
        assert.equal(postMail(calls).length, 0);
        assert(calls.every((call) => call.options.method !== "DELETE"));
    }
});

test("setup email stores definite rejection and uncertainty without automatic resend", async () => {
    for (const [mail, outcome] of [
        [Response.json({ code: "over_email_send_rate_limit" }, { status: 429 }), "not_requested"],
        [new TypeError("private transport failure"), "outcome_unknown"],
        [new Response("gateway timeout", { status: 504 }), "outcome_unknown"],
        [value({ unexpected: true }), "outcome_unknown"],
    ]) {
        const { handle, calls } = provisionHarness([
            ...readyStart(), mailClaim(), value("oswe_admin"), mail, value(outcome),
            value(user), value("oswe_admin"), ...readyStart(), claim(outcome),
        ]);
        await expectProvisioning(await handle(provisionRequest()), "profile_ready", outcome);
        await expectProvisioning(await handle(provisionRequest()), "profile_ready", outcome);
        assert.equal(postMail(calls).length, 1);
        const record = calls.find((call) => pathOf(call).endsWith("/record_provisioning_email_outcome"));
        assert.equal(JSON.parse(record.options.body).p_outcome, outcome);
    }
});

test("a lost email outcome write reports uncertainty even after Auth acknowledges", async () => {
    const { handle, calls } = provisionHarness([
        ...readyStart(), mailClaim(), value("oswe_admin"), value({}), new Error("outcome write response lost"),
    ]);
    await expectProvisioning(await handle(provisionRequest()), "profile_ready", "outcome_unknown");
    assert.equal(postMail(calls).length, 1);
});

test("explicit resend uses the existing operation and the ledger email, and honors cooldown and completion", async () => {
    const { handle, calls } = provisionHarness([mailClaim(), value("oswe_admin"), value({}), value("requested")]);
    await expectProvisioning(await handle(provisionRequest(resend)), "profile_ready", "requested");
    assert.deepEqual(JSON.parse(calls[2].options.body), {
        p_operation_id: createUser.operationId, p_step: "email", p_resend: true,
    });
    assert.deepEqual(JSON.parse(postMail(calls)[0].options.body), { email: provisioningEmail });
    for (const outcome of ["email_cooldown", "onboarding_complete"]) {
        const blocked = provisionHarness([claim(outcome)]);
        const response = await blocked.handle(provisionRequest(resend));
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { success: true, data: {
            operationId: createUser.operationId, provisioningState: "profile_ready", emailState: outcome,
        } });
        assert.equal(postMail(blocked.calls).length, 0);
    }
    const otherOwner = provisionHarness([dbError("42501", "Provisioning reservation unavailable")]);
    await expectError(await otherOwner.handle(provisionRequest(resend)), 403, "access_denied");
    assert.equal(postMail(otherOwner.calls).length, 0);
});

test("administrator eligibility is rechecked before Auth creation and email dispatch", async () => {
    const createDenied = provisionHarness([reserve(), authClaim(), value("auth_not_found"), value(null)]);
    await expectError(await createDenied.handle(provisionRequest()), 403, "access_denied");
    assert.equal(postAuth(createDenied.calls).length, 0);
    const emailDenied = provisionHarness([...readyStart(), mailClaim(), value("oswe_staff"), value("not_requested")]);
    await expectError(await emailDenied.handle(provisionRequest()), 403, "access_denied");
    assert.equal(postMail(emailDenied.calls).length, 0);
    assert.equal(JSON.parse(emailDenied.calls.at(-1).options.body).p_outcome, "not_requested");
});

test("malformed or mismatched provisioning RPC results fail closed", async () => {
    for (const responses of [
        [value({ operationId: "wrong" })],
        [reserve(), value({ outcome: ["claimed"] })],
        [reserve(), value({ outcome: "claimed", targetUserId: emailAttempt, email: provisioningEmail })],
        [reserve(), authClaim(), value({ outcome: "profile_ready" })],
        [...readyStart(), mailClaim({ attemptId: "bad" })],
        [...readyStart(), mailClaim({ email: "other@example.invalid" })],
    ]) {
        const { handle, calls } = provisionHarness(responses);
        await expectError(await handle(provisionRequest()), 503, "service_unavailable");
        assert.equal(postAuth(calls).length, 0);
        assert.equal(postMail(calls).length, 0);
    }
});

test("CORS preflight permits only configured origins and does not confer authorization", async () => {
    const { handle, calls } = harness();
    const preflight = request({ method: "OPTIONS", authorization: null });
    preflight.headers.set("Access-Control-Request-Method", "POST");
    preflight.headers.set("Access-Control-Request-Headers", "authorization, apikey, content-type, x-client-info");
    const allowed = await handle(preflight);
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), origin);
    assert.equal(allowed.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
    assert.equal(allowed.headers.get("Access-Control-Allow-Headers"), "authorization, apikey, content-type, x-client-info");
    assert.equal(allowed.headers.get("Cache-Control"), "no-store");
    assert.equal(allowed.headers.get("Vary"), "Origin");
    for (const method of ["OPTIONS", "POST"]) {
        const denied = await handle(request({ method, site: "http://localhost:8765" }));
        await expectError(denied, 403, "origin_not_allowed");
        assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
    }
    const noOrigin = await handle(request({ site: null, authorization: null }));
    await expectError(noOrigin, 401, "invalid_access_token");
    assert.equal(noOrigin.headers.get("Access-Control-Allow-Origin"), null);
    assert.equal(calls.length, 0);
});

test("missing or invalid configuration fails closed without sending requests", async () => {
    for (const config of [
        { ...environment, allowedOrigins: undefined },
        { ...environment, allowedOrigins: "*" },
        { ...environment, publishableKeys: JSON.stringify({ default: "sb_secret_mock" }) },
        { ...environment, publishableKeys: "{" },
        { ...environment, supabaseUrl: "https://project.example.invalid/path" },
    ]) {
        const { handle, calls } = harness([], config);
        await expectError(await handle(request()), 503, "service_unavailable");
        assert.equal(calls.length, 0);
    }
});
