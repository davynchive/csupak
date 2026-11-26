-- Synthetic fixtures only. Run through scripts/test-provisioning-db.py.
CREATE SCHEMA fixture;
GRANT USAGE ON SCHEMA fixture TO authenticated, service_role;

CREATE FUNCTION fixture.check(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $check$
BEGIN
    IF condition IS NOT TRUE THEN RAISE EXCEPTION 'Test failed: %', label; END IF;
END;
$check$;

CREATE FUNCTION fixture.expect_error(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $error$
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = expected THEN RETURN; END IF;
        RAISE;
    END;
    RAISE EXCEPTION 'Expected SQLSTATE % for %', expected, statement;
END;
$error$;

CREATE FUNCTION fixture.jwt(
    subject uuid, session_id text DEFAULT NULL, method text DEFAULT NULL, method_time numeric DEFAULT NULL,
    anonymous boolean DEFAULT false, issue_time numeric DEFAULT NULL
) RETURNS void LANGUAGE sql AS $jwt$
    SELECT pg_catalog.set_config('request.jwt.claims', jsonb_build_object(
        'sub', subject, 'role', 'authenticated', 'is_anonymous', anonymous,
        'session_id', session_id, 'iat', COALESCE(issue_time, floor(EXTRACT(EPOCH FROM clock_timestamp()))),
        'amr', jsonb_build_array(jsonb_build_object('method', method, 'timestamp', method_time))
    )::text, false);
$jwt$;

DO $tests$
DECLARE
    admin constant uuid := '00000000-0000-4000-8000-000000000001';
    legacy constant uuid := '00000000-0000-4000-8000-000000000002';
    other_admin constant uuid := '00000000-0000-4000-8000-000000000003';
    operation constant uuid := '10000000-0000-4000-8000-000000000001';
    password_session constant uuid := '20000000-0000-4000-8000-000000000001';
    recovery_session constant uuid := '20000000-0000-4000-8000-000000000002';
    otp_session constant uuid := '20000000-0000-4000-8000-000000000003';
    old_session constant uuid := '20000000-0000-4000-8000-000000000004';
    other_session constant uuid := '20000000-0000-4000-8000-000000000005';
    expired_session constant uuid := '20000000-0000-4000-8000-000000000006';
    missing_session constant uuid := '20000000-0000-4000-8000-000000000007';
    fresh_session constant uuid := '20000000-0000-4000-8000-000000000008';
    base constant timestamptz := date_trunc('second', clock_timestamp()) - interval '2 minutes';
    amr_second constant numeric := floor(EXTRACT(EPOCH FROM base));
    expected_marker constant jsonb := jsonb_build_object('csupak_provisioning_operation_id', operation::text);
    target uuid;
    claim jsonb;
    attempt uuid;
    retry_attempt uuid;
    completed_at timestamptz;
    state text;
    rejected record;
BEGIN
    PERFORM fixture.check(
        pg_catalog.has_function_privilege('authenticated', 'public.get_account_setup_state()', 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('anon', 'public.get_account_setup_state()', 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('service_role', 'public.get_account_setup_state()', 'EXECUTE'),
        'setup state execution is limited to authenticated callers');
    INSERT INTO auth.users (id, email) VALUES
        (admin, 'admin@example.invalid'), (legacy, 'legacy@example.invalid'), (other_admin, 'other@example.invalid');
    INSERT INTO public.profiles (id, full_name, role, is_active) VALUES
        (admin, 'Working Admin', 'oswe_admin', true), (legacy, 'Legacy Staff', 'oswe_staff', true),
        (other_admin, 'Other Admin', 'oswe_admin', true);

    SET LOCAL ROLE authenticated;
    PERFORM fixture.jwt(admin);
    PERFORM fixture.check(public.get_my_role() = 'oswe_admin', 'existing administrator stays eligible');
    claim := public.admin_reserve_account_provisioning(operation, ' NEW@Example.Invalid ', ' New Staff ', 'oswe_staff');
    target := (claim ->> 'targetUserId')::uuid;
    PERFORM fixture.check(
        public.admin_reserve_account_provisioning(operation, 'new@example.invalid', 'New Staff', 'oswe_staff') = claim,
        'normalized reservation replay');
    PERFORM fixture.expect_error(format('SELECT public.reconcile_provisioned_auth_account(%L)', operation), '42501');
    PERFORM fixture.expect_error(format('SELECT public.record_provisioning_email_outcome(%L, gen_random_uuid(), %L)',
        operation, 'requested'), '42501');
    PERFORM fixture.expect_error('UPDATE csupak_private.account_provisioning SET onboarding_completed_at=clock_timestamp()', '42501');
    PERFORM fixture.jwt(other_admin);
    PERFORM fixture.expect_error(format('SELECT public.admin_claim_provisioning_step(%L,%L)', operation, 'auth'), '42501');
    PERFORM fixture.jwt(legacy);
    PERFORM fixture.check(public.get_my_role() = 'oswe_staff', 'existing staff remains grandfathered');
    PERFORM fixture.check(public.get_account_setup_state() = 'unavailable', 'existing account cannot use provisioning setup');
    PERFORM fixture.expect_error('SELECT public.complete_account_onboarding()', '42501');
    PERFORM fixture.expect_error(format('SELECT public.admin_claim_provisioning_step(%L,%L)', operation, 'auth'), '42501');
    RESET ROLE;

    SET LOCAL ROLE service_role;
    PERFORM fixture.expect_error(format('SELECT public.reconcile_provisioned_auth_account(%L)', operation), '55000');
    PERFORM fixture.expect_error(format('SELECT public.admin_claim_provisioning_step(%L,%L)', operation, 'auth'), '42501');
    PERFORM fixture.expect_error('SELECT public.complete_account_onboarding()', '42501');
    PERFORM fixture.expect_error('SELECT public.get_account_setup_state()', '42501');
    PERFORM fixture.expect_error('SELECT * FROM csupak_private.account_provisioning', '42501');
    RESET ROLE;

    SET LOCAL ROLE authenticated;
    PERFORM fixture.jwt(admin);
    claim := public.admin_claim_provisioning_step(operation, 'auth');
    PERFORM fixture.check(claim ->> 'outcome' = 'claimed' AND (claim ->> 'targetUserId')::uuid = target,
        'claim reserves only the original target');
    PERFORM fixture.check(public.admin_claim_provisioning_step(operation, 'auth') ->> 'outcome' = 'auth_outcome_unknown',
        'duplicate claim sees recorded uncertain creation');
    RESET ROLE;

    -- A matching email and marker at the wrong UUID may never be attached.
    INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES (gen_random_uuid(), 'new@example.invalid', expected_marker);
    SET LOCAL ROLE service_role;
    PERFORM fixture.check(public.reconcile_provisioned_auth_account(operation) = 'auth_not_found', 'wrong Auth UUID');
    RESET ROLE;
    DELETE FROM auth.users WHERE email = 'new@example.invalid';
    UPDATE csupak_private.account_provisioning SET created_at = base, updated_at = base WHERE operation_id = operation;
    SET LOCAL ROLE authenticated;
    claim := public.admin_claim_provisioning_step(operation, 'auth');
    PERFORM fixture.check(claim ->> 'outcome' = 'claimed' AND (claim ->> 'targetUserId')::uuid = target,
        'retry after the Auth claim expires preserves the reserved UUID');
    RESET ROLE;
    INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES (target, 'wrong@example.invalid', expected_marker);
    SET LOCAL ROLE service_role;
    PERFORM fixture.expect_error(format('SELECT public.reconcile_provisioned_auth_account(%L)', operation), '23514');
    RESET ROLE;
    UPDATE auth.users SET email = 'new@example.invalid', raw_app_meta_data = '{}' WHERE id = target;
    SET LOCAL ROLE service_role;
    PERFORM fixture.expect_error(format('SELECT public.reconcile_provisioned_auth_account(%L)', operation), '23514');
    RESET ROLE;
    UPDATE auth.users SET raw_app_meta_data = expected_marker, is_anonymous = true WHERE id = target;
    SET LOCAL ROLE service_role;
    PERFORM fixture.expect_error(format('SELECT public.reconcile_provisioned_auth_account(%L)', operation), '23514');
    RESET ROLE;
    UPDATE auth.users SET is_anonymous = false, is_sso_user = true WHERE id = target;
    SET LOCAL ROLE service_role;
    PERFORM fixture.expect_error(format('SELECT public.reconcile_provisioned_auth_account(%L)', operation), '23514');
    RESET ROLE;
    UPDATE auth.users SET is_sso_user = false, deleted_at = base WHERE id = target;
    SET LOCAL ROLE service_role;
    PERFORM fixture.expect_error(format('SELECT public.reconcile_provisioned_auth_account(%L)', operation), '23514');
    RESET ROLE;
    UPDATE auth.users SET deleted_at = NULL WHERE id = target;
    PERFORM fixture.check(NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target), 'invalid identities never inserted');
    INSERT INTO public.profiles(id,full_name,role,is_active) VALUES (target, 'Unrelated Profile', 'oswe_staff', false);
    SET LOCAL ROLE service_role;
    PERFORM fixture.expect_error(format('SELECT public.reconcile_provisioned_auth_account(%L)', operation), '23514');
    RESET ROLE;
    PERFORM fixture.check((SELECT full_name FROM public.profiles WHERE id = target) = 'Unrelated Profile',
        'existing profile is neither adopted nor overwritten');
    DELETE FROM public.profiles WHERE id = target;

    -- Auth creation succeeded despite the interrupted request. No new claim is needed for reconciliation.
    SET LOCAL ROLE service_role;
    PERFORM fixture.check(public.reconcile_provisioned_auth_account(operation) = 'profile_ready', 'reconcile interrupted creation');
    PERFORM fixture.check(public.reconcile_provisioned_auth_account(operation) = 'profile_ready', 'successful reconciliation replay');
    RESET ROLE;
    PERFORM fixture.check(EXISTS (
        SELECT 1 FROM public.profiles WHERE id = target AND full_name = 'New Staff' AND role = 'oswe_staff'
          AND NOT is_active AND session_valid_after IS NULL
    ), 'profile uses the reserved data and starts inactive');

    -- Set deterministic test timestamps for the cooldown and same-second AMR check.
    UPDATE csupak_private.account_provisioning SET created_at = base, profile_ready_at = base + interval '100 milliseconds'
    WHERE operation_id = operation;
    SET LOCAL ROLE authenticated;
    PERFORM fixture.jwt(admin);
    PERFORM fixture.check(public.admin_claim_provisioning_step(operation, 'auth') ->> 'outcome' = 'profile_ready',
        'no new Auth claim after reconciliation');
    claim := public.admin_claim_provisioning_step(operation, 'email');
    attempt := (claim ->> 'attemptId')::uuid;
    PERFORM fixture.check(claim ->> 'outcome' = 'claimed' AND attempt IS NOT NULL, 'email claim returns its attempt');
    PERFORM fixture.check(public.admin_claim_provisioning_step(operation, 'email') ->> 'outcome' = 'outcome_unknown',
        'interrupted email request stays uncertain');
    PERFORM fixture.check(public.admin_claim_provisioning_step(operation, 'email', true) ->> 'outcome' = 'email_cooldown',
        'resend is throttled');
    PERFORM fixture.expect_error(format(
        'SELECT public.admin_change_account_access(gen_random_uuid(),%L,%L,p_is_active=>true)', target, 'set_status'), '23514');
    RESET ROLE;
    SET LOCAL ROLE service_role;
    PERFORM fixture.check(public.record_provisioning_email_outcome(operation, attempt, 'outcome_unknown') = 'outcome_unknown',
        'backend can explicitly record uncertainty');
    PERFORM fixture.check(public.record_provisioning_email_outcome(operation, attempt, 'not_requested') = 'not_requested',
        'backend can record a definitive mail rejection after reconciliation');
    RESET ROLE;
    SET LOCAL ROLE authenticated;
    PERFORM fixture.check(public.admin_claim_provisioning_step(operation, 'email') ->> 'outcome' = 'not_requested',
        'a recorded rejection requires an explicit retry');
    RESET ROLE;
    UPDATE csupak_private.account_provisioning SET email_attempted_at = profile_ready_at WHERE operation_id = operation;
    SET LOCAL ROLE authenticated;
    claim := public.admin_claim_provisioning_step(operation, 'email', true);
    retry_attempt := (claim ->> 'attemptId')::uuid;
    PERFORM fixture.check(claim ->> 'outcome' = 'claimed' AND retry_attempt <> attempt, 'explicit resend obtains new attempt');
    RESET ROLE;
    SET LOCAL ROLE service_role;
    PERFORM fixture.expect_error(format('SELECT public.record_provisioning_email_outcome(%L,%L,%L)',
        operation, attempt, 'requested'), '22023');
    PERFORM fixture.check(public.record_provisioning_email_outcome(operation, retry_attempt, 'requested') = 'requested',
        'record acknowledgement for current attempt');
    PERFORM fixture.check(public.record_provisioning_email_outcome(operation, retry_attempt, 'requested') = 'requested',
        'replay acknowledgement');
    PERFORM fixture.expect_error(format('SELECT public.record_provisioning_email_outcome(%L,%L,%L)',
        operation, retry_attempt, 'not_requested'), '22023');
    RESET ROLE;

    INSERT INTO auth.sessions VALUES
        (password_session, target, base + interval '250 milliseconds', NULL),
        (recovery_session, target, base + interval '250 milliseconds', NULL),
        (otp_session, target, base + interval '250 milliseconds', NULL),
        (old_session, target, base + interval '50 milliseconds', NULL),
        (other_session, legacy, base + interval '250 milliseconds', NULL),
        (expired_session, target, base + interval '250 milliseconds', base + interval '1 second');
    SET LOCAL ROLE authenticated;
    PERFORM fixture.jwt(target, password_session::text, 'password', amr_second);
    PERFORM fixture.check(public.get_account_setup_state() = 'unavailable', 'unconfirmed email cannot use setup');
    PERFORM fixture.expect_error('SELECT public.complete_account_onboarding()', '42501');
    RESET ROLE;
    UPDATE auth.users SET email_confirmed_at = base + interval '200 milliseconds', email = 'different@example.invalid' WHERE id = target;
    SET LOCAL ROLE authenticated;
    PERFORM fixture.expect_error('SELECT public.complete_account_onboarding()', '42501');
    RESET ROLE;
    UPDATE auth.users SET email = 'new@example.invalid' WHERE id = target;
    SET LOCAL ROLE authenticated;
    PERFORM fixture.jwt(target, recovery_session::text, 'otp', amr_second, issue_time => amr_second);
    PERFORM fixture.check(public.get_account_setup_state() = 'pending', 'verified recovery can check pending setup');
    PERFORM fixture.expect_error('SELECT public.complete_account_onboarding()', '42501');
    FOR rejected IN SELECT * FROM (VALUES
        (NULL::text, 'password', amr_second),
        ('malformed', 'password', amr_second),
        (missing_session::text, 'password', amr_second),
        (old_session::text, 'password', amr_second),
        (other_session::text, 'password', amr_second),
        (expired_session::text, 'password', amr_second),
        (password_session::text, 'password', amr_second - 1),
        (password_session::text, 'password', amr_second + 3600),
        (password_session::text, 'password', amr_second + 0.5),
        (password_session::text, 'password', NULL),
        (recovery_session::text, 'recovery', amr_second),
        (recovery_session::text, 'otp', amr_second), -- Recovery and refreshed recovery use OTP AMR in TEST.
        (otp_session::text, 'otp', amr_second)
    ) AS t(session_id, method, method_time)
    LOOP
        PERFORM fixture.jwt(target, rejected.session_id, rejected.method, rejected.method_time);
        PERFORM fixture.expect_error('SELECT public.complete_account_onboarding()', '42501');
    END LOOP;
    PERFORM fixture.jwt(target, password_session::text, 'password', amr_second, true);
    PERFORM fixture.check(public.get_account_setup_state() = 'unavailable', 'anonymous identity cannot check setup');
    PERFORM fixture.expect_error('SELECT public.complete_account_onboarding()', '42501');
    FOR rejected IN SELECT id FROM (VALUES (missing_session), (old_session), (other_session), (expired_session)) AS ids(id)
    LOOP
        PERFORM fixture.jwt(target, rejected.id::text, 'otp', amr_second);
        PERFORM fixture.check(public.get_account_setup_state() = 'unavailable', 'setup requires a current owned session');
    END LOOP;
    PERFORM fixture.jwt(admin);
    PERFORM fixture.expect_error(format(
        'SELECT public.admin_change_account_access(gen_random_uuid(),%L,%L,p_is_active=>true)', target, 'set_status'), '23514');

    PERFORM fixture.jwt(target, password_session::text, 'password', amr_second, issue_time => amr_second);
    PERFORM fixture.check(public.get_my_role() IS NULL, 'inactive account has no application role');
    PERFORM fixture.check(public.complete_account_onboarding() = 'completed', 'fresh password AMR in same second as provisioning');
    RESET ROLE;
    SELECT onboarding_completed_at INTO completed_at FROM csupak_private.account_provisioning WHERE operation_id = operation;
    SET LOCAL ROLE authenticated;
    -- Model the hosted refresh: new issuance time, original password session and AMR.
    PERFORM fixture.jwt(target, password_session::text, 'password', amr_second);
    PERFORM fixture.check(public.get_account_setup_state() = 'already_completed', 'completed account is not offered another setup password change');
    PERFORM fixture.check(public.complete_account_onboarding() = 'already_completed', 'idempotent password completion');
    PERFORM fixture.check(public.get_my_role() IS NULL, 'completion alone does not activate');
    PERFORM fixture.jwt(admin);
    state := public.admin_change_account_access(gen_random_uuid(), target, 'set_status', p_is_active => true);
    PERFORM fixture.check(state = 'applied', 'administrator can activate completed account');
    PERFORM fixture.jwt(target, password_session::text, 'password', amr_second);
    PERFORM fixture.check(public.get_my_role() IS NULL, 'activation invalidates the onboarding session');
    PERFORM fixture.expect_error('SELECT public.complete_account_onboarding()', '42501');
    RESET ROLE;
    PERFORM fixture.check(completed_at IS NOT NULL AND completed_at = (
        SELECT onboarding_completed_at FROM csupak_private.account_provisioning WHERE operation_id = operation
    ), 'completion timestamp is immutable on replay');
    INSERT INTO auth.sessions VALUES (fresh_session, target, clock_timestamp(), NULL);
    SET LOCAL ROLE authenticated;
    PERFORM fixture.jwt(target, fresh_session::text, 'password', floor(EXTRACT(EPOCH FROM clock_timestamp())));
    PERFORM fixture.check(public.get_my_role() = 'oswe_staff', 'fresh session after activation sees staff role');
    PERFORM fixture.check(public.get_account_setup_state() = 'unavailable', 'active account is outside setup');
    RESET ROLE;
END;
$tests$;

SELECT 'PROVISIONING_TESTS_PASSED' AS result;
