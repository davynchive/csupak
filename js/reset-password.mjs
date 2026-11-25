import { createPasswordReset } from "./password-recovery-flow.mjs";
import { createRecoveryClient, readRecoveryHash, validateNewPassword } from "./recovery-shared.mjs";

const byId = id => document.getElementById(id);
const title = byId("reset-title");
const status = byId("reset-status");
const form = byId("reset-password-form");
const password = byId("reset-password");
const confirmation = byId("reset-confirm");
const controls = form.querySelectorAll("input, button");
const toggles = form.querySelectorAll("[data-toggle-password]");
let pending = false;

function showPassword(button, shown) {
    byId(button.dataset.togglePassword).type = shown ? "text" : "password";
    button.setAttribute("aria-pressed", String(shown));
    button.textContent = shown ? "Hide password" : "Show password";
}

for (const toggle of toggles) {
    toggle.addEventListener("click", () => showPassword(toggle, toggle.getAttribute("aria-pressed") === "false"));
}

function clearPasswords() {
    password.value = confirmation.value = "";
    for (const toggle of toggles) showPassword(toggle, false);
}

function render(result) {
    if (!result) return;
    form.hidden = result.mode !== "password";
    if (result.email) byId("reset-recipient").textContent = result.email;
    status.textContent = result.message;
    if (result.mode === "success") title.textContent = "Password reset complete";
    if (result.mode === "password") password.focus();
    else title.focus();
}

window.addEventListener("pagehide", clearPasswords);
window.addEventListener("pageshow", event => {
    if (event.persisted) location.reload();
});

const reset = createPasswordReset(() => createRecoveryClient(window.supabase.createClient, supabaseUrl, supabaseKey, "password-reset"));
form.addEventListener("submit", async event => {
    event.preventDefault();
    if (pending) return;
    const problem = validateNewPassword(password.value, confirmation.value);
    if (problem) {
        status.textContent = problem;
        (Array.from(password.value).length < 8 ? password : confirmation).focus();
        return;
    }
    pending = true;
    for (const control of controls) control.disabled = true;
    status.textContent = "Updating your password…";
    let result;
    try {
        result = await reset.reset(password.value, confirmation.value);
    } finally {
        clearPasswords();
        for (const control of controls) control.disabled = false;
        pending = false;
    }
    render(result);
});

render(await reset.open(readRecoveryHash(takeResetCallback())));
