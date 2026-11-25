BEGIN;
SET LOCAL lock_timeout = '5s';

DO $check_owner$
DECLARE
    required record;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS c
        WHERE c.oid = 'csupak_private.account_provisioning'::regclass
          AND pg_catalog.pg_get_userbyid(c.relowner) = CURRENT_USER
          AND c.relrowsecurity AND NOT c.relforcerowsecurity
    ) OR pg_catalog.row_security_active('public.profiles'::regclass)
      OR pg_catalog.row_security_active('auth.users'::regclass)
      OR pg_catalog.row_security_active('auth.sessions'::regclass)
      OR NOT pg_catalog.has_schema_privilege(CURRENT_USER, 'auth', 'USAGE')
      OR NOT pg_catalog.has_function_privilege(CURRENT_USER, 'auth.uid()', 'EXECUTE')
      OR NOT pg_catalog.has_function_privilege(CURRENT_USER, 'auth.jwt()', 'EXECUTE')
      OR NOT pg_catalog.has_function_privilege(CURRENT_USER, 'public.get_my_role()', 'EXECUTE')
    THEN
        RAISE EXCEPTION 'Apply as the provisioning owner with the existing Auth read and profile access privileges';
    END IF;
    FOR required IN
        SELECT * FROM (VALUES
            ('auth.users', 'id', 'SELECT'), ('auth.users', 'email', 'SELECT'),
            ('auth.users', 'is_anonymous', 'SELECT'), ('auth.users', 'is_sso_user', 'SELECT'),
            ('auth.users', 'deleted_at', 'SELECT'), ('auth.users', 'role', 'SELECT'),
            ('auth.users', 'email_confirmed_at', 'SELECT'), ('auth.users', 'raw_app_meta_data', 'SELECT'),
            ('auth.sessions', 'id', 'SELECT'), ('auth.sessions', 'user_id', 'SELECT'),
            ('auth.sessions', 'created_at', 'SELECT'), ('auth.sessions', 'not_after', 'SELECT'),
            ('public.profiles', 'id', 'SELECT'), ('public.profiles', 'is_active', 'SELECT'),
            ('public.profiles', 'session_valid_after', 'SELECT'),
            ('public.profiles', 'id', 'INSERT'), ('public.profiles', 'full_name', 'INSERT'),
            ('public.profiles', 'role', 'INSERT'), ('public.profiles', 'is_active', 'INSERT')
        ) AS checks(relation, column_name, privilege)
    LOOP
        IF NOT pg_catalog.has_column_privilege(CURRENT_USER, required.relation, required.column_name, required.privilege)
        THEN
            RAISE EXCEPTION 'Provisioning owner lacks required column privileges';
        END IF;
    END LOOP;
END;
$check_owner$;

-- An existing completed fixture without evidence timestamps requires review.
-- Never synthesize onboarding freshness from the ledger's mutable updated_at.
ALTER TABLE csupak_private.account_provisioning
    ADD COLUMN profile_ready_at timestamptz,
    ADD COLUMN email_attempt_id uuid,
    ADD COLUMN email_attempted_at timestamptz,
    ADD CONSTRAINT provisioning_ready_timestamp CHECK (
        (provisioning_state = 'profile_ready') = (profile_ready_at IS NOT NULL)
        AND (profile_ready_at IS NULL OR profile_ready_at BETWEEN created_at AND updated_at)
        AND (onboarding_completed_at IS NULL OR onboarding_completed_at >= profile_ready_at)
    ),
    ADD CONSTRAINT provisioning_email_attempt CHECK (
        (email_attempt_id IS NULL) = (email_attempted_at IS NULL)
        AND (email_attempted_at IS NULL OR email_attempted_at BETWEEN profile_ready_at AND updated_at)
        AND (email_attempt_id IS NULL OR provisioning_state = 'profile_ready')
        AND (email_state = 'not_requested' OR email_attempt_id IS NOT NULL)
    );

CREATE FUNCTION csupak_private.lock_provisioning_step() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $lock_step$
BEGIN
    IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'Account changes require READ COMMITTED isolation' USING ERRCODE = '0A000';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(7310, 733);
END;
$lock_step$;

-- The Auth record is read by reserved UUID. Browser metadata and values from
-- an external Auth response are never accepted as identity evidence.
CREATE FUNCTION csupak_private.provisioning_auth_identity(p_target uuid, p_email text, p_operation uuid)
RETURNS TABLE (email_confirmed_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $auth_identity$
    SELECT u.email_confirmed_at
    FROM auth.users AS u
    WHERE u.id = p_target
      AND pg_catalog.lower(pg_catalog.btrim(u.email)) = p_email
      AND u.is_anonymous IS FALSE AND u.is_sso_user IS FALSE AND u.deleted_at IS NULL
      AND u.role = 'authenticated'
      AND u.raw_app_meta_data ->> 'csupak_provisioning_operation_id' = p_operation::text;
$auth_identity$;

CREATE FUNCTION public.admin_claim_provisioning_step(
    p_operation_id uuid, p_step text, p_resend boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
SET lock_timeout = '5s'
AS $claim_step$
DECLARE
    actor uuid := auth.uid();
    reservation csupak_private.account_provisioning%ROWTYPE;
    claimed_at timestamptz;
BEGIN
    IF actor IS NULL OR public.get_my_role() IS DISTINCT FROM 'oswe_admin' THEN
        RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
    END IF;
    IF p_step IS NULL OR p_step NOT IN ('auth', 'email') OR p_resend IS NULL
       OR (p_step = 'auth' AND p_resend) THEN
        RAISE EXCEPTION 'Invalid provisioning step' USING ERRCODE = '22023';
    END IF;

    PERFORM csupak_private.lock_provisioning_step();
    IF public.get_my_role() IS DISTINCT FROM 'oswe_admin' THEN
        RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
    END IF;

    SELECT p.* INTO reservation FROM csupak_private.account_provisioning AS p
    WHERE p.operation_id = p_operation_id AND p.actor_id = actor;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Provisioning reservation unavailable' USING ERRCODE = '42501';
    END IF;
    claimed_at := pg_catalog.clock_timestamp();

    IF p_step = 'auth' THEN
        IF reservation.provisioning_state = 'profile_ready' THEN
            RETURN pg_catalog.jsonb_build_object('outcome', 'profile_ready');
        END IF;
        IF reservation.provisioning_state = 'auth_outcome_unknown'
           AND claimed_at < reservation.updated_at + interval '60 seconds' THEN
            RETURN pg_catalog.jsonb_build_object('outcome', 'auth_outcome_unknown');
        END IF;

        UPDATE csupak_private.account_provisioning AS p
        SET provisioning_state = 'auth_outcome_unknown', updated_at = GREATEST(p.updated_at, claimed_at)
        WHERE p.operation_id = p_operation_id;
        RETURN pg_catalog.jsonb_build_object('outcome', 'claimed',
            'targetUserId', reservation.target_user_id, 'email', reservation.email);
    END IF;

    IF reservation.onboarding_completed_at IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object('outcome', 'onboarding_complete');
    END IF;
    IF reservation.provisioning_state <> 'profile_ready' OR NOT EXISTS (
        SELECT 1 FROM public.profiles AS p WHERE p.id = reservation.target_user_id AND NOT p.is_active
    ) OR NOT EXISTS (
        SELECT 1 FROM csupak_private.provisioning_auth_identity(
            reservation.target_user_id, reservation.email, reservation.operation_id
        )
    ) THEN
        RAISE EXCEPTION 'Provisioned account is not ready for setup email' USING ERRCODE = '55000';
    END IF;
    IF reservation.email_attempt_id IS NOT NULL AND NOT p_resend THEN
        RETURN pg_catalog.jsonb_build_object('outcome', reservation.email_state);
    END IF;
    IF claimed_at < reservation.email_attempted_at + interval '60 seconds' THEN
        RETURN pg_catalog.jsonb_build_object('outcome', 'email_cooldown');
    END IF;

    UPDATE csupak_private.account_provisioning AS p
    SET email_state = 'outcome_unknown', email_attempt_id = pg_catalog.gen_random_uuid(),
        email_attempted_at = GREATEST(reservation.profile_ready_at, claimed_at),
        updated_at = GREATEST(p.updated_at, claimed_at)
    WHERE p.operation_id = p_operation_id
    RETURNING p.email_attempt_id INTO reservation.email_attempt_id;
    RETURN pg_catalog.jsonb_build_object('outcome', 'claimed', 'attemptId', reservation.email_attempt_id,
        'targetUserId', reservation.target_user_id, 'email', reservation.email);
END;
$claim_step$;

CREATE FUNCTION public.reconcile_provisioned_auth_account(p_operation_id uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
SET lock_timeout = '5s'
AS $reconcile$
DECLARE
    reservation csupak_private.account_provisioning%ROWTYPE;
    ready_at timestamptz;
BEGIN
    PERFORM csupak_private.lock_provisioning_step();
    SELECT p.* INTO reservation FROM csupak_private.account_provisioning AS p
    WHERE p.operation_id = p_operation_id;
    IF NOT FOUND OR reservation.provisioning_state = 'reserved' THEN
        RAISE EXCEPTION 'Provisioning Auth creation has not been claimed' USING ERRCODE = '55000';
    END IF;
    IF reservation.provisioning_state = 'profile_ready' THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = reservation.target_user_id) THEN
            RAISE EXCEPTION 'Provisioned profile is missing' USING ERRCODE = '55000';
        END IF;
        RETURN 'profile_ready';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM auth.users AS u WHERE u.id = reservation.target_user_id) THEN
        RETURN 'auth_not_found';
    END IF;

    INSERT INTO public.profiles (id, full_name, role, is_active)
    SELECT reservation.target_user_id, reservation.full_name, reservation.requested_role, false
    FROM csupak_private.provisioning_auth_identity(
        reservation.target_user_id, reservation.email, reservation.operation_id
    )
    ON CONFLICT (id) DO NOTHING;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reserved Auth identity or profile conflicts with provisioning' USING ERRCODE = '23514';
    END IF;

    ready_at := GREATEST(reservation.updated_at, pg_catalog.clock_timestamp());
    UPDATE csupak_private.account_provisioning AS p
    SET provisioning_state = 'profile_ready', profile_ready_at = ready_at, updated_at = ready_at
    WHERE p.operation_id = p_operation_id;
    RETURN 'profile_ready';
END;
$reconcile$;

CREATE FUNCTION public.record_provisioning_email_outcome(p_operation_id uuid, p_attempt_id uuid, p_outcome text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
SET lock_timeout = '5s'
AS $record_email$
DECLARE
    reservation csupak_private.account_provisioning%ROWTYPE;
BEGIN
    IF p_attempt_id IS NULL OR p_outcome IS NULL OR p_outcome NOT IN ('requested', 'not_requested', 'outcome_unknown') THEN
        RAISE EXCEPTION 'Invalid setup email outcome' USING ERRCODE = '22023';
    END IF;
    PERFORM csupak_private.lock_provisioning_step();
    SELECT p.* INTO reservation FROM csupak_private.account_provisioning AS p
    WHERE p.operation_id = p_operation_id;
    IF NOT FOUND OR reservation.email_attempt_id IS DISTINCT FROM p_attempt_id THEN
        RAISE EXCEPTION 'Setup email attempt is no longer current' USING ERRCODE = '22023';
    END IF;
    IF reservation.email_state = p_outcome THEN RETURN p_outcome; END IF;
    IF reservation.email_state <> 'outcome_unknown' THEN
        RAISE EXCEPTION 'Conflicting setup email outcome' USING ERRCODE = '22023';
    END IF;

    UPDATE csupak_private.account_provisioning AS p
    SET email_state = p_outcome, updated_at = GREATEST(p.updated_at, pg_catalog.clock_timestamp())
    WHERE p.operation_id = p_operation_id;
    RETURN p_outcome;
END;
$record_email$;

CREATE FUNCTION public.complete_account_onboarding() RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
SET lock_timeout = '5s'
AS $complete$
DECLARE
    target uuid := auth.uid();
    claims jsonb := auth.jwt();
    session_claim text := claims ->> 'session_id';
    checked_at timestamptz;
    reservation csupak_private.account_provisioning%ROWTYPE;
BEGIN
    IF target IS NULL OR claims ->> 'role' IS DISTINCT FROM 'authenticated'
       OR claims -> 'is_anonymous' IS DISTINCT FROM 'false'::jsonb
       OR pg_catalog.jsonb_typeof(claims -> 'session_id') IS DISTINCT FROM 'string'
       OR (session_claim ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') IS NOT TRUE
       OR pg_catalog.jsonb_typeof(claims -> 'amr') IS DISTINCT FROM 'array'
    THEN
        RAISE EXCEPTION 'A fresh password sign-in for this account is required' USING ERRCODE = '42501';
    END IF;

    PERFORM csupak_private.lock_provisioning_step();
    checked_at := pg_catalog.clock_timestamp();
    SELECT p.* INTO reservation FROM csupak_private.account_provisioning AS p
    WHERE p.target_user_id = target AND p.provisioning_state = 'profile_ready';
    IF NOT FOUND OR NOT EXISTS (
        SELECT 1
        FROM public.profiles AS p
        JOIN auth.sessions AS s ON s.user_id = p.id AND s.id = session_claim::uuid
        CROSS JOIN csupak_private.provisioning_auth_identity(
            reservation.target_user_id, reservation.email, reservation.operation_id
        ) AS identity
        WHERE p.id = target AND NOT p.is_active AND identity.email_confirmed_at IS NOT NULL
          AND s.created_at > GREATEST(reservation.profile_ready_at, p.session_valid_after, identity.email_confirmed_at)
          AND s.created_at <= checked_at AND (s.not_after IS NULL OR s.not_after > checked_at)
          AND EXISTS (
              SELECT 1 FROM pg_catalog.jsonb_array_elements(claims -> 'amr') AS entry(value)
              WHERE entry.value ->> 'method' = 'password'
                AND CASE WHEN pg_catalog.jsonb_typeof(entry.value -> 'timestamp') = 'number'
                         AND entry.value ->> 'timestamp' ~ '^[0-9]{1,12}$'
                    -- AMR uses whole epoch seconds. The session boundary
                    -- above still compares full-precision database timestamps.
                    THEN (entry.value ->> 'timestamp')::bigint BETWEEN
                        pg_catalog.floor(EXTRACT(EPOCH FROM s.created_at))
                        AND pg_catalog.floor(EXTRACT(EPOCH FROM checked_at))
                    ELSE false END
          )
    ) THEN
        RAISE EXCEPTION 'A fresh password sign-in for this account is required' USING ERRCODE = '42501';
    END IF;
    IF reservation.onboarding_completed_at IS NOT NULL THEN RETURN 'already_completed'; END IF;

    UPDATE csupak_private.account_provisioning AS p
    SET onboarding_completed_at = checked_at, updated_at = GREATEST(p.updated_at, checked_at)
    WHERE p.operation_id = reservation.operation_id;
    RETURN 'completed';
END;
$complete$;

REVOKE ALL ON FUNCTION
    csupak_private.lock_provisioning_step(),
    csupak_private.provisioning_auth_identity(uuid, text, uuid),
    public.admin_claim_provisioning_step(uuid, text, boolean),
    public.reconcile_provisioned_auth_account(uuid),
    public.record_provisioning_email_outcome(uuid, uuid, text),
    public.complete_account_onboarding()
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_claim_provisioning_step(uuid, text, boolean),
    public.complete_account_onboarding() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_provisioned_auth_account(uuid),
    public.record_provisioning_email_outcome(uuid, uuid, text) TO service_role;

DO $check_grants$
DECLARE
    expected record;
BEGIN
    FOR expected IN SELECT * FROM (VALUES
        ('csupak_private.lock_provisioning_step()', NULL),
        ('csupak_private.provisioning_auth_identity(uuid,text,uuid)', NULL),
        ('public.admin_claim_provisioning_step(uuid,text,boolean)', 'authenticated'),
        ('public.complete_account_onboarding()', 'authenticated'),
        ('public.reconcile_provisioned_auth_account(uuid)', 'service_role'),
        ('public.record_provisioning_email_outcome(uuid,uuid,text)', 'service_role')
    ) AS grants(signature, allowed_role)
    LOOP
        IF EXISTS (
            SELECT 1 FROM pg_catalog.pg_roles AS r
            WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
              AND pg_catalog.has_function_privilege(r.oid, expected.signature, 'EXECUTE')
                  IS DISTINCT FROM (r.rolname IS NOT DISTINCT FROM expected.allowed_role)
        ) OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_proc AS f
            CROSS JOIN LATERAL pg_catalog.aclexplode(f.proacl) AS a
            WHERE f.oid = pg_catalog.to_regprocedure(expected.signature) AND a.privilege_type = 'EXECUTE'
              AND a.grantee <> f.proowner
              AND a.grantee IS DISTINCT FROM pg_catalog.to_regrole(expected.allowed_role)::oid
        ) THEN
            RAISE EXCEPTION 'Unexpected provisioning function grants for %', expected.signature;
        END IF;
    END LOOP;
END;
$check_grants$;

COMMIT;
