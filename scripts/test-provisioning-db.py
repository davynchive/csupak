"""Run the provisioning SQL tests in a throwaway PostgreSQL cluster without a listener."""

import argparse
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "migrations"
FIXTURE = """
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
    id uuid PRIMARY KEY, email text, is_anonymous boolean NOT NULL DEFAULT false,
    is_sso_user boolean NOT NULL DEFAULT false, deleted_at timestamptz,
    role text NOT NULL DEFAULT 'authenticated', email_confirmed_at timestamptz,
    raw_app_meta_data jsonb, email_change text
);
CREATE TABLE auth.identities (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, email text
);
CREATE TABLE auth.sessions (
    id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz, not_after timestamptz
);
CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text NOT NULL, role text NOT NULL CHECK (role IN ('oswe_admin', 'oswe_staff', 'security_office')),
    is_active boolean NOT NULL DEFAULT false, session_valid_after timestamptz
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.profiles TO authenticated;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
    $$ SELECT nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
"""


def source(path):
    return path.read_text(encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", type=Path, help="Directory containing initdb and postgres")
    args = parser.parse_args()
    bin_dir = args.pg_bin
    if bin_dir is None and (initdb_path := shutil.which("initdb")):
        bin_dir = Path(initdb_path).parent
    if bin_dir is None:
        bin_dir = Path(r"C:\Program Files\PostgreSQL\18\bin")
    initdb, postgres = (shutil.which(name, path=str(bin_dir)) for name in ("initdb", "postgres"))
    if not initdb or not postgres:
        parser.error("PostgreSQL binaries not found. Supply --pg-bin.")

    # Load the actual eligibility function. Fixture Auth functions only emulate
    # claims already verified by PostgREST in the hosted application.
    access = source(MIGRATIONS / "202611250002_enforce_profile_account_access.sql")
    role_helper = re.search(
        r"CREATE OR REPLACE FUNCTION public\.get_my_role\(\).*?\$get_my_role\$;", access, re.S
    ).group()
    policy = """
    CREATE POLICY active_account_required ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated
        USING ((SELECT public.get_my_role()) IS NOT NULL)
        WITH CHECK ((SELECT public.get_my_role()) IS NOT NULL);
    """
    phases = [FIXTURE + role_helper + policy]
    for file in (
        "202611250003_admin_account_safeguards.sql",
        "202611250004_admin_list_users.sql",
        "202611250005_admin_update_user_name.sql",
        "202611250006_account_provisioning_foundation.sql",
        "202611250007_provisioning_completion.sql",
        "202611250008_account_setup_state.sql",
        "202611250009_admin_password_recovery.sql",
        "202611260001_admin_user_management_views.sql",
        "202611260002_reuse_provisioned_email.sql",
    ):
        phases.append(source(MIGRATIONS / file))
    phases.append(source(ROOT / "database/docs/verify_provisioning_completion.sql"))
    phases.append(source(ROOT / "database/docs/verify_account_setup_state.sql"))
    phases.append(source(ROOT / "database/docs/verify_admin_password_recovery.sql"))
    phases.append(source(ROOT / "database/docs/verify_admin_user_management_views.sql"))
    phases.append(source(ROOT / "database/tests/provisioning_completion.sql"))
    phases.append(source(ROOT / "database/tests/admin_password_recovery.sql"))
    phases.append(source(ROOT / "database/tests/admin_user_management_views.sql"))
    phases.append(source(ROOT / "database/tests/reuse_provisioned_email.sql"))
    # postgres --single -j uses a blank line as a statement terminator.
    sql = "".join(re.sub(r"\n(?:[ \t]*\n)+", "\n", phase.strip()) + "\n\n" for phase in phases)

    with tempfile.TemporaryDirectory(prefix="csupak-provisioning-") as tmp:
        target = Path(tmp).resolve()
        assert target.parent == Path(tempfile.gettempdir()).resolve() and target.name.startswith("csupak-provisioning-")
        data = str(target / "data")
        initial = subprocess.run([initdb, "-D", data, "-U", "postgres", "-E", "UTF8",
                                  "--no-locale", "--no-sync", "-A", "trust"],
                                 capture_output=True, text=True, timeout=60)
        if initial.returncode:
            raise SystemExit(initial.stderr or initial.stdout)
        result = subprocess.run([postgres, "--single", "-j", "-D", data, "postgres"],
                                input=sql, capture_output=True, text=True, timeout=60)
        log = result.stdout + result.stderr
        markers = ('result = "PROVISIONING_TESTS_PASSED"', 'result = "PASSWORD_RECOVERY_TESTS_PASSED"',
                   'result = "MANAGEMENT_VIEWS_TESTS_PASSED"', 'result = "EMAIL_REUSE_TESTS_PASSED"')
        if result.returncode or re.search(r"\b(ERROR|FATAL|PANIC):", log) or any(marker not in log for marker in markers):
            raise SystemExit(result.stderr or log)
        print("PASS provisioning, password recovery, management views, email reuse and catalog checks")


if __name__ == "__main__":
    main()
