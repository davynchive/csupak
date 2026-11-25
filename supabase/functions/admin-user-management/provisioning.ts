import { isOperationUuid, normalizedFullName } from "./account-access.ts";
import { isRecord } from "./list-users.ts";
import { recoveryEndpoint, requestRecoveryEmail } from "./auth-mail.ts";
import type { EmailOutcome } from "./auth-mail.ts";

type ProvisioningRequest = { operationId: string } & (
    { action: "create_user"; email: string; fullName: string; role: "oswe_staff" | "security_office" } |
    { action: "resend_setup_email" }
);
type Caller = {
    rpc: (name: "admin_reserve_account_provisioning" | "admin_claim_provisioning_step" | "get_my_role",
        params: object) => Promise<Response>;
};
const emailOutcomes = ["requested", "not_requested", "outcome_unknown"] as const;

export function normalizedEmail(value: unknown): string | null {
    if (typeof value !== "string" || /[\uD800-\uDFFF]/u.test(value)) return null;
    const email = value.replace(/^ +| +$/g, "").toLowerCase();
    return [...email].length <= 254 && /^[^\p{White_Space}\p{Cc}@]+@[^\p{White_Space}\p{Cc}@]+[.][^\p{White_Space}\p{Cc}@]+$/u.test(email)
        ? email : null;
}

export function provisioningRequest(body: Record<string, unknown>): ProvisioningRequest | null {
    if (!isOperationUuid(body.operationId)) return null;
    const operationId = body.operationId.toLowerCase();
    if (body.action === "resend_setup_email") {
        return Object.keys(body).length === 2 ? { action: body.action, operationId } : null;
    }
    if (body.action !== "create_user" || Object.keys(body).length !== 5 ||
        (body.role !== "oswe_staff" && body.role !== "security_office")) return null;
    const email = normalizedEmail(body.email);
    const fullName = normalizedFullName(body.fullName);
    return email && fullName ? { action: body.action, operationId, email, fullName, role: body.role } : null;
}

export class ProvisioningError extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string) {
        super(code);
        this.status = status;
        this.code = code;
    }
}

function badResponse(): never {
    throw new ProvisioningError(503, "service_unavailable");
}

export async function rpcData(response: Response): Promise<unknown> {
    const data: unknown = await response.json().catch(() => null);
    if (response.ok) return data;
    if (!isRecord(data)) return badResponse();
    if (data.code === "42501") throw new ProvisioningError(403, "access_denied");
    if (data.code === "PGRST301" || data.code === "PGRST303") {
        throw new ProvisioningError(401, "invalid_access_token");
    }
    if (data.code === "55P03") throw new ProvisioningError(503, "operation_busy");
    if (data.code === "22023") {
        if (data.message === "Operation UUID has already been used for a different request") {
            throw new ProvisioningError(409, "operation_id_conflict");
        }
        if (data.message === "Email already has a provisioning reservation") {
            throw new ProvisioningError(409, "provisioning_conflict");
        }
        throw new ProvisioningError(400, "invalid_parameters");
    }
    if (data.code === "23514" && data.message === "Reserved Auth identity or profile conflicts with provisioning") {
        throw new ProvisioningError(409, "provisioning_conflict");
    }
    if (data.code === "55000" && typeof data.message === "string" && [
        "Provisioned profile is missing", "Provisioned account is not ready for setup email",
        "Provisioning Auth creation has not been claimed",
    ].includes(data.message)) {
        throw new ProvisioningError(409, "provisioning_not_ready");
    }
    return badResponse();
}

function createProvisioningClients(
    base: string, publishable: string, secretKeys: string | undefined,
    setupRedirect: string | undefined, fetcher: typeof fetch,
) {
    let secret: unknown;
    const endpoint = recoveryEndpoint(base, setupRedirect);
    try {
        secret = JSON.parse(secretKeys ?? "null")?.default;
    } catch {
        return badResponse();
    }
    if (typeof secret !== "string" || !/^sb_secret_[\w-]+$/.test(secret) || !endpoint) return badResponse();

    // New-format API keys belong only in apikey. This client cannot use the caller JWT.
    const post = (path: string, key: string, body: object) => fetcher(base + path, {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json",
            ...(path.startsWith("/auth/v1/") ? { "X-Supabase-Api-Version": "2024-01-01" } : {}) },
        body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    return {
        privilegedRpc: (name: "reconcile_provisioned_auth_account" | "record_provisioning_email_outcome",
            body: object) => post(`/rest/v1/rpc/${name}`, secret, body),
        createAuth: (id: string, email: string, operationId: string) => post("/auth/v1/admin/users", secret, {
            id, email, email_confirm: false,
            app_metadata: { csupak_provisioning_operation_id: operationId },
        }),
        requestSetup: (email: string) => requestRecoveryEmail(endpoint, publishable, email, fetcher),
    };
}

function successState(operationId: string, targetUserId: string | undefined,
    provisioningState: "profile_ready" | "auth_outcome_unknown", emailState: string | null) {
    return { operationId, targetUserId, provisioningState, emailState };
}

async function recheckAdministrator(caller: Caller) {
    if (await rpcData(await caller.rpc("get_my_role", {})) !== "oswe_admin") {
        throw new ProvisioningError(403, "access_denied");
    }
}

async function authConflict(response: Response, targetUserId: string) {
    if (!response.ok && ![400, 409, 422].includes(response.status)) return false;
    const data: unknown = await response.json().catch(() => null);
    if (!isRecord(data)) return false;
    if (response.ok) {
        const returnedId = isRecord(data.user) ? data.user.id : data.id;
        return isOperationUuid(returnedId) && returnedId.toLowerCase() !== targetUserId;
    }
    const code = data.error_code ?? data.code;
    return code === "email_exists" || code === "user_already_exists";
}

export async function provisionAccount(
    request: ProvisioningRequest, caller: Caller, base: string, publishable: string, secretKeys: string | undefined,
    setupRedirect: string | undefined, fetcher: typeof fetch,
) {
    const backend = createProvisioningClients(base, publishable, secretKeys, setupRedirect, fetcher);
    const operationId = request.operationId;
    const op = { p_operation_id: operationId };
    const claimStep = async (step: "auth" | "email", resend = false) => {
        const claim = await rpcData(await caller.rpc("admin_claim_provisioning_step", {
            ...op, p_step: step, p_resend: resend,
        }));
        if (!isRecord(claim)) return badResponse();
        return claim;
    };
    const reconcile = async () => {
        const result = await rpcData(await backend.privilegedRpc("reconcile_provisioned_auth_account", op));
        if (result !== "auth_not_found" && result !== "profile_ready") return badResponse();
        return result;
    };
    let targetUserId: string | undefined;

    if (request.action === "create_user") {
        const reserved = await rpcData(await caller.rpc("admin_reserve_account_provisioning", {
            ...op, p_email: request.email, p_full_name: request.fullName, p_role: request.role,
        }));
        if (!isRecord(reserved) || reserved.operationId !== operationId || !isOperationUuid(reserved.targetUserId) ||
            typeof reserved.provisioningState !== "string" ||
            !["reserved", "auth_outcome_unknown", "profile_ready"].includes(reserved.provisioningState) ||
            !emailOutcomes.some((state) => state === reserved.emailState)) return badResponse();
        targetUserId = reserved.targetUserId;

        const claim = await claimStep("auth");
        if (claim.outcome !== "claimed" && claim.outcome !== "auth_outcome_unknown" && claim.outcome !== "profile_ready") {
            return badResponse();
        }
        if (reserved.provisioningState === "profile_ready" && claim.outcome !== "profile_ready") return badResponse();
        if (claim.outcome === "claimed" &&
            (claim.targetUserId !== targetUserId || claim.email !== request.email)) return badResponse();
        if (await reconcile() === "auth_not_found") {
            if (claim.outcome === "profile_ready") return badResponse();
            if (claim.outcome !== "claimed") return successState(operationId, targetUserId, "auth_outcome_unknown", null);

            await recheckAdministrator(caller);
            const creation = await backend.createAuth(targetUserId, request.email, operationId).catch(() => null);
            // Reconcile even after timeout or a duplicate from a simultaneous upstream request.
            if (await reconcile() === "auth_not_found") {
                if (creation && await authConflict(creation, targetUserId)) {
                    throw new ProvisioningError(409, "provisioning_conflict");
                }
                return successState(operationId, targetUserId, "auth_outcome_unknown", null);
            }
        }
    }

    const emailClaim = await claimStep("email", request.action === "resend_setup_email");
    const email = normalizedEmail(emailClaim.email);
    if (emailClaim.outcome !== "claimed") {
        const outcome = emailClaim.outcome;
        if (!emailOutcomes.some((state) => state === outcome) &&
            outcome !== "email_cooldown" && outcome !== "onboarding_complete") return badResponse();
        return successState(operationId, targetUserId, "profile_ready", String(outcome));
    }
    if (!email || emailClaim.email !== email || !isOperationUuid(emailClaim.attemptId) ||
        !isOperationUuid(emailClaim.targetUserId) || (targetUserId && targetUserId !== emailClaim.targetUserId) ||
        (request.action === "create_user" && email !== request.email)) return badResponse();
    targetUserId = emailClaim.targetUserId;
    const record = async (outcome: EmailOutcome) => {
        const status = await rpcData(await backend.privilegedRpc("record_provisioning_email_outcome", {
            ...op, p_attempt_id: emailClaim.attemptId, p_outcome: outcome,
        }));
        if (status !== outcome) return badResponse();
    };

    try {
        await recheckAdministrator(caller);
    } catch (error) {
        await record("not_requested").catch(() => {});
        throw error;
    }
    const outcome = await backend.requestSetup(email);
    const recorded = await record(outcome).then(() => outcome).catch(() => "outcome_unknown");
    return successState(operationId, targetUserId, "profile_ready", recorded);
}
