BEGIN;
SET LOCAL lock_timeout = '5s';

DO $check_owner$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS f
        JOIN pg_catalog.pg_class AS a
          ON a.oid = pg_catalog.to_regclass('csupak_private.admin_account_audit')
        WHERE f.oid = pg_catalog.to_regprocedure(
            'public.admin_change_account_access(uuid,uuid,text,text,boolean)'
        )
          AND pg_catalog.pg_get_userbyid(f.proowner) = CURRENT_USER
          AND a.relowner = f.proowner
    ) THEN
        RAISE EXCEPTION 'Apply as the existing administrative RPC and audit owner';
    END IF;
    IF pg_catalog.row_security_active('public.profiles'::regclass)
       OR NOT pg_catalog.has_column_privilege(CURRENT_USER, 'public.profiles', 'id', 'SELECT')
       OR NOT pg_catalog.has_column_privilege(CURRENT_USER, 'public.profiles', 'full_name', 'SELECT')
       OR NOT pg_catalog.has_column_privilege(CURRENT_USER, 'public.profiles', 'full_name', 'UPDATE')
       OR NOT pg_catalog.has_schema_privilege(CURRENT_USER, 'auth', 'USAGE')
       OR NOT pg_catalog.has_function_privilege(CURRENT_USER, 'auth.uid()', 'EXECUTE')
       OR NOT pg_catalog.has_function_privilege(CURRENT_USER, 'public.get_my_role()', 'EXECUTE')
    THEN
        RAISE EXCEPTION 'Review the administrator name update function owner privileges';
    END IF;
END;
$check_owner$;

-- Keep name history private without weakening the role/status receipt checks.
CREATE TABLE csupak_private.admin_user_name_audit (
    operation_id uuid PRIMARY KEY,
    actor_id uuid NOT NULL,
    target_id uuid NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    previous_full_name text NOT NULL,
    resulting_full_name text NOT NULL CHECK (
        resulting_full_name = pg_catalog.btrim(resulting_full_name)
        AND pg_catalog.char_length(resulting_full_name) BETWEEN 2 AND 100
    ),
    outcome text NOT NULL,
    CONSTRAINT admin_user_name_audit_outcome_check CHECK (
        (outcome = 'applied' AND previous_full_name <> resulting_full_name)
        OR (outcome = 'no_change' AND previous_full_name = resulting_full_name)
    )
);

ALTER TABLE csupak_private.admin_user_name_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE csupak_private.admin_user_name_audit FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER admin_user_name_audit_append_only
    BEFORE UPDATE OR DELETE OR TRUNCATE ON csupak_private.admin_user_name_audit
    FOR EACH STATEMENT EXECUTE FUNCTION csupak_private.reject_admin_account_audit_mutation();

-- Both RPCs hold the same transaction lock before writing audit receipts.
-- The legacy RPC reaches this guard before committing any role/status change.
CREATE FUNCTION csupak_private.reject_name_receipt_id_reuse() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $reject_reuse$
BEGIN
    IF EXISTS (
        SELECT 1 FROM csupak_private.admin_user_name_audit AS a
        WHERE a.operation_id = NEW.operation_id
    ) THEN
        RAISE EXCEPTION 'Operation UUID has already been used for a different request' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$reject_reuse$;

REVOKE ALL ON FUNCTION csupak_private.reject_name_receipt_id_reuse()
    FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER admin_account_audit_reject_name_receipt_id
    BEFORE INSERT ON csupak_private.admin_account_audit
    FOR EACH ROW EXECUTE FUNCTION csupak_private.reject_name_receipt_id_reuse();

CREATE FUNCTION public.admin_update_user_name(
    p_operation_id uuid,
    p_target_id uuid,
    p_full_name text
) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
SET lock_timeout = '5s'
AS $admin_update_user_name$
DECLARE
    actor uuid := auth.uid();
    normalized_name text;
    previous_name text;
    receipt record;
    result text;
BEGIN
    IF actor IS NULL OR public.get_my_role() IS DISTINCT FROM 'oswe_admin' THEN
        RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
    END IF;
    IF p_operation_id IS NULL OR p_operation_id = '00000000-0000-0000-0000-000000000000'::uuid
       OR p_target_id IS NULL OR p_target_id = '00000000-0000-0000-0000-000000000000'::uuid
    THEN
        RAISE EXCEPTION 'Operation and target UUIDs are required' USING ERRCODE = '22023';
    END IF;
    normalized_name := pg_catalog.btrim(p_full_name);
    IF normalized_name IS NULL OR pg_catalog.char_length(normalized_name) NOT BETWEEN 2 AND 100 THEN
        RAISE EXCEPTION 'Full name must contain 2 to 100 characters' USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'Account changes require READ COMMITTED isolation' USING ERRCODE = '0A000';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(7310, 733);

    IF public.get_my_role() IS DISTINCT FROM 'oswe_admin' THEN
        RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
    END IF;

    SELECT a.actor_id, a.target_id, a.resulting_full_name, a.outcome
      INTO receipt
    FROM csupak_private.admin_user_name_audit AS a
    WHERE a.operation_id = p_operation_id;
    IF FOUND THEN
        IF receipt.actor_id IS DISTINCT FROM actor
           OR receipt.target_id IS DISTINCT FROM p_target_id
           OR receipt.resulting_full_name IS DISTINCT FROM normalized_name
        THEN
            RAISE EXCEPTION 'Operation UUID has already been used for a different request' USING ERRCODE = '22023';
        END IF;
        RETURN receipt.outcome;
    END IF;
    IF EXISTS (
        SELECT 1 FROM csupak_private.admin_account_audit AS a
        WHERE a.operation_id = p_operation_id
    ) THEN
        RAISE EXCEPTION 'Operation UUID has already been used for a different request' USING ERRCODE = '22023';
    END IF;

    SELECT p.full_name INTO previous_name
    FROM public.profiles AS p
    WHERE p.id = p_target_id
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target profile not found' USING ERRCODE = '22023';
    END IF;

    IF previous_name = normalized_name THEN
        result := 'no_change';
    ELSE
        UPDATE public.profiles AS p
        SET full_name = normalized_name
        WHERE p.id = p_target_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Target profile could not be updated' USING ERRCODE = '55000';
        END IF;
        result := 'applied';
    END IF;

    INSERT INTO csupak_private.admin_user_name_audit (
        operation_id, actor_id, target_id, previous_full_name, resulting_full_name, outcome
    ) VALUES (p_operation_id, actor, p_target_id, previous_name, normalized_name, result);

    RETURN result;
END;
$admin_update_user_name$;

REVOKE ALL ON FUNCTION public.admin_update_user_name(uuid, uuid, text)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_user_name(uuid, uuid, text)
    TO authenticated;

DO $check_grants$
DECLARE
    name_rpc regprocedure := 'public.admin_update_user_name(uuid,uuid,text)'::regprocedure;
BEGIN
    IF pg_catalog.has_function_privilege('anon', name_rpc, 'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role', name_rpc, 'EXECUTE')
       OR NOT pg_catalog.has_function_privilege('authenticated', name_rpc, 'EXECUTE')
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_proc AS f
           CROSS JOIN LATERAL pg_catalog.aclexplode(f.proacl) AS acl
           WHERE f.oid = name_rpc
             AND acl.privilege_type = 'EXECUTE'
             AND acl.grantee NOT IN (f.proowner, 'authenticated'::regrole)
       )
       OR EXISTS (
           SELECT 1 FROM pg_catalog.pg_roles AS r
           WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
             AND (
                 pg_catalog.has_any_column_privilege(
                     r.oid, 'csupak_private.admin_user_name_audit', 'SELECT, INSERT, UPDATE, REFERENCES')
                 OR pg_catalog.has_table_privilege(
                     r.oid, 'csupak_private.admin_user_name_audit', 'DELETE, TRUNCATE, TRIGGER, MAINTAIN')
                 OR pg_catalog.has_function_privilege(
                     r.oid, 'csupak_private.reject_name_receipt_id_reuse()', 'EXECUTE')
             )
       )
    THEN
        RAISE EXCEPTION 'Unexpected administrator name update or audit privileges';
    END IF;
END;
$check_grants$;

COMMIT;
