const bucket = 'tenderscope-cold-archive';
const format = /^candidates\/[0-9a-f]{64}\.json\.gz$/;

export async function removeDetachedArchives({ db, storage, limit = 16 }) {
  const { objects } = await db.rpc('prepare_detached_archive_cleanup', { p_limit: limit });
  if (!Array.isArray(objects) || objects.length > 32 ||
      objects.some(object => typeof object?.key !== 'string' || !format.test(object.key) || typeof object.present !== 'boolean')) {
    throw new Error('invalid_detached_archive_batch');
  }
  if (!objects.length) return { status: 'idle', prepared: 0, confirmed: 0 };

  const presentKeys = objects.filter(object => object.present).map(object => object.key);
  let storageFailed = false;
  if (presentKeys.length) {
    try {
      const { error } = await storage.from(bucket).remove(presentKeys);
      storageFailed = Boolean(error);
    } catch {
      storageFailed = true;
    }
  }

  // An HTTP error can still follow a partial deletion. Confirm what the
  // Storage metadata can prove, and allow an interrupted batch to retry.
  const checked = await db.rpc('confirm_detached_archive_cleanup', { p_keys: objects.map(object => object.key) });
  return { ...checked, status: storageFailed ? 'storage_retry' : checked.status, prepared: objects.length };
}
