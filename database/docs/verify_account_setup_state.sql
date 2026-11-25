-- Read-only catalog check. Run behavior tests separately.
SELECT p.oid::regprocedure AS signature,
       pg_catalog.pg_get_userbyid(p.proowner) AS owner,
       p.proowner = completion.proowner AS matches_completion_owner,
       p.prorettype::regtype AS result_type, p.provolatile, p.prosecdef, p.proconfig,
       pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
       EXISTS (
           SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl
           WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
       ) AS public_execute
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_proc AS completion ON completion.oid = pg_catalog.to_regprocedure('public.complete_account_onboarding()')
WHERE p.oid = pg_catalog.to_regprocedure('public.get_account_setup_state()');
