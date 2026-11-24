# Isolated database reconstruction checklist

The following sequence was exercised in CSUPAK-TEST, except where noted. Never execute these restore scripts on production or an existing application database.

## Preconditions

- [ ] Confirm authorization and select a new disposable Supabase project, not production.
- [ ] Confirm PostgreSQL compatibility (tested on 17.12; source 17.11), managed `public`, `auth.users`, `auth.uid()`, `storage.objects`, `storage.buckets`, required roles and `pgcrypto` in `extensions`.
- [ ] Ensure no application tables, Auth users or Storage objects exist. The script has guards but they are not a substitute for selecting the correct project.
- [ ] Keep production data and credentials out of the test project.

## Reconstruction

1. In the test SQL Editor, run the entire `schema/baseline_TEST_only.sql` script. It uses a transaction and preserves the target public schema owner and default ACLs. The original raw `schema/baseline.sql` is archival only. Stop on errors; do not blindly rerun.
2. Run structural checks from `docs/verify_read_only.sql`. Before seeding, expect zero reference rows. Compare the metadata against `VALIDATION.md`.
3. Run `seeds/reference_data.sql` only when all three reference tables are empty. Verify counts 7/30/1, zero orphan courses, three CCIS programs, one active semester and sequence values 7/30/1.
4. Follow `STORAGE.md` to create the private bucket and three policies. Verify metadata and policy expressions. Do not copy production images.
5. Create synthetic users via Authentication > Users > Add user > Create new user, with unique test passwords and email confirmation. For the three supported roles, insert a profile using the corresponding Auth UUID, fictional full name and role. Leave the fourth user without a profile. Never reuse production passwords.
6. Use authenticated API sessions with the test URL and publishable/anon key (never a service-role key) to repeat the smoke tests in `VALIDATION.md`. For student INSERT, use a unique fictional student ID and omit the generated numeric ID. Do not use elevated SQL Editor sessions to infer RLS behavior.
7. Record results and differences. Retain the isolated project for later security and application testing, or clean up synthetic data/accounts through approved test-only procedures. Do not transfer them to production.

## Deferred / not validated

Complaint passkey initialization, complaint and report RPC workflows, audit trigger behavior, Storage file operations, full CRUD authorization, complete metadata parity and end-to-end application behavior. See `VALIDATION.md` and `SECURITY.md`. The expanded verification query file is a convenience script assembled from checks; the combined file itself has not been executed as a unit.

## Migration policy

The baseline includes `migrations/202611150001_complainee_fields.sql`; retain but do not replay it after reconstruction. Future changes should use incremental reviewed migrations. No production migration-history mechanism was established in this phase.
