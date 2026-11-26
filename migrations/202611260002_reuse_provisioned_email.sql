BEGIN;
SET LOCAL lock_timeout = '5s';

DO $check_owner$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc AS f
        WHERE f.oid = 'public.admin_reserve_account_provisioning(uuid,text,text,text)'::regprocedure
          AND pg_catalog.pg_get_userbyid(f.proowner) = CURRENT_USER
    ) OR NOT pg_catalog.has_column_privilege(CURRENT_USER, 'auth.users', 'email', 'SELECT')
      OR NOT pg_catalog.has_column_privilege(CURRENT_USER, 'auth.users', 'email_change', 'SELECT')
      OR NOT pg_catalog.has_column_privilege(CURRENT_USER, 'auth.identities', 'email', 'SELECT')
    THEN
        RAISE EXCEPTION 'Apply as the provisioning owner with existing Auth email read access';
    END IF;
END;
$check_owner$;

-- Keep history intact and enforce uniqueness for every outstanding reservation.
ALTER TABLE csupak_private.account_provisioning
    ADD COLUMN email_released_at timestamptz,
    ADD CONSTRAINT provisioning_email_release_requires_completion CHECK (
        email_released_at IS NULL OR (onboarding_completed_at IS NOT NULL
            AND email_released_at >= onboarding_completed_at)
    );

CREATE UNIQUE INDEX account_provisioning_outstanding_email_key
    ON csupak_private.account_provisioning (email) WHERE email_released_at IS NULL;
ALTER TABLE csupak_private.account_provisioning DROP CONSTRAINT account_provisioning_email_key;

-- Replace the RPC in place to preserve ownership and grants. The existing
-- transaction lock serializes release and reservation against other CSUPAK requests.
CREATE OR REPLACE FUNCTION public.admin_reserve_account_provisioning(
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

        -- Check current and pending Auth addresses and identity emails before
        -- releasing a completed reservation or reserving a new address.
        IF EXISTS (
            SELECT 1 FROM auth.users AS u
            WHERE pg_catalog.lower(pg_catalog.btrim(u.email)) = normalized_email
               OR pg_catalog.lower(pg_catalog.btrim(u.email_change)) = normalized_email
        ) OR EXISTS (
            SELECT 1 FROM auth.identities AS i
            WHERE pg_catalog.lower(pg_catalog.btrim(i.email)) = normalized_email
        ) THEN
            -- Preserve the conflict response understood by the deployed Edge Function.
            RAISE EXCEPTION 'Email already has a provisioning reservation' USING ERRCODE = '22023';
        END IF;

        -- Preserve the original email, actor, target, and operation ID for replay.
        -- Unfinished requests retain their reservation, including uncertain Auth outcomes.
        UPDATE csupak_private.account_provisioning AS p
        SET email_released_at = GREATEST(p.onboarding_completed_at, pg_catalog.clock_timestamp())
        WHERE p.email = normalized_email AND p.email_released_at IS NULL
          AND p.onboarding_completed_at IS NOT NULL;

        INSERT INTO csupak_private.account_provisioning (operation_id, actor_id, email, full_name, requested_role)
        VALUES (p_operation_id, actor, normalized_email, normalized_name, p_role)
        ON CONFLICT (email) WHERE email_released_at IS NULL DO NOTHING
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

COMMIT;
