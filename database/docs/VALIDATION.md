# Phase 3 reconstruction validation

Evidence: maintainer-reported SQL Editor outputs and authenticated API smoke-test logs from CSUPAK-TEST; no independent database connection by the document author. Production was inspected read-only. Test changes were isolated. This is a scoped reconstruction validation, not a comprehensive security audit.

## Structural and reference checks

| Check | Observed test result |
|---|---|
| PostgreSQL | 17.12 (source 17.11) |
| Tables / function signatures / triggers | 13 / 14 / 3 |
| Foreign keys / CHECK / primary keys / unique constraints | 17 / 12 / 13 / 5 |
| RLS-enabled / forced-RLS tables | 13 / 0 |
| Public RLS policies | 34, all permissive and scoped to authenticated |
| Reference rows (colleges / courses / semesters) | 7 / 30 / 1 |
| Orphan courses / CCIS programs / active semesters / CCIS reference | 0 / 3 / 1 / 1 |
| Reference sequence last values | 7 / 30 / 1 |
| Storage bucket | private, 2097152 bytes, JPEG/PNG/WebP |
| Storage policies | SELECT and INSERT for three roles; DELETE for admin only |
| Function privileges | 14 signatures, 5 anon-executable; 3 trigger functions not directly executable by checked roles; recorded production results matched |
| Table privileges | All 78 checked values across 13 tables matched production (anon SELECT, authenticated SELECT/INSERT/UPDATE/DELETE, service_role SELECT) |

Public policy names, operations and expressions were inspected; no automated exact comparison of all schema definitions was performed. Index and total identity sequence counts in DATABASE.md describe the source dump; not independently recounted on the target. Default ACLs, full grants and ownership parity are not certified.

## Authenticated smoke tests

| Account | Auth | Role | Colleges | Courses | Semesters | Synthetic student visible |
|---|---|---|---:|---:|---:|---:|
| OSWE Admin | Success | oswe_admin | 7 | 30 | 1 | 1 |
| OSWE Staff | Success | oswe_staff | 7 | 30 | 1 | 1 |
| Security Office | Success | security_office | 7 | 30 | 1 | 1 |
| Unassigned | Success | null | 0 | 0 | 1 | 0 |
| Anonymous | No session | Not tested | Not tested | Not tested | Not tested | 0 |

Security Office successfully inserted one fictional student (`CSUPAK-RLS-TEST-001`, generated ID 1, year level 1) through the authenticated API. Student identity, unique ID, course foreign key and year-level constraint definitions were inspected; negative constraint tests were not performed. The synthetic record and four accounts were retained for later tests; cleanup not yet verified.

## Deferred to Phases 5 and 6

- Student UPDATE/DELETE authorization and remaining negative INSERT tests.
- Full complaint, violation, call-slip, audit, passkey and reporting workflows.
- Storage upload/read/delete runtime authorization and file restrictions.
- Full application integration, performance and security review, default ACLs and comprehensive schema parity.

Phase 3 scope: demonstrate reconstruction and selected basic behavior, document known gaps and prepare version-controlled artifacts. Repository integration is a separate pending action.
