-- Step 7.3.3 catalog verification. Review in CSUPAK-TEST before and after the
-- migration. Before migration, new-object lookups should be NULL or empty.
-- These queries return catalog metadata only, with no account or audit rows.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

SELECT pg_catalog.to_regnamespace('csupak_private') AS audit_schema,
       pg_catalog.to_regclass('csupak_private.admin_account_audit') AS audit_table,
       pg_catalog.to_regprocedure(
           'public.admin_change_account_access(uuid, uuid, text, text, boolean)'
       ) AS mutation_function,
       pg_catalog.to_regprocedure('public.get_my_role()') AS eligibility_function,
       pg_catalog.current_setting('default_transaction_isolation') AS database_default_isolation;

SELECT a.attnum AS position, a.attname,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull, pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_expression
FROM pg_catalog.pg_attribute AS a
LEFT JOIN pg_catalog.pg_attrdef AS d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attrelid = pg_catalog.to_regclass('csupak_private.admin_account_audit')
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum;

-- Expect no foreign keys involving this audit table.
SELECT c.conname, c.contype, pg_catalog.pg_get_constraintdef(c.oid) AS definition
FROM pg_catalog.pg_constraint AS c
WHERE c.conrelid = pg_catalog.to_regclass('csupak_private.admin_account_audit')
   OR c.confrelid = pg_catalog.to_regclass('csupak_private.admin_account_audit')
ORDER BY c.conname;

SELECT n.nspname, c.relname, pg_catalog.pg_get_userbyid(c.relowner) AS table_owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced, c.relacl
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE c.oid IN (
    'public.profiles'::regclass, pg_catalog.to_regclass('csupak_private.admin_account_audit')
)
ORDER BY n.nspname, c.relname;

-- Expect the existing restrictive profile gate and no audit table policies.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE (schemaname = 'public' AND tablename = 'profiles')
   OR (schemaname = 'csupak_private' AND tablename = 'admin_account_audit')
ORDER BY schemaname, tablename, policyname;

SELECT r.rolname, r.rolsuper, r.rolbypassrls,
       pg_catalog.has_any_column_privilege(r.oid, 'public.profiles', 'INSERT, UPDATE')
           AS direct_profile_insert_update,
       pg_catalog.has_table_privilege(r.oid, 'public.profiles', 'DELETE, TRUNCATE')
           AS direct_profile_delete_truncate,
       pg_catalog.has_schema_privilege(r.oid, pg_catalog.to_regnamespace('csupak_private'), 'USAGE, CREATE')
           AS private_schema_access,
       pg_catalog.has_any_column_privilege(
           r.oid, pg_catalog.to_regclass('csupak_private.admin_account_audit'), 'SELECT, INSERT, UPDATE, REFERENCES'
       ) AS direct_audit_column_access,
       pg_catalog.has_table_privilege(
           r.oid, pg_catalog.to_regclass('csupak_private.admin_account_audit'), 'DELETE, TRUNCATE, TRIGGER, MAINTAIN'
       ) AS direct_audit_control,
       pg_catalog.has_function_privilege(
           r.oid, pg_catalog.to_regprocedure('public.admin_change_account_access(uuid, uuid, text, text, boolean)'),
           'EXECUTE'
       ) AS mutation_execute,
       pg_catalog.has_function_privilege(
           r.oid, pg_catalog.to_regprocedure('csupak_private.reject_admin_account_audit_mutation()'), 'EXECUTE'
       ) AS audit_trigger_execute
FROM pg_catalog.pg_roles AS r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY r.rolname;

SELECT f.oid::regprocedure AS signature, pg_catalog.pg_get_userbyid(f.proowner) AS owner,
       f.prosecdef, f.provolatile, f.proconfig, f.proacl
FROM pg_catalog.pg_proc AS f
WHERE f.oid IN (
    pg_catalog.to_regprocedure('auth.uid()'),
    pg_catalog.to_regprocedure('public.get_my_role()'),
    pg_catalog.to_regprocedure('public.update_my_profile(text)'),
    pg_catalog.to_regprocedure('public.admin_change_account_access(uuid, uuid, text, text, boolean)'),
    pg_catalog.to_regprocedure('csupak_private.reject_admin_account_audit_mutation()')
)
ORDER BY f.oid::regprocedure::text;

SELECT pg_catalog.pg_get_userbyid(f.proowner) AS mutation_owner,
       pg_catalog.has_schema_privilege(f.proowner, 'auth', 'USAGE') AS auth_schema_usage,
       pg_catalog.has_function_privilege(f.proowner, 'auth.uid()', 'EXECUTE') AS auth_uid_execute,
       pg_catalog.has_function_privilege(f.proowner, 'public.get_my_role()', 'EXECUTE') AS eligibility_execute,
       pg_catalog.has_column_privilege(f.proowner, p.oid, 'id', 'SELECT')
           AND pg_catalog.has_column_privilege(f.proowner, p.oid, 'role', 'SELECT')
           AND pg_catalog.has_column_privilege(f.proowner, p.oid, 'is_active', 'SELECT')
           AND pg_catalog.has_column_privilege(f.proowner, p.oid, 'session_valid_after', 'SELECT')
           AS profile_columns_read,
       pg_catalog.has_column_privilege(f.proowner, p.oid, 'role', 'UPDATE')
           AND pg_catalog.has_column_privilege(f.proowner, p.oid, 'is_active', 'UPDATE')
           AND pg_catalog.has_column_privilege(f.proowner, p.oid, 'session_valid_after', 'UPDATE')
           AS profile_columns_update,
       p.relrowsecurity AND (r.rolsuper OR r.rolbypassrls
           OR (p.relowner = f.proowner AND NOT p.relforcerowsecurity))
           AS owner_can_mutate_rls_protected_profiles,
       pg_catalog.has_schema_privilege(f.proowner, a.relnamespace, 'USAGE') AS audit_schema_usage,
       a.relowner = f.proowner AND a.relrowsecurity AND NOT a.relforcerowsecurity
           AS owner_can_use_private_audit_table,
       pg_catalog.has_table_privilege(f.proowner, a.oid, 'SELECT')
           AND pg_catalog.has_table_privilege(f.proowner, a.oid, 'INSERT')
           AS audit_read_and_append
FROM pg_catalog.pg_proc AS f
JOIN pg_catalog.pg_roles AS r ON r.oid = f.proowner
JOIN pg_catalog.pg_class AS p ON p.oid = 'public.profiles'::regclass
JOIN pg_catalog.pg_class AS a ON a.oid = pg_catalog.to_regclass('csupak_private.admin_account_audit')
WHERE f.oid = pg_catalog.to_regprocedure('public.admin_change_account_access(uuid, uuid, text, text, boolean)');

SELECT t.tgname, t.tgenabled, t.tgfoid::regprocedure AS trigger_function,
       pg_catalog.pg_get_triggerdef(t.oid) AS definition
FROM pg_catalog.pg_trigger AS t
WHERE t.tgrelid = pg_catalog.to_regclass('csupak_private.admin_account_audit')
  AND NOT t.tgisinternal
ORDER BY t.tgname;

COMMIT;

-- Step 7.3.4 runtime regression plan. Use an approved, isolated TEST project and
-- disposable users. Verify Steps 7.3.1 and 7.3.2 first. These tests must use
-- real authenticated requests and authorized TEST-only fixture controls.
--
-- 1. As eligible OSWE Administrator, change another profile between the
--    supported non-admin roles. Check its cutoff and the approved audit fields.
--    A genuine promotion to oswe_admin must remain blocked pending approval.
-- 2. Activate and deactivate another profile, including an existing admin
--    where allowed. Confirm profile state, cutoff, and audit outcome.
-- 3. As OSWE Staff and Security Office, call each action. Expect denial and
--    unchanged state. Verify browser roles cannot write profiles directly.
-- 4. Use a token from an inactive admin and a pre-cutoff token for a reactivated
--    admin. Expect denial. Check authorization is repeated after lock waits.
-- 5. Test the anonymous API role and an anonymous Auth identity, including an
--    otherwise eligible fixture profile. Expect denial in each case.
-- 6. Test missing target, malformed or nil UUIDs, missing action, invalid or
--    NULL role, NULL status, and supplying both role and status. Expect no write.
-- 7. Attempt self-deactivation and self-demotion. Confirm both fail.
-- 8. With one active admin profile, attempt deactivation and demotion. The
--    self-account restriction should deny both before the last-admin guard.
--    Confirm another account can actually sign in before relying on it for
--    administrative recovery. A profile row alone cannot prove Auth access.
-- 9. Race two eligible administrators attempting to demote or deactivate each
--    other from separate READ COMMITTED transactions. Use a second request
--    started before the first commits to test the post-lock actor recheck.
--    Expect at most one change, an eligible administrator remaining, and
--    no receipt for the denied change. Check lock timeout when held.
-- 10. Repeat an operation ID with the same request and then with different
--     inputs. The exact replay returns its original outcome without a write.
--     A conflicting reuse fails. A new no-op has one explicit no_change
--     receipt and leaves the cutoff unchanged, including after replay.
-- 11. Check one private receipt per applied change or no-op. As an administrator
--     using the authenticated role, verify audit data cannot be read or mutated.
--     Verify the append-only trigger in a trusted isolated test. Force an audit
--     insert failure using a disposable fixture and confirm both profile state
--     and audit contents roll back. Test an explicit transaction rollback too.
-- 12. Check a real old session after role change, deactivation and reactivation.
--     A token refresh cannot restore access. Sign in again after the cutoff
--     and verify eligible access. Account for concurrent sign-ins separately.
-- 13. Recheck My Account, role-specific app permissions, Storage, and existing
--     audit triggers from the Step 7.3.2 regression plan.
--
-- The advisory lock is scoped to each database transaction. Future writers
-- affecting role, status, or the active admin set must use the same ordering:
-- global lock, recheck authenticated actor, target locks, mutation and receipt.
-- Future Edge callers should use the actor's verified user JWT. An Edge-only
-- check cannot enforce onboarding or activation prerequisites while the RPC
-- is reachable by authenticated admins. Store and enforce prerequisites in
-- trusted database state before exposing managed provisioning or Auth actions.
-- Keep external Auth calls outside this transaction. Use separate durable
-- operation records, retries and reconciliation linked by operation UUID.
-- This audit table records database outcomes and has no automatic retention.
-- Any future retention or access policy needs separate review.
