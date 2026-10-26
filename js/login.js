const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
let loginPending = false;
function loginFailureMessage(error) {
    if (navigator.onLine === false) return "You appear to be offline. Reconnect and try again.";
    if (error?.code === "invalid_credentials") return "Invalid email or password.";
    if (Number(error?.status) >= 500 || Number(error?.status) === 429 || error?.name === "AuthRetryableFetchError" ||
        /failed to fetch|fetch failed|network|load failed|connection/i.test(String(error?.message || ""))) {
        return "Unable to connect to the service. Please try again.";
    }
    return "Unable to sign in. Please try again.";
}
loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (loginPending) return;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const button = loginForm.querySelector('[type="submit"]');
    const label = button.textContent;
    const disabled = button.disabled;
    loginPending = true;
    button.disabled = true;
    button.textContent = "Signing in...";
    loginMessage.textContent = "Signing in...";
    try {
        const result = await supabaseClient.auth.signInWithPassword({email, password});
        if (result.error) throw result.error;
        if (!result.data?.user) throw new Error("Sign in not confirmed.");
        const profile = await supabaseClient.from("profiles").select("full_name, role")
            .eq("id", result.data.user.id).single();
        if (profile.error) {
            loginMessage.textContent = loginFailureMessage(profile.error) === "Unable to sign in. Please try again."
                ? "Signed in, but account information could not be loaded. Please try again."
                : loginFailureMessage(profile.error);
            return;
        }
        if (!profile.data) throw new Error("Profile unavailable.");
        loginMessage.textContent = "Welcome, " + profile.data.full_name + "!";
        window.location.href = "pages/dashboard.html";
    } catch (error) { loginMessage.textContent = loginFailureMessage(error); }
    finally {
        loginPending = false;
        button.disabled = disabled;
        button.textContent = label;
    }
});
