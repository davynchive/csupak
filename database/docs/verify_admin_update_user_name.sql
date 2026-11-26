-- Step 7.4.5 catalog verification. Run in CSUPAK-TEST after the name migration.
-- Returns catalog metadata only.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

WITH target AS (
    SELECT pg_catalog.to_regprocedure('public.admin_update_user_name(uuid,uuid,text)') AS signature
)
SELECT target.signature, pg_catalog.pg_get_userbyid(f.proowner) AS owner,
       pg_catalog.pg_get_function_arguments(f.oid) AS parameters,
       pg_catalog.pg_get_function_result(f.oid) AS result_type,
       f.provolatile = 'v' AS volatile, f.prosecdef AS security_definer,
       f.proconfig AS function_settings, f.proacl AS explicit_grants,
       EXISTS (
           SELECT 1
           FROM pg_catalog.aclexplode(COALESCE(f.proacl, pg_catalog.acldefault('f', f.proowner))) AS acl
           WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
       ) AS public_execute,
       pg_catalog.has_function_privilege('anon', f.oid, 'EXECUTE') AS anon_execute,
       pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE') AS authenticated_execute,
       pg_catalog.has_function_privilege('service_role', f.oid, 'EXECUTE') AS service_role_execute
FROM target
LEFT JOIN pg_catalog.pg_proc AS f ON f.oid = target.signature;

WITH target AS (
    SELECT pg_catalog.to_regclass('csupak_private.admin_user_name_audit') AS audit_table
)
SELECT target.audit_table, pg_catalog.pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced, c.relacl AS explicit_grants,
       EXISTS (SELECT 1 FROM pg_catalog.pg_policy AS p WHERE p.polrelid = c.oid) AS has_rls_policies,
       EXISTS (
           SELECT 1 FROM pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) AS acl
           WHERE acl.grantee = 0
           UNION ALL
           SELECT 1 FROM pg_catalog.pg_attribute AS a
           CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
           WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped AND acl.grantee = 0
       ) AS public_audit_access
FROM target
LEFT JOIN pg_catalog.pg_class AS c ON c.oid = target.audit_table;

SELECT con.conname, con.contype, con.convalidated, pg_catalog.pg_get_constraintdef(con.oid) AS definition
FROM pg_catalog.pg_constraint AS con
WHERE con.conrelid = pg_catalog.to_regclass('csupak_private.admin_user_name_audit')
ORDER BY con.conname;

SELECT r.rolname,
       pg_catalog.has_schema_privilege(r.oid, pg_catalog.to_regnamespace('csupak_private'), 'USAGE, CREATE')
           AS private_schema_access,
       pg_catalog.has_any_column_privilege(
           r.oid, pg_catalog.to_regclass('csupak_private.admin_user_name_audit'), 'SELECT, INSERT, UPDATE, REFERENCES'
       ) AS direct_audit_column_access,
       pg_catalog.has_table_privilege(
           r.oid, pg_catalog.to_regclass('csupak_private.admin_user_name_audit'), 'DELETE, TRUNCATE, TRIGGER, MAINTAIN'
       ) AS direct_audit_control
FROM pg_catalog.pg_roles AS r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY r.rolname;

WITH expected(audit_table, trigger_name) AS (
    VALUES
        ('csupak_private.admin_user_name_audit', 'admin_user_name_audit_append_only'),
        ('csupak_private.admin_account_audit', 'admin_account_audit_reject_name_receipt_id')
)
SELECT expected.audit_table, expected.trigger_name, t.tgenabled,
       t.tgfoid::regprocedure AS trigger_function, pg_catalog.pg_get_triggerdef(t.oid) AS definition
FROM expected
LEFT JOIN pg_catalog.pg_trigger AS t
  ON t.tgrelid = pg_catalog.to_regclass(expected.audit_table)
 AND t.tgname = expected.trigger_name AND NOT t.tgisinternal
ORDER BY expected.audit_table;

COMMIT;
