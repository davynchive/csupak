-- Step 7.3.4.5. Run the entire script in the verified CSUPAK-TEST SQL Editor.
-- Fill in both TEST-only UUIDs and paste ONE run's expected receipts.
-- Requires the database/audit owner. The trigger probes are rolled back.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $confirm_test_roster$
DECLARE
    working_admin uuid := '<WORKING_TEST_ADMIN_UUID>';
    profileless_user uuid := '<PROFILELESS_TEST_AUTH_UUID>';
BEGIN
    IF working_admin = profileless_user
       OR NOT EXISTS (
           SELECT 1 FROM public.profiles p JOIN auth.users u USING (id)
           WHERE p.id = working_admin AND p.is_active AND p.role = 'oswe_admin'
             AND u.is_anonymous IS FALSE
       )
       OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = profileless_user AND is_anonymous IS FALSE)
       OR EXISTS (SELECT 1 FROM public.profiles WHERE id = profileless_user)
    THEN
        RAISE EXCEPTION 'TEST roster verification failed';
    END IF;
END;
$confirm_test_roster$;

-- Raise on a mismatch so the failure is visible in clients that show only
-- the last statement's result. An empty manifest fails closed.
DO $compare_receipts$
DECLARE
    failures text;
BEGIN
WITH input AS (
    SELECT $receipts$<EXPECTED_RECEIPTS_JSON>$receipts$::jsonb AS payload
), expected AS (
    SELECT x.entry, x.ordinality, (x.entry->>'operation_id')::uuid AS operation_id
    FROM input, jsonb_array_elements(payload) WITH ORDINALITY AS x(entry, ordinality)
), observed AS (
    SELECT e.*, a.id, a.actor_id, a.target_id, a.action, a.outcome, a.occurred_at,
           a.previous_role, a.resulting_role, a.previous_is_active, a.resulting_is_active,
           a.previous_session_valid_after, a.resulting_session_valid_after,
           (
               SELECT previous.resulting_session_valid_after
               FROM expected earlier
               JOIN csupak_private.admin_account_audit previous USING (operation_id)
               WHERE earlier.ordinality < e.ordinality AND previous.target_id = a.target_id
               ORDER BY earlier.ordinality DESC LIMIT 1
           ) AS earlier_cutoff
    FROM expected e LEFT JOIN csupak_private.admin_account_audit a USING (operation_id)
), mismatch AS (
SELECT COALESCE(operation_id::text, '<null operation ID>') AS failure
FROM observed
WHERE CASE WHEN entry->>'outcome' IS NULL THEN id IS NOT NULL ELSE
    id IS NULL
    OR actor_id IS DISTINCT FROM (entry->>'actor_id')::uuid
    OR target_id IS DISTINCT FROM (entry->>'target_id')::uuid
    OR action IS DISTINCT FROM entry->>'action'
    OR outcome IS DISTINCT FROM entry->>'outcome'
    OR occurred_at IS NULL
    OR previous_role IS DISTINCT FROM entry->>'previous_role'
    OR resulting_role IS DISTINCT FROM entry->>'resulting_role'
    OR previous_is_active IS DISTINCT FROM (entry->>'previous_is_active')::boolean
    OR resulting_is_active IS DISTINCT FROM (entry->>'resulting_is_active')::boolean
    OR previous_session_valid_after IS DISTINCT FROM
       CASE WHEN entry ? 'previous_cutoff' THEN (entry->>'previous_cutoff')::timestamptz
            ELSE earlier_cutoff END
    OR (outcome = 'applied' AND (resulting_session_valid_after IS NULL
        OR resulting_session_valid_after < previous_session_valid_after))
    OR (outcome = 'no_change' AND resulting_session_valid_after IS DISTINCT FROM previous_session_valid_after)
END
UNION ALL
SELECT 'Expected unique operation IDs and at least one test'
FROM expected HAVING count(*) = 0 OR count(*) <> count(DISTINCT operation_id)
)
SELECT string_agg(failure, ', ') INTO failures FROM mismatch;

    IF failures IS NOT NULL THEN
        RAISE EXCEPTION 'Missing, unexpected, or inconsistent audit receipts: %', failures;
    END IF;
    RAISE NOTICE 'PASS audit receipts match expected outcomes and before/after values';
END;
$compare_receipts$;

DO $check_append_only$
DECLARE
    probe text;
BEGIN
    FOR probe IN SELECT unnest(ARRAY[
        'UPDATE csupak_private.admin_account_audit SET outcome = outcome WHERE false',
        'DELETE FROM csupak_private.admin_account_audit WHERE false',
        'TRUNCATE csupak_private.admin_account_audit'
    ])
    LOOP
        BEGIN
            EXECUTE probe;
            RAISE EXCEPTION 'Audit statement unexpectedly succeeded';
        EXCEPTION WHEN SQLSTATE '55000' THEN
            IF SQLERRM <> 'Administrative audit records are append-only' THEN
                RAISE;
            END IF;
        END;
    END LOOP;
    RAISE NOTICE 'PASS audit-owner UPDATE, DELETE, and TRUNCATE blocked by trigger';
END;
$check_append_only$;

SET LOCAL ROLE authenticated;
DO $check_audit_grants$
DECLARE
    probe text;
BEGIN
    FOR probe IN SELECT unnest(ARRAY[
        'SELECT id FROM csupak_private.admin_account_audit LIMIT 0',
        'INSERT INTO csupak_private.admin_account_audit (operation_id) SELECT NULL::uuid WHERE false',
        'UPDATE csupak_private.admin_account_audit SET outcome = outcome WHERE false',
        'DELETE FROM csupak_private.admin_account_audit WHERE false',
        'TRUNCATE csupak_private.admin_account_audit'
    ])
    LOOP
        BEGIN
            EXECUTE probe;
            RAISE EXCEPTION 'Authenticated audit statement unexpectedly succeeded';
        EXCEPTION WHEN insufficient_privilege THEN
            NULL;
        END;
    END LOOP;
    RAISE NOTICE 'PASS authenticated direct audit access denied';
END;
$check_audit_grants$;
ROLLBACK;
