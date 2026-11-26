-- CSUPAK: READ-ONLY structural inventory queries.
-- Run only against an approved, isolated TEST Supabase project.
-- Does not check actual app authorization behavior or import any data.

SELECT 'tables' AS object_type, COUNT(*) AS object_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
UNION ALL
SELECT 'functions', COUNT(*)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
UNION ALL
SELECT 'triggers', COUNT(*)
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
UNION ALL
SELECT 'foreign_keys', COUNT(*)
FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public' AND c.contype = 'f'
UNION ALL
SELECT 'check_constraints', COUNT(*)
FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public' AND c.contype = 'c'
UNION ALL
SELECT 'rls_policies', COUNT(*)
FROM pg_policies WHERE schemaname = 'public';

SELECT 'colleges' AS table_name, COUNT(*) AS record_count FROM public.colleges
UNION ALL SELECT 'courses', COUNT(*) FROM public.courses
UNION ALL SELECT 'semesters', COUNT(*) FROM public.semesters;

SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
ORDER BY c.relname;

SELECT contype, count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype IN ('p','u') GROUP BY contype;
SELECT count(*) AS orphan_courses FROM public.courses c LEFT JOIN public.colleges k ON k.id=c.college_id WHERE k.id IS NULL;
SELECT count(*) AS active_semesters FROM public.semesters WHERE is_active;
SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' AND sequencename IN ('colleges_id_seq','courses_id_seq','semesters_id_seq') ORDER BY sequencename;
SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' OR (schemaname='storage' AND tablename='objects') ORDER BY schemaname,tablename,policyname;
SELECT id,name,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='violation-photos';
SELECT p.proname,pg_get_function_identity_arguments(p.oid),p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute FROM pg_proc p WHERE p.pronamespace='public'::regnamespace ORDER BY 1,2;
SELECT c.relname,has_table_privilege('anon',c.oid,'SELECT') AS anon_select,has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,has_table_privilege('authenticated',c.oid,'INSERT') AS authenticated_insert,has_table_privilege('authenticated',c.oid,'UPDATE') AS authenticated_update,has_table_privilege('authenticated',c.oid,'DELETE') AS authenticated_delete,has_table_privilege('service_role',c.oid,'SELECT') AS service_select FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' ORDER BY 1;
