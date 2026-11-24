# Security review — snapshot, not remediation

This document records observations from the public schema dump and live read-only metadata queries. It is not a penetration test, an authorization test, or a guarantee that all data is secure. No production privileges or policies were modified; equivalent policies were created in the isolated test project.

## Application roles

`public.profiles.role` is constrained to `oswe_admin`, `oswe_staff`, or `security_office`.

Three RLS policies on `students`, `violation_photos`, and `violations` additionally mention `complaint_officer`, which the role constraint does not permit. Treat this as obsolete-policy documentation debt until the intended role model is confirmed. **Do not add the role without authorization.**

## RLS

All 13 public tables have RLS enabled. There are 34 policies in the uploaded dump. `complaint_access_settings` and `complaint_status_history` have zero direct RLS policies; `complaints` has no SELECT policy. Their authorized reads are intended to occur through protected `SECURITY DEFINER` functions. This behavior should be verified with real role-based tests in an isolated environment.

## Effective function EXECUTE privileges

Read-only `has_function_privilege` checks on the live project showed `anon` can execute these five function signatures:

- `create_complaint(...)`
- `create_complaint_v2(...)`
- `get_complaints_with_passkey(text)`
- `get_my_role()`
- `verify_complaint_passkey(text)`

The other nine function signatures were not executable by `anon` in that query. `authenticated` could execute all non-trigger functions. All functions in this schema are `SECURITY DEFINER`.

**Risk:** Execute privilege alone does not establish unauthorized data access, but relying only on internal role checks is broader than least privilege. Review and test both privileges and function logic before proposing revocations. The dump also includes broad default privileges for future objects; audit them in Phase 5.

## Sensitive data handling

- No student, complaint, violation, profile, auth, passkey-hash or image records are included in this package.
- A local scan of the uploaded dump found no COPY blocks, hardcoded credential patterns, private keys or obvious production literals. This is not an exhaustive secret scan; conduct a final manual review before publishing.
- The historical `supabase-backup/data.sql` is **sensitive** and should remain excluded from Git, shared ZIPs, and documentation. Protect existing local copies and verify retention/backup arrangements before moving them.
- The live passkey hash is not included; a test environment needs its own nonproduction passkey and approved initialization procedure.
- Do not commit `.env` files, connection strings, service-role keys, auth exports, student records, or violation photos.

## Deferred checks

1. Confirm profile provisioning and account lifecycle without custom `auth.users` triggers.
2. Review all `SECURITY DEFINER` functions for authorization, `search_path`, argument validation and error handling.
3. Extend the completed authentication, reference visibility and student visibility/INSERT smoke tests to all sensitive workflows and remaining CRUD operations. See VALIDATION.md.
4. Evaluate broad `anon` EXECUTE privileges and default ACLs, then propose separate, reviewed migrations.
5. Evaluate duplicate RLS policies and stale `complaint_officer` references.
6. Confirm private Storage access through actual application flows.

## Observed test behavior

Selected table and function grants matched production. All four synthetic accounts authenticated; the three supported roles could read reference data and the synthetic student, while the unassigned user could read only the semester among tested reference tables and could not see the student. Anonymous student visibility was zero. Security Office INSERT succeeded. Semester SELECT uses `USING (true)` for authenticated users. Permissive policies combine with OR; duplicate policies and stale roles require later review. No claim is made that all sensitive operations are secure.
