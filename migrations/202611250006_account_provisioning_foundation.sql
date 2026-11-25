-- Database foundation only. External Auth transitions are implemented later.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $check_owner$
BEGIN
    IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS f
        WHERE f.oid IN (
            pg_catalog.to_regprocedure('public.admin_change_account_access(uuid,uuid,text,text,boolean)'),
            pg_catalog.to_regprocedure('public.admin_update_user_name(uuid,uuid,text)')
        ) AND pg_catalog.pg_get_userbyid(f.proowner) = CURRENT_USER) <> 2
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class AS c
           WHERE c.oid IN (
               pg_catalog.to_regclass('csupak_private.admin_account_audit'),
               pg_catalog.to_regclass('csupak_private.admin_user_name_audit')
           ) AND pg_catalog.pg_get_userbyid(c.relowner) = CURRENT_USER) <> 2
    THEN
        RAISE EXCEPTION 'Apply as the existing administrative RPC and audit owner';
    END IF;
END;
$check_owner$;

CREATE TABLE csupak_private.account_provisioning (
    operation_id uuid PRIMARY KEY CHECK (operation_id <> '00000000-0000-0000-0000-000000000000'::uuid),
    actor_id uuid NOT NULL,
    target_user_id uuid NOT NULL UNIQUE DEFAULT pg_catalog.gen_random_uuid(),
    email text NOT NULL UNIQUE CHECK (
        pg_catalog.char_length(email) <= 254
        AND email = pg_catalog.lower(email)
        AND email ~ '^[^[:space:][:cntrl:]@]+@[^[:space:][:cntrl:]@]+[.][^[:space:][:cntrl:]@]+$'
    ),
    full_name text NOT NULL CHECK (
        full_name = pg_catalog.btrim(full_name) AND pg_catalog.char_length(full_name) BETWEEN 2 AND 100
    ),
    requested_role text NOT NULL CHECK (requested_role IN ('oswe_staff', 'security_office')),
    provisioning_state text NOT NULL DEFAULT 'reserved'
        CHECK (provisioning_state IN ('reserved', 'auth_outcome_unknown', 'profile_ready')),
    email_state text NOT NULL DEFAULT 'not_requested'
        CHECK (email_state IN ('not_requested', 'outcome_unknown', 'requested')),
    created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    onboarding_completed_at timestamptz,
    CHECK (updated_at >= created_at),
    CHECK (provisioning_state = 'profile_ready' OR email_state = 'not_requested'),
    CHECK (onboarding_completed_at IS NULL OR (
        provisioning_state = 'profile_ready' AND onboarding_completed_at BETWEEN created_at AND updated_at
    ))
);

ALTER TABLE csupak_private.account_provisioning ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE csupak_private.account_provisioning FROM PUBLIC, anon, authenticated, service_role;

-- Existing mutation RPCs already hold the shared advisory lock at audit insertion.
CREATE FUNCTION csupak_private.reject_provisioning_receipt_id_reuse() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $reject_reuse$
BEGIN
    IF EXISTS (
        SELECT 1 FROM csupak_private.account_provisioning AS p WHERE p.operation_id = NEW.operation_id
    ) THEN
        RAISE EXCEPTION 'Operation UUID has already been used for a different request' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$reject_reuse$;

REVOKE ALL ON FUNCTION csupak_private.reject_provisioning_receipt_id_reuse()
    FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER admin_account_audit_reject_provisioning_id
    BEFORE INSERT ON csupak_private.admin_account_audit
    FOR EACH ROW EXECUTE FUNCTION csupak_private.reject_provisioning_receipt_id_reuse();

CREATE TRIGGER admin_user_name_audit_reject_provisioning_id
    BEFORE INSERT ON csupak_private.admin_user_name_audit
    FOR EACH ROW EXECUTE FUNCTION csupak_private.reject_provisioning_receipt_id_reuse();

CREATE FUNCTION csupak_private.enforce_provisioned_profile_onboarding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
AS $enforce_onboarding$
DECLARE
    reservation record;
BEGIN
    SELECT p.requested_role, p.onboarding_completed_at INTO reservation
    FROM csupak_private.account_provisioning AS p WHERE p.target_user_id = NEW.id;
    IF NOT FOUND THEN RETURN NEW; END IF;

    IF NEW.role NOT IN ('oswe_staff', 'security_office')
       OR (TG_OP = 'INSERT' AND NEW.role IS DISTINCT FROM reservation.requested_role)
    THEN
        RAISE EXCEPTION 'Invalid role for a provisioned account' USING ERRCODE = '23514';
    END IF;

    IF NEW.is_active AND (TG_OP = 'INSERT' OR reservation.onboarding_completed_at IS NULL) THEN
        RAISE EXCEPTION 'Complete account onboarding before activation' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$enforce_onboarding$;

REVOKE ALL ON FUNCTION csupak_private.enforce_provisioned_profile_onboarding()
    FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER profiles_require_provisioned_account_onboarding
    BEFORE INSERT OR UPDATE OF is_active, role ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION csupak_private.enforce_provisioned_profile_onboarding();

CREATE FUNCTION public.admin_reserve_account_provisioning(
    p_operation_id uuid,
    p_email text,
    p_full_name text,
    p_role text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
SET lock_timeout = '5s'
AS $reserve_provisioning$
DECLARE
    actor uuid := auth.uid();
    normalized_email text;
    normalized_name text;
    reservation csupak_private.account_provisioning%ROWTYPE;
BEGIN
    IF actor IS NULL OR public.get_my_role() IS DISTINCT FROM 'oswe_admin' THEN
        RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
    END IF;

    normalized_email := pg_catalog.lower(pg_catalog.btrim(p_email));
    normalized_name := pg_catalog.btrim(p_full_name);
    IF p_operation_id IS NULL OR p_operation_id = '00000000-0000-0000-0000-000000000000'::uuid
       OR normalized_email IS NULL OR pg_catalog.char_length(normalized_email) > 254
       OR normalized_email !~ '^[^[:space:][:cntrl:]@]+@[^[:space:][:cntrl:]@]+[.][^[:space:][:cntrl:]@]+$'
       OR normalized_name IS NULL OR pg_catalog.char_length(normalized_name) NOT BETWEEN 2 AND 100
       OR p_role IS NULL OR p_role NOT IN ('oswe_staff', 'security_office')
    THEN
        RAISE EXCEPTION 'Invalid account provisioning parameters' USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'Account changes require READ COMMITTED isolation' USING ERRCODE = '0A000';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(7310, 733);
    IF public.get_my_role() IS DISTINCT FROM 'oswe_admin' THEN
        RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
    END IF;

    SELECT p.* INTO reservation
    FROM csupak_private.account_provisioning AS p WHERE p.operation_id = p_operation_id;
    IF FOUND THEN
        IF reservation.actor_id IS DISTINCT FROM actor OR reservation.email IS DISTINCT FROM normalized_email
           OR reservation.full_name IS DISTINCT FROM normalized_name OR reservation.requested_role IS DISTINCT FROM p_role
        THEN
            RAISE EXCEPTION 'Operation UUID has already been used for a different request' USING ERRCODE = '22023';
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM csupak_private.admin_account_audit AS a WHERE a.operation_id = p_operation_id)
           OR EXISTS (SELECT 1 FROM csupak_private.admin_user_name_audit AS a WHERE a.operation_id = p_operation_id)
        THEN
            RAISE EXCEPTION 'Operation UUID has already been used for a different request' USING ERRCODE = '22023';
        END IF;

        INSERT INTO csupak_private.account_provisioning (operation_id, actor_id, email, full_name, requested_role)
        VALUES (p_operation_id, actor, normalized_email, normalized_name, p_role)
        ON CONFLICT (email) DO NOTHING
        RETURNING * INTO reservation;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Email already has a provisioning reservation' USING ERRCODE = '22023';
        END IF;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'operationId', reservation.operation_id, 'targetUserId', reservation.target_user_id,
        'provisioningState', reservation.provisioning_state, 'emailState', reservation.email_state
    );
END;
$reserve_provisioning$;

REVOKE ALL ON FUNCTION public.admin_reserve_account_provisioning(uuid, text, text, text)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reserve_account_provisioning(uuid, text, text, text)
    TO authenticated;

DO $check_grants$
DECLARE
    reservation_rpc regprocedure := 'public.admin_reserve_account_provisioning(uuid,text,text,text)'::regprocedure;
BEGIN
    IF pg_catalog.has_function_privilege('anon', reservation_rpc, 'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role', reservation_rpc, 'EXECUTE')
       OR NOT pg_catalog.has_function_privilege('authenticated', reservation_rpc, 'EXECUTE')
       OR EXISTS (
           SELECT 1 FROM pg_catalog.pg_proc AS f
           CROSS JOIN LATERAL pg_catalog.aclexplode(f.proacl) AS acl
           WHERE f.oid = reservation_rpc AND acl.privilege_type = 'EXECUTE'
             AND acl.grantee NOT IN (f.proowner, 'authenticated'::regrole)
       )
       OR EXISTS (
           SELECT 1 FROM pg_catalog.pg_roles AS r
           WHERE r.rolname IN ('anon', 'authenticated', 'service_role') AND (
               pg_catalog.has_schema_privilege(r.oid, 'csupak_private', 'USAGE, CREATE')
               OR pg_catalog.has_any_column_privilege(
                   r.oid, 'csupak_private.account_provisioning', 'SELECT, INSERT, UPDATE, REFERENCES')
               OR pg_catalog.has_table_privilege(
                   r.oid, 'csupak_private.account_provisioning', 'DELETE, TRUNCATE, TRIGGER, MAINTAIN')
               OR pg_catalog.has_function_privilege(
                   r.oid, 'csupak_private.reject_provisioning_receipt_id_reuse()', 'EXECUTE')
               OR pg_catalog.has_function_privilege(
                   r.oid, 'csupak_private.enforce_provisioned_profile_onboarding()', 'EXECUTE')
           )
       )
    THEN
        RAISE EXCEPTION 'Unexpected account provisioning grants';
    END IF;
END;
$check_grants$;

COMMIT;
