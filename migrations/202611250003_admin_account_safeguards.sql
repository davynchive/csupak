-- Step 7.3.3. Requires Steps 7.3.1 and 7.3.2. Runtime validation is deferred.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $check_prerequisites$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc AS f
        WHERE f.oid = pg_catalog.to_regprocedure('public.get_my_role()')
          AND f.prosecdef AND f.provolatile = 's'
          AND f.proconfig @> ARRAY['row_security=off']
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy AS p
        JOIN pg_catalog.pg_roles AS r ON r.oid = ANY(p.polroles)
        WHERE p.polrelid = 'public.profiles'::regclass
          AND p.polname = 'active_account_required'
          AND NOT p.polpermissive AND p.polcmd = '*'
          AND r.rolname = 'authenticated'
    ) THEN
        RAISE EXCEPTION 'Apply Step 7.3.2 account eligibility enforcement first';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles AS r
        WHERE r.rolname IN ('anon', 'authenticated')
          AND (
              r.rolsuper OR r.rolbypassrls
              OR pg_catalog.has_any_column_privilege(r.oid, 'public.profiles', 'INSERT, UPDATE')
              OR pg_catalog.has_table_privilege(r.oid, 'public.profiles', 'DELETE, TRUNCATE')
          )
    ) THEN
        RAISE EXCEPTION 'Browser roles must not have direct profile write access or bypass RLS';
    END IF;

    -- Deploy as the trusted database owner or an already-authorized equivalent.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS p
        JOIN pg_catalog.pg_roles AS r ON r.rolname = CURRENT_USER
        WHERE p.oid = 'public.profiles'::regclass AND p.relrowsecurity
          AND (r.rolsuper OR r.rolbypassrls OR (p.relowner = r.oid AND NOT p.relforcerowsecurity))
          AND pg_catalog.has_column_privilege(r.oid, p.oid, 'id', 'SELECT')
          AND pg_catalog.has_column_privilege(r.oid, p.oid, 'role', 'SELECT')
          AND pg_catalog.has_column_privilege(r.oid, p.oid, 'is_active', 'SELECT')
          AND pg_catalog.has_column_privilege(r.oid, p.oid, 'session_valid_after', 'SELECT')
          AND pg_catalog.has_column_privilege(r.oid, p.oid, 'role', 'UPDATE')
          AND pg_catalog.has_column_privilege(r.oid, p.oid, 'is_active', 'UPDATE')
          AND pg_catalog.has_column_privilege(r.oid, p.oid, 'session_valid_after', 'UPDATE')
          AND pg_catalog.has_schema_privilege(r.oid, 'auth', 'USAGE')
          AND pg_catalog.has_function_privilege(r.oid, 'auth.uid()', 'EXECUTE')
          AND pg_catalog.has_function_privilege(r.oid, 'public.get_my_role()', 'EXECUTE')
    ) THEN
        RAISE EXCEPTION 'Review the administrative function owner privileges before deployment';
    END IF;
END;
$check_prerequisites$;

CREATE SCHEMA csupak_private;
REVOKE ALL ON SCHEMA csupak_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE csupak_private.admin_account_audit (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    operation_id uuid NOT NULL UNIQUE,
    actor_id uuid NOT NULL,
    target_id uuid NOT NULL,
    action text NOT NULL CHECK (action IN ('change_role', 'set_status')),
    occurred_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    previous_role text NOT NULL CHECK (previous_role IN ('oswe_admin', 'oswe_staff', 'security_office')),
    resulting_role text NOT NULL CHECK (resulting_role IN ('oswe_admin', 'oswe_staff', 'security_office')),
    previous_is_active boolean NOT NULL,
    resulting_is_active boolean NOT NULL,
    previous_session_valid_after timestamptz,
    resulting_session_valid_after timestamptz,
    outcome text NOT NULL CHECK (outcome IN ('applied', 'no_change')),
    CONSTRAINT admin_account_audit_action_values CHECK (
        (action = 'change_role' AND previous_is_active = resulting_is_active)
        OR (action = 'set_status' AND previous_role = resulting_role)
    ),
    CONSTRAINT admin_account_audit_outcome_values CHECK (
        (outcome = 'applied'
            AND (previous_role <> resulting_role OR previous_is_active <> resulting_is_active)
            AND resulting_session_valid_after IS NOT NULL
            AND (previous_session_valid_after IS NULL
                OR resulting_session_valid_after >= previous_session_valid_after))
        OR (outcome = 'no_change'
            AND previous_role = resulting_role AND previous_is_active = resulting_is_active
            AND previous_session_valid_after IS NOT DISTINCT FROM resulting_session_valid_after)
    )
);

-- No account FKs: actor and target UUIDs are retained even if an account is removed.
-- Only the administrative function owner writes entries. No browser/service read
-- path or automated retention is defined. Retention needs a separately approved
-- policy and privileged maintenance procedure.
ALTER TABLE csupak_private.admin_account_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE csupak_private.admin_account_audit FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION csupak_private.reject_admin_account_audit_mutation() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER
    SET search_path = pg_catalog, pg_temp
AS $reject_audit_mutation$
BEGIN
    RAISE EXCEPTION 'Administrative audit records are append-only' USING ERRCODE = '55000';
END;
$reject_audit_mutation$;

REVOKE ALL ON FUNCTION csupak_private.reject_admin_account_audit_mutation()
    FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER admin_account_audit_append_only
    BEFORE UPDATE OR DELETE OR TRUNCATE ON csupak_private.admin_account_audit
    FOR EACH STATEMENT EXECUTE FUNCTION csupak_private.reject_admin_account_audit_mutation();

CREATE FUNCTION public.admin_change_account_access(
    p_operation_id uuid,
    p_target_id uuid,
    p_action text,
    p_role text DEFAULT NULL,
    p_is_active boolean DEFAULT NULL
) RETURNS text
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
    SET row_security = off
    SET lock_timeout = '5s'
AS $admin_change_account_access$
DECLARE
    actor_id uuid := auth.uid();
    prior_receipt record;
    previous_role text;
    previous_is_active boolean;
    previous_cutoff timestamptz;
    resulting_role text;
    resulting_is_active boolean;
    resulting_cutoff timestamptz;
    result text;
BEGIN
    IF actor_id IS NULL OR public.get_my_role() IS DISTINCT FROM 'oswe_admin' THEN
        RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
    END IF;

    IF p_operation_id IS NULL OR p_operation_id = '00000000-0000-0000-0000-000000000000'::uuid
       OR p_target_id IS NULL OR p_target_id = '00000000-0000-0000-0000-000000000000'::uuid
    THEN
        RAISE EXCEPTION 'Operation and target UUIDs are required' USING ERRCODE = '22023';
    END IF;

    IF p_action = 'change_role' THEN
        IF p_role IS NULL OR p_role NOT IN ('oswe_admin', 'oswe_staff', 'security_office')
           OR p_is_active IS NOT NULL
        THEN
            RAISE EXCEPTION 'Role changes require exactly one supported role' USING ERRCODE = '22023';
        END IF;
    ELSIF p_action = 'set_status' THEN
        IF p_is_active IS NULL OR p_role IS NOT NULL THEN
            RAISE EXCEPTION 'Status changes require exactly one active status' USING ERRCODE = '22023';
        END IF;
    ELSE
        RAISE EXCEPTION 'Unsupported administrative action' USING ERRCODE = '22023';
    END IF;

    -- A fresh statement snapshot after waiting is required for the recheck.
    IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'Account changes require READ COMMITTED isolation' USING ERRCODE = '0A000';
    END IF;

    -- All paths that change roles, status, or the active admin set must acquire
    -- this transaction lock before taking any profile row locks.
    PERFORM pg_catalog.pg_advisory_xact_lock(7310, 733);

    IF public.get_my_role() IS DISTINCT FROM 'oswe_admin' THEN
        RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
    END IF;

    SELECT a.actor_id, a.target_id, a.action, a.resulting_role, a.resulting_is_active, a.outcome
      INTO prior_receipt
    FROM csupak_private.admin_account_audit AS a
    WHERE a.operation_id = p_operation_id;

    IF FOUND THEN
        IF prior_receipt.actor_id IS DISTINCT FROM actor_id
           OR prior_receipt.target_id IS DISTINCT FROM p_target_id
           OR prior_receipt.action IS DISTINCT FROM p_action
           OR (p_action = 'change_role' AND prior_receipt.resulting_role IS DISTINCT FROM p_role)
           OR (p_action = 'set_status' AND prior_receipt.resulting_is_active IS DISTINCT FROM p_is_active)
        THEN
            RAISE EXCEPTION 'Operation UUID has already been used for a different request' USING ERRCODE = '22023';
        END IF;
        RETURN prior_receipt.outcome;
    END IF;

    SELECT p.role, p.is_active, p.session_valid_after
      INTO previous_role, previous_is_active, previous_cutoff
    FROM public.profiles AS p
    WHERE p.id = p_target_id
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target profile not found' USING ERRCODE = '22023';
    END IF;

    resulting_role := COALESCE(p_role, previous_role);
    resulting_is_active := COALESCE(p_is_active, previous_is_active);
    resulting_cutoff := previous_cutoff;

    IF p_target_id = actor_id AND (NOT resulting_is_active OR resulting_role <> 'oswe_admin') THEN
        RAISE EXCEPTION 'Administrators cannot deactivate or demote themselves' USING ERRCODE = '42501';
    END IF;

    -- Authority to grant OSWE Administrator is awaiting a policy decision.
    IF resulting_role = 'oswe_admin' AND previous_role <> 'oswe_admin' THEN
        RAISE EXCEPTION 'Granting OSWE Administrator has not been approved' USING ERRCODE = '42501';
    END IF;

    IF resulting_role = previous_role AND resulting_is_active = previous_is_active THEN
        result := 'no_change';
    ELSE
        -- Advance the cutoff on every real role or status change, including
        -- reactivation. Keep any existing cutoff that is already later.
        UPDATE public.profiles AS p
        SET role = resulting_role,
            is_active = resulting_is_active,
            session_valid_after = GREATEST(previous_cutoff, pg_catalog.clock_timestamp())
        WHERE p.id = p_target_id
        RETURNING p.role, p.is_active, p.session_valid_after
             INTO resulting_role, resulting_is_active, resulting_cutoff;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Target profile could not be updated' USING ERRCODE = '55000';
        END IF;

        -- This check concerns active profile rows. It cannot establish that
        -- the remaining account can authenticate in the managed Auth service.
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles AS p WHERE p.role = 'oswe_admin' AND p.is_active
        ) THEN
            RAISE EXCEPTION 'At least one active OSWE Administrator is required' USING ERRCODE = '23514';
        END IF;

        result := 'applied';
    END IF;

    -- One receipt per database operation. Errors roll back both the mutation
    -- and its receipt. Future external Auth work needs its own durable state.
    INSERT INTO csupak_private.admin_account_audit (
        operation_id, actor_id, target_id, action,
        previous_role, resulting_role, previous_is_active, resulting_is_active,
        previous_session_valid_after, resulting_session_valid_after, outcome
    ) VALUES (
        p_operation_id, actor_id, p_target_id, p_action,
        previous_role, resulting_role, previous_is_active, resulting_is_active,
        previous_cutoff, resulting_cutoff, result
    );

    RETURN result;
END;
$admin_change_account_access$;

REVOKE ALL ON FUNCTION public.admin_change_account_access(uuid, uuid, text, text, boolean)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_change_account_access(uuid, uuid, text, text, boolean)
    TO authenticated;

DO $check_access$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles AS r
        WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
          AND (
              pg_catalog.has_schema_privilege(r.oid, 'csupak_private', 'USAGE, CREATE')
              OR pg_catalog.has_any_column_privilege(
                  r.oid, 'csupak_private.admin_account_audit', 'SELECT, INSERT, UPDATE, REFERENCES'
              )
              OR pg_catalog.has_table_privilege(
                  r.oid, 'csupak_private.admin_account_audit', 'DELETE, TRUNCATE, TRIGGER, MAINTAIN'
              )
              OR pg_catalog.has_function_privilege(
                  r.oid, 'csupak_private.reject_admin_account_audit_mutation()', 'EXECUTE'
              )
          )
    ) OR pg_catalog.has_function_privilege(
        'anon', 'public.admin_change_account_access(uuid, uuid, text, text, boolean)', 'EXECUTE'
    ) OR pg_catalog.has_function_privilege(
        'service_role', 'public.admin_change_account_access(uuid, uuid, text, text, boolean)', 'EXECUTE'
    ) OR NOT pg_catalog.has_function_privilege(
        'authenticated', 'public.admin_change_account_access(uuid, uuid, text, text, boolean)', 'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Unexpected direct audit or administrative function privileges';
    END IF;
END;
$check_access$;

COMMIT;
