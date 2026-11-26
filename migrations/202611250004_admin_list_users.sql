BEGIN;
SET LOCAL lock_timeout = '5s';

-- The function owner must be able to perform a narrow cross-account read.
DO $check_owner$
BEGIN
    IF pg_catalog.to_regprocedure('public.get_my_role()') IS NULL THEN
        RAISE EXCEPTION 'Apply account access enforcement before creating the administrator roster';
    END IF;

    IF pg_catalog.row_security_active('public.profiles'::regclass)
       OR pg_catalog.row_security_active('auth.users'::regclass)
       OR NOT pg_catalog.has_schema_privilege(CURRENT_USER, 'auth', 'USAGE')
       OR NOT pg_catalog.has_function_privilege(CURRENT_USER, 'public.get_my_role()', 'EXECUTE')
       OR NOT pg_catalog.has_column_privilege(CURRENT_USER, 'public.profiles', 'id', 'SELECT')
       OR NOT pg_catalog.has_column_privilege(CURRENT_USER, 'public.profiles', 'full_name', 'SELECT')
       OR NOT pg_catalog.has_column_privilege(CURRENT_USER, 'public.profiles', 'role', 'SELECT')
       OR NOT pg_catalog.has_column_privilege(CURRENT_USER, 'public.profiles', 'is_active', 'SELECT')
       OR NOT pg_catalog.has_column_privilege(CURRENT_USER, 'auth.users', 'id', 'SELECT')
       OR NOT pg_catalog.has_column_privilege(CURRENT_USER, 'auth.users', 'email', 'SELECT')
    THEN
        RAISE EXCEPTION 'Review the administrator roster function owner privileges before deployment';
    END IF;
END;
$check_owner$;

CREATE FUNCTION public.admin_list_users(
    p_search text DEFAULT NULL,
    p_role text DEFAULT NULL,
    p_is_active boolean DEFAULT NULL,
    p_cursor uuid DEFAULT NULL,
    p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
AS $admin_list_users$
DECLARE
    search_term text;
    result jsonb;
BEGIN
    IF public.get_my_role() IS DISTINCT FROM 'oswe_admin' THEN
        RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
    END IF;
    IF pg_catalog.char_length(p_search) > 200 THEN
        RAISE EXCEPTION 'Search must contain at most 200 characters' USING ERRCODE = '22023';
    END IF;
    IF p_role IS NOT NULL AND p_role NOT IN ('oswe_admin', 'oswe_staff', 'security_office') THEN
        RAISE EXCEPTION 'Unsupported application role' USING ERRCODE = '22023';
    END IF;
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
        RAISE EXCEPTION 'Page limit must be between 1 and 100' USING ERRCODE = '22023';
    END IF;
    search_term := pg_catalog.lower(p_search);

    WITH candidates AS MATERIALIZED (
        SELECT p.id, p.full_name, u.email, p.role, p.is_active
        FROM public.profiles AS p
        JOIN auth.users AS u ON u.id = p.id
        WHERE (p_role IS NULL OR p.role = p_role)
          AND (p_is_active IS NULL OR p.is_active = p_is_active)
          AND (p_cursor IS NULL OR p.id > p_cursor)
          AND (search_term IS NULL OR search_term = ''
               OR pg_catalog.strpos(pg_catalog.lower(p.full_name), search_term) > 0
               OR pg_catalog.strpos(pg_catalog.lower(u.email), search_term) > 0)
        ORDER BY p.id
        LIMIT p_limit + 1
    ), page AS (
        SELECT c.id, c.full_name, c.email, c.role, c.is_active
        FROM candidates AS c
        ORDER BY c.id
        LIMIT p_limit
    )
    SELECT pg_catalog.jsonb_build_object(
        'users', COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', p.id,
            'fullName', p.full_name,
            'email', p.email,
            'role', p.role,
            'isActive', p.is_active
        ) ORDER BY p.id), '[]'::jsonb),
        'nextCursor', CASE WHEN (SELECT pg_catalog.count(*) FROM candidates) > p_limit
            THEN (SELECT last_row.id FROM page AS last_row ORDER BY last_row.id DESC LIMIT 1)
        END
    )
    INTO result
    FROM page AS p;

    RETURN result;
END;
$admin_list_users$;

REVOKE ALL ON FUNCTION public.admin_list_users(text, text, boolean, uuid, integer)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, text, boolean, uuid, integer)
    TO authenticated;

DO $check_grants$
DECLARE
    roster_rpc regprocedure := 'public.admin_list_users(text,text,boolean,uuid,integer)'::regprocedure;
BEGIN
    IF pg_catalog.has_function_privilege('anon', roster_rpc, 'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role', roster_rpc, 'EXECUTE')
       OR NOT pg_catalog.has_function_privilege('authenticated', roster_rpc, 'EXECUTE')
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_proc AS f
           CROSS JOIN LATERAL pg_catalog.aclexplode(f.proacl) AS acl
           WHERE f.oid = roster_rpc
             AND acl.privilege_type = 'EXECUTE'
             AND acl.grantee NOT IN (f.proowner, 'authenticated'::regrole)
       )
    THEN
        RAISE EXCEPTION 'Unexpected administrator roster RPC execute grants';
    END IF;
END;
$check_grants$;

COMMIT;
