import { accountStates, adminError, assignableRoles, availableActions, createOperationJournal, createPager,
    emailOutcomeMessage, fullNameInput, newUserInput } from "./user-management-model.mjs";

const byId = id => document.getElementById(id);
const dialog = byId("userManagementDialog");
const title = byId("userManagementTitle");
const actionDialog = byId("userActionDialog");
const filters = byId("userRosterFilters");
const addForm = byId("addUserForm");
const actionForm = byId("userActionForm");
const actionChoice = actionForm.elements.namedItem("action");
const actionName = actionForm.elements.namedItem("fullName");
const actionRole = actionForm.elements.namedItem("role");
const addFields = [...addForm.querySelectorAll("input, select")];
const createButton = byId("createUserButton");
const confirmButton = byId("confirmUserAction");
const journal = createOperationJournal();
const labels = { manage: "Manage Users", add: "Add User", roles: "Roles & Access" };
let mode, actorId, opener, actionOpener, target, addRequest;
let addBusy = false, actionBusy = false, actionFinished = false;
let currentFilters = {};

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function button(text, onClick) {
    const control = element("button", text, "um-button");
    control.type = "button";
    control.addEventListener("click", onClick);
    return control;
}

function setText(id, text) { byId(id).textContent = text; }

async function adminRequest(body) {
    const expected = actorId;
    if (settingsAccount?.profile.role !== "oswe_admin" || settingsAccount.userId !== expected || !expected) throw adminError(403);
    if (isOffline()) throw adminError(0, "offline");
    const { data, error } = await supabaseClient.auth.getSession().catch(() => { throw adminError(); });
    if (error || actorId !== expected || data?.session?.user?.id !== expected || !data.session.access_token) throw adminError(401);
    const result = await supabaseClient.functions.invoke("admin-user-management", {
        body, headers: { Authorization: `Bearer ${data.session.access_token}` }
    }).catch(() => { throw adminError(); });
    if (actorId !== expected) throw adminError(401);
    if (result.error) {
        const response = result.error.context;
        const payload = await response?.json?.().catch(() => null);
        throw adminError(response?.status, payload?.error?.code);
    }
    if (result.data?.success !== true || !result.data.data) throw adminError();
    return result.data.data;
}

const roster = createPager(cursor => adminRequest({
    action: "list_users", includeOnboarding: true, ...currentFilters, ...(cursor ? { cursor } : {})
}).then(page => {
    if (!Array.isArray(page.users) || page.users.some(user => !Object.hasOwn(accountStates, user.accountState))) throw adminError();
    return page;
}), renderRoster);
const interrupted = createPager(cursor => adminRequest({
    action: "list_interrupted_provisioning", ...(cursor ? { cursor } : {})
}).then(page => {
    if (!Array.isArray(page.requests)) throw adminError();
    return page;
}), renderInterrupted);

function renderPaging(prefix, state) {
    const { page, error, result, hasNext, loading } = state;
    const previous = byId(`${prefix}Previous`);
    const next = byId(`${prefix}Next`);
    previous.disabled = loading || error || !page;
    next.disabled = loading || error || !hasNext;
    byId(`${prefix}Retry`).hidden = !error;
    return result;
}

function renderRoster(state) {
    const result = renderPaging("userRoster", state);
    const list = byId("userRosterList");
    list.replaceChildren();
    byId("userRosterResults").hidden = !result || !result.users.length && !state.page;
    setText("userRosterStatus", state.loading ? "Loading users…" : state.error?.message ||
        (result.users.length ? `${result.users.length} ${result.users.length === 1 ? "user" : "users"} on this page.` : "No users match these filters."));
    if (!result) return;
    setText("userRosterPage", `Page ${state.page + 1}`);
    for (const user of result.users) {
        const row = element("li", "", "um-row");
        const identity = element("div");
        identity.append(element("p", user.fullName, "um-row-name"), element("p", user.email ?? "Email unavailable", "um-muted"));
        const status = element("div");
        const badge = element("span", accountStates[user.accountState], "um-badge");
        badge.dataset.state = user.accountState;
        status.append(badge);
        if (mode === "manage" && user.accountState === "setup_pending") {
            const copy = user.setupOperationId ? ({ requested: "Setup email requested", not_requested: "Setup email not requested",
                outcome_unknown: "Setup email outcome unknown" })[user.setupEmailState] : "Only the provisioning administrator can resend setup.";
            status.append(element("p", copy, "um-muted"));
        }
        row.append(identity, element("p", settingsRoleLabels[user.role], "um-muted"), status);
        const actions = availableActions(user, actorId, mode);
        if (actions.length) {
            const control = button(mode === "roles" ? "Manage access" : "Account actions", () => openAction(user, actions, control));
            control.setAttribute("aria-label", `${control.textContent} for ${user.fullName}`);
            row.append(control);
        } else row.append(element("p", "Your account", "um-muted"));
        list.append(row);
    }
}

function renderInterrupted(state) {
    const result = renderPaging("interrupted", state);
    const list = byId("interruptedRequestsList");
    list.replaceChildren();
    byId("interruptedPrevious").hidden = !result || !state.page;
    byId("interruptedNext").hidden = !result || !state.hasNext;
    setText("interruptedRequestsStatus", state.loading ? "Loading interrupted requests…" : state.error?.message ||
        (result.requests.length ? "Resume a request using its original details." : "No interrupted requests on this page."));
    if (!result) return;
    for (const request of result.requests) {
        const row = element("li", "", "um-row");
        const identity = element("div");
        identity.append(element("p", request.fullName, "um-row-name"), element("p", request.email, "um-muted"));
        const resume = button("Review and resume", () => {
            if (addBusy) return;
            setAddRequest({ action: "create_user", ...request });
            byId("viewUsersAfterAdd").hidden = true;
            setText("addUserStatus", "This resumes the original request. No request has been sent yet.");
            createButton.focus();
        });
        row.append(identity, element("p", settingsRoleLabels[request.role], "um-muted"), resume);
        list.append(row);
    }
}

function openPanel(nextMode, trigger) {
    if (settingsAccount?.profile.role !== "oswe_admin") return;
    actorId = settingsAccount.userId;
    mode = nextMode;
    if (trigger) opener = trigger;
    title.textContent = labels[mode];
    byId("userRosterPanel").hidden = mode === "add";
    byId("addUserPanel").hidden = mode !== "add";
    if (!dialog.open) dialog.showModal();
    title.focus();
    roster.reset();
    interrupted.reset();
    if (mode === "add") void interrupted.load();
    else {
        filters.reset();
        currentFilters = {};
        void roster.load();
    }
}

for (const control of document.querySelectorAll("[data-user-management]")) {
    control.addEventListener("click", () => openPanel(control.dataset.userManagement, control));
}
byId("viewUsersAfterAdd").addEventListener("click", () => openPanel("manage"));
byId("closeUserManagement").addEventListener("click", () => { if (!addBusy) dialog.close(); });
dialog.addEventListener("cancel", event => { if (addBusy) event.preventDefault(); });
dialog.addEventListener("close", () => {
    if (dialog.open) return;
    roster.reset();
    interrupted.reset();
    byId("userRosterList").replaceChildren();
    byId("interruptedRequestsList").replaceChildren();
    opener?.focus();
});

filters.addEventListener("submit", event => {
    event.preventDefault();
    const filter = new FormData(filters);
    const search = filter.get("search").trim();
    const role = filter.get("role");
    const status = filter.get("status");
    currentFilters = { ...(search ? { search } : {}), ...(role ? { role } : {}), ...(status ? { isActive: status === "active" } : {}) };
    roster.reset();
    void roster.load();
});
for (const [prefix, pager] of [["userRoster", roster], ["interrupted", interrupted]]) {
    for (const [suffix, direction] of [["Previous", -1], ["Next", 1], ["Retry", "retry"]]) {
        byId(prefix + suffix).addEventListener("click", () => void pager.load(direction));
    }
}

function setAddRequest(request) {
    addRequest = request;
    if (request) for (const field of addFields) field.value = request[field.name];
    else addForm.reset();
    syncAddForm();
}

function syncAddForm() {
    for (const field of addFields) field.disabled = addBusy || Boolean(addRequest);
    createButton.disabled = addBusy;
    createButton.textContent = addBusy ? "Submitting…" : addRequest ? "Resume original request" : "Create user and request setup email";
    byId("resetAddUser").hidden = !addRequest;
    byId("resetAddUser").disabled = addBusy;
    byId("closeUserManagement").disabled = addBusy;
}

byId("resetAddUser").addEventListener("click", () => {
    setAddRequest(null);
    byId("viewUsersAfterAdd").hidden = true;
    setText("addUserStatus", "");
    addFields[0].focus();
});

addForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (addBusy) return;
    const intent = newUserInput(...addFields.map(field => field.value));
    if (!intent) { setText("addUserStatus", "Enter a full name of 2–100 characters, a valid email, and an eligible role."); return; }
    const request = journal.request(intent, addRequest?.operationId);
    addBusy = true;
    const actor = actorId;
    setAddRequest(request);
    setText("addUserStatus", "Submitting the account request…");
    byId("viewUsersAfterAdd").hidden = true;
    try {
        const result = await adminRequest(request);
        if (result.operationId !== request.operationId) throw adminError();
        if (result.provisioningState === "auth_outcome_unknown" && result.emailState === null) {
            setText("addUserStatus", "Account creation is unconfirmed. Wait at least one minute, then resume the original request.");
        } else if (result.provisioningState === "profile_ready" && emailOutcomeMessage(result.emailState)) {
            journal.finish(intent);
            setAddRequest(null);
            setText("addUserStatus", `The account is on the roster. ${emailOutcomeMessage(result.emailState)}`);
            byId("viewUsersAfterAdd").hidden = false;
        } else throw adminError();
    } catch (error) {
        if (actor !== actorId) return;
        if (error.definitive) {
            journal.finish(intent);
            addRequest = null;
        }
        setText("addUserStatus", `${error.message}${error.definitive ? "" : " Resume the original request to keep the same operation ID."}`);
    } finally {
        addBusy = false;
        syncAddForm();
        if (actor === actorId && dialog.open && mode === "add") {
            interrupted.reset();
            void interrupted.load();
        }
    }
});

function actionLabels(user) {
    return { update_name: "Edit full name", change_role: "Change role", set_status: user.isActive ? "Deactivate account" : "Activate account",
        request_password_reset: "Send password reset email", resend_setup_email: "Resend setup email" };
}

function openAction(user, actions, control) {
    target = user;
    actionOpener = control;
    actionFinished = false;
    const names = actionLabels(user);
    actionChoice.replaceChildren(...actions.map(action => new Option(names[action], action)));
    actionRole.replaceChildren(new Option("Choose a role", ""), ...assignableRoles.filter(role => role !== user.role)
        .map(role => new Option(settingsRoleLabels[role], role)));
    actionName.value = user.fullName;
    setText("userActionTarget", `${user.fullName} · ${user.email ?? settingsRoleLabels[user.role]}`);
    setText("userActionStatus", "");
    syncAction();
    actionDialog.showModal();
}

function syncAction() {
    const action = actionChoice.value;
    const descriptions = {
        update_name: "Save the full name shown on this account.",
        change_role: "The user will need to sign in again after their role changes.",
        set_status: target?.isActive ? "This blocks application access and invalidates the user’s existing sessions for CSUPAK." :
            "The user must sign in again after activation. Pending setup must be completed first.",
        request_password_reset: "Request a password reset at the account’s confirmed email. If a previous outcome was uncertain, check the inbox first.",
        resend_setup_email: "Send another setup email. If delivery was uncertain, check the inbox first. A new email may invalidate an earlier setup link."
    };
    setText("userActionDescription", descriptions[action] || "");
    byId("userActionNameField").hidden = action !== "update_name";
    byId("userActionRoleField").hidden = action !== "change_role";
    actionName.disabled = actionBusy || actionFinished || action !== "update_name";
    actionRole.disabled = actionBusy || actionFinished || action !== "change_role";
    actionChoice.disabled = actionBusy || actionFinished;
    confirmButton.disabled = actionBusy || actionFinished ||
        (action === "update_name" && (!fullNameInput(actionName.value) || fullNameInput(actionName.value) === target?.fullName)) ||
        (action === "change_role" && !assignableRoles.includes(actionRole.value));
    confirmButton.textContent = actionBusy ? "Submitting…" : action === "update_name" ? "Save changes" : "Confirm";
    const cancel = byId("cancelUserAction");
    cancel.disabled = actionBusy;
    cancel.textContent = actionFinished ? "Close" : "Cancel";
}

actionForm.addEventListener("input", () => { setText("userActionStatus", ""); syncAction(); });
byId("cancelUserAction").addEventListener("click", () => actionDialog.close());
actionDialog.addEventListener("cancel", event => { if (actionBusy) event.preventDefault(); });
actionDialog.addEventListener("close", () => {
    if (!dialog.open) return;
    if (actionOpener?.isConnected) actionOpener.focus();
    else title.focus();
});

actionForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (confirmButton.disabled || !target || !actionDialog.open) return;
    const action = actionChoice.value;
    if (!availableActions(target, actorId, mode).includes(action)) return;
    const intent = { action, userId: target.id };
    if (action === "update_name") intent.fullName = fullNameInput(actionName.value);
    if (action === "change_role") intent.role = actionRole.value;
    if (action === "set_status") intent.isActive = !target.isActive;
    const resend = action === "resend_setup_email";
    const request = resend ? { action, operationId: target.setupOperationId } : journal.request(intent);
    const actor = actorId;
    actionBusy = true;
    syncAction();
    setText("userActionStatus", "Submitting the request…");
    try {
        const result = await adminRequest(request);
        if (result.operationId !== request.operationId) throw adminError();
        const isMail = resend || action === "request_password_reset";
        const outcome = resend ? result.emailState : result.outcome;
        const message = isMail ? emailOutcomeMessage(outcome) : ({ applied: "Changes saved.", no_change: "No change was needed." })[outcome];
        if (typeof message !== "string") throw adminError();
        if (!resend && outcome !== "recovery_cooldown") journal.finish(intent);
        actionFinished = outcome !== "recovery_cooldown";
        setText("userActionStatus", message);
        if (action === "update_name" && target.id === actor && outcome === "applied") {
            const profile = await getCurrentProfile({ id: actor });
            if (profile && actorId === actor) settingsAccount.profile.full_name = profile.full_name;
        }
        if (dialog.open && actorId === actor) void roster.load();
    } catch (error) {
        if (actor !== actorId) return;
        if (error.definitive) journal.finish(intent);
        if (resend && !error.definitive) {
            actionFinished = true;
            setText("userActionStatus", "Setup email outcome is unknown. Check the inbox and roster before making another resend request.");
            void roster.load();
        } else setText("userActionStatus", `${error.message}${error.definitive ? "" : " Retry this request with the same values to keep its operation ID."}`);
    } finally {
        actionBusy = false;
        syncAction();
        if (actionDialog.open) (actionFinished ? byId("cancelUserAction") : confirmButton).focus();
    }
});

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (!actorId || (event !== "SIGNED_OUT" && session?.user?.id === actorId)) return;
    actorId = null;
    journal.clear();
    target = null;
    actionName.value = "";
    setText("userActionTarget", "");
    setText("userActionStatus", "");
    setAddRequest(null);
    setText("addUserStatus", "");
    byId("viewUsersAfterAdd").hidden = true;
    actionDialog.close();
    dialog.close();
    byId("systemAdministration").hidden = true;
});
