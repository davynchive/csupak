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
    unlockButton.disabled = false;
    unlockButton.textContent = "Unlock Complaint Tracking";
}


async function loadProfile() {

    const userResult =
        await supabaseClient.auth.getUser();


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
            profileResult.error
        );

        return false;
    }


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
    const passkey = passkeyInput.value.trim();
    if (!passkey) return;
    closeComplaintHistory(false);
    closeFullDetails(false);
    const token = ++complaintRequestToken;
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
        }
    }
}


function lockComplaints() {
    closeComplaintHistory(false);
    closeFullDetails(false);
    complaintRequestToken++;
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


    statusSelect.addEventListener(
        "change",
        async function () {

            await updateStatus(
                complaint.id,
                statusSelect.value
            );
        }
    );


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

async function updateStatus(
    complaintId,
    newStatus
) {

    const result =
        await supabaseClient.rpc(
            "update_complaint_status_with_passkey",
            {

                entered_passkey:
                    currentPasskey,

                complaint_id:
                    complaintId,

                new_status:
                    newStatus
            }
        );


    if (result.error) {

        console.error(
            result.error
        );


        alert(
            "Unable to update complaint status."
        );


        return;
    }


    const complaint =
        allComplaints.find(
            function (item) {

                return (
                    item.id ===
                    complaintId
                );
            }
        );


    if (complaint) {

        complaint.complaint_status =
            newStatus;
    }

    showStatusNotification();
}


function openCallSlip(
    complaint
) {

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


async function saveCallSlip(
    event
) {

    event.preventDefault();


    if (!selectedComplaintId) {
        return;
    }


    const result =
        await supabaseClient
            .from("call_slips")
            .insert({

                complaint_id:
                    selectedComplaintId,

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
            });


    if (result.error) {

        console.error(
            result.error
        );


        alert(
            "Unable to save Call Slip."
        );


        return;
    }


    alert(
        "Call Slip saved successfully."
    );


    closeCallSlip();
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

    await loadProfile();
}


initialize();
