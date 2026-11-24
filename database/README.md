# CSUPAK database baseline — Phase 3

**Status: reconstructed in CSUPAK-TEST; selected functional checks passed. Not a full backup or production deployment approval.**

Source snapshot: 2026-11-22, PostgreSQL 17.11 / pg_dump 18.3. Isolated target: PostgreSQL 17.12. Verification is based on maintainer-reported SQL and authenticated API results through 2026-11-24.

| Path | Purpose |
|---|---|
| `schema/baseline.sql` | Unmodified historical public schema-only dump; archive, not the SQL Editor restore script |
| `schema/baseline_TEST_only.sql` | Exact adapted script successfully executed in the isolated test project; original pre-test header retained for byte fidelity |
| `seeds/reference_data.sql` | Tested academic reference seed (7 colleges, 30 programs, 1 semester) |
| `docs/DATABASE.md` | Schema inventory and dependencies |
| `docs/ERD.md` | Entity relationships |
| `docs/SECURITY.md` | Existing permissions, verified behavior and deferred risks |
| `docs/STORAGE.md` | Bucket setup and tested policy definitions |
| `docs/RESTORE_CHECKLIST.md` | Isolated reconstruction procedure |
| `docs/VALIDATION.md` | Actual verification results and limitations |
| `docs/verify_read_only.sql` | Read-only metadata and reference checks |
| `manifest.json` | Snapshot metadata and file hashes |

## Start here

Follow `docs/RESTORE_CHECKLIST.md` in a new, empty, isolated Supabase project. Use `schema/baseline_TEST_only.sql`, not the raw archive, in SQL Editor. Do not execute either schema script or the seed on production. Do not reapply `migrations/202611150001_complainee_fields.sql`: its changes are already present. Retain historical migrations and backups separately; do not commit sensitive data backups.

## Scope and limitations

- Public schema only; managed Auth, Storage and extension schemas must already exist. `pgcrypto` in `extensions` is required.
- The adapted script omits psql-only commands, public schema creation/ownership and source default ACLs. Target default privileges are not certified equivalent. Existing object grants are retained; selected effective grants matched in testing.
- No production rows, auth accounts, passkey hashes or images are included. Only academic reference data is seeded; timestamps are regenerated and semester status is a snapshot.
- Storage configuration must be recreated separately. Test accounts and passkey initialization are separate from schema restoration.
- This package preserves existing security behavior, including known concerns. It is not a security certification, full disaster recovery backup or end-to-end application test.
- Do not commit secrets, production data, local test credentials or sensitive historical backups. Review repository visibility and staged files before publishing.
