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
let savedComplaintId = null;
let isSavingComplaint = false;

function validateCallSlipFields() {
    const validDate = value => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const date = new Date(value + "T00:00:00Z");
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };
    const invalid = (field, message) => {
        showMessage(message, false);
        field.focus();
        return false;
    };
    if (!callDate.value.trim()) return invalid(callDate, "Please enter the Call Slip date.");
    if (!validDate(callDate.value)) return invalid(callDate, "Please enter a valid Call Slip date.");
    if (!["1", "2", "3"].includes(callNumber.value)) return invalid(callNumber, "Please select Call Number 1, 2, or 3.");
    if (!["At Once", "After Class Period", "During Vacant Time", "Specific Date / Time"].includes(scheduleType.value)) {
        return invalid(scheduleType, "Please select a supported schedule.");
    }
    if (scheduleType.value === "Specific Date / Time" && (!scheduledDate.value || !scheduledTime.value)) {
        return invalid(!scheduledDate.value ? scheduledDate : scheduledTime,
            "Please enter the scheduled date and time for Specific Date / Time.");
    }
    if (scheduledDate.value && !validDate(scheduledDate.value)) return invalid(scheduledDate, "Please enter a valid scheduled date.");
    if (scheduledTime.value && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/.test(scheduledTime.value)) {
        return invalid(scheduledTime, "Please enter a valid scheduled time.");
    }
    return true;
}

function updateComplaintFormState() {
    const retry = savedComplaintId !== null;
    [whatHappened, whoInvolved, incidentDatetime, locationInput, howHappened,
        otherDetails, complainantName, complainantStudentId, complainantCourse,
        complainantCellphone, complainantResidenceTel, complainantAddress, dateReported]
        .forEach(field => { field.disabled = isSavingComplaint || retry; });
    [callStudentName, callCourseYear, callDate, callNumber, scheduleType,
        scheduledDate, scheduledTime, callRemarks].forEach(field => { field.disabled = isSavingComplaint; });
    if (addCallSlipCheckbox) {
        addCallSlipCheckbox.disabled = isSavingComplaint || retry;
        if (retry) addCallSlipCheckbox.checked = true;
    }
    if (callSlipFields) callSlipFields.classList.toggle("hidden", !(retry || (addCallSlipCheckbox && addCallSlipCheckbox.checked)));
    submitComplaintButton.disabled = isSavingComplaint;
    submitComplaintButton.textContent = isSavingComplaint
        ? (retry ? "Saving Call Slip..." : "Saving...") : (retry ? "Retry Call Slip" : "Save Complaint");
    clearFormButton.disabled = isSavingComplaint;
    clearFormButton.textContent = retry ? "Start New Complaint" : "Clear";
}

function resetComplaintForm() {
    savedComplaintId = null;
    complaintForm.reset();
    if (receivedBy) receivedBy.value = currentProfile ? currentProfile.full_name : "";
    setToday();
    updateComplaintFormState();
}

function showCallSlipRetryMessage() {
    showMessage("Complaint #" + savedComplaintId + " was saved, but the Call Slip could not be created. Retry Call Slip will use this existing complaint.", false);
}


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

        callDate.value = "";
    }
    // Require explicit Call Slip values instead of accepting untouched defaults.
    if (callNumber) callNumber.selectedIndex = -1;
    if (scheduleType) scheduleType.selectedIndex = -1;
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

async function saveComplaint(event) {
    event.preventDefault();
    if (isSavingComplaint || !currentProfile) return;
    if (currentProfile.role !== "oswe_admin" && currentProfile.role !== "oswe_staff") {
        showMessage("You do not have permission to add complaints.", false);
        return;
    }
    const retry = savedComplaintId !== null;
    const needsCallSlip = retry || (addCallSlipCheckbox && addCallSlipCheckbox.checked);
    hideMessage();
    if (!retry) {
        if (!whatHappened.value.trim()) {
            showMessage("Please enter what happened.", false);
            whatHappened.focus();
            return;
        }
        if (!dateReported.value) {
            showMessage("Please enter the date reported.", false);
            dateReported.focus();
            return;
        }
    }
    if (needsCallSlip && !validateCallSlipFields()) {
        if (retry) {
            const detail = formMessage.textContent;
            showMessage("Complaint #" + savedComplaintId + " is already saved. " + detail, false);
        }
        return;
    }
    isSavingComplaint = true;
    updateComplaintFormState();
    try {
        if (!retry) {
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
                console.error("Unable to save complaint:", result.error);
                showMessage("Unable to save complaint. If the connection failed, verify whether it was saved before submitting again.", false);
                return;
            }
            const id = result.data;
            const validId = (typeof id === "number" && Number.isSafeInteger(id) && id > 0) ||
                (typeof id === "string" && /^[1-9]\d*$/.test(id));
            if (!validId) {
                showMessage("The complaint save returned no valid ID. Verify whether the complaint was saved before submitting again. No Call Slip was created.", false);
                return;
            }
            savedComplaintId = id;
            updateComplaintFormState();
        }
        if (needsCallSlip) {
            if (!await createCallSlip(savedComplaintId)) {
                showCallSlipRetryMessage();
                return;
            }
        }
        resetComplaintForm();
        showMessage("Complaint saved successfully.", true);
    } catch (error) {
        console.error("Unable to complete complaint submission:", error);
        if (savedComplaintId !== null) showCallSlipRetryMessage();
        else showMessage("Unable to complete the save. Verify whether the complaint was saved before submitting again.", false);
    } finally {
        isSavingComplaint = false;
        updateComplaintFormState();
    }
}


/* =====================================================
   CALL SLIP CHECKBOX
===================================================== */

if (addCallSlipCheckbox) {
    addCallSlipCheckbox.addEventListener("change", function () {
        if (isSavingComplaint || savedComplaintId !== null) {
            updateComplaintFormState();
            return;
        }
        updateComplaintFormState();
    });
}


/* =====================================================
   CLEAR FORM
===================================================== */

function clearComplaintForm() {
    if (isSavingComplaint) return;
    if (savedComplaintId !== null && !window.confirm(
        "Complaint #" + savedComplaintId + " is already saved. Start a new complaint and abandon this Call Slip retry? The saved complaint will remain."
    )) return;
    resetComplaintForm();
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
    updateComplaintFormState();
}


initialize();
