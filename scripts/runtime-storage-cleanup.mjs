export class StorageCleanupFailure extends Error {}

export async function cleanupRuntimePhotos(request, token, prefix, paths) {
    if (paths.length === 0) return;

    // The bulk endpoint reports which keys were actually deleted, including
    // when RLS silently filters the requested keys.
    const deletion = await request('/storage/v1/object/violation-photos', {
        token, method: 'DELETE', body: { prefixes: paths },
    });
    if (!deletion.ok) throw new StorageCleanupFailure(`DELETE returned HTTP ${deletion.status}`);
    const deleted = Array.isArray(deletion.data) ? new Set(deletion.data.map((row) => row?.name)) : null;
    if (deleted?.size !== paths.length || !paths.every((path) => deleted.has(path))) {
        throw new StorageCleanupFailure('DELETE did not confirm all expected keys');
    }

    const listing = await request('/storage/v1/object/list/violation-photos', {
        token, method: 'POST', body: { prefix, limit: 1 },
    });
    if (!listing.ok) throw new StorageCleanupFailure(`Storage listing returned HTTP ${listing.status}`);
    if (!Array.isArray(listing.data)) throw new StorageCleanupFailure('Storage listing returned an invalid result');
    if (listing.data.length > 0) throw new StorageCleanupFailure('Objects remain under the test prefix');
}
