-- Step 7.3.2. Read-only catalog checks for an approved CSUPAK-TEST review.
-- Run before and after applying 7.3.2. Save outputs privately for comparison.
-- No test credentials, passkeys, Auth session values, or application records
-- are returned. Catalog checks alone do not prove request-time authorization.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

-- Confirm the status migration and the managed session column shapes.
SELECT n.nspname, c.relname, a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull, pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS column_default
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_attribute AS a ON a.attrelid = c.oid
LEFT JOIN pg_catalog.pg_attrdef AS d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attnum > 0 AND NOT a.attisdropped
  AND ((n.nspname = 'public' AND c.relname = 'profiles')
       OR (n.nspname = 'auth' AND c.relname = 'sessions' AND a.attname IN ('id', 'user_id', 'created_at'))
       OR (n.nspname = 'auth' AND c.relname = 'users' AND a.attname IN ('id', 'is_anonymous')))
ORDER BY n.nspname, c.relname, a.attnum;

SELECT pg_catalog.pg_get_userbyid(f.proowner) AS helper_owner,
       owner_role.rolsuper OR owner_role.rolbypassrls
           OR (p.relowner = f.proowner AND NOT p.relforcerowsecurity) AS can_read_profiles_outside_rls,
       pg_catalog.has_schema_privilege(f.proowner, 'public', 'USAGE') AS public_schema_usage,
       pg_catalog.has_column_privilege(f.proowner, p.oid, 'id', 'SELECT')
           AND pg_catalog.has_column_privilege(f.proowner, p.oid, 'role', 'SELECT')
           AND pg_catalog.has_column_privilege(f.proowner, p.oid, 'is_active', 'SELECT')
           AND pg_catalog.has_column_privilege(f.proowner, p.oid, 'session_valid_after', 'SELECT')
           AS profile_columns_read,
       pg_catalog.has_schema_privilege(f.proowner, 'auth', 'USAGE') AS auth_schema_usage,
       pg_catalog.has_column_privilege(f.proowner, 'auth.sessions', 'id', 'SELECT') AS session_id_read,
       pg_catalog.has_column_privilege(f.proowner, 'auth.sessions', 'user_id', 'SELECT') AS session_owner_read,
       pg_catalog.has_column_privilege(f.proowner, 'auth.sessions', 'created_at', 'SELECT') AS session_creation_read,
       auth_sessions.relrowsecurity AS auth_sessions_rls_enabled,
       NOT auth_sessions.relrowsecurity OR owner_role.rolsuper OR owner_role.rolbypassrls
           OR (auth_sessions.relowner = f.proowner AND NOT auth_sessions.relforcerowsecurity)
           AS can_read_sessions_outside_rls,
       pg_catalog.has_column_privilege(f.proowner, auth_users.oid, 'id', 'SELECT')
           AND pg_catalog.has_column_privilege(f.proowner, auth_users.oid, 'is_anonymous', 'SELECT')
           AS auth_user_columns_read,
       NOT auth_users.relrowsecurity OR owner_role.rolsuper OR owner_role.rolbypassrls
           OR (auth_users.relowner = f.proowner AND NOT auth_users.relforcerowsecurity)
           AS can_read_auth_users_outside_rls
FROM pg_catalog.pg_proc AS f
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = f.proowner
JOIN pg_catalog.pg_class AS p ON p.oid = 'public.profiles'::regclass
JOIN pg_catalog.pg_class AS auth_sessions ON auth_sessions.oid = 'auth.sessions'::regclass
JOIN pg_catalog.pg_class AS auth_users ON auth_users.oid = 'auth.users'::regclass
WHERE f.oid = pg_catalog.to_regprocedure('public.get_my_role()');

-- Expect one restrictive eligibility gate per listed table after migration.
WITH expected(table_name) AS (
    VALUES ('call_slip_history'),
           ('call_slips'),
           ('colleges'),
           ('complaint_access_settings'),
           ('complaint_status_history'),
           ('complaints'),
           ('courses'),
           ('profiles'),
           ('semesters'),
           ('students'),
           ('violation_photos'),
           ('violation_status_history'),
           ('violations')
)
SELECT e.table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       p.permissive, p.roles, p.cmd, p.qual, p.with_check
FROM expected AS e
LEFT JOIN pg_catalog.pg_class AS c ON c.oid = pg_catalog.to_regclass('public.' || e.table_name)
LEFT JOIN pg_catalog.pg_policies AS p
    ON p.schemaname = 'public' AND p.tablename = e.table_name AND p.policyname = 'active_account_required'
ORDER BY e.table_name;

-- Compare the existing role policies, and inspect all overlapping Storage policies.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public' OR (schemaname = 'storage' AND tablename = 'objects')
ORDER BY schemaname, tablename, policyname;

SELECT id, public FROM storage.buckets WHERE id = 'violation-photos';

SELECT r.rolname, r.rolsuper, r.rolbypassrls, c.relname,
       pg_catalog.has_table_privilege(r.oid, c.oid, 'DELETE') AS table_delete,
       pg_catalog.has_table_privilege(r.oid, c.oid, 'TRUNCATE, TRIGGER, MAINTAIN') AS whole_table_privilege,
       pg_catalog.has_any_column_privilege(r.oid, c.oid, 'SELECT') AS column_select,
       pg_catalog.has_any_column_privilege(r.oid, c.oid, 'INSERT') AS column_insert,
       pg_catalog.has_any_column_privilege(r.oid, c.oid, 'UPDATE') AS column_update,
       pg_catalog.has_any_column_privilege(r.oid, c.oid, 'REFERENCES') AS column_references
FROM pg_catalog.pg_roles AS r
CROSS JOIN pg_catalog.pg_class AS c
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  AND c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
ORDER BY c.relname, r.rolname;

SELECT r.rolname, c.relname AS sequence_name,
       pg_catalog.has_sequence_privilege(r.oid, c.oid, 'SELECT, USAGE, UPDATE') AS sequence_access
FROM pg_catalog.pg_roles AS r
CROSS JOIN pg_catalog.pg_class AS c
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  AND c.relnamespace = 'public'::regnamespace AND c.relkind = 'S'
ORDER BY c.relname, r.rolname;

SELECT f.oid::regprocedure AS signature, pg_catalog.pg_get_userbyid(f.proowner) AS function_owner,
       f.prosecdef, f.provolatile, f.proconfig,
       pg_catalog.has_function_privilege('anon', f.oid, 'EXECUTE') AS anon_execute,
       pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE') AS authenticated_execute,
       pg_catalog.has_function_privilege('service_role', f.oid, 'EXECUTE') AS service_execute
FROM pg_catalog.pg_proc AS f
WHERE f.pronamespace = 'public'::regnamespace
ORDER BY f.oid::regprocedure::text;

-- Effective privileges for nested calls are those of the SECURITY DEFINER owner.
WITH dependencies(caller_signature, callee_signature) AS (
    VALUES
        ('public.create_complaint(text, text, timestamptz, text, text, text, text, text, text, text, text, text, date, text, text, bigint)', 'public.get_my_role()'),
        ('public.create_complaint_v2(text, text, timestamptz, text, text, text, text, text, text, text, text, text, date, text, text, bigint, bigint, text)', 'public.get_my_role()'),
        ('public.get_complaint_report_sources_with_passkey(text)', 'public.get_my_role()'),
        ('public.get_complaint_report_sources_with_passkey_v2(text)', 'public.get_my_role()'),
        ('public.get_complaint_status_history_with_passkey(text, bigint)', 'public.get_my_role()'),
        ('public.get_complaints_with_passkey(text)', 'public.get_my_role()'),
        ('public.get_interview_complaint_summaries()', 'public.get_my_role()'),
        ('public.update_complaint_status_with_passkey(text, bigint, text, text)', 'public.get_my_role()'),
        ('public.verify_complaint_passkey(text)', 'public.get_my_role()'),
        ('public.update_my_profile(text)', 'public.get_my_role()'),
        ('public.get_complaint_report_sources_with_passkey(text)', 'public.verify_complaint_passkey(text)'),
        ('public.get_complaint_report_sources_with_passkey_v2(text)', 'public.verify_complaint_passkey(text)'),
        ('public.get_complaint_status_history_with_passkey(text, bigint)', 'public.verify_complaint_passkey(text)'),
        ('public.get_complaints_with_passkey(text)', 'public.verify_complaint_passkey(text)'),
        ('public.update_complaint_status_with_passkey(text, bigint, text, text)', 'public.verify_complaint_passkey(text)'),
        ('public.update_complaint_status_with_passkey(text, bigint, text)', 'public.update_complaint_status_with_passkey(text, bigint, text, text)'),
        ('public.get_my_role()', 'auth.uid()'),
        ('public.get_my_role()', 'auth.jwt()'),
        ('public.verify_complaint_passkey(text)', 'extensions.crypt(text, text)')
)
SELECT d.caller_signature, d.callee_signature,
       pg_catalog.pg_get_userbyid(caller.proowner) AS caller_owner,
       caller.prosecdef,
       pg_catalog.has_schema_privilege(caller.proowner, callee.pronamespace, 'USAGE') AS owner_schema_usage,
       pg_catalog.has_function_privilege(caller.proowner, callee.oid, 'EXECUTE') AS owner_can_execute
FROM dependencies AS d
LEFT JOIN pg_catalog.pg_proc AS caller ON caller.oid = pg_catalog.to_regprocedure(d.caller_signature)
LEFT JOIN pg_catalog.pg_proc AS callee ON callee.oid = pg_catalog.to_regprocedure(d.callee_signature)
ORDER BY d.caller_signature, d.callee_signature;

SELECT t.tgname, t.tgenabled, f.oid::regprocedure AS trigger_function,
       pg_catalog.pg_get_userbyid(f.proowner) AS trigger_function_owner, f.prosecdef,
       pg_catalog.pg_get_triggerdef(t.oid) AS definition
FROM pg_catalog.pg_trigger AS t
JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
JOIN pg_catalog.pg_proc AS f ON f.oid = t.tgfoid
WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal
ORDER BY t.tgname;

-- Only one configured row is accepted. Inspect this count before rollout.
SELECT count(*) AS passkey_configuration_rows FROM public.complaint_access_settings;

-- Show format classes only. A matching shape does not prove the hash works.
SELECT hash_format, count(*) AS configuration_rows
FROM (
    SELECT CASE
        WHEN passkey_hash COLLATE pg_catalog."C" ~ '^[$]2[ax][$][0-9]{2}[$][./0-9A-Za-z]{53}$' THEN 'bcrypt-shaped'
        WHEN passkey_hash COLLATE pg_catalog."C" ~ '^[$]1[$][^$]{0,8}[$][./0-9A-Za-z]{22}$' THEN 'MD5-crypt-shaped'
        WHEN passkey_hash COLLATE pg_catalog."C" ~ '^_[./0-9A-Za-z]{19}$' THEN 'extended-DES-shaped'
        WHEN passkey_hash COLLATE pg_catalog."C" ~ '^[./0-9A-Za-z]{13}$' THEN 'DES-shaped'
        ELSE 'missing, malformed, or unsupported'
    END AS hash_format
    FROM public.complaint_access_settings
) AS formats
GROUP BY hash_format
ORDER BY hash_format;

COMMIT;

-- Runtime regression plan. Perform separately after approval on disposable TEST
-- data using real browser-role sessions. SQL Editor catalog tests are not a
-- substitute for signed-in API and Storage requests.
--
-- 1. Active admin/staff/security: compare existing CRUD against a pre-change
--    role matrix. Include semester reads, self-profile only, identity-backed
--    inserts, complaint create v1/v2, interview summaries, and role-specific
--    complaint/violation/call-slip operations. Confirm trigger audit entries.
-- 2. Inactive, no-profile, unauthenticated, and anonymous Auth: expect no
--    protected rows, writes, RPC results, or new photo access. Check both
--    empty-result and permission-denied conventions where relevant. Test
--    an anonymous identity with an otherwise eligible profile. In controlled
--    fixtures, check missing JWTs, explicit JSON null and malformed anonymity
--    flags, and older tokens with the flag absent for permanent and anonymous
--    identities. Verify real permanent-user JWTs against the hosted project.
-- 3. Preserve a real token before deactivation. Verify it stops working after
--    the status transaction commits. Reactivate a disposable account with a
--    cutoff and verify its old session remains denied before and after refresh.
--    A newly signed-in session should pass. Test cutoff equality, missing,
--    malformed, nonexistent, and wrong-owner session IDs in controlled test
--    fixtures. Verify a valid existing session with NULL cutoff still works.
-- 4. As active admin, test the patched verifier and all protected callers
--    with NULL, empty, whitespace-only, incorrect, and correct passkeys.
--    Use missing, empty, whitespace-only, malformed, unsupported, and duplicate
--    configurations. Include a bcrypt-shaped invalid-rounds fixture to check
--    the crypt error path. Compare with the confirmed existing hash format.
--    Cover both status overloads, including a NULL new status, and verify
--    rejected writes leave no changes.
--    For staff, security, and inactive admin, a correct test passkey does not
--    grant access. Restore the disposable configuration after testing.
-- 5. Test actual private Storage read and upload for all three active roles,
--    delete for admin only, and denied authorized requests for an old token
--    after deactivation. Confirm an already-issued URL keeps its own expiry.
-- 6. Check My Account for all active roles: trimmed valid name succeeds,
--    bad length fails, and other fields and users stay unchanged. Confirm
--    inactive, unassigned, and stale sessions cannot update the profile.
