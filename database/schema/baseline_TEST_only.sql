-- CSUPAK: ISOLATED TEST-ONLY RESTORATION SCRIPT (UNTESTED)
-- Source: schema_public_LIVE.sql (public schema-only pg_dump, PostgreSQL 17.11)
-- Target: a NEW EMPTY Supabase project (CSUPAK-TEST, PostgreSQL 17.12)
-- DO NOT EXECUTE ON PRODUCTION. This is not a full Supabase backup.
-- Differences: removed psql-only \restrict / \unrestrict commands,
-- CREATE SCHEMA public, ALTER SCHEMA public OWNER, and source DEFAULT PRIVILEGES.
-- Kept object-level grants, RLS policies, functions, tables, constraints and triggers.
-- Explicit transaction means a SQL error should abort the entire import.
-- Guard refuses databases with CSUPAK tables, Auth users, or Storage objects.
-- Still requires isolated test verification after execution.

BEGIN;

DO $csupak_test_guard$
BEGIN
    IF to_regclass('auth.users') IS NULL OR to_regclass('storage.objects') IS NULL THEN
        RAISE EXCEPTION 'Expected Supabase-managed auth and storage schemas are missing.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND c.relname = ANY (ARRAY[
              'call_slip_history', 'call_slips', 'colleges',
              'complaint_access_settings', 'complaint_status_history',
              'complaints', 'courses', 'profiles', 'semesters',
              'students', 'violation_photos', 'violation_status_history',
              'violations'
          ])
    ) THEN
        RAISE EXCEPTION 'CSUPAK application tables already exist. Refusing restore.';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users) THEN
        RAISE EXCEPTION 'Auth users already exist. This script is only for a fresh test project.';
    END IF;

    IF EXISTS (SELECT 1 FROM storage.objects) THEN
        RAISE EXCEPTION 'Storage objects already exist. This script is only for a fresh test project.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_extension AS e
        JOIN pg_namespace AS n ON n.oid = e.extnamespace
        WHERE e.extname = 'pgcrypto' AND n.nspname = 'extensions'
    ) THEN
        RAISE EXCEPTION 'pgcrypto extension is missing from extensions schema.';
    END IF;
END;
$csupak_test_guard$;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

-- TEST ADAPTATION: public schema already exists in Supabase.


-- TEST ADAPTATION: preserve the target Supabase-managed public schema owner.

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: audit_call_slip_changes(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.audit_call_slip_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
    v_actor_id uuid;
    v_actor_name text;
    v_actor_role text;

    v_status_changed boolean;
    v_schedule_changed boolean;
    v_remarks_changed boolean;
    v_event_type text;

    v_previous_status text;
    v_previous_schedule_type text;
    v_previous_scheduled_date date;
    v_previous_scheduled_time time without time zone;
    v_previous_remarks text;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_status_changed :=
            OLD.interview_status
            IS DISTINCT FROM
            NEW.interview_status;

        v_schedule_changed :=
            OLD.schedule_type IS DISTINCT FROM NEW.schedule_type
            OR OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date
            OR OLD.scheduled_time IS DISTINCT FROM NEW.scheduled_time;

        -- Audit every actual remarks change, including
        -- remarks-only reschedule updates.
        v_remarks_changed :=
            OLD.remarks IS DISTINCT FROM NEW.remarks;

        IF NOT (
            v_status_changed
            OR v_schedule_changed
            OR v_remarks_changed
        ) THEN
            RETURN NEW;
        END IF;

        v_event_type := CASE
            WHEN v_status_changed AND v_schedule_changed
                THEN 'status_and_schedule_changed'
            WHEN v_schedule_changed
                THEN 'schedule_changed'
            WHEN v_status_changed
                THEN 'status_changed'
            ELSE 'remarks_changed'
        END;

        v_previous_status := OLD.interview_status;
        v_previous_schedule_type := OLD.schedule_type;
        v_previous_scheduled_date := OLD.scheduled_date;
        v_previous_scheduled_time := OLD.scheduled_time;
        v_previous_remarks := OLD.remarks;
    ELSE
        v_event_type := 'created';
    END IF;

    v_actor_id := auth.uid();

    IF v_actor_id IS NOT NULL THEN
        SELECT
            p.full_name,
            p.role::text
        INTO
            v_actor_name,
            v_actor_role
        FROM public.profiles AS p
        WHERE p.id = v_actor_id;
    END IF;

    -- One row per changed parent row, even when multiple
    -- audited fields change together.
    INSERT INTO public.call_slip_history (
        call_slip_id,
        event_type,

        previous_status,
        new_status,

        previous_schedule_type,
        new_schedule_type,

        previous_scheduled_date,
        new_scheduled_date,

        previous_scheduled_time,
        new_scheduled_time,

        previous_remarks,
        new_remarks,

        changed_by,
        changed_at,
        actor_name,
        actor_role
    )
    VALUES (
        NEW.id,
        v_event_type,

        v_previous_status,
        NEW.interview_status,

        v_previous_schedule_type,
        NEW.schedule_type,

        v_previous_scheduled_date,
        NEW.scheduled_date,

        v_previous_scheduled_time,
        NEW.scheduled_time,

        v_previous_remarks,
        NEW.remarks,

        v_actor_id,
        pg_catalog.now(),
        v_actor_name,
        v_actor_role
    );

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.audit_call_slip_changes() OWNER TO postgres;

--
-- Name: audit_complaint_status(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.audit_complaint_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
    v_actor_id uuid;
    v_actor_name text;
    v_actor_role text;

    v_status_changed boolean;
    v_notes_changed boolean;

    v_previous_status text;
    v_previous_notes text;
    v_event_type text;
BEGIN

    IF TG_OP = 'UPDATE' THEN

        v_status_changed :=
            OLD.complaint_status IS DISTINCT FROM NEW.complaint_status;

        v_notes_changed :=
            OLD.ongoing_notes IS DISTINCT FROM NEW.ongoing_notes;

        IF NOT (v_status_changed OR v_notes_changed) THEN
            RETURN NEW;
        END IF;

        IF v_status_changed THEN
            v_event_type := 'status_changed';
        ELSE
            v_event_type := 'notes_updated';
        END IF;

        v_previous_status := OLD.complaint_status;
        v_previous_notes := OLD.ongoing_notes;

    ELSE

        v_event_type := 'created';
        v_previous_status := NULL;
        v_previous_notes := NULL;

    END IF;

    v_actor_id := auth.uid();

    IF v_actor_id IS NOT NULL THEN
        SELECT
            p.full_name,
            p.role::text
        INTO
            v_actor_name,
            v_actor_role
        FROM public.profiles AS p
        WHERE p.id = v_actor_id;
    END IF;

    INSERT INTO public.complaint_status_history (
        complaint_id,
        event_type,
        previous_status,
        new_status,
        previous_ongoing_notes,
        new_ongoing_notes,
        changed_by,
        changed_at,
        actor_name,
        actor_role
    )
    VALUES (
        NEW.id,
        v_event_type,
        v_previous_status,
        NEW.complaint_status,
        v_previous_notes,
        NEW.ongoing_notes,
        v_actor_id,
        pg_catalog.now(),
        v_actor_name,
        v_actor_role
    );

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.audit_complaint_status() OWNER TO postgres;

--
-- Name: audit_violation_status(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.audit_violation_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
    v_actor_id uuid;
    v_actor_name text;
    v_actor_role text;
    v_previous_status text;
    v_event_type text;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NOT (OLD.status IS DISTINCT FROM NEW.status) THEN
            RETURN NEW;
        END IF;

        v_previous_status := OLD.status;
        v_event_type := 'status_changed';
    ELSE
        v_previous_status := NULL;
        v_event_type := 'created';
    END IF;

    v_actor_id := auth.uid();

    IF v_actor_id IS NOT NULL THEN
        SELECT
            p.full_name,
            p.role::text
        INTO
            v_actor_name,
            v_actor_role
        FROM public.profiles AS p
        WHERE p.id = v_actor_id;
    END IF;

    INSERT INTO public.violation_status_history (
        violation_id,
        event_type,
        previous_status,
        new_status,
        changed_by,
        changed_at,
        actor_name,
        actor_role
    )
    VALUES (
        NEW.id,
        v_event_type,
        v_previous_status,
        NEW.status,
        v_actor_id,
        pg_catalog.now(),
        v_actor_name,
        v_actor_role
    );

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.audit_violation_status() OWNER TO postgres;

--
-- Name: create_complaint(text, text, timestamp with time zone, text, text, text, text, text, text, text, text, text, date, text, text, bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_complaint(p_what_happened text, p_who_involved text DEFAULT NULL::text, p_incident_datetime timestamp with time zone DEFAULT NULL::timestamp with time zone, p_location text DEFAULT NULL::text, p_how_happened text DEFAULT NULL::text, p_other_details text DEFAULT NULL::text, p_complainant_name text DEFAULT NULL::text, p_complainant_course_year_major text DEFAULT NULL::text, p_complainant_student_id text DEFAULT NULL::text, p_complainant_address text DEFAULT NULL::text, p_complainant_residence_tel text DEFAULT NULL::text, p_complainant_cellphone text DEFAULT NULL::text, p_date_reported date DEFAULT CURRENT_DATE, p_received_by text DEFAULT NULL::text, p_complaint_category text DEFAULT NULL::text, p_complainant_course_id bigint DEFAULT NULL::bigint) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    new_complaint_id bigint;
    user_role text;
BEGIN

    -- Require an authenticated user.
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized'
            USING ERRCODE = '42501';
    END IF;


    user_role := public.get_my_role();


    -- NULL-safe authorization.
    IF user_role IS NULL
       OR user_role NOT IN (
           'oswe_admin',
           'oswe_staff'
       )
    THEN
        RAISE EXCEPTION 'Unauthorized'
            USING ERRCODE = '42501';
    END IF;


    -- Validate the structured complaint category.
    IF p_complaint_category IS NOT NULL
       AND p_complaint_category NOT IN (
           'Offenses Against Security',
           'Offenses Against Property',
           'Offenses Against Order',
           'Offenses Involving Dishonesty',
           'Offenses Against Public Morals'
       )
    THEN
        RAISE EXCEPTION 'Invalid complaint category'
            USING ERRCODE = '22023';
    END IF;


    -- Validate the structured complainant course.
    IF p_complainant_course_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM public.courses AS c
           WHERE c.id = p_complainant_course_id
       )
    THEN
        RAISE EXCEPTION 'Invalid complainant course'
            USING ERRCODE = '23503';
    END IF;


    INSERT INTO public.complaints (
        what_happened,
        who_involved,
        incident_datetime,
        location,
        how_happened,
        other_details,

        complainant_name,
        complainant_course_year_major,
        complainant_student_id,
        complainant_address,
        complainant_residence_tel,
        complainant_cellphone,

        date_reported,
        received_by,

        complaint_category,
        complainant_course_id,

        complaint_status
    )
    VALUES (
        p_what_happened,
        p_who_involved,
        p_incident_datetime,
        p_location,
        p_how_happened,
        p_other_details,

        p_complainant_name,
        p_complainant_course_year_major,
        p_complainant_student_id,
        p_complainant_address,
        p_complainant_residence_tel,
        p_complainant_cellphone,

        p_date_reported,
        p_received_by,

        p_complaint_category,
        p_complainant_course_id,

        'Pending'
    )
    RETURNING id
    INTO new_complaint_id;


    RETURN new_complaint_id;

END;
$$;


ALTER FUNCTION public.create_complaint(p_what_happened text, p_who_involved text, p_incident_datetime timestamp with time zone, p_location text, p_how_happened text, p_other_details text, p_complainant_name text, p_complainant_course_year_major text, p_complainant_student_id text, p_complainant_address text, p_complainant_residence_tel text, p_complainant_cellphone text, p_date_reported date, p_received_by text, p_complaint_category text, p_complainant_course_id bigint) OWNER TO postgres;

--
-- Name: create_complaint_v2(text, text, timestamp with time zone, text, text, text, text, text, text, text, text, text, date, text, text, bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_complaint_v2(p_what_happened text, p_who_involved text DEFAULT NULL::text, p_incident_datetime timestamp with time zone DEFAULT NULL::timestamp with time zone, p_location text DEFAULT NULL::text, p_how_happened text DEFAULT NULL::text, p_other_details text DEFAULT NULL::text, p_complainant_name text DEFAULT NULL::text, p_complainant_course_year_major text DEFAULT NULL::text, p_complainant_student_id text DEFAULT NULL::text, p_complainant_address text DEFAULT NULL::text, p_complainant_residence_tel text DEFAULT NULL::text, p_complainant_cellphone text DEFAULT NULL::text, p_date_reported date DEFAULT CURRENT_DATE, p_received_by text DEFAULT NULL::text, p_complaint_category text DEFAULT NULL::text, p_complainant_course_id bigint DEFAULT NULL::bigint, p_complainee_course_id bigint DEFAULT NULL::bigint, p_complainee_external_affiliation text DEFAULT NULL::text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE
    new_complaint_id bigint;
    user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized'
            USING ERRCODE = '42501';
    END IF;

    user_role := public.get_my_role();

    IF user_role IS NULL
       OR user_role NOT IN ('oswe_admin', 'oswe_staff')
    THEN
        RAISE EXCEPTION 'Unauthorized'
            USING ERRCODE = '42501';
    END IF;

    IF p_complaint_category IS NOT NULL
       AND p_complaint_category NOT IN (
           'Offenses Against Security',
           'Offenses Against Property',
           'Offenses Against Order',
           'Offenses Involving Dishonesty',
           'Offenses Against Public Morals'
       )
    THEN
        RAISE EXCEPTION 'Invalid complaint category'
            USING ERRCODE = '22023';
    END IF;

    IF p_complainant_course_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM public.courses AS c
           WHERE c.id = p_complainant_course_id
       )
    THEN
        RAISE EXCEPTION 'Invalid complainant course'
            USING ERRCODE = '23503';
    END IF;

    -- Accept exactly one case: an existing CSU course with no external
    -- affiliation, or a NULL course with non-whitespace external affiliation.
    IF p_complainee_course_id IS NULL THEN
        IF p_complainee_external_affiliation IS NULL
           OR p_complainee_external_affiliation !~ '[^[:space:]]'
        THEN
            RAISE EXCEPTION 'A complainee course or external affiliation is required'
                USING ERRCODE = '22023';
        END IF;
    ELSE
        IF p_complainee_external_affiliation IS NOT NULL THEN
            RAISE EXCEPTION 'A CSU complainee course cannot have an external affiliation'
                USING ERRCODE = '22023';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.courses AS c
            WHERE c.id = p_complainee_course_id
        )
        THEN
            RAISE EXCEPTION 'Invalid complainee course'
                USING ERRCODE = '23503';
        END IF;
    END IF;

    INSERT INTO public.complaints (
        what_happened,
        who_involved,
        incident_datetime,
        location,
        how_happened,
        other_details,
        complainant_name,
        complainant_course_year_major,
        complainant_student_id,
        complainant_address,
        complainant_residence_tel,
        complainant_cellphone,
        date_reported,
        received_by,
        complaint_category,
        complainant_course_id,
        complainee_course_id,
        complainee_external_affiliation,
        complaint_status
    )
    VALUES (
        p_what_happened,
        p_who_involved,
        p_incident_datetime,
        p_location,
        p_how_happened,
        p_other_details,
        p_complainant_name,
        p_complainant_course_year_major,
        p_complainant_student_id,
        p_complainant_address,
        p_complainant_residence_tel,
        p_complainant_cellphone,
        p_date_reported,
        p_received_by,
        p_complaint_category,
        p_complainant_course_id,
        p_complainee_course_id,
        CASE
            WHEN p_complainee_course_id IS NULL
            THEN regexp_replace(
                p_complainee_external_affiliation,
                '^[[:space:]]+|[[:space:]]+$',
                '',
                'g'
            )
            ELSE NULL
        END,
        'Pending'
    )
    RETURNING id
    INTO new_complaint_id;

    RETURN new_complaint_id;
END;
$_$;


ALTER FUNCTION public.create_complaint_v2(p_what_happened text, p_who_involved text, p_incident_datetime timestamp with time zone, p_location text, p_how_happened text, p_other_details text, p_complainant_name text, p_complainant_course_year_major text, p_complainant_student_id text, p_complainant_address text, p_complainant_residence_tel text, p_complainant_cellphone text, p_date_reported date, p_received_by text, p_complaint_category text, p_complainant_course_id bigint, p_complainee_course_id bigint, p_complainee_external_affiliation text) OWNER TO postgres;

--
-- Name: get_complaint_report_sources_with_passkey(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_complaint_report_sources_with_passkey(entered_passkey text) RETURNS TABLE(complaint_id bigint, complainant_course_id bigint, college_id bigint, college_code text, college_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT (
        public.get_my_role()
        IS NOT DISTINCT FROM 'oswe_admin'
    ) THEN
        RAISE EXCEPTION 'Permission denied'
            USING ERRCODE = '42501';
    END IF;

    IF entered_passkey IS NULL
       OR entered_passkey ~ '^[[:space:]]*$'
    THEN
        RAISE EXCEPTION 'Complaint access denied'
            USING ERRCODE = '42501';
    END IF;

    IF public.verify_complaint_passkey(entered_passkey)
       IS DISTINCT FROM TRUE
    THEN
        RAISE EXCEPTION 'Complaint access denied'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        complaint.id AS complaint_id,
        complaint.complainant_course_id,
        college.id AS college_id,
        college.college_code,
        college.college_name
    FROM public.complaints AS complaint
    LEFT JOIN public.courses AS course
        ON course.id = complaint.complainant_course_id
    LEFT JOIN public.colleges AS college
        ON college.id = course.college_id
    ORDER BY complaint.id ASC;
END;
$_$;


ALTER FUNCTION public.get_complaint_report_sources_with_passkey(entered_passkey text) OWNER TO postgres;

--
-- Name: get_complaint_report_sources_with_passkey_v2(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_complaint_report_sources_with_passkey_v2(entered_passkey text) RETURNS TABLE(complaint_id bigint, complainee_course_id bigint, complainee_external_affiliation text, college_id bigint, college_code text, college_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;

    IF public.get_my_role() IS DISTINCT FROM 'oswe_admin' THEN
        RAISE EXCEPTION 'Permission denied'
            USING ERRCODE = '42501';
    END IF;

    IF entered_passkey IS NULL
       OR entered_passkey ~ '^[[:space:]]*$'
    THEN
        RAISE EXCEPTION 'Complaint access denied'
            USING ERRCODE = '42501';
    END IF;

    IF public.verify_complaint_passkey(entered_passkey)
       IS DISTINCT FROM TRUE
    THEN
        RAISE EXCEPTION 'Complaint access denied'
            USING ERRCODE = '42501';
    END IF;

    -- complaints.id is unique; courses.id and colleges.id are primary keys.
    -- Therefore these LEFT JOINs retain exactly one row per complaint.
    RETURN QUERY
    SELECT
        complaint.id AS complaint_id,
        complaint.complainee_course_id,
        complaint.complainee_external_affiliation,
        college.id AS college_id,
        college.college_code,
        college.college_name
    FROM public.complaints AS complaint
    LEFT JOIN public.courses AS course
        ON course.id = complaint.complainee_course_id
    LEFT JOIN public.colleges AS college
        ON college.id = course.college_id
    ORDER BY complaint.id ASC;
END;
$_$;


ALTER FUNCTION public.get_complaint_report_sources_with_passkey_v2(entered_passkey text) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: complaint_status_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.complaint_status_history (
    id bigint NOT NULL,
    complaint_id bigint NOT NULL,
    event_type text NOT NULL,
    previous_status text,
    new_status text,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_name text,
    actor_role text,
    previous_ongoing_notes text,
    new_ongoing_notes text,
    CONSTRAINT complaint_status_history_event_type_check CHECK ((event_type = ANY (ARRAY['baseline'::text, 'created'::text, 'status_changed'::text, 'notes_updated'::text])))
);


ALTER TABLE public.complaint_status_history OWNER TO postgres;

--
-- Name: get_complaint_status_history_with_passkey(text, bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_complaint_status_history_with_passkey(entered_passkey text, complaint_id bigint) RETURNS SETOF public.complaint_status_history
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
BEGIN
    -- 1. Require an authenticated actor.
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. NULL-safe Admin requirement.
    IF NOT (
        public.get_my_role()::text
        IS NOT DISTINCT FROM
        'oswe_admin'
    ) THEN
        RAISE EXCEPTION 'Not authorized.'
            USING ERRCODE = '42501';
    END IF;

    -- 3. Reject NULL, empty, and whitespace-only passkeys.
    IF $1 IS NULL OR $1 !~ '[^[:space:]]' THEN
        RAISE EXCEPTION 'Passkey is required.'
            USING ERRCODE = '42501';
    END IF;

    -- 4/5. Verify directly; NULL also means verification failed.
    -- Preserve the submitted value rather than altering the secret.
    IF public.verify_complaint_passkey($1) IS NOT TRUE THEN
        RAISE EXCEPTION 'Invalid passkey.'
            USING ERRCODE = '42501';
    END IF;

    -- 6. Validate the bigint identifier.
    IF $2 IS NULL OR $2 <= 0 THEN
        RAISE EXCEPTION 'Invalid complaint ID.'
            USING ERRCODE = '22023';
    END IF;

    -- 7. Confirm that this complaint exists.
    IF NOT EXISTS (
        SELECT 1
        FROM public.complaints AS c
        WHERE c.id = $2
    ) THEN
        RAISE EXCEPTION 'Complaint not found or unavailable.'
            USING ERRCODE = '42501';
    END IF;

    -- 8/9. Return only the requested complaint's history.
    RETURN QUERY
    SELECT h.*
    FROM public.complaint_status_history AS h
    WHERE h.complaint_id = $2
    ORDER BY h.changed_at DESC, h.id DESC;
END;
$_$;


ALTER FUNCTION public.get_complaint_status_history_with_passkey(entered_passkey text, complaint_id bigint) OWNER TO postgres;

--
-- Name: complaints; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.complaints (
    id bigint NOT NULL,
    what_happened text NOT NULL,
    who_involved text,
    incident_datetime timestamp with time zone,
    location text,
    how_happened text,
    other_details text,
    complainant_name text,
    complainant_course_year_major text,
    complainant_student_id text,
    complainant_address text,
    complainant_residence_tel text,
    complainant_cellphone text,
    date_reported date NOT NULL,
    received_by text,
    complaint_status text DEFAULT 'Pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    complaint_category text,
    complainant_course_id bigint,
    ongoing_notes text,
    complainee_course_id bigint,
    complainee_external_affiliation text,
    CONSTRAINT complaints_complainee_affiliation_check CHECK (((complainee_external_affiliation IS NULL) OR ((complainee_course_id IS NULL) AND (complainee_external_affiliation ~ '[^[:space:]]'::text)))),
    CONSTRAINT complaints_complaint_category_check CHECK (((complaint_category IS NULL) OR (complaint_category = ANY (ARRAY['Offenses Against Security'::text, 'Offenses Against Property'::text, 'Offenses Against Order'::text, 'Offenses Involving Dishonesty'::text, 'Offenses Against Public Morals'::text])))),
    CONSTRAINT complaints_complaint_status_check CHECK ((complaint_status = ANY (ARRAY['Pending'::text, 'On-going'::text, 'Resolved'::text]))),
    CONSTRAINT complaints_ongoing_notes_length_check CHECK (((ongoing_notes IS NULL) OR ((char_length(btrim(ongoing_notes)) >= 1) AND (char_length(btrim(ongoing_notes)) <= 1000))))
);


ALTER TABLE public.complaints OWNER TO postgres;

--
-- Name: COLUMN complaints.complainee_course_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.complaints.complainee_course_id IS 'Selected CSU program for the person complained about; college is derived through courses.college_id.';


--
-- Name: COLUMN complaints.complainee_external_affiliation; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.complaints.complainee_external_affiliation IS 'Organization or origin for an external complainee selected as Others.';


--
-- Name: get_complaints_with_passkey(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_complaints_with_passkey(entered_passkey text) RETURNS SETOF public.complaints
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
begin

    if public.get_my_role() is distinct from 'oswe_admin' then
        raise exception 'Unauthorized';
    end if;

    if not public.verify_complaint_passkey(
        entered_passkey
    ) then
        raise exception 'Invalid passkey';
    end if;

    return query
    select *
    from public.complaints
    order by
        date_reported desc,
        created_at desc;

end;
$$;


ALTER FUNCTION public.get_complaints_with_passkey(entered_passkey text) OWNER TO postgres;

--
-- Name: get_interview_complaint_summaries(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_interview_complaint_summaries() RETURNS TABLE(complaint_id text, involved_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
    v_role text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    v_role := public.get_my_role();

    if v_role is null
       or v_role not in ('oswe_admin', 'oswe_staff')
    then
        raise exception 'Unauthorized'
            using errcode = '42501';
    end if;

    return query
    select
        c.id::text,
        nullif(btrim(c.who_involved), '')
    from public.complaints as c
    order by c.id asc;
end;
$$;


ALTER FUNCTION public.get_interview_complaint_summaries() OWNER TO postgres;

--
-- Name: get_my_role(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_my_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    select role
    from public.profiles
    where id = auth.uid();
$$;


ALTER FUNCTION public.get_my_role() OWNER TO postgres;

--
-- Name: update_complaint_status_with_passkey(text, bigint, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_complaint_status_with_passkey(entered_passkey text, complaint_id bigint, new_status text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN public.update_complaint_status_with_passkey(
        entered_passkey,
        complaint_id,
        new_status,
        NULL
    );
END;
$$;


ALTER FUNCTION public.update_complaint_status_with_passkey(entered_passkey text, complaint_id bigint, new_status text) OWNER TO postgres;

--
-- Name: update_complaint_status_with_passkey(text, bigint, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_complaint_status_with_passkey(entered_passkey text, complaint_id bigint, new_status text, p_ongoing_notes text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_current_status text;
    v_current_notes text;
    v_trimmed_notes text;
BEGIN

    IF public.get_my_role() IS DISTINCT FROM 'oswe_admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF NOT public.verify_complaint_passkey(entered_passkey) THEN
        RAISE EXCEPTION 'Invalid passkey';
    END IF;

    IF new_status NOT IN (
        'Pending',
        'On-going',
        'Resolved'
    ) THEN
        RAISE EXCEPTION 'Invalid complaint status';
    END IF;

    IF complaint_id IS NULL OR complaint_id <= 0 THEN
        RAISE EXCEPTION 'Invalid complaint ID';
    END IF;

    SELECT
        c.complaint_status,
        c.ongoing_notes
    INTO
        v_current_status,
        v_current_notes
    FROM public.complaints AS c
    WHERE c.id = complaint_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Complaint not found or unavailable';
    END IF;

    v_trimmed_notes := NULLIF(btrim(p_ongoing_notes), '');

    IF v_trimmed_notes IS NOT NULL
       AND char_length(v_trimmed_notes) > 1000
    THEN
        RAISE EXCEPTION
            'Remarks / Notes must not exceed 1000 characters'
            USING ERRCODE = '22023';
    END IF;


    -- Notes may only be changed while the complaint is On-going.
    IF p_ongoing_notes IS NOT NULL THEN

        IF v_current_status <> 'On-going'
           AND new_status <> 'On-going'
        THEN
            RAISE EXCEPTION
                'Remarks / Notes can only be edited while the complaint is On-going'
                USING ERRCODE = '22023';
        END IF;

        UPDATE public.complaints
        SET
            complaint_status = new_status,
            ongoing_notes = v_trimmed_notes
        WHERE id = complaint_id;

    ELSE

        -- A normal status change does not require or alter the note.
        UPDATE public.complaints
        SET complaint_status = new_status
        WHERE id = complaint_id;

    END IF;

    RETURN true;
END;
$$;


ALTER FUNCTION public.update_complaint_status_with_passkey(entered_passkey text, complaint_id bigint, new_status text, p_ongoing_notes text) OWNER TO postgres;

--
-- Name: verify_complaint_passkey(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.verify_complaint_passkey(entered_passkey text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
    stored_hash text;
begin

    if public.get_my_role() is distinct from 'oswe_admin' then
        return false;
    end if;

    select passkey_hash
    into stored_hash
    from public.complaint_access_settings
    limit 1;

    if stored_hash is null then
        return false;
    end if;

    return (
        extensions.crypt(
            entered_passkey,
            stored_hash
        ) = stored_hash
    );
end;
$$;


ALTER FUNCTION public.verify_complaint_passkey(entered_passkey text) OWNER TO postgres;

--
-- Name: call_slip_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.call_slip_history (
    id bigint NOT NULL,
    call_slip_id bigint NOT NULL,
    event_type text NOT NULL,
    previous_status text,
    new_status text,
    previous_schedule_type text,
    new_schedule_type text,
    previous_scheduled_date date,
    new_scheduled_date date,
    previous_scheduled_time time without time zone,
    new_scheduled_time time without time zone,
    previous_remarks text,
    new_remarks text,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_name text,
    actor_role text,
    CONSTRAINT call_slip_history_event_type_check CHECK ((event_type = ANY (ARRAY['baseline'::text, 'created'::text, 'status_changed'::text, 'schedule_changed'::text, 'status_and_schedule_changed'::text, 'remarks_changed'::text])))
);


ALTER TABLE public.call_slip_history OWNER TO postgres;

--
-- Name: call_slip_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.call_slip_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.call_slip_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: call_slips; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.call_slips (
    id bigint NOT NULL,
    complaint_id bigint NOT NULL,
    date date NOT NULL,
    student_name text,
    course_year text,
    schedule_type text,
    scheduled_date date,
    scheduled_time time without time zone,
    call_number integer NOT NULL,
    remarks text,
    received_by text,
    interview_status text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT call_slips_call_number_check CHECK (((call_number >= 1) AND (call_number <= 3))),
    CONSTRAINT call_slips_interview_status_check CHECK ((interview_status = ANY (ARRAY['Show'::text, 'Reschedule'::text, 'No Show'::text])))
);


ALTER TABLE public.call_slips OWNER TO postgres;

--
-- Name: call_slips_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.call_slips ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.call_slips_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: colleges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.colleges (
    id bigint NOT NULL,
    college_code text NOT NULL,
    college_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.colleges OWNER TO postgres;

--
-- Name: colleges_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.colleges ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.colleges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: complaint_access_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.complaint_access_settings (
    id bigint NOT NULL,
    passkey_hash text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.complaint_access_settings OWNER TO postgres;

--
-- Name: complaint_access_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.complaint_access_settings ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.complaint_access_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: complaint_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.complaint_status_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.complaint_status_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: complaints_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.complaints ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.complaints_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: courses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.courses (
    id bigint NOT NULL,
    course_code text NOT NULL,
    course_name text NOT NULL,
    college_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.courses OWNER TO postgres;

--
-- Name: courses_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.courses ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.courses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['oswe_admin'::text, 'oswe_staff'::text, 'security_office'::text])))
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: semesters; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.semesters (
    id bigint NOT NULL,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_active boolean DEFAULT false
);


ALTER TABLE public.semesters OWNER TO postgres;

--
-- Name: semesters_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.semesters ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.semesters_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: students; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.students (
    id bigint NOT NULL,
    student_id text NOT NULL,
    student_name text NOT NULL,
    course_year text,
    college text,
    created_at timestamp with time zone DEFAULT now(),
    course_id bigint,
    year_level integer,
    CONSTRAINT students_year_level_check CHECK (((year_level IS NULL) OR ((year_level >= 1) AND (year_level <= 6))))
);


ALTER TABLE public.students OWNER TO postgres;

--
-- Name: students_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.students ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.students_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: violation_photos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.violation_photos (
    id bigint NOT NULL,
    violation_id bigint NOT NULL,
    file_path text NOT NULL,
    file_name text,
    file_size bigint,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.violation_photos OWNER TO postgres;

--
-- Name: violation_photos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.violation_photos ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.violation_photos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: violation_status_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.violation_status_history (
    id bigint NOT NULL,
    violation_id bigint NOT NULL,
    event_type text NOT NULL,
    previous_status text,
    new_status text,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_name text,
    actor_role text,
    CONSTRAINT violation_status_history_event_type_check CHECK ((event_type = ANY (ARRAY['baseline'::text, 'created'::text, 'status_changed'::text])))
);


ALTER TABLE public.violation_status_history OWNER TO postgres;

--
-- Name: violation_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.violation_status_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.violation_status_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: violations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.violations (
    id bigint NOT NULL,
    student_id bigint NOT NULL,
    semester_id bigint,
    violation_type text NOT NULL,
    location text,
    caught_apprehended_by text,
    date_time timestamp with time zone NOT NULL,
    remarks text,
    status text DEFAULT 'Pending'::text NOT NULL,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT violations_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Blocked Clearance'::text, 'Unblocked Clearance'::text, 'Rendered Do-Day'::text])))
);


ALTER TABLE public.violations OWNER TO postgres;

--
-- Name: violations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.violations ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.violations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: call_slip_history call_slip_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.call_slip_history
    ADD CONSTRAINT call_slip_history_pkey PRIMARY KEY (id);


--
-- Name: call_slips call_slips_complaint_call_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.call_slips
    ADD CONSTRAINT call_slips_complaint_call_number_key UNIQUE (complaint_id, call_number);


--
-- Name: call_slips call_slips_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.call_slips
    ADD CONSTRAINT call_slips_pkey PRIMARY KEY (id);


--
-- Name: colleges colleges_college_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colleges
    ADD CONSTRAINT colleges_college_code_key UNIQUE (college_code);


--
-- Name: colleges colleges_college_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colleges
    ADD CONSTRAINT colleges_college_name_key UNIQUE (college_name);


--
-- Name: colleges colleges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colleges
    ADD CONSTRAINT colleges_pkey PRIMARY KEY (id);


--
-- Name: complaint_access_settings complaint_access_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.complaint_access_settings
    ADD CONSTRAINT complaint_access_settings_pkey PRIMARY KEY (id);


--
-- Name: complaint_status_history complaint_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.complaint_status_history
    ADD CONSTRAINT complaint_status_history_pkey PRIMARY KEY (id);


--
-- Name: complaints complaints_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_pkey PRIMARY KEY (id);


--
-- Name: courses courses_course_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_course_code_key UNIQUE (course_code);


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: semesters semesters_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.semesters
    ADD CONSTRAINT semesters_pkey PRIMARY KEY (id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: students students_student_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_student_id_key UNIQUE (student_id);


--
-- Name: violation_photos violation_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.violation_photos
    ADD CONSTRAINT violation_photos_pkey PRIMARY KEY (id);


--
-- Name: violation_status_history violation_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.violation_status_history
    ADD CONSTRAINT violation_status_history_pkey PRIMARY KEY (id);


--
-- Name: violations violations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.violations
    ADD CONSTRAINT violations_pkey PRIMARY KEY (id);


--
-- Name: call_slip_history_actor_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX call_slip_history_actor_idx ON public.call_slip_history USING btree (changed_by) WHERE (changed_by IS NOT NULL);


--
-- Name: call_slip_history_record_order_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX call_slip_history_record_order_idx ON public.call_slip_history USING btree (call_slip_id, changed_at DESC, id DESC);


--
-- Name: complaint_status_history_actor_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX complaint_status_history_actor_idx ON public.complaint_status_history USING btree (changed_by) WHERE (changed_by IS NOT NULL);


--
-- Name: complaint_status_history_record_order_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX complaint_status_history_record_order_idx ON public.complaint_status_history USING btree (complaint_id, changed_at DESC, id DESC);


--
-- Name: complaints_complainant_course_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX complaints_complainant_course_id_idx ON public.complaints USING btree (complainant_course_id) WHERE (complainant_course_id IS NOT NULL);


--
-- Name: violation_status_history_actor_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX violation_status_history_actor_idx ON public.violation_status_history USING btree (changed_by) WHERE (changed_by IS NOT NULL);


--
-- Name: violation_status_history_record_order_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX violation_status_history_record_order_idx ON public.violation_status_history USING btree (violation_id, changed_at DESC, id DESC);


--
-- Name: call_slips call_slips_history_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER call_slips_history_trigger AFTER INSERT OR UPDATE ON public.call_slips FOR EACH ROW EXECUTE FUNCTION public.audit_call_slip_changes();


--
-- Name: complaints complaints_status_history_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER complaints_status_history_trigger AFTER INSERT OR UPDATE ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.audit_complaint_status();


--
-- Name: violations violations_status_history_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER violations_status_history_trigger AFTER INSERT OR UPDATE ON public.violations FOR EACH ROW EXECUTE FUNCTION public.audit_violation_status();


--
-- Name: call_slip_history call_slip_history_call_slip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.call_slip_history
    ADD CONSTRAINT call_slip_history_call_slip_id_fkey FOREIGN KEY (call_slip_id) REFERENCES public.call_slips(id) ON DELETE CASCADE;


--
-- Name: call_slip_history call_slip_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.call_slip_history
    ADD CONSTRAINT call_slip_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: call_slips call_slips_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.call_slips
    ADD CONSTRAINT call_slips_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE CASCADE;


--
-- Name: complaint_status_history complaint_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.complaint_status_history
    ADD CONSTRAINT complaint_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: complaint_status_history complaint_status_history_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.complaint_status_history
    ADD CONSTRAINT complaint_status_history_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE CASCADE;


--
-- Name: complaints complaints_complainant_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_complainant_course_id_fkey FOREIGN KEY (complainant_course_id) REFERENCES public.courses(id) ON DELETE RESTRICT;


--
-- Name: complaints complaints_complainee_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_complainee_course_id_fkey FOREIGN KEY (complainee_course_id) REFERENCES public.courses(id);


--
-- Name: courses courses_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: students students_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id);


--
-- Name: violation_photos violation_photos_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.violation_photos
    ADD CONSTRAINT violation_photos_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);


--
-- Name: violation_photos violation_photos_violation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.violation_photos
    ADD CONSTRAINT violation_photos_violation_id_fkey FOREIGN KEY (violation_id) REFERENCES public.violations(id) ON DELETE CASCADE;


--
-- Name: violation_status_history violation_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.violation_status_history
    ADD CONSTRAINT violation_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: violation_status_history violation_status_history_violation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.violation_status_history
    ADD CONSTRAINT violation_status_history_violation_id_fkey FOREIGN KEY (violation_id) REFERENCES public.violations(id) ON DELETE CASCADE;


--
-- Name: violations violations_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.violations
    ADD CONSTRAINT violations_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id);


--
-- Name: violations violations_semester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.violations
    ADD CONSTRAINT violations_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.semesters(id);


--
-- Name: violations violations_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.violations
    ADD CONSTRAINT violations_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: semesters Authenticated users can view semesters; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can view semesters" ON public.semesters FOR SELECT TO authenticated USING (true);


--
-- Name: students Authorized users can view students; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authorized users can view students" ON public.students FOR SELECT TO authenticated USING ((public.get_my_role() = ANY (ARRAY['oswe_admin'::text, 'security_office'::text, 'complaint_officer'::text])));


--
-- Name: violation_photos Authorized users can view violation photos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authorized users can view violation photos" ON public.violation_photos FOR SELECT TO authenticated USING ((public.get_my_role() = ANY (ARRAY['oswe_admin'::text, 'security_office'::text, 'complaint_officer'::text])));


--
-- Name: violations Authorized users can view violations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authorized users can view violations" ON public.violations FOR SELECT TO authenticated USING ((public.get_my_role() = ANY (ARRAY['oswe_admin'::text, 'security_office'::text, 'complaint_officer'::text])));


--
-- Name: call_slips Call slips delete for oswe admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Call slips delete for oswe admin" ON public.call_slips FOR DELETE TO authenticated USING ((public.get_my_role() = 'oswe_admin'::text));


--
-- Name: call_slips Call slips insert for oswe; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Call slips insert for oswe" ON public.call_slips FOR INSERT TO authenticated WITH CHECK ((public.get_my_role() = ANY (ARRAY['oswe_admin'::text, 'oswe_staff'::text])));


--
-- Name: call_slips Call slips update for oswe; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Call slips update for oswe" ON public.call_slips FOR UPDATE TO authenticated USING ((public.get_my_role() = ANY (ARRAY['oswe_admin'::text, 'oswe_staff'::text]))) WITH CHECK ((public.get_my_role() = ANY (ARRAY['oswe_admin'::text, 'oswe_staff'::text])));


--
-- Name: call_slips Call slips visible to oswe; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Call slips visible to oswe" ON public.call_slips FOR SELECT TO authenticated USING ((public.get_my_role() = ANY (ARRAY['oswe_admin'::text, 'oswe_staff'::text])));


--
-- Name: colleges Colleges visible to authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Colleges visible to authenticated users" ON public.colleges FOR SELECT TO authenticated USING ((public.get_my_role() = ANY (ARRAY['security_office'::text, 'oswe_staff'::text, 'oswe_admin'::text])));


--
-- Name: complaints Complaints delete for oswe admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Complaints delete for oswe admin" ON public.complaints FOR DELETE TO authenticated USING ((public.get_my_role() = 'oswe_admin'::text));


--
-- Name: complaints Complaints insert for oswe admin or staff; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Complaints insert for oswe admin or staff" ON public.complaints FOR INSERT TO authenticated WITH CHECK ((public.get_my_role() = ANY (ARRAY['oswe_admin'::text, 'oswe_staff'::text])));


--
-- Name: courses Courses visible to authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Courses visible to authenticated users" ON public.courses FOR SELECT TO authenticated USING ((public.get_my_role() = ANY (ARRAY['security_office'::text, 'oswe_staff'::text, 'oswe_admin'::text])));


--
-- Name: call_slips OSWE can delete call slips; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "OSWE can delete call slips" ON public.call_slips FOR DELETE TO authenticated USING ((public.get_my_role() = 'oswe_admin'::text));


--
-- Name: complaints OSWE can delete complaints; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "OSWE can delete complaints" ON public.complaints FOR DELETE TO authenticated USING ((public.get_my_role() = 'oswe_admin'::text));


--
-- Name: semesters OSWE can manage semesters; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "OSWE can manage semesters" ON public.semesters TO authenticated USING ((public.get_my_role() = 'oswe_admin'::text)) WITH CHECK ((public.get_my_role() = 'oswe_admin'::text));


--
-- Name: students OSWE can manage students; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "OSWE can manage students" ON public.students TO authenticated USING ((public.get_my_role() = 'oswe_admin'::text)) WITH CHECK ((public.get_my_role() = 'oswe_admin'::text));


--
-- Name: violation_photos OSWE can manage violation photos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "OSWE can manage violation photos" ON public.violation_photos TO authenticated USING ((public.get_my_role() = 'oswe_admin'::text)) WITH CHECK ((public.get_my_role() = 'oswe_admin'::text));


--
-- Name: violations OSWE can manage violations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "OSWE can manage violations" ON public.violations TO authenticated USING ((public.get_my_role() = 'oswe_admin'::text)) WITH CHECK ((public.get_my_role() = 'oswe_admin'::text));


--
-- Name: students Security Office can add students; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Security Office can add students" ON public.students FOR INSERT TO authenticated WITH CHECK ((public.get_my_role() = ANY (ARRAY['oswe_admin'::text, 'security_office'::text])));


--
-- Name: violations Security Office can add violations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Security Office can add violations" ON public.violations FOR INSERT TO authenticated WITH CHECK ((public.get_my_role() = 'security_office'::text));


--
-- Name: violation_photos Security Office can upload violation photos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Security Office can upload violation photos" ON public.violation_photos FOR INSERT TO authenticated WITH CHECK ((public.get_my_role() = 'security_office'::text));


--
-- Name: students Students insert for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Students insert for authorized users" ON public.students FOR INSERT TO authenticated WITH CHECK ((public.get_my_role() = ANY (ARRAY['security_office'::text, 'oswe_staff'::text, 'oswe_admin'::text])));


--
-- Name: students Students update for oswe; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Students update for oswe" ON public.students FOR UPDATE TO authenticated USING ((public.get_my_role() = ANY (ARRAY['oswe_staff'::text, 'oswe_admin'::text]))) WITH CHECK ((public.get_my_role() = ANY (ARRAY['oswe_staff'::text, 'oswe_admin'::text])));


--
-- Name: students Students visible to authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Students visible to authorized users" ON public.students FOR SELECT TO authenticated USING ((public.get_my_role() = ANY (ARRAY['security_office'::text, 'oswe_staff'::text, 'oswe_admin'::text])));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- Name: violation_photos Violation photos delete for oswe admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Violation photos delete for oswe admin" ON public.violation_photos FOR DELETE TO authenticated USING ((public.get_my_role() = 'oswe_admin'::text));


--
-- Name: violation_photos Violation photos insert for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Violation photos insert for authorized users" ON public.violation_photos FOR INSERT TO authenticated WITH CHECK ((public.get_my_role() = ANY (ARRAY['security_office'::text, 'oswe_staff'::text, 'oswe_admin'::text])));


--
-- Name: violation_photos Violation photos visible to authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Violation photos visible to authorized users" ON public.violation_photos FOR SELECT TO authenticated USING ((public.get_my_role() = ANY (ARRAY['security_office'::text, 'oswe_staff'::text, 'oswe_admin'::text])));


--
-- Name: violations Violations delete for oswe admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Violations delete for oswe admin" ON public.violations FOR DELETE TO authenticated USING ((public.get_my_role() = 'oswe_admin'::text));


--
-- Name: violations Violations insert for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Violations insert for authorized users" ON public.violations FOR INSERT TO authenticated WITH CHECK ((public.get_my_role() = ANY (ARRAY['security_office'::text, 'oswe_staff'::text, 'oswe_admin'::text])));


--
-- Name: violations Violations update for oswe; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Violations update for oswe" ON public.violations FOR UPDATE TO authenticated USING ((public.get_my_role() = ANY (ARRAY['oswe_staff'::text, 'oswe_admin'::text]))) WITH CHECK ((public.get_my_role() = ANY (ARRAY['oswe_staff'::text, 'oswe_admin'::text])));


--
-- Name: violations Violations visible to authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Violations visible to authorized users" ON public.violations FOR SELECT TO authenticated USING ((public.get_my_role() = ANY (ARRAY['security_office'::text, 'oswe_staff'::text, 'oswe_admin'::text])));


--
-- Name: call_slip_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.call_slip_history ENABLE ROW LEVEL SECURITY;

--
-- Name: call_slip_history call_slip_history_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY call_slip_history_read ON public.call_slip_history FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['oswe_staff'::text, 'oswe_admin'::text])) AND (EXISTS ( SELECT 1
   FROM public.call_slips cs
  WHERE (cs.id = call_slip_history.call_slip_id)))));


--
-- Name: call_slips; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.call_slips ENABLE ROW LEVEL SECURITY;

--
-- Name: colleges; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;

--
-- Name: complaint_access_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.complaint_access_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: complaint_status_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.complaint_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: complaints; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

--
-- Name: courses; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: semesters; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;

--
-- Name: students; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

--
-- Name: violation_photos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.violation_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: violation_status_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.violation_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: violation_status_history violation_status_history_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY violation_status_history_read ON public.violation_status_history FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['security_office'::text, 'oswe_staff'::text, 'oswe_admin'::text])) AND (EXISTS ( SELECT 1
   FROM public.violations v
  WHERE (v.id = violation_status_history.violation_id)))));


--
-- Name: violations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION audit_call_slip_changes(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.audit_call_slip_changes() FROM PUBLIC;


--
-- Name: FUNCTION audit_complaint_status(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.audit_complaint_status() FROM PUBLIC;


--
-- Name: FUNCTION audit_violation_status(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.audit_violation_status() FROM PUBLIC;


--
-- Name: FUNCTION create_complaint(p_what_happened text, p_who_involved text, p_incident_datetime timestamp with time zone, p_location text, p_how_happened text, p_other_details text, p_complainant_name text, p_complainant_course_year_major text, p_complainant_student_id text, p_complainant_address text, p_complainant_residence_tel text, p_complainant_cellphone text, p_date_reported date, p_received_by text, p_complaint_category text, p_complainant_course_id bigint); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_complaint(p_what_happened text, p_who_involved text, p_incident_datetime timestamp with time zone, p_location text, p_how_happened text, p_other_details text, p_complainant_name text, p_complainant_course_year_major text, p_complainant_student_id text, p_complainant_address text, p_complainant_residence_tel text, p_complainant_cellphone text, p_date_reported date, p_received_by text, p_complaint_category text, p_complainant_course_id bigint) TO anon;
GRANT ALL ON FUNCTION public.create_complaint(p_what_happened text, p_who_involved text, p_incident_datetime timestamp with time zone, p_location text, p_how_happened text, p_other_details text, p_complainant_name text, p_complainant_course_year_major text, p_complainant_student_id text, p_complainant_address text, p_complainant_residence_tel text, p_complainant_cellphone text, p_date_reported date, p_received_by text, p_complaint_category text, p_complainant_course_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.create_complaint(p_what_happened text, p_who_involved text, p_incident_datetime timestamp with time zone, p_location text, p_how_happened text, p_other_details text, p_complainant_name text, p_complainant_course_year_major text, p_complainant_student_id text, p_complainant_address text, p_complainant_residence_tel text, p_complainant_cellphone text, p_date_reported date, p_received_by text, p_complaint_category text, p_complainant_course_id bigint) TO service_role;


--
-- Name: FUNCTION create_complaint_v2(p_what_happened text, p_who_involved text, p_incident_datetime timestamp with time zone, p_location text, p_how_happened text, p_other_details text, p_complainant_name text, p_complainant_course_year_major text, p_complainant_student_id text, p_complainant_address text, p_complainant_residence_tel text, p_complainant_cellphone text, p_date_reported date, p_received_by text, p_complaint_category text, p_complainant_course_id bigint, p_complainee_course_id bigint, p_complainee_external_affiliation text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_complaint_v2(p_what_happened text, p_who_involved text, p_incident_datetime timestamp with time zone, p_location text, p_how_happened text, p_other_details text, p_complainant_name text, p_complainant_course_year_major text, p_complainant_student_id text, p_complainant_address text, p_complainant_residence_tel text, p_complainant_cellphone text, p_date_reported date, p_received_by text, p_complaint_category text, p_complainant_course_id bigint, p_complainee_course_id bigint, p_complainee_external_affiliation text) TO anon;
GRANT ALL ON FUNCTION public.create_complaint_v2(p_what_happened text, p_who_involved text, p_incident_datetime timestamp with time zone, p_location text, p_how_happened text, p_other_details text, p_complainant_name text, p_complainant_course_year_major text, p_complainant_student_id text, p_complainant_address text, p_complainant_residence_tel text, p_complainant_cellphone text, p_date_reported date, p_received_by text, p_complaint_category text, p_complainant_course_id bigint, p_complainee_course_id bigint, p_complainee_external_affiliation text) TO authenticated;
GRANT ALL ON FUNCTION public.create_complaint_v2(p_what_happened text, p_who_involved text, p_incident_datetime timestamp with time zone, p_location text, p_how_happened text, p_other_details text, p_complainant_name text, p_complainant_course_year_major text, p_complainant_student_id text, p_complainant_address text, p_complainant_residence_tel text, p_complainant_cellphone text, p_date_reported date, p_received_by text, p_complaint_category text, p_complainant_course_id bigint, p_complainee_course_id bigint, p_complainee_external_affiliation text) TO service_role;


--
-- Name: FUNCTION get_complaint_report_sources_with_passkey(entered_passkey text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_complaint_report_sources_with_passkey(entered_passkey text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_complaint_report_sources_with_passkey(entered_passkey text) TO authenticated;


--
-- Name: FUNCTION get_complaint_report_sources_with_passkey_v2(entered_passkey text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_complaint_report_sources_with_passkey_v2(entered_passkey text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_complaint_report_sources_with_passkey_v2(entered_passkey text) TO authenticated;


--
-- Name: FUNCTION get_complaint_status_history_with_passkey(entered_passkey text, complaint_id bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_complaint_status_history_with_passkey(entered_passkey text, complaint_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_complaint_status_history_with_passkey(entered_passkey text, complaint_id bigint) TO authenticated;


--
-- Name: TABLE complaints; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.complaints TO anon;
GRANT ALL ON TABLE public.complaints TO authenticated;
GRANT ALL ON TABLE public.complaints TO service_role;


--
-- Name: FUNCTION get_complaints_with_passkey(entered_passkey text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_complaints_with_passkey(entered_passkey text) TO anon;
GRANT ALL ON FUNCTION public.get_complaints_with_passkey(entered_passkey text) TO authenticated;
GRANT ALL ON FUNCTION public.get_complaints_with_passkey(entered_passkey text) TO service_role;


--
-- Name: FUNCTION get_interview_complaint_summaries(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_interview_complaint_summaries() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_interview_complaint_summaries() TO authenticated;


--
-- Name: FUNCTION get_my_role(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_my_role() TO anon;
GRANT ALL ON FUNCTION public.get_my_role() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_role() TO service_role;


--
-- Name: FUNCTION update_complaint_status_with_passkey(entered_passkey text, complaint_id bigint, new_status text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.update_complaint_status_with_passkey(entered_passkey text, complaint_id bigint, new_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_complaint_status_with_passkey(entered_passkey text, complaint_id bigint, new_status text) TO authenticated;


--
-- Name: FUNCTION update_complaint_status_with_passkey(entered_passkey text, complaint_id bigint, new_status text, p_ongoing_notes text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.update_complaint_status_with_passkey(entered_passkey text, complaint_id bigint, new_status text, p_ongoing_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_complaint_status_with_passkey(entered_passkey text, complaint_id bigint, new_status text, p_ongoing_notes text) TO authenticated;


--
-- Name: FUNCTION verify_complaint_passkey(entered_passkey text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.verify_complaint_passkey(entered_passkey text) TO anon;
GRANT ALL ON FUNCTION public.verify_complaint_passkey(entered_passkey text) TO authenticated;
GRANT ALL ON FUNCTION public.verify_complaint_passkey(entered_passkey text) TO service_role;


--
-- Name: TABLE call_slip_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.call_slip_history TO authenticated;


--
-- Name: TABLE call_slips; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.call_slips TO anon;
GRANT ALL ON TABLE public.call_slips TO authenticated;
GRANT ALL ON TABLE public.call_slips TO service_role;


--
-- Name: SEQUENCE call_slips_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.call_slips_id_seq TO anon;
GRANT ALL ON SEQUENCE public.call_slips_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.call_slips_id_seq TO service_role;


--
-- Name: TABLE colleges; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.colleges TO anon;
GRANT ALL ON TABLE public.colleges TO authenticated;
GRANT ALL ON TABLE public.colleges TO service_role;


--
-- Name: SEQUENCE colleges_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.colleges_id_seq TO anon;
GRANT ALL ON SEQUENCE public.colleges_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.colleges_id_seq TO service_role;


--
-- Name: TABLE complaint_access_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.complaint_access_settings TO anon;
GRANT ALL ON TABLE public.complaint_access_settings TO authenticated;
GRANT ALL ON TABLE public.complaint_access_settings TO service_role;


--
-- Name: SEQUENCE complaint_access_settings_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.complaint_access_settings_id_seq TO anon;
GRANT ALL ON SEQUENCE public.complaint_access_settings_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.complaint_access_settings_id_seq TO service_role;


--
-- Name: SEQUENCE complaints_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.complaints_id_seq TO anon;
GRANT ALL ON SEQUENCE public.complaints_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.complaints_id_seq TO service_role;


--
-- Name: TABLE courses; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.courses TO anon;
GRANT ALL ON TABLE public.courses TO authenticated;
GRANT ALL ON TABLE public.courses TO service_role;


--
-- Name: SEQUENCE courses_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.courses_id_seq TO anon;
GRANT ALL ON SEQUENCE public.courses_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.courses_id_seq TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE semesters; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.semesters TO anon;
GRANT ALL ON TABLE public.semesters TO authenticated;
GRANT ALL ON TABLE public.semesters TO service_role;


--
-- Name: SEQUENCE semesters_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.semesters_id_seq TO anon;
GRANT ALL ON SEQUENCE public.semesters_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.semesters_id_seq TO service_role;


--
-- Name: TABLE students; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.students TO anon;
GRANT ALL ON TABLE public.students TO authenticated;
GRANT ALL ON TABLE public.students TO service_role;


--
-- Name: SEQUENCE students_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.students_id_seq TO anon;
GRANT ALL ON SEQUENCE public.students_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.students_id_seq TO service_role;


--
-- Name: TABLE violation_photos; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.violation_photos TO anon;
GRANT ALL ON TABLE public.violation_photos TO authenticated;
GRANT ALL ON TABLE public.violation_photos TO service_role;


--
-- Name: SEQUENCE violation_photos_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.violation_photos_id_seq TO anon;
GRANT ALL ON SEQUENCE public.violation_photos_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.violation_photos_id_seq TO service_role;


--
-- Name: TABLE violation_status_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.violation_status_history TO authenticated;


--
-- Name: TABLE violations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.violations TO anon;
GRANT ALL ON TABLE public.violations TO authenticated;
GRANT ALL ON TABLE public.violations TO service_role;


--
-- Name: SEQUENCE violations_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.violations_id_seq TO anon;
GRANT ALL ON SEQUENCE public.violations_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.violations_id_seq TO service_role;


-- TEST ADAPTATION: omitted source default-privilege statements; target Supabase manages these.

COMMIT;
