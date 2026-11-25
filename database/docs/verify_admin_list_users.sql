-- Read-only catalog check. Run after applying the roster migration in TEST.
BEGIN TRANSACTION READ ONLY;

WITH target AS (
    SELECT pg_catalog.to_regprocedure(
        'public.admin_list_users(text,text,boolean,uuid,integer)'
    ) AS signature
)
SELECT
    target.signature,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,
    p.prosecdef AS security_definer,
    p.provolatile = 's' AS stable,
    p.proconfig AS function_settings,
    pg_catalog.pg_get_function_arguments(p.oid) AS parameters,
    pg_catalog.pg_get_function_result(p.oid) AS result_type,
    EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
    ) AS public_execute,
    pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
    p.proacl AS explicit_grants,
    pg_catalog.pg_get_functiondef(p.oid) AS definition
FROM target
LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = target.signature;

COMMIT;
