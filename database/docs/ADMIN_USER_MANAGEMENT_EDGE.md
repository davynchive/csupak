# Administrator authorization Edge Function

The `admin-user-management` Edge Function supports `check_access`, `list_users`, `change_role`, `set_status`, `update_name`, `create_user`, `resend_setup_email`, and `request_password_reset`.

| File | Purpose |
| --- | --- |
| `supabase/config.toml` | Minimal local CLI configuration with gateway JWT verification enabled. |
| `supabase/functions/admin-user-management/index.ts` | Deno entry point and environment wiring. |
| `supabase/functions/admin-user-management/handler.ts` | HTTP handling and request-scoped Supabase Auth and PostgREST calls. |
| `supabase/functions/admin-user-management/list-users.ts` | Roster request and response validation. |
| `supabase/functions/admin-user-management/account-access.ts` | Name, role, and status request validation, RPC outcome validation, and error mapping. |
| `supabase/functions/admin-user-management/provisioning.ts` | Provisioning request validation, Auth reconciliation, and setup email orchestration. |
| `supabase/functions/admin-user-management/handler.test.mjs` | Offline tests with mocked upstream responses. |
| `migrations/202611250004_admin_list_users.sql` | Administrator-only roster RPC. |
| `database/docs/verify_admin_list_users.sql` | Read-only roster RPC catalog checks. |
| `migrations/202611250005_admin_update_user_name.sql` | Administrator name update RPC and private name audit receipts. |
| `database/docs/verify_admin_update_user_name.sql` | Read-only name update RPC and audit catalog checks. |
| `migrations/202611250006_account_provisioning_foundation.sql` | Private provisioning reservations, activation gate, and operation-ID guards. |
| `database/docs/verify_account_provisioning_foundation.sql` | Read-only provisioning catalog checks. |
| `migrations/202611250007_provisioning_completion.sql` | Provisioning claims, trusted reconciliation, email results, and self-service completion. |
| `database/docs/verify_provisioning_completion.sql` | Read-only catalog checks for the new RPCs, private ledger, and activation gate. |
| `migrations/202611250008_account_setup_state.sql`, `database/docs/verify_account_setup_state.sql` | Read-only setup eligibility RPC and catalog checks. |
| `pages/account-setup.html`, `js/account-setup.mjs`, `js/account-setup-flow.mjs` | Recipient setup page and isolated Auth flow. |
| `scripts/account-setup.test.mjs` | Mocked account setup and shared client checks. |
| `migrations/202611250009_admin_password_recovery.sql`, `database/docs/verify_admin_password_recovery.sql` | Administrator recovery request ledger, RPCs, and catalog checks. |
| `supabase/functions/admin-user-management/password-recovery.ts`, `supabase/functions/admin-user-management/auth-mail.ts` | Administrator reset orchestration and shared Auth recovery dispatch. |
| `pages/reset-password.html`, `js/reset-password.mjs`, `js/forgot-password.mjs`, `js/password-recovery-flow.mjs`, `js/recovery-shared.mjs` | Password reset page, login recovery form, and shared isolated recovery logic. |
| `scripts/test-provisioning-db.py`, `database/tests/provisioning_completion.sql` | Local PostgreSQL runner and synthetic provisioning tests. |
| `.gitignore` | Excludes Supabase CLI state and local Supabase environment files. |

The repository-local CLI reports version **2.119.0**. The Settings page loads `supabase-js@2.119.2` in the browser. The Edge Function calls Supabase Auth and PostgREST directly using built-in `fetch`. The root `migrations/` remains the source of database migrations.

## Configuration

| Variable | Source and format |
| --- | --- |
| `SUPABASE_URL` | Hosted Edge runtime. API base URL of the project. |
| `SUPABASE_PUBLISHABLE_KEYS` | Hosted Edge runtime. JSON object with the publishable API key under `default`. |
| `SUPABASE_SECRET_KEYS` | Hosted Edge runtime. JSON object with the secret API key under `default`. Required for provisioning actions. |
| `ADMIN_USER_MANAGEMENT_ALLOWED_ORIGINS` | Edge Function environment setting. Comma-separated exact origins. Use `http://127.0.0.1:8765` for the current TEST frontend. |
| `ADMIN_USER_MANAGEMENT_SETUP_REDIRECT_URL` | Fixed absolute setup callback URL. Use `http://127.0.0.1:8765/pages/account-setup.html` for the local TEST frontend. Add the same URL to the TEST Auth redirect allowlist. Use an explicitly approved HTTPS URL for any hosted frontend. |
| `ADMIN_USER_MANAGEMENT_PASSWORD_RESET_REDIRECT_URL` | Fixed absolute recovery callback URL. Use `http://127.0.0.1:8765/pages/reset-password.html` for the local TEST frontend. Add the exact URL to the TEST Auth redirect allowlist. A hosted value must use HTTPS and end in `/pages/reset-password.html`. |

The caller client continues to use the publishable key and caller JWT. Only provisioning initializes the privileged client. It sends the hosted secret in the `apikey` header for Auth administration and the two service RPCs. The public recovery endpoint uses the publishable key without an administrator session or PKCE verifier. Missing or invalid provisioning configuration returns a sanitized `503` for those actions and leaves the existing actions available. [Supabase Edge environment variables](https://supabase.com/docs/guides/functions/secrets) · [Supabase API key headers](https://supabase.com/docs/guides/getting-started/api-keys)

## Authorization

1. The gateway checks credentials with `verify_jwt = true`. The handler independently requires a bearer JWT. A publishable key alone does not authorize a request. [Gateway authorization](https://supabase.com/docs/guides/functions/auth-headers)
2. The caller client sends that JWT and the configured publishable key to `GET /auth/v1/user`. It requires a verified authenticated user with `is_anonymous = false`.
3. The same client calls `POST /rest/v1/rpc/get_my_role` with an empty JSON object. Only the exact result `oswe_admin` grants access. The applied RPC returns NULL for an inactive or missing profile or a stale session after a cutoff. See [the migration](../../migrations/202611250002_enforce_profile_account_access.sql).
4. Send `POST` with `Content-Type: application/json` and `{"action":"check_access"}`. A successful response is `{"success":true,"data":{"authorized":true}}`. Errors use stable codes inside `{"success":false,"error":{"code":"…"}}`. Handler responses set `Cache-Control: no-store`. Browser CORS uses an exact allowlist. Requests without an Origin still undergo authentication and administrator authorization.

## List users

Send `POST` with `Content-Type: application/json`. Only `action` is required.

```json
{"action":"list_users","search":"example","role":"oswe_staff","isActive":false,"limit":20}
```

| Field | Accepted value |
| --- | --- |
| `search` | Up to 200 characters. Case-insensitive literal substring in the name or current email. An empty string applies no search. |
| `role` | `oswe_admin`, `oswe_staff`, or `security_office`. |
| `isActive` | Boolean. Omit it to include both active and inactive accounts. |
| `cursor` | UUID from the previous page's `nextCursor`. Omit it for the first page. |
| `limit` | Integer from 1 to 100. Defaults to 20. |

The roster is ordered by ascending UUID. Use the same filters for every page and omit the cursor when filters change. A null cursor means the last page has been reached. Each page reflects the roster at the time of its request.

```json
{
    "success": true,
    "data": {
        "users": [
            {
                "id": "22222222-2222-4222-8222-222222222222",
                "fullName": "Example Staff",
                "email": "staff@example.invalid",
                "role": "oswe_staff",
                "isActive": false
            }
        ],
        "nextCursor": null
    }
}
```

The empty page is `{"success":true,"data":{"users":[],"nextCursor":null}}`. A profiled Auth account without an email has `email: null`. Profileless Auth accounts are excluded. Unexpected fields, explicit null filter values, and invalid types return `400`. The roster RPC rechecks eligibility with the same JWT used by the handler. Authorization denials return `403`. Upstream errors and unexpected response shapes return a sanitized `503`.

## Role and status changes

Send one of the following JSON bodies using the same authenticated `POST` endpoint. Supply a non-nil UUID for both `operationId` and `userId`. Generate a new operation ID for each new intent.

```json
{
    "action": "change_role",
    "operationId": "44444444-4444-4444-8444-444444444444",
    "userId": "22222222-2222-4222-8222-222222222222",
    "role": "security_office"
}
```

```json
{
    "action": "set_status",
    "operationId": "55555555-5555-4555-8555-555555555555",
    "userId": "22222222-2222-4222-8222-222222222222",
    "isActive": false
}
```

`change_role` accepts `oswe_staff` and `security_office`. `set_status` accepts a Boolean. Both reject unexpected fields. The actions require the [Step 7.3 administrative safeguard migration](../../migrations/202611250003_admin_account_safeguards.sql). The Edge handler calls `admin_change_account_access` using the caller's JWT. The RPC enforces the current policy for existing administrator accounts, including self-protection and preservation of an active administrator. An applied change advances the target's session cutoff. After reactivation the target must sign in again.

```json
{"success":true,"data":{"operationId":"44444444-4444-4444-8444-444444444444","outcome":"applied"}}
```

The only outcomes are `applied` and `no_change`. Replaying the same operation returns its original outcome without another write or audit receipt. A replay can describe an earlier result even if the target has changed since.

| HTTP | Error code | Meaning |
| --- | --- | --- |
| 400 | `invalid_parameters` | Wrong fields, types, or values. |
| 401 | `invalid_access_token` | Session authentication failed. |
| 403 | `access_denied` | The caller or requested change failed authorization or a safeguard. |
| 404 | `profile_not_found` | The target has no profile. |
| 409 | `operation_id_conflict` | The operation ID was already used for a different request. |
| 409 | `last_active_administrator` | The required active administrator would be lost. |
| 409 | `onboarding_required` | The provisioned profile must complete onboarding before activation. |
| 503 | `operation_busy` | The database reported lock contention. |
| 503 | `operation_outcome_unknown` | The mutation response did not establish whether it committed. |
| 503 | `service_unavailable` | Authentication or authorization could not be verified, or the RPC reported a known service failure. |

The existing RPC shares one SQLSTATE between invalid parameters, operation ID conflicts, and missing profiles. The handler uses the RPC's fixed messages internally to distinguish them. Response bodies contain only the sanitized error code. [PostgREST error format](https://docs.postgrest.org/en/stable/references/errors.html)

**Retry with the same operation ID, identical parameters, and the same administrator account.** If the response is lost or the outcome is unknown, the database may already have committed. Keep the original request even if a new sign-in is needed. The Edge Function makes one mutation call per request. A new operation ID represents a new request and can create a separate receipt.

## Edit a user's full name

```json
{
    "action": "update_name",
    "operationId": "77777777-7777-4777-8777-777777777777",
    "userId": "22222222-2222-4222-8222-222222222222",
    "fullName": "Updated Full Name"
}
```

Use non-nil UUIDs. The Edge handler and the SQL RPC trim surrounding spaces as My Account does in PostgreSQL and require 2–100 characters. Both active and inactive profiles are eligible targets. The handler calls `admin_update_user_name(uuid, uuid, text)` with the caller's JWT. The RPC updates only `profiles.full_name`, preserving role, status, Auth email, and session cutoff.

A successful response uses the same `operationId` and `applied` or `no_change` format as role and status changes. The same error mapping applies. Replay compares the normalized name, the target, and the authenticated administrator. If the outcome is unknown, retain the same operation ID and original request for a retry.

The [name update migration](../../migrations/202611250005_admin_update_user_name.sql) requires the existing role/status RPC and audit owner. It stores previous and resulting names in a separate private append-only table, `csupak_private.admin_user_name_audit`. This keeps the role/status constraints and receipts intact. Both RPCs serialize with the existing account-access lock. The name RPC checks role/status receipts and a new insert trigger checks name receipts on the role/status audit table. Conflicting IDs are rejected in either direction. The name write and receipt commit together. Keep name receipts private.

## Provisioning foundation

The database foundation adds `public.admin_reserve_account_provisioning(uuid, text, text, text)`. It requires the caller's authenticated JWT and an eligible administrator role, then rechecks eligibility under the existing advisory lock. It reserves a UUID for an `oswe_staff` or `security_office` account and stores the actor, normalized email and name, requested role, progress, and timestamps in `csupak_private.account_provisioning`. The reservation itself creates neither an Auth user nor a profile.

Retry the same reservation as the same eligible administrator with the same operation ID and normalized parameters. It returns the reserved UUID and current progress. A different request using that ID, including a name, role, or status operation, conflicts in either direction. A second operation for the same normalized email also conflicts. The reservation does not establish that an email is available in Auth. Retain reservations to preserve replay protection. Cancellation, reassignment, and email reuse need a reviewed policy before supporting those workflows.

The profile trigger requires a reserved UUID's new profile to start inactive with the requested role. It blocks direct RPC activation while `onboarding_completed_at` is NULL. An existing profile with no reservation follows the existing behavior. Completing onboarding will leave the profile inactive until an eligible administrator activates it through the existing audited RPC. The target must then sign in again under the existing session cutoff.

### Verified hosted Auth behavior

- Hosted Auth accepted a caller-supplied reserved UUID, no password, `email_confirm=false`, and a server-controlled operation marker in `app_metadata`. The account started unconfirmed. Independent lookup matched the reserved UUID and marker.
- Recovery email worked for the initially unconfirmed account. Code verification confirmed the address and established an `otp` session. Recovery refresh preserved the session ID, creation timestamp, AMR method, and AMR timestamp. Token issuance and the session update timestamp advanced.
- The recipient set their own password in the recovery session. Fresh password sign-in created a distinct `password` session. Its refresh preserved the session ID, creation timestamp, AMR method, and AMR timestamp. The original recovery session row remained present after password setup and fresh sign-in.
- Ordinary email OTP sign-in created a separate `otp` session. Ordinary OTP refresh was **not verified**.
- Gmail custom SMTP delivery started working after the port was corrected from `586` to `587`. One recovery request timed out with an uncertain outcome. The disposable account and all its sessions were removed. TEST returned to 4 Auth users, 3 profiles, 1 active administrator, and 0 Storage objects. The temporary code-based templates were replaced with reconstructed link-based templates using the original wording, since the exact original HTML was unavailable. Working custom SMTP remains enabled in TEST.

See the [hosted Auth compatibility record](AUTH_COMPATIBILITY_TEST.md) for the evidence boundaries and rerun procedure. The experiment covered code-based setup. Browser callback and end-to-end application onboarding remain to be verified.

### Database provisioning contracts

All four new RPCs are in `public`. The ledger and helper functions stay in `csupak_private`. Database mutations use the existing advisory lock before changing state and require READ COMMITTED. The migration requires the ledger owner and checks access to the managed Auth columns it uses.

| RPC | EXECUTE | Contract |
| --- | --- | --- |
| `admin_claim_provisioning_step(p_operation_id uuid, p_step text, p_resend boolean DEFAULT false) → jsonb` | `authenticated`, internally limited to the eligible administrator who reserved the operation | For `auth`, marks `auth_outcome_unknown` before the external request. Returns `claimed` with the reserved UUID and email, `auth_outcome_unknown` while the 60-second claim is recent, or `profile_ready` after reconciliation. For `email`, checks that the matching profile is inactive and setup is pending. A new claim returns `claimed`, the email, reserved UUID, and an attempt UUID. Without explicit resend, repeated calls return the current email state. Explicit resends observe a 60-second cooldown. Completion returns `onboarding_complete` and suppresses a new claim. |
| `reconcile_provisioned_auth_account(p_operation_id uuid) → text` | `service_role` | Requires a prior Auth claim. Checks the managed Auth record by reserved UUID, normalized email, permanent non-SSO identity, and server-controlled marker. A match inserts the reserved inactive profile and records `profile_ready` and `profile_ready_at` in one transaction. Repeats return `profile_ready` for the completed stage. A missing Auth UUID returns `auth_not_found`. A conflicting identity or pre-existing profile fails without attaching or overwriting it. |
| `record_provisioning_email_outcome(p_operation_id uuid, p_attempt_id uuid, p_outcome text) → text` | `service_role` | Records `requested`, `not_requested`, or `outcome_unknown` for the current attempt UUID. Replaying the same result is safe. Stale attempts and contradictory final results are rejected. An acknowledgement is not proof of inbox delivery. |
| `complete_account_onboarding() → text` | `authenticated`, internally restricted to the target with valid session evidence | Returns `completed` or `already_completed` for an eligible inactive target. Updates only the private completion timestamp. After activation the inactive-profile requirement rejects further completion calls. |

### Provisioning Edge requests

Submit `POST` with the existing authentication and CORS requirements. Use one operation UUID for the entire creation attempt.

```json
{
    "action": "create_user",
    "operationId": "77777777-7777-4777-8777-777777777777",
    "fullName": "Example Staff",
    "email": "staff@example.invalid",
    "role": "oswe_staff"
}
```

`role` accepts `oswe_staff` or `security_office`. The function trims surrounding spaces, lowercases the email, and checks the name length and email format before calling the reservation RPC. Use the original operation ID and same normalized inputs when retrying. An explicit resend accepts only the action and original operation ID. The database supplies the recipient and applies the owner, cooldown, and completion rules.

```json
{"action":"resend_setup_email","operationId":"77777777-7777-4777-8777-777777777777"}
```

An example success response:

```json
{
    "success": true,
    "data": {
        "operationId": "77777777-7777-4777-8777-777777777777",
        "targetUserId": "22222222-2222-4222-8222-222222222222",
        "provisioningState": "profile_ready",
        "emailState": "requested"
    }
}
```

| Response state | What the future UI should show |
| --- | --- |
| `auth_outcome_unknown`, `emailState: null` | Auth creation is unconfirmed. Resume with the same operation ID and inputs. |
| `profile_ready`, `requested` | Profile is ready for setup and Auth acknowledged the email request. Delivery is unconfirmed. |
| `profile_ready`, `not_requested` | Auth definitively rejected the request, or it was stopped before dispatch. Offer an explicit retry subject to the cooldown. |
| `profile_ready`, `outcome_unknown` | Email delivery or its outcome record is uncertain. Check the recipient mailbox and reconcile state before offering a resend. |
| `profile_ready`, `email_cooldown` | A resend was blocked by the cooldown. |
| `profile_ready`, `onboarding_complete` | Setup is complete and no new email was sent. Use the roster for current account status. |

A resend without a new email claim can omit `targetUserId`. The UI should retain the operation ID and normalized create inputs for resume and use the same ID for resend. Keep this state private to the current administrator. None of these results establishes that the account is active. Access denials use `403`, operation and identity conflicts use `409`, and unavailable or unverified upstream results use a sanitized `503`. A lost response should be retried with the original operation details. Raw Auth objects, recipient emails, attempt IDs, and upstream errors are excluded from provisioning responses.

### Integration and retry rules

1. **Reserve and claim.** The caller JWT authorizes both RPCs. The Edge Function reconciles before each possible Auth create and requires a new claim and `auth_not_found` before dispatching. The 60-second claim throttles new dispatches. It does not fence an external Auth request that has already left the server.
2. **Create and reconcile.** The privileged Auth client sets `app_metadata.csupak_provisioning_operation_id` to the canonical operation UUID, sets `email_confirm=false`, and omits the password. The trusted database RPC establishes identity and creates the inactive profile. The function reconciles after success, failure, or timeout and sends no setup email until the profile is ready.
3. **Send setup email.** Commit the database claim before sending mail. Record `requested` after acknowledgement, `not_requested` after a definite rejection, or retain `outcome_unknown` when uncertain. Keep the external Auth and email calls outside the database transaction. Throttling and attempt IDs protect state updates and retries. They do not guarantee exactly-once external delivery.
4. **Complete and activate.** The completion RPC derives the target from `auth.uid()` and uses only gateway-verified `auth.jwt()` claims. A matching current confirmed Auth email and server marker are required. The managed Auth session must belong to the account, be unexpired where `not_after` is set, and be newer than profile readiness, email confirmation, and any account cutoff. A signed `password` AMR entry must be at or after the whole-second epoch of session creation and no later than the current second. The full-precision session comparison remains strict. JWT issuance time is irrelevant. Recovery and ordinary OTP cannot qualify by refreshing. After completion, use the existing audited admin activation RPC, which advances the cutoff and requires a fresh sign-in.

The Edge Function rechecks caller eligibility immediately before each external Auth create and recovery email request. A concurrent administrator revocation can still occur between that check and external dispatch. Reconciliation and email result recording can finish an already authorized attempt. External operations do not share a database transaction with the eligibility check.

Before enabling provisioning in hosted TEST, apply the reviewed database migrations and run their catalog checks. Verify the injected secret is accepted for the two service RPCs and Auth Admin, PostgREST supplies Auth-verified claims, no access-token hook synthesizes password AMR, and the migration owner has the required Auth reads. Confirm the live `auth.users` trigger inventory. Keep provisioning out of the management UI until the hosted callback and end-to-end setup have passed verification. [Hosted secrets](https://supabase.com/docs/guides/functions/secrets) · [JWT authentication methods](https://supabase.com/docs/guides/auth/jwt-fields) · [Auth sessions](https://supabase.com/docs/guides/auth/sessions)

### Recipient account setup

The page is `pages/account-setup.html`. It takes the single token hash from the URL fragment, clears the callback URL before loading the Auth SDK, and explicitly exchanges the hash with `verifyOtp({ type: "recovery", token_hash })`. This flow uses the existing Edge recovery request and does not require PKCE state from the administrator's browser. The recovery client checks the user through Auth and checks the server-controlled provisioning marker. [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates) · [Auth SDK recovery verification](https://github.com/supabase/supabase-js/blob/v2.119.2/packages/core/auth-js/src/GoTrueClient.ts)

The marker persists after onboarding, so it cannot establish that setup is pending. The [setup state migration](../../migrations/202611250008_account_setup_state.sql) adds a read-only `get_account_setup_state() → text` RPC. Only `authenticated` may execute it. It derives the target and session from verified claims and checks the private reservation, inactive profile, matching confirmed Auth email and marker, session ownership, and session cutoff. It returns `pending`, `already_completed` for inactive completed accounts, or `unavailable`. The page requires `pending` before displaying the password form and rechecks it just before calling Auth. Run the [read-only catalog verifier](verify_account_setup_state.sql) after applying the migration as the completion RPC owner. Expect a stable security definer with `search_path=pg_catalog, pg_temp`, `row_security=off`, and EXECUTE for `authenticated` only.

Auth controls password acceptance. The page checks eight characters and matching fields. This frontend check does not enforce a project-wide password policy. If the configured Auth service requires additional verification, the page stops and surfaces it. The lifecycle check and Auth update are separate calls. The state RPC does not change or replace Supabase's own recovery authorization policy.

Upstream Auth uses the same token storage category for recovery and magic links. A verified email link and eligible pending reservation can open the setup form. Neither link type nor OTP AMR can prove password onboarding, and a URL flag or an existing OTP session alone cannot open the form. Verify the managed TEST exchange against the configured email template. [Upstream token verification](https://github.com/supabase/auth/blob/master/internal/api/verify.go)

After Auth acknowledges the update, the page signs out the isolated recovery session locally and signs in with the verified email and new password using a separate in-memory client. It verifies the returned user and claims, checks for a distinct session with `password` AMR, and invokes `complete_account_onboarding()` in the fresh session. That RPC remains authoritative for session ownership, timestamps and activation prerequisites. The page accepts `completed` and `already_completed`, clears the temporary session, and tells the recipient that activation remains an administrator action. The setup clients disable URL session detection and automatic background refresh and use separate storage namespaces with no session persistence. Setup cleanup uses `signOut({ scope: "local" })`. [SDK sign-out scopes](https://supabase.com/docs/reference/javascript/auth-signout)

If password update succeeds but completion cannot be confirmed, the page offers a fresh password sign-in to finish. This also works after a reload at the clean setup URL. A successful completion can be replayed safely. If the password update itself timed out, try the chosen password through the resume form first. If it fails or the link expired before a password was set, ask an administrator to resend the setup email using the existing provisioning operation. An unused link opened after completion cannot offer another password change through setup.

### TEST callback and recovery template

1. After approval, apply the [setup state migration](../../migrations/202611250008_account_setup_state.sql) after the provisioning completion migration and run its catalog verifier against CSUPAK-TEST.
2. Stop and restart the isolated frontend with `.\scripts\start-test.ps1` to copy the new page and dependencies. Use `http://127.0.0.1:8765/pages/account-setup.html` for both `ADMIN_USER_MANAGEMENT_SETUP_REDIRECT_URL` and the exact URL in **Authentication → URL Configuration → Redirect URLs** in CSUPAK-TEST.
3. Save a copy of the TEST **Reset password** email template. Render separate fragment links for the two exact callback URLs. Preserve the previously saved recovery content in the fallback branch. Keep existing confirmation requirements and SMTP settings. The login form derives its fixed reset URL from the frontend location, so run TEST at the exact allowlisted origin. Use a TEST mailbox without link tracking or rewriting where possible. [Redirect allowlist](https://supabase.com/docs/guides/auth/redirect-urls) · [Auth template variables](https://supabase.com/docs/guides/auth/auth-email-templates)

   ```html
   {{ if eq .RedirectTo "http://127.0.0.1:8765/pages/account-setup.html" }}
   <p>Set your password to finish setting up your CSUPAK account.</p>
   <p><a href="{{ .RedirectTo }}#token_hash={{ .TokenHash }}">Set up your CSUPAK account</a></p>
   {{ else if eq .RedirectTo "http://127.0.0.1:8765/pages/reset-password.html" }}
   <p>Use this one-time link to choose a new CSUPAK password.</p>
   <p><a href="{{ .RedirectTo }}#token_hash={{ .TokenHash }}">Reset your password</a></p>
   {{ else }}
   <p><a href="{{ .ConfirmationURL }}">Reset your password</a></p>
   {{ end }}
   ```

4. Using a disposable account and reachable TEST mailbox, open the setup email in a different browser profile. For another device, use an explicitly approved HTTPS TEST frontend and update the exact redirect in the secret, allowlist, and template condition. Loopback addresses resolve to the device that opens them.
5. Verify the recovery link is removed from the URL, the intended user can set a password and see the pending activation message, and the original administrator session continues working. Try a consumed or expired link, a completion retry from the clean URL after interrupting the response, and an unrelated account. Verify the profile remains inactive through completion, then activate it separately and verify sign-in with a fresh normal session. Include a check that hosted Auth accepts the template's token hash exchange and enforces the project's password policy.

## Password recovery

An eligible administrator may request an Auth recovery email for a profiled account with a confirmed email and a permanent, non-SSO Auth identity. Both active and inactive profiles are eligible after onboarding. Use the provisioning operation's existing setup or resend action for pending onboarding.

```json
{"action":"request_password_reset","operationId":"77777777-7777-4777-8777-777777777777","userId":"88888888-8888-4888-8888-888888888888"}
```

The request accepts only these three fields. A successful response contains `data.operationId` and `data.outcome`.

| Outcome | Meaning |
| --- | --- |
| `requested` | Auth acknowledged the recovery request. Delivery is unconfirmed. |
| `not_requested` | Dispatch did not occur, or Auth definitively rejected it. |
| `outcome_unknown` | The request or receipt could not be confirmed. A message may still arrive. |
| `recovery_cooldown` | Another operation claimed recovery for this account within 60 seconds. This call made no new claim. |

`409 onboarding_required` directs the administrator to setup. `404 recovery_target_unavailable` covers absent or ineligible targets. `409 operation_id_conflict` covers an ID already used by another actor, target, or action. Existing access, validation, and service error codes still apply. Replay the same operation ID and target after a lost response to read its current outcome. After the cooldown, a new ID represents a deliberate new request. Check for delivery before explicitly sending again after an uncertain result.

`admin_claim_password_recovery(uuid, uuid)` runs with the caller JWT. The RPC rechecks authorization under the existing advisory lock, resolves the current confirmed Auth email by profile UUID, and creates a private audit receipt before dispatch. The address is returned only on a new claim. The Edge Function checks administrator eligibility again before sending with the publishable key and fixed reset redirect. `record_admin_password_recovery(uuid, text)` is service-only. It records one final outcome and permits identical replay. The ledger stores actor and target UUIDs, timestamps, and outcome. It has RLS and no direct API grants. Operation IDs are exclusive across recovery, provisioning, role, status, and name actions. The receipt and external email send are separate operations. Revocation or an email change between the database check and Auth dispatch cannot be made atomic with this Auth endpoint.

**Forgot Password?** on the login page calls `resetPasswordForEmail` directly. Known, unknown, refused, and rate-limited addresses receive the same confirmation copy. Connection failures get an account-agnostic retry message. The reset page consumes the email hash through `verifyOtp`, checks the recovered identity and pending setup state, and submits the new password to Auth. It performs no role, activation, or onboarding update. If the password change cannot be confirmed, the recipient is asked to try the new password at login first. Account setup and recovery use the same Auth token store, so a newer request may invalidate an older link. A pending recipient should use the setup flow. [Supabase recovery API](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)

### Session revocation policy

Rely on managed Auth to revoke the recovered account's other sessions as part of password update. The reset page signs out only the isolated recovery session after a confirmed or ambiguous update. Upstream Auth invalidates other sessions on a successful password update, but a previously issued JWT may remain usable until expiry on paths that do not consult session state. CSUPAK adds no new session cutoff for a reset. Existing role and status cutoffs still apply. Verify actual refresh and existing access-token behavior in hosted TEST, including a grandfathered profile with a NULL cutoff. [Upstream password update implementation](https://github.com/supabase/auth/blob/master/internal/models/user.go) · [Supabase session behavior](https://supabase.com/docs/guides/auth/sessions)

### Hosted TEST checks

1. After approval, apply migration `202611250009_admin_password_recovery.sql` after the setup state migration and run [the read-only verifier](verify_admin_password_recovery.sql). Expect `authenticated` EXECUTE for the claim and `service_role` EXECUTE for recording. Expect no PUBLIC or anonymous EXECUTE, RLS with no API grants, and four enabled trigger entries.
2. Restart `.\scripts\start-test.ps1`. Add the reset URL to both the TEST secret and exact Auth allowlist, and configure the two-branch email template above. Use a reachable disposable TEST mailbox. Preserve the project's Auth policy and verify whether its CAPTCHA or reauthentication configuration requires extra input before broad use.
3. Exercise both administrator and login requests. Review acknowledgement, denied and pending targets, identical replay, and cooldown. Confirm that existing and unknown addresses see the same login message. Open the reset link in a separate browser profile. Check a consumed link, the hosted password policy, and successful login with the new password. Confirm profile role, status and onboarding timestamps are unchanged.
4. Keep two sessions for the disposable target and one session for another user before the reset. After the update, test refreshing the target sessions and exercising protected requests with pre-reset sessions until any old access tokens expire. Confirm the unrelated user stays signed in. Clean up the disposable TEST user using the project's existing fixture procedure.

## Offline checks

From the repository root, use Node.js 24 or another Node version with native TypeScript stripping.

```powershell
node --test supabase/functions/admin-user-management/handler.test.mjs scripts/runtime-storage-cleanup.test.mjs scripts/account-setup.test.mjs scripts/password-recovery.test.mjs
```

On Node **24.21.0**, all 46 Edge tests, six Storage cleanup tests, 11 setup tests, and six browser-flow logic tests for recovery passed. Auth and RPC responses are mocked. Hosted browser behavior is checked separately.

The forward migration and read-only verification also ran successfully in a disposable PostgreSQL **18.3** cluster in single-user mode. Synthetic Auth and profile fixtures exercised grants, administrator eligibility, literal search, filters, projection, and cursor pagination. Hosted Supabase configuration and behavior still require TEST verification.

The name migration ran in a separate disposable PostgreSQL **18.3** cluster with synthetic fixtures and the existing role/status migration. Checks covered active and inactive targets, unchanged account fields, normalized replay, cross-action conflicts in both directions, rollback, and append-only audit.

The provisioning migration and its read-only verifier ran in isolated PostgreSQL **18.3**. The checks covered existing name and status changes, replay and cross-action conflicts, denial of direct ledger writes, rejection of active or administrator profile creation for a reservation, and rejection of direct activation with only confirmed email. A synthetic trusted completion marker still required a separate administrator activation, which advanced the session cutoff. The fixture did not validate hosted Auth evidence.

Run the completion and reconciliation fixtures with the local PostgreSQL tools. The runner initializes a temporary cluster in single-user mode without opening a database listener.

```powershell
python scripts/test-provisioning-db.py
```

The suite passed on PostgreSQL **18.3**. It exercises provisioning, setup, and activation behavior, plus recovery eligibility, current email resolution, cooldown, replay, conflicts across all administrative actions, and state preservation. The fixtures supply synthetic claims to the real database RPCs. Hosted verification must still cover the gateway and managed Auth rows.

## Production release and Phase 5 closeout

**Phase 5 is complete.** On 2026-11-26, Vercel successfully deployed production merge commit `8074867fac982d34e7af159eb1bdf4d824f8ad3d` from `main`. The dashboard, Settings, account setup, and password reset pages returned HTTP 200 on the live site. All 11 production migrations passed verification, and the production `admin-user-management` Edge Function was active with JWT verification enabled. [Production site](https://csupak.vercel.app/) · [Release commit](https://github.com/davynchive/csupak/commit/8074867fac982d34e7af159eb1bdf4d824f8ad3d)

The project maintainer confirmed the following production browser checks passed:

- Existing account sign-in, dashboard, and role-based access.
- Email change and successful sign-in with the confirmed new address. Secure Email Change required confirmation at both the current and new addresses. Completing both confirmations resolved the earlier issue.
- Account creation, setup email delivery, password setup, and administrator activation.
- Password recovery, name editing, role changes, and account deactivation.
- Disposable account cleanup and preservation of the original production accounts.

The previous Vercel production deployment at `747338ce020143dfffc90e87dc987e2377a7f209` is the frontend rollback reference. [Previous deployment](https://csupak-kdsuqyu5h-davynchive.vercel.app/)

## Student ID lookup release checkpoint

The project maintainer confirmed manual verification of Student ID lookup and auto-fill in the Record Violation form on CSUPAK-TEST and approved the feature for production. The change uses the existing student records and permissions and requires no database migration or Auth configuration change.

The rollback reference for this frontend release is production merge commit `8074867fac982d34e7af159eb1bdf4d824f8ad3d`. [Previous release commit](https://github.com/davynchive/csupak/commit/8074867fac982d34e7af159eb1bdf4d824f8ad3d)

## CSUPAK-TEST deployment checkpoint

On 2026-11-26, all six migrations from `202611250004` through `202611250009` passed catalog verification in CSUPAK-TEST. The `admin-user-management` Edge Function deployed as version 1 and reported `ACTIVE` with `verify_jwt = true`.

| Hosted smoke check | Result |
| --- | --- |
| Unauthenticated request | Rejected with HTTP 401 |
| OSWE Administrator `check_access` | Passed |
| OSWE Administrator `list_users` | Passed |

The initial function deployment covered authorization and roster smoke checks. The consolidated browser checkpoint below covers the subsequent User Management rollout.

## User Management interface

Settings opens **Manage Users**, **Add User**, and **Roles & Access** for an eligible administrator. Manage Users and Roles & Access share the server-paginated roster. The roster filters by active/inactive access, role, and literal name or email search. The status badges distinguish active, pending setup, awaiting activation, and deactivated accounts.

- `list_users` accepts optional `includeOnboarding: true`. It adds `accountState`, `setupOperationId`, and `setupEmailState` to each result. The latter two fields are null unless the profile is pending setup and the caller created it. Historic activation is determined from the existing audited status operations. Requests that omit the option keep the original response.
- `list_interrupted_provisioning` accepts `cursor` and `limit`. It returns `{ requests, nextCursor }` with the operation ID and original name, email, and role for the caller’s incomplete requests. Add User reuses those inputs and the operation ID with `create_user`. The browser receives no internal attempt IDs, timestamps, or audit history. The underlying RPCs independently verify administrator eligibility and preserve provisioning ownership.
- Successful mutations refresh the roster. The open page retains unresolved request IDs in memory for manual retry. After reopening the browser, the original administrator can find reservations on Add User or find profile-ready requests on the roster. Setup resends are explicit, including after a timeout. Check the recipient’s inbox before sending again when the outcome is unknown.

The focused frontend logic suite runs with `node --test scripts/user-management.test.mjs`. The Edge suite also verifies both projections with mocked upstream responses. `python scripts/test-provisioning-db.py` exercises the views with synthetic accounts in an isolated local PostgreSQL database.

### TEST rollout

1. Verify the dashboard project reference is `amgybdiyqqnhrfmsnsit`. In its SQL Editor, apply [migration 202611260001](../../migrations/202611260001_admin_user_management_views.sql) as the owner of the private provisioning ledger. Run the [read-only verifier](verify_admin_user_management_views.sql). Expect two stable security-definer functions owned by the ledger owner, with EXECUTE for `authenticated` only.
2. From the repository root, deploy only the updated named function. The existing gateway JWT setting stays enabled. Preserve the TEST redirect URLs, template, and secrets from the hosted checkpoint.

   ```powershell
   $testRef = 'amgybdiyqqnhrfmsnsit'
   $saved = Get-Content -LiteralPath '.csupak-test.local.json' -Raw | ConvertFrom-Json
   $productionRef = [regex]::Match(
       (Get-Content -LiteralPath 'js/supabase.js' -Raw),
       'const\s+supabaseUrl\s*=\s*["'']https://([a-z0-9]{20})\.supabase\.co/?["'']'
   ).Groups[1].Value
   if (!$productionRef -or $testRef -ceq $productionRef -or $saved.projectRef -cne $testRef -or
       $saved.projectUrl -cne "https://$testRef.supabase.co") { throw 'Could not verify CSUPAK-TEST.' }
   & .\node_modules\.bin\supabase.cmd functions deploy admin-user-management --project-ref $testRef --use-api
   if ($LASTEXITCODE -ne 0) { throw 'CSUPAK-TEST deployment failed.' }
   & .\node_modules\.bin\supabase.cmd functions list --project-ref $testRef --output json
   ```

3. Confirm the function is active and `verify_jwt = true`. Restart the isolated frontend with `.\scripts\start-test.ps1`. Sign in at `http://127.0.0.1:8765` and run the checklist below with disposable TEST accounts and a reachable mailbox.

### Consolidated browser checklist

- **Authorization and display** Open Settings as an administrator, then as OSWE Staff and Security Office. Only the administrator should see the three management entries. Check keyboard navigation, Escape, focus return, narrow screens, and the system dark appearance. Confirm My Account and Password & Security still open normally.
- **Roster** Verify name, email, role and all four status badges. Try mixed-case search, literal `%` and `_`, role and access filters, an empty result, Previous and Next with enough fixtures, and retry after going offline. Confirm a profileless Auth fixture is absent.
- **Create and reconcile** Create one disposable Staff and one Security Office account. Verify no password prompt, the inactive setup state, and the email request feedback. Try an invalid or conflicting email and a double submit. Interrupt one request, reload, and resume its original operation from Add User. If it already reached the roster, inspect the setup email status there. A different administrator should see the pending state without the resend action or the other actor’s interrupted requests.
- **Setup and activation** Confirm the pending account cannot activate or use the application. Resend setup with the original administrator, check cooldown, and open the email in another browser profile. Complete setup and verify **Awaiting activation**. Activate it through Roles & Access, sign in fresh, then deactivate and verify the **Deactivated** badge and old-session denial. Keep the only working administrator active. Use the existing disposable administrator fixtures for the last-admin safeguard test.
- **Account edits and recovery** Edit a name and verify the roster refreshes. Change a disposable account’s role and verify fresh sign-in is required. Check that your own role/status and administrator promotion are unavailable. Request a password reset for a confirmed account. Verify cooldown, a consumed link, and successful sign-in with the new password. Check that recovery preserves role, access status and onboarding. If an email outcome is unknown, check the inbox and verify that the UI sends nothing automatically.
- **Cleanup** Use the existing TEST fixture cleanup procedure for disposable accounts. Keep private roster output, recovery links, and audit identifiers out of shared logs.

### Reuse of a provisioning email

The original provisioning RPC reserved an email for the life of its ledger row. Auth email changes and account deletion leave that history intact. The Edge Function maps the ledger conflict and an Auth duplicate to the same UI message. The [read-only conflict query](inspect_provisioning_email_conflict.sql) distinguishes current Auth emails, pending changes, linked identities, and completed or unfinished provisioning. Keep the input address private and share only the counts.

Migration `202611260002_reuse_provisioned_email.sql` retains every receipt and makes uniqueness apply to outstanding reservations. A new request releases a completed receipt's address only if it is absent from current Auth users, pending email-change fields, and linked identities. Release and reservation share the existing transaction lock and commit together. Unfinished or uncertain provisioning remains reserved. A same-operation retry retains its original target and cannot reopen setup or recreate a deleted account. Auth still performs its own uniqueness checks when creating the account.

**Hosted CSUPAK-TEST verification passed.** The catalog confirmed the partial unique index and unchanged reservation RPC permissions. With disposable accounts, both Secure Email Change confirmations succeeded, sign-in worked with the new address, and the old address was reusable before and after Auth account deletion. Current and pending Auth emails and unfinished or uncertain reservations blocked duplicate requests. Two concurrent requests produced one reservation and one conflict. Historical replay kept the original target, could not claim Auth creation or email dispatch, and left the replacement reservation intact. Verification used Supabase-generated codes without sending email. Cleanup restored the original 4 Auth users and 3 profiles, and retained the 4 provisioning receipts, 11 access audit receipts, and 1 name audit receipt present at the end of verification.

To verify on hosted TEST after migration approval, confirm the SQL Editor project is `amgybdiyqqnhrfmsnsit`, then run `migrations/202611260002_reuse_provisioned_email.sql` once as the provisioning owner. The existing Edge Function works with the revised RPC. Use two reachable disposable addresses. Provision the first address, complete setup and activation, confirm an email change to the second address, then delete only the disposable account using the existing TEST cleanup procedure. With the conflict query, the original address should show zero Auth and unfinished matches and a completed receipt. Create a new account with the first address and verify that it receives a new target UUID. Submitting a distinct request while the replacement is pending must produce a conflict. Complete the replacement's onboarding before cleanup so a future test can reuse the address. Retain both provisioning receipts. Run the isolated SQL suite with `python scripts/test-provisioning-db.py` for the pending-change, linked-identity, and replay assertions.

### Phase 3 TEST checkpoint

- Migration `202611260001` was applied and both roster RPCs passed catalog verification. `admin-user-management` version 2 was `ACTIVE` with `verify_jwt = true`. The configured TEST origin received HTTP 204 on preflight. The unsigned onboarding roster request received HTTP 401.
- The tester confirmed that the management dialogs opened, the authenticated roster displayed existing TEST accounts, and the consolidated browser run and UI corrections were complete. The completion report did not include individual results for every scenario in the checklist. The checklist remains the procedure for repeating those cases.
- Chrome checked the running isolated frontend in both light and explicit dark modes, including form controls, placeholders, status text, borders and the dimmed backdrop. Opposite operating system preferences did not override the document theme. This Settings checkout has no theme selector, so the dark selection was set on the document for verification.
- The tester confirmed that the disposable account was removed, the original CSUPAK-TEST baseline was restored, and audit receipts and provisioning history were preserved.

### Repeat deployment and expanded verification

After approval, open **CSUPAK-TEST** in the Supabase dashboard. Confirm the Step 7.3 migrations are applied. Apply the reviewed [roster migration](../../migrations/202611250004_admin_list_users.sql) if it is pending, then the [name update migration](../../migrations/202611250005_admin_update_user_name.sql), before deploying the updated function. Run [the roster's read-only verification](verify_admin_list_users.sql). Expect a stable security definer with a locked search path, EXECUTE for `authenticated`, and no EXECUTE for PUBLIC, `anon`, or `service_role`.

Run the [name update catalog verification](verify_admin_update_user_name.sql) after the name migration. Review these results before proceeding.

- `admin_update_user_name(uuid, uuid, text)` returns `text`. Its owner matches the existing administrative RPC and audit owner. It is volatile and `SECURITY DEFINER`, with `search_path=pg_catalog, pg_temp`, `row_security=off`, and `lock_timeout=5s`. EXECUTE is true for `authenticated` and false for PUBLIC, `anon`, and `service_role`.
- `csupak_private.admin_user_name_audit` has RLS enabled without forced RLS or policies, a primary key on `operation_id`, and validated checks for normalized name length and outcome consistency. PUBLIC has no audit privileges. The three API roles have no private schema access or direct audit privileges.
- Both triggers report `tgenabled = O`. The name audit trigger invokes `reject_admin_account_audit_mutation()` before UPDATE, DELETE, or TRUNCATE. The trigger on the role/status audit table invokes `reject_name_receipt_id_reuse()` before each inserted row. These are catalog checks. Verify runtime behavior with the TEST fixtures below.

After separate approval of the provisioning migration, run its [read-only verifier](verify_account_provisioning_foundation.sql). Expect an RLS-enabled private ledger, EXECUTE for `authenticated` on the reservation RPC with an internal administrator check, no direct ledger grants for the API roles, and three enabled triggers for profile gating and cross-action receipt conflicts.

After separate approval of the [completion migration](../../migrations/202611250007_provisioning_completion.sql), apply it after the foundation and run the [read-only completion verifier](verify_provisioning_completion.sql). Expect the RPC grants in the contract table, no PUBLIC or anonymous EXECUTE, two validated ledger constraints, and the existing activation trigger enabled. The migration will reject pre-existing ready or email-attempt states that lack the new trusted timestamps or attempt UUID. Review any such fixtures before applying it. Do not backfill freshness evidence from the ledger's mutable update time.

Under TEST Edge Function secrets, set `ADMIN_USER_MANAGEMENT_ALLOWED_ORIGINS` to `http://127.0.0.1:8765`. Sign in to the repository-local Supabase CLI if required. Deploy only the named function with an explicit TEST reference. The following guard compares the dashboard reference with the saved launcher configuration and rejects the production reference.

```powershell
$testRef = (Read-Host 'Project ID from the CSUPAK-TEST dashboard').Trim()
$saved = Get-Content -LiteralPath '.csupak-test.local.json' -Raw | ConvertFrom-Json
$productionRef = [regex]::Match(
    (Get-Content -LiteralPath 'js/supabase.js' -Raw),
    'const\s+supabaseUrl\s*=\s*["'']https://([a-z0-9]{20})\.supabase\.co/?["'']'
).Groups[1].Value

if ($testRef -cnotmatch '^[a-z0-9]{20}$' -or -not $productionRef -or
    $testRef -ceq $productionRef -or $saved.projectRef -cne $testRef -or
    $saved.projectUrl -cne "https://$testRef.supabase.co") {
    throw 'Could not verify the CSUPAK-TEST target.'
}

& .\node_modules\.bin\supabase.cmd functions deploy admin-user-management --project-ref $testRef --use-api
if ($LASTEXITCODE -ne 0) { throw 'CSUPAK-TEST Edge Function deployment failed.' }
```

After deployment, sign in via the TEST frontend. In the browser console on an authenticated page, invoke the function without copying or printing an access token.

```javascript
const { data, error } = await supabaseClient.functions.invoke("admin-user-management", {
    body: { action: "check_access" },
});
console.log(error ? { status: error.context?.status } : data);
```

Expect success for an eligible administrator and denial for the other roles. Include browser preflight and available inactive, stale, anonymous, and profileless fixtures in expanded hosted verification. Gateway-generated errors can have their own response format.

Repeat the invocation with `body: { action: "list_users", limit: 1 }`. Pass the returned cursor to the next request and verify the roster IDs advance without duplicates. Then search by a known name or email fragment with different casing, confirm that `%` and `_` match literally, and check the role and active-status filters against the TEST fixtures. Compare the roster with the known profiles and confirm that the profileless Auth user is absent. As Staff and Security Office, confirm that both the Edge action and a direct authenticated RPC call to `admin_list_users` deny the request. Keep roster output private.

For role and status verification, use a disposable TEST staff or Security Office profile as the mutation target. Change its role, repeat the identical request, then reuse the same ID with a different valid role and expect a conflict. Send the current role with a new ID and expect `no_change`. Deactivate and reactivate the fixture, checking that its old application session remains denied and fresh sign-in works after reactivation. Confirm Staff and Security Office are denied both actions as callers. Review the corresponding operation IDs using the [Step 7.3 audit and runtime guide](ACCOUNT_ACCESS_RUNTIME_TESTS.md). Use its disposable administrator fixtures if checking mutual deactivation concurrently. Keep the working administrator out of the race.

For name verification, rename a disposable active profile and an inactive profile. Confirm the active profile's existing session still works and its cutoff, role, status, and email are unchanged. Replay with the same normalized name and confirm one receipt for the ID. Use a fresh ID with the current name to confirm `no_change`, and attempt cross-action ID reuse to confirm `409`. Verify that a non-admin caller gets `403` and a profileless target returns `404` to an eligible administrator. Review the corresponding private name receipts by operation ID in the TEST SQL Editor.
