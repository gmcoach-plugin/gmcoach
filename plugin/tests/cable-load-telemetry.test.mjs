import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveReportedCablePeakLoad as resolve } from '../cable-load-telemetry.mjs';
const set = (detail, extra = {}) => ({ trainingInfoDetail: detail, ...extra });

test('independent cable peaks override derived weights without zipping ragged arrays', () => {
  const result = resolve(set({ weights: [48.5, 47], leftWeights: [12], rightWeights: [12.5] }), { weightUnit: 'kg' });
  assert.equal(result.reportedCablePeakLoad, 24.5);
  assert.equal(result.reportedCablePeakLoadUnit, 'kg');
  assert.equal(result.reportedCablePeakLoadEvidence.algorithm, 'sum-of-independent-side-maxima');
  assert.equal(resolve(set({ leftWeights: [12, 14], rightWeights: [10, 11, 13] })).reportedCablePeakLoad, 27);
  assert.equal(resolve(set({ leftWeights: [25, 25, 25], rightWeights: [25, 25, 25] })).reportedCablePeakLoad, 50);
});

test('explicit pinned sides use only their own maximum including nested side metadata', () => {
  const detail = { leftWeights: [20, 22], rightWeights: [24, 26] };
  assert.equal(resolve(set(detail, { leftRight: 1 })).reportedCablePeakLoad, 22);
  assert.equal(resolve(set({ ...detail, leftRight: '2' })).reportedCablePeakLoad, 26);
  assert.equal(resolve(set({ rightWeights: [24], weights: [99] }, { leftRight: 1 })).reportedCablePeakLoad, undefined);
  assert.equal(resolve(set({ ...detail, leftRight: 2 }, { leftRight: 1 })).reportedCablePeakLoadReason, 'invalid-or-conflicting-side');
});

test('single populated side and weights-only fallback retain explicit provenance', () => {
  assert.equal(resolve(set({ leftWeights: '12,14', rightWeights: [] })).reportedCablePeakLoad, 14);
  const fallback = resolve(set({ weights: [30, 30] }));
  assert.equal(fallback.reportedCablePeakLoad, 30);
  assert.equal(fallback.reportedCablePeakLoadEvidence.algorithm, 'weights-maximum-fallback');
  assert.equal(fallback.reportedCablePeakLoadUnit, 'unknown');
});

test('invalid samples are rejected rather than silently dropped or opposite-side substituted', () => {
  for (const raw of ['1,x', '1,', [1, null], [true], [-1], [Infinity], [NaN], {}, 12]) {
    const result = resolve(set({ leftWeights: raw, rightWeights: [12], weights: [99] }));
    assert.equal(result.reportedCablePeakLoadStatus, 'unknown');
    assert.equal(result.reportedCablePeakLoad, undefined);
  }
  assert.equal(resolve(set({ weights: Array(10_001).fill(1) })).reportedCablePeakLoadStatus, 'unknown');
  assert.equal(resolve(set({ leftWeights: [Number.MAX_VALUE], rightWeights: [Number.MAX_VALUE] })).reportedCablePeakLoadStatus, 'unknown');
});

test('no invented physiological or tonnage fields and no raw private metadata', () => {
  const result = resolve(set({ leftWeights: [0], rightWeights: [0], token: 'secret-token', email: 'private@test' }));
  assert.equal(result.reportedCablePeakLoad, 0);
  assert.doesNotMatch(JSON.stringify(result), /secret-token|private@test/);
  for (const key of ['liftedVolume', 'oneRepMax', 'rir', 'weightMin', 'weightMax']) assert.equal(result[key], undefined);
  assert.equal(result.reportedCablePeakLoadEvidence.perRepTelemetry, false);
  assert.equal(resolve({}), null);
  assert.equal(resolve(null), null);
  assert.throws(() => resolve(set({ weights: [1] }), { weightUnit: 'stone' }), TypeError);
});
