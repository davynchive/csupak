import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { cleanupRuntimePhotos, StorageCleanupFailure } from './runtime-storage-cleanup.mjs';

const root = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const [mode, dashboardRef, ...extra] = process.argv.slice(2);
const receipts = [];
const liveSessions = new Map();
let phase = 'local TEST configuration';
let base, key;

async function ask(label, secret = false) {
    const output = secret ? new Writable({ write(_chunk, _encoding, done) { done(); } }) : process.stdout;
    const input = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 });
    try {
        if (secret) process.stdout.write(label);
        return await input.question(secret ? '' : label);
    } finally {
        input.close();
        if (secret) process.stdout.write('\n');
    }
}

async function request(path, { token, method = 'GET', body, headers } = {}) {
    const response = await fetch(base + path, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
            apikey: key,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...headers,
        },
        body: body instanceof Uint8Array ? body : JSON.stringify(body),
    });
    const type = response.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await response.json()
        : type.includes('image/png') ? Buffer.from(await response.arrayBuffer()) : null;
    return { status: response.status, ok: response.ok, data, code: data?.code ?? data?.error_code };
}

class CheckFailure extends Error {}

function check(condition, label) {
    if (!condition) throw new CheckFailure(label);
}

function accepted(result, label) {
    if (!result.ok) diagnostic(result, label);
    return result.data;
}

function diagnostic(result, label) {
    throw new CheckFailure(`${label} (unexpected HTTP ${result.status})`);
}

function denied(result, label, code = '42501') {
    if (result.ok || result.code !== code) diagnostic(result, `${label} expected denial ${code}`);
}

const jwtSession = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).session_id;

function session(data) {
    check(uuid.test(data?.user?.id) && typeof data.access_token === 'string'
        && typeof data.refresh_token === 'string', 'Auth returned a valid session response');
    check(uuid.test(jwtSession(data.access_token)), 'Auth token contains a session ID');
    const auth = { id: data.user.id, token: data.access_token, refresh: data.refresh_token };
    liveSessions.set(jwtSession(auth.token), auth);
    return auth;
}

async function signIn(credentials) {
    const result = session(accepted(await request('/auth/v1/token?grant_type=password', {
        method: 'POST', body: credentials,
    }), 'Password sign-in'));
    check(accepted(await request('/auth/v1/user', result), 'Verify signed-in Auth user')?.id === result.id,
        'Auth user matches the sign-in session');
    return result;
}

async function account(label) {
    phase = `sign in as ${label}`;
    const expectedId = (await ask(`${label} Auth UUID from TEST dashboard: `)).trim().toLowerCase();
    check(uuid.test(expectedId), 'Entered TEST Auth UUID has the required format');
    const credentials = {
        email: (await ask(`${label} TEST email: `)).trim(),
        password: await ask(`${label} TEST password (hidden): `, true),
    };
    const auth = await signIn(credentials);
    check(auth.id === expectedId, 'Signed-in account matches the entered TEST Auth UUID');
    return { ...auth, credentials };
}

const rpc = (name, body = {}, auth) => request(`/rest/v1/rpc/${name}`,
    { token: auth?.token, method: 'POST', body });
const profile = async (auth, label) => accepted(await request(
    `/rest/v1/profiles?select=id,full_name,role,is_active,session_valid_after&id=eq.${auth.id}`, auth), label);
const semesters = (auth) => request('/rest/v1/semesters?select=id&limit=1', auth);
const updateName = (auth, name) => rpc('update_my_profile', { p_full_name: name }, auth);
const photo = async (auth, path) => request(`/storage/v1/object/authenticated/violation-photos/${path}`, auth);

async function eligible(auth, expectedRole, label = expectedRole) {
    check(accepted(await rpc('get_my_role', {}, auth), `${label} role RPC`) === expectedRole,
        `${label} has the expected application role`);
    const rows = await profile(auth, `${label} own profile read`);
    check(rows.length === 1 && rows[0].id === auth.id && rows[0].role === expectedRole && rows[0].is_active,
        `${label} can read its active profile`);
    check(accepted(await semesters(auth), `${label} semester read`).length === 1,
        `${label} can read a semester row`);
    return rows[0];
}

async function ineligible(auth, label) {
    check(accepted(await rpc('get_my_role', {}, auth), `${label} role RPC`) === null,
        `${label} has no application role`);
    check((await profile(auth, `${label} own profile read`)).length === 0, `${label} cannot see its profile`);
    check(accepted(await semesters(auth), `${label} semester read`).length === 0,
        `${label} cannot see semester rows`);
    denied(await updateName(auth, 'Runtime denied probe'), `${label} My Account write`);
    denied(await rpc('get_interview_complaint_summaries', {}, auth), `${label} interview summary read`);
}

function operation(target, action, value) {
    return {
        p_operation_id: randomUUID(), p_target_id: target.id, p_action: action,
        p_role: action === 'change_role' ? value : null,
        p_is_active: action === 'set_status' ? value : null,
    };
}

const adminRpc = (actor, args) => rpc('admin_change_account_access', args, actor);

function expectReceipt(actor, args, outcome, before) {
    const item = {
        operation_id: args.p_operation_id, actor_id: actor?.id ?? null,
        target_id: args.p_target_id, action: args.p_action, outcome,
    };
    if (before) Object.assign(item, {
        previous_role: before.role,
        resulting_role: args.p_role ?? before.role,
        previous_is_active: before.is_active,
        resulting_is_active: args.p_is_active ?? before.is_active,
        previous_cutoff: before.session_valid_after,
    });
    receipts.push(item);
}

async function rejectAdmin(actor, args, label, code) {
    expectReceipt(actor, args, null);
    denied(await adminRpc(actor, args), label, code);
}

async function apply(actor, args, before, label, outcome = 'applied') {
    expectReceipt(actor, args, outcome, before);
    check(accepted(await adminRpc(actor, args), label) === outcome, `${label} returned ${outcome}`);
}

function pass(label) { console.log(`PASS ${label}`); }

async function core() {
    const admin = await account('working administrator');
    const staff = await account('OSWE Staff');
    const security = await account('Security Office');
    const missing = await account('disposable Auth user without a profile');
    const fixture = await account('disposable access fixture (active oswe_staff)');
    check(new Set([admin.id, staff.id, security.id, missing.id, fixture.id]).size === 5, 'Core accounts are distinct');

    phase = 'active roles, missing profile, and unsigned API access';
    const active = [[admin, 'oswe_admin'], [staff, 'oswe_staff'], [security, 'security_office']];
    for (const [actor, expected] of active) await eligible(actor, expected);
    const original = await eligible(fixture, 'oswe_staff', 'Disposable access fixture');
    check(original.full_name.startsWith('Runtime Access Fixture '), 'Access fixture has the required test name prefix');
    const otherProfile = await request(`/rest/v1/profiles?select=id&id=eq.${fixture.id}`, admin);
    check(accepted(otherProfile, 'Administrator cross-profile read').length === 0,
        'Administrator cannot read the fixture profile directly');
    await ineligible(missing, 'Profileless session');
    denied(await rpc('get_my_role'), 'Unsigned role RPC');
    denied(await semesters(), 'Unsigned semester read');
    denied(await updateName(undefined, 'Runtime denied probe'), 'Unsigned My Account write');
    await rejectAdmin(undefined, operation(fixture, 'set_status', false), 'Unsigned admin RPC');
    await rejectAdmin(missing, operation(fixture, 'set_status', false), 'Profileless admin RPC');
    pass(phase);

    phase = 'administrative denials, self protection and promotion';
    for (const [actor, label] of [[staff, 'OSWE Staff'], [security, 'Security Office']]) {
        await rejectAdmin(actor, operation(fixture, 'set_status', false), `${label} deactivates another account`);
        await rejectAdmin(actor, operation(fixture, 'change_role', 'security_office'),
            `${label} changes staff fixture role to Security Office`);
    }
    await rejectAdmin(admin, operation(admin, 'set_status', false), 'Administrator self-deactivation');
    await rejectAdmin(admin, operation(admin, 'change_role', 'oswe_staff'), 'Administrator self-demotion');
    await rejectAdmin(admin, operation(fixture, 'change_role', 'oswe_admin'), 'Administrator promotion of staff fixture');
    await rejectAdmin(admin, operation(missing, 'set_status', true), 'Administrator status change for missing target', '22023');
    pass(phase);

    phase = 'direct profile grants and private audit boundary';
    const unusedId = randomUUID();
    const fixturePath = `/rest/v1/profiles?id=eq.${fixture.id}`;
    const rollback = { Prefer: 'tx=rollback' };
    const probes = {
        full_name: 'Direct profile write probe',
        role: 'security_office',
        is_active: false,
        session_valid_after: new Date().toISOString(),
    };
    for (const [actor, label] of [...active, [fixture, 'Disposable fixture (own profile)']]) {
        for (const [field, value] of Object.entries(probes)) {
            denied(await request(fixturePath, {
                token: actor.token, method: 'PATCH', body: { [field]: value }, headers: rollback,
            }), `${label} direct profile PATCH of ${field}`);
        }
        denied(await request('/rest/v1/profiles', { token: actor.token, method: 'POST',
            body: { id: unusedId, full_name: 'Unused runtime probe', role: 'oswe_staff' }, headers: rollback,
        }), `${label} direct profile INSERT`);
        denied(await request(fixturePath, { token: actor.token, method: 'DELETE', headers: rollback }),
            `${label} direct profile DELETE of fixture`);
    }
    check(isDeepStrictEqual(await profile(fixture, 'Read fixture after direct write denials'), [original]),
        'Fixture profile is unchanged after all direct write denials');
    const privateRead = await request('/rest/v1/admin_account_audit?select=id&limit=1', {
        token: admin.token, headers: { 'Accept-Profile': 'csupak_private' },
    });
    if (!['PGRST106', '42501'].includes(privateRead.code) || privateRead.ok) {
        diagnostic(privateRead, 'Administrator private audit read expected denial');
    }
    pass(phase);

    phase = 'My Account and complaint passkey denial';
    for (const [actor, expected] of active) {
        const row = await eligible(actor, expected);
        denied(await updateName(actor, 'x'), `${expected} one-character My Account name`, '22023');
        check(accepted(await updateName(actor, `  ${row.full_name}  `), `${expected} My Account save`) === row.full_name,
            `${expected} My Account returns the trimmed name`);
        check(isDeepStrictEqual(await profile(actor, `${expected} own profile after My Account save`), [row]),
            `${expected} existing profile values stay intact`);
    }
    for (const [actor, label] of [[admin, 'Administrator'], [staff, 'OSWE Staff']]) {
        check(Array.isArray(accepted(await rpc('get_interview_complaint_summaries', {}, actor),
            `${label} interview summary read`)), `${label} interview summaries return a list`);
    }
    denied(await rpc('get_interview_complaint_summaries', {}, security), 'Security Office interview summary read');
    check(accepted(await rpc('verify_complaint_passkey', { entered_passkey: 'runtime-invalid-probe' }, admin),
        'Verify unconfigured complaint passkey') === false, 'Unconfigured complaint passkey returns false');
    denied(await rpc('get_complaints_with_passkey', { entered_passkey: 'runtime-invalid-probe' }, admin),
        'Complaint read with an unconfigured passkey');
    pass(phase);

    await storageAndLifecycle(admin, staff, security, fixture, original);
}

async function storageAndLifecycle(admin, staff, security, fixture, original) {
    const bucket = '/storage/v1/object/violation-photos';
    const prefix = `runtime-account-access/${randomUUID()}`;
    const paths = [];
    console.log(`Storage cleanup prefix: violation-photos/${prefix}/`);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPgSjMGAAEhAKQcFuK6AAAAAElFTkSuQmCC', 'base64');
    const upload = (actor, path) => request(`${bucket}/${path}`,
        { token: actor.token, method: 'POST', body: png, headers: { 'Content-Type': 'image/png' } });
    const remove = (actor, path) => request(`${bucket}/${path}`, { token: actor.token, method: 'DELETE' });
    const sign = (actor, path) => request(`/storage/v1/object/sign/violation-photos/${path}`,
        { token: actor.token, method: 'POST', body: { expiresIn: 60 } });
    const storageDenied = (result, label) => {
        const status = Number(result.data?.statusCode ?? result.status);
        if (result.ok || ![400, 401, 403, 404].includes(result.status)
            || ![401, 403, 404].includes(status)) diagnostic(result, `${label} expected denial`);
    };
    try {
        phase = 'private Storage upload, sign, download, and delete policy';
        for (const [label, actor] of [['admin', admin], ['staff', staff], ['security', security]]) {
            const path = `${prefix}/${label}.png`;
            paths.push(path);
            accepted(await upload(actor, path), `${label} Storage upload`);
            check(isDeepStrictEqual(accepted(await photo(actor, path), `${label} Storage download`), png),
                `${label} Storage download matches the uploaded PNG`);
            check(typeof accepted(await sign(actor, path), `${label} Storage sign`)?.signedURL === 'string',
                `${label} Storage sign returns a URL`);
            if (actor !== admin) {
                const result = await remove(actor, path);
                if (!result.ok) storageDenied(result, `${label} Storage delete`);
                accepted(await photo(admin, path), `${label} delete attempt left the object readable`);
            }
        }
        const path = paths[0];
        const signedOut = await photo(undefined, path);
        storageDenied(signedOut, 'Unsigned Storage download');
        pass(phase);

        phase = 'role change, operation replay, no-op, and stale role session';
        const change = operation(fixture, 'change_role', 'security_office');
        await apply(admin, change, original, 'Administrator changes fixture role');
        check(accepted(await adminRpc(admin, change), 'Exact role-change replay') === 'applied',
            'Exact role-change replay returns applied');
        denied(await adminRpc(admin, { ...change, p_role: 'oswe_staff' }), 'Conflicting operation ID reuse', '22023');
        await ineligible(fixture, 'Session issued before role change');
        storageDenied(await sign(fixture, path), 'Storage sign with a pre-role-change session');
        const fresh = await signIn(fixture.credentials);
        check(jwtSession(fresh.token) !== jwtSession(fixture.token), 'Sign-in after role change creates a new session');
        const changed = await eligible(fresh, 'security_office', 'Fixture signed in after role change');
        check(changed.session_valid_after && changed.session_valid_after !== original.session_valid_after,
            'Role change advances the fixture cutoff');
        const noOp = operation(fixture, 'change_role', 'security_office');
        await apply(admin, noOp, changed, 'No-op role request', 'no_change');
        check(accepted(await adminRpc(admin, noOp), 'No-op role replay') === 'no_change', 'No-op replay returns no_change');
        check(isDeepStrictEqual(await profile(fresh, 'Read fixture after no-op replay'), [changed]),
            'No-op preserves the fixture profile and cutoff');
        pass(phase);

        phase = 'deactivation, reactivation, token refresh, and fresh sign-in';
        await apply(admin, operation(fixture, 'set_status', false), changed, 'Administrator deactivates fixture');
        await ineligible(fresh, 'Session issued before deactivation');
        storageDenied(await photo(fresh, path), 'Inactive fixture Storage download');
        storageDenied(await sign(fresh, path), 'Inactive fixture Storage sign');
        const deniedUpload = `${prefix}/inactive.png`;
        paths.push(deniedUpload);
        storageDenied(await upload(fresh, deniedUpload), 'Inactive fixture Storage upload');
        paths.pop();

        // Inactive profiles can still get an Auth session. That session must not
        // become eligible just because the profile is later reactivated.
        const whileInactive = await signIn(fixture.credentials);
        await ineligible(whileInactive, 'New session for an inactive fixture');
        // The audit verifier compares this unknown cutoff with the prior receipt.
        await apply(admin, operation(fixture, 'set_status', true), { ...changed, is_active: false,
            session_valid_after: undefined }, 'Administrator reactivates fixture');
        await ineligible(fresh, 'Pre-deactivation session after reactivation');
        await ineligible(whileInactive, 'Session issued while inactive after reactivation');
        const refreshed = session(accepted(await request('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST', body: { refresh_token: whileInactive.refresh },
        }), 'Refresh a session issued while inactive'));
        check(refreshed.id === fixture.id && jwtSession(refreshed.token) === jwtSession(whileInactive.token),
            'Refresh preserves the fixture identity and old session ID');
        await ineligible(refreshed, 'Refreshed pre-reactivation session');
        const reauthenticated = await signIn(fixture.credentials);
        const current = await eligible(reauthenticated, 'security_office', 'Fixture signed in after reactivation');
        check(jwtSession(reauthenticated.token) !== jwtSession(refreshed.token), 'Reauthentication creates a new session');
        check(current.session_valid_after && current.session_valid_after !== changed.session_valid_after,
            'Status changes advance the fixture cutoff');
        accepted(await photo(reauthenticated, path), 'Storage download after reauthentication');
        check(accepted(await updateName(reauthenticated, '  Runtime Account Fixture  '), 'Change fixture name') === 'Runtime Account Fixture',
            'Changing fixture name returns the trimmed name');
        check((await profile(reauthenticated, 'Read fixture after name change'))[0]?.full_name === 'Runtime Account Fixture',
            'Changed fixture name is persisted');
        check(accepted(await updateName(reauthenticated, original.full_name), 'Restore fixture name') === original.full_name,
            'Restoring fixture name returns the original name');
        await apply(admin, operation(fixture, 'change_role', 'oswe_staff'), current, 'Restore fixture role to OSWE Staff');
        await eligible(await signIn(fixture.credentials), 'oswe_staff', 'Fixture signed in after role restoration');
        pass(phase);
    } finally {
        try {
            await cleanupRuntimePhotos(request, admin.token, prefix, paths);
        } catch (error) {
            const reason = error instanceof StorageCleanupFailure ? error.message : 'Storage request could not complete';
            console.error(`Cleanup could not verify deletion under violation-photos/${prefix}/. ${reason}. Check the TEST dashboard.`);
            process.exitCode = 1;
        }
    }
}

async function race() {
    const working = await account('working administrator (observer only)');
    const a = await account('disposable runtime administrator A');
    const b = await account('disposable runtime administrator B');
    check(new Set([working.id, a.id, b.id]).size === 3, 'Race accounts are distinct');
    phase = 'concurrent reciprocal deactivation of disposable administrators';
    await eligible(working, 'oswe_admin', 'Working administrator before race');
    const before = await Promise.all([
        eligible(a, 'oswe_admin', 'Disposable administrator A'),
        eligible(b, 'oswe_admin', 'Disposable administrator B'),
    ]);
    check(before.every((p) => p.full_name.startsWith('Runtime Admin Fixture ')),
        'Both race fixtures have the required test name prefix');
    const attempts = [[a, b, before[1]], [b, a, before[0]]].map(([actor, target, row]) =>
        ({ actor, target, row, args: operation(target, 'set_status', false) }));
    console.log('Race operation IDs for recovery: ' + attempts.map(({ args }) => args.p_operation_id).join(', '));
    const responses = await Promise.allSettled(attempts.map(({ actor, args }) => adminRpc(actor, args)));
    check(responses.every((response) => response.status === 'fulfilled'), 'Both race requests returned a response');
    const results = responses.map(({ value }) => value);
    const winners = results.filter((result) => result.ok && result.data === 'applied');
    for (const [i, attempt] of attempts.entries()) {
        expectReceipt(attempt.actor, attempt.args, results[i].ok ? 'applied' : null, attempt.row);
    }
    check(winners.length === 1, 'Exactly one race request applied');
    for (const [i, result] of results.entries()) {
        if (result.ok) await ineligible(attempts[i].target, 'Deactivated race fixture');
        else denied(result, 'Losing administrator race request');
    }
    await eligible(working, 'oswe_admin', 'Working administrator after race');
    await eligible(attempts[results.findIndex((result) => result.ok)].actor, 'oswe_admin', 'Winning race fixture');
    pass(phase);
}

async function anonymousIdentity() {
    phase = 'anonymous Auth signup';
    const result = await request('/auth/v1/signup', { method: 'POST', body: { data: {} } });
    if (result.code === 'anonymous_provider_disabled') {
        console.log('SKIP anonymous Auth identity. Anonymous sign-in is disabled on TEST.');
        return;
    }
    const auth = session(accepted(result, 'Anonymous Auth signup'));
    console.log(`Disposable anonymous Auth UUID for fixture and cleanup: ${auth.id}`);
    check(accepted(await request('/auth/v1/user', auth), 'Verify anonymous Auth user')?.is_anonymous === true,
        'Auth identifies the session as anonymous');
    await ineligible(auth, 'Anonymous session without profile');
    phase = 'anonymous Auth identity with an active fixture profile';
    check(await ask('After verifying the active anonymous fixture in TEST, type TEST: ') === 'TEST',
        'Operator confirmed the anonymous TEST fixture');
    await ineligible(auth, 'Anonymous session with active profile');
    await rejectAdmin(auth, operation(auth, 'set_status', false), 'Anonymous Auth identity admin RPC');
    pass(phase);
}

try {
    if (!['core', 'race', 'anonymous'].includes(mode) || !/^[a-z0-9]{20}$/.test(dashboardRef ?? '') || extra.length) {
        console.log('Usage: node scripts/test-account-access.mjs <core|race|anonymous> <TEST dashboard project ref>');
        process.exitCode = 1;
    } else {
        check(process.stdin.isTTY && process.stdout.isTTY, 'Interactive terminal is available for hidden password entry');
        const config = JSON.parse(read('.csupak-test.local.json'));
        const production = read('js/supabase.js').match(/const\s+supabaseUrl\s*=\s*["']https:\/\/([a-z0-9]{20})\.supabase\.co\/?["']/)?.[1];
        check(production && dashboardRef !== production && config.projectRef === dashboardRef,
            'Dashboard reference matches saved TEST configuration and differs from production');
        base = `https://${dashboardRef}.supabase.co`;
        check(config.projectUrl === base && /^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey),
            'Saved TEST URL and publishable key format are valid');
        check(execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim() === 'development',
            'Current git branch is development');
        key = config.publishableKey;
        check(await ask(`Target ${base}. Type CSUPAK-TEST to authorize the ${mode} suite: `) === 'CSUPAK-TEST',
            'Operator confirmed the TEST target');
        accepted(await request('/auth/v1/health'), 'TEST Auth health check');
        await { core, race, anonymous: anonymousIdentity }[mode]();
    }
} catch (error) {
    // Only messages authored by the test runner are safe to show here.
    console.error(`FAIL ${phase}. ${error instanceof CheckFailure ? error.message : 'Could not complete the check.'}`);
    process.exitCode = 1;
} finally {
    if (receipts.length) console.log(`Expected audit receipts (private SQL input):\n${JSON.stringify(receipts)}`);
    for (const auth of liveSessions.values()) {
        try {
            accepted(await request('/auth/v1/logout?scope=local', { token: auth.token, method: 'POST' }), 'Local TEST session logout');
        } catch {
            console.error('Could not verify logout for a test session. See the cleanup guide.');
            process.exitCode = 1;
        }
    }
}
