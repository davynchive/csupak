-- Read-only catalog verification. Run after reviewing/applying the migration in TEST.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

SELECT f.oid::regprocedure AS signature, pg_catalog.pg_get_userbyid(f.proowner) AS owner,
       f.prosecdef, f.provolatile, f.proconfig, f.proacl
FROM pg_catalog.pg_proc AS f
WHERE f.oid IN (
    pg_catalog.to_regprocedure('public.admin_reserve_account_provisioning(uuid,text,text,text)'),
    pg_catalog.to_regprocedure('csupak_private.enforce_provisioned_profile_onboarding()'),
    pg_catalog.to_regprocedure('csupak_private.reject_provisioning_receipt_id_reuse()')
)
ORDER BY f.oid::regprocedure::text;

SELECT c.oid::regclass AS provisioning_table, pg_catalog.pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity, c.relacl, pg_catalog.pg_get_constraintdef(k.oid) AS constraint_definition
FROM pg_catalog.pg_class AS c
LEFT JOIN pg_catalog.pg_constraint AS k ON k.conrelid = c.oid
WHERE c.oid = pg_catalog.to_regclass('csupak_private.account_provisioning')
ORDER BY k.conname;

SELECT r.rolname,
       pg_catalog.has_schema_privilege(r.oid, pg_catalog.to_regnamespace('csupak_private'), 'USAGE, CREATE')
           AS private_schema_access,
       pg_catalog.has_any_column_privilege(
           r.oid, pg_catalog.to_regclass('csupak_private.account_provisioning'), 'SELECT, INSERT, UPDATE, REFERENCES'
       ) AS provisioning_column_access,
       pg_catalog.has_table_privilege(
           r.oid, pg_catalog.to_regclass('csupak_private.account_provisioning'), 'DELETE, TRUNCATE, TRIGGER, MAINTAIN'
       ) AS provisioning_table_control,
       pg_catalog.has_function_privilege(
           r.oid, pg_catalog.to_regprocedure('public.admin_reserve_account_provisioning(uuid,text,text,text)'), 'EXECUTE'
       ) AS reserve_execute
FROM pg_catalog.pg_roles AS r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY r.rolname;

WITH expected(audit_or_profile_table, trigger_name) AS (
    VALUES
        ('public.profiles', 'profiles_require_provisioned_account_onboarding'),
        ('csupak_private.admin_account_audit', 'admin_account_audit_reject_provisioning_id'),
        ('csupak_private.admin_user_name_audit', 'admin_user_name_audit_reject_provisioning_id')
)
SELECT e.audit_or_profile_table, e.trigger_name, t.tgenabled,
       pg_catalog.pg_get_triggerdef(t.oid) AS trigger_definition
FROM expected AS e
LEFT JOIN pg_catalog.pg_trigger AS t
  ON t.tgrelid = pg_catalog.to_regclass(e.audit_or_profile_table)
 AND t.tgname = e.trigger_name AND NOT t.tgisinternal
ORDER BY e.audit_or_profile_table;

COMMIT;
