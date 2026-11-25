# CSUPAK-TEST account access runtime tests

Step 7.3.4.5 tests the applied profile status, access enforcement, and administrative safeguards with real Auth, PostgREST, and Storage requests. Run it after approval, on the `development` branch, during a quiet TEST window. Use a VS Code PowerShell terminal with Node.js 22 or newer. The scripts need no packages, service credentials, or running frontend server.

## Preflight and test accounts

1. Open the **CSUPAK-TEST** dashboard. Copy its Project ID from Project Settings. Confirm it matches the saved configuration for `scripts/start-test.ps1`. If the local configuration is absent or stale, use that launcher's setup workflow and stop the local server before running the suite if it is unnecessary. Keep the ignored config local.
2. In the TEST dashboard, verify the approved backup is available, all three migrations passed catalog verification, `semesters` has a reference row, and `violation-photos` is private with the documented SELECT, INSERT, and DELETE policies. Use the existing `verify_profile_account_status_post.sql`, `verify_profile_account_access.sql`, and `verify_admin_account_safeguards.sql` for catalog reference. The pre-migration status script describes the original roster.
3. Verify the original active administrator is able to sign in and that **exactly one** active admin exists before the core suite. Record the working administrator's Auth UUID and the profileless fixture's UUID privately. If the roster differs, stop and review it.

   ```sql
   SELECT count(*) AS active_admins
   FROM public.profiles WHERE role = 'oswe_admin' AND is_active;
   ```

| Account | Use |
| --- | --- |
| Existing active OSWE Administrator | Real RPC caller and recovery account. Core tests attempt protected self-actions. Race mode only reads with this account. |
| Existing active OSWE Staff and Security Office | Sign-in, denial, and regression checks. My Account submits their existing name with surrounding whitespace. |
| Existing disposable permanent Auth user with no profile | Missing-profile assertions and an identity check for the audit script. Keep it profileless. |
| One new disposable permanent account with active `oswe_staff` profile | Core lifecycle, My Account change, and temporary role/status changes. Give its profile a name starting with `Runtime Access Fixture `. |
| Two additional disposable permanent accounts with active `oswe_admin` profiles | Race only. Give both profiles a name starting with `Runtime Admin Fixture `. Create them **after** completing the core run. |
| Optional disposable anonymous Auth identity | Created by the optional anonymous suite if the provider and existing CAPTCHA policy allow it. The suite pauses before testing with an active profile. |

In TEST Authentication > Users, create the permanent fixtures with their own local passwords and confirm them using the existing TEST administrator workflow. Use the TEST Table Editor or SQL Editor to insert each corresponding profile with the exact Auth UUID, named prefix above, supported role, and explicit `is_active = true`. Leave `session_valid_after` NULL on fresh fixtures. This is privileged fixture setup because the browser RPC rejects promotions to administrator. Confirm each UUID belongs to a newly created fixture before inserting and leave the working administrator untouched. Never change the role of the existing staff or Security Office accounts to prepare the race.

For a concrete profile insert, replace the placeholders only in the TEST SQL Editor. It inserts one new profile for a known permanent Auth UUID and fails on an existing profile.

```sql
INSERT INTO public.profiles (id, full_name, role, is_active)
VALUES ('<DISPOSABLE_TEST_AUTH_UUID>'::uuid, 'Runtime Access Fixture One', 'oswe_staff', true);
```

For the two race profiles, use `Runtime Admin Fixture A` and `Runtime Admin Fixture B` with `oswe_admin`. Check that the active-admin count is three before running the race.

## Execution and expected results

```powershell
$testRef = '<PROJECT_ID_FROM_CSUPAK_TEST_DASHBOARD>'
node .\scripts\test-account-access.mjs core $testRef
# Run once the core checks and their audit comparison have passed.
node .\scripts\test-account-access.mjs race $testRef
# Optional when TEST already allows this sign-in flow.
node .\scripts\test-account-access.mjs anonymous $testRef
```

Each suite requires the entered dashboard reference to match the ignored launcher config, rejects the production reference in `js/supabase.js`, checks the Auth service on that exact HTTPS host, and asks for explicit TEST confirmation before making requests. Supply Auth UUIDs and emails at the local prompts. Password entry is hidden. Failure messages identify the check and may show its HTTP status. Keep the separately printed fixture identifiers and audit input private. On failure, stop and reconcile TEST state before rerunning.

| Check | Expected result |
| --- | --- |
| Active accounts | Each password sign-in returns the expected Auth UUID and application role. The session sees its own profile and a semester row. An administrator's direct query for the fixture's profile returns no rows. |
| Unsigned API requests | Protected profile update, semester read, role RPC, Storage read, and administrator RPC are denied. |
| Missing profile, inactive profile, stale session | The role RPC returns NULL, profile and semester reads are empty, and protected RPCs return `42501`. Inactive and stale sessions cannot obtain new photo access. Auth can still sign in or refresh an existing session. |
| Anonymous Auth identity | If available, first run without a profile. At the pause, add an active `oswe_staff` profile called `Runtime Anonymous Fixture` for the exact anonymous UUID printed by the suite. Verify that row in TEST before continuing. The same real session must remain ineligible and the admin RPC must deny it. |
| Administrator authorization | The working administrator can change the disposable staff role, deactivate and reactivate the fixture, and return it to staff. Staff and Security Office both receive `42501` when trying to deactivate the fixture or change it from OSWE Staff to Security Office. A missing target returns `22023`. |
| Self-protection and last active admin | In the one-admin roster, self-deactivation and self-demotion return `42501` and produce no receipt. The self guard is the path exercised in this setup. The internal final-count error is unreachable through this single-admin scenario. |
| Administrator promotion | Even an active administrator receives `42501` when promoting a non-admin. |
| Session cutoff | Old sessions fail after a role change and status changes. Refresh preserves the old Auth session ID and still fails application checks. Fresh password sign-in after reactivation gets a different session ID and succeeds. |
| Direct table writes | Browser roles receive `42501` for direct profile INSERT and for DELETE and PATCH against the existing disposable fixture. The fixture also attempts to delete its own row and to patch its own full name, role, status, and cutoff. The final read confirms the same fixture row and values. |
| Operation IDs and no-op | The same ID and payload return the original outcome. Reusing the ID with different parameters returns `22023`. A new no-op returns `no_change`, preserves the cutoff, and produces exactly one receipt, including after replay. |
| Audit | The private schema refuses browser reads. The SQL check below confirms exact expected receipts and no receipt for denied operations. Authenticated direct SQL access is denied, and the owner trigger blocks UPDATE, DELETE, and TRUNCATE. |
| Concurrency | Two independent signed-in disposable admins send reciprocal deactivation requests concurrently. Exactly one applies and the other receives `42501`. The losing actor's retained session is ineligible and the working admin remains eligible. This exercises the observable concurrency result. Request arrival order is nondeterministic, so it does not prove that a particular call waited on the lock. |
| My Account and application RPC | All three roles can save their existing name via the trimming path. A one-character name is rejected. The disposable account can save and restore a different name. Interview summaries still work for admin and staff and deny Security Office and ineligible sessions. |
| Storage | All three roles upload a synthetic PNG, request a signed URL, and read back identical bytes. Staff and Security Office cannot remove their files. Admin can delete all test objects. Signed URLs issued before deactivation retain their existing expiry. The test checks issuance with current credentials. |
| Complaint passkey | An active admin gets `false` from verification and `42501` from the protected complaint read when no passkey is configured. A valid-passkey success path needs an approved TEST-only passkey fixture and is deferred. |

If TEST disables anonymous Auth or requires CAPTCHA that the terminal flow cannot satisfy, record that portion as skipped or blocked. Keep the current settings. The unsigned API test still runs in core. [Supabase anonymous Auth](https://supabase.com/docs/guides/auth/auth-anonymous)

The lifecycle test needs TEST Auth to retain the disposable account's earlier session across another sign-in. If TEST's session policy invalidates it at Auth instead, record that result separately from application cutoff enforcement. Report rate limits separately from authorization results.

After each successful suite with a receipt manifest, open [test_admin_account_audit.sql](test_admin_account_audit.sql) in the verified **CSUPAK-TEST SQL Editor** as the audit owner. Fill in the working-admin and profileless TEST UUIDs as a second target check, then paste only that run's JSON into `<EXPECTED_RECEIPTS_JSON>`. Run the entire transaction. Expect no errors and PASS notices where the client displays notices. Receipt mismatches raise an error. The append-only probes run inside the transaction and end with `ROLLBACK`. The owner trigger check briefly needs the audit-table lock for the TRUNCATE probe.

## Cleanup and reruns

1. Keep receipts and review failed suite output before changing fixtures. For race timeouts, reconcile both printed operation IDs and check both profiles before retrying. A timed-out request may already have committed. Start the next attempt with two newly signed-in active disposable administrators.
2. The core run sends only the recorded synthetic keys to the Storage delete endpoint. It requires confirmation for each key and a successful, empty listing of the run prefix. A missing confirmation, remaining object, or failed request leaves the run with exit code 1. If cleanup is unverified or interrupted, check the printed `violation-photos/runtime-account-access/<run UUID>/` prefix in the TEST Storage dashboard and delete any remaining objects there before deleting their owning Auth users.
3. On success, the core fixture is back in the staff role, active, and has its original name with an advanced cutoff. After audit checks, delete only the new runtime Auth fixtures, including both race accounts and any anonymous fixture. Their profiles should cascade from the Auth deletion under the existing foreign key. Keep the three original accounts and the pre-existing profileless fixture. Confirm the original administrator still signs in and the active admin count is one.
4. The client requests local logout for sessions it opened. If a logout fails or the process is interrupted, fixture deletion removes their sessions. For an original account's test session, let its JWT expire and use the authorized TEST Auth session controls if revocation is needed. Avoid signing out unrelated sessions.
5. Leave append-only audit receipts as evidence. For a fresh run create new disposable fixtures and use the new generated operation IDs. Do not paste credentials or the receipt manifest into a tracked file.

If either self-protection request unexpectedly succeeds, stop before starting the race. Use the verified TEST dashboard to inspect the working administrator by its recorded UUID and retain the relevant receipt. Review recovery with the project owner before resuming. Confirm fresh administrator sign-in and the original roster before restarting the suite.
