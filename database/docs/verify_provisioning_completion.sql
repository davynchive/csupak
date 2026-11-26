-- Read-only Step 7.4.6.2.2.1 catalog checks. This query returns no account data.
BEGIN TRANSACTION READ ONLY;

WITH expected(signature, allowed_role) AS (
    VALUES ('public.admin_claim_provisioning_step(uuid,text,boolean)', 'authenticated'),
           ('public.complete_account_onboarding()', 'authenticated'),
           ('public.reconcile_provisioned_auth_account(uuid)', 'service_role'),
           ('public.record_provisioning_email_outcome(uuid,uuid,text)', 'service_role'),
           ('csupak_private.lock_provisioning_step()', NULL),
           ('csupak_private.provisioning_auth_identity(uuid,text,uuid)', NULL)
)
SELECT e.signature, e.allowed_role, pg_catalog.pg_get_userbyid(f.proowner) AS owner,
       f.prosecdef, f.provolatile, f.proconfig, f.proacl,
       EXISTS (
           SELECT 1 FROM pg_catalog.aclexplode(COALESCE(f.proacl, pg_catalog.acldefault('f', f.proowner))) AS a
           WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
       ) AS public_execute,
       pg_catalog.has_function_privilege('anon', f.oid, 'EXECUTE') AS anon_execute,
       pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE') AS authenticated_execute,
       pg_catalog.has_function_privilege('service_role', f.oid, 'EXECUTE') AS service_execute
FROM expected AS e
LEFT JOIN pg_catalog.pg_proc AS f ON f.oid = pg_catalog.to_regprocedure(e.signature)
ORDER BY e.signature;

SELECT c.oid::regclass AS ledger, c.relrowsecurity, c.relacl,
       k.conname, k.convalidated, pg_catalog.pg_get_constraintdef(k.oid) AS definition
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_constraint AS k ON k.conrelid = c.oid
WHERE c.oid = pg_catalog.to_regclass('csupak_private.account_provisioning')
  AND k.conname IN ('provisioning_ready_timestamp', 'provisioning_email_attempt')
ORDER BY k.conname;

SELECT r.rolname,
       pg_catalog.has_schema_privilege(r.oid, 'csupak_private', 'USAGE, CREATE') AS private_schema_access,
       pg_catalog.has_any_column_privilege(
           r.oid, 'csupak_private.account_provisioning', 'SELECT, INSERT, UPDATE, REFERENCES'
       ) AS ledger_column_access,
       pg_catalog.has_table_privilege(
           r.oid, 'csupak_private.account_provisioning', 'DELETE, TRUNCATE, TRIGGER, MAINTAIN'
       ) AS ledger_table_control
FROM pg_catalog.pg_roles AS r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY r.rolname;

SELECT t.tgname, t.tgenabled, pg_catalog.pg_get_triggerdef(t.oid) AS definition
FROM pg_catalog.pg_trigger AS t
WHERE t.tgrelid = 'public.profiles'::regclass AND t.tgname = 'profiles_require_provisioned_account_onboarding';

COMMIT;
