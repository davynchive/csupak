/* =====================================================
   CSUPAK - RECORD VIOLATION
===================================================== */


/* =====================================================
   ELEMENTS
===================================================== */

const pageContent =
    document.getElementById("pageContent");

const userName =
    document.getElementById("userName");

const userRole =
    document.getElementById("userRole");

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


/* =====================================================
   STUDENT
===================================================== */

const studentId =
    document.getElementById("studentId");

const studentName =
    document.getElementById("studentName");

const courseId =
    document.getElementById("courseId");

const yearLevel =
    document.getElementById("yearLevel");


/* =====================================================
   VIOLATION
===================================================== */

const violationForm =
    document.getElementById(
        "violationForm"
    );

const violationType =
    document.getElementById(
        "violationType"
    );

const specifyViolationContainer =
    document.getElementById("specifyViolationContainer");

const specifyViolation =
    document.getElementById("specifyViolation");

function updateSpecifyViolation() {
    const isOther = violationType.value === "Others";
    specifyViolationContainer.classList.toggle("hidden", !isOther);
    specifyViolation.required = isOther;
    if (!isOther) specifyViolation.value = "";
}

const locationInput =
    document.getElementById(
        "location"
    );

const caughtBy =
    document.getElementById(
        "caughtBy"
    );

const dateTime =
    document.getElementById(
        "dateTime"
    );

const remarks =
    document.getElementById(
        "remarks"
    );


/* =====================================================
   PHOTO
===================================================== */

const photoInput =
    document.getElementById(
        "photoInput"
    );

const photoPreviewContainer =
    document.getElementById(
        "photoPreviewContainer"
    );

const photoPreview =
    document.getElementById(
        "photoPreview"
    );

const photoName =
    document.getElementById(
        "photoName"
    );

const photoSize =
    document.getElementById(
        "photoSize"
    );

const removePhotoButton =
    document.getElementById(
        "removePhotoButton"
    );


/* =====================================================
   ACTIONS
===================================================== */

const formMessage =
    document.getElementById(
        "formMessage"
    );

const clearButton =
    document.getElementById(
        "clearButton"
    );

const submitButton =
    document.getElementById(
        "submitButton"
    );


/* =====================================================
   GLOBAL DATA
===================================================== */

let currentUser = null;

let currentProfile = null;

let activeSemester = null;

let selectedPhoto = null;
let savedViolationId = null;
let uploadedPhotoPath = null;
let photoMetadataPending = false;
let isSaving = false;

let courses = [];


/* =====================================================
   CONSTANTS
===================================================== */

const MAX_PHOTO_SIZE =
    2 * 1024 * 1024;


const ALLOWED_PHOTO_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp"
];


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
   LOAD USER
===================================================== */

async function loadUser() {

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
    }
}


/* =====================================================
   ACTIVE SEMESTER
===================================================== */

async function loadActiveSemester() {

    const result =
        await supabaseClient
            .from("semesters")
            .select(
                "id, name, start_date, end_date"
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


        showMessage(
            "Unable to load the active semester.",
            false
        );


        return false;
    }


    if (!result.data) {

        showMessage(
            "No active semester is currently configured.",
            false
        );


        return false;
    }


    activeSemester =
        result.data;


    return true;
}


/* =====================================================
   LOAD COURSES
===================================================== */

async function loadCourses() {

    const result =
        await supabaseClient
            .from("courses")
            .select(
                "id, course_code, course_name"
            )
            .order(
                "course_code",
                {
                    ascending: true
                }
            );


    if (result.error) {

        console.error(
            "Unable to load courses:",
            result.error
        );


        courseId.innerHTML =
            "";


        const option =
            document.createElement(
                "option"
            );


        option.value =
            "";


        option.textContent =
            "Unable to load courses";


        courseId.appendChild(
            option
        );


        return false;
    }


    courses =
        result.data || [];


    courseId.innerHTML =
        "";


    const defaultOption =
        document.createElement(
            "option"
        );


    defaultOption.value =
        "";


    if (
        courses.length === 0
    ) {

        defaultOption.textContent =
            "No courses available";

    } else {

        defaultOption.textContent =
            "Select course";
    }


    courseId.appendChild(
        defaultOption
    );


    courses.forEach(
        function (course) {

            const option =
                document.createElement(
                    "option"
                );


            option.value =
                course.id;


            option.textContent =
                course.course_code +
                " - " +
                course.course_name;


            courseId.appendChild(
                option
            );
        }
    );


    return true;
}


/* =====================================================
   CURRENT DATE/TIME
===================================================== */

function setCurrentDateTime() {
    const dateTime = document.getElementById("dateTime");

    const now = new Date();

    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });

    const parts = formatter.formatToParts(now);
<<<<<<< HEAD

=======
>>>>>>> 98dd817d6f21297c5cd7ee39b3e40452a822fd2c
    const values = {};

    parts.forEach(part => {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    });

    dateTime.value =
        `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}


/* =====================================================
   PHOTO VALIDATION
===================================================== */

function validatePhoto(file) {

    if (!file) {

        return true;
    }


    if (
        !ALLOWED_PHOTO_TYPES.includes(
            file.type
        )
    ) {

        showMessage(
            "Only JPG, PNG, and WEBP images are allowed.",
            false
        );


        return false;
    }


    if (
        file.size >
        MAX_PHOTO_SIZE
    ) {

        showMessage(
            "The selected photo is larger than 2 MB.",
            false
        );


        return false;
    }


    return true;
}


/* =====================================================
   PHOTO PREVIEW
===================================================== */

function showPhotoPreview(file) {

    const reader =
        new FileReader();


    reader.addEventListener(
        "load",
        function () {

            photoPreview.src =
                reader.result;


            photoName.textContent =
                file.name;


            photoSize.textContent =
                formatFileSize(
                    file.size
                );


            photoPreviewContainer
                .classList
                .remove(
                    "hidden"
                );
        }
    );


    reader.readAsDataURL(
        file
    );
}


/* =====================================================
   REMOVE PHOTO
===================================================== */

function removeSelectedPhoto(force = false) {
    if (isSaving && force !== true) return;
    uploadedPhotoPath = null;
    photoMetadataPending = false;

    selectedPhoto =
        null;


    photoInput.value =
        "";


    photoPreview.src =
        "";


    photoName.textContent =
        "";


    photoSize.textContent =
        "";


    photoPreviewContainer
        .classList
        .add(
            "hidden"
        );
    if (savedViolationId !== null) {
        showMessage("Violation #" + savedViolationId + " was saved. Select a photo to retry, or choose Start New Violation.", true);
    }

}


/* =====================================================
   FILE SIZE
===================================================== */

function formatFileSize(bytes) {

    if (
        bytes <
        1024
    ) {

        return (
            bytes +
            " bytes"
        );
    }


    if (
        bytes <
        1024 * 1024
    ) {

        return (
            (
                bytes / 1024
            ).toFixed(
                1
            ) +
            " KB"
        );
    }


    return (
        (
            bytes /
            (
                1024 *
                1024
            )
        ).toFixed(
            2
        ) +
        " MB"
    );
}


/* =====================================================
   MESSAGE
===================================================== */

function showMessage(
    message,
    success
) {

    formMessage.className =
        "mt-6 rounded-xl px-4 py-3 text-sm";


    if (success) {

        formMessage.classList.add(
            "bg-green-50",
            "text-green-700"
        );

    } else {

        formMessage.classList.add(
            "bg-red-50",
            "text-red-700"
        );
    }


    formMessage.textContent =
        message;
}


/* =====================================================
   HIDE MESSAGE
===================================================== */

function hideMessage() {

    formMessage.classList.add(
        "hidden"
    );


    formMessage.textContent =
        "";
}


/* =====================================================
   FIND OR CREATE STUDENT
===================================================== */

async function getOrCreateStudent() {

    const studentIdValue =
        studentId
            .value
            .trim();


    const existingResult =
        await supabaseClient
            .from("students")
            .select(
                "id, student_id, student_name, course_id, year_level"
            )
            .eq(
                "student_id",
                studentIdValue
            )
            .maybeSingle();


    if (existingResult.error) {

        console.error(
            "Student lookup error:",
            existingResult.error
        );


        return {
            success: false,
            studentId: null
        };
    }


    /*
        EXISTING STUDENT

        Reuse their student database ID.

        We do not overwrite existing information
        while recording a new violation.
    */

    if (existingResult.data) {

        return {
            success: true,
            studentId:
                existingResult.data.id
        };
    }


    /*
        NEW STUDENT
    */

    const insertResult =
        await supabaseClient
            .from("students")
            .insert({

                student_id:
                    studentIdValue,

                student_name:
                    studentName
                        .value
                        .trim(),

                course_id:
                    Number(
                        courseId.value
                    ),

                year_level:
                    Number(
                        yearLevel.value
                    )
            })
            .select(
                "id"
            )
            .single();


    if (insertResult.error) {

        console.error(
            "Student insert error:",
            insertResult.error
        );


        return {
            success: false,
            studentId: null
        };
    }


    return {
        success: true,
        studentId:
            insertResult.data.id
    };
}


/* =====================================================
   CREATE VIOLATION
===================================================== */

async function createViolation(
    databaseStudentId
) {

    const result =
        await supabaseClient
            .from("violations")
            .insert({

                student_id:
                    databaseStudentId,

                semester_id:
                    activeSemester.id,

                violation_type:
                    violationType.value === "Others"
                        ? specifyViolation.value.trim()
                        : violationType.value,

                location:
                    locationInput
                        .value
                        .trim() ||
                    null,

                caught_apprehended_by:
                    caughtBy
                        .value
                        .trim() ||
                    null,

                date_time:
                    new Date(dateTime.value + ":00+08:00").toISOString(),

                remarks:
                    remarks
                        .value
                        .trim() ||
                    null,

                status:
                    "Pending",

                recorded_by:
                    currentUser.id
            })
            .select(
                "id"
            )
            .single();


    if (result.error) {

        console.error(
            "Violation insert error:",
            result.error
        );


        return {
            success: false,
            violationId: null
        };
    }


    return {
        success: true,
        violationId:
            result.data.id
    };
}


/* =====================================================
   SAFE FILE NAME
===================================================== */

function makeSafeFileName(
    fileName
) {

    return fileName.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
    );
}


/* =====================================================
   PHOTO PATH
===================================================== */

function createPhotoPath(
    violationId,
    file
) {

    const safeName =
        makeSafeFileName(
            file.name
        );


    return (
        String(
            violationId
        ) +
        "/" +
        Date.now() +
        "-" +
        safeName
    );
}


/* =====================================================
   UPLOAD PHOTO
===================================================== */

async function uploadViolationPhoto(
    violationId
) {

    if (!selectedPhoto) {

        return {
            success: true
        };
    }


    if (!uploadedPhotoPath) {
        const filePath = createPhotoPath(violationId, selectedPhoto);
        const uploadResult = await supabaseClient.storage
            .from("violation-photos")
            .upload(filePath, selectedPhoto, {
                cacheControl: "3600", upsert: false,
                contentType: selectedPhoto.type
            });
        if (uploadResult.error) {
            console.error("Photo upload error:", uploadResult.error);
            return { success: false, stage: "upload" };
        }
        // Keep the successful upload for metadata-only retries.
        uploadedPhotoPath = filePath;
        photoMetadataPending = true;
    }

    const metadataResult =
        await supabaseClient
            .from(
                "violation_photos"
            )
            .insert({

                violation_id:
                    violationId,

                file_path:
                    uploadedPhotoPath,

                file_name:
                    selectedPhoto.name,

                file_size:
                    selectedPhoto.size,

                uploaded_by:
                    currentUser.id
            });


    if (metadataResult.error) {
        console.error("Photo metadata error:", metadataResult.error);
        return { success: false, stage: "metadata" };
    }
    photoMetadataPending = false;
    return { success: true };
}


/* =====================================================
   SAVE VIOLATION
===================================================== */

async function saveViolation(
    event
) {

    event.preventDefault();


    if (isSaving) return;

    hideMessage();


    if (savedViolationId === null) {
        if (
            !studentId
                .value
                .trim()
        ) {

            showMessage(
                "Please enter the student ID.",
                false
            );


            studentId.focus();


            return;
        }


        if (
            !studentName
                .value
                .trim()
        ) {

            showMessage(
                "Please enter the student name.",
                false
            );


            studentName.focus();


            return;
        }


        if (!courseId.value) {

            showMessage(
                "Please select the student's course.",
                false
            );


            courseId.focus();


            return;
        }


        if (!yearLevel.value) {

            showMessage(
                "Please select the student's year level.",
                false
            );


            yearLevel.focus();


            return;
        }


        if (
            !violationType
                .value
                .trim()
        ) {

            showMessage(
                "Please select a violation type.",
                false
            );


            violationType.focus();


            return;
        }

        if (violationType.value === "Others" && !specifyViolation.value.trim()) {
            showMessage("Please specify the violation.", false);
            specifyViolation.focus();
            return;
        }

        if (violationType.value === "Others" && specifyViolation.value.trim() === "Others") {
            showMessage("Please enter a specific violation instead of Others.", false);
            specifyViolation.focus();
            return;
        }


        if (!dateTime.value) {

            showMessage(
                "Please enter the violation date and time.",
                false
            );


            dateTime.focus();


            return;
        }


        if (!activeSemester) {

            showMessage(
                "No active semester is available.",
                false
            );


            return;
        }


    }

    if (savedViolationId !== null && !selectedPhoto) {
        showMessage("Violation #" + savedViolationId + " was saved. Select a photo to retry, or choose Start New Violation.", false);
        return;
    }

    if (
        selectedPhoto &&
        !validatePhoto(
            selectedPhoto
        )
    ) {

        return;
    }


    isSaving = true;
    updateFormState();
    try {
        if (savedViolationId === null) {
            submitButton.textContent = "Saving...";
            const studentResult = await getOrCreateStudent();
            if (!studentResult.success) {
                showMessage("Unable to save the student information.", false);
                return;
            }
            const violationResult = await createViolation(studentResult.studentId);
            if (!violationResult.success) {
                showMessage("Unable to save the violation.", false);
                return;
            }
            savedViolationId = violationResult.violationId;
            updateFormState();
        }
        if (selectedPhoto) {
            submitButton.textContent = photoMetadataPending
                ? "Saving photo details..." : "Uploading photo...";
            const photoResult = await uploadViolationPhoto(savedViolationId);
            if (!photoResult.success) {
                showPhotoFailure(photoResult.stage);
                return;
            }
        }
        resetViolationForm();
        showMessage("Violation saved successfully.", true);
    } catch (error) {
        console.error("Unable to complete submission:", error);
        if (savedViolationId !== null) {
            showPhotoFailure(photoMetadataPending ? "metadata" : "upload");
        } else {
            showMessage("Unable to complete the save. Check whether the violation was saved before submitting again.", false);
        }
    } finally {
        isSaving = false;
        updateFormState();
    }
}

function showPhotoFailure(stage) {
    const detail = stage === "metadata"
        ? "The photo uploaded, but its details could not be saved. Retry Photo will retry the details using the same uploaded file."
        : "The photo upload failed. Retry Photo will retry the photo for this existing violation.";
    showMessage("Violation #" + savedViolationId + " was saved. " + detail, false);
}

function updateFormState() {
    const retryMode = savedViolationId !== null;
    [studentId, studentName, courseId, yearLevel, violationType, specifyViolation,
        locationInput, caughtBy, dateTime, remarks].forEach(function (field) {
        field.disabled = isSaving || retryMode;
    });
    photoInput.disabled = isSaving;
    removePhotoButton.disabled = isSaving;
    clearButton.disabled = isSaving;
    clearButton.textContent = retryMode ? "Start New Violation" : "Clear";
    submitButton.disabled = isSaving;
    if (!isSaving) submitButton.textContent = retryMode ? "Retry Photo" : "Save Violation";
}

function resetViolationForm() {
    savedViolationId = null;
    violationForm.reset();
    violationType.value = "";
    specifyViolation.value = "";
    updateSpecifyViolation();
    removeSelectedPhoto(true);
    setCurrentDateTime();
    updateFormState();
}

/* =====================================================
   CLEAR
===================================================== */

function clearForm() {
    if (isSaving) return;
    if (savedViolationId !== null && !window.confirm(
        "Violation #" + savedViolationId + " is already saved. Start a new violation and abandon this photo retry? The saved violation will remain."
    )) return;
    resetViolationForm();
    hideMessage();
}


/* =====================================================
   PHOTO INPUT
===================================================== */

photoInput.addEventListener(
    "change",
    function () {

        if (isSaving) return;

        const file =
            photoInput.files[0];


        if (!file) {

            removeSelectedPhoto();

            return;
        }


        if (
            !validatePhoto(
                file
            )
        ) {

            removeSelectedPhoto();

            return;
        }


        if (selectedPhoto !== file) {
            uploadedPhotoPath = null;
            photoMetadataPending = false;
        }
        selectedPhoto =
            file;


        if (savedViolationId !== null) {
            showMessage("Violation #" + savedViolationId + " was saved. Retry Photo will attach the selected photo to this violation.", true);
        } else {
            hideMessage();
        }

        showPhotoPreview(
            file
        );
    }
);


/* =====================================================
   EVENTS
===================================================== */

violationType.addEventListener("change", updateSpecifyViolation);

removePhotoButton.addEventListener(
    "click",
    removeSelectedPhoto
);


violationForm.addEventListener(
    "submit",
    saveViolation
);


clearButton.addEventListener(
    "click",
    clearForm
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

    updateSpecifyViolation();

    setCurrentDateTime();


    const userLoaded =
        await loadUser();


    if (!userLoaded) {

        return;
    }


    await Promise.all([
        loadActiveSemester(),
        loadCourses()
    ]);
}


initialize();


//FIX
