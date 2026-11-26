# Hosted Auth compatibility probe

Step 7.4.6.2.1 completed the hosted CSUPAK-TEST experiment using one disposable, profileless Auth account. The UUID and operation marker simulated a reservation. The experiment exercised Supabase Auth only. Application provisioning and activation were outside the probe.

## Verified hosted observations

| Check | CSUPAK-TEST result |
| --- | --- |
| Auth creation and lookup | Hosted Auth honored the caller-supplied reserved UUID, accepted a request without a password and with `email_confirm=false`, and preserved the server-controlled operation marker in `app_metadata`. The account was initially unconfirmed. An independent lookup matched the reserved UUID and marker. |
| Recovery and password setup | A recovery email reached the initially unconfirmed account. Verifying the recovery code confirmed the email and established a session with AMR method `otp`. The recipient set their own password through that session. |
| Recovery session refresh | The session ID, session creation timestamp, AMR method, and AMR timestamp stayed the same. Token issuance and the session update timestamp advanced. |
| Fresh password sign-in and refresh | Fresh password sign-in created a distinct session with AMR method `password`. Refresh preserved that session's ID, creation timestamp, AMR method, and AMR timestamp. |
| Recovery session after setup | The original recovery session row remained present after password setup and fresh password sign-in. Its continued presence does not establish that the original token still worked. |
| Ordinary email OTP | Email OTP sign-in created a separate session with AMR method `otp`. Ordinary OTP session refresh was **not verified**. |
| SMTP and uncertain requests | Gmail custom SMTP initially failed with port `586`. Correcting it to `587` resolved email delivery. One recovery request timed out and its outcome remained uncertain. |
| Cleanup and TEST baseline | The disposable Auth account and all its sessions were removed. Final counts were 4 Auth users, 3 profiles, 1 active administrator, and 0 Storage objects. The temporary code-based templates were replaced with reconstructed link-based templates using the original wording. The exact original HTML was unavailable. Working custom SMTP remains enabled in TEST. |

The hosted findings are separate from Supabase's documented API and claim formats. [Auth Admin SDK types](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/src/lib/types.ts) · [Recovery API](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail) · [JWT claims](https://supabase.com/docs/guides/auth/jwt-fields) · [Session documentation](https://supabase.com/docs/guides/auth/sessions)

## Prerequisites for a rerun

- Use a quiet, approved CSUPAK-TEST window, Node.js 22 or newer, and a terminal on the operator and recipient devices. This repository's CLI reports **2.119.0** and the current Node runtime **24.21.0**. The probe uses built-in Node APIs and the ignored TEST launcher configuration. It does not require Docker, an Edge Function, or a running frontend.
- Use an unused reachable mailbox or alias controlled by the experiment. Verify there is no existing Auth account for it in the TEST dashboard. The existing `example.com` fixtures cannot receive mail. Supabase's built-in sender restricts hosted delivery to approved team addresses and has a low project-wide limit. If the disposable address is ineligible, pause for an approved TEST SMTP setup. Leave confirmation, CAPTCHA, and password policies in place. [Hosted email testing](https://supabase.com/docs/guides/auth/testing-auth-flows)
- The operator needs a **TEST** secret API key and TEST dashboard access. Use the script's hidden prompts. The recipient device needs only the TEST project reference, public launcher configuration, disposable UUIDs, and mailbox access. Use a trusted terminal with recording and HTTP tracing turned off. [Supabase API keys](https://supabase.com/docs/guides/api/api-keys)

## Rerun procedure after approval

1. **Verify the target and audit triggers.** Open the CSUPAK-TEST dashboard and obtain its project reference from Project Settings. Confirm the exact project reference in the TEST SQL Editor before running any of the read-only queries below. The helper compares that dashboard reference with `.csupak-test.local.json`, rejects the production reference read from `js/supabase.js`, and uses HTTPS with redirects disabled.

   ```sql
   SELECT t.tgname, t.tgisinternal, t.tgenabled,
          (t.tgtype & 4) <> 0 AS on_insert,
          (t.tgtype & 16) <> 0 AS on_update,
          n.nspname AS function_schema, f.proname AS trigger_function
   FROM pg_catalog.pg_trigger AS t
   JOIN pg_catalog.pg_proc AS f ON f.oid = t.tgfoid
   JOIN pg_catalog.pg_namespace AS n ON n.oid = f.pronamespace
   WHERE t.tgrelid = pg_catalog.to_regclass('auth.users')
   ORDER BY t.tgisinternal, t.tgname;
   ```

   Expect internal constraints to be reported when present. Stop to review any enabled noninternal trigger that could create profiles or change new Auth users. The earlier repository inventory found no custom triggers. If the provisioning migration has since been applied, its existing catalog verifier can be run separately.

2. **Prepare temporary TEST email templates.** Save the current **Reset Password** and **Magic Link** templates outside the repository. If they do not already provide a code, temporarily use a code-only message in both templates for the quiet window, such as `<p>Your CSUPAK-TEST code is {{ .Token }}.</p>`. Keep the subjects distinct. Match the project's configured OTP length and expiry. No redirect allowlist change is needed for this code-based probe. Do not follow default links that redirect into the current app, which lacks an onboarding callback. [Auth email templates](https://supabase.com/docs/guides/auth/auth-email-templates)

3. **Create and reconcile the disposable Auth account.** Run from the repository root. Retain the generated UUIDs and disposable email privately in your test notes. Use the same values for every command. The operator first verifies in the TEST dashboard that the UUID and email are unused and the email is reachable.

   ```powershell
   $testRef = '<CSUPAK_TEST_DASHBOARD_PROJECT_REF>'
   node .\scripts\test-auth-compatibility.mjs plan
   node .\scripts\test-auth-compatibility.mjs create $testRef
   node .\scripts\test-auth-compatibility.mjs inspect $testRef
   ```

   Expected result is the same UUID, email, and operation marker on fresh lookup, with email still unconfirmed. The request sends no password or password hash. If creation times out, run `inspect` first. If the reserved UUID is absent, verify the dashboard for the disposable email and marker before considering a same-ID retry. An unexpected UUID, missing marker, or mismatched identity is a stop condition. An Auth account found by email alone must never be adopted. If Auth allocated a different UUID but returned a matching fixture marker, the helper prints that UUID solely for controlled cleanup.

4. **Request setup and complete it on the recipient device.** Run `send-recovery` on the operator device after confirming the recipient is ready. The operator's privileged lookup validates the fixture first. An accepted Auth response is evidence of request acknowledgement. Confirm actual receipt separately.

   ```powershell
   node .\scripts\test-auth-compatibility.mjs send-recovery $testRef
   ```

   On a separate device or fresh recipient environment without the operator's browser session or credentials, use the same repo scripts and a local ignored configuration containing only the TEST URL, reference, and publishable key. Verify the target reference independently with the operator. Set `$testRef` to that verified value, then run:

   ```powershell
   node .\scripts\test-auth-compatibility.mjs recipient $testRef
   ```

   The recipient enters the recovery code and chooses a password at hidden prompts. The helper verifies the session against Auth, captures recovery and refreshed-recovery evidence before any password change, then verifies a separate password sign-in and refresh. At the pauses, use the query below to record the recovery and password session rows before refresh and to recheck the recovery row before password setup. The password update may revoke earlier sessions. If the flow stops after confirmation, inspect the outcome before requesting any new email. Use a new disposable fixture if repeating the initially unconfirmed experiment.

5. **Compare sign-in OTP.** After the password check succeeds, request a separate sign-in code. Observe the provider's mail cooldown and quota. The helper disables user creation for the OTP request and checks that the intended fixture is already confirmed.

   ```powershell
   # Operator device
   node .\scripts\test-auth-compatibility.mjs send-otp $testRef
   # Recipient device
   node .\scripts\test-auth-compatibility.mjs otp $testRef
   ```

6. **Corroborate the session evidence in TEST.** Run the following read-only query for each observed phase while the session still exists. Fill in the target UUID and session ID privately. Recheck the password session after refresh.

   ```sql
   WITH probe AS (
       SELECT '<DISPOSABLE_AUTH_UUID>'::uuid AS user_id,
              '<OBSERVED_SESSION_UUID>'::uuid AS session_id
   )
   SELECT u.id IS NOT NULL AS user_exists,
          u.email_confirmed_at IS NOT NULL AS email_confirmed,
          s.id IS NOT NULL AS session_exists,
          COALESCE(s.user_id = p.user_id, false) AS session_belongs_to_target,
          s.created_at AS session_created_at,
          COALESCE(s.created_at >= u.created_at, false) AS session_after_account_creation,
          NOT EXISTS (SELECT 1 FROM public.profiles AS f WHERE f.id = p.user_id) AS profileless
   FROM probe AS p
   LEFT JOIN auth.users AS u ON u.id = p.user_id
   LEFT JOIN auth.sessions AS s ON s.id = p.session_id;
   ```

   Report confirmation, password sign-in success, method names and relevant timestamps, session ownership, and whether refresh preserved each session ID and its creation timestamp. Expect a distinct password session with `password` evidence. Recovery, OTP, or a refresh of either must not establish password setup. A refreshed password token may still carry password evidence from the original session. Use the Auth session's creation timestamp and method time as freshness evidence, since JWT issue time can change on refresh. Keep full session IDs in temporary private notes only as needed to run the SQL.

7. **Clean up.** Verify the fixture is profileless, then delete only the marked disposable Auth identity.

   ```powershell
   node .\scripts\test-auth-compatibility.mjs cleanup $testRef
   ```

   The helper checks the exact UUID, email, and marker before deletion and rechecks that the UUID is absent. If Auth behavior prevented automated reconciliation, review the marker and profileless status in the TEST dashboard before manual removal. Leave any unrelated account untouched. Restore the template copies saved at the start of the rerun, remove private UUID/session notes and disposable mailbox messages, and close the test terminals. If a transient TEST key or mail configuration was separately approved for the experiment, remove it using that approved cleanup procedure.

## Proposed onboarding safeguards

- The cross-device probe deliberately verifies a mailbox code from a separate client. It does not test browser redirect handling. For a later link-based flow, use a dedicated callback and an exact TEST allowlisted URL reachable on the recipient device. Use a recipient-completable Auth verification mechanism such as code entry or deliberate token-hash verification. A PKCE verifier from the operator's device is unavailable to the recipient. [Redirect allowlists](https://supabase.com/docs/guides/auth/redirect-urls) · [PKCE constraints](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- If recovery fails for an unconfirmed account, investigate Supabase's documented invitation flow as a separate experiment. Invite only a verified unused address. It may allocate its own Auth UUID, so adapting the reservation contract and securely binding the confirmed Auth identity are separate design work. Stop on ambiguous outcomes. Keep the profile inactive until verified mailbox ownership and a fresh password sign-in are established. [Invitation API](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)
- Use a short database claim under the existing lock and compare-and-set phase in the next implementation. Commit the claim before external Auth calls. After interruption, reconcile the reserved UUID and server-controlled marker. Finalize the inactive profile and ledger state in one database transaction after verifying that identity. Claim email dispatch before sending. Keep a timed-out request in an uncertain state until reconciled and allow an explicit, throttled resend.
- Derive the target from the verified authenticated caller. Require the current confirmed Auth email to match the reservation, a trusted signed `password` AMR entry, and a current `auth.sessions` row whose ID and owner match the verified session and target. Check session creation and password AMR timestamps against the provisioning freshness boundary. Refreshed token issuance and session update timestamps cannot substitute for fresh password evidence.
- Reject recovery and ordinary OTP sessions as password-onboarding evidence, even if the mailbox is confirmed or the session remains present. Reject missing or malformed evidence. Record completion separately from administrator activation and map the database's onboarding-required denial to a stable, sanitized Edge error. Keep the future privileged Auth client and secret separate from the caller client.
