import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as channelLoad from '../plugin/history-channel-load.mjs';

const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
const start = source.indexOf("case 'gm_coach_suggest_load': {");
const end = source.indexOf("case 'gm_coach_get_exercise_history':", start);
assert.ok(start >= 0 && end > start);
const dispatch = vm.runInNewContext(`(async args => { switch ('gm_coach_suggest_load') { ${source.slice(start, end)} } })`, {
  ...channelLoad, resolveProfile: async () => 'synthetic', buildLabattReferenceSuggestion: () => { throw new Error('unexpected'); }
});
const row = (o) => ({ exerciseId: 10, exerciseName: 'Barbell Squat', movementPattern: 'squat', sessionId: 7, observedAt: '2026-11-01T10:00:00Z', set: 2, unit: 'kg', equipment: 'barbell', reps: 8, left: 20, right: 20, ...o });

test('dispatch returns two-cable total with provenance', async () => {
  const r = await dispatch({ exercise_id: 10, load_method: 'history-channel-total', unit: 'kg', set_reps: [8], channel_target: { equipment: 'barbell' }, channel_history: [row({})] });
  assert.equal(r.status, 'suggested'); assert.equal(r.suggestedLoad, 40); assert.equal(r.exerciseId, 10);
  assert.deepEqual(r.provenance.channels, { left: 20, right: 20 }); assert.equal(r.provenance.sessionId, 7);
  assert.equal(r.fixedCustomizeSettingVerified, false); assert.equal(r.writesToSpeediance, false);
});

test('dispatch deload uses explicit fraction', async () => {
  const r = await dispatch({ exercise_id: 10, load_method: 'history-channel-total', unit: 'kg', set_reps: [8], channel_target: { equipment: 'barbell' }, channel_history: [row({})], deload: true, deload_load_fraction: 0.8 });
  assert.equal(r.suggestedLoad, 32); assert.equal(r.deloadLoadFraction, 0.8);
});

test('dispatch returns needsInput without history or analog', async () => {
  const r = await dispatch({ exercise_id: 55, load_method: 'history-channel-total', unit: 'kg', set_reps: [8], channel_target: { equipment: 'barbell', movement_pattern: 'hinge' }, channel_history: [row({})] });
  assert.equal(r.status, 'needsInput'); assert.equal(r.suggestedLoad, null);
});

test('channel_* fields with another method are rejected', async () => {
  await assert.rejects(dispatch({ exercise_id: 10, load_method: 'reference-client-assessment', channel_history: [] }), /history-channel-total/);
  await assert.rejects(dispatch({ exercise_id: 10, deload: true }), /history-channel-total/);
});

