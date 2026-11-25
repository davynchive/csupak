import { requestOwnPasswordReset } from "./password-recovery-flow.mjs";
import { createRecoveryClient } from "./recovery-shared.mjs";

const trigger = document.getElementById("forgot-password");
const form = document.getElementById("forgot-password-form");
const input = document.getElementById("forgot-password-email");
const submit = form.querySelector('[type="submit"]');
const status = document.getElementById("forgot-password-status");
const callback = new URL("../pages/reset-password.html", import.meta.url).href;
let pending = false;

trigger.addEventListener("click", () => {
    form.hidden = !form.hidden;
    trigger.setAttribute("aria-expanded", String(!form.hidden));
    if (!form.hidden) {
        if (!input.value) input.value = document.getElementById("email").value;
        input.focus();
    }
});

form.addEventListener("submit", async event => {
    event.preventDefault();
    if (pending) return;
    pending = true;
    input.disabled = submit.disabled = true;
    status.textContent = "Requesting a password reset…";
    try {
        const client = createRecoveryClient(window.supabase.createClient, supabaseUrl, supabaseKey, "forgot-password");
        status.textContent = await requestOwnPasswordReset(client.auth, input.value, callback);
    } catch {
        status.textContent = "Password recovery is unavailable right now. Try again later.";
    } finally {
        pending = false;
        input.disabled = submit.disabled = false;
    }
});
