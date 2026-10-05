/* =====================================================
   CSUPAK - VIOLATION RECORDS
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


const searchInput =
    document.getElementById(
        "searchInput"
    );

const statusFilter =
    document.getElementById(
        "statusFilter"
    );

const violationTypeFilter =
    document.getElementById(
        "violationTypeFilter"
    );

const refreshButton =
    document.getElementById(
        "refreshButton"
    );

const violationRecords =
    document.getElementById(
        "violationRecords"
    );

const recordCount =
    document.getElementById(
        "recordCount"
    );

const statusNotification =
    document.getElementById("statusNotification");

/* =====================================================
   PHOTO MODAL
===================================================== */

const photoModal =
    document.getElementById(
        "photoModal"
    );

const photoModalImage =
    document.getElementById(
        "photoModalImage"
    );

const photoModalName =
    document.getElementById(
        "photoModalName"
    );

const closePhotoModal =
    document.getElementById(
        "closePhotoModal"
    );




function showStatusNotification() {
    const notification =
        document.getElementById("statusNotification");

    if (!notification) {
        console.error("statusNotification not found.");
        return;
    }

    // Show notification
    notification.classList.remove("hidden");
    notification.style.display = "block";

    // Restart animation
    notification.classList.remove("show");

    void notification.offsetWidth;

    notification.classList.add("show");

    // Hide after animation
    setTimeout(function () {
        notification.classList.remove("show");
        notification.classList.add("hidden");
        notification.style.display = "none";
    }, 2000);
}

/* =====================================================
   GLOBAL DATA
===================================================== */

let currentProfile = null;

let activeSemester = null;

let allViolations = [];

const VIOLATION_BATCH_SIZE = 500;
const VIOLATION_PAGE_SIZE = 25;
let currentViolationPage = 1;
let violationsLoading = false;
let violationsComplete = false;
let violationsLoadError = null;


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
   ACTIVE SEMESTER
===================================================== */

async function loadActiveSemester() {

    const result =
        await supabaseClient
            .from("semesters")
            .select(
                "id, name"
            )
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


    return Boolean(
        activeSemester
    );
}


/* =====================================================
   LOAD VIOLATIONS
===================================================== */

async function loadViolations() {
    if (violationsLoading) return;
    violationsLoading = true;
    violationsComplete = false;
    violationsLoadError = null;
    allViolations = [];
    currentViolationPage = 1;
    refreshButton.disabled = true;
    renderViolations();

    // Publish only when every batch has succeeded.
    const records = [];
    const ids = new Set();
    let expectedTotal = null;
    let offset = 0;
    try {
        if (!activeSemester) throw new Error("No active semester is configured.");
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
                students (
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
                ),
                violation_photos (
                    id,
                    file_path,
                    file_name,
                    file_size
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
                records.push(record);
            }
            offset += result.data.length;
        } while (offset < expectedTotal);
        if (records.length !== expectedTotal || ids.size !== expectedTotal) {
            throw new Error("Incomplete violation dataset returned.");
        }
        allViolations = records;
        violationsComplete = true;
        populateViolationTypeFilter();
    } catch (error) {
        console.error("Unable to load complete violation data:", error);
        allViolations = [];
        violationsComplete = false;
        violationsLoadError = "Unable to load complete violation records. Use Refresh to try again.";
    } finally {
        violationsLoading = false;
        refreshButton.disabled = false;
        renderViolations();
    }
}


/* =====================================================
   VIOLATION TYPE FILTER
===================================================== */

function populateViolationTypeFilter() {

    const currentValue =
        violationTypeFilter.value;


    const types = [];


    allViolations.forEach(
        function (violation) {

            const type =
                violation.violation_type;


            if (
                type &&
                !types.includes(
                    type
                )
            ) {

                types.push(
                    type
                );
            }
        }
    );


    types.sort(
        function (a, b) {

            return a.localeCompare(
                b
            );
        }
    );


    violationTypeFilter.innerHTML =
        "";


    const defaultOption =
        document.createElement(
            "option"
        );


    defaultOption.value =
        "";


    defaultOption.textContent =
        "All Violation Types";


    violationTypeFilter
        .appendChild(
            defaultOption
        );


    types.forEach(
        function (type) {

            const option =
                document.createElement(
                    "option"
                );


            option.value =
                type;


            option.textContent =
                type;


            violationTypeFilter
                .appendChild(
                    option
                );
        }
    );


    if (
        types.includes(
            currentValue
        )
    ) {

        violationTypeFilter.value =
            currentValue;
    }
}


/* =====================================================
   GET COURSE
===================================================== */

function getCourse(
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

function getCollege(
    violation
) {

    const course =
        getCourse(
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
   FILTER RECORDS
===================================================== */

function getFilteredViolations() {

    let records =
        allViolations.slice();


    const search =
        searchInput
            .value
            .trim()
            .toLowerCase();


    const selectedStatus =
        statusFilter.value;


    const selectedType =
        violationTypeFilter.value;


    if (search) {

        records =
            records.filter(
                function (violation) {

                    const student =
                        violation.students;


                    const course =
                        getCourse(
                            violation
                        );


                    const college =
                        getCollege(
                            violation
                        );


                    const text =
                        (
                            String(
                                student &&
                                student.student_id
                                    ? student.student_id
                                    : ""
                            ) +
                            " " +
                            String(
                                student &&
                                student.student_name
                                    ? student.student_name
                                    : ""
                            ) +
                            " " +
                            String(
                                course &&
                                course.course_code
                                    ? course.course_code
                                    : ""
                            ) +
                            " " +
                            String(
                                course &&
                                course.course_name
                                    ? course.course_name
                                    : ""
                            ) +
                            " " +
                            String(
                                college &&
                                college.college_code
                                    ? college.college_code
                                    : ""
                            ) +
                            " " +
                            String(
                                violation.violation_type ||
                                ""
                            ) +
                            " " +
                            String(
                                violation.location ||
                                ""
                            )
                        ).toLowerCase();


                    return text.includes(
                        search
                    );
                }
            );
    }


    if (selectedStatus) {

        records =
            records.filter(
                function (violation) {

                    return (
                        violation.status ===
                        selectedStatus
                    );
                }
            );
    }


    if (selectedType) {

        records =
            records.filter(
                function (violation) {

                    return (
                        violation.violation_type ===
                        selectedType
                    );
                }
            );
    }


    return records;
}


/* =====================================================
   RENDER
===================================================== */

function renderViolations() {
    if (!violationsComplete) {
        recordCount.textContent = "Unavailable";
        violationRecords.innerHTML = "";
        const message = document.createElement("div");
        message.className = violationsLoadError
            ? "rounded-xl bg-red-50 px-4 py-10 text-center text-sm text-red-600"
            : "rounded-xl bg-gray-50 px-4 py-10 text-center text-sm text-gray-500";
        if (violationsLoadError) message.setAttribute("role", "alert");
        message.textContent = violationsLoadError || (violationsLoading
            ? "Loading violation records..." : "Violation records are not loaded.");
        violationRecords.appendChild(message);
        return;
    }


    const records =
        getFilteredViolations();


    const pageCount = Math.max(1, Math.ceil(records.length / VIOLATION_PAGE_SIZE));
    currentViolationPage = Math.min(Math.max(1, currentViolationPage), pageCount);
    const start = (currentViolationPage - 1) * VIOLATION_PAGE_SIZE;
    const pageRecords = records.slice(start, start + VIOLATION_PAGE_SIZE);

    recordCount.textContent =
        records.length +
        (
            records.length === 1
                ? " record"
                : " records"
        );


    violationRecords.innerHTML =
        "";


    if (
        records.length === 0
    ) {

        violationRecords.innerHTML =
            "<div class=\"rounded-xl bg-gray-50 px-4 py-10 text-center\">" +
                "<p class=\"text-sm text-gray-500\">" +
                    "No violation records found." +
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


    pageRecords.forEach(
        function (violation) {

            container.appendChild(
                createViolationCard(
                    violation
                )
            );
        }
    );


    violationRecords.appendChild(
        container
    );
    renderViolationPagination(records.length, pageCount, start);

}


/* =====================================================
   CREATE VIOLATION CARD
===================================================== */

function resetViolationPage() {
    currentViolationPage = 1;
    renderViolations();
}

function renderViolationPagination(total, pageCount, start) {
    const controls = document.createElement("div");
    controls.className = "mt-4 flex flex-wrap items-center justify-between gap-3";
    controls.setAttribute("aria-label", "Violation pagination");
    const label = document.createElement("p");
    label.className = "text-sm text-gray-600";
    label.textContent = "Showing " + (start + 1) + "-" + Math.min(start + VIOLATION_PAGE_SIZE, total)
        + " of " + total + " records | Page " + currentViolationPage + " of " + pageCount;
    controls.appendChild(label);
    const buttons = document.createElement("div");
    buttons.className = "flex gap-2";
    [["Previous", -1], ["Next", 1]].forEach(function ([text, direction]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.className = "rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-50";
        button.disabled = direction < 0 ? currentViolationPage === 1 : currentViolationPage === pageCount;
        button.addEventListener("click", function () {
            currentViolationPage += direction;
            renderViolations();
        });
        buttons.appendChild(button);
    });
    controls.appendChild(buttons);
    violationRecords.appendChild(controls);
}


function createViolationCard(
    violation
) {

    const card =
        document.createElement(
            "article"
        );


    card.className =
        "rounded-2xl border border-gray-200 bg-white p-5";


    const student =
        violation.students;


    const course =
        getCourse(
            violation
        );


    const college =
        getCollege(
            violation
        );


    /* =================================================
       HEADER
    ================================================= */

    const header =
        document.createElement(
            "div"
        );


    header.className =
        "flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between";


    const left =
        document.createElement(
            "div"
        );


    left.className =
        "min-w-0 flex-1";


    const name =
        document.createElement(
            "h4"
        );


    name.className =
        "text-base font-bold text-gray-900";


    name.textContent =
        student &&
        student.student_name
            ? student.student_name
            : "Unknown Student";


    const studentInfo =
        document.createElement(
            "p"
        );


    studentInfo.className =
        "mt-1 text-sm text-gray-500";


    let infoText =
        student &&
        student.student_id
            ? student.student_id
            : "No Student ID";


    if (
        course &&
        course.course_code
    ) {

        infoText +=
            " • " +
            course.course_code;
    }


    if (
        student &&
        student.year_level
    ) {

        infoText +=
            " " +
            getYearLabel(
                student.year_level
            );
    }


    if (
        college &&
        college.college_code
    ) {

        infoText +=
            " • " +
            college.college_code;
    }


    studentInfo.textContent =
        infoText;


    left.appendChild(
        name
    );


    left.appendChild(
        studentInfo
    );

    const databaseStudentId = student && student.id;
    const usableStudentId =
        (typeof databaseStudentId === "string" && /^[1-9]\d*$/.test(databaseStudentId)) ||
        (typeof databaseStudentId === "number" && Number.isSafeInteger(databaseStudentId) && databaseStudentId > 0);
    const historyAction = document.createElement(usableStudentId ? "a" : "span");
    historyAction.className = "inline-flex shrink-0 items-center whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold transition " +
        (usableStudentId
            ? "border-green-200 bg-green-50 text-[#006B21] hover:bg-green-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
            : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400");
    historyAction.textContent = usableStudentId ? "View Student History" : "Student History unavailable";
    if (usableStudentId) {
        historyAction.href = "history.html?studentId=" + encodeURIComponent(String(databaseStudentId));
    } else {
        historyAction.setAttribute("aria-disabled", "true");
    }


    /* =================================================
       STATUS
    ================================================= */

    const statusArea =
        document.createElement(
            "div"
        );


    statusArea.className =
        "w-full lg:w-52";


    const statusLabel =
        document.createElement(
            "label"
        );


    statusLabel.className =
        "mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400";


    statusLabel.textContent =
        "Tracking Status";


    statusArea.appendChild(
        statusLabel
    );


    /*
        SECURITY OFFICE

        Can see status,
        but CANNOT modify it.
    */

    if (
        currentProfile.role ===
        "security_office"
    ) {

        const badge =
            document.createElement(
                "div"
            );


        badge.className =
            "rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700";


        badge.textContent =
            violation.status ||
            "Pending";


        statusArea.appendChild(
            badge
        );

    } else {

        /*
            OSWE STAFF + ADMIN

            Can update tracking status.
        */

        const select =
            createStatusSelect(
                violation
            );


        statusArea.appendChild(
            select
        );
    }


    header.appendChild(
        left
    );


    header.appendChild(statusArea);


    card.appendChild(
        header
    );


    /* =================================================
       VIOLATION DETAILS
    ================================================= */

    const details =
        document.createElement(
            "div"
        );


    details.className =
        "mt-5 grid grid-cols-1 gap-4 border-t border-gray-100 pt-5 md:grid-cols-2 xl:grid-cols-4";


    details.appendChild(
        createDetail(
            "Violation",
            violation.violation_type ||
            "—"
        )
    );


    details.appendChild(
        createDetail(
            "Date & Time",
            formatDateTime(
                violation.date_time
            )
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


    /* =================================================
       REMARKS
    ================================================= */

    if (violation.remarks) {

        const remarksBox =
            document.createElement(
                "div"
            );


        remarksBox.className =
            "mt-4 rounded-xl bg-gray-50 px-4 py-3";


        const remarksTitle =
            document.createElement(
                "p"
            );


        remarksTitle.className =
            "text-xs font-semibold uppercase tracking-wide text-gray-400";


        remarksTitle.textContent =
            "Remarks";


        const remarksText =
            document.createElement(
                "p"
            );


        remarksText.className =
            "mt-1 text-sm text-gray-700";


        remarksText.textContent =
            violation.remarks;


        remarksBox.appendChild(
            remarksTitle
        );


        remarksBox.appendChild(
            remarksText
        );


        card.appendChild(
            remarksBox
        );
    }


    /* =================================================
       PHOTOS
    ================================================= */

    const bottomActions = document.createElement("div");
    bottomActions.className = "mt-4 flex flex-wrap items-end justify-between gap-3";
    historyAction.classList.add("ml-auto");

    if (
        violation.violation_photos &&
        violation.violation_photos.length > 0
    ) {

        const photoSection =
            document.createElement(
                "div"
            );


        bottomActions.classList.add("border-t", "border-gray-100", "pt-4");
        photoSection.className = "min-w-0 flex-1";


        const title =
            document.createElement(
                "p"
            );


        title.className =
            "mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400";


        title.textContent =
            "Evidence Photo";


        photoSection.appendChild(
            title
        );


        const buttons =
            document.createElement(
                "div"
            );


        buttons.className =
            "flex flex-wrap gap-2";


        violation.violation_photos.forEach(
            function (photo) {

                const button =
                    document.createElement(
                        "button"
                    );


                button.type =
                    "button";


                button.className =
                    "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-[#006B21] hover:bg-green-50";


                button.textContent =
                    photo.file_name ||
                    "View Photo";


                button.addEventListener(
                    "click",
                    function () {

                        viewPhoto(
                            photo
                        );
                    }
                );


                buttons.appendChild(
                    button
                );
            }
        );


        photoSection.appendChild(
            buttons
        );


        bottomActions.appendChild(
            photoSection
        );
    }

    bottomActions.appendChild(historyAction);
    card.appendChild(bottomActions);

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
   STATUS SELECT
===================================================== */

function createStatusSelect(
    violation
) {

    const select =
        document.createElement(
            "select"
        );


    select.className =
        "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#006B21] focus:ring-2 focus:ring-green-100";


    const statuses = [
        "Pending",
        "Blocked Clearance",
        "Unblocked Clearance",
        "Rendered Do-Day"
    ];


    statuses.forEach(
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
                violation.status ===
                status
            ) {

                option.selected =
                    true;
            }


            select.appendChild(
                option
            );
        }
    );


    select.addEventListener(
        "change",
        async function () {

            const previousStatus =
                violation.status;


            const newStatus =
                select.value;


            select.disabled =
                true;


            const updated =
                await updateViolationStatus(
                    violation.id,
                    newStatus
                );


            if (!updated) {

                select.value =
                    previousStatus;
            }


            select.disabled =
                false;
        }
    );


    return select;
}


/* =====================================================
   UPDATE STATUS
===================================================== */

/* =====================================================
   UPDATE STATUS
===================================================== */

async function updateViolationStatus(
    violationId,
    newStatus
) {

    console.log(
        "UPDATE STATUS FUNCTION CALLED"
    );

    if (
        currentProfile.role !== "oswe_admin" &&
        currentProfile.role !== "oswe_staff"
    ) {

        alert(
            "You do not have permission to change the violation status."
        );

        return false;
    }

    console.log(
        "Updating:",
        violationId,
        "to:",
        newStatus
    );

    const result =
        await supabaseClient
            .from("violations")
            .update({
                status: newStatus
            })
            .eq(
                "id",
                violationId
            );

    console.log(
        "SUPABASE RESULT:",
        result
    );

    if (result.error) {

        console.error(
            "Unable to update violation status:",
            result.error
        );

        alert(
            "Unable to update the violation status."
        );

        return false;
    }

    console.log(
        "STATUS UPDATED SUCCESSFULLY"
    );

    const record =
        allViolations.find(
            function (violation) {
                return (
                    violation.id ===
                    violationId
                );
            }
        );

    if (record) {
        record.status = newStatus;
    }

    renderViolations();

    // Show notification ONLY ONCE
    showStatusNotification();

    return true;
}

/* =====================================================
   VIEW PRIVATE PHOTO
===================================================== */

async function viewPhoto(
    photo
) {

    if (
        !photo ||
        !photo.file_path
    ) {

        return;
    }


    /*
        Bucket is private, so create a
        temporary signed URL.
    */

    const result =
        await supabaseClient
            .storage
            .from(
                "violation-photos"
            )
            .createSignedUrl(
                photo.file_path,
                60
            );


    if (result.error) {

        console.error(
            "Unable to load photo:",
            result.error
        );


        alert(
            "Unable to load the evidence photo."
        );


        return;
    }


    photoModalImage.src =
        result.data.signedUrl;


    photoModalName.textContent =
        photo.file_name ||
        "Violation Evidence";


    photoModal.classList.remove(
        "hidden"
    );


    photoModal.classList.add(
        "flex"
    );
}


/* =====================================================
   CLOSE PHOTO
===================================================== */

function hidePhotoModal() {

    photoModal.classList.add(
        "hidden"
    );


    photoModal.classList.remove(
        "flex"
    );


    photoModalImage.src =
        "";
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
            hour12:
                true
        }
    );
}


/* =====================================================
   EVENTS
===================================================== */

searchInput.addEventListener(
    "input",
    resetViolationPage
);


statusFilter.addEventListener(
    "change",
    resetViolationPage
);


violationTypeFilter.addEventListener(
    "change",
    resetViolationPage
);


refreshButton.addEventListener(
    "click",
    loadViolations
);


closePhotoModal.addEventListener(
    "click",
    hidePhotoModal
);


photoModal.addEventListener(
    "click",
    function (event) {

        if (
            event.target ===
            photoModal
        ) {

            hidePhotoModal();
        }
    }
);


document.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key ===
            "Escape"
        ) {

            hidePhotoModal();
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

    const profileLoaded =
        await loadProfile();


    if (!profileLoaded) {

        return;
    }


    const semesterLoaded =
        await loadActiveSemester();


    if (!semesterLoaded) {

        return;
    }


    await loadViolations();
}


initialize();


//FIX
