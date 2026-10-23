// Connectivity is advisory; online does not establish backend reachability.
function isOffline() { return navigator.onLine === false; }
function classifyNetworkError(error) {
    if (isOffline()) return "offline";
    const code = String(error?.code || "");
    const status = Number(error?.status || 0);
    if (["session_not_found", "session_expired", "refresh_token_not_found", "refresh_token_already_used", "bad_jwt", "user_not_found"].includes(code) ||
        error?.name === "AuthSessionMissingError" || status === 401) return "auth";
    if (code === "42501" || status === 403) return "permission";
    if (status >= 500 || status === 429 || error?.name === "AuthRetryableFetchError" ||
        /failed to fetch|fetch failed|network|load failed|connection/i.test(String(error?.message || ""))) return "network";
    return "fallback";
}
function safeNetworkMessage(error, fallback = "Unable to load this page. Reload to try again.") {
    return ({offline: "You appear to be offline. Reconnect and try again.",
        network: "Unable to connect to the service. Please try again.",
        auth: "Your session is unavailable. Please sign in again.",
        permission: "You do not have permission to access this information."})[classifyNetworkError(error)] || fallback;
}
function showPageStatus(message) {
    let element = document.getElementById("pageReliabilityStatus");
    if (!element) {
        element = document.createElement("p");
        element.id = "pageReliabilityStatus";
        element.className = "mx-8 my-3 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700";
        element.setAttribute("role", "status");
        (document.querySelector("main") || document.body).prepend(element);
    }
    element.textContent = message;
    element.hidden = !message;
}
function updateOfflineAdvisory() {
    let element = document.getElementById("offlineAdvisory");
    if (!element && !isOffline()) return;
    if (!element) {
        element = document.createElement("p");
        element.id = "offlineAdvisory";
        element.className = "mx-8 my-3 text-sm text-gray-700";
        element.setAttribute("role", "status");
        (document.querySelector("main") || document.body).prepend(element);
    }
    element.textContent = isOffline() ? "You appear to be offline." : "";
    element.hidden = !isOffline();
}
window.addEventListener("offline", updateOfflineAdvisory);
window.addEventListener("online", updateOfflineAdvisory);
updateOfflineAdvisory();

function requireUserResult(result) {
    if (result.error) {
        if (classifyNetworkError(result.error) === "auth") window.location.href = "../index.html";
        throw result.error;
    }
    if (!result.data?.user) {
        window.location.href = "../index.html";
        throw new Error("Session missing.");
    }
    return result.data.user;
}
async function getCurrentUser() {
    try { return requireUserResult(await supabaseClient.auth.getUser()); }
    catch (error) { showPageStatus(safeNetworkMessage(error)); return null; }
}
async function getCurrentProfile() {
    const user = await getCurrentUser();
    if (!user) return null;
    try {
        const result = await supabaseClient.from("profiles").select("full_name, role").eq("id", user.id).single();
        if (result.error) throw result.error;
        return result.data;
    } catch (error) { showPageStatus(safeNetworkMessage(error)); return null; }
}
let logoutPending = false;
async function logout() {
    if (logoutPending) return false;
    const control = document.getElementById("logoutButton");
    const label = control?.textContent;
    const disabled = control?.disabled;
    logoutPending = true;
    if (control) { control.disabled = true; control.textContent = "Signing out..."; }
    try {
        const result = await supabaseClient.auth.signOut();
        if (result.error) throw result.error;
        window.location.href = "../index.html";
        return true;
    } catch (error) {
        showPageStatus(safeNetworkMessage(error, "Unable to sign out. Please try again."));
        return false;
    } finally {
        logoutPending = false;
        if (control) { control.disabled = disabled; control.textContent = label; }
    }
}
