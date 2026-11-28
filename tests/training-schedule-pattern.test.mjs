import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { expandTrainingSchedule, diffTrainingSchedule, trainingSchedulePatternSchema } from '../plugin/training-schedule-pattern.mjs';

const weekly = (extra = {}) => ({ schedule: { mode: 'weekly', days: { mon: 'A', wed: 'B' } }, startDate: '2026-10-05', endDate: '2026-10-11', ...extra });
const reservation = code => ({ type: 3, isFinish: 0, code });
test('weekly expansion includes missing/null rest days and is organization only', () => {
  const result = expandTrainingSchedule(weekly());
  assert.deepEqual(result.dates.map(day => day.templateCode), ['A', null, 'B', null, null, null, null]);
  assert.equal(result.expectedSessions, 2);
  assert.equal(result.scientificApproval, false);
  assert.equal(result.mutationSent, false);
  assert.equal(result.operationStatus, 'local-organization-only');
  assert.equal(trainingSchedulePatternSchema.additionalProperties, false);
});
test('cycle uses positive modulo before anchor and inclusive endpoints', () => {
  const result = expandTrainingSchedule({ schedule: { mode: 'cycle', anchor: '2026-10-05', sequence: ['A', null, 'B'] }, startDate: '2026-10-03', endDate: '2026-10-07' });
  assert.deepEqual(result.dates.map(day => day.templateCode), [null, 'B', 'A', null, 'B']);
});
test('protectBefore is inclusive and removes protected dates from operations', () => {
  const result = diffTrainingSchedule(weekly({ protectBefore: '2026-10-07' }), {});
  assert.equal(result.expectedSessions, 0);
  assert.equal(result.changes.length, 4);
  assert.equal(result.changes[0].date, '2026-10-08');
});
test('diff has reference client noop/write/replace/clear semantics, preserves unrelated entries', () => {
  const foreign = { type: 4, isFinish: 0, code: 'A' };
  const finished = { type: 3, isFinish: 1, code: 'A' };
  const unknown = { type: 3, isFinish: '0', code: 'X' };
  const result = diffTrainingSchedule(weekly(), {
    '2026-10-05': [reservation('A'), foreign, finished, unknown],
    '2026-10-06': [reservation('C')],
    '2026-10-07': [reservation('C'), reservation('D')]
  });
  assert.deepEqual(result.changes.map(change => change.action), ['noop', 'clear', 'replace', 'noop', 'noop', 'noop', 'noop']);
  assert.deepEqual(result.changes[0].preservedEntries, [foreign, finished, unknown]);
  assert.deepEqual(result.changes[2].removeCodes, ['C', 'D']);
  assert.equal(diffTrainingSchedule(weekly(), {}).changes[0].action, 'write');
});
test('two matching reservations require replacement rather than a false noop', () => {
  assert.equal(diffTrainingSchedule(weekly(), { '2026-10-05': [reservation('A'), reservation('A')] }).changes[0].action, 'replace');
});
test('strict boundary rejects dates, coercion, unknown fields and invalid codes', () => {
  for (const input of [
    weekly({ startDate: '2026-02-30' }), weekly({ startDate: '2026-1-01' }),
    weekly({ endDate: '2026-10-04' }), weekly({ endDate: '2027-10-06' }),
    weekly({ protectBefore: null }), weekly({ unrelated: true }),
    weekly({ schedule: { mode: 'other', days: {} } }),
    weekly({ schedule: { mode: 'weekly', days: { monday: 'A' } } }),
    weekly({ schedule: { mode: 'weekly', days: { mon: 42 } } }),
    weekly({ schedule: { mode: 'weekly', days: { mon: '' } } }),
    weekly({ schedule: { mode: 'cycle', anchor: '2026-10-05', sequence: [] } }),
    weekly({ schedule: { mode: 'cycle', anchor: '2026-10-05', sequence: [undefined] } }),
    weekly({ schedule: { mode: 'cycle', anchor: '2026-10-05', sequence: Array(367).fill(null) } })
  ]) assert.throws(() => expandTrainingSchedule(input));
  assert.throws(() => diffTrainingSchedule(weekly(), { '2026-02-30': [] }));
  assert.throws(() => diffTrainingSchedule(weekly(), { '2026-10-05': {} }));
});
test('366-day inclusive leap-year range is allowed, 367 rejected', () => {
  const input = weekly({ startDate: '2024-01-01', endDate: '2024-12-31' });
  assert.equal(expandTrainingSchedule(input).dates.length, 366);
  assert.throws(() => expandTrainingSchedule({ ...input, endDate: '2025-01-01' }));
});
test('public MCP dispatch exposes local schedule expansion without science or mutation approval', async () => {
  const source = await readFile(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes("name: 'gm_coach_expand_training_schedule'"));
  assert.ok(source.includes('inputSchema: trainingSchedulePatternSchema'));
  const start = source.indexOf("case 'gm_coach_expand_training_schedule':");
  const end = source.indexOf("case 'speediance_preview_training_cycle':", start);
  assert.ok(start >= 0 && end > start);
  const result = vm.runInNewContext(`(() => { switch ('gm_coach_expand_training_schedule') { ${source.slice(start, end)} } })()`, { args: { schedule: { mode: 'weekly', days: { mon: 'A' } }, startDate: '2026-10-05', endDate: '2026-10-11' }, expandTrainingSchedule });
  assert.equal(result.expectedSessions, 1);
  assert.equal(result.scientificApproval, false);
  assert.equal(result.mutationSent, false);
});
