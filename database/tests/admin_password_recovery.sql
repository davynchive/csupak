-- Synthetic fixtures only. Run through scripts/test-provisioning-db.py.
DO $tests$
DECLARE
    admin constant uuid := '00000000-0000-4000-8000-000000000001';
    staff constant uuid := '00000000-0000-4000-8000-000000000002';
    other_admin constant uuid := '00000000-0000-4000-8000-000000000003';
    provisioned_op constant uuid := '10000000-0000-4000-8000-000000000001';
    operation constant uuid := '81000000-0000-4000-8000-000000000001';
    unavailable constant uuid := '81000000-0000-4000-8000-000000000002';
    profileless constant uuid := '81000000-0000-4000-8000-000000000003';
    completed_target uuid;
    pending_target uuid;
    profile_before jsonb;
    completion_before timestamptz;
    access_op uuid := gen_random_uuid();
    name_op uuid := gen_random_uuid();
    second_op uuid := gen_random_uuid();
BEGIN
    UPDATE auth.users SET email = ' Current@Example.Invalid ', email_confirmed_at = clock_timestamp() WHERE id = staff;
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES (profileless, 'profileless@example.invalid', clock_timestamp());
    SELECT target_user_id, onboarding_completed_at INTO completed_target, completion_before
    FROM csupak_private.account_provisioning WHERE operation_id = provisioned_op;
    SELECT to_jsonb(p) INTO profile_before FROM public.profiles AS p WHERE p.id = completed_target;

    SET LOCAL ROLE authenticated;
    PERFORM fixture.jwt(staff);
    PERFORM fixture.expect_error(format('SELECT public.admin_claim_password_recovery(%L,%L)', operation, staff), '42501');
    PERFORM fixture.jwt(admin, anonymous => true);
    PERFORM fixture.expect_error(format('SELECT public.admin_claim_password_recovery(%L,%L)', operation, staff), '42501');
    PERFORM fixture.jwt(admin);
    pending_target := (public.admin_reserve_account_provisioning(gen_random_uuid(), 'pending-reset@example.invalid', 'Pending Reset', 'oswe_staff') ->> 'targetUserId')::uuid;
    PERFORM fixture.expect_error(format('SELECT public.admin_claim_password_recovery(%L,%L)', operation, pending_target), '55000');
    PERFORM fixture.expect_error(format('SELECT public.admin_claim_password_recovery(%L,%L)', operation, profileless), 'P0002');
    PERFORM fixture.expect_error(format('SELECT public.admin_claim_password_recovery(%L,%L)', operation, unavailable), 'P0002');
    PERFORM fixture.expect_error(format('SELECT public.admin_claim_password_recovery(%L,%L)', operation, other_admin), 'P0002');
    PERFORM fixture.check(public.admin_claim_password_recovery(operation, staff) =
        '{"outcome":"claimed","email":"current@example.invalid"}'::jsonb, 'claim resolves current confirmed email');
    PERFORM fixture.check(public.admin_claim_password_recovery(operation, staff) =
        '{"outcome":"outcome_unknown"}'::jsonb, 'interrupted request replays without disclosing email');
    PERFORM fixture.check(public.admin_claim_password_recovery(second_op, staff) =
        '{"outcome":"recovery_cooldown"}'::jsonb, 'cooldown protects target across operation IDs');
    PERFORM fixture.expect_error(format('SELECT public.admin_claim_password_recovery(%L,%L)', operation, completed_target), '22023');
    PERFORM fixture.expect_error(format('SELECT public.record_admin_password_recovery(%L,%L)', operation, 'requested'), '42501');
    PERFORM fixture.expect_error('SELECT * FROM csupak_private.admin_password_recovery', '42501');
    PERFORM fixture.jwt(other_admin);
    PERFORM fixture.expect_error(format('SELECT public.admin_claim_password_recovery(%L,%L)', operation, staff), '22023');
    PERFORM fixture.check(public.admin_claim_password_recovery(second_op, staff) ->> 'outcome' = 'recovery_cooldown', 'cooldown applies across administrators');
    PERFORM fixture.jwt(admin);
    PERFORM fixture.expect_error(format('SELECT public.admin_change_account_access(%L,%L,%L,p_role=>%L)', operation, staff, 'change_role', 'security_office'), '22023');
    PERFORM fixture.expect_error(format('SELECT public.admin_update_user_name(%L,%L,%L)', operation, staff, 'Other Name'), '22023');
    PERFORM fixture.expect_error(format('SELECT public.admin_reserve_account_provisioning(%L,%L,%L,%L)', operation, 'other-reset@example.invalid', 'Other Name', 'oswe_staff'), '22023');
    PERFORM public.admin_change_account_access(access_op, staff, 'set_status', p_is_active => true);
    PERFORM public.admin_update_user_name(name_op, staff, 'Legacy Staff');
    PERFORM fixture.expect_error(format('SELECT public.admin_claim_password_recovery(%L,%L)', access_op, staff), '22023');
    PERFORM fixture.expect_error(format('SELECT public.admin_claim_password_recovery(%L,%L)', name_op, staff), '22023');
    PERFORM fixture.expect_error(format('SELECT public.admin_claim_password_recovery(%L,%L)', provisioned_op, completed_target), '22023');
    PERFORM fixture.check(public.admin_claim_password_recovery(second_op, completed_target) ->> 'outcome' = 'claimed', 'completed provisioning is eligible');
    RESET ROLE;

    SET LOCAL ROLE service_role;
    PERFORM fixture.expect_error(format('SELECT public.admin_claim_password_recovery(%L,%L)', operation, staff), '42501');
    PERFORM fixture.check(public.record_admin_password_recovery(operation, 'requested') = 'requested', 'service records acknowledgement');
    PERFORM fixture.check(public.record_admin_password_recovery(operation, 'requested') = 'requested', 'result recording is idempotent');
    PERFORM fixture.expect_error(format('SELECT public.record_admin_password_recovery(%L,%L)', operation, 'not_requested'), '22023');
    PERFORM fixture.check(public.record_admin_password_recovery(second_op, 'outcome_unknown') = 'outcome_unknown', 'uncertainty is durable');
    RESET ROLE;

    SET LOCAL ROLE authenticated;
    PERFORM fixture.jwt(admin);
    PERFORM fixture.check(public.admin_claim_password_recovery(operation, staff) ->> 'outcome' = 'requested', 'final outcome replays without sending');
    RESET ROLE;
    PERFORM fixture.check(profile_before = (SELECT to_jsonb(p) FROM public.profiles AS p WHERE p.id = completed_target), 'recovery preserves role, status and cutoff');
    PERFORM fixture.check(completion_before = (SELECT onboarding_completed_at FROM csupak_private.account_provisioning WHERE operation_id = provisioned_op), 'recovery preserves onboarding');
    PERFORM fixture.expect_error('DELETE FROM csupak_private.admin_password_recovery', '55000');
END;
$tests$;

SELECT 'PASSWORD_RECOVERY_TESTS_PASSED' AS result;
