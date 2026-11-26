const settingsRoleLabels = {
    oswe_admin: "OSWE Administrator",
    oswe_staff: "OSWE Staff",
    security_office: "Security Office"
};
const settingsStatus = document.getElementById("pageReliabilityStatus");
const myAccountButton = document.getElementById("openMyAccount");
const myAccountDialog = document.getElementById("myAccountDialog");
const accountFullName = document.getElementById("accountFullName");
const accountCancelButton = document.getElementById("cancelMyAccount");
const accountSaveButton = document.getElementById("saveMyAccount");
const accountSaveStatus = document.getElementById("accountSaveStatus");
const accountSignInLink = document.getElementById("accountSignIn");

let settingsAccount = null;
let accountSavePending = false;
let accountSignInMessage = "";

document.getElementById("logoutButton").addEventListener("click", logout);

myAccountButton.addEventListener("click", openMyAccount);
document.getElementById("closeMyAccount").addEventListener("click", () => myAccountDialog.close());
accountCancelButton.addEventListener("click", () => myAccountDialog.close());
myAccountDialog.addEventListener("close", () => {
    if (!myAccountDialog.open) myAccountButton.focus();
});
accountFullName.addEventListener("input", () => {
    if (!settingsAccount) return;
    accountSaveStatus.textContent = "";
    syncAccountForm();
});
document.getElementById("myAccountForm").addEventListener("submit", saveMyAccount);

function openMyAccount() {
    if (!settingsAccount || myAccountDialog.open) return;

    if (!accountSavePending) accountFullName.value = settingsAccount.profile.full_name ?? "";
    document.getElementById("accountEmail").value = settingsAccount.email || "Email unavailable";
    document.getElementById("accountRole").value = settingsRoleLabels[settingsAccount.profile.role];
    accountSaveStatus.textContent = accountSavePending ? "Saving changes…" : accountSignInMessage;
    showPageStatus("");
    syncAccountForm();
    myAccountDialog.showModal();
}

function isValidAccountName(name) {
    // PostgreSQL char_length counts Unicode code points, not UTF-16 code units.
    const length = Array.from(name).length;
    return length >= 2 && length <= 100;
}

function syncAccountForm() {
    const name = accountFullName.value.trim();
    const valid = isValidAccountName(name);
    const unchanged = name === (settingsAccount.profile.full_name ?? "").trim();
    const needsSignIn = Boolean(accountSignInMessage);
    accountFullName.setAttribute("aria-invalid", String(!valid));
    accountFullName.readOnly = accountSavePending || needsSignIn;
    accountCancelButton.disabled = accountSavePending;
    accountSaveButton.disabled = !valid || unchanged || accountSavePending || needsSignIn;
    accountSaveButton.textContent = accountSavePending ? "Saving…" : "Save Changes";
    accountSignInLink.hidden = !needsSignIn;
}

function showAccountStatus(message) {
    if (myAccountDialog.open) accountSaveStatus.textContent = message;
    else showPageStatus(message);
}

function showAccountSaveError(error, status) {
    const failure = {
        code: error?.code,
        name: error?.name,
        message: error?.message,
        status: error?.status ?? status
    };
    const category = classifyNetworkError(failure);
    const message = safeNetworkMessage(failure, "Unable to save your full name. Please try again.");

    if (category === "auth") accountSignInMessage = message;
    if (category === "permission") {
        showAccountStatus("You do not have permission to update your profile.");
    } else if (failure.code === "22023") {
        showAccountStatus("Full name must contain 2–100 characters.");
    } else {
        showAccountStatus(message);
    }
}

async function saveMyAccount(event) {
    event.preventDefault();
    if (!settingsAccount || !myAccountDialog.open) return;

    syncAccountForm();
    if (accountSaveButton.disabled) return;

    if (isOffline()) {
        showAccountStatus(safeNetworkMessage());
        return;
    }

    const updatedName = accountFullName.value.trim();
    if (document.activeElement === accountSaveButton) accountFullName.focus();
    accountSavePending = true;
    syncAccountForm();
    showAccountStatus("Saving changes…");

    try {
        const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError) throw sessionError;
        if (sessionData?.session?.user?.id !== settingsAccount.userId) {
            accountSignInMessage = "Your session has changed or expired. Please sign in again.";
            showAccountStatus(accountSignInMessage);
            return;
        }

        const result = await supabaseClient.rpc("update_my_profile", { p_full_name: updatedName });
        if (result.error) {
            showAccountSaveError(result.error, result.status);
            return;
        }
        if (typeof result.data !== "string" || !result.data) throw new Error("Profile update was not confirmed.");

        settingsAccount.profile.full_name = result.data;
        accountFullName.value = result.data;
        showAccountStatus("Your full name was updated.");
    } catch (error) {
        showAccountSaveError(error);
    } finally {
        accountSavePending = false;
        syncAccountForm();
    }
}

async function initializeSettings() {
    const loadingMessage = settingsStatus.textContent;
    const user = await getCurrentUser();
    const profile = user && await getCurrentProfile(user);

    if (!profile) {
        if (settingsStatus.textContent === loadingMessage) {
            showPageStatus("Unable to load account information. Reload to try again.");
        }
        return;
    }

    if (!Object.hasOwn(settingsRoleLabels, profile.role)) {
        showPageStatus("You do not have permission to access Settings.");
        return;
    }

    settingsAccount = { userId: user.id, email: user.email, profile };

    const isAdmin = profile.role === "oswe_admin";
    const isOswe = isAdmin || profile.role === "oswe_staff";

    document.getElementById("complaintsNav").classList.toggle("hidden", !isOswe);
    document.getElementById("complaintTrackingNav").classList.toggle("hidden", !isAdmin);
    document.getElementById("interviewTrackingNav").classList.toggle("hidden", !isOswe);
    document.getElementById("systemAdministration").hidden = !isAdmin;
    document.getElementById("personalSettings").hidden = false;
    showPageStatus("");
}

initializeSettings();
