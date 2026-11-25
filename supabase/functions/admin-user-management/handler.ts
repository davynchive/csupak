import { accountAccessParams, applyAccountAccess } from "./account-access.ts";
import { isRecord, isRosterPage, listParams, uuidPattern } from "./list-users.ts";
import { provisionAccount, ProvisioningError, provisioningRequest } from "./provisioning.ts";
import { passwordRecoveryParams, requestPasswordReset } from "./password-recovery.ts";

type Environment = {
    supabaseUrl?: string;
    publishableKeys?: string;
    allowedOrigins?: string;
    secretKeys?: string;
    setupRedirect?: string;
    resetRedirect?: string;
};

const methods = "POST, OPTIONS";
const requestHeaders = "authorization, apikey, content-type, x-client-info";
const bearerPattern = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/i;
type CallerRpc = "get_my_role" | "admin_list_users" | "admin_change_account_access" | "admin_update_user_name" |
    "admin_reserve_account_provisioning" | "admin_claim_provisioning_step" | "admin_claim_password_recovery";

function readConfig(env: Environment) {
    const url = new URL(env.supabaseUrl ?? "");
    const key = JSON.parse(env.publishableKeys ?? "null")?.default;
    const origins = (env.allowedOrigins ?? "").split(",").map((origin) => origin.trim());

    if (!["http:", "https:"].includes(url.protocol) || url.href !== url.origin + "/" ||
        typeof key !== "string" || !/^sb_publishable_[\w-]+$/.test(key)) {
        throw new Error("Invalid Supabase configuration");
    }
    for (const origin of origins) {
        const parsed = new URL(origin);
        if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) {
            throw new Error("Invalid allowed origin");
        }
    }
    return { baseUrl: url.origin, key, origins: new Set(origins) };
}

// Use the same caller credentials for GoTrue's user endpoint and PostgREST.
// Nothing from the browser is forwarded except the verified bearer token.
function createCaller(baseUrl: string, key: string, token: string, fetcher: typeof fetch) {
    const headers = { apikey: key, Authorization: `Bearer ${token}` };
    return {
        getUser: () => fetcher(`${baseUrl}/auth/v1/user`, {
            method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(10_000),
        }),
        rpc: (name: CallerRpc, params: object) => fetcher(`${baseUrl}/rest/v1/rpc/${name}`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify(params),
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
        }),
    };
}

function json(headers: Headers, status: number, body: object) {
    return Response.json(body, { status, headers });
}

function failure(headers: Headers, status: number, code: string) {
    return json(headers, status, { success: false, error: { code } });
}

export function createHandler(env: Environment, fetcher: typeof fetch = fetch) {
    const config = (() => {
        try {
            return readConfig(env);
        } catch {
            return null;
        }
    })();

    return async function handle(request: Request): Promise<Response> {
        const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
        if (!config) return failure(headers, 503, "service_unavailable");

        const origin = request.headers.get("Origin");
        if (origin !== null) {
            if (!config.origins.has(origin)) return failure(headers, 403, "origin_not_allowed");
            headers.set("Access-Control-Allow-Origin", origin);
        }

        if (request.method === "OPTIONS") {
            headers.set("Access-Control-Allow-Methods", methods);
            headers.set("Access-Control-Allow-Headers", requestHeaders);
            return new Response(null, { status: 204, headers });
        }
        if (request.method !== "POST") {
            headers.set("Allow", methods);
            return failure(headers, 405, "method_not_allowed");
        }

        const token = request.headers.get("Authorization")?.match(bearerPattern)?.[1];
        if (!token) return failure(headers, 401, "invalid_access_token");

        const mediaType = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
        if (mediaType !== "application/json") return failure(headers, 415, "expected_json");

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return failure(headers, 400, "invalid_json");
        }
        if (!isRecord(body)) return failure(headers, 400, "invalid_action");
        const { action } = body;
        const rosterParams = action === "list_users" ? listParams(body) : null;
        const accessAction = action === "change_role" || action === "set_status" || action === "update_name";
        const accessParams = accessAction
            ? accountAccessParams(body, action) : null;
        const provisioningAction = action === "create_user" || action === "resend_setup_email";
        const provisioningParams = provisioningAction ? provisioningRequest(body) : null;
        const recoveryAction = action === "request_password_reset";
        const recoveryParams = recoveryAction ? passwordRecoveryParams(body) : null;
        if (action === "check_access") {
            if (Object.keys(body).length !== 1) return failure(headers, 400, "invalid_action");
        } else if (!rosterParams && !accessParams && !provisioningParams && !recoveryParams) {
            const knownAction = action === "list_users" || accessAction || provisioningAction || recoveryAction;
            return failure(headers, 400, knownAction ? "invalid_parameters" : "invalid_action");
        }

        try {
            const caller = createCaller(config.baseUrl, config.key, token, fetcher);
            const auth = await caller.getUser();
            if (auth.status === 401 || auth.status === 403) {
                return failure(headers, 401, "invalid_access_token");
            }
            if (!auth.ok) return failure(headers, 503, "service_unavailable");

            const user = await auth.json();
            if (typeof user?.id !== "string" || !uuidPattern.test(user.id) ||
                user.role !== "authenticated" || user.is_anonymous !== false) {
                return failure(headers, 403, "access_denied");
            }

            const role = await caller.rpc("get_my_role", {});
            if (!role.ok) return failure(headers, 503, "service_unavailable");
            if (await role.json() !== "oswe_admin") return failure(headers, 403, "access_denied");

            if (recoveryParams) {
                const data = await requestPasswordReset(recoveryParams, caller, config.baseUrl, config.key,
                    env.secretKeys, env.resetRedirect, env.setupRedirect, fetcher);
                return json(headers, 200, { success: true, data });
            }

            if (provisioningParams) {
                const data = await provisionAccount(provisioningParams, caller, config.baseUrl, config.key,
                    env.secretKeys, env.setupRedirect, fetcher);
                return json(headers, 200, { success: true, data });
            }

            if (accessParams) {
                const rpc = "p_full_name" in accessParams ? "admin_update_user_name" : "admin_change_account_access";
                const result = await applyAccountAccess(() => caller.rpc(rpc, accessParams));
                if ("code" in result) return failure(headers, result.status, result.code);
                return json(headers, 200, {
                    success: true,
                    data: { operationId: accessParams.p_operation_id, outcome: result.outcome },
                });
            }
            if (!rosterParams) return json(headers, 200, { success: true, data: { authorized: true } });

            const roster = await caller.rpc("admin_list_users", rosterParams);
            if (!roster.ok) {
                if (roster.status === 403 && (await roster.json())?.code === "42501") {
                    return failure(headers, 403, "access_denied");
                }
                return failure(headers, 503, "service_unavailable");
            }
            const page: unknown = await roster.json();
            if (!isRosterPage(page, rosterParams)) return failure(headers, 503, "service_unavailable");
            return json(headers, 200, { success: true, data: page });
        } catch (error) {
            if (error instanceof ProvisioningError) return failure(headers, error.status, error.code);
            return failure(headers, 503, "service_unavailable");
        }
    };
}
