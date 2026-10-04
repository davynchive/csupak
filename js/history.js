/* =====================================================
   CSUPAK - STUDENT HISTORY
===================================================== */


/* =====================================================
   ELEMENTS
===================================================== */

const pageContent =
    document.getElementById(
        "pageContent"
    );

const userName =
    document.getElementById(
        "userName"
    );

const userRole =
    document.getElementById(
        "userRole"
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


/* =====================================================
   SEARCH
===================================================== */

const studentSearch =
    document.getElementById(
        "studentSearch"
    );

const searchButton =
    document.getElementById(
        "searchButton"
    );

const searchMessage =
    document.getElementById(
        "searchMessage"
    );

const searchResultsSection =
    document.getElementById(
        "searchResultsSection"
    );

const searchResultCount =
    document.getElementById(
        "searchResultCount"
    );

const searchResults =
    document.getElementById(
        "searchResults"
    );


/* =====================================================
   STUDENT HISTORY
===================================================== */

const studentHistorySection =
    document.getElementById(
        "studentHistorySection"
    );

const selectedStudentName =
    document.getElementById(
        "selectedStudentName"
    );

const selectedStudentId =
    document.getElementById(
        "selectedStudentId"
    );

const selectedStudentCourse =
    document.getElementById(
        "selectedStudentCourse"
    );

const selectedStudentCollege =
    document.getElementById(
        "selectedStudentCollege"
    );

const totalViolationCount =
    document.getElementById(
        "totalViolationCount"
    );

const semesterFilter =
    document.getElementById(
        "semesterFilter"
    );

const historyRecords =
    document.getElementById(
        "historyRecords"
    );


/* =====================================================
   GLOBAL DATA
===================================================== */

let currentProfile = null;

let selectedStudent = null;

let selectedStudentViolations = [];


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
        ALL CURRENT AUTHORIZED ROLES
        CAN VIEW STUDENT HISTORY
    */

    if (
        currentProfile.role !==
            "security_office" &&
        currentProfile.role !==
            "oswe_staff" &&
        currentProfile.role !==
            "oswe_admin"
    ) {

        window.location.href =
            "dashboard.html";

        return false;
    }


    userName.textContent =
        currentProfile.full_name;


    userRole.textContent =
        getRoleDisplayName(
            currentProfile.role
        );


    applyNavigationPermissions();


    pageContent.classList.remove(
        "hidden"
    );


    return true;
}


/* =====================================================
   NAVIGATION
===================================================== */

function applyNavigationPermissions() {

    if (!currentProfile) {

        return;
    }


    if (
        currentProfile.role ===
            "oswe_staff" ||
        currentProfile.role ===
            "oswe_admin"
    ) {

        showNav(
            complaintsNav
        );


        showNav(
            interviewTrackingNav
        );
    }


    if (
        currentProfile.role ===
        "oswe_admin"
    ) {

        showNav(
            complaintTrackingNav
        );
    }
}


/* =====================================================
   SHOW NAV
===================================================== */

function showNav(element) {

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
   SEARCH MESSAGE
===================================================== */

function showSearchMessage(
    message
) {

    searchMessage.textContent =
        message;


    searchMessage.classList.remove(
        "hidden"
    );
}


function hideSearchMessage() {

    searchMessage.textContent =
        "";


    searchMessage.classList.add(
        "hidden"
    );
}


/* =====================================================
   SEARCH STUDENTS
===================================================== */

async function searchStudents() {

    const searchValue =
        studentSearch
            .value
            .trim();


    hideSearchMessage();


    searchResultsSection
        .classList
        .add(
            "hidden"
        );


    studentHistorySection
        .classList
        .add(
            "hidden"
        );


    if (!searchValue) {

        showSearchMessage(
            "Enter a Student ID or student name."
        );


        studentSearch.focus();


        return;
    }


    searchButton.disabled =
        true;


    searchButton.textContent =
        "Searching...";


    /*
        Search Student ID first.
    */

    const idResult =
        await supabaseClient
            .from("students")
            .select(
                `
                id,
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
                `
            )
            .ilike(
                "student_id",
                "%" +
                searchValue +
                "%"
            )
            .order(
                "student_name",
                {
                    ascending: true
                }
            );


    if (idResult.error) {

        console.error(
            "Unable to search students:",
            idResult.error
        );


        showSearchMessage(
            "Unable to search student records."
        );


        resetSearchButton();


        return;
    }


    /*
        Search name separately.

        This avoids trying to construct
        a complicated OR query while keeping
        the code easy to follow.
    */

    const nameResult =
        await supabaseClient
            .from("students")
            .select(
                `
                id,
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
                `
            )
            .ilike(
                "student_name",
                "%" +
                searchValue +
                "%"
            )
            .order(
                "student_name",
                {
                    ascending: true
                }
            );


    if (nameResult.error) {

        console.error(
            "Unable to search by student name:",
            nameResult.error
        );


        showSearchMessage(
            "Unable to search student records."
        );


        resetSearchButton();


        return;
    }


    const combined = [];


    idResult.data.forEach(
        function (student) {

            combined.push(
                student
            );
        }
    );


    nameResult.data.forEach(
        function (student) {

            const exists =
                combined.some(
                    function (existing) {

                        return (
                            existing.id ===
                            student.id
                        );
                    }
                );


            if (!exists) {

                combined.push(
                    student
                );
            }
        }
    );


    combined.sort(
        function (a, b) {

            return a.student_name.localeCompare(
                b.student_name
            );
        }
    );


    renderSearchResults(
        combined
    );


    resetSearchButton();
}


/* =====================================================
   RESET SEARCH BUTTON
===================================================== */

function resetSearchButton() {

    searchButton.disabled =
        false;


    searchButton.textContent =
        "Search";
}


/* =====================================================
   RENDER SEARCH RESULTS
===================================================== */

function renderSearchResults(
    students
) {

    searchResults.innerHTML =
        "";


    searchResultsSection
        .classList
        .remove(
            "hidden"
        );


    searchResultCount.textContent =
        students.length +
        (
            students.length === 1
                ? " student found"
                : " students found"
        );


    if (
        students.length === 0
    ) {

        searchResults.innerHTML =
            "<div class=\"rounded-xl bg-gray-50 px-4 py-10 text-center\">" +
                "<p class=\"text-sm text-gray-500\">" +
                    "No matching student was found." +
                "</p>" +
            "</div>";


        return;
    }


    const container =
        document.createElement(
            "div"
        );


    container.className =
        "space-y-3";


    students.forEach(
        function (student) {

            container.appendChild(
                createStudentResult(
                    student
                )
            );
        }
    );


    searchResults.appendChild(
        container
    );
}


/* =====================================================
   CREATE STUDENT RESULT
===================================================== */

function createStudentResult(
    student
) {

    const button =
        document.createElement(
            "button"
        );


    button.type =
        "button";


    button.className =
        "flex w-full flex-col gap-3 rounded-xl border border-gray-200 p-4 text-left transition hover:border-green-300 hover:bg-green-50 sm:flex-row sm:items-center sm:justify-between";


    const left =
        document.createElement(
            "div"
        );


    const name =
        document.createElement(
            "p"
        );


    name.className =
        "text-sm font-bold text-gray-900";


    name.textContent =
        student.student_name;


    const information =
        document.createElement(
            "p"
        );


    information.className =
        "mt-1 text-xs text-gray-500";


    information.textContent =
        getStudentInformationText(
            student
        );


    left.appendChild(
        name
    );


    left.appendChild(
        information
    );


    const action =
        document.createElement(
            "span"
        );


    action.className =
        "text-sm font-semibold text-[#006B21]";


    action.textContent =
        "View History →";


    button.appendChild(
        left
    );


    button.appendChild(
        action
    );


    button.addEventListener(
        "click",
        function () {

            loadStudentHistory(
                student
            );
        }
    );


    return button;
}


/* =====================================================
   STUDENT INFORMATION TEXT
===================================================== */

function getStudentInformationText(
    student
) {

    let text =
        student.student_id ||
        "No Student ID";


    const course =
        student.courses;


    if (
        course &&
        course.course_code
    ) {

        text +=
            " • " +
            course.course_code;
    }


    if (student.year_level) {

        text +=
            " " +
            getYearLabel(
                student.year_level
            );
    }


    if (
        course &&
        course.colleges &&
        course.colleges.college_code
    ) {

        text +=
            " • " +
            course.colleges.college_code;
    }


    return text;
}


/* =====================================================
   LOAD STUDENT HISTORY
===================================================== */

async function loadStudentHistory(
    student
) {

    selectedStudent =
        student;


    selectedStudentViolations =
        [];


    /*
        Show student information immediately.
    */

    displayStudentSummary(
        student
    );


    historyRecords.innerHTML =
        "<div class=\"rounded-xl bg-gray-50 px-4 py-10 text-center\">" +
            "<p class=\"text-sm text-gray-500\">" +
                "Loading violation history..." +
            "</p>" +
        "</div>";


    studentHistorySection
        .classList
        .remove(
            "hidden"
        );


    /*
        IMPORTANT:

        There is deliberately NO active-semester
        filter here.

        Student History should include records
        retained from previous semesters.
    */

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
                semester_id,
                semesters (
                    id,
                    name,
                    start_date,
                    end_date
                )
                `
            )
            .eq(
                "student_id",
                student.id
            )
            .order(
                "date_time",
                {
                    ascending: false
                }
            );


    if (result.error) {

        console.error(
            "Unable to load student history:",
            result.error
        );


        historyRecords.innerHTML =
            "<div class=\"rounded-xl bg-red-50 px-4 py-10 text-center\">" +
                "<p class=\"text-sm text-red-600\">" +
                    "Unable to load the student's violation history." +
                "</p>" +
            "</div>";


        return;
    }


    selectedStudentViolations =
        result.data || [];


    totalViolationCount.textContent =
        selectedStudentViolations.length;


    populateSemesterFilter();


    renderHistory();


    studentHistorySection.scrollIntoView({
        behavior:
            "smooth",

        block:
            "start"
    });
}


/* =====================================================
   STUDENT SUMMARY
===================================================== */

function displayStudentSummary(
    student
) {

    selectedStudentName.textContent =
        student.student_name ||
        "Unknown Student";


    selectedStudentId.textContent =
        student.student_id ||
        "No Student ID";


    const course =
        student.courses;


    let courseText =
        "Course not mapped";


    if (course) {

        courseText =
            course.course_code ||
            course.course_name ||
            "Course not mapped";


        if (student.year_level) {

            courseText +=
                " • " +
                getYearLabel(
                    student.year_level
                );
        }
    }


    selectedStudentCourse.textContent =
        courseText;


    let collegeText =
        "College not mapped";


    if (
        course &&
        course.colleges
    ) {

        if (
            course.colleges.college_code
        ) {

            collegeText =
                course.colleges.college_code;
        }


        if (
            course.colleges.college_name
        ) {

            collegeText +=
                " - " +
                course.colleges.college_name;
        }
    }


    selectedStudentCollege.textContent =
        collegeText;


    totalViolationCount.textContent =
        "—";
}


/* =====================================================
   SEMESTER FILTER
===================================================== */

function populateSemesterFilter() {

    semesterFilter.innerHTML =
        "";


    const allOption =
        document.createElement(
            "option"
        );


    allOption.value =
        "";


    allOption.textContent =
        "All Semesters";


    semesterFilter.appendChild(
        allOption
    );


    const semesters = {};


    selectedStudentViolations.forEach(
        function (violation) {

            if (
                violation.semesters
            ) {

                semesters[
                    violation.semesters.id
                ] =
                    violation.semesters.name;
            }
        }
    );


    Object.keys(
        semesters
    )
        .sort(
            function (a, b) {

                return Number(b) -
                    Number(a);
            }
        )
        .forEach(
            function (semesterId) {

                const option =
                    document.createElement(
                        "option"
                    );


                option.value =
                    semesterId;


                option.textContent =
                    semesters[
                        semesterId
                    ];


                semesterFilter
                    .appendChild(
                        option
                    );
            }
        );
}


/* =====================================================
   FILTER HISTORY
===================================================== */

function getFilteredHistory() {

    const selectedSemester =
        semesterFilter.value;


    if (!selectedSemester) {

        return selectedStudentViolations;
    }


    return selectedStudentViolations.filter(
        function (violation) {

            return (
                String(
                    violation.semester_id
                ) ===
                selectedSemester
            );
        }
    );
}


/* =====================================================
   RENDER HISTORY
===================================================== */

function renderHistory() {

    const violations =
        getFilteredHistory();


    historyRecords.innerHTML =
        "";


    if (
        violations.length === 0
    ) {

        historyRecords.innerHTML =
            "<div class=\"rounded-xl bg-gray-50 px-4 py-10 text-center\">" +
                "<p class=\"text-sm text-gray-500\">" +
                    "No violation records for the selected semester." +
                "</p>" +
            "</div>";


        return;
    }


    const container =
        document.createElement(
            "div"
        );


    container.className =
        "space-y-4";


    violations.forEach(
        function (violation) {

            container.appendChild(
                createHistoryRecord(
                    violation
                )
            );
        }
    );


    historyRecords.appendChild(
        container
    );
}


/* =====================================================
   CREATE HISTORY RECORD
===================================================== */

function createHistoryRecord(
    violation
) {

    const card =
        document.createElement(
            "article"
        );


    card.className =
        "rounded-xl border border-gray-200 p-5";


    const top =
        document.createElement(
            "div"
        );


    top.className =
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between";


    const left =
        document.createElement(
            "div"
        );


    const type =
        document.createElement(
            "h4"
        );


    type.className =
        "text-base font-bold text-gray-900";


    type.textContent =
        violation.violation_type ||
        "Unspecified Violation";


    const date =
        document.createElement(
            "p"
        );


    date.className =
        "mt-1 text-sm text-gray-500";


    date.textContent =
        formatDateTime(
            violation.date_time
        );


    left.appendChild(
        type
    );


    left.appendChild(
        date
    );


    const status =
        document.createElement(
            "span"
        );


    status.className =
        getStatusClass(
            violation.status
        );


    status.textContent =
        violation.status ||
        "Pending";


    top.appendChild(
        left
    );


    top.appendChild(
        status
    );


    card.appendChild(
        top
    );


    /*
        DETAILS
    */

    const details =
        document.createElement(
            "div"
        );


    details.className =
        "mt-5 grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 md:grid-cols-3";


    details.appendChild(
        createDetail(
            "Semester",
            violation.semesters
                ? violation.semesters.name
                : "No semester"
        )
    );


    details.appendChild(
        createDetail(
            "Location",
            violation.location ||
            "—"
        )
    );


    details.appendChild(
        createDetail(
            "Caught / Apprehended By",
            violation.caught_apprehended_by ||
            "—"
        )
    );


    card.appendChild(
        details
    );


    /*
        REMARKS
    */

    if (violation.remarks) {

        const remarksBox =
            document.createElement(
                "div"
            );


        remarksBox.className =
            "mt-4 rounded-xl bg-gray-50 px-4 py-3";


        const label =
            document.createElement(
                "p"
            );


        label.className =
            "text-xs font-semibold uppercase tracking-wide text-gray-400";


        label.textContent =
            "Remarks";


        const text =
            document.createElement(
                "p"
            );


        text.className =
            "mt-1 text-sm text-gray-700";


        text.textContent =
            violation.remarks;


        remarksBox.appendChild(
            label
        );


        remarksBox.appendChild(
            text
        );


        card.appendChild(
            remarksBox
        );
    }


    return card;
}


/* =====================================================
   DETAIL
===================================================== */

function createDetail(
    labelText,
    valueText
) {

    const wrapper =
        document.createElement(
            "div"
        );


    const label =
        document.createElement(
            "p"
        );


    label.className =
        "text-xs font-semibold uppercase tracking-wide text-gray-400";


    label.textContent =
        labelText;


    const value =
        document.createElement(
            "p"
        );


    value.className =
        "mt-1 text-sm font-medium text-gray-800";


    value.textContent =
        valueText;


    wrapper.appendChild(
        label
    );


    wrapper.appendChild(
        value
    );


    return wrapper;
}


/* =====================================================
   STATUS STYLE
===================================================== */

function getStatusClass(status) {

    let className =
        "inline-flex rounded-full px-3 py-1.5 text-xs font-semibold";


    if (
        status ===
        "Blocked Clearance"
    ) {

        className +=
            " bg-red-50 text-red-700";

    } else if (
        status ===
        "Unblocked Clearance"
    ) {

        className +=
            " bg-blue-50 text-blue-700";

    } else if (
        status ===
        "Rendered Do-Day"
    ) {

        className +=
            " bg-green-50 text-green-700";

    } else {

        className +=
            " bg-yellow-50 text-yellow-700";
    }


    return className;
}


/* =====================================================
   YEAR LABEL
===================================================== */

function getYearLabel(year) {

    const value =
        Number(
            year
        );


    if (value === 1) {

        return "1st Year";
    }


    if (value === 2) {

        return "2nd Year";
    }


    if (value === 3) {

        return "3rd Year";
    }


    return (
        value +
        "th Year"
    );
}


/* =====================================================
   DATE / TIME
===================================================== */

function formatDateTime(value) {

    if (!value) {

        return "—";
    }


    const date =
        new Date(
            value
        );


    return date.toLocaleString(
        "en-PH",
        {
            timeZone:
                "Asia/Manila",
            year:
                "numeric",

            month:
                "short",

            day:
                "numeric",

            hour:
                "numeric",

            minute:
                "2-digit",
            hour12: true
        }
    );
}


/* =====================================================
   EVENTS
===================================================== */

searchButton.addEventListener(
    "click",
    searchStudents
);


studentSearch.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key ===
            "Enter"
        ) {

            event.preventDefault();


            searchStudents();
        }
    }
);


semesterFilter.addEventListener(
    "change",
    renderHistory
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

    await loadProfile();
}


initialize();