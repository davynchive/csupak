-- Read-only catalog checks. Execute fixture tests separately.
SELECT p.oid::regprocedure AS signature, pg_catalog.pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef, p.proconfig,
       pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
       EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl
               WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') AS public_execute
FROM pg_catalog.pg_proc AS p
WHERE p.oid IN (pg_catalog.to_regprocedure('public.admin_claim_password_recovery(uuid,uuid)'),
                pg_catalog.to_regprocedure('public.record_admin_password_recovery(uuid,text)'));

SELECT c.oid::regclass AS ledger, c.relrowsecurity, c.relacl,
       pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS authenticated_table_access,
       pg_catalog.has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS anon_table_access,
       pg_catalog.has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS service_table_access,
       ARRAY(SELECT pg_catalog.pg_get_constraintdef(k.oid) FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = c.oid) AS constraints
FROM pg_catalog.pg_class AS c
WHERE c.oid = pg_catalog.to_regclass('csupak_private.admin_password_recovery');

SELECT t.tgrelid::regclass AS relation, t.tgname, t.tgenabled, t.tgfoid::regprocedure AS trigger_function
FROM pg_catalog.pg_trigger AS t
WHERE t.tgfoid = pg_catalog.to_regprocedure('csupak_private.reject_password_recovery_id_reuse()')
   OR (t.tgrelid = pg_catalog.to_regclass('csupak_private.admin_password_recovery')
       AND t.tgname = 'admin_password_recovery_preserve_history');
