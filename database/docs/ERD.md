# CSUPAK entity-relationship diagram

Derived from the 17 foreign-key constraints in the live public schema dump. `auth.users` is Supabase-managed and is **not** defined by `baseline.sql`. This diagram shows relationships, not every table column or every constraint.

```mermaid
erDiagram
    AUTH_USERS ||--o| PROFILES : id
    AUTH_USERS ||--o{ CALL_SLIP_HISTORY : changed_by
    AUTH_USERS ||--o{ COMPLAINT_STATUS_HISTORY : changed_by
    AUTH_USERS ||--o{ VIOLATION_STATUS_HISTORY : changed_by

    COLLEGES ||--o{ COURSES : college_id
    COURSES ||--o{ STUDENTS : course_id
    COURSES ||--o{ COMPLAINTS : complainant_course_id
    COURSES ||--o{ COMPLAINTS : complainee_course_id

    STUDENTS ||--o{ VIOLATIONS : student_id
    SEMESTERS ||--o{ VIOLATIONS : semester_id
    PROFILES ||--o{ VIOLATIONS : recorded_by
    VIOLATIONS ||--o{ VIOLATION_PHOTOS : violation_id
    PROFILES ||--o{ VIOLATION_PHOTOS : uploaded_by
    VIOLATIONS ||--o{ VIOLATION_STATUS_HISTORY : violation_id

    COMPLAINTS ||--o{ COMPLAINT_STATUS_HISTORY : complaint_id
    COMPLAINTS ||--o{ CALL_SLIPS : complaint_id
    CALL_SLIPS ||--o{ CALL_SLIP_HISTORY : call_slip_id

    AUTH_USERS {
        uuid id PK
    }
    PROFILES {
        uuid id PK,FK
        text full_name
        text role
    }
    COLLEGES {
        bigint id PK
        text college_code
        text college_name
    }
    COURSES {
        bigint id PK
        bigint college_id FK
        text course_code
        text course_name
    }
    SEMESTERS {
        bigint id PK
        text name
        date start_date
        date end_date
    }
    STUDENTS {
        bigint id PK
        text student_id
        bigint course_id FK
    }
    VIOLATIONS {
        bigint id PK
        bigint student_id FK
        bigint semester_id FK
        uuid recorded_by FK
    }
    VIOLATION_PHOTOS {
        bigint id PK
        bigint violation_id FK
        uuid uploaded_by FK
        text file_path
    }
    VIOLATION_STATUS_HISTORY {
        bigint id PK
        bigint violation_id FK
        uuid changed_by FK
    }
    COMPLAINTS {
        bigint id PK
        bigint complainant_course_id FK
        bigint complainee_course_id FK
        text complainee_external_affiliation
    }
    COMPLAINT_STATUS_HISTORY {
        bigint id PK
        bigint complaint_id FK
        uuid changed_by FK
    }
    CALL_SLIPS {
        bigint id PK
        bigint complaint_id FK
        int call_number
    }
    CALL_SLIP_HISTORY {
        bigint id PK
        bigint call_slip_id FK
        uuid changed_by FK
    }
    COMPLAINT_ACCESS_SETTINGS {
        bigint id PK
        text passkey_hash
    }
```

`COMPLAINT_ACCESS_SETTINGS` has no foreign-key relationship to other public tables. Optional foreign keys are represented schematically; inspect `baseline.sql` for exact nullability and deletion behavior.
