import test from 'node:test';
import assert from 'node:assert/strict';
import { quantizeCustomizeLoad, normalizeRequestedCustomizeLoad } from '../plugin/customize-load-step.mjs';
import { suggestHistoryChannelTotal } from '../plugin/history-channel-load.mjs';
import { verifyUpdatedTemplateReadback } from '../plugin/saved-templates.mjs';

test('krok Customize kg: <=10 co 0,5, >10 pełne kg (rzeczywiste liczby zapisu 2026-11-11)', () => {
  for (const [kg, stored] of [[5.5, 5.5], [9.5, 9.5], [10, 10], [54.5, 54], [57.5, 57], [50.5, 50], [39.5, 39], [29.5, 29], [65.5, 65], [25.5, 25], [49.5, 49], [59.5, 59]])
    assert.equal(quantizeCustomizeLoad(kg, 'kg', 'floor'), stored, String(kg));
  assert.equal(quantizeCustomizeLoad(10.5, 'kg', 'floor'), 10); // deload: w dół
  assert.equal(quantizeCustomizeLoad(10.5, 'kg', 'nearest'), 11); // remis poza deloadem: w górę
  assert.equal(quantizeCustomizeLoad(54.5, 'cal', 'floor'), null); // nieznana jednostka
});

test('krok Customize lb lustrzany do kg: lb -> kg -> krok kg -> lb co 0,1', () => {
  assert.equal(quantizeCustomizeLoad(120, 'lb', 'floor'), 119); // ~54,4 kg -> 54 kg -> 119,0 lb
  assert.equal(quantizeCustomizeLoad(12.1, 'lb', 'floor'), 12.1); // 5,5 kg
  assert.equal(quantizeCustomizeLoad(12.1, 'lb', 'nearest'), 12.1);
  assert.equal(quantizeCustomizeLoad(119, 'lb', 'floor'), 119); // legalna wartość stabilna
  assert.equal(quantizeCustomizeLoad(23.1, 'lb', 'floor'), 22); // 10,48 kg -> 10 kg
  assert.equal(quantizeCustomizeLoad(23.1, 'lb', 'nearest'), 22);
  const n = normalizeRequestedCustomizeLoad(120, 'lb');
  assert.deepEqual([n.value, n.normalized, n.requested], [119, true, 120]);
  assert.match(n.note, /120 lb/); assert.match(n.note, /54 kg = 119 lb/);
  assert.equal(normalizeRequestedCustomizeLoad(119, 'lb').normalized, false);
});

test('podgląd jawnie normalizuje niedozwolony ciężar', () => {
  const n = normalizeRequestedCustomizeLoad(54.5, 'kg');
  assert.deepEqual([n.value, n.normalized, n.requested], [54, true, 54.5]);
  assert.match(n.note, /54 kg/);
  assert.equal(normalizeRequestedCustomizeLoad(5.5, 'kg').normalized, false);
});

test('przyczyną jest krok urządzenia, nie wire lb: 54,5 i 5,5 dają ten sam wire *2,2 bez obcinania', () => {
  // Hipoteza "całe funty" też dawałaby 54 dla 54,5, ale 50,5 -> 111 lb -> 50,45 -> 50,5 przy kroku 0,5; odczyt dał 50.
  assert.equal(quantizeCustomizeLoad(50.5, 'kg', 'floor'), 50);
});

test('sugestia history-channel-total respektuje krok', () => {
  const base = { target: { exerciseId: 1, equipment: 'barbell' }, unit: 'kg',
    history: [{ exerciseId: 1, unit: 'kg', equipment: 'barbell', reps: 8, observedAt: '2026-11-01', left: 27.25, right: 27.25 }] };
  assert.equal(suggestHistoryChannelTotal({ ...base, setReps: [8] }).suggestedLoad, 55); // 54,5 -> najbliższa, remis w górę
  assert.equal(suggestHistoryChannelTotal({ ...base, setReps: [8], deload: true, deloadLoadFraction: 1 }).suggestedLoad, 54);
});
test('sugestia history-channel-total w lb respektuje krok kg i deload 90%', () => {
  const base = { target: { exerciseId: 1, equipment: 'barbell' }, unit: 'lb',
    history: [{ exerciseId: 1, unit: 'lb', equipment: 'barbell', reps: 8, observedAt: '2026-11-01', left: 60, right: 60 }] };
  assert.equal(suggestHistoryChannelTotal({ ...base, setReps: [8] }).suggestedLoad, 119); // 120 lb -> 54 kg
  assert.equal(suggestHistoryChannelTotal({ ...base, setReps: [8], deload: true, deloadLoadFraction: 0.9 }).suggestedLoad, 108); // 90% z 120 lb = 108 lb = 49 kg
  assert.equal(suggestHistoryChannelTotal({ ...base, setReps: [8], deload: true, deloadLoadFraction: 0.85 }).suggestedLoad, 101.4); // 102 lb = 46,3 kg -> floor 46 kg
});

function payload(weightsWire, capacity) {
  return { id: 1, code: 'ABC', name: 'T', totalCapacity: capacity,
    actionLibraryList: [{ groupId: 1, actionLibraryId: 2, templatePresetId: -1, setsAndReps: '10,10', weights: weightsWire, capacity, sportMode: '1,1', breakTime2: '60,60', completionMethod: '1,1', countType: '1,1', leftRight: 0 }] };
}
test('readback: 54 kg znormalizowane = zgodne; totalCapacity w jednostce odczytu (9388 vs 4267,3)', () => {
  const expected = payload('118.8,118.8', 9388);
  const readback = payload('54,54', 4267.3);
  readback.actionLibraryList[0].capacity = 1080;
  expected.actionLibraryList[0].capacity = 2376;
  const r = verifyUpdatedTemplateReadback({ expectedPayload: expected, readback, expectedCode: 'ABC', accountUnit: 'kg' });
  assert.ok(!r.mismatches?.some(m => /weights|totalCapacity/.test(m.path)), JSON.stringify(r.mismatches));
});
test('readback nadal wykrywa prawdziwą różnicę ciężaru i pojemności', () => {
  const expected = payload('118.8,118.8', 9388);
  const readback = payload('50,50', 4000);
  const r = verifyUpdatedTemplateReadback({ expectedPayload: expected, readback, expectedCode: 'ABC', accountUnit: 'kg' });
  assert.ok(r.mismatches.some(m => /weights/.test(m.path)));
  assert.ok(r.mismatches.some(m => /totalCapacity/.test(m.path)));
});

