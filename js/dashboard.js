/* =====================================================
   CSUPAK DASHBOARD
===================================================== */

console.log("CSUPAK DASHBOARD JS LOADED");

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


/* =====================================================
   REPORT
===================================================== */

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

const reportSemesterName =
    document.getElementById(
        "reportSemesterName"
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

let monthlyViolations = [];

const VIOLATION_BATCH_SIZE = 500;
let violationsComplete = false;
let violationsLoadError = null;
let violationsErrorMessage = null;

if (generateReportButton) generateReportButton.disabled = true;


/* =====================================================
   LOAD PROFILE
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

        showElement(
            complaintsNav
        );

        showElement(
            complaintTrackingNav
        );

        showElement(
            interviewTrackingNav
        );

        showElement(
            complaintsCard
        );


        if (complaintTrackingNav) {

            complaintTrackingNav.href =
                "complaint-tracking.html";
        }
    }


    /* =================================================
       OSWE STAFF
    ================================================= */

    else if (
        currentProfile.role ===
        "oswe_staff"
    ) {

        showElement(
            complaintsNav
        );

        hideElement(
            complaintTrackingNav
        );

        showElement(
            interviewTrackingNav
        );

        showElement(
            complaintsCard
        );
    }


    /* =================================================
       SECURITY
    ================================================= */

    else {

        hideElement(
            complaintsNav
        );

        hideElement(
            complaintTrackingNav
        );

        hideElement(
            interviewTrackingNav
        );

        hideElement(
            complaintsCard
        );
    }


    /* =================================================
       REPORT ACCESS

       Admin: YES
       Staff: YES
       Security: NO
    ================================================= */

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


/* =====================================================
   SHOW ELEMENT
===================================================== */

function showElement(element) {

    if (!element) {

        return;
    }


    element.classList.remove(
        "hidden"
    );


    element.classList.add(
        "flex"
    );
}


/* =====================================================
   HIDE ELEMENT
===================================================== */

function hideElement(element) {

    if (!element) {

        return;
    }


    element.classList.add(
        "hidden"
    );


    element.classList.remove(
        "flex"
    );
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
            "Unable to load active semester:",
            result.error
        );

        return false;
    }


    activeSemester =
        result.data;


    if (
        activeSemester &&
        reportSemesterName
    ) {

        reportSemesterName.textContent =
            activeSemester.name;
    }


    return Boolean(
        activeSemester
    );
}


/* =====================================================
   LOAD VIOLATIONS

   Violation
   → Student
   → Course
   → College
===================================================== */

async function loadViolations() {
    violationsComplete = false;
    violationsLoadError = null;
    allViolations = [];
    monthlyViolations = [];
    if (generateReportButton) generateReportButton.disabled = true;
    if (violationsErrorMessage) violationsErrorMessage.hidden = true;
    renderDashboard();

    if (!activeSemester) {
        return;
    }

    // Publish only after every batch succeeds; never render a partial report.
    const retrievedViolations = [];
    const ids = new Set();
    let expectedTotal = null;
    let offset = 0;
    try {
        if (!activeSemester) {
            throw new Error("No active semester is configured.");
        }
        do {
            const result = await supabaseClient
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
                    course_id,
                    year_level,
                    courses (
                        id,
                        course_code,
                        course_name,
                        colleges (
                            id,
                            college_code,
                            college_name
                        )
                    )
                )
                `, { count: "exact" }
            )
                .eq("semester_id", activeSemester.id)
                .order("date_time", { ascending: false })
                .order("id", { ascending: false })
                .range(offset, offset + VIOLATION_BATCH_SIZE - 1);

            if (result.error) throw result.error;
            if (!Array.isArray(result.data) || !Number.isSafeInteger(result.count) ||
                result.count < 0 || result.data.length > VIOLATION_BATCH_SIZE) {
                throw new Error("Invalid violation batch returned.");
            }
            if (expectedTotal === null) expectedTotal = result.count;
            if (result.count !== expectedTotal) throw new Error("Violation count changed while loading.");
            if (!result.data.length && offset < expectedTotal) throw new Error("Premature empty violation batch.");
            for (const record of result.data) {
                if (!record || typeof record !== "object" || Array.isArray(record) ||
                    !["string", "number"].includes(typeof record.id) || !String(record.id).trim() ||
                    (typeof record.id === "number" && !Number.isFinite(record.id))) {
                    throw new Error("Invalid violation record returned.");
                }
                const id = String(record.id);
                if (ids.has(id)) throw new Error("Duplicate violation ID returned.");
                ids.add(id);
                retrievedViolations.push(record);
            }
            offset += result.data.length;
        } while (offset < expectedTotal);
        if (retrievedViolations.length !== expectedTotal || ids.size !== expectedTotal) {
            throw new Error("Incomplete violation dataset returned.");
        }
        allViolations = retrievedViolations;
        violationsComplete = true;
        if (generateReportButton) generateReportButton.disabled = false;
        renderDashboard();
    } catch (error) {
        console.error("Unable to load complete violation data:", error);
        violationsComplete = false;
        violationsLoadError = "Unable to load complete violation data. Dashboard totals and reports are unavailable. Reload the page to try again.";
        allViolations = [];
        monthlyViolations = [];
        if (generateReportButton) generateReportButton.disabled = true;
        renderDashboard();
    }
}


/* =====================================================
   RENDER DASHBOARD
===================================================== */

function renderDashboard() {
    if (!violationsComplete) {
        if (totalViolations) totalViolations.textContent = "Unavailable";
        if (violationTypeCards) {
            violationTypeCards.querySelectorAll("[data-violation-type-card]").forEach(function (card) {
                card.remove();
            });
        }
        if (collegeCards) collegeCards.innerHTML = "";
        if (recentRecords) recentRecords.innerHTML = "";
        if (violationsLoadError) {
            if (!violationsErrorMessage) {
                violationsErrorMessage = document.createElement("div");
                violationsErrorMessage.className = "mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700";
                violationsErrorMessage.setAttribute("role", "alert");
                welcomeMessage.insertAdjacentElement("afterend", violationsErrorMessage);
            }
            violationsErrorMessage.textContent = violationsLoadError;
            violationsErrorMessage.hidden = false;
        }
        return;
    }


    updateMonthTitle();

    filterByMonth();

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
   FILTER BY MONTH
===================================================== */

function getManilaMonth(date) {
    if (!Number.isFinite(date.getTime())) return NaN;
    return Number(new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        month: "numeric"
    }).format(date));
}

function filterByMonth() {

    const selectedMonth =
        Number(
            reportMonth.value
        );


    monthlyViolations =
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
                    getManilaMonth(date) ===
                    selectedMonth
                );
            }
        );
}


/* =====================================================
   VIOLATION TYPES
===================================================== */

function buildViolationTypeCounts(
    violations
) {

    const counts = {};


    violations.forEach(
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


    return counts;
}


/* =====================================================
   RENDER VIOLATION TYPES
===================================================== */

function renderViolationTypes() {

    if (
        !violationTypeCards ||
        !totalViolations
    ) {

        return;
    }


    totalViolations.textContent =
        monthlyViolations.length;


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


    const counts =
        buildViolationTypeCounts(
            monthlyViolations
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
   GET COURSE
===================================================== */

function getViolationCourse(
    violation
) {

    if (
        !violation.students ||
        !violation.students.courses
    ) {

        return null;
    }


    return violation.students.courses;
}


/* =====================================================
   GET COLLEGE
===================================================== */

function getViolationCollege(
    violation
) {

    const course =
        getViolationCourse(
            violation
        );


    if (
        !course ||
        !course.colleges
    ) {

        return null;
    }


    return course.colleges;
}


/* =====================================================
   COLLEGE SUMMARY

   Includes:
   - total per college
   - violation types per college
===================================================== */

function buildCollegeData(
    violations
) {

    const colleges = {};


    violations.forEach(
        function (violation) {

            const college =
                getViolationCollege(
                    violation
                );


            let name =
                "Unmapped College";


            let code =
                "UNMAPPED";


            if (college) {

                name =
                    college.college_name ||
                    "Unmapped College";


                code =
                    college.college_code ||
                    "UNMAPPED";
            }


            const key =
                code;


            if (!colleges[key]) {

                colleges[key] = {

                    code:
                        code,

                    name:
                        name,

                    total:
                        0,

                    types:
                        {}
                };
            }


            colleges[key].total++;


            const type =
                violation.violation_type ||
                "Unspecified";


            if (
                !colleges[
                    key
                ].types[type]
            ) {

                colleges[
                    key
                ].types[type] = 0;
            }


            colleges[
                key
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


    collegeCards.innerHTML =
        "";


    const colleges =
        buildCollegeData(
            monthlyViolations
        );


    const codes =
        Object.keys(
            colleges
        ).sort();


    if (
        codes.length === 0
    ) {

        collegeCards.innerHTML =
            "<div class=\"col-span-full rounded-xl bg-white/10 px-4 py-6 text-center text-sm text-green-100\">" +
                "No violation records for this month." +
            "</div>";


        return;
    }


    codes.forEach(
        function (code) {

            const data =
                colleges[code];


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


            const codeText =
                document.createElement(
                    "p"
                );


            codeText.className =
                "mt-1 text-xs font-bold text-gray-700";


            codeText.textContent =
                data.code;


            const name =
                document.createElement(
                    "p"
                );


            name.className =
                "mt-1 text-xs text-gray-500";


            name.textContent =
                data.name;


            button.appendChild(
                number
            );


            button.appendChild(
                codeText
            );


            button.appendChild(
                name
            );


            button.addEventListener(
                "click",
                function () {

                    openCollegeModal(
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
    data
) {

    modalCollegeName.textContent =
        data.code +
        " - " +
        data.name;


    const monthOption =
        reportMonth.options[
            reportMonth.selectedIndex
        ];


    modalCollegeMonth.textContent =
        monthOption
            ? monthOption.textContent
            : "Selected Month";


    modalCollegeTotal.textContent =
        data.total;


    modalViolationBreakdown.innerHTML =
        "";


    const types =
        Object.keys(
            data.types
        ).sort();


    if (
        types.length === 0
    ) {

        modalViolationBreakdown.innerHTML =
            "<div class=\"px-4 py-5 text-center text-sm text-gray-500\">" +
                "No violation records." +
            "</div>";

    } else {

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


            const course =
                getViolationCourse(
                    violation
                );


            const detail =
                document.createElement(
                    "p"
                );


            detail.className =
                "mt-1 text-xs text-gray-500";


            let detailText =
                violation.violation_type ||
                "Unspecified";


            if (
                course &&
                course.course_code
            ) {

                detailText +=
                    " • " +
                    course.course_code;
            }


            if (
                violation.students &&
                violation.students.year_level
            ) {

                detailText +=
                    " " +
                    violation.students.year_level;
            }


            detail.textContent =
                detailText;


            left.appendChild(
                name
            );


            left.appendChild(
                detail
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
   ESCAPE HTML
===================================================== */

function escapeHtml(value) {

    return String(
        value || ""
    )
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
   REPORT - VIOLATIONS PER TYPE
===================================================== */

function buildTypeReportRows(
    typeCounts
) {

    const types =
        Object.keys(
            typeCounts
        ).sort();


    if (
        types.length === 0
    ) {

        return (
            "<tr>" +
                "<td colspan=\"2\" class=\"empty\">" +
                    "No violation records." +
                "</td>" +
            "</tr>"
        );
    }


    let rows = "";


    types.forEach(
        function (type) {

            rows +=
                "<tr>" +

                    "<td>" +
                        escapeHtml(
                            type
                        ) +
                    "</td>" +

                    "<td class=\"number\">" +
                        typeCounts[type] +
                    "</td>" +

                "</tr>";
        }
    );


    return rows;
}


/* =====================================================
   REPORT - COLLEGE TOTALS
===================================================== */

function buildCollegeReportRows(
    collegeData
) {

    const codes =
        Object.keys(
            collegeData
        ).sort();


    if (
        codes.length === 0
    ) {

        return (
            "<tr>" +
                "<td colspan=\"3\" class=\"empty\">" +
                    "No violation records." +
                "</td>" +
            "</tr>"
        );
    }


    let rows = "";


    codes.forEach(
        function (code) {

            const college =
                collegeData[code];


            rows +=
                "<tr>" +

                    "<td>" +
                        escapeHtml(
                            college.code
                        ) +
                    "</td>" +

                    "<td>" +
                        escapeHtml(
                            college.name
                        ) +
                    "</td>" +

                    "<td class=\"number\">" +
                        college.total +
                    "</td>" +

                "</tr>";
        }
    );


    return rows;
}


/* =====================================================
   REPORT - TYPES PER COLLEGE
===================================================== */

function buildCollegeTypeSections(
    collegeData
) {

    const codes =
        Object.keys(
            collegeData
        ).sort();


    if (
        codes.length === 0
    ) {

        return (
            "<p class=\"empty-block\">" +
                "No violation records." +
            "</p>"
        );
    }


    let sections = "";


    codes.forEach(
        function (code) {

            const college =
                collegeData[code];


            const types =
                Object.keys(
                    college.types
                ).sort();


            let rows = "";


            types.forEach(
                function (type) {

                    rows +=
                        "<tr>" +

                            "<td>" +
                                escapeHtml(
                                    type
                                ) +
                            "</td>" +

                            "<td class=\"number\">" +
                                college.types[
                                    type
                                ] +
                            "</td>" +

                        "</tr>";
                }
            );


            if (!rows) {

                rows =
                    "<tr>" +

                        "<td colspan=\"2\" class=\"empty\">" +
                            "No violation records." +
                        "</td>" +

                    "</tr>";
            }


            sections +=

                "<div class=\"college-section\">" +

                    "<h3>" +
                        escapeHtml(
                            college.code
                        ) +
                        " - " +
                        escapeHtml(
                            college.name
                        ) +
                    "</h3>" +

                    "<p class=\"college-total\">" +
                        "Total Violations: " +
                        college.total +
                    "</p>" +

                    "<table>" +

                        "<thead>" +

                            "<tr>" +

                                "<th>Violation Type</th>" +

                                "<th>Number of Violations</th>" +

                            "</tr>" +

                        "</thead>" +

                        "<tbody>" +

                            rows +

                        "</tbody>" +

                    "</table>" +

                "</div>";
        }
    );


    return sections;
}


/* =====================================================
   GENERATE REPORT
===================================================== */

function generateReport() {

    if (
        !currentProfile ||
        (
            currentProfile.role !== "oswe_admin" &&
            currentProfile.role !== "oswe_staff"
        )
    ) {

        alert(
            "You do not have permission to generate reports."
        );

        return;
    }


    if (!violationsComplete) {
        alert("Complete violation data is unavailable. Wait for loading to finish or reload the page before generating a report.");
        return;
    }

    const monthOption =
        reportMonth.options[
            reportMonth.selectedIndex
        ];


    const monthName =
        monthOption
            ? monthOption.textContent
            : "Selected Month";


    const semesterName =
        activeSemester
            ? activeSemester.name
            : "Active Semester";


    /*
        1. TOTAL VIOLATIONS
    */

    const total =
        monthlyViolations.length;


    /*
        2. NUMBER PER TYPE
    */

    const typeCounts =
        buildViolationTypeCounts(
            monthlyViolations
        );


    /*
        3. TOTAL PER COLLEGE

        4. NUMBER PER TYPE
           PER COLLEGE
    */

    const collegeData =
        buildCollegeData(
            monthlyViolations
        );


    const typeRows =
        buildTypeReportRows(
            typeCounts
        );


    const collegeRows =
        buildCollegeReportRows(
            collegeData
        );


    const collegeTypeSections =
        buildCollegeTypeSections(
            collegeData
        );


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

            "<meta charset=\"UTF-8\">" +

            "<title>CSUPAK Violation Report</title>" +

            "<style>" +

                "body{" +
                    "font-family:Arial,sans-serif;" +
                    "margin:40px;" +
                    "color:#222;" +
                    "font-size:14px;" +
                "}" +

                "h1{" +
                    "margin:0;" +
                    "color:#006B21;" +
                    "font-size:28px;" +
                "}" +

                "h2{" +
                    "margin-top:6px;" +
                    "margin-bottom:20px;" +
                    "font-size:20px;" +
                "}" +

                "h3{" +
                    "margin-top:0;" +
                    "margin-bottom:5px;" +
                    "font-size:16px;" +
                "}" +

                ".meta{" +
                    "margin:5px 0;" +
                    "color:#555;" +
                "}" +

                ".summary{" +
                    "margin-top:25px;" +
                    "padding:18px;" +
                    "border:1px solid #ddd;" +
                    "border-radius:8px;" +
                "}" +

                ".summary-label{" +
                    "margin:0;" +
                    "color:#555;" +
                    "font-size:13px;" +
                "}" +

                ".summary-number{" +
                    "margin:5px 0 0 0;" +
                    "font-size:32px;" +
                    "font-weight:bold;" +
                    "color:#006B21;" +
                "}" +

                ".section{" +
                    "margin-top:30px;" +
                "}" +

                ".section-title{" +
                    "margin-bottom:10px;" +
                    "font-size:17px;" +
                    "font-weight:bold;" +
                "}" +

                "table{" +
                    "width:100%;" +
                    "border-collapse:collapse;" +
                "}" +

                "th{" +
                    "background:#006B21;" +
                    "color:white;" +
                    "padding:10px;" +
                    "text-align:left;" +
                    "border:1px solid #006B21;" +
                "}" +

                "td{" +
                    "padding:10px;" +
                    "border:1px solid #ddd;" +
                "}" +

                ".number{" +
                    "width:160px;" +
                    "text-align:center;" +
                    "font-weight:bold;" +
                "}" +

                ".empty{" +
                    "padding:20px;" +
                    "text-align:center;" +
                    "color:#777;" +
                "}" +

                ".empty-block{" +
                    "padding:20px;" +
                    "text-align:center;" +
                    "border:1px solid #ddd;" +
                    "color:#777;" +
                "}" +

                ".college-section{" +
                    "margin-top:20px;" +
                    "page-break-inside:avoid;" +
                "}" +

                ".college-total{" +
                    "margin-top:0;" +
                    "margin-bottom:10px;" +
                    "color:#555;" +
                "}" +

                "@media print{" +

                    "body{" +
                        "margin:20px;" +
                    "}" +

                "}" +

            "</style>" +

        "</head>" +

        "<body>" +


            "<h1>CSUPAK</h1>" +

            "<h2>Monthly Violation Report</h2>" +


            "<p class=\"meta\">" +
                "<strong>Semester:</strong> " +
                escapeHtml(
                    semesterName
                ) +
            "</p>" +


            "<p class=\"meta\">" +
                "<strong>Month:</strong> " +
                escapeHtml(
                    monthName
                ) +
            "</p>" +



            /* =============================================
               1. TOTAL VIOLATIONS
            ============================================= */

            "<div class=\"summary\">" +

                "<p class=\"summary-label\">" +
                    "Total Violations" +
                "</p>" +

                "<p class=\"summary-number\">" +
                    total +
                "</p>" +

            "</div>" +



            /* =============================================
               2. NUMBER PER TYPE
            ============================================= */

            "<div class=\"section\">" +

                "<div class=\"section-title\">" +
                    "Number of Violations per Type" +
                "</div>" +

                "<table>" +

                    "<thead>" +

                        "<tr>" +

                            "<th>Violation Type</th>" +

                            "<th>Number of Violations</th>" +

                        "</tr>" +

                    "</thead>" +

                    "<tbody>" +

                        typeRows +

                    "</tbody>" +

                "</table>" +

            "</div>" +



            /* =============================================
               3. TOTAL PER COLLEGE
            ============================================= */

            "<div class=\"section\">" +

                "<div class=\"section-title\">" +
                    "Total Violations per College" +
                "</div>" +

                "<table>" +

                    "<thead>" +

                        "<tr>" +

                            "<th>College Code</th>" +

                            "<th>College</th>" +

                            "<th>Total Violations</th>" +

                        "</tr>" +

                    "</thead>" +

                    "<tbody>" +

                        collegeRows +

                    "</tbody>" +

                "</table>" +

            "</div>" +



            /* =============================================
               4. TYPE PER COLLEGE
            ============================================= */

            "<div class=\"section\">" +

                "<div class=\"section-title\">" +
                    "Number of Violations per Type per College" +
                "</div>" +

                collegeTypeSections +

            "</div>" +


            "<script>" +

                "window.onload = function () {" +

                    "window.print();" +

                "};" +

            "</script>" +


        "</body>" +

        "</html>"
    );


    reportWindow.document.close();
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
            getManilaMonth(new Date())
        );
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
   INITIALIZE
===================================================== */

async function initializeDashboard() {

    console.log("1. Dashboard initialization started");

    restoreSelectedMonth();


    const userLoaded =
        await loadUserProfile();

    console.log(
        "2. User loaded:",
        userLoaded
    );


    if (!userLoaded) {

        console.log(
            "Dashboard stopped: user profile failed."
        );

        return;
    }


    const semesterLoaded =
        await loadActiveSemester();

    console.log(
        "3. Semester loaded:",
        semesterLoaded,
        activeSemester
    );


    if (!semesterLoaded) {

        console.log(
            "Dashboard stopped: active semester failed."
        );

        return;
    }


    console.log(
        "4. About to load violations"
    );


    await loadViolations();


    console.log(
        "5. Violations loading finished",
        allViolations
    );
}


initializeDashboard();

//FIX
