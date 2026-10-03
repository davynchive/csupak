/* =====================================================
   CSUPAK - ADD COMPLAINT
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
   COMPLAINT FORM
===================================================== */

const complaintForm =
    document.getElementById(
        "complaintForm"
    );

const whatHappened =
    document.getElementById(
        "whatHappened"
    );

const whoInvolved =
    document.getElementById(
        "whoInvolved"
    );

const incidentDatetime =
    document.getElementById(
        "incidentDatetime"
    );

const locationInput =
    document.getElementById(
        "location"
    );

const howHappened =
    document.getElementById(
        "howHappened"
    );

const otherDetails =
    document.getElementById(
        "otherDetails"
    );

const complainantName =
    document.getElementById(
        "complainantName"
    );

const complainantStudentId =
    document.getElementById(
        "complainantStudentId"
    );

const complainantCourse =
    document.getElementById(
        "complainantCourse"
    );

const complainantCellphone =
    document.getElementById(
        "complainantCellphone"
    );

const complainantResidenceTel =
    document.getElementById(
        "complainantResidenceTel"
    );

const complainantAddress =
    document.getElementById(
        "complainantAddress"
    );

const dateReported =
    document.getElementById(
        "dateReported"
    );

const receivedBy =
    document.getElementById(
        "receivedBy"
    );

const clearFormButton =
    document.getElementById(
        "clearFormButton"
    );

const submitComplaintButton =
    document.getElementById(
        "submitComplaintButton"
    );

const formMessage =
    document.getElementById(
        "formMessage"
    );


/* =====================================================
   CALL SLIP
===================================================== */

const callSlipOption =
    document.getElementById(
        "callSlipOption"
    );

const addCallSlipCheckbox =
    document.getElementById(
        "addCallSlipCheckbox"
    );

const callSlipFields =
    document.getElementById(
        "callSlipFields"
    );

const callStudentName =
    document.getElementById(
        "callStudentName"
    );

const callCourseYear =
    document.getElementById(
        "callCourseYear"
    );

const callDate =
    document.getElementById(
        "callDate"
    );

const callNumber =
    document.getElementById(
        "callNumber"
    );

const scheduleType =
    document.getElementById(
        "scheduleType"
    );

const scheduledDate =
    document.getElementById(
        "scheduledDate"
    );

const scheduledTime =
    document.getElementById(
        "scheduledTime"
    );

const callRemarks =
    document.getElementById(
        "callRemarks"
    );


/* =====================================================
   GLOBAL DATA
===================================================== */

let currentProfile = null;


/* =====================================================
   ROLE DISPLAY
===================================================== */

function getRoleName(role) {

    if (role === "oswe_admin") {

        return "OSWE Administrator";
    }


    if (role === "oswe_staff") {

        return "OSWE Staff";
    }


    return "Authorized User";
}


/* =====================================================
   TODAY
===================================================== */

function setToday() {

    const today =
        new Date();


    const year =
        today.getFullYear();


    const month =
        String(
            today.getMonth() + 1
        ).padStart(
            2,
            "0"
        );


    const day =
        String(
            today.getDate()
        ).padStart(
            2,
            "0"
        );


    const value =
        year +
        "-" +
        month +
        "-" +
        day;


    if (dateReported) {

        dateReported.value =
            value;
    }


    if (callDate) {

        callDate.value =
            value;
    }
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
        ADD COMPLAINT ACCESS

        OSWE Admin: YES
        OSWE Staff: YES
        Security: NO
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


    /*
        USER INFORMATION
    */

    if (userName) {

        userName.textContent =
            currentProfile.full_name;
    }


    if (userRole) {

        userRole.textContent =
            getRoleName(
                currentProfile.role
            );
    }


    if (receivedBy) {

        receivedBy.value =
            currentProfile.full_name;
    }


    /*
        ADD COMPLAINT

        Both Staff and Admin
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
    }


    /*
        INTERVIEW TRACKING

        Both Staff and Admin
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
        ADD CALL SLIP WHILE
        CREATING COMPLAINT

        Both Staff and Admin
    */

    if (callSlipOption) {

        callSlipOption
            .classList
            .remove(
                "hidden"
            );
    }


    /*
        COMPLAINT TRACKING

        ADMIN ONLY
    */

    if (
        currentProfile.role ===
        "oswe_admin"
    ) {

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

    } else {

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
    }


    /*
        SHOW PAGE ONLY AFTER
        ROLE HAS BEEN VERIFIED
    */

    if (pageContent) {

        pageContent.classList.remove(
            "hidden"
        );
    }


    return true;
}


/* =====================================================
   MESSAGE
===================================================== */

function showMessage(
    message,
    success
) {

    if (!formMessage) {

        return;
    }


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

    if (!formMessage) {

        return;
    }


    formMessage.classList.add(
        "hidden"
    );


    formMessage.textContent =
        "";
}


/* =====================================================
   CREATE CALL SLIP
===================================================== */

async function createCallSlip(
    complaintId
) {

    /*
        Both OSWE Admin and OSWE Staff
        are allowed to create Call Slips.
    */

    if (
        currentProfile.role !==
            "oswe_admin" &&
        currentProfile.role !==
            "oswe_staff"
    ) {

        return false;
    }


    if (!callDate.value) {

        showMessage(
            "Please enter the Call Slip date.",
            false
        );

        return false;
    }


    const result =
        await supabaseClient
            .from("call_slips")
            .insert({

                complaint_id:
                    complaintId,

                date:
                    callDate.value,

                student_name:
                    callStudentName
                        .value
                        .trim() ||
                    null,

                course_year:
                    callCourseYear
                        .value
                        .trim() ||
                    null,

                schedule_type:
                    scheduleType.value ||
                    null,

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
                    callRemarks
                        .value
                        .trim() ||
                    null,

                received_by:
                    currentProfile.full_name,

                interview_status:
                    null
            });


    if (result.error) {

        console.error(
            "Unable to create Call Slip:",
            result.error
        );

        return false;
    }


    return true;
}


/* =====================================================
   SAVE COMPLAINT
===================================================== */

async function saveComplaint(
    event
) {

    event.preventDefault();


    if (!currentProfile) {

        return;
    }


    if (
        currentProfile.role !==
            "oswe_admin" &&
        currentProfile.role !==
            "oswe_staff"
    ) {

        showMessage(
            "You do not have permission to add complaints.",
            false
        );

        return;
    }


    if (
        !whatHappened
            .value
            .trim()
    ) {

        showMessage(
            "Please enter what happened.",
            false
        );

        whatHappened.focus();

        return;
    }


    if (!dateReported.value) {

        showMessage(
            "Please enter the date reported.",
            false
        );

        dateReported.focus();

        return;
    }


    submitComplaintButton.disabled =
        true;


    submitComplaintButton.textContent =
        "Saving...";


    hideMessage();


    /*
        CREATE COMPLAINT THROUGH RPC

        This returns the new complaint ID
        without giving Staff access to
        Complaint Tracking.
    */

    const result =
        await supabaseClient.rpc(
            "create_complaint",
            {

                p_what_happened:
                    whatHappened
                        .value
                        .trim(),

                p_who_involved:
                    whoInvolved
                        .value
                        .trim() ||
                    null,

                p_incident_datetime:
                    incidentDatetime.value ||
                    null,

                p_location:
                    locationInput
                        .value
                        .trim() ||
                    null,

                p_how_happened:
                    howHappened
                        .value
                        .trim() ||
                    null,

                p_other_details:
                    otherDetails
                        .value
                        .trim() ||
                    null,

                p_complainant_name:
                    complainantName
                        .value
                        .trim() ||
                    null,

                p_complainant_course_year_major:
                    complainantCourse
                        .value
                        .trim() ||
                    null,

                p_complainant_student_id:
                    complainantStudentId
                        .value
                        .trim() ||
                    null,

                p_complainant_address:
                    complainantAddress
                        .value
                        .trim() ||
                    null,

                p_complainant_residence_tel:
                    complainantResidenceTel
                        .value
                        .trim() ||
                    null,

                p_complainant_cellphone:
                    complainantCellphone
                        .value
                        .trim() ||
                    null,

                p_date_reported:
                    dateReported.value,

                p_received_by:
                    currentProfile.full_name
            }
        );


    if (result.error) {

        console.error(
            "Unable to save complaint:",
            result.error
        );


        showMessage(
            "Unable to save complaint.",
            false
        );


        submitComplaintButton.disabled =
            false;


        submitComplaintButton.textContent =
            "Save Complaint";


        return;
    }


    const complaintId =
        result.data;


    /*
        CREATE CALL SLIP IF SELECTED

        Staff AND Admin can do this.
    */

    if (
        addCallSlipCheckbox &&
        addCallSlipCheckbox.checked
    ) {

        const callSlipSaved =
            await createCallSlip(
                complaintId
            );


        if (!callSlipSaved) {

            showMessage(
                "Complaint saved, but the Call Slip could not be created.",
                false
            );


            submitComplaintButton.disabled =
                false;


            submitComplaintButton.textContent =
                "Save Complaint";


            return;
        }
    }


    showMessage(
        "Complaint saved successfully.",
        true
    );


    /*
        RESET FORM
    */

    complaintForm.reset();


    if (receivedBy) {

        receivedBy.value =
            currentProfile.full_name;
    }


    setToday();


    if (callSlipFields) {

        callSlipFields.classList.add(
            "hidden"
        );
    }


    submitComplaintButton.disabled =
        false;


    submitComplaintButton.textContent =
        "Save Complaint";
}


/* =====================================================
   CALL SLIP CHECKBOX
===================================================== */

if (addCallSlipCheckbox) {

    addCallSlipCheckbox.addEventListener(
        "change",
        function () {

            if (
                addCallSlipCheckbox.checked
            ) {

                callSlipFields.classList.remove(
                    "hidden"
                );

            } else {

                callSlipFields.classList.add(
                    "hidden"
                );
            }
        }
    );
}


/* =====================================================
   CLEAR FORM
===================================================== */

function clearComplaintForm() {

    complaintForm.reset();


    if (receivedBy) {

        receivedBy.value =
            currentProfile
                ? currentProfile.full_name
                : "";
    }


    setToday();


    if (callSlipFields) {

        callSlipFields.classList.add(
            "hidden"
        );
    }


    hideMessage();
}


/* =====================================================
   EVENTS
===================================================== */

if (complaintForm) {

    complaintForm.addEventListener(
        "submit",
        saveComplaint
    );
}


if (clearFormButton) {

    clearFormButton.addEventListener(
        "click",
        clearComplaintForm
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

async function initialize() {

    setToday();


    await loadProfile();
}


initialize();