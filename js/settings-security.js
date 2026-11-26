const securityButton = document.getElementById("openSecurity");
const securityDialog = document.getElementById("securityDialog");
const securityEmailForm = document.getElementById("changeEmailForm");
const securityPasswordForm = document.getElementById("changePasswordForm");
const securityCurrentEmail = document.getElementById("securityCurrentEmail");
const securityNewEmail = document.getElementById("securityNewEmail");
const passwordCurrentPassword = document.getElementById("passwordCurrentPassword");
const securityNewPassword = document.getElementById("securityNewPassword");
const securityConfirmPassword = document.getElementById("securityConfirmPassword");
const securityNonceFields = document.getElementById("securityReauthentication");
const securityNonce = document.getElementById("securityNonce");
const sendSecurityNonce = document.getElementById("sendSecurityNonce");
const updateEmailButton = document.getElementById("updateEmail");
const updatePasswordButton = document.getElementById("updatePassword");
const securityAccountStatus = document.getElementById("securityAccountStatus");
const emailChangeStatus = document.getElementById("emailChangeStatus");
const passwordChangeStatus = document.getElementById("passwordChangeStatus");
const securitySignIn = document.getElementById("securitySignIn");
const securityInputs = securityDialog.querySelectorAll("input:not(#securityCurrentEmail)");
const passwordToggles = securityDialog.querySelectorAll("[data-password-toggle]");

let securityBusy = false;
let securityReady = false;
let securitySignInRequired = false;
let pendingSecurityEmail = "";

securityButton.addEventListener("click", () => {
    if (!settingsAccount || securityDialog.open || securityBusy) return;
    securityReady = false;
    securityAccountStatus.textContent = securitySignInRequired ? "Your session is unavailable." : "";
    emailChangeStatus.textContent = "";
    passwordChangeStatus.textContent = "";
    securityCurrentEmail.value = settingsAccount.email ?? "";
    syncSecurityControls();
    securityDialog.showModal();
    refreshSecurityAccount();
});
document.getElementById("closeSecurity").addEventListener("click", () => securityDialog.close());
securityDialog.addEventListener("close", () => {
    if (securityDialog.open) return;
    securityNewEmail.value = "";
    securityNonce.value = "";
    clearSecurityPasswords(securityDialog);
    for (const input of securityInputs) input.removeAttribute("aria-invalid");
    securityButton.focus();
});

for (const input of securityInputs) {
    input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
}
for (const button of passwordToggles) {
    const input = document.getElementById(button.dataset.passwordToggle);
    button.addEventListener("click", () => setPasswordVisibility(button, input, input.type === "password"));
}

function setPasswordVisibility(button, input, visible) {
    input.type = visible ? "text" : "password";
    button.textContent = visible ? "Hide" : "Show";
    button.setAttribute("aria-label", button.textContent + " " + input.labels[0].textContent.toLowerCase());
}

function clearSecurityPasswords(container) {
    for (const button of container.querySelectorAll("[data-password-toggle]")) {
        const input = document.getElementById(button.dataset.passwordToggle);
        input.value = "";
        setPasswordVisibility(button, input, false);
    }
}

function syncSecurityControls() {
    const disabled = securityBusy || !securityReady || securitySignInRequired;
    updateEmailButton.disabled = disabled;
    updatePasswordButton.disabled = disabled;
    sendSecurityNonce.disabled = disabled;
    for (const input of securityInputs) input.readOnly = disabled;
    securitySignIn.hidden = !securitySignInRequired;
}

function showSecurityStatus(status, message) {
    if (securityDialog.open) status.textContent = message;
    else if (message) showPageStatus(message);
}

function securityFailure(code) {
    return Object.assign(new Error("Account security request failed."), { code });
}

function checkedSecurityUser(user) {
    if (!user || user.id !== settingsAccount.userId) throw securityFailure("session_not_found");
    if (!user.email) throw securityFailure("email_unavailable");
    return user;
}

async function readSecurityUser() {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) throw error;
    return checkedSecurityUser(data?.user);
}

function syncSecurityEmail(user) {
    settingsAccount.email = user.email;
    securityCurrentEmail.value = user.email;
    document.getElementById("accountEmail").value = user.email;
}

async function verifySecurityPassword(user, password) {
    if (typeof supabaseUrl === "undefined" || typeof supabaseKey === "undefined") {
        throw securityFailure("security_configuration_missing");
    }

    // A separate in-memory client keeps the verification sign-in out of the app's session.
    const { auth } = window.supabase.createClient(supabaseUrl, supabaseKey, {
        auth: {
            storageKey: "csupak-password-verification",
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });

    try {
        const { data, error } = await auth.signInWithPassword({ email: user.email, password });
        if (error) throw error;
        if (!data?.session) throw securityFailure("session_not_found");

        const { error: cleanupError } = await auth.signOut({ scope: "local" });
        if (cleanupError) throw securityFailure("verification_cleanup_failed");
        checkedSecurityUser(data.user);
    } finally {
        await auth.dispose();
    }

    const activeUser = await readSecurityUser();
    syncSecurityEmail(activeUser);
    if (activeUser.email !== user.email) throw securityFailure("email_changed");
}

const securityErrorMessages = {
    invalid_credentials: "The current password is incorrect.",
    current_password_mismatch: "The current password is incorrect.",
    current_password_required: "Enter your current password.",
    same_password: "Choose a new password different from your current password.",
    weak_password: "The new password does not meet this project's password policy. Choose a stronger password and try again.",
    email_exists: "That email address is already in use.",
    user_already_exists: "That email address is already in use.",
    email_address_invalid: "Enter a valid email address.",
    email_address_not_authorized: "This project cannot send confirmation email to that address.",
    email_not_confirmed: "Confirm your current email address before trying again.",
    email_unavailable: "This account has no email address available for password verification.",
    email_changed: "Your account email changed. Check the current address and try again.",
    reauthentication_needed: "Supabase requires verification before this change. Sign in again and complete any required verification before retrying.",
    reauthentication_not_valid: "The verification code is invalid or expired. Request a new code and try again.",
    otp_expired: "The verification code expired. Request a new code and try again.",
    insufficient_aal: "Complete your account's required verification and try again.",
    security_configuration_missing: "Refresh the local test copy using the current Supabase configuration instructions.",
    verification_cleanup_failed: "Password verification could not be completed. Please try again."
};

function reportSecurityError(status, error, fallback) {
    const category = classifyNetworkError(error);
    const code = error?.code;
    let message;
    if (isOffline()) {
        message = safeNetworkMessage(error, fallback);
    } else if (Number(error?.status) === 429 || ["over_request_rate_limit", "over_email_send_rate_limit", "over_sms_send_rate_limit"].includes(code)) {
        message = "Too many requests. Wait before trying again.";
    } else if (Object.hasOwn(securityErrorMessages, code)) {
        message = securityErrorMessages[code];
    } else {
        if (category === "auth") securitySignInRequired = true;
        message = safeNetworkMessage(error, fallback);
    }
    showSecurityStatus(status, message);
}

async function runSecurityOperation(status, loading, fallback, operation) {
    if (securityBusy || securitySignInRequired || !securityDialog.open) return;
    if (isOffline()) {
        showSecurityStatus(status, safeNetworkMessage());
        return;
    }
    securityBusy = true;
    syncSecurityControls();
    showSecurityStatus(status, loading);

    try {
        await operation();
    } catch (error) {
        reportSecurityError(status, error, fallback);
    } finally {
        securityBusy = false;
        syncSecurityControls();
    }
}

const pendingEmailNotice = "Email change pending confirmation. Follow the confirmation links sent to your new address and, if required, your current address.";
const canonicalEmail = email => email.trim().toLowerCase();

function refreshSecurityAccount() {
    return runSecurityOperation(securityAccountStatus, "Checking your account…", "Unable to load your account. Reopen this dialog to try again.", async () => {
        const user = await readSecurityUser();
        syncSecurityEmail(user);
        const confirmed = pendingSecurityEmail && canonicalEmail(user.email) === canonicalEmail(pendingSecurityEmail);
        pendingSecurityEmail = user.new_email ?? "";
        if (confirmed) showSecurityStatus(emailChangeStatus, "Your email address was updated.");
        else if (pendingSecurityEmail) showSecurityStatus(emailChangeStatus, pendingEmailNotice);
        showSecurityStatus(securityAccountStatus, "");
        securityReady = true;
    });
}

window.addEventListener("focus", () => {
    if (pendingSecurityEmail && securityDialog.open) refreshSecurityAccount();
});

function invalidSecurityField(input, status, message) {
    input.setAttribute("aria-invalid", "true");
    input.focus();
    showSecurityStatus(status, message);
}

securityEmailForm.addEventListener("submit", event => {
    event.preventDefault();
    if (updateEmailButton.disabled || !securityDialog.open) return;

    securityNewEmail.value = securityNewEmail.value.trim();
    const email = securityNewEmail.value;
    const [localPart] = email.split("@", 1);
    if (!email || !securityNewEmail.validity.valid ||
        localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes("..")) {
        invalidSecurityField(securityNewEmail, emailChangeStatus, "Enter a valid new email address, such as name@domain.com.");
        return;
    }
    if (canonicalEmail(email) === canonicalEmail(securityCurrentEmail.value)) {
        invalidSecurityField(securityNewEmail, emailChangeStatus, "Enter an email address different from your current address.");
        return;
    }
    return runSecurityOperation(emailChangeStatus, "Requesting email change…", "Unable to request an email change. Please try again.", async () => {
        const user = await readSecurityUser();
        syncSecurityEmail(user);
        if (canonicalEmail(email) === canonicalEmail(user.email)) {
            showSecurityStatus(emailChangeStatus, "Enter an email address different from your current address.");
            return;
        }

        const emailRedirectTo = new URL("settings.html", window.location.href).href;
        const { data, error } = await supabaseClient.auth.updateUser({ email }, { emailRedirectTo });
        if (error?.code === "email_address_invalid") {
            showSecurityStatus(emailChangeStatus, "Supabase rejected an address for confirmation. Use a new address that can receive email. If Secure Email Change is enabled, your current address must also be able to receive email.");
            return;
        }
        if (error) throw error;

        const updatedUser = checkedSecurityUser(data?.user);
        syncSecurityEmail(updatedUser);
        securityNewEmail.value = "";
        const completed = canonicalEmail(updatedUser.email) === canonicalEmail(email);
        pendingSecurityEmail = completed ? "" : email;
        showSecurityStatus(emailChangeStatus, completed ? "Your email address was updated." : pendingEmailNotice);
    });
});

securityPasswordForm.addEventListener("submit", event => {
    event.preventDefault();
    if (updatePasswordButton.disabled || !securityDialog.open) return;

    const currentPassword = passwordCurrentPassword.value;
    const password = securityNewPassword.value;
    const nonce = securityNonceFields.hidden ? "" : securityNonce.value.trim();
    if (!currentPassword) {
        invalidSecurityField(passwordCurrentPassword, passwordChangeStatus, "Enter your current password.");
        return;
    }
    if (Array.from(password).length < 8) {
        invalidSecurityField(securityNewPassword, passwordChangeStatus, "Use at least 8 characters for your new password.");
        return;
    }
    if (password === currentPassword) {
        invalidSecurityField(securityNewPassword, passwordChangeStatus, securityErrorMessages.same_password);
        return;
    }
    if (password !== securityConfirmPassword.value) {
        invalidSecurityField(securityConfirmPassword, passwordChangeStatus, "The new passwords do not match.");
        return;
    }
    if (!securityNonceFields.hidden && !nonce) {
        invalidSecurityField(securityNonce, passwordChangeStatus, "Enter the verification code or request a new one.");
        return;
    }

    return runSecurityOperation(passwordChangeStatus, "Updating password…", "Unable to update your password. Please try again.", async () => {
        const user = await readSecurityUser();
        await verifySecurityPassword(user, currentPassword);
        const attributes = { password, current_password: currentPassword };
        if (nonce) attributes.nonce = nonce;
        const { data, error } = await supabaseClient.auth.updateUser(attributes);
        if (error?.code === "reauthentication_needed" || error?.code === "reauthentication_not_valid") {
            securityNonceFields.hidden = false;
            securityNonce.value = "";
            showSecurityStatus(passwordChangeStatus, error.code === "reauthentication_needed"
                ? "A verification code is required. Select Send verification code to continue."
                : securityErrorMessages.reauthentication_not_valid);
            return;
        }
        if (error) throw error;
        checkedSecurityUser(data?.user);

        clearSecurityPasswords(securityPasswordForm);
        securityNonce.value = "";
        securityNonceFields.hidden = true;
        showSecurityStatus(passwordChangeStatus, "Your password was updated.");
    });
});

sendSecurityNonce.addEventListener("click", () => {
    if (sendSecurityNonce.disabled || securityNonceFields.hidden) return;
    return runSecurityOperation(passwordChangeStatus, "Sending verification code…", "Unable to send a verification code. Please try again.", async () => {
        await readSecurityUser();
        const { error } = await supabaseClient.auth.reauthenticate();
        if (error) throw error;
        showSecurityStatus(passwordChangeStatus, "Verification code sent. Enter it above, then select Update Password.");
        if (securityDialog.open) securityNonce.focus();
    });
});
