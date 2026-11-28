import test from 'node:test';
import assert from 'node:assert/strict';
import { readOfficialCourses as read } from '../plugin/official-courses.mjs';
// Synthetic values with field names evidenced by the pinned reference client browse UI.
const row = { id: 77, courseTitle: 'Strength Workout', durationMinute: 30, difficultyId: 1,
  categoryList: [{ categoryName: 'Strength' }], isPermission: false };

test('one page read filters title/category and never bypasses permission', async () => {
  const calls = [];
  const result = await read({ query: 'strength', apiRead: async path => { calls.push(path); return { code: 0, data: [row] }; } });
  assert.deepEqual(calls, ['/app/v2/course/page?pageNo=1&pageSize=200']);
  assert.equal(result.courses[0].isPermission, false);
  assert.equal(result.programCreatedByThisCall, false);
  assert.equal(result.paginationExhaustive, false);
  assert.equal(result.partial, false);
});

test('scan/result caps expose omitted coverage and do not follow pages', async () => {
  const result = await read({ apiRead: async () => Array.from({ length: 250 }, (_, i) => ({ ...row, id: i + 1 })) });
  assert.equal(result.scannedCount, 200);
  assert.equal(result.courses.length, 50);
  assert.equal(result.omittedCount, 200);
  assert.equal(result.partial, true);
});

test('detail keeps raw course fields without interpreting dose or weight units', async () => {
  let path;
  const result = await read({ courseId: '77', apiRead: async p => { path = p; return {
    ...row, actionLibraryList: [{ title: 'Press', setsAndReps: '8,8', completionMethod: 1, recommendedWeight: 20,
      token: 'private-secret', mainMuscleGroupName: 'Chest' }], token: 'private-secret'
  }; } });
  assert.equal(path, '/app/v2/course/info/77?weightConfig=1');
  assert.equal(result.exercises[0].setsAndReps, '8,8');
  assert.equal(result.exercises[0].recommendedWeight, 20);
  for (const key of ['unit', 'weightUnit', 'reps', 'durationSeconds']) assert.equal(result.exercises[0][key], undefined);
  assert.doesNotMatch(JSON.stringify(result), /private-secret/);
  assert.equal((await read({ courseId: 78, apiRead: async () => row })).course, null);
});

test('bad identifiers/query reject without reading; errors and malformed responses are sanitized', async () => {
  let calls = 0;
  for (const courseId of [0, -1, 1.5, true, '../plugin/77', '1'.repeat(100_000)]) await assert.rejects(read({ courseId, apiRead: async () => { calls++; } }), TypeError);
  await assert.rejects(read({ query: 'x'.repeat(201), apiRead: async () => { calls++; } }), TypeError);
  assert.equal(calls, 0);
  const failed = await read({ apiRead: async () => { throw new Error('private-secret'); } });
  assert.deepEqual(failed.issues, ['official-course-read-failed']);
  assert.doesNotMatch(JSON.stringify(failed), /private-secret/);
  assert.equal((await read({ apiRead: async () => ({ records: [row] }) })).partial, true);
});

test('missing/unsupported structure and bounded nested lists disclose partial coverage', async () => {
  const missing = await read({ courseId: 77, apiRead: async () => row });
  assert.ok(missing.issues.includes('missing-or-invalid-action-library-list'));
  const result = await read({ courseId: 77, apiRead: async () => ({ ...row,
    secret: { token: 'private-secret' }, actionLibraryList: Array.from({ length: 250 }, () => ({ title: 'Exercise', nested: { token: 'private-secret' } })) }) });
  assert.equal(result.exercises.length, 200);
  assert.equal(result.partial, true);
  assert.doesNotMatch(JSON.stringify(result), /private-secret/);
});

test('duplicates, invalid rows and oversized text/categories remain bounded', async () => {
  const result = await read({ apiRead: async () => [null, row, row, { ...row, id: 78,
    courseTitle: 'x'.repeat(100_000), categoryList: Array(50).fill({ categoryName: 'x'.repeat(100_000) }) }] });
  assert.equal(result.courses.length, 2);
  assert.equal(result.courses[1].courseTitle.length, 160);
  assert.equal(result.courses[1].categoryList.length, 30);
  assert.equal(result.partial, true);
});

test('empty detail and unsupported list/category objects do not report complete coverage', async () => {
  const empty = await read({ courseId: 77, apiRead: async () => ({ ...row, actionLibraryList: [] }) });
  assert.ok(empty.issues.includes('empty-course-exercise-list'));
  const nested = await read({ apiRead: async () => [{ ...row, hiddenStructure: { secret: 'private-secret' },
    categoryList: [{ categoryName: 'Strength', nested: { secret: 'private-secret' } }] }] });
  assert.ok(nested.issues.includes('unsupported-course-structure'));
  assert.ok(nested.issues.includes('unsupported-category-structure'));
  assert.doesNotMatch(JSON.stringify(nested), /private-secret/);
});
