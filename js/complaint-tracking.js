let trackingInitReady = false;
const complaintMutations = new Set();
let isSavingTrackingCallSlip = false;
const passkeySection =
    document.getElementById("passkeySection");

const trackingContent =
    document.getElementById("trackingContent");

const passkeyForm =
    document.getElementById("passkeyForm");

const passkeyInput =
    document.getElementById("passkeyInput");

const passkeyMessage =
    document.getElementById("passkeyMessage");

const unlockButton =
    document.getElementById("unlockButton");

const lockButton =
    document.getElementById("lockButton");

const complaintRecords =
    document.getElementById("complaintRecords");

const searchInput =
    document.getElementById("searchInput");

const statusFilter =
    document.getElementById("statusFilter");

const userName =
    document.getElementById("userName");

const logoutButton =
    document.getElementById("logoutButton");

const complaintsNav =
    document.getElementById("complaintsNav");

const complaintTrackingNav =
    document.getElementById("complaintTrackingNav");

const interviewTrackingNav =
    document.getElementById("interviewTrackingNav");


const callSlipModal =
    document.getElementById("callSlipModal");

const callSlipForm =
    document.getElementById("callSlipForm");

const closeCallSlipModal =
    document.getElementById("closeCallSlipModal");

const cancelCallSlip =
    document.getElementById("cancelCallSlip");

const callStudentName =
    document.getElementById("callStudentName");

const callCourseYear =
    document.getElementById("callCourseYear");

const callDate =
    document.getElementById("callDate");

const callNumber =
    document.getElementById("callNumber");

const scheduleType =
    document.getElementById("scheduleType");

const scheduledDate =
    document.getElementById("scheduledDate");

const scheduledTime =
    document.getElementById("scheduledTime");

const callRemarks =
    document.getElementById("callRemarks");


let currentProfile = null;

const fullDetailsModal = document.getElementById("fullDetailsModal");
const fullDetailsContent = document.getElementById("fullDetailsContent");
const closeFullDetailsModal = document.getElementById("closeFullDetailsModal");
let selectedDetailsComplaint = null;
let detailsReturnFocus = null;
let detailsPreviousBodyOverflow = null;
let detailsPreviousRootOverflow = null;

function closeFullDetails(restoreFocus = true) {
    if (detailsPreviousBodyOverflow !== null) {
        document.body.style.overflow = detailsPreviousBodyOverflow;
        document.documentElement.style.overflow = detailsPreviousRootOverflow;
        detailsPreviousBodyOverflow = null;
        detailsPreviousRootOverflow = null;
    }
    fullDetailsModal.classList.add("hidden");
    fullDetailsModal.classList.remove("flex");
    fullDetailsContent.replaceChildren();
    selectedDetailsComplaint = null;
    const previousFocus = detailsReturnFocus;
    detailsReturnFocus = null;
    if (restoreFocus && previousFocus && previousFocus.isConnected) previousFocus.focus();
}

function complaintDetailValue(value) {
    return value === null || value === undefined || !String(value).trim()
        ? "Not provided" : String(value);
}

function formatIncidentDatetime(value) {
    if (complaintDetailValue(value) === "Not provided") return "Not provided";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Not provided";
    return date.toLocaleString("en-PH", {
        timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true
    });
}

function openFullDetails(complaint, trigger) {
    if (!currentProfile || currentProfile.role !== "oswe_admin" || !currentPasskey ||
        complaintsLoading || !complaintsComplete) return;
    const loadedComplaint = allComplaints.find(item => item.id === complaint.id);
    if (!loadedComplaint) return;
    closeFullDetails(false);
    selectedDetailsComplaint = loadedComplaint;
    detailsReturnFocus = trigger;
    const fields = [
        ["What", loadedComplaint.what_happened],
        ["Who", loadedComplaint.who_involved],
        ["When", formatIncidentDatetime(loadedComplaint.incident_datetime)],
        ["Where", loadedComplaint.location],
        ["How", loadedComplaint.how_happened],
        ["Other Details", loadedComplaint.other_details],
        ["Complainant Name", loadedComplaint.complainant_name],
        ["Course / Year / Major", loadedComplaint.complainant_course_year_major],
        ["Student ID", loadedComplaint.complainant_student_id],
        ["Address", loadedComplaint.complainant_address],
        ["Residence Telephone", loadedComplaint.complainant_residence_tel],
        ["Cellphone Number", loadedComplaint.complainant_cellphone],
        ["Date Reported", loadedComplaint.date_reported ? formatDate(loadedComplaint.date_reported) : null],
        ["Received By", loadedComplaint.received_by],
        ["Complaint Status", loadedComplaint.complaint_status]
    ];
    for (const [label, value] of fields) {
        const detail = detailItem(label, complaintDetailValue(value));
        detail.classList.add("mb-3", "whitespace-pre-wrap", "break-words");
        fullDetailsContent.appendChild(detail);
    }
    fullDetailsModal.classList.remove("hidden");
    fullDetailsModal.classList.add("flex");
    detailsPreviousBodyOverflow = document.body.style.overflow;
    detailsPreviousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    closeFullDetailsModal.focus();
}

closeFullDetailsModal.addEventListener("click", () => closeFullDetails());
fullDetailsModal.addEventListener("click", event => {
    if (event.target === fullDetailsModal) closeFullDetails();
});
document.addEventListener("keydown", event => {
    if (fullDetailsModal.classList.contains("hidden")) return;
    if (event.key === "Escape") {
        event.preventDefault();
        closeFullDetails();
    } else if (event.key === "Tab") {
        event.preventDefault();
        if (document.activeElement === closeFullDetailsModal) fullDetailsContent.focus();
        else closeFullDetailsModal.focus();
    }
});

const complaintHistoryModal = document.getElementById("complaintHistoryModal");
const complaintHistoryContent = document.getElementById("complaintHistoryContent");
const closeComplaintHistoryModal = document.getElementById("closeComplaintHistoryModal");
let complaintHistoryRequestToken = 0;
let complaintHistoryReturnFocus = null;
let complaintHistoryPreviousOverflow = null;

function closeComplaintHistory(restoreFocus = true) {
    complaintHistoryRequestToken++;
    complaintHistoryModal.classList.add("hidden");
    complaintHistoryModal.classList.remove("flex");
    complaintHistoryContent.replaceChildren();
    if (complaintHistoryPreviousOverflow !== null) {
        document.body.style.overflow = complaintHistoryPreviousOverflow;
        complaintHistoryPreviousOverflow = null;
    }
    const trigger = complaintHistoryReturnFocus;
    complaintHistoryReturnFocus = null;
    if (restoreFocus && trigger && trigger.isConnected) trigger.focus();
}

function showComplaintHistoryMessage(text, error = false) {
    complaintHistoryContent.replaceChildren();
    const message = document.createElement("p");
    message.className = error ? "text-sm text-red-600" : "text-sm text-gray-500";
    if (error) message.setAttribute("role", "alert");
    message.textContent = text;
    complaintHistoryContent.appendChild(message);
}

function renderComplaintHistory(records) {
    complaintHistoryContent.replaceChildren();
    if (!records.length) {
        showComplaintHistoryMessage("No status history available.");
        return;
    }
    const labels = { baseline: "Baseline recorded", created: "Record created", status_changed: "Status changed" };
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
        transition.textContent = displayText(record.previous_status, "Not recorded") + " → " +
            displayText(record.new_status, "Not recorded");
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
        entry.appendChild(actor);
        entry.appendChild(time);
        complaintHistoryContent.appendChild(entry);
    }
}

async function openComplaintHistory(complaint, trigger) {
    if (!currentProfile || currentProfile.role !== "oswe_admin" || !currentPasskey ||
        complaintsLoading || !complaintsComplete || !allComplaints.some(record => record.id === complaint.id)) return;
    closeComplaintHistory(false);
    const token = ++complaintHistoryRequestToken;
    const sessionToken = complaintRequestToken;
    const isCurrent = () => token === complaintHistoryRequestToken && sessionToken === complaintRequestToken &&
        currentProfile && currentProfile.role === "oswe_admin" && !!currentPasskey &&
        !complaintsLoading && complaintsComplete;
    complaintHistoryReturnFocus = trigger;
    complaintHistoryPreviousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    complaintHistoryModal.classList.remove("hidden");
    complaintHistoryModal.classList.add("flex");
    showComplaintHistoryMessage("Loading...");
    closeComplaintHistoryModal.focus();
    const records = [];
    const ids = new Set();
    let expectedTotal = null;
    let offset = 0;
    try {
        do {
            if (!isCurrent()) return;
            const result = await supabaseClient.rpc("get_complaint_status_history_with_passkey",
                { entered_passkey: currentPasskey, complaint_id: complaint.id }, { count: "exact" })
                .order("changed_at", { ascending: false })
                .order("id", { ascending: false })
                .range(offset, offset + COMPLAINT_BATCH_SIZE - 1);
            if (!isCurrent()) return;
            if (result.error) throw result.error;
            if (!Array.isArray(result.data) || !Number.isSafeInteger(result.count) ||
                result.count < 0 || result.data.length > COMPLAINT_BATCH_SIZE) {
                throw new Error("Invalid status history batch.");
            }
            if (expectedTotal === null) expectedTotal = result.count;
            if (result.count !== expectedTotal) throw new Error("Status history count changed while loading.");
            if (!result.data.length && offset < expectedTotal) throw new Error("Premature empty status history batch.");
            for (const record of result.data) {
                if (!record || typeof record !== "object" || Array.isArray(record) ||
                    !["string", "number"].includes(typeof record.id) || !String(record.id).trim() ||
                    (typeof record.id === "number" && !Number.isFinite(record.id)) ||
                    String(record.complaint_id) !== String(complaint.id)) {
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
        if (isCurrent()) renderComplaintHistory(records);
    } catch (error) {
        if (!isCurrent()) return;
        showComplaintHistoryMessage("Failed to load status history.", true);
    }
}

closeComplaintHistoryModal.addEventListener("click", () => closeComplaintHistory());
complaintHistoryModal.addEventListener("click", event => {
    if (event.target === complaintHistoryModal) closeComplaintHistory();
});
document.addEventListener("keydown", event => {
    if (complaintHistoryModal.classList.contains("hidden")) return;
    if (event.key === "Escape") {
        event.preventDefault();
        closeComplaintHistory();
    } else if (event.key === "Tab") {
        event.preventDefault();
        if (document.activeElement === closeComplaintHistoryModal) complaintHistoryContent.focus();
        else closeComplaintHistoryModal.focus();
    }
});



let currentPasskey = "";

let allComplaints = [];

let selectedComplaintId = null;
const COMPLAINT_BATCH_SIZE = 500;
const COMPLAINT_PAGE_SIZE = 25;
let complaintsLoading = false;
let complaintsComplete = false;
let complaintsLoadError = null;
let complaintRequestToken = 0;
let currentComplaintPage = 1;

function restoreUnlockControl() {
    unlockButton.disabled = !trackingInitReady;
    unlockButton.textContent = "Unlock Complaint Tracking";
}


async function loadProfile() {

    const userResult =
        await supabaseClient.auth.getUser();


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


    if (
        currentProfile.role !==
        "oswe_admin"
    ) {

        window.location.href =
            "dashboard.html";

        return false;
    }


    userName.textContent =
        currentProfile.full_name;


    complaintsNav.classList.remove(
        "hidden"
    );

    complaintsNav.classList.add(
        "flex"
    );


    complaintTrackingNav.classList.remove(
        "hidden"
    );

    complaintTrackingNav.classList.add(
        "flex"
    );


    interviewTrackingNav.classList.remove(
        "hidden"
    );

    interviewTrackingNav.classList.add(
        "flex"
    );


    return true;
}


async function unlockComplaints(event) {
    event.preventDefault();
    if (complaintsLoading) return;
    if (!trackingInitReady) { showPageStatus("Complaint Tracking is unavailable. Reload to try again."); return; }
    const passkey = passkeyInput.value.trim();
    if (!passkey) return;
    closeComplaintHistory(false);
    closeFullDetails(false);
    const token = ++complaintRequestToken;
    resetComplaintReport();
    const isCurrent = () => token === complaintRequestToken;
    complaintsLoading = true;
    complaintsComplete = false;
    complaintsLoadError = null;
    allComplaints = [];
    currentPasskey = "";
    currentComplaintPage = 1;
    complaintRecords.innerHTML = "";
    trackingContent.classList.add("hidden");
    passkeySection.classList.remove("hidden");
    passkeyMessage.classList.add("hidden");
    unlockButton.disabled = true;
    unlockButton.textContent = "Loading...";
    const records = [];
    const ids = new Set();
    let expectedTotal = null;
    let offset = 0;
    try {
        do {
            if (!isCurrent()) return;
            const result = await supabaseClient.rpc("get_complaints_with_passkey",
                { entered_passkey: passkey }, { count: "exact" })
                .order("date_reported", { ascending: false })
                .order("created_at", { ascending: false, nullsFirst: true })
                .order("id", { ascending: false })
                .range(offset, offset + COMPLAINT_BATCH_SIZE - 1);
            if (!isCurrent()) return;
            if (result.error) throw result.error;
            if (!Array.isArray(result.data) || !Number.isSafeInteger(result.count) ||
                result.count < 0 || result.data.length > COMPLAINT_BATCH_SIZE) {
                throw new Error("Invalid complaint batch returned.");
            }
            if (expectedTotal === null) expectedTotal = result.count;
            if (result.count !== expectedTotal) throw new Error("Complaint count changed while loading.");
            if (!result.data.length && offset < expectedTotal) throw new Error("Premature empty complaint batch.");
            for (const record of result.data) {
                if (!record || typeof record !== "object" || Array.isArray(record) ||
                    !["string", "number"].includes(typeof record.id) || !String(record.id).trim() ||
                    (typeof record.id === "number" && !Number.isFinite(record.id))) {
                    throw new Error("Invalid complaint record returned.");
                }
                const id = String(record.id);
                if (ids.has(id)) throw new Error("Duplicate complaint ID returned.");
                ids.add(id);
                records.push(record);
            }
            offset += result.data.length;
        } while (offset < expectedTotal);
        if (records.length !== expectedTotal || ids.size !== expectedTotal) {
            throw new Error("Incomplete complaint dataset returned.");
        }
        allComplaints = records;
        currentPasskey = passkey;
        complaintsComplete = true;
        passkeyInput.value = "";
        passkeySection.classList.add("hidden");
        trackingContent.classList.remove("hidden");
    } catch (error) {
        if (!isCurrent()) return;
        resetComplaintReport();
        // Do not log the RPC response, which may contain sensitive details.
        allComplaints = [];
        currentPasskey = "";
        complaintsComplete = false;
        complaintsLoadError = "Unable to load complete complaint records. Check your passkey and try unlocking again.";
        trackingContent.classList.add("hidden");
        passkeySection.classList.remove("hidden");
        complaintRecords.innerHTML = "";
        passkeyMessage.textContent = complaintsLoadError;
        passkeyMessage.classList.remove("hidden");
    } finally {
        if (isCurrent()) {
            complaintsLoading = false;
            restoreUnlockControl();
            renderComplaints();
            if (complaintsComplete && currentPasskey) void loadComplaintReportSources();
        }
    }
}


function lockComplaints() {
    closeComplaintHistory(false);
    closeFullDetails(false);
    complaintRequestToken++;
    resetComplaintReport();
    complaintsLoading = false;
    complaintsComplete = false;
    complaintsLoadError = null;
    currentComplaintPage = 1;
    restoreUnlockControl();
    closeCallSlip();
    passkeyInput.value = "";
    passkeyMessage.textContent = "";
    passkeyMessage.classList.add("hidden");

    currentPasskey =
        "";

    allComplaints =
        [];


    trackingContent.classList.add(
        "hidden"
    );


    passkeySection.classList.remove(
        "hidden"
    );


    complaintRecords.innerHTML =
        "";
}


function getFilteredComplaints() {

    const search =
        searchInput.value
            .trim()
            .toLowerCase();


    const status =
        statusFilter.value;


    return allComplaints.filter(
        function (complaint) {

            const text =
                (
                    String(
                        complaint.complainant_name ||
                        ""
                    ) +
                    " " +
                    String(
                        complaint.what_happened ||
                        ""
                    ) +
                    " " +
                    String(
                        complaint.who_involved ||
                        ""
                    )
                ).toLowerCase();


            const matchesSearch =
                !search ||
                text.includes(
                    search
                );


            const matchesStatus =
                !status ||
                complaint.complaint_status ===
                    status;


            return (
                matchesSearch &&
                matchesStatus
            );
        }
    );
}


function renderComplaints() {
    if (complaintsLoading || !complaintsComplete || !currentPasskey) {
        complaintRecords.innerHTML = "";
        return;
    }

    const records =
        getFilteredComplaints();

    const pageCount = Math.max(1, Math.ceil(records.length / COMPLAINT_PAGE_SIZE));
    currentComplaintPage = Math.min(Math.max(1, currentComplaintPage), pageCount);


    complaintRecords.innerHTML =
        "";


    if (
        records.length === 0
    ) {

        complaintRecords.innerHTML =
            "<div class=\"rounded-2xl bg-white p-8 text-center shadow-sm\">" +
                "<p class=\"text-sm text-gray-500\">" +
                    "No complaint records found." +
                "</p>" +
            "</div>";

        return;
    }


    records.slice((currentComplaintPage - 1) * COMPLAINT_PAGE_SIZE, currentComplaintPage * COMPLAINT_PAGE_SIZE).forEach(
        function (complaint) {

            complaintRecords.appendChild(
                createComplaintCard(
                    complaint
                )
            );
        }
    );
    renderComplaintPagination(records.length, pageCount);
}


function resetComplaintPage() {
    currentComplaintPage = 1;
    renderComplaints();
}

function renderComplaintPagination(total, pageCount) {
    const controls = document.createElement("div");
    controls.className = "mt-4 flex flex-wrap items-center justify-between gap-3";
    controls.setAttribute("aria-label", "Complaint pagination");
    const label = document.createElement("p");
    label.className = "text-sm text-gray-600";
    label.textContent = "Showing " + ((currentComplaintPage - 1) * COMPLAINT_PAGE_SIZE + 1) + "-" +
        Math.min(currentComplaintPage * COMPLAINT_PAGE_SIZE, total) + " of " + total +
        " complaints | Page " + currentComplaintPage + " of " + pageCount;
    controls.appendChild(label);
    const buttons = document.createElement("div");
    buttons.className = "flex gap-2";
    [["Previous", -1], ["Next", 1]].forEach(function ([text, direction]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.className = "rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-50";
        button.disabled = direction < 0 ? currentComplaintPage === 1 : currentComplaintPage === pageCount;
        button.addEventListener("click", function () {
            currentComplaintPage += direction;
            renderComplaints();
        });
        buttons.appendChild(button);
    });
    controls.appendChild(buttons);
    complaintRecords.appendChild(controls);
}


function createComplaintCard(
    complaint
) {

    const card =
        document.createElement(
            "div"
        );


    card.className =
        "rounded-2xl bg-white p-6 shadow-sm";


    const header =
        document.createElement(
            "div"
        );


    header.className =
        "flex flex-col gap-4 md:flex-row md:items-start md:justify-between";


    const left =
        document.createElement(
            "div"
        );


    const title =
        document.createElement(
            "h4"
        );


    title.className =
        "text-lg font-bold text-gray-900";


    title.textContent =
        complaint.complainant_name ||
        "Unnamed Complainant";


    const date =
        document.createElement(
            "p"
        );


    date.className =
        "mt-1 text-xs text-gray-400";


    date.textContent =
        "Reported: " +
        formatDate(
            complaint.date_reported
        );


    left.appendChild(
        title
    );

    left.appendChild(
        date
    );


    const statusSelect =
        document.createElement(
            "select"
        );


    statusSelect.className =
        "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold";


    [
        "Pending",
        "On-going",
        "Resolved"
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
                complaint.complaint_status ===
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


    statusSelect.disabled = complaintMutations.has(complaintRequestToken + ":" + complaint.id);
    statusSelect.addEventListener("change", async function () {
        await updateStatus(complaint.id, statusSelect.value, statusSelect);
    });


    header.appendChild(
        left
    );

    header.appendChild(
        statusSelect
    );


    card.appendChild(
        header
    );


    const description =
        document.createElement(
            "div"
        );


    description.className =
        "mt-5 rounded-xl bg-gray-50 p-4";


    description.innerHTML =
        "<p class=\"text-xs font-semibold uppercase tracking-wide text-gray-400\">" +
            "Complaint" +
        "</p>" +
        "<p class=\"mt-2 whitespace-pre-line text-sm leading-6 text-gray-700\"></p>";


    description.querySelector(
        "p:last-child"
    ).textContent =
        complaint.what_happened;


    card.appendChild(
        description
    );


    const details =
        document.createElement(
            "div"
        );


    details.className =
        "mt-4 grid grid-cols-1 gap-3 md:grid-cols-3";


    details.appendChild(
        detailItem(
            "Who Involved",
            complaint.who_involved ||
            "—"
        )
    );


    details.appendChild(
        detailItem(
            "Location",
            complaint.location ||
            "—"
        )
    );


    details.appendChild(
        detailItem(
            "Received By",
            complaint.received_by ||
            "—"
        )
    );


    card.appendChild(
        details
    );


    const actions =
        document.createElement(
            "div"
        );


    actions.className =
        "mt-5 flex flex-wrap justify-end gap-2";

    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-semibold text-[#006B21] hover:bg-green-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600";
    detailsButton.textContent = "View Full Details";
    detailsButton.addEventListener("click", () => openFullDetails(complaint, detailsButton));
    actions.appendChild(detailsButton);
    const historyButton = document.createElement("button");
    historyButton.type = "button";
    historyButton.className = "rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-[#006B21] hover:bg-green-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600";
    historyButton.textContent = "Status History";
    historyButton.addEventListener("click", () => openComplaintHistory(complaint, historyButton));
    actions.appendChild(historyButton);


    const callSlipButton =
        document.createElement(
            "button"
        );


    callSlipButton.type =
        "button";


    callSlipButton.className =
        "rounded-lg bg-[#F5C400] px-4 py-2.5 text-sm font-bold text-gray-900 hover:bg-yellow-300";


    callSlipButton.textContent =
        "Add Call Slip";


    callSlipButton.addEventListener(
        "click",
        function () {

            openCallSlip(
                complaint
            );
        }
    );


    actions.appendChild(
        callSlipButton
    );


    card.appendChild(
        actions
    );


    return card;
}


function detailItem(
    label,
    value
) {

    const div =
        document.createElement(
            "div"
        );


    div.className =
        "rounded-lg border border-gray-100 p-3";


    const labelElement =
        document.createElement(
            "p"
        );


    labelElement.className =
        "text-xs font-semibold text-gray-400";


    labelElement.textContent =
        label;


    const valueElement =
        document.createElement(
            "p"
        );


    valueElement.className =
        "mt-1 text-sm font-medium text-gray-700";


    valueElement.textContent =
        value;


    div.appendChild(
        labelElement
    );

    div.appendChild(
        valueElement
    );


    return div;
}

function showStatusNotification() {
    const notification =
        document.getElementById("statusNotification");

    if (!notification) {
        console.error("statusNotification not found.");
        return;
    }

    notification.classList.remove("hidden");
    notification.style.display = "block";

    notification.classList.remove("show");

    void notification.offsetWidth;

    notification.classList.add("show");

    setTimeout(function () {
        notification.classList.remove("show");
        notification.classList.add("hidden");
        notification.style.display = "none";
    }, 2000);
}

function showStatusNotification() {
    const notification =
        document.getElementById("statusNotification");

    if (!notification) {
        console.error("statusNotification not found.");
        return;
    }

    notification.classList.remove("hidden");
    notification.style.display = "block";

    notification.classList.remove("show");

    void notification.offsetWidth;

    notification.classList.add("show");

    setTimeout(function () {
        notification.classList.remove("show");
        notification.classList.add("hidden");
        notification.style.display = "none";
    }, 2000);
}

async function updateStatus(complaintId, newStatus, control) {
    const session = complaintRequestToken;
    const key = session + ":" + complaintId;
    const complaint = allComplaints.find(item => String(item.id) === String(complaintId));
    if (complaintMutations.has(key) || !complaint || !currentPasskey) return;
    const previous = complaint.complaint_status;
    const passkey = currentPasskey;
    const isCurrent = () => session === complaintRequestToken && currentPasskey === passkey;
    complaintMutations.add(key);
    if (control) control.disabled = true;
    try {
        const result = await supabaseClient.rpc("update_complaint_status_with_passkey", {
            entered_passkey: passkey, complaint_id: complaintId, new_status: newStatus
        });
        // The RPC must explicitly acknowledge success; null/false/unknown shapes are not confirmation.
        if (result.error || result.data !== true) throw new Error("Update not confirmed.");
        if (!isCurrent()) return;
        const current = allComplaints.find(item => String(item.id) === String(complaintId));
        if (current) current.complaint_status = newStatus;
        renderComplaintReport();
        showStatusNotification();
    } catch (_) {
        if (!isCurrent()) return;
        if (control) control.value = previous || "";
        alert("Status change could not be confirmed. Lock and unlock to verify before trying again.");
    } finally {
        complaintMutations.delete(key);
        if (control) control.disabled = false;
        if (isCurrent()) renderComplaints();
    }
}


function openCallSlip(
    complaint
) {
    if (isSavingTrackingCallSlip) return;

    selectedComplaintId =
        complaint.id;


    callStudentName.value =
        complaint.who_involved ||
        "";


    callCourseYear.value =
        "";


    setCallSlipDate();


    callSlipModal.classList.remove(
        "hidden"
    );


    callSlipModal.classList.add(
        "flex"
    );
}


function closeCallSlip() {

    selectedComplaintId =
        null;


    callSlipForm.reset();


    callSlipModal.classList.add(
        "hidden"
    );


    callSlipModal.classList.remove(
        "flex"
    );
}


function setCallSlipDate() {

    const today =
        new Date();


    const value =
        today.getFullYear() +
        "-" +
        String(
            today.getMonth() + 1
        ).padStart(
            2,
            "0"
        ) +
        "-" +
        String(
            today.getDate()
        ).padStart(
            2,
            "0"
        );


    callDate.value =
        value;
}


async function saveCallSlip(event) {
    event.preventDefault();
    if (isSavingTrackingCallSlip || !selectedComplaintId || !callSlipForm.reportValidity()) return;
    const complaintId = selectedComplaintId;
    const session = complaintRequestToken;
    const payload = {

                complaint_id:
                    complaintId,

                date:
                    callDate.value,

                student_name:
                    callStudentName.value.trim() ||
                    null,

                course_year:
                    callCourseYear.value.trim() ||
                    null,

                schedule_type:
                    scheduleType.value,

                scheduled_date:
                    scheduledDate.value ||
                    null,

                scheduled_time:
                    scheduledTime.value ||
                    null,

                call_number:
                    Number(
                        callNumber.value
                    ),

                remarks:
                    callRemarks.value.trim() ||
                    null,

                received_by:
                    currentProfile.full_name,

                interview_status:
                    null
            };
    const controls = Array.from(callSlipForm.querySelectorAll("input, select, textarea, button"));
    const states = controls.map(field => field.disabled);
    const save = callSlipForm.querySelector('[type="submit"]');
    const label = save ? save.textContent : "";
    isSavingTrackingCallSlip = true;
    controls.forEach(field => { field.disabled = true; });
    if (save) save.textContent = "Saving...";
    let confirmed = false;
    try {
        const result = await supabaseClient.from("call_slips").insert(payload)
            .select("id, complaint_id").single();
        const row = result.data;
        if (result.error || !row || !validTrackingCallSlipId(row.id) || String(row.complaint_id) !== String(complaintId)) {
            throw new Error("Insert not confirmed.");
        }
        confirmed = true;
        if (session === complaintRequestToken && selectedComplaintId === complaintId) {
            alert("Call Slip saved successfully.");
        }
    } catch (_) {
        if (session === complaintRequestToken) alert("Call Slip save could not be confirmed. Verify whether it was saved before submitting again.");
    } finally {
        isSavingTrackingCallSlip = false;
        controls.forEach((field, i) => { field.disabled = states[i]; });
        if (save) save.textContent = label;
        if (confirmed && session === complaintRequestToken && selectedComplaintId === complaintId) closeCallSlip();
    }
}

function validTrackingCallSlipId(id) {
    return (typeof id === "number" && Number.isSafeInteger(id) && id > 0) ||
        (typeof id === "string" && /^[1-9]\d*$/.test(id));
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


passkeyForm.addEventListener(
    "submit",
    unlockComplaints
);


lockButton.addEventListener(
    "click",
    lockComplaints
);


searchInput.addEventListener(
    "input",
    resetComplaintPage
);


statusFilter.addEventListener(
    "change",
    resetComplaintPage
);


callSlipForm.addEventListener(
    "submit",
    saveCallSlip
);


closeCallSlipModal.addEventListener(
    "click",
    closeCallSlip
);


cancelCallSlip.addEventListener(
    "click",
    closeCallSlip
);


logoutButton.addEventListener(
    "click",
    async function () {

        await logout();
    }
);


async function initialize() {
    unlockButton.disabled = true;
    showPageStatus("Loading account information...");
    try {
        if (!await loadProfile()) throw new Error("Account unavailable.");
        trackingInitReady = true;
        showPageStatus("");
    } catch (error) { showPageStatus(safeNetworkMessage(error)); }
    finally { restoreUnlockControl(); }
}




/* Monthly report: all complaint values come exclusively from the unlocked dataset. */
const COMPLAINT_REPORT_CATEGORIES = [
    "Offenses Against Security", "Offenses Against Property", "Offenses Against Order",
    "Offenses Involving Dishonesty", "Offenses Against Public Morals"
];
const complaintReportPeriod = document.getElementById("complaintReportPeriod");
const complaintReportGenerate = document.getElementById("generateComplaintReport");
const complaintReportState = document.getElementById("complaintReportState");
const complaintReportOutput = document.getElementById("complaintReportOutput");
let complaintReportMappings = new Map();
let complaintReportReady = false;
let complaintReportLoadToken = 0;
let complaintReportSession = null;

function reportId(value) {
    if ((typeof value !== "string" && typeof value !== "number") ||
        (typeof value === "number" && !Number.isSafeInteger(value)) || !/^[1-9]\d*$/.test(String(value))) {
        throw new Error("Invalid reporting ID.");
    }
    return String(value);
}
function complaintDatePeriod(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) {
        throw new Error("Invalid report date.");
    }
    const date = new Date(value + "T00:00:00Z");
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Invalid report date.");
    return value.slice(0, 7);
}
function currentComplaintManilaPeriod() {
    const parts = new Intl.DateTimeFormat("en-US", {timeZone:"Asia/Manila",year:"numeric",month:"2-digit"}).formatToParts(new Date());
    return parts.find(part => part.type === "year").value + "-" + parts.find(part => part.type === "month").value;
}
function complaintPeriodLabel(period) {
    return new Intl.DateTimeFormat("en-US", {timeZone:"Asia/Manila",month:"long",year:"numeric"})
        .format(new Date(period + "-15T00:00:00Z"));
}
function resetComplaintReport() {
    closeComplaintCollegeBreakdown();
    document.getElementById("complaintReportMonthTitle").textContent = "Selected Month";
    complaintReportLoadToken++;
    complaintReportReady = false;
    complaintReportSession = null;
    complaintReportMappings = new Map();
    complaintReportGenerate.disabled = true;
    complaintReportPeriod.disabled = true;
    complaintReportPeriod.replaceChildren();
    complaintReportOutput.replaceChildren();
    complaintReportState.textContent = "Loading report data...";
}
function complaintReportAuthorized() {
    return currentProfile?.role === "oswe_admin" && !!currentPasskey && complaintsComplete && !complaintsLoading;
}
function complaintReportCanGenerate() {
    return complaintReportAuthorized() && complaintReportReady && complaintReportSession === complaintRequestToken &&
        Array.from(complaintReportPeriod.options).some(option => option.value === complaintReportPeriod.value);
}
function setComplaintReportUnavailable() {
    closeComplaintCollegeBreakdown();
    document.getElementById("complaintReportMonthTitle").textContent = "Report unavailable";
    complaintReportReady = false;
    complaintReportMappings = new Map();
    complaintReportGenerate.disabled = true;
    complaintReportPeriod.disabled = true;
    complaintReportOutput.replaceChildren();
    complaintReportState.textContent = "Report unavailable. Lock and unlock again to reload complete report data.";
}
function populateComplaintReportPeriods() {
    const current = currentComplaintManilaPeriod();
    const recordPeriods = allComplaints.map(record => complaintDatePeriod(record.date_reported)).sort();
    const start = recordPeriods.length && recordPeriods[0] < current ? recordPeriods[0] : current;
    const end = recordPeriods.length && recordPeriods[recordPeriods.length - 1] > current ? recordPeriods[recordPeriods.length - 1] : current;
    let [year, month] = start.split("-").map(Number);
    complaintReportPeriod.replaceChildren();
    const key = () => String(year).padStart(4,"0") + "-" + String(month).padStart(2,"0");
    while (key() <= end) {
        const option = document.createElement("option");
        option.value = key();
        option.textContent = complaintPeriodLabel(key());
        complaintReportPeriod.appendChild(option);
        if (++month > 12) { month = 1; year++; }
    }
    let saved = null;
    try { saved = localStorage.getItem("csupakComplaintReportPeriod"); } catch (_) { /* Storage is optional. */ }
    complaintReportPeriod.value = Array.from(complaintReportPeriod.options).some(option => option.value === saved) ? saved : current;
}
async function loadComplaintReportSources() {
    if (!complaintReportAuthorized()) return;
    resetComplaintReport();
    const session = complaintRequestToken;
    const token = complaintReportLoadToken;
    const passkey = currentPasskey;
    const isCurrent = () => session === complaintRequestToken && token === complaintReportLoadToken &&
        currentPasskey === passkey && complaintReportAuthorized();
    const mappings = new Map();
    const expectedIds = new Set();
    try {
        for (const record of allComplaints) {
            const id = reportId(record.id);
            if (expectedIds.has(id)) throw new Error("Duplicate complaint.");
            expectedIds.add(id);
            complaintDatePeriod(record.date_reported);
            if (record.complaint_category !== null && typeof record.complaint_category !== "string") throw new Error("Invalid category.");
        }
        let expectedTotal = null;
        let offset = 0;
        do {
            if (!isCurrent()) return;
            const result = await supabaseClient.rpc("get_complaint_report_sources_with_passkey",
                {entered_passkey: passkey}, {count:"exact"})
                .order("complaint_id", {ascending:true}).range(offset, offset + COMPLAINT_BATCH_SIZE - 1);
            if (!isCurrent()) return;
            if (result.error) throw result.error;
            if (!Array.isArray(result.data) || !Number.isSafeInteger(result.count) || result.count < 0 || result.data.length > COMPLAINT_BATCH_SIZE) throw new Error("Invalid report batch.");
            if (expectedTotal === null) expectedTotal = result.count;
            if (result.count !== expectedTotal || (!result.data.length && offset < expectedTotal)) throw new Error("Incomplete report sources.");
            for (const source of result.data) {
                if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Invalid report source.");
                const id = reportId(source.complaint_id);
                if (mappings.has(id) || !expectedIds.has(id)) throw new Error("Report ID mismatch.");
                const course = source.complainant_course_id === null ? null : reportId(source.complainant_course_id);
                const college = source.college_id === null ? null : reportId(source.college_id);
                if (college !== null && (course === null || typeof source.college_code !== "string" || !source.college_code.trim() ||
                    typeof source.college_name !== "string" || !source.college_name.trim())) throw new Error("Invalid college mapping.");
                if (college === null && (source.college_code !== null || source.college_name !== null)) throw new Error("Invalid unresolved mapping.");
                mappings.set(id, {courseId:course, collegeId:college, code:source.college_code, name:source.college_name});
            }
            offset += result.data.length;
        } while (offset < expectedTotal);
        if (offset !== expectedTotal || mappings.size !== expectedTotal || mappings.size !== expectedIds.size ||
            Array.from(expectedIds).some(id => !mappings.has(id))) throw new Error("Report source set mismatch.");
        // Also detect course changes between the two complete reads.
        for (const record of allComplaints) {
            const course = record.complainant_course_id === null ? null : reportId(record.complainant_course_id);
            if (course !== mappings.get(reportId(record.id)).courseId) throw new Error("Course mapping changed.");
        }
        const collegeLabels = new Map();
        for (const mapping of mappings.values()) {
            if (mapping.collegeId === null) continue;
            const label = JSON.stringify([mapping.code, mapping.name]);
            if (collegeLabels.has(mapping.collegeId) && collegeLabels.get(mapping.collegeId) !== label) throw new Error("College mapping changed.");
            collegeLabels.set(mapping.collegeId, label);
        }
        if (!isCurrent()) return;
        populateComplaintReportPeriods();
        complaintReportMappings = mappings;
        complaintReportSession = session;
        complaintReportReady = true;
        complaintReportPeriod.disabled = false;
        renderComplaintReport();
    } catch (_) {
        if (isCurrent()) setComplaintReportUnavailable();
    }
}
function aggregateComplaintReport(period) {
    const categories = new Map(COMPLAINT_REPORT_CATEGORIES.map(category => [category, 0]));
    const statuses = new Map([["Pending",0],["On-going",0],["Resolved",0]]);
    const colleges = new Map();
    let total = 0, unknownStatuses = 0;
    for (const record of allComplaints) {
        if (complaintDatePeriod(record.date_reported) !== period) continue;
        total++;
        const category = record.complaint_category === null ? "Uncategorized" :
            COMPLAINT_REPORT_CATEGORIES.includes(record.complaint_category) ? record.complaint_category : "Unrecognized Category";
        categories.set(category, (categories.get(category) || 0) + 1);
        if (statuses.has(record.complaint_status)) statuses.set(record.complaint_status, statuses.get(record.complaint_status) + 1);
        else unknownStatuses++;
        const mapping = complaintReportMappings.get(reportId(record.id));
        if (!mapping) throw new Error("Missing mapping.");
        const key = mapping.collegeId; // null is distinct from every real college ID.
        if (!colleges.has(key)) colleges.set(key, {id:key,code:key === null ? "UNMAPPED" : mapping.code,
            name:key === null ? "Unmapped College" : mapping.name,total:0,categories:new Map()});
        const college = colleges.get(key);
        college.total++;
        college.categories.set(category, (college.categories.get(category) || 0) + 1);
    }
    const orderedCategories = [...COMPLAINT_REPORT_CATEGORIES, "Uncategorized", "Unrecognized Category"]
        .filter(category => COMPLAINT_REPORT_CATEGORIES.includes(category) || categories.has(category));
    const orderedColleges = Array.from(colleges.values()).sort((a,b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));
    if (Array.from(categories.values()).reduce((a,b)=>a+b,0) !== total || orderedColleges.reduce((sum,c)=>sum+c.total,0) !== total) throw new Error("Report totals mismatch.");
    return {total,statuses,unknownStatuses,categories:orderedCategories.map(name=>[name,categories.get(name)||0]),colleges:orderedColleges};
}
function escapeComplaintReport(value) {
    return String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
}
function complaintReportTable(headers, rows) {
    const esc = escapeComplaintReport;
    return '<table class="complaint-report-table"><thead><tr>' + headers.map(label=>'<th scope="col">'+esc(label)+'</th>').join('') +
        '</tr></thead><tbody>' + (rows.length ? rows.map(row=>'<tr>'+row.map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>').join('') :
        '<tr><td colspan="'+headers.length+'">No complaints for this month.</td></tr>') + '</tbody></table>';
}
function complaintReportMarkup(data, period) {
    const esc = escapeComplaintReport;
    const summaries = [["Total Complaints",data.total],...data.statuses];
    const notes = [];
    const uncategorized = data.categories.find(([name]) => name === "Uncategorized")?.[1] || 0;
    const unrecognized = data.categories.find(([name]) => name === "Unrecognized Category")?.[1] || 0;
    const unmapped = data.colleges.find(college => college.id === null);
    if (uncategorized) notes.push(uncategorized + (uncategorized === 1 ? " complaint is uncategorized" : " complaints are uncategorized"));
    if (unmapped) notes.push(unmapped.total + (unmapped.total === 1 ? " complaint has no mapped college" : " complaints have no mapped college"));
    if (unrecognized) notes.push(unrecognized + (unrecognized === 1 ? " complaint has an unrecognized category" : " complaints have unrecognized categories"));
    if (data.unknownStatuses) notes.push(data.unknownStatuses + (data.unknownStatuses === 1 ? " complaint has an unrecognized status" : " complaints have unrecognized statuses") + "; the three status totals exclude these complaints");
    return '<section class="report-summary" aria-labelledby="report-summary-title"><h2 id="report-summary-title">Summary</h2>' +
        '<p class="report-context">Current statuses of complaints reported during '+esc(complaintPeriodLabel(period))+'.</p>' +
        '<div class="report-summary-grid">'+summaries.map(([name,count])=>
            '<div class="report-summary-box"><strong>'+esc(count)+'</strong><span>'+esc(name)+'</span></div>').join('')+'</div></section>' +
        (notes.length ? '<aside class="report-data-note"><h2>Data Quality Note</h2><p>'+esc(notes.join('; '))+'.</p></aside>' : '') +
        '<section class="report-section"><h2>Complaint Totals by Category</h2>' +
        complaintReportTable(["Category","Total Complaints"],data.categories)+'</section>' +
        '<section class="report-section"><h2>Complaint Totals by College</h2>' +
        complaintReportTable(["College Code","College","Total Complaints"],data.colleges.map(college=>[college.code,college.name,college.total]))+'</section>' +
        '<section class="report-section report-cross-tab"><h2>Complaint Category Breakdown by College</h2>' +
        complaintReportTable(["College",...data.categories.map(([name])=>name),"Total"],
            data.colleges.map(college=>[college.code+' / '+college.name,...data.categories.map(([name])=>college.categories.get(name)||0),college.total]))+'</section>';
}
function complaintReportDocument(markup, period, generated) {
    const esc = escapeComplaintReport;
    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CSUPAK Monthly Complaint Report</title><style>' +
        '@page{size:A4 landscape;margin:14mm 12mm}' +
        '*{box-sizing:border-box}body{margin:0;background:#edf0ed;color:#26332b;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5}' +
        '.report-document{max-width:273mm;margin:28px auto;padding:30px 34px;background:#fff;box-shadow:0 2px 18px #0000000d}' +
        '.report-header{border-bottom:2px solid #006b21;padding-bottom:18px;margin-bottom:22px;break-inside:avoid}' +
        '.report-brand{font-size:28px;font-weight:800;letter-spacing:1px;color:#006b21;line-height:1.1}.report-system{margin:5px 0 18px;font-size:11px;color:#657269}' +
        'h1{margin:0;font-size:21px;letter-spacing:1.2px;line-height:1.3}.report-period{margin:6px 0 10px;font-size:19px;font-weight:600;color:#006b21}' +
        '.report-meta{display:flex;flex-wrap:wrap;gap:4px 24px;font-size:10px;color:#657269}.report-meta p{margin:0}' +
        'h2{margin:0 0 9px;font-size:14px;font-weight:700;color:#164d28;break-after:avoid;page-break-after:avoid}.report-context{margin:0 0 12px;font-size:11px;color:#657269}' +
        '.report-summary{break-inside:avoid}.report-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}' +
        '.report-summary-box{padding:13px 15px;border:1px solid #dce5de;border-top:3px solid #006b21;border-radius:5px}.report-summary-box strong{display:block;font-size:28px;line-height:1.2;color:#006b21}.report-summary-box span{display:block;margin-top:4px;font-size:11px;color:#59685e}' +
        '.report-data-note{margin:18px 0;padding:11px 14px;background:#f5f7f4;border-left:3px solid #a9bcae;break-inside:avoid}.report-data-note h2{font-size:11px;margin-bottom:3px;color:#526056}.report-data-note p{margin:0;font-size:10px;color:#657269}' +
        '.report-section{margin-top:24px}.complaint-report-table{width:100%;border-collapse:collapse;font-size:11px;line-height:1.4}.complaint-report-table th{background:#006b21;color:white;font-weight:600;text-align:left;padding:9px 10px;border:1px solid #006b21}' +
        '.complaint-report-table td{padding:8px 10px;border-bottom:1px solid #dce5de;vertical-align:top;overflow-wrap:anywhere}.complaint-report-table tbody tr:nth-child(even){background:#f8faf8}.complaint-report-table td:last-child,.complaint-report-table th:last-child{text-align:right;font-variant-numeric:tabular-nums;width:110px}' +
        'thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}.report-cross-tab table{table-layout:fixed;font-size:9px}.report-cross-tab th{padding:7px 5px;overflow-wrap:anywhere;vertical-align:top}.report-cross-tab td{padding:7px 5px}.report-cross-tab th:first-child{width:22%}.report-cross-tab th:last-child,.report-cross-tab td:last-child{width:6%}.report-cross-tab td:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}' +
        '.report-footer{margin-top:28px;padding-top:10px;border-top:1px solid #dce5de;display:flex;justify-content:space-between;gap:12px;font-size:9px;color:#778279;break-inside:avoid}' +
        '@media screen and (max-width:640px){.report-document{margin:0;padding:20px 14px}.report-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.report-cross-tab{overflow-x:auto}.report-cross-tab table{min-width:750px}}' +
        '@media print{html,body{background:white}.report-document{max-width:none;margin:0;padding:0;box-shadow:none}.report-summary-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.report-cross-tab{overflow:visible}.report-cross-tab table{min-width:0}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}' +
        '</style></head><body><main class="report-document"><header class="report-header"><div class="report-brand">CSUPAK</div><p class="report-system">Student Violation Tracking System</p><h1>MONTHLY COMPLAINT REPORT</h1><p class="report-period">'+esc(complaintPeriodLabel(period))+'</p><div class="report-meta"><p>Generated: '+esc(generated)+'</p><p>Timezone: Asia/Manila</p></div></header>' +
        markup + '<footer class="report-footer"><span>CSUPAK &mdash; Student Violation Tracking System</span><span>Monthly Complaint Report</span></footer></main></body></html>';
}
function complaintDashboardMarkup(data, period) {
    const esc = escapeComplaintReport;
    const summaries = [["Total Complaints",data.total],...data.statuses];
    const categoryCards = data.categories.map(([name,count]) =>
        '<div class="complaint-category-card"><strong>'+count+'</strong><p>'+esc(name)+'</p></div>').join('');
    const collegeCards = data.colleges.map(college =>
        '<div class="complaint-college-card"><strong>'+college.total+'</strong><p class="college-code">'+esc(college.code)+'</p><p class="college-name">'+esc(college.name)+'</p></div>').join('');
    const notes = [];
    const uncategorized = data.categories.find(([name])=>name==='Uncategorized')?.[1] || 0;
    const unrecognized = data.categories.find(([name])=>name==='Unrecognized Category')?.[1] || 0;
    const unmapped = data.colleges.find(college=>college.id === null)?.total || 0;
    if (uncategorized) notes.push(uncategorized+' '+(uncategorized===1?'complaint is':'complaints are')+' uncategorized');
    if (unmapped) notes.push(unmapped+' '+(unmapped===1?'has':'have')+' no mapped college');
    if (unrecognized) notes.push(unrecognized+' '+(unrecognized===1?'has an':'have')+' unrecognized '+(unrecognized===1?'category':'categories'));
    if (data.unknownStatuses) notes.push(data.unknownStatuses+' '+(data.unknownStatuses===1?'has an unrecognized status':'have unrecognized statuses')+' (excluded from the three status totals)');
    return '<div class="complaint-summary-grid">'+summaries.map(([name,count])=>
            '<div class="complaint-summary-card"><strong>'+count+'</strong><p>'+esc(name)+'</p></div>').join('')+'</div>' +
        (notes.length?'<aside class="complaint-data-note"><span>Data note:</span> '+esc(notes.join('; '))+'.</aside>':'')+
        '<h4 class="complaint-metric-heading">Complaints by Category</h4><div class="complaint-category-grid">'+categoryCards+'</div>'+
        '<div class="complaint-college-heading"><h4 class="complaint-metric-heading">Complaints by College</h4><button id="viewComplaintCollegeBreakdown" type="button" class="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-[#006B21]">View College Breakdown</button></div>'+
        '<div class="complaint-college-grid">'+(collegeCards || '<p class="text-sm text-green-100">No complaints for this month.</p>')+'</div>';
}
function closeComplaintCollegeBreakdown() {
    const modal = document.getElementById("complaintCollegeBreakdownModal");
    if (modal.open) modal.close();
    document.getElementById("complaintCollegeBreakdownContent").replaceChildren();
}
function renderComplaintCollegeBreakdown(data, period) {
    document.getElementById("complaintCollegeBreakdownPeriod").textContent = complaintPeriodLabel(period);
    document.getElementById("complaintCollegeBreakdownContent").innerHTML = complaintReportTable(
        ["College",...data.categories.map(([name])=>name),"Total"],
        data.colleges.map(college=>[college.code+' / '+college.name,...data.categories.map(([name])=>college.categories.get(name)||0),college.total]));
}

function renderComplaintReport() {
    if (!complaintReportCanGenerate()) { complaintReportGenerate.disabled = true; return; }
    try {
        const data = aggregateComplaintReport(complaintReportPeriod.value);
        document.getElementById("complaintReportMonthTitle").textContent = complaintPeriodLabel(complaintReportPeriod.value);
        complaintReportOutput.innerHTML = complaintDashboardMarkup(data, complaintReportPeriod.value);
        renderComplaintCollegeBreakdown(data, complaintReportPeriod.value);
        document.getElementById("viewComplaintCollegeBreakdown").addEventListener("click", () => {
            document.getElementById("complaintCollegeBreakdownModal").showModal();
        });
        complaintReportState.textContent = "";
        complaintReportGenerate.disabled = false;
    } catch (_) { setComplaintReportUnavailable(); }
}
function generateComplaintReport() {
    if (!complaintReportCanGenerate()) return;
    let markup;
    try { markup = complaintReportMarkup(aggregateComplaintReport(complaintReportPeriod.value), complaintReportPeriod.value); }
    catch (_) { setComplaintReportUnavailable(); return; }
    const generated = new Intl.DateTimeFormat("en-PH", {timeZone:"Asia/Manila",dateStyle:"medium",timeStyle:"short"}).format(new Date());
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) { alert("Please allow pop-ups to generate the report."); return; }
    reportWindow.document.write(complaintReportDocument(markup, complaintReportPeriod.value, generated));
    reportWindow.onload = () => reportWindow.print();
    reportWindow.document.close();
}
complaintReportPeriod.addEventListener("change", () => {
    try { localStorage.setItem("csupakComplaintReportPeriod", complaintReportPeriod.value); } catch (_) { /* Optional preference. */ }
    renderComplaintReport();
});
complaintReportGenerate.addEventListener("click", generateComplaintReport);
document.getElementById("closeComplaintCollegeBreakdown").addEventListener("click", closeComplaintCollegeBreakdown);
document.getElementById("complaintCollegeBreakdownModal").addEventListener("click", event => {
    if (event.target.id !== "complaintCollegeBreakdownModal") return;
    const bounds = event.target.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeComplaintCollegeBreakdown();
});
initialize();
