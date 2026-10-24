let complaintInitReady = false;
let complaintInitReason = "Loading account information and courses...";
let complaintCoursesReady = false;
let complaintCourseIds = new Set();
let complaintCourseCodes = new Map();
const APPROVED_COMPLAINT_CATEGORIES = [
    "Offenses Against Security",
    "Offenses Against Property",
    "Offenses Against Order",
    "Offenses Involving Dishonesty",
    "Offenses Against Public Morals"
];
const COMPLAINANT_YEAR_LEVELS = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year", "6th Year"];
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

const complainantCourseId = document.getElementById("complainantCourseId");

const complainantYearLevel = document.getElementById("complainantYearLevel");

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
let lastCallSlipIssue = "";

// Availability is advisory; the database UNIQUE constraint is authoritative.
const callNumberAvailability = new Map();
let callAvailabilityToken = 0;
let callAvailabilityMessage = null;
function validCallNumber(value) { return ["1", "2", "3"].includes(String(value)) && value !== ""; }
function callAvailabilityState(complaintId) { return callNumberAvailability.get(String(complaintId)); }
function callAvailabilityNote(text) {
    if (!callAvailabilityMessage) {
        callAvailabilityMessage = document.createElement("p");
        callAvailabilityMessage.className = "mt-2 text-xs text-gray-500";
        callAvailabilityMessage.setAttribute("role", "status");
        callNumber.insertAdjacentElement("afterend", callAvailabilityMessage);
    }
    callAvailabilityMessage.textContent = text;
    callAvailabilityMessage.hidden = !text;
}
function applyCallAvailability(complaintId) {
    const state = complaintId == null ? null : callAvailabilityState(complaintId);
    const used = state?.used || new Set();
    for (const option of callNumber.options) {
        if (validCallNumber(option.value)) option.disabled = used.has(Number(option.value));
    }
    if (state?.ready && used.has(Number(callNumber.value))) callNumber.selectedIndex = -1;
    const allUsed = state?.ready && used.size === 3;
    callAvailabilityNote(state?.loading ? "Checking available call numbers..." : state?.error ?
        "Call availability could not be checked. Try saving again to recheck before any insert." : allUsed ?
        "All three call numbers are already recorded for this complaint." : used.size ?
        "Already recorded: " + Array.from(used).sort().join(", ") + ". Please choose another available call." : "");
    return {blocked: !!state && (!state.ready || state.loading || allUsed), allUsed};
}
async function readUsedCallNumbers(complaintId) {
    const result = await supabaseClient.from("call_slips")
        .select("call_number", {count:"exact"}).eq("complaint_id", complaintId)
        .order("call_number", {ascending:true}).range(0, 3);
    if (result.error) throw result.error;
    if (!Array.isArray(result.data) || !Number.isSafeInteger(result.count) || result.count < 0 || result.count > 3 ||
        result.data.length !== result.count) throw new Error("Incomplete call availability.");
    const used = new Set();
    for (const row of result.data) {
        if (!row || !validCallNumber(row.call_number) || used.has(Number(row.call_number))) throw new Error("Invalid call availability.");
        used.add(Number(row.call_number));
    }
    return used;
}
function callConflictMessage(number, used, uncertain = false) {
    if (used?.size === 3) return uncertain ? "The save could not be confirmed, and all three call numbers are now recorded. Verify the existing calls in Interview Tracking." : "All three call numbers are already recorded for this complaint. Please use the existing calls.";
    if (used?.has(number)) return uncertain ?
        "The save could not be confirmed, but this call number is now recorded. Verify it in Interview Tracking before creating another call. It will not be inserted again." :
        "This call number already exists for this complaint. Please choose another available call.";
    return "Call Slip save could not be confirmed. Verify whether it was saved before submitting again.";
}
function confirmedCallSlip(row, complaintId, number) {
    return row && ((typeof row.id === "number" && Number.isSafeInteger(row.id) && row.id > 0) ||
        (typeof row.id === "string" && /^[1-9]\d*$/.test(row.id))) &&
        String(row.complaint_id) === String(complaintId) && validCallNumber(row.call_number) && Number(row.call_number) === number;
}

async function refreshComplaintCallAvailability(complaintId) {
    const token = ++callAvailabilityToken;
    const key = String(complaintId);
    const isCurrent = () => token === callAvailabilityToken && String(savedComplaintId) === key;
    callNumberAvailability.set(key, {used:new Set(),ready:false,loading:true});
    updateComplaintFormState();
    try {
        const used = await readUsedCallNumbers(complaintId);
        if (!isCurrent()) return null;
        callNumberAvailability.set(key, {used,ready:true,loading:false});
        return used;
    } catch (_) {
        if (isCurrent()) callNumberAvailability.set(key, {used:new Set(),ready:false,loading:false,error:true});
        return null;
    } finally { if (isCurrent()) updateComplaintFormState(); }
}


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
        otherDetails, complainantName, complainantStudentId, complainantYearLevel, complainantCourseId,
        complainantCellphone, complainantResidenceTel, complainantAddress, dateReported]
        .forEach(field => { field.disabled = isSavingComplaint || retry; });
    [callStudentName, callCourseYear, callDate, callNumber, scheduleType,
        scheduledDate, scheduledTime, callRemarks].forEach(field => { field.disabled = isSavingComplaint; });
    if (addCallSlipCheckbox) {
        addCallSlipCheckbox.disabled = isSavingComplaint || retry;
        if (retry) addCallSlipCheckbox.checked = true;
    }
    if (callSlipFields) callSlipFields.classList.toggle("hidden", !(retry || (addCallSlipCheckbox && addCallSlipCheckbox.checked)));
    complainantCourseId.disabled = isSavingComplaint || retry || !complaintCoursesReady;
    submitComplaintButton.disabled = isSavingComplaint || (!complaintInitReady && !retry);
    submitComplaintButton.textContent = isSavingComplaint
        ? (retry ? "Saving Call Slip..." : "Saving...") : (retry ? "Retry Call Slip" : "Save Complaint");
    const availability = applyCallAvailability(savedComplaintId);
    callNumber.disabled = isSavingComplaint || availability.blocked;
    if (retry && availability.allUsed) submitComplaintButton.disabled = true;
    clearFormButton.disabled = isSavingComplaint;
    clearFormButton.textContent = retry ? "Start New Complaint" : "Clear";
}

function resetComplaintForm() {
    callAvailabilityToken++;
    callNumberAvailability.clear();
    lastCallSlipIssue = "";
    savedComplaintId = null;
    complaintForm.reset();
    if (complaintCoursesReady) complainantCourseId.value = "";
    complainantYearLevel.value = "";
    if (receivedBy) receivedBy.value = currentProfile ? currentProfile.full_name : "";
    setToday();
    updateComplaintFormState();
}

function showCallSlipRetryMessage() {
    showMessage("Complaint #" + savedComplaintId + " is already saved. " + (lastCallSlipIssue || "The Call Slip could not be created. Retry Call Slip will use this existing complaint."), false);
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


    requireUserResult(userResult);


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


    if (profileResult.error) throw profileResult.error;


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

async function createCallSlip(complaintId) {
    lastCallSlipIssue = "";
    if (!currentProfile || !["oswe_admin", "oswe_staff"].includes(currentProfile.role)) return false;
    if (!validCallNumber(callNumber.value)) { lastCallSlipIssue = "Please select Call Number 1, 2, or 3."; return false; }
    const number = Number(callNumber.value);
    const payload = {

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
                    number,

                remarks:
                    callRemarks
                        .value
                        .trim() ||
                    null,

                received_by:
                    currentProfile.full_name,

                interview_status:
                    null
            };
    const used = await refreshComplaintCallAvailability(complaintId);
    if (!used) { lastCallSlipIssue = "Call availability could not be checked. Retry will recheck before saving."; return false; }
    if (used.has(number)) { lastCallSlipIssue = callConflictMessage(number, used); return false; }
    try {
        const result = await supabaseClient.from("call_slips").insert(payload)
            .select("id, complaint_id, call_number").single();
        if (result.error) throw result.error;
        if (!confirmedCallSlip(result.data, complaintId, number)) throw new Error("Insert not confirmed.");
        // A read failure after confirmed insertion does not turn the successful write into a retry.
        await refreshComplaintCallAvailability(complaintId);
        return true;
    } catch (error) {
        const reconciled = await refreshComplaintCallAvailability(complaintId);
        lastCallSlipIssue = error?.code === "23505" ?
            (reconciled?.has(number) ? callConflictMessage(number, reconciled) : "A duplicate Call Slip was rejected. Recheck existing calls before choosing another number.") :
            callConflictMessage(number, reconciled, true);
        return false;
    }
}


/* =====================================================
   SAVE COMPLAINT
===================================================== */

async function saveComplaint(event) {
    event.preventDefault();
    if (isSavingComplaint) return;
    if (!complaintInitReady && savedComplaintId === null) { showMessage(complaintInitReason, false); return; }
    if (currentProfile.role !== "oswe_admin" && currentProfile.role !== "oswe_staff") {
        showMessage("You do not have permission to add complaints.", false);
        return;
    }
    const retry = savedComplaintId !== null;
    if (retry) {
        isSavingComplaint = true;
        updateComplaintFormState();
        let used;
        try { used = await refreshComplaintCallAvailability(savedComplaintId); }
        finally { isSavingComplaint = false; updateComplaintFormState(); }
        if (!used) { lastCallSlipIssue = "Call availability could not be checked. Try again before saving."; showCallSlipRetryMessage(); return; }
        if (used.size === 3) { lastCallSlipIssue = "All three call numbers are already recorded for this complaint."; showCallSlipRetryMessage(); return; }
    }
    const needsCallSlip = retry || (addCallSlipCheckbox && addCallSlipCheckbox.checked);
    let incidentTimestamp = null;
    hideMessage();
    let selectedCourseId = null;
    let courseYearSnapshot = null;
    let selectedCategory = null;
    if (!retry) {
        if (!complaintCoursesReady) {
            showMessage("Courses are unavailable. Reload before saving a new complaint.", false);
            return;
        }
        selectedCourseId = complainantCourseId.value || null;
        if (selectedCourseId !== null && !complaintCourseIds.has(selectedCourseId)) {
            showMessage("Please select a course from the loaded list, or choose Unmapped / Not applicable.", false);
            complainantCourseId.focus();
            return;
        }
        if (!COMPLAINANT_YEAR_LEVELS.includes(complainantYearLevel.value)) {
            showMessage("Please select a valid year level.", false);
            complainantYearLevel.focus();
            return;
        }
        courseYearSnapshot = selectedCourseId === null
            ? complainantYearLevel.value
            : complaintCourseCodes.get(selectedCourseId) + " - " + complainantYearLevel.value;
        if (incidentDatetime.value) {
            const value = incidentDatetime.value;
            const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/.exec(value);
            const incidentDate = new Date(value + "+08:00");
            const manilaDate = new Date(incidentDate.getTime() + 8 * 60 * 60 * 1000);
            if (!match || !Number.isFinite(incidentDate.getTime()) ||
                manilaDate.getUTCFullYear() !== Number(match[1]) ||
                manilaDate.getUTCMonth() + 1 !== Number(match[2]) ||
                manilaDate.getUTCDate() !== Number(match[3])) {
                showMessage("Please enter a valid incident date and time.", false);
                incidentDatetime.focus();
                return;
            }
            incidentTimestamp = incidentDate.toISOString();
        }
        selectedCategory = whatHappened.value;
        if (!APPROVED_COMPLAINT_CATEGORIES.includes(selectedCategory)) {
            showMessage("Please select a valid offense category.", false);
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
                    selectedCategory,

                p_complaint_category:
                    selectedCategory,

                p_who_involved:
                    whoInvolved
                        .value
                        .trim() ||
                    null,

                p_incident_datetime:
                    incidentTimestamp,

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
                    courseYearSnapshot,

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
                    currentProfile.full_name,

                p_complainant_course_id:
                    selectedCourseId
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

async function loadComplaintCourses() {
    complaintCoursesReady = false;
    complaintCourseIds = new Set();
    complaintCourseCodes = new Map();
    const result = await supabaseClient.from("courses")
        .select("id, course_code, course_name")
        .order("course_code", { ascending: true });
    if (result.error) throw result.error;
    if (!Array.isArray(result.data)) throw new Error("Invalid course list.");
    const options = [];
    for (const course of result.data) {
        // Never round a bigint through Number; reject numeric IDs already outside its safe range.
        const id = String(course?.id ?? "");
        if (!/^[1-9]\d*$/.test(id) ||
            (typeof course.id === "number" && !Number.isSafeInteger(course.id)) ||
            complaintCourseIds.has(id) || typeof course.course_code !== "string" || typeof course.course_name !== "string") {
            throw new Error("Invalid course returned.");
        }
        complaintCourseIds.add(id);
        complaintCourseCodes.set(id, course.course_code);
        const option = document.createElement("option");
        option.value = id;
        option.textContent = course.course_code + " - " + course.course_name;
        options.push(option);
    }
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Unmapped / Not applicable";
    complainantCourseId.replaceChildren(blank, ...options);
    complainantCourseId.value = "";
    complaintCoursesReady = true;
}

async function initialize() {
    setToday();
    updateComplaintFormState();
    showMessage(complaintInitReason, false);
    try {
        if (!await loadProfile()) throw new Error("Account unavailable.");
        await loadComplaintCourses();
        complaintInitReady = true;
        complaintInitReason = "";
        hideMessage();
    } catch (error) {
        if (!complaintCoursesReady) complainantCourseId.options[0].textContent = "Courses unavailable ? reload to retry";
        complaintInitReason = safeNetworkMessage(error, "Complaints are unavailable. Account information or courses could not be loaded. Reload to try again.");
        showMessage(complaintInitReason, false);
    } finally { updateComplaintFormState(); }
}


initialize();
