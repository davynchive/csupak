-- Step 7.3.2. Requires the reviewed 7.3.1 execution copy to have completed.
-- Review the live catalog and existing consumers before applying to CSUPAK-TEST.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $check_dependencies$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute
        WHERE attrelid = 'public.profiles'::regclass AND attname = 'is_active'
          AND atttypid = 'boolean'::regtype AND attnotnull AND NOT attisdropped
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute
        WHERE attrelid = 'public.profiles'::regclass AND attname = 'session_valid_after'
          AND atttypid = 'timestamptz'::regtype AND NOT attisdropped
    ) THEN
        RAISE EXCEPTION 'Apply the reviewed Step 7.3.1 account status migration first';
    END IF;

    IF pg_catalog.to_regprocedure('public.update_my_profile(text)') IS NULL THEN
        RAISE EXCEPTION 'Apply the existing My Account migration first';
    END IF;

    IF pg_catalog.has_any_column_privilege('authenticated', 'public.profiles', 'INSERT, UPDATE')
       OR pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'DELETE')
    THEN
        RAISE EXCEPTION 'Apply the Step 7.3.1 restrictions on direct profile writes first';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS f
        JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = f.proowner
        JOIN pg_catalog.pg_class AS p ON p.oid = 'public.profiles'::regclass
        JOIN pg_catalog.pg_class AS s ON s.oid = pg_catalog.to_regclass('auth.sessions')
        JOIN pg_catalog.pg_class AS u ON u.oid = pg_catalog.to_regclass('auth.users')
        WHERE f.oid = pg_catalog.to_regprocedure('public.get_my_role()')
          AND p.relrowsecurity
          AND (
              owner_role.rolsuper OR owner_role.rolbypassrls
              OR (p.relowner = f.proowner AND NOT p.relforcerowsecurity)
          )
          AND (
              NOT s.relrowsecurity OR owner_role.rolsuper OR owner_role.rolbypassrls
              OR (s.relowner = f.proowner AND NOT s.relforcerowsecurity)
          )
          AND (
              NOT u.relrowsecurity OR owner_role.rolsuper OR owner_role.rolbypassrls
              OR (u.relowner = f.proowner AND NOT u.relforcerowsecurity)
          )
          AND pg_catalog.has_schema_privilege(f.proowner, 'public', 'USAGE')
          AND pg_catalog.has_column_privilege(f.proowner, p.oid, 'id', 'SELECT')
          AND pg_catalog.has_column_privilege(f.proowner, p.oid, 'role', 'SELECT')
          AND pg_catalog.has_column_privilege(f.proowner, p.oid, 'is_active', 'SELECT')
          AND pg_catalog.has_column_privilege(f.proowner, p.oid, 'session_valid_after', 'SELECT')
          AND pg_catalog.has_schema_privilege(f.proowner, 'auth', 'USAGE')
          AND pg_catalog.has_column_privilege(f.proowner, s.oid, 'id', 'SELECT')
          AND pg_catalog.has_column_privilege(f.proowner, s.oid, 'user_id', 'SELECT')
          AND pg_catalog.has_column_privilege(f.proowner, s.oid, 'created_at', 'SELECT')
          AND pg_catalog.has_column_privilege(f.proowner, u.oid, 'id', 'SELECT')
          AND pg_catalog.has_column_privilege(f.proowner, u.oid, 'is_anonymous', 'SELECT')
    ) THEN
        RAISE EXCEPTION 'Review role helper owner privileges and RLS for profiles, Auth users, and Auth sessions';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute
        WHERE attrelid = 'auth.users'::regclass AND attname = 'is_anonymous'
          AND atttypid = 'boolean'::regtype AND NOT attisdropped
    ) THEN
        RAISE EXCEPTION 'Expected a boolean Auth user anonymity flag';
    END IF;

    IF (
        SELECT count(*) FROM pg_catalog.pg_attribute
        WHERE attrelid = 'auth.sessions'::regclass AND attnum > 0 AND NOT attisdropped
          AND (
              (attname IN ('id', 'user_id') AND atttypid = 'uuid'::regtype)
              OR (attname = 'created_at' AND atttypid = 'timestamptz'::regtype)
          )
    ) <> 3 THEN
        RAISE EXCEPTION 'Unexpected managed Auth session column types';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname IN ('anon', 'authenticated') AND (rolsuper OR rolbypassrls)
    ) THEN
        RAISE EXCEPTION 'Browser roles must be subject to row-level security';
    END IF;
END;
$check_dependencies$;

CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
    SET row_security = off
AS $get_my_role$
DECLARE
    caller_id uuid := auth.uid();
    caller_role text;
    cutoff timestamptz;
    claims jsonb;
    session_claim text;
BEGIN
    IF caller_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT p.role, p.session_valid_after
      INTO caller_role, cutoff
    FROM public.profiles AS p
    WHERE p.id = caller_id AND p.is_active;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    claims := auth.jwt();
    IF pg_catalog.jsonb_typeof(claims) IS DISTINCT FROM 'object' THEN
        RETURN NULL;
    END IF;

    IF NOT (claims ? 'is_anonymous') THEN
        -- Legacy tokens may omit the flag. Require an authoritative permanent user.
        IF NOT EXISTS (
            SELECT 1 FROM auth.users AS u
            WHERE u.id = caller_id AND u.is_anonymous IS FALSE
        ) THEN
            RETURN NULL;
        END IF;
    ELSIF (claims -> 'is_anonymous') IS DISTINCT FROM 'false'::jsonb THEN
        -- Deny anonymous users and malformed values, including explicit JSON null.
        RETURN NULL;
    END IF;

    -- Grandfather existing eligible sessions when no cutoff has been set.
    IF cutoff IS NULL THEN
        RETURN caller_role;
    END IF;

    session_claim := claims ->> 'session_id';
    IF pg_catalog.jsonb_typeof(claims -> 'session_id') IS DISTINCT FROM 'string'
       OR (session_claim ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') IS NOT TRUE
    THEN
        RETURN NULL;
    END IF;

    -- Refreshing a token does not make an old session a new session.
    IF EXISTS (
        SELECT 1
        FROM auth.sessions AS s
        WHERE s.id = session_claim::uuid
          AND s.user_id = caller_id
          AND s.created_at > cutoff
    ) THEN
        RETURN caller_role;
    END IF;

    RETURN NULL;
END;
$get_my_role$;

CREATE OR REPLACE FUNCTION public.update_my_profile(p_full_name text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
AS $update_my_profile$
DECLARE
    v_user_id uuid := auth.uid();
    v_full_name text := pg_catalog.btrim(p_full_name);
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    IF public.get_my_role() IS NULL THEN
        RAISE EXCEPTION 'Account access denied' USING ERRCODE = '42501';
    END IF;

    IF v_full_name IS NULL
        OR pg_catalog.char_length(v_full_name) < 2
        OR pg_catalog.char_length(v_full_name) > 100
    THEN
        RAISE EXCEPTION 'Full name must contain 2 to 100 characters' USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
    SET full_name = v_full_name
    WHERE id = v_user_id AND is_active;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account access denied' USING ERRCODE = '42501';
    END IF;

    RETURN v_full_name;
END;
$update_my_profile$;

CREATE OR REPLACE FUNCTION public.verify_complaint_passkey(entered_passkey text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
AS $verify_passkey$
DECLARE
    stored_hash text;
BEGIN
    IF public.get_my_role() IS DISTINCT FROM 'oswe_admin'
       OR entered_passkey IS NULL OR entered_passkey !~ '[^[:space:]]'
    THEN
        RETURN false;
    END IF;

    -- A missing or ambiguous configuration cannot authorize access.
    SELECT min(s.passkey_hash) INTO stored_hash
    FROM public.complaint_access_settings AS s
    HAVING count(*) = 1;

    -- Accept complete PostgreSQL 17 crypt formats only. In particular, an
    -- unsupported modular prefix must not fall through to the DES decoder.
    IF (stored_hash COLLATE pg_catalog."C" ~
        '^([$]2[ax][$][0-9]{2}[$][./0-9A-Za-z]{53}|[$]1[$][^$]{0,8}[$][./0-9A-Za-z]{22}|_[./0-9A-Za-z]{19}|[./0-9A-Za-z]{13})$') IS NOT TRUE
    THEN
        RETURN false;
    END IF;

    BEGIN
        RETURN (extensions.crypt(entered_passkey, stored_hash) COLLATE pg_catalog."C" = stored_hash) IS TRUE;
    EXCEPTION
        WHEN external_routine_invocation_exception OR invalid_parameter_value THEN
            RETURN false;
    END;
END;
$verify_passkey$;

-- These two legacy callers now require a positive verification result.
-- The three-argument update wrapper delegates to the four-argument overload.
CREATE OR REPLACE FUNCTION public.get_complaints_with_passkey(entered_passkey text) RETURNS SETOF public.complaints
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
AS $get_complaints_with_passkey$
begin

    if public.get_my_role() is distinct from 'oswe_admin' then
        raise exception 'Unauthorized' using errcode = '42501';
    end if;

    if public.verify_complaint_passkey(entered_passkey) IS NOT TRUE then
        raise exception 'Invalid passkey' using errcode = '42501';
    end if;

    return query
    select *
    from public.complaints
    order by
        date_reported desc,
        created_at desc;

end;
$get_complaints_with_passkey$;

CREATE OR REPLACE FUNCTION public.update_complaint_status_with_passkey(entered_passkey text, complaint_id bigint, new_status text, p_ongoing_notes text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
AS $update_complaint_status_with_passkey$
DECLARE
    v_current_status text;
    v_current_notes text;
    v_trimmed_notes text;
BEGIN

    IF public.get_my_role() IS DISTINCT FROM 'oswe_admin' THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    IF public.verify_complaint_passkey(entered_passkey) IS NOT TRUE THEN
        RAISE EXCEPTION 'Invalid passkey' USING ERRCODE = '42501';
    END IF;

    IF new_status IS NULL OR new_status NOT IN (
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
$update_complaint_status_with_passkey$;

-- Preserve all existing permissive policies and their role-specific checks.
-- The restrictive gate also covers semester SELECT and profile self-read.
DO $restrict_tables$
DECLARE
    table_name text;
    relation regclass;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'call_slip_history',
        'call_slips',
        'colleges',
        'complaint_access_settings',
        'complaint_status_history',
        'complaints',
        'courses',
        'profiles',
        'semesters',
        'students',
        'violation_photos',
        'violation_status_history',
        'violations'
    ]
    LOOP
        relation := pg_catalog.to_regclass(pg_catalog.format('public.%I', table_name));
        IF NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_class
            WHERE oid = relation AND relkind = 'r' AND relrowsecurity
        ) THEN
            RAISE EXCEPTION 'Expected RLS-enabled application table public.%', table_name;
        END IF;

        EXECUTE pg_catalog.format(
            'CREATE POLICY active_account_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated'
            ' USING ((SELECT public.get_my_role()) IS NOT NULL)'
            ' WITH CHECK ((SELECT public.get_my_role()) IS NOT NULL)',
            table_name
        );

        EXECUTE pg_catalog.format(
            'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon',
            table_name
        );
        EXECUTE pg_catalog.format(
            'REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.%I FROM authenticated',
            table_name
        );

        IF pg_catalog.has_table_privilege('anon', relation, 'DELETE, TRUNCATE, TRIGGER, MAINTAIN')
            OR pg_catalog.has_any_column_privilege('anon', relation, 'SELECT, INSERT, UPDATE, REFERENCES')
            OR pg_catalog.has_table_privilege('authenticated', relation, 'TRUNCATE, TRIGGER, MAINTAIN')
            OR pg_catalog.has_any_column_privilege('authenticated', relation, 'REFERENCES')
        THEN
            RAISE EXCEPTION 'Unexpected effective browser privileges on public.%', table_name;
        END IF;
    END LOOP;
END;
$restrict_tables$;

-- All baseline sequences back IDENTITY columns. App inserts do not use
-- explicit nextval/currval calls, and implicit identity generation is retained.
REVOKE ALL PRIVILEGES ON SEQUENCE
    public.call_slip_history_id_seq,
    public.call_slips_id_seq,
    public.colleges_id_seq,
    public.complaint_access_settings_id_seq,
    public.complaint_status_history_id_seq,
    public.complaints_id_seq,
    public.courses_id_seq,
    public.semesters_id_seq,
    public.students_id_seq,
    public.violation_photos_id_seq,
    public.violation_status_history_id_seq,
    public.violations_id_seq
FROM PUBLIC, anon, authenticated;

-- Remove anonymous entry points while preserving existing authenticated and
-- service execution rights. Abort if an unexpected inherited grant remains.
DO $check_effective_rights$
DECLARE
    signature text;
    service_had_execute boolean;
    sequence_name text;
    inaccessible_dependency text;
BEGIN
    FOREACH signature IN ARRAY ARRAY[
        'public.get_my_role()',
        'public.update_my_profile(text)',
        'public.create_complaint(text, text, timestamptz, text, text, text, text, text, text, text, text, text, date, text, text, bigint)',
        'public.create_complaint_v2(text, text, timestamptz, text, text, text, text, text, text, text, text, text, date, text, text, bigint, bigint, text)',
        'public.get_complaint_report_sources_with_passkey(text)',
        'public.get_complaint_report_sources_with_passkey_v2(text)',
        'public.get_complaint_status_history_with_passkey(text, bigint)',
        'public.get_complaints_with_passkey(text)',
        'public.get_interview_complaint_summaries()',
        'public.update_complaint_status_with_passkey(text, bigint, text)',
        'public.update_complaint_status_with_passkey(text, bigint, text, text)',
        'public.verify_complaint_passkey(text)'
    ]
    LOOP
        service_had_execute := pg_catalog.has_function_privilege('service_role', signature, 'EXECUTE');
        -- Signatures above are fixed migration literals.
        EXECUTE pg_catalog.format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', signature);
        IF pg_catalog.has_function_privilege('anon', signature, 'EXECUTE')
           OR NOT pg_catalog.has_function_privilege('authenticated', signature, 'EXECUTE')
        THEN
            RAISE EXCEPTION 'Unexpected effective RPC privileges for %', signature;
        END IF;
        IF pg_catalog.has_function_privilege('service_role', signature, 'EXECUTE')
           IS DISTINCT FROM service_had_execute
        THEN
            RAISE EXCEPTION 'Review the inherited service EXECUTE privilege for %', signature;
        END IF;
    END LOOP;

    -- SECURITY DEFINER calls execute with the caller function's owner rights.
    WITH dependencies(caller_signature, callee_signature) AS (
        VALUES
            ('public.create_complaint(text, text, timestamptz, text, text, text, text, text, text, text, text, text, date, text, text, bigint)', 'public.get_my_role()'),
            ('public.create_complaint_v2(text, text, timestamptz, text, text, text, text, text, text, text, text, text, date, text, text, bigint, bigint, text)', 'public.get_my_role()'),
            ('public.get_complaint_report_sources_with_passkey(text)', 'public.get_my_role()'),
            ('public.get_complaint_report_sources_with_passkey_v2(text)', 'public.get_my_role()'),
            ('public.get_complaint_status_history_with_passkey(text, bigint)', 'public.get_my_role()'),
            ('public.get_complaints_with_passkey(text)', 'public.get_my_role()'),
            ('public.get_interview_complaint_summaries()', 'public.get_my_role()'),
            ('public.update_complaint_status_with_passkey(text, bigint, text, text)', 'public.get_my_role()'),
            ('public.verify_complaint_passkey(text)', 'public.get_my_role()'),
            ('public.update_my_profile(text)', 'public.get_my_role()'),
            ('public.get_complaint_report_sources_with_passkey(text)', 'public.verify_complaint_passkey(text)'),
            ('public.get_complaint_report_sources_with_passkey_v2(text)', 'public.verify_complaint_passkey(text)'),
            ('public.get_complaint_status_history_with_passkey(text, bigint)', 'public.verify_complaint_passkey(text)'),
            ('public.get_complaints_with_passkey(text)', 'public.verify_complaint_passkey(text)'),
            ('public.update_complaint_status_with_passkey(text, bigint, text, text)', 'public.verify_complaint_passkey(text)'),
            ('public.update_complaint_status_with_passkey(text, bigint, text)', 'public.update_complaint_status_with_passkey(text, bigint, text, text)'),
            ('public.get_my_role()', 'auth.uid()'),
            ('public.get_my_role()', 'auth.jwt()'),
            ('public.verify_complaint_passkey(text)', 'extensions.crypt(text, text)')
    )
    SELECT pg_catalog.format('%s -> %s', d.caller_signature, d.callee_signature)
      INTO inaccessible_dependency
    FROM dependencies AS d
    LEFT JOIN pg_catalog.pg_proc AS caller ON caller.oid = pg_catalog.to_regprocedure(d.caller_signature)
    LEFT JOIN pg_catalog.pg_proc AS callee ON callee.oid = pg_catalog.to_regprocedure(d.callee_signature)
    WHERE caller.oid IS NULL OR callee.oid IS NULL
       OR NOT caller.prosecdef
       OR NOT pg_catalog.has_schema_privilege(caller.proowner, callee.pronamespace, 'USAGE')
       OR NOT pg_catalog.has_function_privilege(caller.proowner, callee.oid, 'EXECUTE')
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Review function owner privileges for %', inaccessible_dependency;
    END IF;

    FOREACH sequence_name IN ARRAY ARRAY[
        'public.call_slip_history_id_seq',
        'public.call_slips_id_seq',
        'public.colleges_id_seq',
        'public.complaint_access_settings_id_seq',
        'public.complaint_status_history_id_seq',
        'public.complaints_id_seq',
        'public.courses_id_seq',
        'public.semesters_id_seq',
        'public.students_id_seq',
        'public.violation_photos_id_seq',
        'public.violation_status_history_id_seq',
        'public.violations_id_seq'
    ]
    LOOP
        IF pg_catalog.has_sequence_privilege('anon', sequence_name, 'SELECT, USAGE, UPDATE')
           OR pg_catalog.has_sequence_privilege('authenticated', sequence_name, 'SELECT, USAGE, UPDATE')
        THEN
            RAISE EXCEPTION 'Unexpected effective browser privileges on %', sequence_name;
        END IF;
    END LOOP;
END;
$check_effective_rights$;

-- The documented private violation-photos policies already call get_my_role().
-- Check their live definitions and competing policies before using this migration.
COMMIT;
