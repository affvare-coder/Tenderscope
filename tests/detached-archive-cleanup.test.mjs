import test from 'node:test';
import assert from 'node:assert/strict';
import { removeDetachedArchives } from '../ops/storage/remove-detached-archives.mjs';

const first = `candidates/${'1'.repeat(64)}.json.gz`;
const second = `candidates/${'2'.repeat(64)}.json.gz`;

function harness(objects, storageError = null) {
  const operations = [];
  return {
    operations,
    dependencies: {
      db: { async rpc(name, args) {
        operations.push([name, args]);
        if (name === 'prepare_detached_archive_cleanup') return { objects };
        return { status: 'checked', confirmed: 1 };
      } },
      storage: { from(bucket) {
        return { async remove(keys) {
          operations.push([bucket, keys]);
          if (storageError instanceof Error) throw storageError;
          return { error: storageError };
        } };
      } },
    },
  };
}

test('removes only prepared files still present and proves absence for the whole batch', async () => {
  const { operations, dependencies } = harness([{ key: first, present: true }, { key: second, present: false }]);
  const result = await removeDetachedArchives(dependencies);
  assert.deepEqual(operations, [
    ['prepare_detached_archive_cleanup', { p_limit: 16 }],
    ['tenderscope-cold-archive', [first]],
    ['confirm_detached_archive_cleanup', { p_keys: [first, second] }],
  ]);
  assert.deepEqual(result, { status: 'checked', prepared: 2, confirmed: 1 });
});

test('does not send malformed, unrelated or empty paths to Storage', async () => {
  const { operations, dependencies } = harness([{ key: '../private/bid.docx', present: true }]);
  await assert.rejects(removeDetachedArchives(dependencies), /invalid_detached_archive_batch/);
  assert.equal(operations.length, 1);
  const empty = harness([]);
  assert.deepEqual(await removeDetachedArchives(empty.dependencies), { status: 'idle', prepared: 0, confirmed: 0 });
  assert.equal(empty.operations.length, 1);
});

test('confirms partial removal after a failed Storage request', async () => {
  const { operations, dependencies } = harness([{ key: first, present: true }, { key: second, present: true }], new Error('timeout'));
  const result = await removeDetachedArchives(dependencies);
  assert.deepEqual(result, { status: 'storage_retry', prepared: 2, confirmed: 1 });
  assert.deepEqual(operations.at(-1), ['confirm_detached_archive_cleanup', { p_keys: [first, second] }]);
});
