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


    if (
        userResult.error ||
        !userResult.data.user
    ) {

        window.location.href =
            "../index.html";

        return false;
    }


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


    if (profileResult.error) {

        console.error(
            "Unable to load profile:",
            profileResult.error
        );

        return false;
    }


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


/* =====================================================
   LOAD CALL SLIPS
===================================================== */

async function loadCallSlips() {
    if (callSlipsLoading) return;
    callSlipsLoading = true;
    callSlipsComplete = false;
    callSlipsLoadError = null;
    allCallSlips = [];
    currentCallSlipPage = 1;
    refreshButton.disabled = true;
    renderCallSlips();
    const records = [];
    const ids = new Set();
    let expectedTotal = null;
    let offset = 0;
    try {
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
        allCallSlips = records;
        callSlipsComplete = true;
    } catch (error) {
        console.error("Unable to load complete Call Slips:", error);
        allCallSlips = [];
        callSlipsComplete = false;
        callSlipsLoadError = "Unable to load complete Call Slip records. Use Refresh to try again.";
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
            element.textContent = "Unavailable";
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

function groupByComplaint(
    records
) {

    const groups = {};


    records.forEach(
        function (item) {

            const complaintId =
                String(
                    item.complaint_id
                );


            if (!groups[complaintId]) {

                groups[complaintId] =
                    [];
            }


            groups[
                complaintId
            ].push(
                item
            );
        }
    );


    return groups;
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


    if (
        records.length === 0
    ) {
        currentCallSlipPage = 1;

        callSlipRecords.innerHTML =
            "<div class=\"rounded-xl bg-gray-50 px-4 py-10 text-center\">" +
                "<p class=\"text-sm text-gray-500\">" +
                    "No Call Slip records found." +
                "</p>" +
            "</div>";


        return;
    }


    const groups =
        groupByComplaint(
            records
        );


    const complaintIds =
        Object.keys(
            groups
        ).sort(
            function (a, b) {

                return (
                    Number(b) -
                    Number(a)
                );
            }
        );


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


    const firstCall =
        calls[0];


    student.textContent =
        (
            firstCall.student_name ||
            "Student not specified"
        ) +
        (
            firstCall.course_year
                ? " • " +
                  firstCall.course_year
                : ""
        );


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
        calls.length +
        (
            calls.length === 1
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


    const statusSelect =
        document.createElement(
            "select"
        );


    statusSelect.className =
        "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#006B21] focus:ring-2 focus:ring-green-100";


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
                newStatus
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

async function updateInterviewStatus(
    callSlipId,
    newStatus
) {

    const statusValue =
        newStatus ||
        null;


    const result =
        await supabaseClient
            .from("call_slips")
            .update({
                interview_status:
                    statusValue
            })
            .eq(
                "id",
                callSlipId
            );


    if (result.error) {

        console.error(
            "Unable to update interview status:",
            result.error
        );


        alert(
            "Unable to update interview status."
        );


        await loadCallSlips();


        return;
    }


    const record =
        allCallSlips.find(
            function (item) {

                return (
                    item.id ===
                    callSlipId
                );
            }
        );


    if (record) {

    record.interview_status =
        statusValue;
}


updateSummary();

renderCallSlips();

showStatusNotification();
}


/* =====================================================
   RESCHEDULE
===================================================== */

function openRescheduleModal(
    call
) {

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


async function saveReschedule(
    event
) {

    event.preventDefault();


    if (!selectedCallSlipId) {

        return;
    }


    const result =
        await supabaseClient
            .from("call_slips")
            .update({

                scheduled_date:
                    newScheduledDate.value,

                scheduled_time:
                    newScheduledTime.value,

                remarks:
                    rescheduleRemarks
                        .value
                        .trim() ||
                    null,

                interview_status:
                    "Reschedule"
            })
            .eq(
                "id",
                selectedCallSlipId
            );


    if (result.error) {

        console.error(
            "Unable to reschedule interview:",
            result.error
        );


        alert(
            "Unable to reschedule interview."
        );


        return;
    }


    closeReschedule();

await loadCallSlips();

showStatusNotification();
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

    const loaded =
        await loadProfile();


    if (!loaded) {

        return;
    }


    await loadCallSlips();
}


initialize();