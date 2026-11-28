function assertNear(actual, expected) { assert.ok(Math.abs(actual - expected) <= Number.EPSILON * Math.max(1, Math.abs(expected)) * 4); }
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeStaticLoad, decodeStaticLoad, STATIC_LOAD_PROTOCOLS } from '../plugin/static-load-protocol.mjs';

const legacy = STATIC_LOAD_PROTOCOLS[0];
const verbatim = STATIC_LOAD_PROTOCOLS[1];
const encode = (protocol, load, loadUnit, accountUnit, loadIntent) => encodeStaticLoad({ protocol, load, loadUnit, accountUnit, loadIntent });
const decode = (protocol, wireOrReadback, phase, accountUnit, outputUnit) => decodeStaticLoad({ protocol, wireOrReadback, phase, accountUnit, outputUnit });

test('legacy Customize preserves imperial half-kg snapping; canonical manual kg does not snap', () => {
  assert.equal(encode(legacy, 50, 'lb', 'lb', 'account-customize'), '49.5');
  assert.equal(encode(legacy, 22.7, 'kg', 'lb', 'canonical-kg'), '49.9');
  assert.equal(encode(legacy, 50, 'kg', 'kg', 'account-customize'), '110.0');
});
test('verbatim Customize preserves account units and canonical kg converts to account unit', () => {
  assert.equal(encode(verbatim, 50, 'lb', 'lb', 'account-customize'), '50.0');
  assert.equal(encode(verbatim, 50, 'kg', 'kg', 'account-customize'), '50.0');
  assert.equal(encode(verbatim, 50, 'kg', 'lb', 'canonical-kg'), '110.0');
});
test('legacy wire and GET require distinct explicitly selected phases', () => {
  assertNear(decode(legacy, 110, 'wire', 'lb', 'kg'), 50);
  assertNear(decode(legacy, 50, 'readback', 'lb', 'kg'), 50);
  assertNear(decode(legacy, 50, 'readback', 'lb', 'lb'), 110);
});
test('verbatim wire and GET both use the explicitly provided account unit', () => {
  for (const phase of ['wire', 'readback']) {
    assertNear(decode(verbatim, 110, phase, 'lb', 'kg'), 50);
    assertNear(decode(verbatim, 50, phase, 'kg', 'lb'), 110);
  }
});
test('no default protocol, unit, phase or static intent is guessed', () => {
  assert.throws(() => encode(undefined, 50, 'kg', 'kg', 'canonical-kg'));
  assert.throws(() => encode('auto', 50, 'kg', 'kg', 'canonical-kg'));
  assert.throws(() => encode(legacy, 50, 'lb', 'kg', 'account-customize'));
  assert.throws(() => encode(legacy, 50, 'lb', 'lb', 'canonical-kg'));
  assert.throws(() => decode(legacy, 50, undefined, 'kg', 'kg'));
  assert.throws(() => decode(verbatim, 50, 'wire', undefined, 'kg'));
});
test('named RM cannot use static conversion even with valid numeric markers', () => {
  const base = { protocol: legacy, load: 3.5, loadUnit: 'kg', accountUnit: 'kg', loadIntent: 'canonical-kg' };
  for (const metadata of [{ presetId: 1 }, { namedRM: 'Gain Muscle' }, { rmLevel: 13 }, { loadIntent: 'smart-rm' }]) {
    assert.throws(() => encodeStaticLoad({ ...base, ...metadata }));
  }
  assert.throws(() => decodeStaticLoad({ protocol: legacy, wireOrReadback: 3.5, phase: 'wire', accountUnit: 'kg', outputUnit: 'kg', presetId: 5 }));
});
test('bounds reject malformed, negative and oversized numeric data without clamping', () => {
  for (const load of ['50', null, NaN, Infinity, -1, 1000.1]) assert.throws(() => encode(legacy, load, 'kg', 'kg', 'canonical-kg'));
  assert.equal(encode(legacy, 1000, 'kg', 'kg', 'canonical-kg'), '2200.0');
  assertNear(decode(legacy, 2200, 'wire', 'kg', 'kg'), 1000);
  assert.throws(() => decode(legacy, 1001, 'readback', 'kg', 'kg'));
  assert.throws(() => decode(verbatim, 2201, 'readback', 'lb', 'kg'));
  assert.equal(encode(verbatim, 0, 'kg', 'kg', 'canonical-kg'), '0.0');
});
