BEGIN;
SET LOCAL lock_timeout = '5s';

DO $owner$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class
        WHERE oid = pg_catalog.to_regclass('csupak_private.account_provisioning')
          AND pg_catalog.pg_get_userbyid(relowner) = CURRENT_USER
          AND relrowsecurity AND NOT relforcerowsecurity)
    THEN
        RAISE EXCEPTION 'Apply as the account provisioning ledger owner';
    END IF;
END;
$owner$;

CREATE FUNCTION public.admin_list_users_with_onboarding(
    p_search text DEFAULT NULL, p_role text DEFAULT NULL, p_is_active boolean DEFAULT NULL,
    p_cursor uuid DEFAULT NULL, p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
AS $roster$
DECLARE
    actor uuid := auth.uid();
    roster jsonb;
    users jsonb;
BEGIN
    IF actor IS NULL OR public.get_my_role() IS DISTINCT FROM 'oswe_admin' THEN
        RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
    END IF;
    roster := public.admin_list_users(p_search, p_role, p_is_active, p_cursor, p_limit);
    SELECT COALESCE(pg_catalog.jsonb_agg(entry.user_data || pg_catalog.jsonb_build_object(
        'accountState', CASE
            WHEN entry.user_data -> 'isActive' = 'true'::jsonb THEN 'active'
            WHEN setup.operation_id IS NULL THEN 'deactivated'
            WHEN setup.onboarding_completed_at IS NULL THEN 'setup_pending'
            WHEN setup.was_activated THEN 'deactivated'
            ELSE 'awaiting_activation'
        END,
        'setupOperationId', CASE WHEN setup.actor_id = actor AND setup.onboarding_completed_at IS NULL AND entry.user_data -> 'isActive' = 'false'::jsonb THEN setup.operation_id END,
        'setupEmailState', CASE WHEN setup.actor_id = actor AND setup.onboarding_completed_at IS NULL AND entry.user_data -> 'isActive' = 'false'::jsonb THEN setup.email_state END
    ) ORDER BY entry.ordinal), '[]'::jsonb) INTO users
    FROM pg_catalog.jsonb_array_elements(roster -> 'users') WITH ORDINALITY AS entry(user_data, ordinal)
    LEFT JOIN LATERAL (
        SELECT p.operation_id, p.actor_id, p.onboarding_completed_at, p.email_state,
               EXISTS (SELECT 1 FROM csupak_private.admin_account_audit AS a
                       WHERE a.target_id = p.target_user_id AND a.action = 'set_status'
                         AND a.outcome = 'applied' AND a.resulting_is_active) AS was_activated
        FROM csupak_private.account_provisioning AS p
        WHERE p.target_user_id = (entry.user_data ->> 'id')::uuid AND p.provisioning_state = 'profile_ready'
    ) AS setup ON true;

    RETURN pg_catalog.jsonb_build_object('users', users, 'nextCursor', roster -> 'nextCursor');
END;
$roster$;

CREATE FUNCTION public.admin_list_my_interrupted_provisioning(p_cursor uuid DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
AS $interrupted$
DECLARE
    actor uuid := auth.uid();
    result jsonb;
BEGIN
    IF actor IS NULL OR public.get_my_role() IS DISTINCT FROM 'oswe_admin' THEN
        RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
    END IF;
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
        RAISE EXCEPTION 'Page limit must be between 1 and 100' USING ERRCODE = '22023';
    END IF;

    WITH candidates AS MATERIALIZED (
        SELECT p.operation_id, p.full_name, p.email, p.requested_role
        FROM csupak_private.account_provisioning AS p
        WHERE p.actor_id = actor AND p.provisioning_state IN ('reserved', 'auth_outcome_unknown')
          AND (p_cursor IS NULL OR p.operation_id > p_cursor)
        ORDER BY p.operation_id LIMIT p_limit + 1
    ), page AS (
        SELECT * FROM candidates ORDER BY operation_id LIMIT p_limit
    )
    SELECT pg_catalog.jsonb_build_object(
        'requests', COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'operationId', p.operation_id, 'fullName', p.full_name, 'email', p.email, 'role', p.requested_role
        ) ORDER BY p.operation_id), '[]'::jsonb),
        'nextCursor', CASE WHEN (SELECT pg_catalog.count(*) FROM candidates) > p_limit
            THEN (SELECT last_row.operation_id FROM page AS last_row ORDER BY last_row.operation_id DESC LIMIT 1) END
    ) INTO result FROM page AS p;
    RETURN result;
END;
$interrupted$;

REVOKE ALL ON FUNCTION public.admin_list_users_with_onboarding(text,text,boolean,uuid,integer),
    public.admin_list_my_interrupted_provisioning(uuid,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_users_with_onboarding(text,text,boolean,uuid,integer),
    public.admin_list_my_interrupted_provisioning(uuid,integer) TO authenticated;

COMMIT;
