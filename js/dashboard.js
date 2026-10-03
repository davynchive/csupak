/* =====================================================
   CSUPAK DASHBOARD
===================================================== */


/* =====================================================
   ELEMENTS
===================================================== */

const welcomeMessage =
    document.getElementById("welcomeMessage");

const roleMessage =
    document.getElementById("roleMessage");

const logoutButton =
    document.getElementById("logoutButton");


const complaintsNav =
    document.getElementById("complaintsNav");

const complaintTrackingNav =
    document.getElementById("complaintTrackingNav");

const interviewTrackingNav =
    document.getElementById("interviewTrackingNav");

const complaintsCard =
    document.getElementById("complaintsCard");

const recordViolationCard =
    document.getElementById("recordViolationCard");


const monthlyReportSection =
    document.getElementById("monthlyReportSection");

const reportMonth =
    document.getElementById("reportMonth");

const reportMonthTitle =
    document.getElementById("reportMonthTitle");

const generateReportButton =
    document.getElementById("generateReportButton");

const totalViolations =
    document.getElementById("totalViolations");

const violationTypeCards =
    document.getElementById("violationTypeCards");

const collegeCards =
    document.getElementById("collegeCards");

const recentRecords =
    document.getElementById("recentRecords");


/* =====================================================
   COLLEGE MODAL
===================================================== */

const collegeModal =
    document.getElementById("collegeModal");

const modalCollegeName =
    document.getElementById("modalCollegeName");

const modalCollegeMonth =
    document.getElementById("modalCollegeMonth");

const modalCollegeTotal =
    document.getElementById("modalCollegeTotal");

const modalViolationBreakdown =
    document.getElementById(
        "modalViolationBreakdown"
    );

const closeCollegeModal =
    document.getElementById(
        "closeCollegeModal"
    );

const closeCollegeModalBottom =
    document.getElementById(
        "closeCollegeModalBottom"
    );


/* =====================================================
   GLOBAL DATA
===================================================== */

let currentUser = null;

let currentProfile = null;

let activeSemester = null;

let allViolations = [];

let selectedMonthViolations = [];


/* =====================================================
   LOAD CURRENT USER
===================================================== */

async function loadUserProfile() {

    const userResult =
        await supabaseClient.auth.getUser();


    if (
        userResult.error ||
        !userResult.data.user
    ) {

        console.error(
            "Unable to load user:",
            userResult.error
        );

        window.location.href =
            "../index.html";

        return false;
    }


    currentUser =
        userResult.data.user;


    const profileResult =
        await supabaseClient
            .from("profiles")
            .select(
                "full_name, role"
            )
            .eq(
                "id",
                currentUser.id
            )
            .single();


    if (profileResult.error) {

        console.error(
            "Unable to load profile:",
            profileResult.error
        );

        roleMessage.textContent =
            "Unable to load account information.";

        return false;
    }


    currentProfile =
        profileResult.data;


    welcomeMessage.textContent =
        "Welcome, " +
        currentProfile.full_name;


    roleMessage.textContent =
        getRoleDisplayName(
            currentProfile.role
        );


    applyRolePermissions();


    return true;
}


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


    if (role === "security_office") {
        return "Security Office";
    }


    return "Authorized User";
}


/* =====================================================
   ROLE-BASED ACCESS
===================================================== */

function applyRolePermissions() {

    if (!currentProfile) {
        return;
    }


    /*
        RECORD VIOLATION

        Security Office:
        YES

        OSWE Staff:
        YES

        OSWE Admin:
        YES
    */

    if (recordViolationCard) {

        recordViolationCard.classList.remove(
            "hidden"
        );
    }


    /*
        COMPLAINTS

        OSWE ADMIN
        - Add complaints
        - View complaints
        - Track complaints
        - Manage complaints
        - Interview tracking


        OSWE STAFF
        - Add complaints
        - Cannot view complaint tracking
        - Cannot manage complaints
        - Cannot access interview tracking


        SECURITY OFFICE
        - No complaint access
    */


    if (
        currentProfile.role ===
        "oswe_admin"
    ) {

        /*
            Main Complaints navigation
        */

        if (complaintsNav) {

            complaintsNav.classList.remove(
                "hidden"
            );

            complaintsNav.classList.add(
                "flex"
            );

            complaintsNav.textContent =
                "Complaints";
        }


        /*
            Complaint Tracking
        */

        if (complaintTrackingNav) {

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
        }


        /*
            Interview Tracking
        */

        if (interviewTrackingNav) {

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
        }


        /*
            Quick Action
        */

        if (complaintsCard) {

            complaintsCard
                .classList
                .remove(
                    "hidden"
                );

            complaintsCard
                .classList
                .add(
                    "flex"
                );


            const title =
                complaintsCard.querySelector(
                    "p:first-child"
                );


            const description =
                complaintsCard.querySelector(
                    "p:nth-child(2)"
                );


            if (title) {

                title.textContent =
                    "Complaint Tracking";
            }


            if (description) {

                description.textContent =
                    "Manage complaints";
            }
        }

    } else if (
        currentProfile.role ===
        "oswe_staff"
    ) {

        /*
            OSWE Staff can ADD complaints.
        */

        if (complaintsNav) {

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

            complaintsNav.textContent =
                "Add Complaint";
        }


        /*
            But OSWE Staff cannot
            track complaints.
        */

        if (complaintTrackingNav) {

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


        /*
            OSWE Staff cannot
            access interview tracking.
        */

        if (interviewTrackingNav) {

            interviewTrackingNav
                .classList
                .add(
                    "hidden"
                );

            interviewTrackingNav
                .classList
                .remove(
                    "flex"
                );
        }


        /*
            Quick Action becomes
            ADD COMPLAINT instead of
            Complaint Tracking.
        */

        if (complaintsCard) {

            complaintsCard
                .classList
                .remove(
                    "hidden"
                );

            complaintsCard
                .classList
                .add(
                    "flex"
                );


            const title =
                complaintsCard.querySelector(
                    "p:first-child"
                );


            const description =
                complaintsCard.querySelector(
                    "p:nth-child(2)"
                );


            if (title) {

                title.textContent =
                    "Add Complaint";
            }


            if (description) {

                description.textContent =
                    "Record a new complaint";
            }
        }

    } else {

        /*
            SECURITY OFFICE
        */

        if (complaintsNav) {

            complaintsNav
                .classList
                .add(
                    "hidden"
                );

            complaintsNav
                .classList
                .remove(
                    "flex"
                );
        }


        if (complaintTrackingNav) {

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


        if (interviewTrackingNav) {

            interviewTrackingNav
                .classList
                .add(
                    "hidden"
                );

            interviewTrackingNav
                .classList
                .remove(
                    "flex"
                );
        }


        if (complaintsCard) {

            complaintsCard
                .classList
                .add(
                    "hidden"
                );

            complaintsCard
                .classList
                .remove(
                    "flex"
                );
        }
    }


    /*
        MONTHLY REPORT

        OSWE Admin:
        YES

        OSWE Staff:
        YES

        Security Office:
        NO
    */

    if (monthlyReportSection) {

        if (
            currentProfile.role ===
                "oswe_admin" ||
            currentProfile.role ===
                "oswe_staff"
        ) {

            monthlyReportSection
                .classList
                .remove(
                    "hidden"
                );

        } else {

            monthlyReportSection
                .classList
                .add(
                    "hidden"
                );
        }
    }
}


/* =====================================================
   LOAD ACTIVE SEMESTER
===================================================== */

async function loadActiveSemester() {

    const result =
        await supabaseClient
            .from("semesters")
            .select("*")
            .eq(
                "is_active",
                true
            )
            .maybeSingle();


    if (result.error) {

        console.error(
            "Unable to load semester:",
            result.error
        );

        return false;
    }


    activeSemester =
        result.data;


    if (!activeSemester) {

        console.warn(
            "No active semester found."
        );

        return false;
    }


    return true;
}


/* =====================================================
   LOAD VIOLATIONS
===================================================== */

async function loadViolations() {

    if (!activeSemester) {
        return;
    }


    const result =
        await supabaseClient
            .from("violations")
            .select(
                `
                id,
                violation_type,
                location,
                caught_apprehended_by,
                date_time,
                remarks,
                status,
                created_at,
                semester_id,
                students (
                    student_id,
                    student_name,
                    course_year,
                    college
                )
                `
            )
            .eq(
                "semester_id",
                activeSemester.id
            )
            .order(
                "date_time",
                {
                    ascending: false
                }
            );


    if (result.error) {

        console.error(
            "Unable to load violations:",
            result.error
        );

        allViolations = [];

        renderDashboard();

        return;
    }


    allViolations =
        result.data || [];


    renderDashboard();
}


/* =====================================================
   DASHBOARD RENDER
===================================================== */

function renderDashboard() {

    updateMonthTitle();

    filterViolationsByMonth();

    renderViolationTypes();

    renderCollegeCards();

    renderRecentRecords();
}


/* =====================================================
   MONTH TITLE
===================================================== */

function updateMonthTitle() {

    if (
        !reportMonth ||
        !reportMonthTitle
    ) {
        return;
    }


    const selectedOption =
        reportMonth.options[
            reportMonth.selectedIndex
        ];


    if (!selectedOption) {
        return;
    }


    reportMonthTitle.textContent =
        selectedOption.textContent;
}


/* =====================================================
   FILTER VIOLATIONS BY MONTH
===================================================== */

function filterViolationsByMonth() {

    if (!reportMonth) {

        selectedMonthViolations =
            allViolations;

        return;
    }


    const selectedMonth =
        Number(
            reportMonth.value
        );


    selectedMonthViolations =
        allViolations.filter(
            function (violation) {

                if (!violation.date_time) {
                    return false;
                }


                const date =
                    new Date(
                        violation.date_time
                    );


                return (
                    date.getMonth() + 1 ===
                    selectedMonth
                );
            }
        );
}


/* =====================================================
   RENDER VIOLATION TYPE CARDS
===================================================== */

function renderViolationTypes() {

    if (
        !violationTypeCards ||
        !totalViolations
    ) {
        return;
    }


    totalViolations.textContent =
        selectedMonthViolations.length;


    /*
        Remove old dynamically generated cards.

        Keep the first card because that is
        the Total Violations card already
        written in dashboard.html.
    */

    const dynamicCards =
        violationTypeCards.querySelectorAll(
            "[data-violation-type-card]"
        );


    dynamicCards.forEach(
        function (card) {
            card.remove();
        }
    );


    const typeCounts = {};


    selectedMonthViolations.forEach(
        function (violation) {

            let type =
                violation.violation_type;


            if (!type) {
                type = "Unspecified";
            }


            if (!typeCounts[type]) {
                typeCounts[type] = 0;
            }


            typeCounts[type]++;
        }
    );


    const types =
        Object.keys(
            typeCounts
        ).sort();


    types.forEach(
        function (type) {

            const card =
                document.createElement(
                    "div"
                );


            card.setAttribute(
                "data-violation-type-card",
                "true"
            );


            card.className =
                "min-w-[145px] flex-1 rounded-xl bg-white/95 px-4 py-4";


            const number =
                document.createElement(
                    "p"
                );


            number.className =
                "text-2xl font-bold text-[#006B21]";


            number.textContent =
                typeCounts[type];


            const label =
                document.createElement(
                    "p"
                );


            label.className =
                "mt-1 text-xs font-medium text-gray-500";


            label.textContent =
                type;


            card.appendChild(
                number
            );


            card.appendChild(
                label
            );


            violationTypeCards
                .appendChild(
                    card
                );
        }
    );
}


/* =====================================================
   BUILD COLLEGE DATA
===================================================== */

function buildCollegeData() {

    const colleges = {};


    selectedMonthViolations.forEach(
        function (violation) {

            let college =
                "Unspecified College";


            if (
                violation.students &&
                violation.students.college
            ) {

                college =
                    violation.students.college;
            }


            if (!colleges[college]) {

                colleges[college] = {
                    total: 0,
                    types: {}
                };
            }


            colleges[college].total++;


            let type =
                violation.violation_type ||
                "Unspecified";


            if (
                !colleges[
                    college
                ].types[type]
            ) {

                colleges[
                    college
                ].types[type] = 0;
            }


            colleges[
                college
            ].types[type]++;
        }
    );


    return colleges;
}


/* =====================================================
   RENDER COLLEGE CARDS
===================================================== */

function renderCollegeCards() {

    if (!collegeCards) {
        return;
    }


    collegeCards.innerHTML = "";


    const colleges =
        buildCollegeData();


    const collegeNames =
        Object.keys(
            colleges
        ).sort();


    if (
        collegeNames.length === 0
    ) {

        const emptyMessage =
            document.createElement(
                "div"
            );


        emptyMessage.className =
            "col-span-full rounded-xl bg-white/10 px-4 py-6 text-center text-sm text-green-100";


        emptyMessage.textContent =
            "No violation records for this month.";


        collegeCards.appendChild(
            emptyMessage
        );


        return;
    }


    collegeNames.forEach(
        function (collegeName) {

            const data =
                colleges[collegeName];


            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.className =
                "rounded-xl bg-white px-4 py-4 text-left transition hover:-translate-y-0.5 hover:shadow-md";


            const count =
                document.createElement(
                    "p"
                );


            count.className =
                "text-2xl font-bold text-[#006B21]";


            count.textContent =
                data.total;


            const name =
                document.createElement(
                    "p"
                );


            name.className =
                "mt-1 truncate text-xs font-semibold text-gray-600";


            name.textContent =
                collegeName;


            button.appendChild(
                count
            );


            button.appendChild(
                name
            );


            button.addEventListener(
                "click",
                function () {

                    openCollegeModal(
                        collegeName,
                        data
                    );
                }
            );


            collegeCards.appendChild(
                button
            );
        }
    );
}


/* =====================================================
   OPEN COLLEGE MODAL
===================================================== */

function openCollegeModal(
    collegeName,
    data
) {

    if (!collegeModal) {
        return;
    }


    modalCollegeName.textContent =
        collegeName;


    if (reportMonth) {

        const selectedOption =
            reportMonth.options[
                reportMonth.selectedIndex
            ];


        if (selectedOption) {

            modalCollegeMonth.textContent =
                selectedOption.textContent;
        }
    }


    modalCollegeTotal.textContent =
        data.total;


    modalViolationBreakdown.innerHTML =
        "";


    const types =
        Object.keys(
            data.types
        ).sort();


    if (types.length === 0) {

        const empty =
            document.createElement(
                "div"
            );


        empty.className =
            "px-4 py-5 text-center text-sm text-gray-500";


        empty.textContent =
            "No violation records.";


        modalViolationBreakdown
            .appendChild(
                empty
            );

    } else {

        types.forEach(
            function (
                type,
                index
            ) {

                const row =
                    document.createElement(
                        "div"
                    );


                row.className =
                    "flex items-center justify-between px-4 py-3";


                if (
                    index <
                    types.length - 1
                ) {

                    row.classList.add(
                        "border-b",
                        "border-gray-100"
                    );
                }


                const name =
                    document.createElement(
                        "p"
                    );


                name.className =
                    "text-sm text-gray-700";


                name.textContent =
                    type;


                const count =
                    document.createElement(
                        "span"
                    );


                count.className =
                    "rounded-full bg-[#F3F7F3] px-3 py-1 text-xs font-bold text-[#006B21]";


                count.textContent =
                    data.types[type];


                row.appendChild(
                    name
                );


                row.appendChild(
                    count
                );


                modalViolationBreakdown
                    .appendChild(
                        row
                    );
            }
        );
    }


    collegeModal.classList.remove(
        "hidden"
    );


    collegeModal.classList.add(
        "flex"
    );
}


/* =====================================================
   CLOSE COLLEGE MODAL
===================================================== */

function hideCollegeModal() {

    if (!collegeModal) {
        return;
    }


    collegeModal.classList.add(
        "hidden"
    );


    collegeModal.classList.remove(
        "flex"
    );
}


/* =====================================================
   RECENT RECORDS
===================================================== */

function renderRecentRecords() {

    if (!recentRecords) {
        return;
    }


    recentRecords.innerHTML = "";


    const recent =
        allViolations.slice(
            0,
            5
        );


    if (recent.length === 0) {

        const empty =
            document.createElement(
                "div"
            );


        empty.className =
            "rounded-xl bg-gray-50 px-4 py-8 text-center";


        const message =
            document.createElement(
                "p"
            );


        message.className =
            "text-sm text-gray-500";


        message.textContent =
            "No recent violation records.";


        empty.appendChild(
            message
        );


        recentRecords.appendChild(
            empty
        );


        return;
    }


    const tableContainer =
        document.createElement(
            "div"
        );


    tableContainer.className =
        "overflow-x-auto";


    const table =
        document.createElement(
            "table"
        );


    table.className =
        "w-full text-left";


    table.innerHTML =
        "<thead>" +
            "<tr class=\"border-b border-gray-100\">" +
                "<th class=\"pb-3 pr-4 text-xs font-semibold uppercase tracking-wide text-gray-400\">" +
                    "Student" +
                "</th>" +
                "<th class=\"pb-3 pr-4 text-xs font-semibold uppercase tracking-wide text-gray-400\">" +
                    "Violation" +
                "</th>" +
                "<th class=\"pb-3 pr-4 text-xs font-semibold uppercase tracking-wide text-gray-400\">" +
                    "Date" +
                "</th>" +
                "<th class=\"pb-3 text-xs font-semibold uppercase tracking-wide text-gray-400\">" +
                    "Status" +
                "</th>" +
            "</tr>" +
        "</thead>";


    const tbody =
        document.createElement(
            "tbody"
        );


    recent.forEach(
        function (violation) {

            const row =
                document.createElement(
                    "tr"
                );


            row.className =
                "border-b border-gray-50 last:border-b-0";


            /*
                STUDENT
            */

            const studentCell =
                document.createElement(
                    "td"
                );


            studentCell.className =
                "py-3 pr-4";


            const studentName =
                document.createElement(
                    "p"
                );


            studentName.className =
                "text-sm font-semibold text-gray-800";


            if (
                violation.students &&
                violation.students.student_name
            ) {

                studentName.textContent =
                    violation.students
                        .student_name;

            } else {

                studentName.textContent =
                    "Unknown Student";
            }


            const studentId =
                document.createElement(
                    "p"
                );


            studentId.className =
                "mt-0.5 text-xs text-gray-400";


            if (
                violation.students &&
                violation.students.student_id
            ) {

                studentId.textContent =
                    violation.students
                        .student_id;
            }


            studentCell.appendChild(
                studentName
            );


            studentCell.appendChild(
                studentId
            );


            /*
                VIOLATION
            */

            const violationCell =
                document.createElement(
                    "td"
                );


            violationCell.className =
                "py-3 pr-4 text-sm text-gray-700";


            violationCell.textContent =
                violation.violation_type ||
                "Unspecified";


            /*
                DATE
            */

            const dateCell =
                document.createElement(
                    "td"
                );


            dateCell.className =
                "py-3 pr-4 text-sm text-gray-500";


            dateCell.textContent =
                formatDate(
                    violation.date_time
                );


            /*
                STATUS
            */

            const statusCell =
                document.createElement(
                    "td"
                );


            statusCell.className =
                "py-3";


            const badge =
                document.createElement(
                    "span"
                );


            badge.className =
                getStatusClass(
                    violation.status
                );


            badge.textContent =
                violation.status ||
                "Pending";


            statusCell.appendChild(
                badge
            );


            row.appendChild(
                studentCell
            );


            row.appendChild(
                violationCell
            );


            row.appendChild(
                dateCell
            );


            row.appendChild(
                statusCell
            );


            tbody.appendChild(
                row
            );
        }
    );


    table.appendChild(
        tbody
    );


    tableContainer.appendChild(
        table
    );


    recentRecords.appendChild(
        tableContainer
    );
}


/* =====================================================
   STATUS BADGE
===================================================== */

function getStatusClass(status) {

    const base =
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold";


    if (
        status ===
        "Blocked Clearance"
    ) {

        return (
            base +
            " bg-red-50 text-red-700"
        );
    }


    if (
        status ===
        "Unblocked Clearance"
    ) {

        return (
            base +
            " bg-blue-50 text-blue-700"
        );
    }


    if (
        status ===
        "Rendered Do-Day"
    ) {

        return (
            base +
            " bg-green-50 text-green-700"
        );
    }


    return (
        base +
        " bg-yellow-50 text-yellow-700"
    );
}


/* =====================================================
   DATE FORMATTING
===================================================== */

function formatDate(dateValue) {

    if (!dateValue) {
        return "—";
    }


    const date =
        new Date(
            dateValue
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


/* =====================================================
   TIME FORMATTING
===================================================== */

function formatTime(dateValue) {

    if (!dateValue) {
        return "—";
    }


    const date =
        new Date(
            dateValue
        );


    return date.toLocaleTimeString(
        "en-PH",
        {
            hour: "numeric",
            minute: "2-digit"
        }
    );
}


/* =====================================================
   ESCAPE HTML FOR REPORT
===================================================== */

function escapeHtml(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return "";
    }


    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


/* =====================================================
   GENERATE REPORT
===================================================== */

function generateReport() {

    /*
        SECURITY OFFICE IS NOT
        ALLOWED TO GENERATE REPORTS.
    */

    if (
        currentProfile &&
        currentProfile.role ===
            "security_office"
    ) {

        alert(
            "You do not have permission to generate reports."
        );

        return;
    }


    if (
        !currentProfile ||
        (
            currentProfile.role !==
                "oswe_admin" &&
            currentProfile.role !==
                "oswe_staff"
        )
    ) {

        alert(
            "You do not have permission to generate reports."
        );

        return;
    }


    if (!reportMonth) {
        return;
    }


    const selectedOption =
        reportMonth.options[
            reportMonth.selectedIndex
        ];


    const monthName =
        selectedOption
            ? selectedOption.textContent
            : "Selected Month";


    /*
        Client specifically requested that
        generated reports exclude the
        student's name.

        Report includes:

        - Violation Type
        - College
        - Date
        - Time
    */


    let rows = "";


    selectedMonthViolations.forEach(
        function (violation) {

            let college =
                "Unspecified";


            if (
                violation.students &&
                violation.students.college
            ) {

                college =
                    violation.students.college;
            }


            rows +=
                "<tr>" +

                    "<td>" +
                        escapeHtml(
                            violation.violation_type ||
                            "Unspecified"
                        ) +
                    "</td>" +

                    "<td>" +
                        escapeHtml(
                            college
                        ) +
                    "</td>" +

                    "<td>" +
                        escapeHtml(
                            formatDate(
                                violation.date_time
                            )
                        ) +
                    "</td>" +

                    "<td>" +
                        escapeHtml(
                            formatTime(
                                violation.date_time
                            )
                        ) +
                    "</td>" +

                "</tr>";
        }
    );


    if (
        selectedMonthViolations.length ===
        0
    ) {

        rows =
            "<tr>" +
                "<td colspan=\"4\" class=\"empty\">" +
                    "No violation records for this month." +
                "</td>" +
            "</tr>";
    }


    const reportWindow =
        window.open(
            "",
            "_blank"
        );


    if (!reportWindow) {

        alert(
            "Please allow pop-ups to generate the report."
        );

        return;
    }


    const reportHtml =
        "<!DOCTYPE html>" +

        "<html>" +

        "<head>" +

            "<meta charset=\"UTF-8\">" +

            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">" +

            "<title>CSUPAK Violation Report</title>" +

            "<style>" +

                "body {" +
                    "font-family: Arial, sans-serif;" +
                    "margin: 40px;" +
                    "color: #1f2937;" +
                "}" +

                ".header {" +
                    "border-bottom: 3px solid #006B21;" +
                    "padding-bottom: 18px;" +
                    "margin-bottom: 25px;" +
                "}" +

                ".system-name {" +
                    "font-size: 26px;" +
                    "font-weight: 800;" +
                    "color: #006B21;" +
                    "margin: 0;" +
                "}" +

                ".subtitle {" +
                    "margin-top: 5px;" +
                    "font-size: 12px;" +
                    "color: #6b7280;" +
                "}" +

                ".report-title {" +
                    "margin-top: 24px;" +
                    "font-size: 20px;" +
                    "font-weight: 700;" +
                "}" +

                ".summary {" +
                    "display: flex;" +
                    "gap: 15px;" +
                    "margin-bottom: 24px;" +
                "}" +

                ".summary-card {" +
                    "border: 1px solid #e5e7eb;" +
                    "border-radius: 8px;" +
                    "padding: 14px 18px;" +
                "}" +

                ".summary-label {" +
                    "font-size: 11px;" +
                    "color: #6b7280;" +
                    "margin-bottom: 4px;" +
                "}" +

                ".summary-value {" +
                    "font-size: 22px;" +
                    "font-weight: 700;" +
                    "color: #006B21;" +
                "}" +

                "table {" +
                    "width: 100%;" +
                    "border-collapse: collapse;" +
                    "margin-top: 15px;" +
                "}" +

                "th {" +
                    "background: #006B21;" +
                    "color: white;" +
                    "text-align: left;" +
                    "padding: 10px;" +
                    "font-size: 12px;" +
                "}" +

                "td {" +
                    "padding: 10px;" +
                    "border-bottom: 1px solid #e5e7eb;" +
                    "font-size: 12px;" +
                "}" +

                ".empty {" +
                    "text-align: center;" +
                    "padding: 25px;" +
                    "color: #6b7280;" +
                "}" +

                ".footer {" +
                    "margin-top: 35px;" +
                    "font-size: 10px;" +
                    "color: #9ca3af;" +
                "}" +

                "@media print {" +

                    "body {" +
                        "margin: 20px;" +
                    "}" +

                    ".no-print {" +
                        "display: none;" +
                    "}" +
                "}" +

            "</style>" +

        "</head>" +

        "<body>" +

            "<div class=\"header\">" +

                "<p class=\"system-name\">" +
                    "CSUPAK" +
                "</p>" +

                "<p class=\"subtitle\">" +
                    "Student Violation Tracking System" +
                "</p>" +

                "<p class=\"report-title\">" +
                    "Violation Report — " +
                    escapeHtml(
                        monthName
                    ) +
                "</p>" +

            "</div>" +


            "<div class=\"summary\">" +

                "<div class=\"summary-card\">" +

                    "<div class=\"summary-label\">" +
                        "TOTAL VIOLATIONS" +
                    "</div>" +

                    "<div class=\"summary-value\">" +
                        selectedMonthViolations.length +
                    "</div>" +

                "</div>" +

            "</div>" +


            "<table>" +

                "<thead>" +

                    "<tr>" +

                        "<th>" +
                            "Violation Type" +
                        "</th>" +

                        "<th>" +
                            "College" +
                        "</th>" +

                        "<th>" +
                            "Date" +
                        "</th>" +

                        "<th>" +
                            "Time" +
                        "</th>" +

                    "</tr>" +

                "</thead>" +

                "<tbody>" +

                    rows +

                "</tbody>" +

            "</table>" +


            "<div class=\"footer\">" +

                "Generated through CSUPAK. " +
                "Student names are excluded from this report." +

            "</div>" +


            "<script>" +

                "window.onload = function () {" +

                    "window.print();" +

                "};" +

            "</script>" +

        "</body>" +

        "</html>";


    reportWindow.document.open();

    reportWindow.document.write(
        reportHtml
    );

    reportWindow.document.close();
}


/* =====================================================
   EVENT LISTENERS
===================================================== */


/*
    MONTH CHANGE
*/

if (reportMonth) {

    reportMonth.addEventListener(
        "change",
        function () {

            /*
                Remember selected month.
            */

            localStorage.setItem(
                "csupakReportMonth",
                reportMonth.value
            );


            renderDashboard();
        }
    );
}


/*
    GENERATE REPORT
*/

if (generateReportButton) {

    generateReportButton
        .addEventListener(
            "click",
            generateReport
        );
}


/*
    CLOSE COLLEGE MODAL
*/

if (closeCollegeModal) {

    closeCollegeModal
        .addEventListener(
            "click",
            hideCollegeModal
        );
}


if (closeCollegeModalBottom) {

    closeCollegeModalBottom
        .addEventListener(
            "click",
            hideCollegeModal
        );
}


/*
    CLOSE MODAL WHEN CLICKING
    DARK BACKGROUND
*/

if (collegeModal) {

    collegeModal.addEventListener(
        "click",
        function (event) {

            if (
                event.target ===
                collegeModal
            ) {

                hideCollegeModal();
            }
        }
    );
}


/*
    ESCAPE KEY
*/

document.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key === "Escape"
        ) {

            hideCollegeModal();
        }
    }
);


/*
    LOGOUT
*/

if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        async function () {

            await logout();
        }
    );
}


/* =====================================================
   RESTORE MONTH
===================================================== */

function restoreSelectedMonth() {

    if (!reportMonth) {
        return;
    }


    const savedMonth =
        localStorage.getItem(
            "csupakReportMonth"
        );


    if (savedMonth) {

        reportMonth.value =
            savedMonth;

        return;
    }


    /*
        If no saved month exists,
        use the current month.
    */

    const currentMonth =
        new Date().getMonth() + 1;


    reportMonth.value =
        String(
            currentMonth
        );
}


/* =====================================================
   INITIALIZE DASHBOARD
===================================================== */

async function initializeDashboard() {

    restoreSelectedMonth();


    const userLoaded =
        await loadUserProfile();


    if (!userLoaded) {
        return;
    }


    const semesterLoaded =
        await loadActiveSemester();


    if (!semesterLoaded) {

        if (totalViolations) {

            totalViolations.textContent =
                "0";
        }


        if (collegeCards) {

            collegeCards.innerHTML =
                "<div class=\"col-span-full rounded-xl bg-white/10 px-4 py-6 text-center text-sm text-green-100\">" +
                    "No active semester found." +
                "</div>";
        }


        return;
    }


    await loadViolations();
}


/* =====================================================
   START
===================================================== */

initializeDashboard();