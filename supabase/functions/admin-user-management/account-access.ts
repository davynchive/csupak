import { isRecord, uuidPattern } from "./list-users.ts";

type AccessAction = "change_role" | "set_status" | "update_name";
type AccessParams = { p_operation_id: string; p_target_id: string } & (
    { p_action: "change_role"; p_role: "oswe_staff" | "security_office" } |
    { p_action: "set_status"; p_is_active: boolean } |
    { p_full_name: string }
);
type AccessResult = { outcome: "applied" | "no_change" } | { status: number; code: string };

export function isOperationUuid(value: unknown): value is string {
    return typeof value === "string" && uuidPattern.test(value) &&
        value !== "00000000-0000-0000-0000-000000000000";
}

export function normalizedFullName(value: unknown): string | null {
    if (typeof value !== "string" || /[\u0000\uD800-\uDFFF]/u.test(value)) return null;
    // Match PostgreSQL btrim and char_length used by My Account.
    const fullName = value.replace(/^ +| +$/g, "");
    const length = [...fullName].length;
    return length >= 2 && length <= 100 ? fullName : null;
}

export function accountAccessParams(body: Record<string, unknown>, action: AccessAction): AccessParams | null {
    const { operationId, userId } = body;
    if (Object.keys(body).length !== 4 || !isOperationUuid(operationId) || !isOperationUuid(userId)) return null;

    const ids = { p_operation_id: operationId, p_target_id: userId };
    if (action === "update_name") {
        const fullName = normalizedFullName(body.fullName);
        if (fullName === null) return null;
        return { ...ids, p_full_name: fullName };
    }
    if (action === "change_role") {
        if (body.role !== "oswe_staff" && body.role !== "security_office") return null;
        return { ...ids, p_action: action, p_role: body.role };
    }
    if (typeof body.isActive !== "boolean") return null;
    return { ...ids, p_action: action, p_is_active: body.isActive };
}

const unknownOutcome = { status: 503, code: "operation_outcome_unknown" };

function rpcError(error: unknown): AccessResult {
    if (!isRecord(error)) return unknownOutcome;

    switch (error.code) {
        case "PGRST301":
        case "PGRST303":
            return { status: 401, code: "invalid_access_token" };
        case "42501":
            return { status: 403, code: "access_denied" };
        case "22023":
            // The existing RPC uses the same SQLSTATE for these distinct cases.
            if (error.message === "Operation UUID has already been used for a different request") {
                return { status: 409, code: "operation_id_conflict" };
            }
            if (error.message === "Target profile not found") {
                return { status: 404, code: "profile_not_found" };
            }
            return { status: 400, code: "invalid_parameters" };
        case "23514":
            if (error.message === "Complete account onboarding before activation") {
                return { status: 409, code: "onboarding_required" };
            }
            if (error.message === "At least one active OSWE Administrator is required") {
                return { status: 409, code: "last_active_administrator" };
            }
            return unknownOutcome;
        case "55P03":
            return { status: 503, code: "operation_busy" };
        case "0A000":
        case "55000":
        case "PGRST202":
            return { status: 503, code: "service_unavailable" };
        default:
            return unknownOutcome;
    }
}

export async function applyAccountAccess(call: () => Promise<Response>): Promise<AccessResult> {
    try {
        const response = await call();
        const result: unknown = await response.json();
        if (!response.ok) return rpcError(result);
        if (result === "applied" || result === "no_change") return { outcome: result };
    } catch {
        // The database may have committed before the response failed.
    }
    return unknownOutcome;
}
