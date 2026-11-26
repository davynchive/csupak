-- Synthetic fixtures only. Run through scripts/test-provisioning-db.py.
DO $tests$
DECLARE
    admin constant uuid := '00000000-0000-4000-8000-000000000001';
    staff constant uuid := '00000000-0000-4000-8000-000000000002';
    other_admin constant uuid := '00000000-0000-4000-8000-000000000003';
    op constant uuid := '79000000-0000-4000-8000-000000000001';
    interrupted_first constant uuid := '79000000-0000-4000-8000-000000000002';
    interrupted_second constant uuid := '79000000-0000-4000-8000-000000000003';
    target uuid;
    row_data jsonb;
    interrupted jsonb;
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM fixture.jwt(admin);
    target := (public.admin_reserve_account_provisioning(op, 'setup-view@example.invalid', 'Setup View', 'oswe_staff')->>'targetUserId')::uuid;
    PERFORM public.admin_claim_provisioning_step(op, 'auth');
    PERFORM public.admin_reserve_account_provisioning(interrupted_first, 'resume-a@example.invalid', 'Resume A', 'oswe_staff');
    PERFORM public.admin_reserve_account_provisioning(interrupted_second, 'resume-b@example.invalid', 'Resume B', 'security_office');
    PERFORM public.admin_claim_provisioning_step(interrupted_second, 'auth');
    RESET ROLE;
    INSERT INTO auth.users(id, email, raw_app_meta_data) VALUES
        (target, 'setup-view@example.invalid', jsonb_build_object('csupak_provisioning_operation_id', op));
    SET LOCAL ROLE service_role;
    PERFORM fixture.check(public.reconcile_provisioned_auth_account(op) = 'profile_ready', 'setup roster fixture is ready');
    PERFORM fixture.expect_error('SELECT public.admin_list_my_interrupted_provisioning()', '42501');
    PERFORM fixture.expect_error('SELECT public.admin_list_users_with_onboarding()', '42501');
    RESET ROLE;

    SET LOCAL ROLE authenticated;
    PERFORM fixture.jwt(admin);
    row_data := public.admin_list_users_with_onboarding('SETUP-VIEW@', 'oswe_staff', false) -> 'users' -> 0;
    PERFORM fixture.check(row_data ->> 'accountState' = 'setup_pending' AND row_data ->> 'setupOperationId' = op::text
        AND row_data ->> 'setupEmailState' = 'not_requested', 'owner sees setup state and resend reference');
    PERFORM fixture.check((public.admin_list_users('Setup View')->'users'->0) ? 'accountState' = false, 'ordinary roster contract remains unchanged');
    interrupted := public.admin_list_my_interrupted_provisioning(op, 1);
    PERFORM fixture.check(interrupted -> 'requests' -> 0 = jsonb_build_object(
        'operationId', interrupted_first, 'fullName', 'Resume A', 'email', 'resume-a@example.invalid', 'role', 'oswe_staff')
        AND interrupted ->> 'nextCursor' = interrupted_first::text, 'owner sees minimum original inputs and a cursor');
    interrupted := public.admin_list_my_interrupted_provisioning(interrupted_first, 1);
    PERFORM fixture.check(interrupted -> 'requests' -> 0 ->> 'operationId' = interrupted_second::text,
        'owner can resume another page without duplicates');

    PERFORM fixture.jwt(other_admin);
    row_data := public.admin_list_users_with_onboarding('Setup View') -> 'users' -> 0;
    PERFORM fixture.check(row_data ->> 'accountState' = 'setup_pending' AND row_data -> 'setupOperationId' = 'null'::jsonb
        AND row_data -> 'setupEmailState' = 'null'::jsonb, 'other administrator cannot see setup operation or email outcome');
    PERFORM fixture.check(public.admin_list_my_interrupted_provisioning() -> 'requests' = '[]'::jsonb,
        'other administrator cannot enumerate interrupted requests');
    PERFORM fixture.expect_error(format('SELECT public.admin_claim_provisioning_step(%L,%L,true)', op, 'email'), '42501');
    PERFORM fixture.jwt(staff);
    PERFORM fixture.expect_error('SELECT public.admin_list_my_interrupted_provisioning()', '42501');
    PERFORM fixture.expect_error('SELECT public.admin_list_users_with_onboarding()', '42501');
    RESET ROLE;

    UPDATE csupak_private.account_provisioning SET onboarding_completed_at = profile_ready_at WHERE operation_id = op;
    SET LOCAL ROLE authenticated;
    PERFORM fixture.jwt(admin);
    row_data := public.admin_list_users_with_onboarding('Setup View') -> 'users' -> 0;
    PERFORM fixture.check(row_data ->> 'accountState' = 'awaiting_activation' AND row_data -> 'setupOperationId' = 'null'::jsonb,
        'completed setup waits for activation without resend reference');
    PERFORM public.admin_change_account_access(gen_random_uuid(), target, 'set_status', p_is_active => true);
    PERFORM fixture.check(public.admin_list_users_with_onboarding('Setup View', p_is_active => true) -> 'users' -> 0 ->> 'accountState' = 'active', 'activation is displayed');
    PERFORM public.admin_change_account_access(gen_random_uuid(), target, 'set_status', p_is_active => false);
    PERFORM fixture.check(public.admin_list_users_with_onboarding('Setup View') -> 'users' -> 0 ->> 'accountState' = 'deactivated',
        'previously activated setup is distinguished from awaiting activation');
    RESET ROLE;
END;
$tests$;

SELECT 'MANAGEMENT_VIEWS_TESTS_PASSED' AS result;
