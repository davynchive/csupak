export const accountStates = {
    active: "Active",
    setup_pending: "Setup pending",
    awaiting_activation: "Awaiting activation",
    deactivated: "Deactivated"
};

export const assignableRoles = ["oswe_staff", "security_office"];

export function availableActions(user, actorId, mode) {
    if (mode === "roles") {
        if (user.id === actorId) return [];
        return ["change_role", ...(user.accountState === "setup_pending" ? [] : ["set_status"])];
    }
    if (user.accountState === "setup_pending") {
        return ["update_name", ...(user.setupOperationId ? ["resend_setup_email"] : [])];
    }
    return ["update_name", ...(user.email ? ["request_password_reset"] : [])];
}

export function fullNameInput(value) {
    const name = value.trim();
    const length = [...name].length;
    return length >= 2 && length <= 100 && !/[\u0000\uD800-\uDFFF]/u.test(name) ? name : null;
}

export function newUserInput(fullName, email, role) {
    fullName = fullNameInput(fullName);
    email = email.trim().toLowerCase();
    if (!fullName || [...email].length > 254 || !/^[^\p{White_Space}\p{Cc}@]+@[^\p{White_Space}\p{Cc}@]+[.][^\p{White_Space}\p{Cc}@]+$/u.test(email) ||
        /[\uD800-\uDFFF]/u.test(email) || !assignableRoles.includes(role)) return null;
    return { action: "create_user", fullName, email, role };
}

export function adminError(status, code = "") {
    const messages = {
        invalid_access_token: "Your session has expired. Sign in again to continue.",
        offline: "You appear to be offline. Reconnect and try again.",
        access_denied: "You are no longer eligible for this action, or an administrator safeguard blocked it.",
        invalid_parameters: "Check the form values and try again.",
        profile_not_found: "This account no longer has a profile. Refresh the roster.",
        provisioning_conflict: "This email is already reserved or belongs to another account. Review the existing user or interrupted request.",
        provisioning_not_ready: "Setup email cannot be sent at this stage. Reload the roster and check account setup.",
        operation_id_conflict: "This request ID already belongs to another operation. Refresh before starting again.",
        onboarding_required: "This user must complete account setup first.",
        last_active_administrator: "At least one administrator must remain active.",
        recovery_target_unavailable: "A confirmed recovery email is unavailable for this account.",
        operation_busy: "The service is busy. Wait, then retry the same request."
    };
    const definitive = new Set([400, 401, 403, 404, 409, 422]).has(status);
    return Object.assign(new Error(Object.hasOwn(messages, code) ? messages[code] :
        status === 401 ? messages.invalid_access_token : status === 403 ? messages.access_denied :
            "The service did not confirm the request. Check your connection and try again."), { definitive, status });
}

export function emailOutcomeMessage(outcome) {
    const messages = {
        requested: "The email request was accepted. Inbox delivery is unconfirmed.",
        not_requested: "The email was not requested. Check the account details before trying again.",
        email_cooldown: "A setup request was made recently. Wait at least one minute before resending.",
        recovery_cooldown: "A recovery request was made recently. Wait at least one minute before retrying.",
        outcome_unknown: "The email request outcome is unknown. Check the recipient’s inbox before sending again.",
        onboarding_complete: "Onboarding is complete. Check the roster for account status."
    };
    return Object.hasOwn(messages, outcome) ? messages[outcome] : null;
}

export function createOperationJournal(newId = () => crypto.randomUUID()) {
    const requests = new Map();
    const key = intent => JSON.stringify(intent);
    return {
        request(intent, operationId) {
            const id = operationId ?? requests.get(key(intent)) ?? newId();
            requests.set(key(intent), id);
            return { ...intent, operationId: id };
        },
        finish(intent) { requests.delete(key(intent)); },
        clear() { requests.clear(); }
    };
}

export function createPager(fetchPage, publish) {
    let generation = 0;
    let cursors = [null];
    let page = 0;
    let nextCursor;
    let retryPage;
    return {
        reset() {
            generation += 1;
            cursors = [null];
            page = 0;
            nextCursor = undefined;
            retryPage = undefined;
        },
        async load(direction = 0) {
            const target = direction === "retry" ? retryPage ?? page : page + direction;
            if (target < 0 || target > page && !nextCursor) return;
            if (target > page) cursors[target] = nextCursor;
            const current = ++generation;
            retryPage = target;
            publish({ loading: true });
            try {
                const result = await fetchPage(cursors[target]);
                if (current !== generation) return;
                page = target;
                nextCursor = result.nextCursor;
                retryPage = undefined;
                publish({ result, page, hasNext: Boolean(nextCursor) });
            } catch (error) {
                if (current === generation) publish({ error, page });
            }
        }
    };
}
