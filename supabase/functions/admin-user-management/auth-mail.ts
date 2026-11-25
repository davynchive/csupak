export type EmailOutcome = "requested" | "not_requested" | "outcome_unknown";

const emailRejections = new Set([
    "email_address_invalid", "email_address_not_authorized", "over_email_send_rate_limit",
    "over_request_rate_limit", "captcha_failed", "validation_failed", "email_provider_disabled",
]);

export function recoveryEndpoint(base: string, callback: string | undefined) {
    try {
        const redirect = new URL(callback ?? "");
        const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(redirect.hostname);
        if ((redirect.protocol !== "https:" && !(redirect.protocol === "http:" && loopback)) ||
            redirect.username || redirect.password || redirect.search || redirect.hash) return null;
        return `${base}/auth/v1/recover?${new URLSearchParams({ redirect_to: redirect.href })}`;
    } catch {
        return null;
    }
}

export async function requestRecoveryEmail(endpoint: string, key: string, email: string, fetcher: typeof fetch): Promise<EmailOutcome> {
    try {
        const response = await fetcher(endpoint, {
            method: "POST", headers: { apikey: key, "Content-Type": "application/json", "X-Supabase-Api-Version": "2024-01-01" },
            body: JSON.stringify({ email }), redirect: "error", signal: AbortSignal.timeout(10_000),
        });
        const data: unknown = await response.json();
        if (typeof data !== "object" || data === null || Array.isArray(data)) return "outcome_unknown";
        if (response.status === 200 && Object.keys(data).length === 0) return "requested";
        const result = data as Record<string, unknown>;
        const code = result.error_code ?? result.code;
        if ([400, 403, 422, 429].includes(response.status) && typeof code === "string" && emailRejections.has(code)) {
            return "not_requested";
        }
    } catch {
        // A timeout or unusable response alone cannot establish that Auth declined the request.
    }
    return "outcome_unknown";
}
