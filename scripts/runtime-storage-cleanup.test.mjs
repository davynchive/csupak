import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupRuntimePhotos } from './runtime-storage-cleanup.mjs';

const prefix = 'runtime-account-access/offline-test';
const paths = ['admin.png', 'staff.png', 'security.png'].map((name) => `${prefix}/${name}`);
const success = (data) => ({ ok: true, status: 200, data });
const deleted = success(paths.map((name) => ({ name })));
const token = Symbol('mock token');

function run(responses, calls = []) {
    return cleanupRuntimePhotos(async (url, options) => {
        calls.push([url, options]);
        assert(responses.length > 0, 'Unexpected request');
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return response;
    }, token, prefix, paths);
}

test('confirms exact deletions and an empty prefix listing', async () => {
    const calls = [];
    await run([deleted, success([])], calls);
    assert.deepEqual(calls, [
        ['/storage/v1/object/violation-photos', { token, method: 'DELETE', body: { prefixes: paths } }],
        ['/storage/v1/object/list/violation-photos', { token, method: 'POST', body: { prefix, limit: 1 } }],
    ]);
});

test('rejects a partial or empty deletion confirmation', async () => {
    await assert.rejects(run([success(deleted.data.slice(1))]), /did not confirm all expected keys/);
    await assert.rejects(run([success([])]), /did not confirm all expected keys/);
});

test('rejects a remaining object after deletion', async () => {
    await assert.rejects(run([deleted, success([{ name: 'staff.png' }])]), /Objects remain/);
});

test('rejects authorization errors during deletion or listing', async () => {
    await assert.rejects(run([{ ok: false, status: 403 }]), /DELETE returned HTTP 403/);
    await assert.rejects(run([deleted, { ok: false, status: 401 }]), /listing returned HTTP 401/);
});

test('rejects unrelated errors and malformed listing data', async () => {
    await assert.rejects(run([deleted, { ok: false, status: 404 }]), /listing returned HTTP 404/);
    await assert.rejects(run([deleted, success(null)]), /listing returned an invalid result/);
});

test('propagates network failures during either request', async () => {
    const networkError = new TypeError('offline mock');
    await assert.rejects(run([networkError]), TypeError);
    await assert.rejects(run([deleted, networkError]), TypeError);
});
