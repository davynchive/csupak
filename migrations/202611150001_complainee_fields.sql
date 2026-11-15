-- Versioned Complainee fields and v2 RPCs.
-- Existing complaints retain NULL in both new fields; no backfill is performed.
-- Phase 1 only: keep create_complaint unchanged during frontend transition.
-- Apply once, using a role authorized to alter these objects and set owners to postgres.

BEGIN;

ALTER TABLE public.complaints
    ADD COLUMN complainee_course_id bigint,
    ADD COLUMN complainee_external_affiliation text;

ALTER TABLE public.complaints
    ADD CONSTRAINT complaints_complainee_course_id_fkey
        FOREIGN KEY (complainee_course_id)
        REFERENCES public.courses (id)
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    ADD CONSTRAINT complaints_complainee_affiliation_check
        CHECK (
            complainee_external_affiliation IS NULL
            OR (
                complainee_course_id IS NULL
                AND complainee_external_affiliation ~ '[^[:space:]]'
            )
        );

COMMENT ON COLUMN public.complaints.complainee_course_id IS
    'Selected CSU program for the person complained about; college is derived through courses.college_id.';

COMMENT ON COLUMN public.complaints.complainee_external_affiliation IS
    'Organization or origin for an external complainee selected as Others.';

CREATE FUNCTION public.create_complaint_v2(
    p_what_happened text,
    p_who_involved text DEFAULT NULL::text,
    p_incident_datetime timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_location text DEFAULT NULL::text,
    p_how_happened text DEFAULT NULL::text,
    p_other_details text DEFAULT NULL::text,
    p_complainant_name text DEFAULT NULL::text,
    p_complainant_course_year_major text DEFAULT NULL::text,
    p_complainant_student_id text DEFAULT NULL::text,
    p_complainant_address text DEFAULT NULL::text,
    p_complainant_residence_tel text DEFAULT NULL::text,
    p_complainant_cellphone text DEFAULT NULL::text,
    p_date_reported date DEFAULT CURRENT_DATE,
    p_received_by text DEFAULT NULL::text,
    p_complaint_category text DEFAULT NULL::text,
    p_complainant_course_id bigint DEFAULT NULL::bigint,
    p_complainee_course_id bigint DEFAULT NULL::bigint,
    p_complainee_external_affiliation text DEFAULT NULL::text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
$function$;

ALTER FUNCTION public.create_complaint_v2(
    text, text, timestamp with time zone, text, text, text, text, text,
    text, text, text, text, date, text, text, bigint, bigint, text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_complaint_v2(
    text, text, timestamp with time zone, text, text, text, text, text,
    text, text, text, text, date, text, text, bigint, bigint, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_complaint_v2(
    text, text, timestamp with time zone, text, text, text, text, text,
    text, text, text, text, date, text, text, bigint, bigint, text
) TO PUBLIC, postgres, anon, authenticated, service_role;

CREATE FUNCTION public.get_complaint_report_sources_with_passkey_v2(
    entered_passkey text
)
RETURNS TABLE (
    complaint_id bigint,
    complainee_course_id bigint,
    complainee_external_affiliation text,
    college_id bigint,
    college_code text,
    college_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
$function$;

ALTER FUNCTION public.get_complaint_report_sources_with_passkey_v2(text)
    OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_complaint_report_sources_with_passkey_v2(text)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_complaint_report_sources_with_passkey_v2(text)
    TO authenticated;

-- get_complaints_with_passkey returns SETOF complaints and SELECT * from that
-- table. Altering the table's composite row type exposes both new columns.
-- Its security settings, owner, and grants are therefore left unchanged.

NOTIFY pgrst, 'reload schema';

COMMIT;
