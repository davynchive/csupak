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

const violationBreakdown = document.getElementById("violationBreakdown");

function renderViolationBreakdown() {
    violationBreakdown.replaceChildren();
    if (historyLoading || !historyComplete || !selectedStudentViolations.length) {
        const message = document.createElement("p");
        message.className = "text-sm text-gray-500";
        message.textContent = historyLoading || !historyComplete
            ? "Unavailable" : "No violation history.";
        violationBreakdown.appendChild(message);
        return;
    }
    const counts = new Map();
    for (const violation of selectedStudentViolations) {
        const storedType = violation.violation_type;
        const type = typeof storedType === "string" && storedType.trim()
            ? storedType : "Unspecified";
        counts.set(type, (counts.get(type) || 0) + 1);
    }
    for (const [type, count] of Array.from(counts).sort(([a], [b]) => a.localeCompare(b))) {
        const card = document.createElement("div");
        card.className = "flex min-w-0 items-start gap-3 rounded-lg border border-gray-100 bg-[#F3F7F3] px-3 py-2";
        const number = document.createElement("p");
        number.className = "shrink-0 text-2xl font-bold text-[#006B21]";
        number.textContent = String(count);
        const label = document.createElement("p");
        label.className = "min-w-0 text-xs font-medium text-gray-600";
        label.style.overflowWrap = "anywhere";
        label.textContent = type;
        card.appendChild(number);
        card.appendChild(label);
        violationBreakdown.appendChild(card);
    }
}

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
const HISTORY_BATCH_SIZE = 500;
const HISTORY_PAGE_SIZE = 25;
let completeSearchResults = [];
let searchLoading = false;
let searchComplete = false;
let searchLoadError = null;
let currentSearchPage = 1;
let historyLoading = false;
let historyComplete = false;
let historyLoadError = null;
let currentHistoryPage = 1;
let historyRequestToken = 0;

async function fetchCompleteRecords(buildQuery, isCurrent = () => true) {
    const records = [];
    const ids = new Set();
    let expectedTotal = null;
    let offset = 0;
    do {
        if (!isCurrent()) return null;
        const result = await buildQuery().range(offset, offset + HISTORY_BATCH_SIZE - 1);
        if (!isCurrent()) return null;
        if (result.error) throw result.error;
        if (!Array.isArray(result.data) || !Number.isSafeInteger(result.count) ||
            result.count < 0 || result.data.length > HISTORY_BATCH_SIZE) {
            throw new Error("Invalid batch returned.");
        }
        if (expectedTotal === null) expectedTotal = result.count;
        if (result.count !== expectedTotal) throw new Error("Record count changed while loading.");
        if (!result.data.length && offset < expectedTotal) throw new Error("Premature empty batch.");
        for (const record of result.data) {
            if (!record || typeof record !== "object" || Array.isArray(record) ||
                !["string", "number"].includes(typeof record.id) || !String(record.id).trim() ||
                (typeof record.id === "number" && !Number.isFinite(record.id))) {
                throw new Error("Invalid record returned.");
            }
            const key = String(record.id);
            if (ids.has(key)) throw new Error("Duplicate record returned.");
            ids.add(key);
            records.push(record);
        }
        offset += result.data.length;
    } while (offset < expectedTotal);
    if (records.length !== expectedTotal || ids.size !== expectedTotal) {
        throw new Error("Incomplete dataset returned.");
    }
    return records;
}

function compareStudentIds(a, b) {
    const left = String(a.id);
    const right = String(b.id);
    if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
        const x = BigInt(left), y = BigInt(right);
        return x < y ? -1 : x > y ? 1 : 0;
    }
    return left < right ? -1 : left > right ? 1 : 0;
}

function appendHistoryPagination(container, total, page, onPage, unit) {
    if (!total) return;
    const pageCount = Math.ceil(total / HISTORY_PAGE_SIZE);
    const controls = document.createElement("div");
    controls.className = "mt-4 flex flex-wrap items-center justify-between gap-3";
    controls.setAttribute("aria-label", unit + " pagination");
    const label = document.createElement("p");
    label.className = "text-sm text-gray-600";
    label.textContent = "Showing " + ((page - 1) * HISTORY_PAGE_SIZE + 1) + "-" +
        Math.min(page * HISTORY_PAGE_SIZE, total) + " of " + total + " " + unit +
        " | Page " + page + " of " + pageCount;
    controls.appendChild(label);
    const buttons = document.createElement("div");
    buttons.className = "flex gap-2";
    [["Previous", -1], ["Next", 1]].forEach(function ([text, direction]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.className = "rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-50";
        button.disabled = direction < 0 ? page === 1 : page === pageCount;
        button.addEventListener("click", function () { onPage(page + direction); });
        buttons.appendChild(button);
    });
    controls.appendChild(buttons);
    container.appendChild(controls);
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
    if (searchLoading) return;
    const searchValue = studentSearch.value.trim();
    hideSearchMessage();
    searchResultsSection.classList.add("hidden");
    studentHistorySection.classList.add("hidden");
    // Invalidate any selected-student request before starting a new search.
    historyRequestToken++;
    selectedStudent = null;
    selectedStudentViolations = [];
    historyLoading = false;
    historyComplete = false;
    historyLoadError = null;
    semesterFilter.disabled = true;
    totalViolationCount.textContent = "Unavailable";
    renderViolationBreakdown();
    completeSearchResults = [];
    searchComplete = false;
    searchLoadError = null;
    currentSearchPage = 1;
    searchResults.innerHTML = "";
    searchResultCount.textContent = "Unavailable";
    if (!searchValue) {
        showSearchMessage("Enter a Student ID or student name.");
        studentSearch.focus();
        return;
    }
    searchLoading = true;
    searchButton.disabled = true;
    searchButton.textContent = "Searching...";
    try {
        const query = column => () => supabaseClient.from("students")
            .select(`
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
                `, { count: "exact" })
            .ilike(column, "%" + searchValue + "%")
            .order("student_name", { ascending: true })
            .order("id", { ascending: true });
        const idMatches = await fetchCompleteRecords(query("student_id"));
        const nameMatches = await fetchCompleteRecords(query("student_name"));
        const merged = new Map();
        for (const student of idMatches) merged.set(String(student.id), student);
        for (const student of nameMatches) {
            if (!merged.has(String(student.id))) merged.set(String(student.id), student);
        }
        const records = Array.from(merged.values());
        records.sort((a, b) => String(a.student_name || "").localeCompare(String(b.student_name || "")) ||
            compareStudentIds(a, b));
        completeSearchResults = records;
        searchComplete = true;
    } catch (error) {
        console.error("Unable to search complete student records:", error);
        completeSearchResults = [];
        searchComplete = false;
        searchLoadError = "Unable to search complete student records. Search again to retry.";
    } finally {
        searchLoading = false;
        resetSearchButton();
        renderSearchResults();
    }
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

function renderSearchResults() {
    searchResults.innerHTML = "";
    if (!searchComplete || searchLoading) {
        searchResultCount.textContent = "Unavailable";
        searchResultsSection.classList.add("hidden");
        if (searchLoadError) showSearchMessage(searchLoadError);
        return;
    }
    const students = completeSearchResults;
    const pageCount = Math.max(1, Math.ceil(students.length / HISTORY_PAGE_SIZE));
    currentSearchPage = Math.min(Math.max(1, currentSearchPage), pageCount);

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


    students.slice((currentSearchPage - 1) * HISTORY_PAGE_SIZE, currentSearchPage * HISTORY_PAGE_SIZE).forEach(
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
    appendHistoryPagination(searchResults, students.length, currentSearchPage, function (page) {
        currentSearchPage = page;
        renderSearchResults();
    }, "students");
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

async function loadStudentHistory(student) {
    const token = ++historyRequestToken;
    const isCurrent = () => token === historyRequestToken;
    selectedStudent = student;
    selectedStudentViolations = [];
    historyComplete = false;
    historyLoading = true;
    historyLoadError = null;
    currentHistoryPage = 1;
    semesterFilter.innerHTML = "";
    semesterFilter.disabled = true;
    displayStudentSummary(student);
    totalViolationCount.textContent = "Unavailable";
    renderViolationBreakdown();
    studentHistorySection.classList.remove("hidden");
    renderHistory();
    try {
        // Deliberately retrieve all semesters for this student.
        const records = await fetchCompleteRecords(() => supabaseClient.from("violations")
            .select(`
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
                `, { count: "exact" })
            .eq("student_id", student.id)
            .order("date_time", { ascending: false })
            .order("id", { ascending: false }), isCurrent);
        if (!isCurrent()) return;
        selectedStudentViolations = records;
        historyComplete = true;
        totalViolationCount.textContent = records.length;
        populateSemesterFilter();
        semesterFilter.value = "";
        semesterFilter.disabled = false;
    } catch (error) {
        if (!isCurrent()) return;
        console.error("Unable to load complete student history:", error);
        selectedStudentViolations = [];
        historyComplete = false;
        historyLoadError = "Unable to load complete violation history. Select the student again to retry.";
        totalViolationCount.textContent = "Unavailable";
    } finally {
        if (isCurrent()) {
            historyLoading = false;
            renderViolationBreakdown();
            renderHistory();
        }
    }
    if (isCurrent() && historyComplete) {
        studentHistorySection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
    if (historyLoading || !historyComplete) {
        historyRecords.innerHTML = "";
        const message = document.createElement("p");
        message.className = historyLoadError
            ? "rounded-xl bg-red-50 px-4 py-10 text-center text-sm text-red-600"
            : "rounded-xl bg-gray-50 px-4 py-10 text-center text-sm text-gray-500";
        message.textContent = historyLoadError || (historyLoading
            ? "Loading violation history..." : "Violation history is not loaded.");
        if (historyLoadError) message.setAttribute("role", "alert");
        historyRecords.appendChild(message);
        return;
    }

    const violations =
        getFilteredHistory();

    const pageCount = Math.max(1, Math.ceil(violations.length / HISTORY_PAGE_SIZE));
    currentHistoryPage = Math.min(Math.max(1, currentHistoryPage), pageCount);


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


    violations.slice((currentHistoryPage - 1) * HISTORY_PAGE_SIZE, currentHistoryPage * HISTORY_PAGE_SIZE).forEach(
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
    appendHistoryPagination(historyRecords, violations.length, currentHistoryPage, function (page) {
        currentHistoryPage = page;
        renderHistory();
    }, "records");
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
<<<<<<< HEAD
            hour12: true
=======
            hour12:
                true
>>>>>>> 98dd817d6f21297c5cd7ee39b3e40452a822fd2c
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
    function () {
        currentHistoryPage = 1;
        renderHistory();
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

async function loadStudentFromUrl() {
    const values = new URLSearchParams(window.location.search).getAll("studentId");
    if (!values.length) return;
    if (values.length !== 1 || !/^[1-9]\d*$/.test(values[0])) {
        showSearchMessage("Invalid student history link. Search for a student below.");
        return;
    }
    const studentId = values[0];
    const token = ++historyRequestToken;
    const isCurrent = () => token === historyRequestToken;
    hideSearchMessage();
    try {
        const result = await supabaseClient.from("students")
            .select(`
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
            `)
            .eq("id", studentId)
            .maybeSingle();
        if (!isCurrent()) return;
        if (result.error) throw result.error;
        if (!result.data) {
            showSearchMessage("Student not found or unavailable.");
            return;
        }
        if (String(result.data.id) !== studentId) throw new Error("Unexpected student returned.");
        await loadStudentHistory(result.data);
    } catch (error) {
        if (!isCurrent()) return;
        console.error("Unable to load student from history link:", error);
        showSearchMessage("Unable to load the linked student. Search for a student or reload to try again.");
    }
}

async function initialize() {

    if (!await loadProfile()) return;
    await loadStudentFromUrl();
}


initialize();

//FIX
