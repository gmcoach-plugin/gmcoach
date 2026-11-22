import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { readReviewedPlanRecord, writeReviewedPlanRecord, deleteReviewedPlanRecord } from '../reviewed-plan-store.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gm-review-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
const filename = (directory, code) => path.join(directory, 'reviewed-plans', createHash('sha256').update(code).digest('hex') + '.json');

test('reviewed store round trips isolated records, replaces atomically and deletes idempotently', async t => {
  const directory = await fixture(t);
  assert.equal(await readReviewedPlanRecord(directory, 'abc'), null);
  await writeReviewedPlanRecord(directory, 'abc', { templateCode: 'abc', sets: [1, 2] });
  await writeReviewedPlanRecord(directory, 'def', { templateCode: 'def', sets: [3] });
  await writeReviewedPlanRecord(directory, 'abc', { templateCode: 'abc', sets: [4] });
  assert.deepEqual(await readReviewedPlanRecord(directory, 'abc'), { templateCode: 'abc', sets: [4] });
  assert.deepEqual(await readReviewedPlanRecord(directory, 'def'), { templateCode: 'def', sets: [3] });
  assert.equal((await readdir(path.join(directory, 'reviewed-plans'))).length, 2);
  assert.equal(await deleteReviewedPlanRecord(directory, 'abc'), true);
  assert.equal(await deleteReviewedPlanRecord(directory, 'abc'), false);
});

test('reviewed store rejects unsafe codes and JSON before touching disk or evaluating getters', async t => {
  const directory = await fixture(t);
  for (const code of ['', '../x', 'x/y', 'x'.repeat(129), 'a b']) await assert.rejects(writeReviewedPlanRecord(directory, code, {}));
  const cycle = { templateCode: 'abc' }; cycle.self = cycle;
  let called = false;
  const accessor = { templateCode: 'abc', get payload() { called = true; return 1; } };
  for (const record of [cycle, accessor, { templateCode: 'abc', value: NaN }, { templateCode: 'abc', value: undefined }, { templateCode: 'abc', value: new Date() }, { templateCode: 'abc', value: Array(2) }, { templateCode: 'other' }]) await assert.rejects(writeReviewedPlanRecord(directory, 'abc', record));
  assert.equal(called, false);
  assert.deepEqual(await readdir(directory), []);
});

test('malformed, mismatched and oversized records remain unchanged after failed reads', async t => {
  const directory = await fixture(t);
  await mkdir(path.join(directory, 'reviewed-plans'));
  const file = filename(directory, 'abc');
  for (const body of ['{bad', JSON.stringify({ templateCode: 'different' }), ' '.repeat(1_000_001)]) {
    await writeFile(file, body);
    await assert.rejects(readReviewedPlanRecord(directory, 'abc'));
    assert.equal(await readFile(file, 'utf8'), body);
  }
  await assert.rejects(writeReviewedPlanRecord(directory, 'abc', { templateCode: 'abc', body: 'x'.repeat(1_000_001) }));
  assert.equal((await readFile(file)).length, 1_000_001);
});

test('reviewed store rejects nonregular directories and record paths', async t => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, 'reviewed-plans'), 'not a directory');
  await assert.rejects(readReviewedPlanRecord(directory, 'abc'));
  await assert.rejects(writeReviewedPlanRecord(directory, 'abc', { templateCode: 'abc' }));
  await rm(path.join(directory, 'reviewed-plans'));
  await mkdir(filename(directory, 'abc'), { recursive: true });
  await assert.rejects(readReviewedPlanRecord(directory, 'abc'));
  await assert.rejects(deleteReviewedPlanRecord(directory, 'abc'));
});

test('reviewed store rejects profile, store and file symlinks', async t => {
  const directory = await fixture(t);
  const target = path.join(directory, 'target');
  await mkdir(target);
  const profileLink = path.join(directory, 'profile-link');
  try { await symlink(target, profileLink, 'junction'); } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP'].includes(error.code)) { t.skip('Platform does not permit symlink creation.'); return; }
    throw error;
  }
  await assert.rejects(readReviewedPlanRecord(profileLink, 'abc'));
  await symlink(target, path.join(directory, 'reviewed-plans'), 'junction');
  await assert.rejects(writeReviewedPlanRecord(directory, 'abc', { templateCode: 'abc' }));
  await rm(path.join(directory, 'reviewed-plans'));
  await mkdir(path.join(directory, 'reviewed-plans'));
  const external = path.join(target, 'external.json');
  await writeFile(external, JSON.stringify({ templateCode: 'abc' }));
  try { await symlink(external, filename(directory, 'abc'), 'file'); } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP'].includes(error.code)) { t.skip('Platform does not permit file symlinks.'); return; }
    throw error;
  }
  await assert.rejects(readReviewedPlanRecord(directory, 'abc'));
  await assert.rejects(writeReviewedPlanRecord(directory, 'abc', { templateCode: 'abc' }));
  await assert.rejects(deleteReviewedPlanRecord(directory, 'abc'));
  assert.equal(await readFile(external, 'utf8'), JSON.stringify({ templateCode: 'abc' }));
});
