# CSUPAK database inventory

Source: live `public` schema-only PostgreSQL dump dated 2026-11-22 (server 17.11; pg_dump 18.3). Counts below were independently counted from the uploaded SQL. The Storage and extension inventories are based on read-only SQL results provided by the project maintainer.

## Verified `public` schema counts

| Object type | Count |
|---|---:|
| Tables | 13 |
| Function signatures, including overloads and trigger functions | 14 |
| Triggers | 3 |
| Foreign keys | 17 |
| CHECK constraints | 12 |
| Unique constraints (excluding PKs) | 5 |
| Additional indexes (excluding PK/unique indexes) | 7 |
| Identity sequences | 12 |
| RLS-enabled tables | 13 |
| RLS policies | 34 |
| Views / materialized views | 0 |

**Note:** An earlier AI inspection report contained inconsistent interim counts. These values come from counting actual DDL statements in the uploaded dump. `profiles.id` is a UUID linked to `auth.users`, not an identity sequence.

## Tables

| Table | Purpose |
|---|---|
| `colleges` | College catalog; 7 reference records |
| `courses` | Academic program/course catalog; 30 reference records; references `colleges` |
| `semesters` | Semester catalog; 1 reference record |
| `students` | Student registry; references `courses` |
| `profiles` | App users' names/roles; primary key also references `auth.users` |
| `violations` | Student violations; references `students`, `semesters`, and `profiles` |
| `violation_photos` | File metadata for violation images; references `violations` and `profiles` |
| `violation_status_history` | Status audit trail, maintained by trigger |
| `complaints` | Complaint records, including separate complainant/complainee program fields |
| `complaint_access_settings` | Passkey hash configuration; **no seed data included** |
| `complaint_status_history` | Complaint status and notes audit trail, maintained by trigger |
| `call_slips` | Interview call slips tied to complaints |
| `call_slip_history` | Call slip status/schedule/remarks audit trail, maintained by trigger |

## Key relations and constraints

- `courses.college_id -> colleges.id`.
- `students.course_id -> courses.id`.
- `violations.student_id -> students.id`, `violations.semester_id -> semesters.id`, `violations.recorded_by -> profiles.id`.
- `violation_photos.violation_id -> violations.id`; `violation_photos.uploaded_by -> profiles.id`.
- `complaints.complainant_course_id -> courses.id` (ON DELETE RESTRICT); `complaints.complainee_course_id -> courses.id` (default NO ACTION).
- `call_slips.complaint_id -> complaints.id` (ON DELETE CASCADE), with unique `(complaint_id, call_number)`.
- Three history tables reference their parent records with ON DELETE CASCADE and `changed_by -> auth.users.id` with ON DELETE SET NULL.
- `profiles.id -> auth.users.id` with ON DELETE CASCADE.
- Complaint statuses: `Pending`, `On-going`, `Resolved`.
- Application roles: `oswe_admin`, `oswe_staff`, `security_office`.
- The `complaints_complainee_affiliation_check` enforces that an external affiliation is nonblank and cannot coexist with a complainee course ID, when the affiliation is provided. The RPC imposes stronger input validation for new complaints.

See `ERD.md` for the diagram.

## Function inventory

### Trigger functions
- `audit_call_slip_changes()` -> `call_slip_history`.
- `audit_complaint_status()` -> `complaint_status_history`.
- `audit_violation_status()` -> `violation_status_history`.

### RPC and helper functions
- `create_complaint(...)` — legacy 16-argument RPC.
- `create_complaint_v2(...)` — current 18-argument RPC for complainant and complainee program/affiliation.
- `get_complaint_report_sources_with_passkey(text)` — complainant-college report mapping.
- `get_complaint_report_sources_with_passkey_v2(text)` — complainee-college report mapping.
- `get_complaint_status_history_with_passkey(text, bigint)`.
- `get_complaints_with_passkey(text)`.
- `get_interview_complaint_summaries()`.
- `get_my_role()`.
- `update_complaint_status_with_passkey(text, bigint, text)`.
- `update_complaint_status_with_passkey(text, bigint, text, text)`.
- `verify_complaint_passkey(text)` — uses `extensions.crypt()`.

All 14 function signatures in the dump are `SECURITY DEFINER`. Review their privileges and `search_path` before promoting the baseline to another environment.

## Supabase-managed dependencies

- `auth.users` is referenced by foreign keys from `profiles` and the three history tables.
- `auth.uid()` is used for role/actor checks in functions and triggers.
- `extensions.crypt()` is used for passkey verification and requires `pgcrypto` in schema `extensions`.
- No custom noninternal triggers on `auth.users` were found by a live metadata query. The application's profile provisioning mechanism is **not established** by this inspection.
- Storage bucket `violation-photos` and `storage.objects` policies are documented separately.

### Extensions observed on the live project

| Extension | Schema | Version | Notes |
|---|---|---|---|
| `pgcrypto` | `extensions` | 1.3 | Used by passkey verification |
| `pg_stat_statements` | `extensions` | 1.11 | Monitoring; not known to be application-required |
| `plpgsql` | `pg_catalog` | 1.0 | Function language |
| `supabase_vault` | `vault` | 0.3.1 | Installed; app dependency not established |
| `uuid-ossp` | `extensions` | 1.1 | Installed; app dependency not established |

## Reference data

The isolated seed script includes 7 colleges, 30 programs/courses and the active `2026-2027 1st Semester` (2026-08-01 through 2026-12-31), with original numeric IDs. These are snapshot values, not a promise that the current academic catalog or active semester will remain unchanged.

## Baseline vs historical migration

The snapshot contains the `complainee_course_id` and `complainee_external_affiliation` columns, their foreign key and CHECK constraint, and the two v2 RPCs. `migrations/202611150001_complainee_fields.sql` is a historical change script; do not run it on a database reconstructed from this snapshot. A migration history table / versioning mechanism has not yet been established.
