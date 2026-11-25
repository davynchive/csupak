-- Step 7.3.1: account status structure only. Access enforcement is a later step.
-- Keep real account UUIDs out of version control. In an approved execution
-- copy, populate the temporary roster below after reviewing the preflight.
-- Pause profile provisioning and edits while reviewing and applying the change.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE reviewed_profile_status (
    id uuid PRIMARY KEY,
    expected_role text NOT NULL,
    is_active boolean NOT NULL
) ON COMMIT DROP;

-- Supply one reviewed row per existing profile in the execution copy.
-- INSERT INTO pg_temp.reviewed_profile_status (id, expected_role, is_active)
-- VALUES (...);

LOCK TABLE public.profiles IN ACCESS EXCLUSIVE MODE;

DO $check_roster$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_temp.reviewed_profile_status
    ) THEN
        RAISE EXCEPTION 'Supply the reviewed profile roster before applying this migration';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.profiles AS p
        FULL JOIN pg_temp.reviewed_profile_status AS r ON r.id = p.id
        WHERE p.id IS NULL OR r.id IS NULL OR p.role IS DISTINCT FROM r.expected_role
    ) THEN
        RAISE EXCEPTION 'The reviewed roster must match every current profile UUID and role';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_temp.reviewed_profile_status
        WHERE is_active AND expected_role = 'oswe_admin'
    ) THEN
        RAISE EXCEPTION 'The reviewed roster must retain at least one active OSWE administrator';
    END IF;
END;
$check_roster$;

ALTER TABLE public.profiles
    ADD COLUMN is_active boolean NOT NULL DEFAULT false,
    ADD COLUMN session_valid_after timestamptz;

COMMENT ON COLUMN public.profiles.is_active IS
    'CSUPAK account status. New profiles start inactive pending provisioning and onboarding.';
COMMENT ON COLUMN public.profiles.session_valid_after IS
    'When set, application access requires an Auth session created strictly after this time. NULL leaves existing sessions without a cutoff. Enforcement is added separately.';

UPDATE public.profiles AS p
SET is_active = true
FROM pg_temp.reviewed_profile_status AS r
WHERE p.id = r.id AND r.is_active;

-- Table and column grants are separate. Keep authenticated reads subject to
-- the existing self-read policy and leave privileged server grants in place.
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES (id, full_name, role, created_at, is_active, session_valid_after)
    ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;

DO $check_privileges$
BEGIN
    IF NOT (
        SELECT relrowsecurity
        FROM pg_catalog.pg_class
        WHERE oid = 'public.profiles'::regclass
    ) THEN
        RAISE EXCEPTION 'Profiles row-level security must remain enabled';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles AS r
        WHERE r.rolname IN ('anon', 'authenticated')
          AND (
              r.rolsuper OR r.rolbypassrls
              OR pg_catalog.has_table_privilege(
                  r.oid, 'public.profiles', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'
              )
              OR pg_catalog.has_any_column_privilege(r.oid, 'public.profiles', 'INSERT, UPDATE, REFERENCES')
          )
    ) THEN
        RAISE EXCEPTION 'Unexpected effective profile privileges remain for a browser role';
    END IF;

    IF pg_catalog.has_any_column_privilege('anon', 'public.profiles', 'SELECT')
       OR NOT pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'SELECT')
    THEN
        RAISE EXCEPTION 'Unexpected effective profile read privileges for a browser role';
    END IF;
END;
$check_privileges$;

COMMIT;
