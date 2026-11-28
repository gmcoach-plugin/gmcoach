import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestHistoryChannelTotal, channelAnchor } from '../plugin/history-channel-load.mjs';

const row = (o) => ({ exerciseId: 10, exerciseName: 'Barbell Squat', movementPattern: 'squat', sessionId: 1, observedAt: '2026-11-01T10:00:00Z', unit: 'kg', equipment: 'barbell', reps: 8, ...o });

test('barbell and dual handles use the total of both cables', () => {
  assert.equal(channelAnchor({ left: 11.5, right: 11.5, side: 0 }, 'barbell').value, 23);
  assert.equal(channelAnchor({ left: 18, right: 18, side: 0 }, 'dual-handle').value, 36);
  const r = suggestHistoryChannelTotal({ target: { exerciseId: 10, equipment: 'barbell' }, setReps: [8], unit: 'kg', history: [row({ left: 20, right: 20 }), row({ left: 5, right: 5, warmup: true, observedAt: '2026-11-02T10:00:00Z' })] });
  assert.equal(r.suggestedLoad, 40); assert.equal(r.provenance.rule, 'two-cable-total'); assert.equal(r.approximate, false); assert.equal(r.fixedCustomizeSettingVerified, false);
});

test('explicit side and single cable', () => {
  assert.equal(channelAnchor({ left: 9, right: 12, side: 2 }, 'single-cable').value, 12);
  assert.deepEqual(channelAnchor({ left: 15, side: 0 }, 'single-cable'), { value: 15, rule: 'single-cable-channel', channels: { left: 15 } });
});

test('analog from same movement pattern is approximate', () => {
  const r = suggestHistoryChannelTotal({ target: { exerciseId: 99, equipment: 'dual-handle', exerciseName: 'Kneeling Dual-Handle Chest Press', movementPattern: 'horizontal-press' }, setReps: [10], unit: 'kg', history: [row({ exerciseId: 20, exerciseName: 'Incline Dual-Handle Chest Press', movementPattern: 'horizontal-press', equipment: 'dual-handle', reps: 10, left: 15, right: 15 }), row({ left: 50, right: 50 })] });
  assert.equal(r.approximate, true); assert.equal(r.analogSource.exerciseId, 20); assert.equal(r.suggestedLoad, 30); assert.equal(r.confidence, 'low');
});

test('deload applies Epley and fraction, rounded down to the device step (>10 kg whole kg)', () => {
  const r = suggestHistoryChannelTotal({ target: { exerciseId: 10, equipment: 'barbell' }, setReps: [10], unit: 'kg', history: [row({ reps: 8, left: 20, right: 20 })], deload: true });
  assert.equal(r.suggestedLoad, Math.floor(40 * (1 + 8 / 30) / (1 + 10 / 30) * 0.85)); // 32,3 -> 32
});

test('rirTarget: 64 kg x 10 (anchor RIR 0.5) -> 12 reps at RIR 2 is about 58 kg', () => {
  const r = suggestHistoryChannelTotal({ target: { exerciseId: 10, equipment: 'barbell' }, setReps: [12], unit: 'kg', history: [row({ reps: 10, left: 32, right: 32 })], rirTarget: 2 });
  assert.ok(Math.abs(r.suggestedLoad - 58) <= 1, String(r.suggestedLoad));
  assert.equal(r.suggestedLoad, Math.round(r.suggestedLoad));
  assert.equal(r.rirTarget, 2); assert.equal(r.anchorRir, 0.5); assert.equal(r.provenance.conversion, 'epley-rir');
});

test('no history and no analog asks for input', () => {
  const r = suggestHistoryChannelTotal({ target: { exerciseId: 5, equipment: 'barbell', movementPattern: 'hinge' }, setReps: [5], unit: 'kg', history: [row({ left: 20, right: 20 })] });
  assert.equal(r.status, 'needsInput');
});

