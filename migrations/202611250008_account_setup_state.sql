BEGIN;
SET LOCAL lock_timeout = '5s';

DO $setup_owner$
BEGIN
    IF (SELECT pg_catalog.pg_get_userbyid(p.proowner) FROM pg_catalog.pg_proc AS p
        WHERE p.oid = pg_catalog.to_regprocedure('public.complete_account_onboarding()')) IS DISTINCT FROM current_user
    THEN
        RAISE EXCEPTION 'Run this migration as the onboarding completion function owner';
    END IF;
END;
$setup_owner$;

-- The provisioning marker persists after setup. Check the current lifecycle
-- before offering a password change on the dedicated setup page.
CREATE FUNCTION public.get_account_setup_state() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
AS $setup_state$
DECLARE
    target uuid := auth.uid();
    claims jsonb := auth.jwt();
    session_claim text := claims ->> 'session_id';
    checked_at timestamptz := pg_catalog.statement_timestamp();
    setup_state text;
BEGIN
    IF target IS NULL OR claims ->> 'role' IS DISTINCT FROM 'authenticated'
       OR claims -> 'is_anonymous' IS DISTINCT FROM 'false'::jsonb
       OR pg_catalog.jsonb_typeof(claims -> 'session_id') IS DISTINCT FROM 'string'
       OR (session_claim ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') IS NOT TRUE
    THEN
        RETURN 'unavailable';
    END IF;

    SELECT CASE WHEN reservation.onboarding_completed_at IS NULL THEN 'pending' ELSE 'already_completed' END
    INTO setup_state
    FROM csupak_private.account_provisioning AS reservation
    JOIN public.profiles AS p ON p.id = reservation.target_user_id
    JOIN auth.sessions AS s ON s.user_id = p.id AND s.id = session_claim::uuid
    CROSS JOIN csupak_private.provisioning_auth_identity(
        reservation.target_user_id, reservation.email, reservation.operation_id
    ) AS identity
    WHERE p.id = target AND NOT p.is_active AND reservation.provisioning_state = 'profile_ready'
      AND identity.email_confirmed_at IS NOT NULL
      AND s.created_at > GREATEST(reservation.profile_ready_at, p.session_valid_after)
      AND s.created_at <= checked_at AND (s.not_after IS NULL OR s.not_after > checked_at);

    RETURN COALESCE(setup_state, 'unavailable');
END;
$setup_state$;

REVOKE ALL ON FUNCTION public.get_account_setup_state() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_account_setup_state() TO authenticated;

COMMIT;
