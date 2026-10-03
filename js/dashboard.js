/* =====================================================
   CSUPAK DASHBOARD
===================================================== */


/* =====================================================
   ELEMENTS
===================================================== */

const welcomeMessage =
    document.getElementById(
        "welcomeMessage"
    );

const roleMessage =
    document.getElementById(
        "roleMessage"
    );

const logoutButton =
    document.getElementById(
        "logoutButton"
    );


const complaintsNav =
    document.getElementById(
        "complaintsNav"
    );

const complaintTrackingNav =
    document.getElementById(
        "complaintTrackingNav"
    );

const interviewTrackingNav =
    document.getElementById(
        "interviewTrackingNav"
    );

const complaintsCard =
    document.getElementById(
        "complaintsCard"
    );

const recordViolationCard =
    document.getElementById(
        "recordViolationCard"
    );


const monthlyReportSection =
    document.getElementById(
        "monthlyReportSection"
    );

const reportMonth =
    document.getElementById(
        "reportMonth"
    );

const reportMonthTitle =
    document.getElementById(
        "reportMonthTitle"
    );

const generateReportButton =
    document.getElementById(
        "generateReportButton"
    );

const totalViolations =
    document.getElementById(
        "totalViolations"
    );

const violationTypeCards =
    document.getElementById(
        "violationTypeCards"
    );

const collegeCards =
    document.getElementById(
        "collegeCards"
    );

const recentRecords =
    document.getElementById(
        "recentRecords"
    );


/* =====================================================
   COLLEGE MODAL
===================================================== */

const collegeModal =
    document.getElementById(
        "collegeModal"
    );

const modalCollegeName =
    document.getElementById(
        "modalCollegeName"
    );

const modalCollegeMonth =
    document.getElementById(
        "modalCollegeMonth"
    );

const modalCollegeTotal =
    document.getElementById(
        "modalCollegeTotal"
    );

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
   USER PROFILE
===================================================== */

async function loadUserProfile() {

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
   ROLE NAME
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
   ROLE PERMISSIONS
===================================================== */

function applyRolePermissions() {

    if (!currentProfile) {

        return;
    }


    /*
        EVERY ROLE CAN RECORD VIOLATIONS
    */

    if (recordViolationCard) {

        recordViolationCard
            .classList
            .remove(
                "hidden"
            );
    }


    /* =================================================
       OSWE ADMIN
    ================================================= */

    if (
        currentProfile.role ===
        "oswe_admin"
    ) {

        /*
            ADD COMPLAINT
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
            COMPLAINT TRACKING
        */

        if (complaintTrackingNav) {

            complaintTrackingNav.href =
                "complaint-tracking.html";


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
            INTERVIEW TRACKING
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
            QUICK ACTION
        */

        if (complaintsCard) {

            complaintsCard.href =
                "complaints.html";


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


            const texts =
                complaintsCard
                    .querySelectorAll(
                        "p"
                    );


            if (texts[0]) {

                texts[0].textContent =
                    "Add Complaint";
            }


            if (texts[1]) {

                texts[1].textContent =
                    "Record a new complaint";
            }
        }
    }


    /* =================================================
       OSWE STAFF
    ================================================= */

    else if (
        currentProfile.role ===
        "oswe_staff"
    ) {

        /*
            ADD COMPLAINT
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
            NO COMPLAINT TRACKING
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
            INTERVIEW TRACKING

            STAFF CAN ACCESS THIS.
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
            QUICK ACTION
        */

        if (complaintsCard) {

            complaintsCard.href =
                "complaints.html";


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


            const texts =
                complaintsCard
                    .querySelectorAll(
                        "p"
                    );


            if (texts[0]) {

                texts[0].textContent =
                    "Add Complaint";
            }


            if (texts[1]) {

                texts[1].textContent =
                    "Record a new complaint";
            }
        }
    }


    /* =================================================
       SECURITY OFFICE
    ================================================= */

    else {

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


    /* =================================================
       MONTHLY REPORT

       Admin: YES
       Staff: YES
       Security: NO
    ================================================= */

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
   ACTIVE SEMESTER
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


    return Boolean(
        activeSemester
    );
}


/* =====================================================
   VIOLATIONS
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
   RENDER DASHBOARD
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


    const option =
        reportMonth.options[
            reportMonth.selectedIndex
        ];


    if (option) {

        reportMonthTitle.textContent =
            option.textContent;
    }
}


/* =====================================================
   FILTER MONTH
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
   VIOLATION TYPE CARDS
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


    const oldCards =
        violationTypeCards
            .querySelectorAll(
                "[data-violation-type-card]"
            );


    oldCards.forEach(
        function (card) {

            card.remove();
        }
    );


    const counts = {};


    selectedMonthViolations.forEach(
        function (violation) {

            const type =
                violation.violation_type ||
                "Unspecified";


            if (!counts[type]) {

                counts[type] = 0;
            }


            counts[type]++;
        }
    );


    Object.keys(
        counts
    )
        .sort()
        .forEach(
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
                    counts[type];


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
   COLLEGE DATA
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


            const type =
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
   COLLEGE CARDS
===================================================== */

function renderCollegeCards() {

    if (!collegeCards) {

        return;
    }


    collegeCards.innerHTML =
        "";


    const colleges =
        buildCollegeData();


    const names =
        Object.keys(
            colleges
        ).sort();


    if (
        names.length === 0
    ) {

        collegeCards.innerHTML =
            "<div class=\"col-span-full rounded-xl bg-white/10 px-4 py-6 text-center text-sm text-green-100\">" +
                "No violation records for this month." +
            "</div>";


        return;
    }


    names.forEach(
        function (name) {

            const data =
                colleges[name];


            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.className =
                "rounded-xl bg-white px-4 py-4 text-left transition hover:-translate-y-0.5 hover:shadow-md";


            const number =
                document.createElement(
                    "p"
                );


            number.className =
                "text-2xl font-bold text-[#006B21]";


            number.textContent =
                data.total;


            const label =
                document.createElement(
                    "p"
                );


            label.className =
                "mt-1 truncate text-xs font-semibold text-gray-600";


            label.textContent =
                name;


            button.appendChild(
                number
            );


            button.appendChild(
                label
            );


            button.addEventListener(
                "click",
                function () {

                    openCollegeModal(
                        name,
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
   COLLEGE MODAL
===================================================== */

function openCollegeModal(
    name,
    data
) {

    modalCollegeName.textContent =
        name;


    const option =
        reportMonth.options[
            reportMonth.selectedIndex
        ];


    if (option) {

        modalCollegeMonth.textContent =
            option.textContent;
    }


    modalCollegeTotal.textContent =
        data.total;


    modalViolationBreakdown.innerHTML =
        "";


    const types =
        Object.keys(
            data.types
        ).sort();


    types.forEach(
        function (type, index) {

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


            const label =
                document.createElement(
                    "p"
                );


            label.className =
                "text-sm text-gray-700";


            label.textContent =
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
                label
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


    collegeModal.classList.remove(
        "hidden"
    );


    collegeModal.classList.add(
        "flex"
    );
}


/* =====================================================
   CLOSE MODAL
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


    recentRecords.innerHTML =
        "";


    const records =
        allViolations.slice(
            0,
            5
        );


    if (
        records.length === 0
    ) {

        recentRecords.innerHTML =
            "<div class=\"rounded-xl bg-gray-50 px-4 py-8 text-center\">" +
                "<p class=\"text-sm text-gray-500\">" +
                    "No recent violation records." +
                "</p>" +
            "</div>";


        return;
    }


    const container =
        document.createElement(
            "div"
        );


    container.className =
        "space-y-2";


    records.forEach(
        function (violation) {

            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3";


            const left =
                document.createElement(
                    "div"
                );


            const name =
                document.createElement(
                    "p"
                );


            name.className =
                "text-sm font-semibold text-gray-800";


            name.textContent =
                violation.students &&
                violation.students.student_name
                    ? violation.students.student_name
                    : "Unknown Student";


            const type =
                document.createElement(
                    "p"
                );


            type.className =
                "mt-1 text-xs text-gray-500";


            type.textContent =
                violation.violation_type ||
                "Unspecified";


            left.appendChild(
                name
            );


            left.appendChild(
                type
            );


            const status =
                document.createElement(
                    "span"
                );


            status.className =
                "text-xs font-semibold text-[#006B21]";


            status.textContent =
                violation.status ||
                "Pending";


            row.appendChild(
                left
            );


            row.appendChild(
                status
            );


            container.appendChild(
                row
            );
        }
    );


    recentRecords.appendChild(
        container
    );
}


/* =====================================================
   REPORT HELPERS
===================================================== */

function formatDate(value) {

    if (!value) {

        return "—";
    }


    const date =
        new Date(value);


    return date.toLocaleDateString(
        "en-PH",
        {
            year: "numeric",
            month: "short",
            day: "numeric"
        }
    );
}


function formatTime(value) {

    if (!value) {

        return "—";
    }


    const date =
        new Date(value);


    return date.toLocaleTimeString(
        "en-PH",
        {
            hour: "numeric",
            minute: "2-digit"
        }
    );
}


/* =====================================================
   GENERATE REPORT
===================================================== */

function generateReport() {

    if (
        !currentProfile ||
        currentProfile.role ===
            "security_office"
    ) {

        alert(
            "You do not have permission to generate reports."
        );

        return;
    }


    const option =
        reportMonth.options[
            reportMonth.selectedIndex
        ];


    const monthName =
        option
            ? option.textContent
            : "Selected Month";


    let rows = "";


    selectedMonthViolations.forEach(
        function (violation) {

            const college =
                violation.students &&
                violation.students.college
                    ? violation.students.college
                    : "Unspecified";


            rows +=
                "<tr>" +

                    "<td>" +
                        (
                            violation.violation_type ||
                            "Unspecified"
                        ) +
                    "</td>" +

                    "<td>" +
                        college +
                    "</td>" +

                    "<td>" +
                        formatDate(
                            violation.date_time
                        ) +
                    "</td>" +

                    "<td>" +
                        formatTime(
                            violation.date_time
                        ) +
                    "</td>" +

                "</tr>";
        }
    );


    if (!rows) {

        rows =
            "<tr>" +
                "<td colspan=\"4\" style=\"text-align:center;padding:20px;\">" +
                    "No violation records." +
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


    reportWindow.document.write(
        "<!DOCTYPE html>" +

        "<html>" +

        "<head>" +

            "<title>CSUPAK Report</title>" +

            "<style>" +

                "body{" +
                    "font-family:Arial,sans-serif;" +
                    "margin:40px;" +
                "}" +

                "h1{" +
                    "color:#006B21;" +
                "}" +

                "table{" +
                    "width:100%;" +
                    "border-collapse:collapse;" +
                    "margin-top:25px;" +
                "}" +

                "th{" +
                    "background:#006B21;" +
                    "color:white;" +
                    "padding:10px;" +
                    "text-align:left;" +
                "}" +

                "td{" +
                    "padding:10px;" +
                    "border-bottom:1px solid #ddd;" +
                "}" +

            "</style>" +

        "</head>" +

        "<body>" +

            "<h1>CSUPAK</h1>" +

            "<h2>Violation Report - " +
                monthName +
            "</h2>" +

            "<p>Total Violations: " +
                selectedMonthViolations.length +
            "</p>" +

            "<table>" +

                "<thead>" +

                    "<tr>" +

                        "<th>Violation Type</th>" +
                        "<th>College</th>" +
                        "<th>Date</th>" +
                        "<th>Time</th>" +

                    "</tr>" +

                "</thead>" +

                "<tbody>" +

                    rows +

                "</tbody>" +

            "</table>" +

            "<script>" +
                "window.onload=function(){" +
                    "window.print();" +
                "};" +
            "</script>" +

        "</body>" +

        "</html>"
    );


    reportWindow.document.close();
}


/* =====================================================
   EVENTS
===================================================== */

if (reportMonth) {

    reportMonth.addEventListener(
        "change",
        function () {

            localStorage.setItem(
                "csupakReportMonth",
                reportMonth.value
            );


            renderDashboard();
        }
    );
}


if (generateReportButton) {

    generateReportButton.addEventListener(
        "click",
        generateReport
    );
}


if (closeCollegeModal) {

    closeCollegeModal.addEventListener(
        "click",
        hideCollegeModal
    );
}


if (closeCollegeModalBottom) {

    closeCollegeModalBottom.addEventListener(
        "click",
        hideCollegeModal
    );
}


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


if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        async function () {

            await logout();
        }
    );
}


/* =====================================================
   MONTH
===================================================== */

function restoreSelectedMonth() {

    if (!reportMonth) {

        return;
    }


    const saved =
        localStorage.getItem(
            "csupakReportMonth"
        );


    if (saved) {

        reportMonth.value =
            saved;

        return;
    }


    reportMonth.value =
        String(
            new Date().getMonth() + 1
        );
}


/* =====================================================
   INITIALIZE
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

        console.warn(
            "No active semester."
        );

        return;
    }


    await loadViolations();
}


initializeDashboard();