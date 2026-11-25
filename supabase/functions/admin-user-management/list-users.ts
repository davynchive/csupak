type ListParams = {
    p_search?: string;
    p_role?: string;
    p_is_active?: boolean;
    p_cursor?: string;
    p_limit?: number;
};

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roles = new Set(["oswe_admin", "oswe_staff", "security_office"]);
const fields = new Set(["action", "search", "role", "isActive", "cursor", "limit"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRole(value: unknown): value is string {
    return typeof value === "string" && roles.has(value);
}

function isUuid(value: unknown): value is string {
    return typeof value === "string" && uuidPattern.test(value);
}

export function listParams(body: Record<string, unknown>): ListParams | null {
    if (Object.keys(body).some((key) => !fields.has(key))) return null;

    const { search, role, isActive, cursor, limit } = body;
    if (search !== undefined && (typeof search !== "string" || /[\u0000\uD800-\uDFFF]/u.test(search) ||
        [...search].length > 200)) return null;
    if (role !== undefined && !isRole(role)) return null;
    if (isActive !== undefined && typeof isActive !== "boolean") return null;
    if (cursor !== undefined && !isUuid(cursor)) return null;
    if (limit !== undefined && (typeof limit !== "number" || !Number.isInteger(limit) ||
        limit < 1 || limit > 100)) return null;

    // JSON.stringify omits undefined fields so PostgREST uses the SQL defaults.
    return { p_search: search, p_role: role, p_is_active: isActive, p_cursor: cursor, p_limit: limit };
}

export function isRosterPage(value: unknown, params: ListParams) {
    const limit = params.p_limit ?? 20;
    if (!isRecord(value) || Object.keys(value).length !== 2 ||
        !Array.isArray(value.users) || value.users.length > limit) return false;

    let lastId = params.p_cursor?.toLowerCase() ?? "";
    for (const user of value.users) {
        if (!isRecord(user) || Object.keys(user).length !== 5 || !isUuid(user.id) ||
            typeof user.fullName !== "string" || (user.email !== null && typeof user.email !== "string") ||
            !isRole(user.role) || typeof user.isActive !== "boolean" ||
            (params.p_role !== undefined && user.role !== params.p_role) ||
            (params.p_is_active !== undefined && user.isActive !== params.p_is_active)) return false;
        const id = user.id.toLowerCase();
        if (id <= lastId) return false;
        lastId = id;
    }

    return value.nextCursor === null ||
        (value.users.length === limit && isUuid(value.nextCursor) && value.nextCursor.toLowerCase() === lastId);
}
