import { createAccountSetup, createSetupClient, readRecoveryHash, validateNewPassword } from "./account-setup-flow.mjs";

const byId = id => document.getElementById(id);
const title = byId("setup-title");
const status = byId("setup-status");
const passwordForm = byId("setup-password-form");
const resumeForm = byId("setup-resume-form");
const password = byId("setup-password");
const confirmation = byId("setup-confirm");
const email = byId("setup-email");
const existingPassword = byId("setup-existing-password");
const toggles = document.querySelectorAll("[data-toggle-password]");
let busy = false;

function showPassword(button, shown) {
    byId(button.dataset.togglePassword).type = shown ? "text" : "password";
    button.setAttribute("aria-pressed", String(shown));
    button.textContent = shown ? "Hide password" : "Show password";
}

for (const toggle of toggles) {
    toggle.addEventListener("click", () => showPassword(toggle, toggle.getAttribute("aria-pressed") === "false"));
}

function clearPasswords() {
    password.value = confirmation.value = existingPassword.value = "";
    for (const toggle of toggles) showPassword(toggle, false);
}

function render(result, moveFocus) {
    passwordForm.hidden = result.mode !== "password";
    resumeForm.hidden = result.mode !== "resume";
    if (result.email) {
        email.value = result.email;
        byId("setup-recipient").textContent = result.email;
    }
    title.textContent = result.mode === "success" ? "Account setup complete" : "Set up your account";
    status.textContent = result.mode === "success"
        ? "Your account is ready for administrator review. You can use CSUPAK after an administrator activates your account."
        : result.message || "Choose a password for your CSUPAK account.";
    if (moveFocus) {
        if (result.mode === "password") password.focus();
        else if (result.mode === "resume") (email.value ? existingPassword : email).focus();
        else title.focus();
    }
}

async function run(task, form, message) {
    if (busy) return;
    busy = true;
    const controls = form?.querySelectorAll("input, button") || [];
    for (const control of controls) control.disabled = true;
    status.textContent = message;
    let result;
    try {
        result = await task();
    } catch {
        result = { mode: "unavailable", message: "Account setup is unavailable right now. Try again later." };
    } finally {
        clearPasswords();
        for (const control of controls) control.disabled = false;
        busy = false;
    }
    if (result) render(result, Boolean(form));
}

window.addEventListener("pagehide", clearPasswords);
window.addEventListener("pageshow", event => {
    if (event.persisted) location.reload();
});

async function start(fragment) {
    if (!window.supabase?.createClient) {
        render({ mode: "unavailable", message: "Account setup could not load. Refresh this page or reopen your setup link." });
        return;
    }
    const setup = createAccountSetup(purpose => createSetupClient(window.supabase.createClient, supabaseUrl, supabaseKey, purpose));
    passwordForm.addEventListener("submit", event => {
        event.preventDefault();
        if (busy) return;
        const problem = validateNewPassword(password.value, confirmation.value);
        if (problem) {
            status.textContent = problem;
            (Array.from(password.value).length < 8 ? password : confirmation).focus();
            return;
        }
        void run(() => setup.setPassword(password.value, confirmation.value), passwordForm, "Setting your password and completing setup…");
    });
    resumeForm.addEventListener("submit", event => {
        event.preventDefault();
        void run(() => setup.resume(email.value, existingPassword.value), resumeForm, "Signing in and checking setup…");
    });
    byId("setup-switch-to-resume").addEventListener("click", () => {
        void run(() => setup.switchToResume(), passwordForm, "Closing the setup link session…");
    });

    const token = readRecoveryHash(fragment);
    await run(() => setup.open(token || (fragment ? "invalid" : null)), null, "Checking your setup link…");
}

void start(takeSetupCallback());
