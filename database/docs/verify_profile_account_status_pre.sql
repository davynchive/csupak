-- Step 7.3.1 preflight. Read-only. Run against the approved, isolated TEST project.
-- Review the roster against authorized accounts in Supabase Auth by UUID.
-- The roster contains internal identifiers and names. Keep its output private.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

SELECT role, count(*) AS profile_count
FROM public.profiles
GROUP BY role
ORDER BY role;

-- The baseline does not store application account status.
SELECT count(*) FILTER (WHERE role = 'oswe_admin') AS administrator_profiles_to_review,
       NULL::bigint AS active_administrator_count_before_status_column
FROM public.profiles;

SELECT p.id, p.full_name, p.role, p.created_at, (u.id IS NOT NULL) AS has_auth_user
FROM public.profiles AS p
LEFT JOIN auth.users AS u ON u.id = p.id
ORDER BY p.role, p.full_name, p.id;

-- Save this result privately and compare it with the other verification run.
-- Run both in a quiet window because unrelated edits can change the digest and counts.
SELECT count(*) AS profile_count,
       encode(sha256(convert_to(coalesce(string_agg(
           jsonb_build_array(p.id, p.full_name, p.role, p.created_at AT TIME ZONE 'UTC')::text,
           E'\n' ORDER BY p.id
       ), ''), 'UTF8')), 'hex') AS original_profile_fields_sha256
FROM public.profiles AS p;

SELECT table_name, record_count
FROM (
    SELECT 'violations' AS table_name, count(*) AS record_count FROM public.violations
    UNION ALL SELECT 'violation_photos', count(*) FROM public.violation_photos
    UNION ALL SELECT 'violation_status_history', count(*) FROM public.violation_status_history
    UNION ALL SELECT 'complaint_status_history', count(*) FROM public.complaint_status_history
    UNION ALL SELECT 'call_slip_history', count(*) FROM public.call_slip_history
) AS counts
ORDER BY table_name;

SELECT a.attnum AS ordinal_position, a.attname AS column_name,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull AS not_null, pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS column_default
FROM pg_catalog.pg_attribute AS a
LEFT JOIN pg_catalog.pg_attrdef AS d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attrelid = 'public.profiles'::regclass AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum;

SELECT c.conrelid::regclass AS source_table, c.conname, c.convalidated,
       pg_catalog.pg_get_constraintdef(c.oid) AS definition
FROM pg_catalog.pg_constraint AS c
WHERE c.conrelid = 'public.profiles'::regclass OR c.confrelid = 'public.profiles'::regclass
ORDER BY c.conrelid::regclass::text, c.conname;

SELECT t.tgname, t.tgenabled, pg_catalog.pg_get_triggerdef(t.oid) AS definition
FROM pg_catalog.pg_trigger AS t
WHERE t.tgrelid = 'public.profiles'::regclass AND NOT t.tgisinternal
ORDER BY t.tgname;

SELECT pg_catalog.pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       c.relacl AS table_acl
FROM pg_catalog.pg_class AS c
WHERE c.oid = 'public.profiles'::regclass;

SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

SELECT r.rolname, r.rolsuper, r.rolbypassrls,
       pg_catalog.has_table_privilege(r.oid, 'public.profiles', 'SELECT') AS table_select,
       pg_catalog.has_table_privilege(
           r.oid, 'public.profiles', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'
       ) AS any_non_select_table_privilege,
       pg_catalog.has_any_column_privilege(r.oid, 'public.profiles', 'INSERT, UPDATE, REFERENCES')
           AS any_mutating_column_privilege
FROM pg_catalog.pg_roles AS r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY r.rolname;

SELECT r.rolname, a.attname AS column_name, a.attacl AS column_acl,
       pg_catalog.has_column_privilege(r.oid, a.attrelid, a.attnum, 'SELECT') AS can_select,
       pg_catalog.has_column_privilege(r.oid, a.attrelid, a.attnum, 'INSERT') AS can_insert,
       pg_catalog.has_column_privilege(r.oid, a.attrelid, a.attnum, 'UPDATE') AS can_update
FROM pg_catalog.pg_roles AS r
CROSS JOIN pg_catalog.pg_attribute AS a
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  AND a.attrelid = 'public.profiles'::regclass AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY r.rolname, a.attnum;

SELECT r.rolname, pg_catalog.has_function_privilege(r.oid, f.oid, 'EXECUTE') AS can_update_my_profile
FROM pg_catalog.pg_roles AS r
CROSS JOIN pg_catalog.pg_proc AS f
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  AND f.oid = to_regprocedure('public.update_my_profile(text)')
ORDER BY r.rolname;

COMMIT;
