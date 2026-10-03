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
   GLOBAL DATA
===================================================== */

let currentProfile = null;

let allCallSlips = [];

let selectedCallSlipId = null;


/* =====================================================
   ROLE DISPLAY
===================================================== */

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

    callSlipRecords.innerHTML =
        "<div class=\"rounded-xl bg-gray-50 px-4 py-10 text-center\">" +
            "<p class=\"text-sm text-gray-500\">" +
                "Loading Call Slips..." +
            "</p>" +
        "</div>";


    const result =
        await supabaseClient
            .from("call_slips")
            .select("*")
            .order(
                "complaint_id",
                {
                    ascending: false
                }
            )
            .order(
                "call_number",
                {
                    ascending: true
                }
            );


    if (result.error) {

        console.error(
            "Unable to load Call Slips:",
            result.error
        );


        callSlipRecords.innerHTML =
            "<div class=\"rounded-xl bg-red-50 px-4 py-10 text-center\">" +
                "<p class=\"text-sm text-red-600\">" +
                    "Unable to load Call Slip records." +
                "</p>" +
            "</div>";


        return;
    }


    allCallSlips =
        result.data || [];


    updateSummary();

    renderCallSlips();
}


/* =====================================================
   SUMMARY
===================================================== */

function updateSummary() {

    totalCalls.textContent =
        allCallSlips.length;


    const shows =
        allCallSlips.filter(
            function (item) {

                return (
                    item.interview_status ===
                    "Show"
                );
            }
        ).length;


    const reschedules =
        allCallSlips.filter(
            function (item) {

                return (
                    item.interview_status ===
                    "Reschedule"
                );
            }
        ).length;


    const noShows =
        allCallSlips.filter(
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

    const records =
        getFilteredCallSlips();


    callSlipRecords.innerHTML =
        "";


    if (
        records.length === 0
    ) {

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


    complaintIds.forEach(
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
    renderCallSlips
);


statusFilter.addEventListener(
    "change",
    renderCallSlips
);


callNumberFilter.addEventListener(
    "change",
    renderCallSlips
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