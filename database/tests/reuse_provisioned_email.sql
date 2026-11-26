-- Synthetic fixtures only. Run through scripts/test-provisioning-db.py.
DO $test$
DECLARE
    admin constant uuid := '00000000-0000-4000-8000-000000000001';
    staff constant uuid := '00000000-0000-4000-8000-000000000002';
    original_email constant text := 'reusable@example.invalid';
    original_op uuid := gen_random_uuid();
    replacement_op uuid := gen_random_uuid();
    original_target uuid;
    replacement_target uuid;
    rename_op uuid := gen_random_uuid();
    rename_target uuid;
    request text;
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM fixture.jwt(admin);
    original_target := (public.admin_reserve_account_provisioning(
        original_op, original_email, 'Original Fixture', 'oswe_staff')->>'targetUserId')::uuid;
    PERFORM public.admin_claim_provisioning_step(original_op, 'auth');
    RESET ROLE;
    INSERT INTO auth.users(id, email, raw_app_meta_data) VALUES
        (original_target, original_email, jsonb_build_object('csupak_provisioning_operation_id', original_op));
    PERFORM public.reconcile_provisioned_auth_account(original_op);
    INSERT INTO auth.identities(user_id, email) VALUES (original_target, original_email);
    UPDATE csupak_private.account_provisioning SET onboarding_completed_at = profile_ready_at
        WHERE operation_id = original_op;

    request := format('SELECT public.admin_reserve_account_provisioning(%L,%L,%L,%L)',
        replacement_op, ' REUSABLE@example.invalid ', 'Replacement Fixture', 'security_office');
    SET LOCAL ROLE authenticated;
    PERFORM fixture.jwt(admin);
    PERFORM public.admin_change_account_access(gen_random_uuid(), original_target, 'set_status', p_is_active => true);
    PERFORM fixture.expect_error(request, '22023'); -- Current email.
    RESET ROLE;
    UPDATE auth.users SET email = 'changed@example.invalid', email_change = original_email WHERE id = original_target;
    UPDATE auth.identities SET email = 'changed@example.invalid' WHERE user_id = original_target;
    SET LOCAL ROLE authenticated;
    PERFORM fixture.expect_error(request, '22023'); -- Pending Auth change alone.
    RESET ROLE;
    UPDATE auth.users SET email_change = '' WHERE id = original_target;
    UPDATE auth.identities SET email = original_email WHERE user_id = original_target;
    SET LOCAL ROLE authenticated;
    PERFORM fixture.expect_error(request, '22023'); -- Linked identity alone.
    RESET ROLE;
    UPDATE auth.identities SET email = 'changed@example.invalid' WHERE user_id = original_target;
    DELETE FROM auth.users WHERE id = original_target;

    SET LOCAL ROLE authenticated;
    PERFORM fixture.jwt(staff);
    PERFORM fixture.expect_error(request, '42501');
    PERFORM fixture.jwt(admin);
    replacement_target := (public.admin_reserve_account_provisioning(
        replacement_op, ' REUSABLE@example.invalid ', 'Replacement Fixture', 'security_office')->>'targetUserId')::uuid;
    PERFORM fixture.check(replacement_target <> original_target, 'reuse allocates a fresh target');
    PERFORM fixture.check((public.admin_reserve_account_provisioning(
        original_op, original_email, 'Original Fixture', 'oswe_staff')->>'targetUserId')::uuid = original_target,
        'historical replay returns the original target despite the new reservation');
    PERFORM fixture.check(public.admin_claim_provisioning_step(original_op, 'auth')->>'outcome' = 'profile_ready'
        AND public.admin_claim_provisioning_step(original_op, 'email', true)->>'outcome' = 'onboarding_complete',
        'replaying an old request cannot claim Auth recreation or email dispatch');
    PERFORM fixture.expect_error(format('SELECT public.admin_reserve_account_provisioning(%L,%L,%L,%L)',
        original_op, original_email, 'Changed Replay', 'oswe_staff'), '22023');
    PERFORM fixture.expect_error(format('SELECT public.admin_reserve_account_provisioning(gen_random_uuid(),%L,%L,%L)',
        original_email, 'Duplicate Fixture', 'oswe_staff'), '22023');
    PERFORM public.admin_claim_provisioning_step(replacement_op, 'auth');
    PERFORM fixture.expect_error(format('SELECT public.admin_reserve_account_provisioning(gen_random_uuid(),%L,%L,%L)',
        original_email, 'Duplicate Fixture', 'oswe_staff'), '22023'); -- Uncertain Auth outcome.

    rename_target := (public.admin_reserve_account_provisioning(
        rename_op, 'renamed-old@example.invalid', 'Rename Fixture', 'oswe_staff')->>'targetUserId')::uuid;
    PERFORM public.admin_claim_provisioning_step(rename_op, 'auth');
    RESET ROLE;
    PERFORM fixture.check((SELECT count(*) FROM csupak_private.account_provisioning WHERE email = original_email) = 2
        AND (SELECT email_released_at IS NOT NULL FROM csupak_private.account_provisioning WHERE operation_id = original_op)
        AND (SELECT email_released_at IS NULL FROM csupak_private.account_provisioning WHERE operation_id = replacement_op),
        'exactly one current reservation and intact historical row');
    INSERT INTO auth.users(id, email, raw_app_meta_data) VALUES
        (rename_target, 'renamed-old@example.invalid', jsonb_build_object('csupak_provisioning_operation_id', rename_op));
    PERFORM public.reconcile_provisioned_auth_account(rename_op);
    UPDATE csupak_private.account_provisioning SET onboarding_completed_at = profile_ready_at WHERE operation_id = rename_op;
    UPDATE auth.users SET email = 'renamed-current@example.invalid' WHERE id = rename_target;
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_reserve_account_provisioning(gen_random_uuid(), 'renamed-old@example.invalid', 'Fresh Fixture', 'oswe_staff');
    PERFORM fixture.expect_error($query$SELECT public.admin_reserve_account_provisioning(
        gen_random_uuid(), 'renamed-current@example.invalid', 'Duplicate Fixture', 'oswe_staff')$query$, '22023');
    RESET ROLE;
    PERFORM fixture.check(EXISTS (SELECT 1 FROM public.profiles WHERE id = rename_target),
        'reuse after confirmed rename preserves the still-existing profile');
END;
$test$;

SELECT 'EMAIL_REUSE_TESTS_PASSED' AS result;
