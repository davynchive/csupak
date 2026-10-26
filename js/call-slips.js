const callSlipMutations = new Set();
let isSavingReschedule = false;
/* =====================================================
   CSUPAK INTERVIEW TRACKING
===================================================== */


/* =====================================================
   ELEMENTS
===================================================== */

const pageContent =
    document.getElementById("pageContent");

const userName =
    document.getElementById("userName");

const logoutButton =
    document.getElementById("logoutButton");


const complaintsNav =
    document.getElementById("complaintsNav");

const complaintTrackingNav =
    document.getElementById(
        "complaintTrackingNav"
    );

const interviewTrackingNav =
    document.getElementById(
        "interviewTrackingNav"
    );


const totalCalls =
    document.getElementById("totalCalls");

const showCount =
    document.getElementById("showCount");

const rescheduleCount =
    document.getElementById(
        "rescheduleCount"
    );

const noShowCount =
    document.getElementById(
        "noShowCount"
    );


const searchInput =
    document.getElementById(
        "searchInput"
    );

const statusFilter =
    document.getElementById(
        "statusFilter"
    );

const callNumberFilter =
    document.getElementById(
        "callNumberFilter"
    );

const refreshButton =
    document.getElementById(
        "refreshButton"
    );

const callSlipRecords =
    document.getElementById(
        "callSlipRecords"
    );


/* =====================================================
   RESCHEDULE MODAL
===================================================== */

const rescheduleModal =
    document.getElementById(
        "rescheduleModal"
    );

const rescheduleForm =
    document.getElementById(
        "rescheduleForm"
    );

const closeRescheduleModal =
    document.getElementById(
        "closeRescheduleModal"
    );

const cancelReschedule =
    document.getElementById(
        "cancelReschedule"
    );

const newScheduledDate =
    document.getElementById(
        "newScheduledDate"
    );

const newScheduledTime =
    document.getElementById(
        "newScheduledTime"
    );

const rescheduleRemarks =
    document.getElementById(
        "rescheduleRemarks"
    );


/* =====================================================
   STATUS NOTIFICATION
===================================================== */

function showStatusNotification() {

    const notification =
        document.getElementById(
            "statusNotification"
        );


    if (!notification) {

        console.error(
            "statusNotification not found."
        );

        return;
    }


    notification.classList.remove(
        "hidden"
    );

    notification.style.display =
        "block";


    notification.classList.remove(
        "show"
    );


    void notification.offsetWidth;


    notification.classList.add(
        "show"
    );


    setTimeout(
        function () {

            notification.classList.remove(
                "show"
            );

            notification.classList.add(
                "hidden"
            );

            notification.style.display =
                "none";

        },
        2000
    );
}

/* =====================================================
   GLOBAL DATA
===================================================== */

let currentProfile = null;

let allCallSlips = [];
let complaintGroups = new Map();
const CALL_SLIP_BATCH_SIZE = 500;
const CALL_SLIP_GROUP_PAGE_SIZE = 10;
let currentCallSlipPage = 1;
let callSlipsLoading = false;
let callSlipsComplete = false;
let callSlipsLoadError = null;

let selectedCallSlipId = null;


/* =====================================================
   ROLE DISPLAY
===================================================== */

const callHistoryModal = document.getElementById("callHistoryModal");
const callHistoryContent = document.getElementById("callHistoryContent");
const closeCallHistoryModal = document.getElementById("closeCallHistoryModal");
let callHistoryRequestToken = 0;
let callHistoryReturnFocus = null;
let callHistoryPreviousOverflow = null;

function closeCallHistory(restoreFocus = true) {
    callHistoryRequestToken++;
    callHistoryModal.classList.add("hidden");
    callHistoryModal.classList.remove("flex");
    callHistoryContent.replaceChildren();
    if (callHistoryPreviousOverflow !== null) {
        document.body.style.overflow = callHistoryPreviousOverflow;
        callHistoryPreviousOverflow = null;
    }
    const trigger = callHistoryReturnFocus;
    callHistoryReturnFocus = null;
    if (restoreFocus && trigger && trigger.isConnected) trigger.focus();
}

function showCallHistoryMessage(text, error = false) {
    callHistoryContent.replaceChildren();
    const message = document.createElement("p");
    message.className = error ? "text-sm text-red-600" : "text-sm text-gray-500";
    if (error) message.setAttribute("role", "alert");
    message.textContent = text;
    callHistoryContent.appendChild(message);
}

function renderCallHistory(records) {
    callHistoryContent.replaceChildren();
    if (!records.length) {
        showCallHistoryMessage("No status history available.");
        return;
    }
    const labels = { baseline: "Baseline recorded", created: "Record created", status_changed: "Status changed", schedule_changed: "Schedule changed", status_and_schedule_changed: "Status and schedule changed", remarks_changed: "Remarks changed" };
    const displayText = (value, fallback) => typeof value === "string" && value.trim() ? value : fallback;
    for (const record of records) {
        const entry = document.createElement("div");
        entry.className = "mb-3 rounded-xl border border-gray-100 p-4";
        entry.style.overflowWrap = "anywhere";
        const event = document.createElement("p");
        event.className = "text-sm font-bold text-[#006B21]";
        event.textContent = Object.prototype.hasOwnProperty.call(labels, record.event_type)
            ? labels[record.event_type] : displayText(record.event_type, "History event");
        const transition = document.createElement("p");
        transition.className = "mt-2 text-sm text-gray-700";
        transition.textContent = displayText(record.previous_status, "Pending") + " → " +
            displayText(record.new_status, "Pending");
        const actor = document.createElement("p");
        actor.className = "mt-2 text-xs text-gray-500";
        actor.textContent = displayText(record.actor_name, "System / Unattributed") + " · " +
            displayText(record.actor_role, "Role not recorded");
        const time = document.createElement("p");
        time.className = "mt-1 text-xs text-gray-500";
        const date = record.changed_at ? new Date(record.changed_at) : null;
        time.textContent = date && Number.isFinite(date.getTime())
            ? date.toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : "Date/time unavailable";
        entry.appendChild(event);
        entry.appendChild(transition);
        const isInitial = ["baseline", "created"].includes(record.event_type);
        for (const [label, previous, next] of [
            ["Schedule", record.previous_schedule_type, record.new_schedule_type],
            ["Scheduled date", record.previous_scheduled_date, record.new_scheduled_date],
            ["Scheduled time", record.previous_scheduled_time, record.new_scheduled_time],
            ["Remarks", record.previous_remarks, record.new_remarks]
        ]) {
            const before = displayText(previous, "Not provided");
            const after = displayText(next, "Not provided");
            if (previous === next || (before === "Not provided" && after === "Not provided")) continue;
            const detail = document.createElement("p");
            detail.className = "mt-2 whitespace-pre-wrap text-sm text-gray-700";
            detail.textContent = label + ": " + (isInitial ? after : before + " ? " + after);
            entry.appendChild(detail);
        }
        entry.appendChild(actor);
        entry.appendChild(time);
        callHistoryContent.appendChild(entry);
    }
}

async function openCallHistory(call, trigger) {
    if (!currentProfile || !["oswe_staff", "oswe_admin"].includes(currentProfile.role) ||
        callSlipsLoading || !callSlipsComplete || !allCallSlips.some(record => record.id === call.id)) return;
    closeCallHistory(false);
    const token = ++callHistoryRequestToken;
    const isCurrent = () => token === callHistoryRequestToken;
    callHistoryReturnFocus = trigger;
    callHistoryPreviousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    callHistoryModal.classList.remove("hidden");
    callHistoryModal.classList.add("flex");
    showCallHistoryMessage("Loading status history...");
    closeCallHistoryModal.focus();
    const records = [];
    const ids = new Set();
    let expectedTotal = null;
    let offset = 0;
    try {
        do {
            if (!isCurrent()) return;
            const result = await supabaseClient.from("call_slip_history")
                .select("id, call_slip_id, event_type, previous_status, new_status, previous_schedule_type, new_schedule_type, previous_scheduled_date, new_scheduled_date, previous_scheduled_time, new_scheduled_time, previous_remarks, new_remarks, actor_name, actor_role, changed_at", { count: "exact" })
                .eq("call_slip_id", call.id)
                .order("changed_at", { ascending: false })
                .order("id", { ascending: false })
                .range(offset, offset + CALL_SLIP_BATCH_SIZE - 1);
            if (!isCurrent()) return;
            if (result.error) throw result.error;
            if (!Array.isArray(result.data) || !Number.isSafeInteger(result.count) ||
                result.count < 0 || result.data.length > CALL_SLIP_BATCH_SIZE) {
                throw new Error("Invalid status history batch.");
            }
            if (expectedTotal === null) expectedTotal = result.count;
            if (result.count !== expectedTotal) throw new Error("Status history count changed while loading.");
            if (!result.data.length && offset < expectedTotal) throw new Error("Premature empty status history batch.");
            for (const record of result.data) {
                if (!record || typeof record !== "object" || Array.isArray(record) ||
                    !["string", "number"].includes(typeof record.id) || !String(record.id).trim() ||
                    (typeof record.id === "number" && !Number.isFinite(record.id)) ||
                    String(record.call_slip_id) !== String(call.id)) {
                    throw new Error("Invalid status history record.");
                }
                const id = String(record.id);
                if (ids.has(id)) throw new Error("Duplicate status history ID.");
                ids.add(id);
                records.push(record);
            }
            offset += result.data.length;
        } while (offset < expectedTotal);
        if (records.length !== expectedTotal || ids.size !== expectedTotal) throw new Error("Incomplete status history.");
        if (isCurrent()) renderCallHistory(records);
    } catch (error) {
        if (!isCurrent()) return;
        console.error("Unable to load complete status history:", error);
        showCallHistoryMessage("Unable to load complete status history. Close and reopen to try again.", true);
    }
}

closeCallHistoryModal.addEventListener("click", () => closeCallHistory());
callHistoryModal.addEventListener("click", event => {
    if (event.target === callHistoryModal) closeCallHistory();
});
document.addEventListener("keydown", event => {
    if (callHistoryModal.classList.contains("hidden")) return;
    if (event.key === "Escape") {
        event.preventDefault();
        closeCallHistory();
    } else if (event.key === "Tab") {
        event.preventDefault();
        if (document.activeElement === closeCallHistoryModal) callHistoryContent.focus();
        else closeCallHistoryModal.focus();
    }
});



function getRoleDisplayName(role) {

    if (role === "oswe_admin") {

        return "OSWE Administrator";
    }


    if (role === "oswe_staff") {

        return "OSWE Staff";
    }


    return "Authorized User";
}


/* =====================================================
   LOAD PROFILE
===================================================== */

async function loadProfile() {

    const userResult =
        await supabaseClient
            .auth
            .getUser();


    requireUserResult(userResult);


    const profileResult =
        await supabaseClient
            .from("profiles")
            .select(
                "full_name, role"
            )
            .eq(
                "id",
                userResult.data.user.id
            )
            .single();


    if (profileResult.error) throw profileResult.error;


    currentProfile =
        profileResult.data;


    /*
        INTERVIEW TRACKING:

        OSWE Admin:
        YES

        OSWE Staff:
        YES

        Security Office:
        NO
    */

    if (
        currentProfile.role !==
            "oswe_admin" &&
        currentProfile.role !==
            "oswe_staff"
    ) {

        window.location.href =
            "dashboard.html";

        return false;
    }


    userName.textContent =
        currentProfile.full_name;

    const userRole =
        document.getElementById("userRole");

    userRole.textContent =
        getRoleDisplayName(
            currentProfile.role
        );


    /*
        Both OSWE Admin and OSWE Staff
        can access Add Complaint.
    */

    complaintsNav
        .classList
        .remove(
            "hidden"
        );

    complaintsNav
        .classList
        .add(
            "flex"
        );


    /*
        Both can access Interview Tracking.
    */

    interviewTrackingNav
        .classList
        .remove(
            "hidden"
        );

    interviewTrackingNav
        .classList
        .add(
            "flex"
        );


    /*
        Only OSWE Admin can access
        Complaint Tracking.
    */

    if (
        currentProfile.role ===
        "oswe_admin"
    ) {

        complaintTrackingNav
            .classList
            .remove(
                "hidden"
            );

        complaintTrackingNav
            .classList
            .add(
                "flex"
            );

    } else {

        complaintTrackingNav
            .classList
            .add(
                "hidden"
            );

        complaintTrackingNav
            .classList
            .remove(
                "flex"
            );
    }


    pageContent.classList.remove(
        "hidden"
    );


    return true;
}


const interviewCallModal = document.getElementById("interviewCallModal");
const interviewCallForm = document.getElementById("interviewCallForm");
const interviewCallNumber = document.getElementById("interviewCallNumber");
const interviewCallMessage = document.getElementById("interviewCallMessage");
let interviewSaving = false;
let interviewModalToken = 0;
let interviewComplaintId = null;
let interviewReturnFocus = null;
let interviewNotificationTimer;

function interviewAuthorized() {
    return currentProfile && ["oswe_admin", "oswe_staff"].includes(currentProfile.role);
}

function applyInterviewNumbers(group) {
    for (const option of interviewCallNumber.options) option.disabled = group.calls.some(call => Number(call.call_number) === Number(option.value));
    const next = nextInterviewCall(group);
    interviewCallNumber.value = next ? String(next) : "";
    interviewCallForm.querySelector('[type="submit"]').disabled = !next;
    return next;
}

function openInterviewCall(id, trigger) {
    if (interviewSaving || !interviewAuthorized() || callSlipsLoading || !callSlipsComplete) return;
    const group = complaintGroups.get(id);
    if (!group || !nextInterviewCall(group)) return;
    interviewModalToken++;
    interviewComplaintId = id;
    interviewReturnFocus = trigger;
    interviewCallForm.reset();
    document.getElementById("interviewCallTitle").textContent = "Add Call Slip ? Complaint #" + id;
    const person = interviewGroupPerson(group);
    document.getElementById("callStudentName").value = person.name;
    document.getElementById("callCourseYear").value = person.courseYear;
    document.getElementById("callDate").value = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    applyInterviewNumbers(group);
    interviewCallMessage.textContent = "";
    interviewCallModal.showModal();
}

function closeInterviewCall() {
    if (interviewSaving) return;
    interviewModalToken++;
    interviewComplaintId = null;
    interviewCallModal.close();
    if (interviewReturnFocus?.isConnected) interviewReturnFocus.focus();
    interviewReturnFocus = null;
}

document.getElementById("cancelInterviewCall").addEventListener("click", closeInterviewCall);
interviewCallModal.addEventListener("cancel", event => { event.preventDefault(); closeInterviewCall(); });

interviewCallForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (interviewSaving || !interviewAuthorized() || callSlipsLoading || !callSlipsComplete || !interviewCallForm.reportValidity()) return;
    const complaintId = interviewComplaintId, token = interviewModalToken;
    const isCurrent = () => token === interviewModalToken && interviewComplaintId === complaintId && interviewCallModal.open;
    const group = complaintGroups.get(complaintId);
    const number = Number(interviewCallNumber.value);
    if (!group || ![1,2,3].includes(number)) return;
    if (group.calls.some(call => Number(call.call_number) === number)) {
        const next = applyInterviewNumbers(group);
        interviewCallMessage.textContent = "A " + getCallNumberLabel(number) + " is already recorded for this complaint." + (next ? " Please use " + getCallNumberLabel(next) + "." : " All calls recorded.");
        return;
    }
    const value = id => document.getElementById(id).value.trim() || null;
    const payload = {complaint_id:complaintId, call_number:number, student_name:value("callStudentName"), course_year:value("callCourseYear"), date:value("callDate"), schedule_type:value("callScheduleType"), scheduled_date:value("callScheduledDate"), scheduled_time:value("callScheduledTime"), remarks:value("callRemarks"), received_by:currentProfile.full_name, interview_status:null};
    const controls = Array.from(interviewCallForm.querySelectorAll("input, select, button"));
    const states = controls.map(control => control.disabled);
    const save = interviewCallForm.querySelector('[type="submit"]');
    const label = save.textContent;
    interviewSaving = true;
    controls.forEach(control => { control.disabled = true; });
    save.textContent = "Saving...";
    interviewCallMessage.textContent = "";
    let confirmed = false;
    try {
        const result = await supabaseClient.from("call_slips").insert(payload).select("id, complaint_id, call_number").single();
        if (result.error) throw result.error;
        if (!result.data || interviewId(result.data.complaint_id) !== complaintId || Number(result.data.call_number) !== number) throw new Error("Insert not confirmed.");
        interviewId(result.data.id);
        confirmed = true;
        await loadCallSlips();
        if (isCurrent()) {
            const notification = document.getElementById("interviewCallNotification");
            notification.textContent = callSlipsComplete ? "Call Slip added successfully." : "Call Slip saved, but the view could not be refreshed. Use Refresh to reload the records.";
            notification.classList.remove("hidden");
            clearTimeout(interviewNotificationTimer);
            interviewNotificationTimer = setTimeout(() => notification.classList.add("hidden"), 6000);
        }
    } catch (error) {
        // Never retry a write: a lost response may still mean the insert succeeded.
        await loadCallSlips();
        if (isCurrent()) {
            const fresh = callSlipsComplete ? complaintGroups.get(complaintId) : null;
            const next = fresh ? applyInterviewNumbers(fresh) : undefined;
            interviewCallMessage.textContent = error?.code === "23505"
                ? "A " + getCallNumberLabel(number) + " is already recorded for this complaint." + (next ? " Please use " + getCallNumberLabel(next) + "." : fresh ? " All calls recorded." : " Refresh to check the next available call.")
                : "Call Slip save could not be confirmed. Verify the existing calls before submitting again.";
        }
    } finally {
        interviewSaving = false;
        controls.forEach((control,index) => { control.disabled = states[index]; });
        save.textContent = label;
        if (isCurrent()) {
            const fresh = callSlipsComplete ? complaintGroups.get(complaintId) : null;
            if (fresh) applyInterviewNumbers(fresh);
            else save.disabled = true;
            if (confirmed) closeInterviewCall();
        }
        if (callSlipsComplete) renderCallSlips();
    }
});

/* =====================================================
   LOAD CALL SLIPS
===================================================== */

async function loadCallSlips() {
    if (callSlipsLoading) return;
    callSlipsLoading = true;
    callSlipsComplete = false;
    callSlipsLoadError = null;
    allCallSlips = [];
    complaintGroups = new Map();
    currentCallSlipPage = 1;
    refreshButton.disabled = true;
    renderCallSlips();
    const records = [];
    const ids = new Set();
    let expectedTotal = null;
    let offset = 0;
    try {
        const summaries = await loadInterviewSummaries();
        do {
            const result = await supabaseClient
                .from("call_slips")
                .select("*", { count: "exact" })
                .order("complaint_id", { ascending: false })
                .order("call_number", { ascending: true })
                .order("id", { ascending: true })
                .range(offset, offset + CALL_SLIP_BATCH_SIZE - 1);
            if (result.error) throw result.error;
            if (!Array.isArray(result.data) || !Number.isSafeInteger(result.count) ||
                result.count < 0 || result.data.length > CALL_SLIP_BATCH_SIZE) {
                throw new Error("Invalid call-slip batch returned.");
            }
            if (expectedTotal === null) expectedTotal = result.count;
            if (result.count !== expectedTotal) throw new Error("Call-slip count changed while loading.");
            if (!result.data.length && offset < expectedTotal) {
                throw new Error("Call-slip batch ended before all records were retrieved.");
            }
            for (const record of result.data) {
                if (!record || typeof record !== "object" || Array.isArray(record) ||
                    !["string", "number"].includes(typeof record.id) || !String(record.id).trim() ||
                    (typeof record.id === "number" && !Number.isFinite(record.id))) {
                    throw new Error("Invalid call-slip record returned.");
                }
                const id = String(record.id);
                if (ids.has(id)) throw new Error("Duplicate call-slip record returned.");
                ids.add(id);
                records.push(record);
            }
            offset += result.data.length;
        } while (offset < expectedTotal);
        if (records.length !== expectedTotal || ids.size !== expectedTotal) {
            throw new Error("Incomplete call-slip dataset returned.");
        }
        const groups = buildInterviewGroups(summaries, records);
        complaintGroups = groups;
        allCallSlips = records;
        callSlipsComplete = true;
    } catch (error) {
        console.error("Unable to load complete Call Slips:", error);
        allCallSlips = [];
        callSlipsComplete = false;
        callSlipsLoadError = "Unable to load complete Interview Tracking records. Use Refresh to try again.";
    } finally {
        callSlipsLoading = false;
        refreshButton.disabled = false;
        renderCallSlips();
    }
}


/* =====================================================
   SUMMARY
===================================================== */

function updateSummary(records = getFilteredCallSlips()) {
    if (callSlipsLoading || !callSlipsComplete) {
        [totalCalls, showCount, rescheduleCount, noShowCount].forEach(function (element) {
            element.textContent = callSlipsLoading ? "Loading..." : "Unavailable";
        });
        return;
    }

    totalCalls.textContent =
        records.length;


    const shows =
        records.filter(
            function (item) {

                return (
                    item.interview_status ===
                    "Show"
                );
            }
        ).length;


    const reschedules =
        records.filter(
            function (item) {

                return (
                    item.interview_status ===
                    "Reschedule"
                );
            }
        ).length;


    const noShows =
        records.filter(
            function (item) {

                return (
                    item.interview_status ===
                    "No Show"
                );
            }
        ).length;


    showCount.textContent =
        shows;


    rescheduleCount.textContent =
        reschedules;


    noShowCount.textContent =
        noShows;
}


/* =====================================================
   FILTER CALL SLIPS
===================================================== */

function getFilteredCallSlips() {

    let records =
        allCallSlips.slice();


    const search =
        searchInput.value
            .trim()
            .toLowerCase();


    if (search) {

        records =
            records.filter(
                function (item) {

                    const text =
                        (
                            String(
                                item.student_name ||
                                ""
                            ) +
                            " " +
                            String(
                                item.course_year ||
                                ""
                            ) +
                            " " +
                            String(
                                item.remarks ||
                                ""
                            ) +
                            " " +
                            String(
                                item.received_by ||
                                ""
                            ) +
                            " " +
                            String(
                                item.complaint_id ||
                                ""
                            )
                        ).toLowerCase();


                    return text.includes(
                        search
                    );
                }
            );
    }


    const selectedStatus =
        statusFilter.value;


    if (selectedStatus) {

        records =
            records.filter(
                function (item) {

                    if (
                        selectedStatus ===
                        "Pending"
                    ) {

                        return (
                            !item.interview_status
                        );
                    }


                    return (
                        item.interview_status ===
                        selectedStatus
                    );
                }
            );
    }


    const selectedCallNumber =
        callNumberFilter.value;


    if (selectedCallNumber) {

        records =
            records.filter(
                function (item) {

                    return (
                        Number(
                            item.call_number
                        ) ===
                        Number(
                            selectedCallNumber
                        )
                    );
                }
            );
    }


    return records;
}


/* =====================================================
   GROUP BY COMPLAINT
===================================================== */

function interviewId(value) {
    if (typeof value === "number" && (!Number.isSafeInteger(value) || value <= 0)) throw new Error("Unsafe record ID.");
    if (!["string", "number"].includes(typeof value) || !/^[1-9]\d*$/.test(String(value))) throw new Error("Invalid record ID.");
    return String(value);
}

async function loadInterviewSummaries() {
    const rows = [], ids = new Set();
    let total = null, offset = 0;
    do {
        const result = await supabaseClient.rpc("get_interview_complaint_summaries", {}, {count: "exact"})
            .order("complaint_id", {ascending: false}).range(offset, offset + CALL_SLIP_BATCH_SIZE - 1);
        if (result.error) throw result.error;
        if (!Array.isArray(result.data) || !Number.isSafeInteger(result.count) || result.count < 0 || result.data.length > CALL_SLIP_BATCH_SIZE) throw new Error("Invalid summary batch.");
        if (total === null) total = result.count;
        if (total !== result.count) throw new Error("Summary count changed.");
        if (!result.data.length && offset < total) throw new Error("Premature empty summary batch.");
        for (const row of result.data) {
            if (!row || typeof row.complaint_id !== "string") throw new Error("Invalid summary.");
            const id = interviewId(row.complaint_id);
            if (ids.has(id)) throw new Error("Duplicate summary.");
            if (row.involved_name != null && typeof row.involved_name !== "string") throw new Error("Invalid involved name.");
            ids.add(id); rows.push({complaintId: id, involvedName: row.involved_name?.trim() || ""});
        }
        offset += result.data.length;
    } while (offset < total);
    if (rows.length !== total || ids.size !== total) throw new Error("Incomplete summaries.");
    return rows;
}

function buildInterviewGroups(summaries, calls) {
    const groups = new Map(summaries.map(row => [row.complaintId, {complaintId: row.complaintId, involvedName: row.involvedName, calls: []}]));
    const ids = new Set();
    for (const call of calls) {
        const id = interviewId(call.id), group = groups.get(interviewId(call.complaint_id));
        const number = Number(call.call_number);
        if (ids.has(id) || !group || ![1, 2, 3].includes(number) || group.calls.some(row => Number(row.call_number) === number)) throw new Error("Invalid call association or duplicate call number.");
        ids.add(id); group.calls.push(call);
    }
    for (const group of groups.values()) group.calls.sort((a,b) => Number(a.call_number) - Number(b.call_number));
    return groups;
}

function interviewGroupPerson(group) {
    const namedCall = group.calls.slice().sort((a, b) => Number(a.call_number) - Number(b.call_number))
        .find(call => typeof call.student_name === "string" && call.student_name.trim());
    if (namedCall) return {
        name: namedCall.student_name.trim(),
        courseYear: typeof namedCall.course_year === "string" ? namedCall.course_year.trim() : ""
    };
    return {name: group.involvedName || "", courseYear: ""};
}

function nextInterviewCall(group) {
    return [1, 2, 3].find(number => !group.calls.some(call => Number(call.call_number) === number));
}

function filteredInterviewGroups(records) {
    const ids = new Set(records.map(call => String(call.id)));
    const search = searchInput.value.trim().toLowerCase();
    return Array.from(complaintGroups.values()).map(group => ({...group, calls: group.calls.filter(call => ids.has(String(call.id)))}))
        .filter(group => group.calls.length || (!complaintGroups.get(group.complaintId).calls.length && !statusFilter.value && !callNumberFilter.value && (!search || group.complaintId.includes(search))))
        .sort((a,b) => a.complaintId.length === b.complaintId.length ? (a.complaintId < b.complaintId ? 1 : a.complaintId > b.complaintId ? -1 : 0) : b.complaintId.length - a.complaintId.length);
}

/* =====================================================
   RENDER CALL SLIPS
===================================================== */

function renderCallSlips() {
    if (callSlipsLoading || !callSlipsComplete) {
        updateSummary();
        callSlipRecords.innerHTML = "";
        const message = document.createElement("p");
        message.className = callSlipsLoadError
            ? "rounded-xl bg-red-50 px-4 py-10 text-center text-sm text-red-600"
            : "rounded-xl bg-gray-50 px-4 py-10 text-center text-sm text-gray-500";
        message.textContent = callSlipsLoadError || (callSlipsLoading
            ? "Loading Call Slips..." : "Call Slip records are not loaded.");
        if (callSlipsLoadError) message.setAttribute("role", "alert");
        callSlipRecords.appendChild(message);
        return;
    }

    const records =
        getFilteredCallSlips();

    updateSummary(records);


    callSlipRecords.innerHTML =
        "";


    const visibleGroups = filteredInterviewGroups(records);
    if (!visibleGroups.length) {
        currentCallSlipPage = 1;

        callSlipRecords.innerHTML =
            "<div class=\"rounded-xl bg-gray-50 px-4 py-10 text-center\">" +
                "<p class=\"text-sm text-gray-500\">" +
                    "No complaints match the current filters." +
                "</p>" +
            "</div>";


        return;
    }


    const groups = Object.fromEntries(visibleGroups.map(group => [group.complaintId, group.calls]));
    const complaintIds = visibleGroups.map(group => group.complaintId);

    const wrapper =
        document.createElement(
            "div"
        );


    wrapper.className =
        "space-y-5";


    const pageCount = Math.max(1, Math.ceil(complaintIds.length / CALL_SLIP_GROUP_PAGE_SIZE));
    currentCallSlipPage = Math.min(Math.max(1, currentCallSlipPage), pageCount);
    const start = (currentCallSlipPage - 1) * CALL_SLIP_GROUP_PAGE_SIZE;
    const pageComplaintIds = complaintIds.slice(start, start + CALL_SLIP_GROUP_PAGE_SIZE);

    pageComplaintIds.forEach(
        function (complaintId) {

            const group =
                createComplaintGroup(
                    complaintId,
                    groups[
                        complaintId
                    ]
                );


            wrapper.appendChild(
                group
            );
        }
    );


    callSlipRecords.appendChild(
        wrapper
    );
    renderCallSlipPagination(complaintIds.length, pageCount, start);
}


function resetCallSlipPage() {
    currentCallSlipPage = 1;
    renderCallSlips();
}

function renderCallSlipPagination(totalGroups, pageCount, start) {
    const controls = document.createElement("div");
    controls.className = "mt-4 flex flex-wrap items-center justify-between gap-3";
    controls.setAttribute("aria-label", "Call Slip pagination");
    const label = document.createElement("p");
    label.className = "text-sm text-gray-600";
    label.textContent = "Showing " + (start + 1) + "-" +
        Math.min(start + CALL_SLIP_GROUP_PAGE_SIZE, totalGroups) +
        " of " + totalGroups + " complaints | Page " + currentCallSlipPage + " of " + pageCount;
    controls.appendChild(label);
    const buttons = document.createElement("div");
    buttons.className = "flex gap-2";
    [["Previous", -1], ["Next", 1]].forEach(function ([text, direction]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.className = "rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-50";
        button.disabled = direction < 0 ? currentCallSlipPage === 1 : currentCallSlipPage === pageCount;
        button.addEventListener("click", function () {
            currentCallSlipPage += direction;
            renderCallSlips();
        });
        buttons.appendChild(button);
    });
    controls.appendChild(buttons);
    callSlipRecords.appendChild(controls);
}


/* =====================================================
   COMPLAINT GROUP
===================================================== */

function createComplaintGroup(
    complaintId,
    calls
) {

    const group =
        document.createElement(
            "div"
        );


    group.className =
        "overflow-hidden rounded-xl border border-gray-200";


    const header =
        document.createElement(
            "div"
        );


    header.className =
        "flex flex-col gap-2 bg-[#F3F7F3] px-5 py-4 md:flex-row md:items-center md:justify-between";


    const left =
        document.createElement(
            "div"
        );


    const title =
        document.createElement(
            "h4"
        );


    title.className =
        "text-sm font-bold text-gray-900";


    title.textContent =
        "Complaint #" +
        complaintId;


    const student =
        document.createElement(
            "p"
        );


    student.className =
        "mt-1 text-xs text-gray-500";


    const person = interviewGroupPerson(complaintGroups.get(complaintId));
    student.textContent = (person.name || "Student/person not specified") +
        (person.courseYear ? " ? " + person.courseYear : "");


    left.appendChild(
        title
    );


    left.appendChild(
        student
    );


    const count =
        document.createElement(
            "span"
        );


    count.className =
        "rounded-full bg-white px-3 py-1 text-xs font-bold text-[#006B21]";


    count.textContent =
        complaintGroups.get(complaintId).calls.length +
        (
            complaintGroups.get(complaintId).calls.length === 1
                ? " Call"
                : " Calls"
        );


    header.appendChild(
        left
    );


    header.appendChild(
        count
    );


    group.appendChild(
        header
    );


    const callContainer =
        document.createElement(
            "div"
        );


    callContainer.className =
        "divide-y divide-gray-100";


    calls.sort(
        function (a, b) {

            return (
                Number(
                    a.call_number
                ) -
                Number(
                    b.call_number
                )
            );
        }
    );


    calls.forEach(
        function (call) {

            callContainer.appendChild(
                createCallRow(
                    call
                )
            );
        }
    );


    const canonical = complaintGroups.get(complaintId);
    if (!canonical.calls.length) {
        const empty = document.createElement("p");
        empty.className = "p-5 text-sm text-gray-500";
        empty.textContent = "No calls yet";
        callContainer.appendChild(empty);
    }
    const actions = document.createElement("div");
    actions.className = "p-5";
    const next = nextInterviewCall(canonical);
    if (next) {
        const add = document.createElement("button");
        add.type = "button";
        add.className = "rounded-lg bg-[#F5C400] px-4 py-2.5 text-sm font-semibold text-gray-900";
        add.textContent = "Add " + getCallNumberLabel(next);
        add.disabled = interviewSaving;
        add.addEventListener("click", () => openInterviewCall(complaintId, add));
        actions.appendChild(add);
    } else {
        actions.className += " text-sm text-gray-500";
        actions.textContent = "All calls recorded.";
    }
    callContainer.appendChild(actions);

    group.appendChild(
        callContainer
    );


    return group;
}


/* =====================================================
   CALL ROW
===================================================== */

function createCallRow(
    call
) {

    const row =
        document.createElement(
            "div"
        );


    row.className =
        "p-5";


    const top =
        document.createElement(
            "div"
        );


    top.className =
        "flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between";


    const left =
        document.createElement(
            "div"
        );


    left.className =
        "flex-1";


    const callTitle =
        document.createElement(
            "div"
        );


    callTitle.className =
        "flex flex-wrap items-center gap-2";


    const callBadge =
        document.createElement(
            "span"
        );


    callBadge.className =
        "rounded-full bg-[#006B21] px-3 py-1 text-xs font-bold text-white";


    callBadge.textContent =
        getCallNumberLabel(
            call.call_number
        );


    const date =
        document.createElement(
            "span"
        );


    date.className =
        "text-xs font-medium text-gray-400";


    date.textContent =
        formatDate(
            call.date
        );


    callTitle.appendChild(
        callBadge
    );


    callTitle.appendChild(
        date
    );


    const historyButton = document.createElement("button");
    historyButton.type = "button";
    historyButton.className = "rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-[#006B21] hover:bg-green-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2";
    historyButton.textContent = "Status History";
    historyButton.addEventListener("click", () => openCallHistory(call, historyButton));
    callTitle.appendChild(historyButton);

    left.appendChild(
        callTitle
    );


    const schedule =
        document.createElement(
            "p"
        );


    schedule.className =
        "mt-3 text-sm font-semibold text-gray-800";


    schedule.textContent =
        call.schedule_type ||
        "Schedule not specified";


    left.appendChild(
        schedule
    );


    if (
        call.scheduled_date ||
        call.scheduled_time
    ) {

        const scheduleDetails =
            document.createElement(
                "p"
            );


        scheduleDetails.className =
            "mt-1 text-sm text-gray-500";


        let text = "";


        if (
            call.scheduled_date
        ) {

            text +=
                formatDate(
                    call.scheduled_date
                );
        }


        if (
            call.scheduled_time
        ) {

            if (text) {

                text += " • ";
            }


            text +=
                formatTime(
                    call.scheduled_time
                );
        }


        scheduleDetails.textContent =
            text;


        left.appendChild(
            scheduleDetails
        );
    }


    if (call.remarks) {

        const remarks =
            document.createElement(
                "p"
            );


        remarks.className =
            "mt-2 text-xs text-gray-500";


        remarks.textContent =
            "Remarks: " +
            call.remarks;


        left.appendChild(
            remarks
        );
    }


    if (call.received_by) {

        const received =
            document.createElement(
                "p"
            );


        received.className =
            "mt-1 text-xs text-gray-400";


        received.textContent =
            "Received by: " +
            call.received_by;


        left.appendChild(
            received
        );
    }


    const right =
        document.createElement(
            "div"
        );


    right.className =
        "w-full lg:w-48";


    const label =
        document.createElement(
            "label"
        );


    label.className =
        "mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400";


    label.textContent =
        "Interview Status";

    const statusSelect = document.createElement("select");

    statusSelect.style.width = "100%";
    statusSelect.style.boxSizing = "border-box";

    statusSelect.className =
    "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#006B21] focus:ring-2 focus:ring-green-100";

    const pendingOption =
        document.createElement(
            "option"
        );


    pendingOption.value =
        "";


    pendingOption.textContent =
        "Pending";


    if (!call.interview_status) {

        pendingOption.selected =
            true;
    }


    statusSelect.appendChild(
        pendingOption
    );


    [
        "Show",
        "Reschedule",
        "No Show"
    ].forEach(
        function (status) {

            const option =
                document.createElement(
                    "option"
                );


            option.value =
                status;


            option.textContent =
                status;


            if (
                call.interview_status ===
                status
            ) {

                option.selected =
                    true;
            }


            statusSelect.appendChild(
                option
            );
        }
    );


    statusSelect.disabled = callSlipMutations.has(String(call.id));
    statusSelect.addEventListener(
        "change",
        async function () {

            const newStatus =
                statusSelect.value;


            if (
                newStatus ===
                "Reschedule"
            ) {

                openRescheduleModal(
                    call
                );


                statusSelect.value =
                    call.interview_status ||
                    "";


                return;
            }


            await updateInterviewStatus(
                call.id,
                newStatus,
                statusSelect
            );
        }
    );


    right.appendChild(
        label
    );


    right.appendChild(
        statusSelect
    );


    top.appendChild(
        left
    );


    top.appendChild(
        right
    );


    row.appendChild(
        top
    );


    return row;
}


/* =====================================================
   UPDATE INTERVIEW STATUS
===================================================== */

async function updateInterviewStatus(callSlipId, newStatus, control) {
    const key = String(callSlipId);
    const record = allCallSlips.find(item => String(item.id) === key);
    if (callSlipMutations.has(key) || !record) return;
    const previous = record.interview_status;
    const status = newStatus || null;
    callSlipMutations.add(key);
    if (control) control.disabled = true;
    try {
        const result = await supabaseClient.from("call_slips").update({interview_status: status})
            .eq("id", callSlipId).select("id, interview_status").single();
        if (result.error || !result.data || String(result.data.id) !== key || result.data.interview_status !== status) {
            throw new Error("Update not confirmed.");
        }
        const current = allCallSlips.find(item => String(item.id) === key);
        if (current) current.interview_status = status;
        showStatusNotification();
    } catch (_) {
        if (control) control.value = previous || "";
        alert("Status change could not be confirmed. Refresh to verify before trying again.");
    } finally {
        callSlipMutations.delete(key);
        if (control) control.disabled = false;
        renderCallSlips();
    }
}



/* =====================================================
   RESCHEDULE
===================================================== */

function openRescheduleModal(
    call
) {
    if (isSavingReschedule || callSlipMutations.has(String(call.id))) return;

    selectedCallSlipId =
        call.id;


    newScheduledDate.value =
        call.scheduled_date ||
        "";


    newScheduledTime.value =
        call.scheduled_time ||
        "";


    rescheduleRemarks.value =
        call.remarks ||
        "";


    rescheduleModal
        .classList
        .remove(
            "hidden"
        );


    rescheduleModal
        .classList
        .add(
            "flex"
        );
}


function closeReschedule() {
    if (isSavingReschedule) return;

    selectedCallSlipId =
        null;


    rescheduleForm.reset();


    rescheduleModal
        .classList
        .add(
            "hidden"
        );


    rescheduleModal
        .classList
        .remove(
            "flex"
        );
}


async function saveReschedule(event) {
    event.preventDefault();
    const id = selectedCallSlipId;
    const key = String(id);
    if (isSavingReschedule || !id || callSlipMutations.has(key) || !rescheduleForm.reportValidity()) return;
    const payload = {
        scheduled_date: newScheduledDate.value,
        scheduled_time: newScheduledTime.value,
        remarks: rescheduleRemarks.value.trim() || null,
        interview_status: "Reschedule"
    };
    const controls = Array.from(rescheduleForm.querySelectorAll("input, select, textarea, button"));
    const states = controls.map(field => field.disabled);
    const save = rescheduleForm.querySelector('[type="submit"]');
    const label = save ? save.textContent : "";
    isSavingReschedule = true;
    callSlipMutations.add(key);
    controls.forEach(field => { field.disabled = true; });
    if (save) save.textContent = "Saving...";
    let confirmed = false;
    try {
        const result = await supabaseClient.from("call_slips").update(payload)
            .eq("id", id).select("id, interview_status, scheduled_date, scheduled_time, remarks").single();
        if (result.error || !result.data || String(result.data.id) !== key || result.data.interview_status !== "Reschedule") {
            throw new Error("Update not confirmed.");
        }
        confirmed = true;
        // A successful write stays successful even when its subsequent read fails.
        try {
            await loadCallSlips();
            if (!callSlipsComplete || callSlipsLoadError) throw new Error("Refresh failed.");
            showStatusNotification();
        } catch (_) {
            alert("Reschedule saved, but the view could not be refreshed. Use Refresh to reload the records.");
        }
    } catch (_) {
        alert("Reschedule could not be confirmed. Refresh to verify before saving again.");
    } finally {
        isSavingReschedule = false;
        callSlipMutations.delete(key);
        controls.forEach((field, i) => { field.disabled = states[i]; });
        if (save) save.textContent = label;
        if (confirmed && selectedCallSlipId === id) closeReschedule();
        if (callSlipsComplete) renderCallSlips();
    }
}


/* =====================================================
   HELPERS
===================================================== */

function getCallNumberLabel(
    number
) {

    if (
        Number(number) === 1
    ) {

        return "1st Call";
    }


    if (
        Number(number) === 2
    ) {

        return "2nd Call";
    }


    if (
        Number(number) === 3
    ) {

        return "3rd Call";
    }


    return "Call";
}


function formatDate(
    value
) {

    if (!value) {

        return "—";
    }


    const date =
        new Date(
            value +
            "T00:00:00"
        );


    return date.toLocaleDateString(
        "en-PH",
        {
            year: "numeric",
            month: "short",
            day: "numeric"
        }
    );
}


function formatTime(
    value
) {

    if (!value) {

        return "—";
    }


    const parts =
        value.split(":");


    let hour =
        Number(
            parts[0]
        );


    const minute =
        parts[1] || "00";


    const period =
        hour >= 12
            ? "PM"
            : "AM";


    hour =
        hour % 12;


    if (hour === 0) {

        hour = 12;
    }


    return (
        hour +
        ":" +
        minute +
        " " +
        period
    );
}


/* =====================================================
   EVENTS
===================================================== */

searchInput.addEventListener(
    "input",
    resetCallSlipPage
);


statusFilter.addEventListener(
    "change",
    resetCallSlipPage
);


callNumberFilter.addEventListener(
    "change",
    resetCallSlipPage
);


refreshButton.addEventListener(
    "click",
    loadCallSlips
);


rescheduleForm.addEventListener(
    "submit",
    saveReschedule
);


closeRescheduleModal.addEventListener(
    "click",
    closeReschedule
);


cancelReschedule.addEventListener(
    "click",
    closeReschedule
);


rescheduleModal.addEventListener(
    "click",
    function (event) {

        if (
            event.target ===
            rescheduleModal
        ) {

            closeReschedule();
        }
    }
);


document.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key === "Escape"
        ) {

            closeReschedule();
        }
    }
);


logoutButton.addEventListener(
    "click",
    async function () {

        await logout();
    }
);


/* =====================================================
   INITIALIZE
===================================================== */

async function initialize() {
    callSlipsLoading = true;
    callSlipsComplete = false;
    refreshButton.disabled = true;
    renderCallSlips();
    showPageStatus("Loading account and records...");
    try {
        if (!await loadProfile()) throw new Error("Account unavailable.");

        callSlipsLoading = false;
        showPageStatus("");
        await loadCallSlips();
    } catch (error) {
        callSlipsLoading = false;
        callSlipsLoadError = safeNetworkMessage(error);
        showPageStatus(callSlipsLoadError);
        renderCallSlips();
        // Reload reruns authorization and required initialization before data access.
        refreshButton.disabled = true;
    }
}


initialize();