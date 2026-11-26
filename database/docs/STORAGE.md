# Supabase Storage snapshot — 2026-11-22

Verified by read-only queries against `storage.buckets` and `pg_policies` supplied by the maintainer. **This file documents configuration; it does not create the bucket or policies.**

## Bucket

| Field | Live value |
|---|---|
| ID / name | `violation-photos` |
| Public | `false` (private) |
| File size limit | 2,097,152 bytes (2 MiB) |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp` |

## Policies on `storage.objects`

All three are **PERMISSIVE**, scoped to PostgreSQL role `authenticated`, and restricted to `bucket_id = 'violation-photos'`.

| Policy name | Operation | Application role condition |
|---|---|---|
| `Violation photos storage read` | SELECT | `get_my_role()` in (`security_office`, `oswe_staff`, `oswe_admin`) |
| `Violation photos storage upload` | INSERT | `get_my_role()` in (`security_office`, `oswe_staff`, `oswe_admin`) |
| `Violation photos storage delete` | DELETE | `get_my_role() = 'oswe_admin'` |

No UPDATE policy was returned by the query. This is a description of the policy list returned, not an exhaustive audit of Supabase Storage's other authorization pathways.

## Restore notes

- On a separate test Supabase project, create/configure the private bucket and re-establish equivalent policies only after security review.
- Bucket metadata and object policies are not part of the `public` schema dump.
- Image bytes and `storage.objects` rows are **not included**. Do not copy real violation photos into test environments without explicit authorization and a privacy plan.
- Recheck the current Storage configuration immediately before any production deployment or migration.

## Tested reconstruction procedure

In the empty test project, check `storage.buckets` and `pg_policies` for `storage.objects` first. Create the bucket using Storage > New bucket, with the settings above. Then run these policy statements in SQL Editor **only in the test project**, after confirming no conflicting policies exist:

```sql
CREATE POLICY "Violation photos storage read" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'violation-photos'
AND public.get_my_role() IN ('security_office','oswe_staff','oswe_admin'));
CREATE POLICY "Violation photos storage upload" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'violation-photos'
AND public.get_my_role() IN ('security_office','oswe_staff','oswe_admin'));
CREATE POLICY "Violation photos storage delete" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'violation-photos'
AND public.get_my_role() = 'oswe_admin');
```

The maintainer successfully created the bucket and these equivalent policy definitions and verified them against production. Actual file operations were not tested.
