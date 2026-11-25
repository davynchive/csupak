BEGIN TRANSACTION READ ONLY;

SELECT p.oid::regprocedure AS signature, pg_catalog.pg_get_userbyid(p.proowner) AS owner,
       p.proowner = ledger.relowner AS matches_ledger_owner, p.provolatile, p.prosecdef, p.proconfig,
       pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
       EXISTS (SELECT 1 FROM pg_catalog.aclexplode(p.proacl) AS acl
               WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') AS public_execute
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_class AS ledger ON ledger.oid = pg_catalog.to_regclass('csupak_private.account_provisioning')
WHERE p.oid IN (pg_catalog.to_regprocedure('public.admin_list_users_with_onboarding(text,text,boolean,uuid,integer)'),
                pg_catalog.to_regprocedure('public.admin_list_my_interrupted_provisioning(uuid,integer)'));

COMMIT;
