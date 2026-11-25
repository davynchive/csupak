// Auth emits a hex-encoded SHA-224 hash for its non-PKCE email flow.
const tokenHash = /^[0-9a-f]{56}$/;

export function readRecoveryHash(fragment) {
    const params = new URLSearchParams(fragment.slice(1));
    const token = params.get("token_hash");
    return [...params.keys()].length === 1 && isRecoveryHash(token) ? token : null;
}

export function isRecoveryHash(token) {
    return typeof token === "string" && tokenHash.test(token);
}

export function validateNewPassword(password, confirmation) {
    if (Array.from(password).length < 8) return "Use at least 8 characters for your new password.";
    if (password !== confirmation) return "The passwords must match.";
    return null;
}

export function createRecoveryClient(createClient, url, key, purpose) {
    return createClient(url, key, {
        auth: {
            storageKey: `csupak-${purpose}`,
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            flowType: "implicit"
        }
    });
}

export async function closeRecoveryClient(client) {
    if (!client) return;
    try {
        await client.auth.signOut({ scope: "local" });
    } catch {
        // The page discards the isolated client even if Auth is unreachable.
    }
}
