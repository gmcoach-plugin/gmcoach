import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { auditTrainingCycle, trainingCycleSchema } from '../plugin/training-cycle-audit.mjs';

const full = (over = {}) => ({
  progressionLevers: ['reps', 'sets'], setSchemes: ['straight'],
  exerciseRotation: { anchors: 'kept', accessories: 'rotated', reason: 'Kotwice stałe, akcesoria rotują.' },
  sectionRotation: { warmup: 'rotated', stretching: 'kept', reason: 'Nowa rozgrzewka w bloku.' }, ...over
});
function cycle(extras = [full(), full({ progressionLevers: ['rir', 'set-scheme'] }), full({ progressionLevers: ['reps', 'sets'] })]) {
  const ids = ['A', 'B', 'C'];
  return {
    totalWeeks: 6, sessionsPerWeek: 2, sessionMinutes: 90,
    blocks: ids.map((id, i) => ({ id, startWeek: i * 2 + 1, endWeek: i * 2 + 2, progression: 'Dodaj serię po osiągnięciu reps.', rotation: 'Zachowaj kotwice.', ...extras[i] })),
    sessions: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(id => ({ id, estimatedMinutes: 85, warmup: 'executable', stretching: 'executable' })),
    weeks: Array.from({ length: 6 }, (_, i) => ({ week: i + 1, blockId: ids[Math.floor(i / 2)], sessionIds: [ids[Math.floor(i / 2)] + '1', ids[Math.floor(i / 2)] + '2'] })),
    deload: { strategy: 'scheduled', week: 6, rationale: 'Indywidualna redukcja stresu.', adjustmentCriteria: 'Mniej serii; wcześniejsza ocena przy pogorszeniu.' }
  };
}
const codes = list => list.map(x => x.code);
const rotationCodes = ['progression_levers_missing', 'set_schemes_missing', 'exercise_rotation_missing', 'section_rotation_missing', 'progression_repeated', 'section_rotation_stale', 'anchor_rotation_churn'];

test('schema exposes optional rotation fields', () => {
  const block = trainingCycleSchema.properties.blocks.items;
  assert.equal(block.additionalProperties, false);
  for (const key of ['progressionLevers', 'setSchemes', 'exerciseRotation', 'sectionRotation']) { assert.ok(block.properties[key]); assert.ok(!block.required.includes(key)); }
  assert.equal(block.properties.progressionLevers.items.enum.length, 10);
  assert.equal(block.properties.setSchemes.items.enum.length, 9);
});

test('valid fields produce no rotation issues or warnings', () => {
  const result = auditTrainingCycle(cycle());
  assert.deepEqual(result.issues, []);
  assert.equal(result.organizationComplete, true);
  assert.deepEqual(codes(result.warnings).filter(c => rotationCodes.includes(c)), []);
});

test('invalid shapes become issues', () => {
  const input = cycle([
    full({ progressionLevers: ['reps', 'reps'], setSchemes: ['zigzag'] }),
    full({ progressionLevers: ['kg'], exerciseRotation: { anchors: 'swapped', accessories: 'kept', reason: 'x' }, sectionRotation: { warmup: 'kept', stretching: 'kept', reason: '' } }),
    full({ progressionLevers: [] })
  ]);
  const c = codes(auditTrainingCycle(input).issues);
  for (const code of ['block_progression_levers', 'block_set_schemes', 'block_exercise_rotation', 'block_section_rotation']) assert.ok(c.includes(code), code);
  assert.equal(auditTrainingCycle(input).organizationComplete, false);
});

test('missing fields are derived from text or warn without blocking organization', () => {
  const result = auditTrainingCycle(cycle([{}, {}, {}]));
  assert.equal(result.organizationComplete, true);
  assert.equal(codes(result.warnings).filter(c => c === 'block_fields_derived').length, 3);
  for (const code of rotationCodes.slice(0, 3)) assert.equal(codes(result.warnings).filter(c => c === code).length, 0, code);
  assert.equal(codes(result.warnings).filter(c => c === 'section_rotation_missing').length, 3);
});

test('consecutive working blocks warn on repeated levers, stale sections and anchor churn', () => {
  const stale = { warmup: 'kept', stretching: 'kept', reason: 'Bez zmian.' };
  const churn = { anchors: 'rotated', accessories: 'rotated', reason: 'Zmiana.' };
  const result = auditTrainingCycle(cycle([full({ sectionRotation: stale, exerciseRotation: churn }), full({ progressionLevers: ['sets', 'reps'], sectionRotation: stale, exerciseRotation: churn }), full()]));
  const c = codes(result.warnings);
  for (const code of ['progression_repeated', 'section_rotation_stale', 'anchor_rotation_churn']) assert.equal(c.filter(x => x === code).length, 1, code);
});

test('scheduled deload block is exempt from consecutive comparisons', () => {
  const stale = { warmup: 'kept', stretching: 'kept', reason: 'Deload.' };
  const churn = { anchors: 'rotated', accessories: 'kept', reason: 'Zmiana.' };
  const extras = [full(), full({ progressionLevers: ['rir'], sectionRotation: stale, exerciseRotation: churn }), full({ progressionLevers: ['rir'], sectionRotation: stale, exerciseRotation: churn })];
  assert.deepEqual(codes(auditTrainingCycle(cycle(extras)).warnings).filter(c => rotationCodes.includes(c)), []);
  const input = cycle(extras); input.deload = { strategy: 'readiness-triggered', rationale: 'Wg gotowości.', adjustmentCriteria: 'Spadek wyników.' };
  const c = codes(auditTrainingCycle(input).warnings);
  for (const code of ['progression_repeated', 'section_rotation_stale', 'anchor_rotation_churn']) assert.ok(c.includes(code), code);
});

test('mcp_server cycle block accepts the optional fields with the same enums', async () => {
  const source = await readFile(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  assert.match(source, /cycleExactKeys\(block, \[[^\]]*'progressionLevers', 'setSchemes', 'exerciseRotation', 'sectionRotation'\], 'cycle block'\)/);
  const schemaLine = source.split(/\r?\n/).find(line => line.includes("blocks: { type: 'array', minItems: 1, maxItems: 52") && line.includes('progressionOverrideUserAuthorized'));
  assert.ok(schemaLine);
  const block = trainingCycleSchema.properties.blocks.items.properties;
  for (const value of [...block.progressionLevers.items.enum, ...block.setSchemes.items.enum]) assert.ok(schemaLine.includes("'" + value + "'"), value);
  for (const key of ['exerciseRotation', 'sectionRotation', 'anchors', 'accessories', 'warmup', 'stretching']) assert.ok(schemaLine.includes(key + ':'), key);
});

