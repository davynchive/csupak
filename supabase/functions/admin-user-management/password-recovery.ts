import { isOperationUuid } from "./account-access.ts";
import { recoveryEndpoint, requestRecoveryEmail } from "./auth-mail.ts";
import type { EmailOutcome } from "./auth-mail.ts";
import { isRecord } from "./list-users.ts";
import { normalizedEmail, ProvisioningError, rpcData } from "./provisioning.ts";

type RecoveryRequest = { operationId: string; userId: string };
type Caller = { rpc: (name: "admin_claim_password_recovery" | "get_my_role", params: object) => Promise<Response> };

export function passwordRecoveryParams(body: Record<string, unknown>): RecoveryRequest | null {
    if (Object.keys(body).length !== 3 || !isOperationUuid(body.operationId) || !isOperationUuid(body.userId)) return null;
    return { operationId: body.operationId.toLowerCase(), userId: body.userId.toLowerCase() };
}

async function claimRecovery(response: Response) {
    if (!response.ok) {
        const error = await response.clone().json().catch(() => null);
        if (error?.code === "55000" && error.message === "Use account setup for this user") {
            throw new ProvisioningError(409, "onboarding_required");
        }
        if (error?.code === "P0002") throw new ProvisioningError(404, "recovery_target_unavailable");
    }
    return await rpcData(response);
}

export async function requestPasswordReset(
    request: RecoveryRequest, caller: Caller, base: string, publishable: string, secretKeys: string | undefined,
    resetRedirect: string | undefined, setupRedirect: string | undefined, fetcher: typeof fetch,
) {
    const endpoint = recoveryEndpoint(base, resetRedirect);
    let secret: unknown;
    try {
        secret = JSON.parse(secretKeys ?? "null")?.default;
    } catch {
        secret = null;
    }
    if (!resetRedirect || !endpoint || endpoint === recoveryEndpoint(base, setupRedirect) ||
        !new URL(resetRedirect).pathname.endsWith("/pages/reset-password.html") ||
        typeof secret !== "string" || !/^sb_secret_[\w-]+$/.test(secret)) {
        throw new ProvisioningError(503, "service_unavailable");
    }

    const operationId = request.operationId;
    const claim = await claimRecovery(await caller.rpc("admin_claim_password_recovery", {
        p_operation_id: operationId, p_target_id: request.userId,
    }));
    if (isRecord(claim) && typeof claim.outcome === "string" &&
        ["requested", "not_requested", "outcome_unknown", "recovery_cooldown"].includes(claim.outcome)) {
        return { operationId, outcome: claim.outcome };
    }
    const email = isRecord(claim) && claim.outcome === "claimed" ? normalizedEmail(claim.email) : null;
    if (!email || !isRecord(claim) || email !== claim.email) throw new ProvisioningError(503, "service_unavailable");

    const record = async (outcome: EmailOutcome) => {
        const response = await fetcher(`${base}/rest/v1/rpc/record_admin_password_recovery`, {
            method: "POST", headers: { apikey: secret as string, "Content-Type": "application/json" },
            body: JSON.stringify({ p_operation_id: operationId, p_outcome: outcome }),
            redirect: "error", signal: AbortSignal.timeout(10_000),
        });
        return await rpcData(response) === outcome ? outcome : "outcome_unknown";
    };

    try {
        if (await rpcData(await caller.rpc("get_my_role", {})) !== "oswe_admin") {
            throw new ProvisioningError(403, "access_denied");
        }
    } catch (error) {
        await record("not_requested").catch(() => {});
        throw error;
    }
    const outcome = await requestRecoveryEmail(endpoint, publishable, email, fetcher);
    return { operationId, outcome: await record(outcome).catch(() => "outcome_unknown") };
}
