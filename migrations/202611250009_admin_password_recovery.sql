BEGIN;
SET LOCAL lock_timeout = '5s';

DO $owner$
BEGIN
    IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
        WHERE oid = pg_catalog.to_regprocedure('public.complete_account_onboarding()')) IS DISTINCT FROM current_user
    THEN
        RAISE EXCEPTION 'Run this migration as the provisioning completion function owner';
    END IF;
END;
$owner$;

CREATE TABLE csupak_private.admin_password_recovery (
    operation_id uuid PRIMARY KEY CHECK (operation_id <> '00000000-0000-0000-0000-000000000000'::uuid),
    actor_id uuid NOT NULL,
    target_id uuid NOT NULL,
    requested_at timestamptz NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('requested', 'not_requested', 'outcome_unknown')),
    recorded_at timestamptz,
    CHECK (recorded_at IS NOT NULL OR outcome = 'outcome_unknown'),
    CHECK (recorded_at >= requested_at)
);

CREATE INDEX admin_password_recovery_target_time ON csupak_private.admin_password_recovery (target_id, requested_at DESC);
ALTER TABLE csupak_private.admin_password_recovery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE csupak_private.admin_password_recovery FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER admin_password_recovery_preserve_history
BEFORE DELETE OR TRUNCATE ON csupak_private.admin_password_recovery
FOR EACH STATEMENT EXECUTE FUNCTION csupak_private.reject_admin_account_audit_mutation();

CREATE FUNCTION csupak_private.reject_password_recovery_id_reuse() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $conflict$
BEGIN
    IF EXISTS (SELECT 1 FROM csupak_private.admin_password_recovery AS r WHERE r.operation_id = NEW.operation_id) THEN
        RAISE EXCEPTION 'Operation UUID has already been used for a different request' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$conflict$;

CREATE TRIGGER admin_account_audit_reject_recovery_id BEFORE INSERT ON csupak_private.admin_account_audit
FOR EACH ROW EXECUTE FUNCTION csupak_private.reject_password_recovery_id_reuse();
CREATE TRIGGER admin_user_name_audit_reject_recovery_id BEFORE INSERT ON csupak_private.admin_user_name_audit
FOR EACH ROW EXECUTE FUNCTION csupak_private.reject_password_recovery_id_reuse();
CREATE TRIGGER account_provisioning_reject_recovery_id BEFORE INSERT ON csupak_private.account_provisioning
FOR EACH ROW EXECUTE FUNCTION csupak_private.reject_password_recovery_id_reuse();

CREATE FUNCTION public.admin_claim_password_recovery(p_operation_id uuid, p_target_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
SET lock_timeout = '5s'
AS $claim$
DECLARE
    actor uuid := auth.uid();
    previous csupak_private.admin_password_recovery%ROWTYPE;
    email text;
    claimed_at timestamptz;
BEGIN
    IF actor IS NULL OR public.get_my_role() IS DISTINCT FROM 'oswe_admin' THEN
        RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
    END IF;
    IF p_operation_id IS NULL OR p_operation_id = '00000000-0000-0000-0000-000000000000'::uuid
       OR p_target_id IS NULL OR p_target_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
        RAISE EXCEPTION 'Invalid recovery operation or target' USING ERRCODE = '22023';
    END IF;

    PERFORM csupak_private.lock_provisioning_step();
    IF public.get_my_role() IS DISTINCT FROM 'oswe_admin' THEN
        RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
    END IF;
    SELECT r.* INTO previous FROM csupak_private.admin_password_recovery AS r WHERE r.operation_id = p_operation_id;
    IF FOUND THEN
        IF previous.actor_id IS DISTINCT FROM actor OR previous.target_id IS DISTINCT FROM p_target_id THEN
            RAISE EXCEPTION 'Operation UUID has already been used for a different request' USING ERRCODE = '22023';
        END IF;
        RETURN pg_catalog.jsonb_build_object('outcome', previous.outcome);
    END IF;
    IF EXISTS (SELECT 1 FROM csupak_private.admin_account_audit AS a WHERE a.operation_id = p_operation_id)
       OR EXISTS (SELECT 1 FROM csupak_private.admin_user_name_audit AS a WHERE a.operation_id = p_operation_id)
       OR EXISTS (SELECT 1 FROM csupak_private.account_provisioning AS a WHERE a.operation_id = p_operation_id) THEN
        RAISE EXCEPTION 'Operation UUID has already been used for a different request' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (SELECT 1 FROM csupak_private.account_provisioning AS a
               WHERE a.target_user_id = p_target_id AND a.onboarding_completed_at IS NULL) THEN
        RAISE EXCEPTION 'Use account setup for this user' USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.lower(pg_catalog.btrim(u.email)) INTO email
    FROM public.profiles AS p JOIN auth.users AS u ON u.id = p.id
    WHERE p.id = p_target_id AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
      AND u.is_anonymous IS FALSE AND u.is_sso_user IS FALSE AND u.role = 'authenticated';
    IF email IS NULL OR email = '' THEN
        RAISE EXCEPTION 'No eligible recovery account' USING ERRCODE = 'P0002';
    END IF;

    claimed_at := pg_catalog.clock_timestamp();
    IF EXISTS (SELECT 1 FROM csupak_private.admin_password_recovery AS r
               WHERE r.target_id = p_target_id AND r.requested_at > claimed_at - interval '60 seconds') THEN
        RETURN pg_catalog.jsonb_build_object('outcome', 'recovery_cooldown');
    END IF;
    INSERT INTO csupak_private.admin_password_recovery (operation_id, actor_id, target_id, requested_at, outcome)
    VALUES (p_operation_id, actor, p_target_id, claimed_at, 'outcome_unknown');
    RETURN pg_catalog.jsonb_build_object('outcome', 'claimed', 'email', email);
END;
$claim$;

CREATE FUNCTION public.record_admin_password_recovery(p_operation_id uuid, p_outcome text) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
SET lock_timeout = '5s'
AS $record$
DECLARE
    previous csupak_private.admin_password_recovery%ROWTYPE;
BEGIN
    IF p_outcome IS NULL OR p_outcome NOT IN ('requested', 'not_requested', 'outcome_unknown') THEN
        RAISE EXCEPTION 'Invalid recovery outcome' USING ERRCODE = '22023';
    END IF;
    SELECT r.* INTO previous FROM csupak_private.admin_password_recovery AS r
    WHERE r.operation_id = p_operation_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing recovery request' USING ERRCODE = 'P0002'; END IF;
    IF previous.recorded_at IS NOT NULL THEN
        IF previous.outcome IS DISTINCT FROM p_outcome THEN
            RAISE EXCEPTION 'Conflicting recovery outcome' USING ERRCODE = '22023';
        END IF;
        RETURN previous.outcome;
    END IF;
    UPDATE csupak_private.admin_password_recovery SET outcome = p_outcome,
        recorded_at = GREATEST(previous.requested_at, pg_catalog.clock_timestamp()) WHERE operation_id = p_operation_id;
    RETURN p_outcome;
END;
$record$;

REVOKE ALL ON FUNCTION public.admin_claim_password_recovery(uuid, uuid), public.record_admin_password_recovery(uuid, text),
    csupak_private.reject_password_recovery_id_reuse() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_claim_password_recovery(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_admin_password_recovery(uuid, text) TO service_role;

COMMIT;
