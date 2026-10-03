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

let currentPasskey = "";

let allComplaints = [];

let selectedComplaintId = null;


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


async function unlockComplaints(
    event
) {

    event.preventDefault();


    const passkey =
        passkeyInput.value.trim();


    if (!passkey) {
        return;
    }


    unlockButton.disabled =
        true;

    unlockButton.textContent =
        "Checking...";


    const result =
        await supabaseClient.rpc(
            "get_complaints_with_passkey",
            {
                entered_passkey:
                    passkey
            }
        );


    unlockButton.disabled =
        false;

    unlockButton.textContent =
        "Unlock Complaint Tracking";


    if (result.error) {

        console.error(
            result.error
        );


        passkeyMessage.textContent =
            "Invalid passkey or unauthorized access.";

        passkeyMessage.classList.remove(
            "hidden"
        );


        return;
    }


    currentPasskey =
        passkey;

    allComplaints =
        result.data || [];


    passkeyInput.value =
        "";

    passkeyMessage.classList.add(
        "hidden"
    );


    passkeySection.classList.add(
        "hidden"
    );


    trackingContent.classList.remove(
        "hidden"
    );


    renderComplaints();
}


function lockComplaints() {

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

    const records =
        getFilteredComplaints();


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


    records.forEach(
        function (complaint) {

            complaintRecords.appendChild(
                createComplaintCard(
                    complaint
                )
            );
        }
    );
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
        "mt-5 flex justify-end";


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
    renderComplaints
);


statusFilter.addEventListener(
    "change",
    renderComplaints
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