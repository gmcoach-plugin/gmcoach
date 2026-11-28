import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeHealthReader } from '../plugin/native-health-reader.mjs';
const bare = rows => rows.map(({ partName, partNameStatus, ...rest }) => rest);
function transport(replies) {
  const paths = [];
  return { paths, apiRead: async path => { paths.push(path); const value = replies.shift(); if (value instanceof Error) throw value; return value; } };
}
const ok = data => ({ code: 0, data });
test('heart-rate aggregate rejects reversed bounds and discloses absent/null versus empty zone list', async () => {
  await assert.rejects(createNativeHealthReader(transport([ok({minHeartRate:180,maxHeartRate:100})])).heartRateZones(),/bounds/);
  for (const raw of [{maxHeartRate:0}, {maxHeartRate:0,timeLevelList:null}]) {
    const result=await createNativeHealthReader(transport([ok(raw)])).heartRateZones();
    assert.equal(result.available,true); assert.equal(result.status,'partial-schema'); assert.equal(result.zoneListReported,false);
    assert.equal(result.durationsComplete,false); assert.equal(result.totalSeconds,null); assert.equal(result.maxHeartRate,0);
    const all=await createNativeHealthReader(aggregateTransport({'/app/userDataStat/heartRateStatIndex':ok(raw)})).snapshot(snapshotPeriod);
    assert.ok(all.coverage.incompleteFeeds.includes('heartRateZones'));
  }
  const empty=await createNativeHealthReader(transport([ok({minHeartRate:0,maxHeartRate:0,timeLevelList:[]})])).heartRateZones();
  assert.equal(empty.zoneListReported,true); assert.equal(empty.status,'reported'); assert.equal(empty.totalSeconds,null); assert.equal(empty.durationsComplete,false);
  const zero=await createNativeHealthReader(transport([ok({timeLevelList:[{timeLevel:0}]})])).heartRateZones();
  assert.equal(zero.durationsComplete,true); assert.equal(zero.totalSeconds,0);
});
test('heart-rate zones preserve zero and unknown period without inferred physiological classifications', async () => {
  const rows = [{timeLevel:0,levelRateMin:0,levelRateMax:100,levelRateDisplay:'reported'}, {timeLevel:60}];
  const t = transport([ok({timeLevelList:rows,maxHeartRate:0,watchType:'unverified'})]);
  const result = await createNativeHealthReader(t).heartRateZones();
  assert.deepEqual(result.rows,rows); assert.equal(result.totalSeconds,60); assert.equal(result.period,'unknown');
  assert.equal(result.available,true); assert.equal(result.measurementFreshnessVerified,false);
  assert.equal(result.physiologicalZoneClassificationVerified,false); assert.equal(result.watchPairingInterpreted,false);
  assert.deepEqual(t.paths,['/app/userDataStat/heartRateStatIndex']);
});
test('heart-rate-zone incomplete and unknown data never fabricate measured durations', async () => {
  for (const [raw,status,available] of [[{},'empty',false], [{timeLevelList:[{levelRateDisplay:'label'}]},'empty',false],
    [{secret:'private'},'unsupported-schema',false], [{timeLevelList:[{timeLevel:0,secret:'private'},{}]},'partial-schema',true]]) {
    const result = await createNativeHealthReader(transport([ok(raw)])).heartRateZones();
    assert.equal(result.status,status); assert.equal(result.available,available); assert.equal(result.totalSeconds,null);
    assert.equal(JSON.stringify(result).includes('private'),false);
  }
  for (const raw of [null, {timeLevelList:{}}, {timeLevelList:[{timeLevel:'60'}]}, {timeLevelList:[{timeLevel:-1}]},
    {timeLevelList:[{levelRateMin:200,levelRateMax:100}]}, {maxHeartRate:Infinity}, {timeLevelList:Array(101).fill({})}])
    await assert.rejects(createNativeHealthReader(transport([ok(raw)])).heartRateZones());
});
test('health cards retain finite values and raw timestamps without verified measurement units or freshness', async () => {
  const t = transport([ok({ walking: { value: 0, createTimestamp: 12345 }, nutrition: { value: 1700, createTimestamp: 'raw-time' } })]);
  const result = await createNativeHealthReader(t).healthCards();
  assert.equal(result.available, true); assert.equal(result.status, 'reported');
  assert.equal(result.cards.walking.value, 0); assert.equal(result.cards.walking.createTimestamp, 12345);
  assert.equal(result.cards.nutrition.createTimestamp, 'raw-time');
  for (const [name, unit] of [['walking', 'steps'], ['nutrition', 'kcal']]) {
    assert.equal(result.cards[name].interpretedUnit, unit);
    assert.equal(result.cards[name].reportedUnit, 'unknown');
    assert.equal(result.cards[name].unitInterpretationSource, 'reference-client-renderer');
    assert.equal(result.cards[name].measurementUnitVerified, false);
    assert.equal(result.cards[name].timestampUnit, 'unknown'); assert.equal(result.cards[name].timestampTimeZone, 'unknown');
  }
  assert.equal(result.measurementFreshnessVerified, false);
  assert.deepEqual(t.paths, ['/mobile/userHealth/newIndex/healthScore']);
});
test('health-card unknown extData and age or wellness fields stay unsupported without leaking or parsing', async () => {
  const result = await createNativeHealthReader(transport([ok({ walking: { value: 1000, extData: '{"secret":42}' }, bodyAge: { extData: '{"age":20}' }, wellnessMonitor: { value: 'private' } })])).healthCards();
  assert.equal(result.status, 'partial-schema'); assert.equal(result.available, true);
  assert.equal(result.cards.walking.status, 'partial-schema');
  for (const name of ['bodyAge', 'wellnessMonitor']) {
    assert.equal(result.cards[name].available, false); assert.equal(result.cards[name].status, 'unsupported-schema'); assert.equal(result.cards[name].interpreted, false);
  }
  assert.equal(JSON.stringify(result).includes('secret'), false); assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(JSON.stringify(result).includes('"age"'), false);
});
test('health-card timestamp-only rows are empty and malformed confirmed fields reject', async () => {
  const result = await createNativeHealthReader(transport([ok({ walking: { createTimestamp: 123 }, nutrition: {} })])).healthCards();
  assert.equal(result.available, false); assert.equal(result.status, 'empty');
  for (const raw of [{ walking: [] }, { walking: { value: '1000' } }, { nutrition: { value: Infinity } }, { walking: { value: 1, createTimestamp: {} } }, { bodyAge: 'invalid' }]) await assert.rejects(createNativeHealthReader(transport([ok(raw)])).healthCards());
  const unsupported = await createNativeHealthReader(transport([ok({ unknown: 'private' })])).healthCards();
  assert.equal(unsupported.status, 'unsupported-schema'); assert.equal(unsupported.available, false);
  assert.equal(JSON.stringify(unsupported).includes('private'), false);
});
test('reported fatigue preserves IDs and data without ready percent or recovery windows', async () => {
  const t = transport([ok([{ trainingPartId2: 11, fatigue: 3, muscleLoadStatus: 2 }])]);
  const result = await createNativeHealthReader(t).fatigue();
  assert.deepEqual(bare(result.rows), [{ trainingPartId2: 11, fatigue: 3, muscleLoadStatus: 2 }]);
  assert.equal(result.rows[0].partName, null); assert.equal(result.rows[0].partNameStatus, 'nazwa partii nieznana'); assert.equal(result.partNamesResolved, false);
  assert.equal(result.lastLoadedAtAvailable, false);
  assert.equal(Object.hasOwn(result, 'readyPercent'), false);
  assert.deepEqual(t.paths, ['/app/userDataStat/trainingPartFatigueInfo']);
});
test('body measurements preserve reported fields while units remain explicitly unknown', async () => {
  const measurements = { weight: 80, height: 180, bmi: 24.7, bodyFatPercentage: 0 };
  const t = transport([ok({ appUserId: 'private-user', ...measurements })]);
  const result = await createNativeHealthReader(t).bodyMeasurements();
  assert.deepEqual(result.measurements, measurements);
  assert.equal(result.available, true); assert.equal(result.status, 'reported');
  assert.equal(result.weightUnit, 'unknown'); assert.equal(result.heightUnit, 'unknown');
  assert.equal(JSON.stringify(result).includes('private-user'), false);
  assert.deepEqual(t.paths, ['/app/userBody/current']);
});
test('body measurements distinguish empty, unsupported, partial and invalid numeric values', async () => {
  for (const [raw, status, available] of [[{ appUserId: 1 }, 'empty', false], [{ mystery: 'private' }, 'unsupported-schema', false], [{ weight: 0, mystery: 'private' }, 'partial-schema', true]]) {
    const result = await createNativeHealthReader(transport([ok(raw)])).bodyMeasurements();
    assert.equal(result.status, status); assert.equal(result.available, available);
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
  await assert.rejects(createNativeHealthReader(transport([ok(null)])).bodyMeasurements());
  const inf = await createNativeHealthReader(transport([ok({ height: Infinity })])).bodyMeasurements();
  assert.equal(inf.available, false); assert.equal(inf.status, 'unsupported-schema');
});
test('physical condition preserves only reported model fields without readiness or units inference', async () => {
  const blocks = { physicalConditionResp: { physicalConditionValue: 'balanced', physicalConditionScore: 100, fitness: 30, fatigue: 0, trainingStatus: 2 }, physicalConditionParam: { trainingStatusScore: 60, trainingStatusScoreAvg: 55 } };
  const t = transport([ok(blocks)]), result = await createNativeHealthReader(t).physicalCondition('2026-10-06');
  assert.deepEqual(result.blocks, blocks);
  assert.equal(result.status, 'reported'); assert.equal(result.available, true);
  assert.equal(result.biologicalReadinessCalculated, false); assert.equal(result.measurementTimestampAvailable, false);
  assert.deepEqual(t.paths, ['/mobile/userHealth/physicalCondition/detailByDate?dateStr=2026-10-06']);
});
test('physical-condition dates validate before reads and malformed or unknown blocks are explicit', async () => {
  const t = transport([]); await assert.rejects(createNativeHealthReader(t).physicalCondition('2026-02-30')); assert.equal(t.paths.length, 0);
  for (const raw of [{ physicalConditionResp: [] }, { physicalConditionResp: { fatigue: '3' } }, { physicalConditionResp: { physicalConditionScore: 101 } }, { physicalConditionResp: { trainingStatus: {} } }]) await assert.rejects(createNativeHealthReader(transport([ok(raw)])).physicalCondition('2026-10-06'));
  for (const [raw, status, available] of [[{}, 'empty', false], [{ physicalConditionResp: {} }, 'empty', false], [{ physicalConditionResp: { unknown: 'private' } }, 'unsupported-schema', false], [{ physicalConditionResp: { fatigue: 0, unknown: 'private' } }, 'partial-schema', true]]) {
    const result = await createNativeHealthReader(transport([ok(raw)])).physicalCondition('2026-10-06');
    assert.equal(result.status, status); assert.equal(result.available, available); assert.equal(JSON.stringify(result).includes('private'), false);
  }
});
test('training load retains reported TRIMP unit and exact bounded date parameters', async () => {
  const row = { dateStr: '2026-10-06', trainingLoadValue: 32, trainingLoadUnit: 'TRIMP', recommendMin: 20, recommendMax: 40 };
  const t = transport([ok([row])]);
  assert.deepEqual((await createNativeHealthReader(t).trainingLoad('2026-10-01', '2026-10-06')).rows, [row]);
  assert.deepEqual(t.paths, ['/mobile/userHealth/trainingLoad/dateRange?startDate=2026-10-01&endDate=2026-10-06']);
});
test('fatigue identities without measurements are retained but unavailable; zero metrics are reported', async () => {
  for (const row of [{ trainingPartId2: 11 }, { trainingPartId2: 11, fatigue: null, muscleLoadStatus: null }]) {
    const result = await createNativeHealthReader(transport([ok([row])])).fatigue();
    assert.equal(result.available, false); assert.equal(result.status, 'empty');
    assert.deepEqual(bare(result.rows), [{ trainingPartId2: 11 }]);
  }
  for (const metric of ['fatigue', 'muscleLoadStatus']) {
    const result = await createNativeHealthReader(transport([ok([{ trainingPartId2: 11, [metric]: 0 }])])).fatigue();
    assert.equal(result.available, true); assert.equal(result.status, 'reported');
    assert.equal(result.rows[0][metric], 0);
  }
});
test('training-load identity and recommendations do not establish measured load', async () => {
  const identity = { dateStr: '2026-10-06', trainingLoadUnit: 'TRIMP' };
  for (const row of [identity, { ...identity, recommendMin: 20, recommendMax: 40 }, { ...identity, trainingLoadValue: null }]) {
    const result = await createNativeHealthReader(transport([ok([row])])).trainingLoad('2026-10-01', '2026-10-06');
    assert.equal(result.available, false); assert.equal(result.status, 'empty');
    assert.equal(result.rows[0].dateStr, identity.dateStr);
    assert.equal(Object.hasOwn(result.rows[0], 'trainingLoadValue'), false);
  }
  const result = await createNativeHealthReader(transport([ok([{ ...identity, trainingLoadValue: 0 }])])).trainingLoad('2026-10-01', '2026-10-06');
  assert.equal(result.available, true); assert.equal(result.status, 'reported');
  assert.equal(result.rows[0].trainingLoadValue, 0);
});
test('unknown row fields mark partial or unsupported schema without leaking raw fields', async () => {
  for (const method of ['fatigue', 'trainingLoad']) for (const measured of [false, true]) {
    const row = method === 'fatigue'
      ? { trainingPartId2: 11, ...(measured ? { fatigue: 0 } : {}) }
      : { dateStr: '2026-10-06', trainingLoadUnit: 'TRIMP', ...(measured ? { trainingLoadValue: 0 } : {}) };
    const reader = createNativeHealthReader(transport([ok([{ ...row, unverified: 'secret' }])]));
    const result = await (method === 'fatigue' ? reader.fatigue() : reader.trainingLoad('2026-10-01', '2026-10-06'));
    assert.equal(result.available, measured);
    assert.equal(result.status, measured ? 'partial-schema' : 'unsupported-schema');
    assert.deepEqual(method === 'fatigue' ? bare(result.rows) : result.rows, [row]);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
});
test('mixed measured and identity-only rows expose incomplete fatigue and training-load coverage', async () => {
  const fatigueRows = [{ trainingPartId2: 11, fatigue: 0 }, { trainingPartId2: 12 }];
  const loadRows = [{ dateStr: '2026-10-05', trainingLoadUnit: 'TRIMP', trainingLoadValue: 0 }, { dateStr: '2026-10-06', trainingLoadUnit: 'TRIMP', recommendMin: 20 }];
  const fatigue = await createNativeHealthReader(transport([ok(fatigueRows)])).fatigue();
  const load = await createNativeHealthReader(transport([ok(loadRows)])).trainingLoad('2026-10-01', '2026-10-06');
  for (const result of [fatigue, load]) {
    assert.equal(result.available, true);
    assert.equal(result.status, 'partial-schema');
  }
  assert.deepEqual(bare(fatigue.rows), fatigueRows); assert.deepEqual(load.rows, loadRows);
  const snapshot = await createNativeHealthReader(aggregateTransport({
    '/app/userDataStat/trainingPartFatigueInfo': ok(fatigueRows),
    '/mobile/userHealth/trainingLoad/dateRange?startDate=2026-10-01&endDate=2026-10-06': ok(loadRows),
  })).snapshot(snapshotPeriod);
  assert.deepEqual(snapshot.coverage.availableFeeds, ['fatigue', 'trainingLoad', 'strengthScore', 'sleep', 'bodyMeasurements', 'physicalCondition', 'healthCards', 'heartRateZones']);
  assert.deepEqual(snapshot.coverage.incompleteFeeds, ['fatigue', 'trainingLoad', 'recovery']);
  assert.equal(snapshot.status, 'partial');
});
test('real flags false prevent sample reads; malformed flags fail without detail calls', async () => {
  for (const method of ['recovery', 'sleep']) for (const flag of [false, 'true', 1, null, {}]) {
    const t = transport([ok(flag)]), reader = createNativeHealthReader(t);
    if (flag === false) assert.equal((await reader[method]('2026-10-06')).realData, false);
    else await assert.rejects(reader[method]('2026-10-06'), /real-data/);
    assert.equal(t.paths.length, 1);
  }
});
test('sleep preserves seconds vs target minutes, and zero is not missing', async () => {
  const t = transport([ok(true), ok({ sleep: 6480, targetSleepMin: 480 })]);
  const result = await createNativeHealthReader(t).sleep('2026-10-06');
  assert.equal(result.sleepSeconds, 6480); assert.equal(result.targetSleepMinutes, 480);
  assert.deepEqual(t.paths, ['/mobile/userHealth/mockReport/hasRealSleepData', '/mobile/userHealth/sleep?dateStr=2026-10-06']);
  const none = await createNativeHealthReader(transport([ok(true), ok({ sleep: 0, targetSleepMin: 480 })])).sleep('2026-10-06');
  assert.equal(none.available, false); assert.equal(none.status, 'no-sleep-recorded'); assert.equal(none.sleepSeconds, null); assert.equal(none.targetSleepMinutes, 480);
});
test('body measurements accept numeric strings and tolerate unparseable or unknown fields', async () => {
  const r = await createNativeHealthReader(transport([ok({ weight: '80.5', height: ' 180 ', bmi: 'n/a', bodyFatPercentage: null, extra: { x: 1 } })])).bodyMeasurements();
  assert.deepEqual(r.measurements, { weight: 80.5, height: 180 });
  assert.equal(r.available, true); assert.equal(r.status, 'partial-schema'); assert.deepEqual(r.unparsedFields, ['bmi']);
  const bad = await createNativeHealthReader(transport([ok({ weight: 'abc' })])).bodyMeasurements();
  assert.equal(bad.available, false); assert.equal(bad.status, 'unsupported-schema');
});
test('health cards derive measuredDate from ms or s createTimestamp', async () => {
  for (const stamp of [1763683200000, 1763683200, '1763683200000']) {
    const r = await createNativeHealthReader(transport([ok({ walking: { value: 5000, createTimestamp: stamp }, nutrition: { value: 2000 } })])).healthCards();
    assert.equal(r.cards.walking.measuredDate, '2025-11-21'); assert.equal(r.cards.nutrition.measuredDate, undefined);
    assert.equal(r.cards.walking.timestampUnit, typeof stamp === 'number' && stamp < 1e11 ? 'seconds' : 'milliseconds');
  }
});
test('heart-rate zones return a reported period when the API provides one', async () => {
  const r = await createNativeHealthReader(transport([ok({ maxHeartRate: 150, minHeartRate: 60, startDate: '2026-11-01', endDate: '2026-11-21' })])).heartRateZones();
  assert.deepEqual(r.period, { date: null, start_date: '2026-11-01', end_date: '2026-11-21' });
  assert.equal((await createNativeHealthReader(transport([ok({ maxHeartRate: 150 })])).heartRateZones()).period, 'unknown');
});
test('recovery confirms only block presence; unverified aliases/units are not interpreted', async () => {
  const t = transport([ok(true), ok({ nightHrvResp: { nightHrv: 42, nightHrvAvg: 40 }, muscleLoadResp: { arbitrary: 1 } })]);
  const result = await createNativeHealthReader(t).recovery('2026-10-06');
  assert.deepEqual(result.blocks, { nightHrvResp: { status: 'unsupported-schema', interpreted: false }, muscleLoadResp: { status: 'unsupported-schema', interpreted: false } });
  assert.equal(result.status, 'unsupported-schema');
  assert.equal(result.available, false);
  assert.equal(result.muscleLoadInterpreted, false);
  assert.equal((await createNativeHealthReader(transport([ok(true), ok({})])).recovery('2026-10-06')).available, false);
  assert.equal((await createNativeHealthReader(transport([ok(true), ok({})])).recovery('2026-10-06')).status, 'empty');
  assert.equal(JSON.stringify(result).includes('42'), false);
});
test('strength score missing is unavailable; empty regions never become zero', async () => {
  const result = await createNativeHealthReader(transport([ok({ chest: {}, legs: {} })])).strengthScore();
  assert.equal(result.available, false); assert.equal(Object.hasOwn(result, 'totalScore'), false);
  assert.equal(result.status, 'unsupported-schema');
});
test('unknown sleep fields are unsupported, not ordinary absence and never leaked', async () => {
  const result = await createNativeHealthReader(transport([ok(true), ok({ extData: 'secret', unknown: 7 })])).sleep('2026-10-06');
  assert.equal(result.status, 'unsupported-schema'); assert.equal(result.available, false);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal((await createNativeHealthReader(transport([ok(true), ok({})])).sleep('2026-10-06')).status, 'empty');
});
test('API and transport errors never masquerade as empty data or trigger retries', async () => {
  for (const reply of [{ code: 500, data: {} }, { data: [] }, ok(null), new Error('transport failed')]) {
    const t = transport([reply]);
    await assert.rejects(createNativeHealthReader(t).fatigue()); assert.equal(t.paths.length, 1);
  }
});
test('invalid dates/ranges fail before any API read; malformed numerics fail closed', async () => {
  const t = transport([]), reader = createNativeHealthReader(t);
  await assert.rejects(reader.sleep('2026-02-30'));
  await assert.rejects(reader.trainingLoad('2026-10-06', '2026-10-01'));
  await assert.rejects(reader.trainingLoad('2024-01-01', '2026-01-01'));
  assert.equal(t.paths.length, 0);
  await assert.rejects(createNativeHealthReader(transport([ok([{ trainingPartId2: 11, fatigue: '3' }])])).fatigue());
  await assert.rejects(createNativeHealthReader(transport([ok(true), ok({ sleep: -1 })])).sleep('2026-10-06'));
});

function aggregateTransport(overrides = {}) {
  const paths = [];
  const replies = {
    '/app/userDataStat/trainingPartFatigueInfo': ok([{ trainingPartId2: 11, fatigue: 3, muscleLoadStatus: 2 }]),
    '/mobile/userHealth/trainingLoad/dateRange?startDate=2026-10-01&endDate=2026-10-06': ok([{ dateStr: '2026-10-06', trainingLoadValue: 32, trainingLoadUnit: 'TRIMP' }]),
    '/app/strengthScore/summary': ok({ totalScore: 60 }),
    '/app/userDataStat/heartRateStatIndex': ok({timeLevelList:[{timeLevel:0}]}),
    '/mobile/userHealth/mockReport/hasRealRecoveryData': ok(true),
    '/mobile/userHealth/recovery/detailByDate?dateStr=2026-10-06': ok({ nightHrvResp: { unverified: 42 } }),
    '/mobile/userHealth/mockReport/hasRealSleepData': ok(true),
    '/mobile/userHealth/sleep?dateStr=2026-10-06': ok({ sleep: 25200, targetSleepMin: 480 }),
    '/app/userBody/current': ok({ weight: 80, height: 180, bmi: 24.7, bodyFatPercentage: 20 }),
    '/mobile/userHealth/physicalCondition/detailByDate?dateStr=2026-10-06': ok({ physicalConditionResp: { fitness: 30, fatigue: 20, physicalConditionScore: 60 } }),
    '/mobile/userHealth/newIndex/healthScore': ok({ walking: { value: 1000 } }),
    ...overrides,
  };
  return { paths, apiRead: async path => { paths.push(path); assert.ok(Object.hasOwn(replies, path), `Unexpected health path: ${path}`); const reply = replies[path]; if (reply instanceof Error) throw reply; return reply; } };
}
const snapshotPeriod = { date: '2026-10-06', start_date: '2026-10-01', end_date: '2026-10-06' };
test('aggregate isolates health-card failure and incomplete card schema', async () => {
  for (const [reply, status, available] of [[new Error('private'), 'error', false], [ok({ walking: { value: 0, extData: 'secret' } }), 'partial-schema', true]]) {
    const t = aggregateTransport({ '/mobile/userHealth/newIndex/healthScore': reply });
    const result = await createNativeHealthReader(t).snapshot(snapshotPeriod);
    assert.equal(result.feeds.healthCards.status, status); assert.equal(result.feeds.healthCards.available, available);
    assert.equal(result.coverage.incompleteFeeds.includes('healthCards'), true);
    assert.equal(result.coverage.availableFeeds.includes('healthCards'), available);
    assert.deepEqual(result.coverage.errorFeeds, status === 'error' ? ['healthCards'] : []);
    assert.equal(t.paths.length, 11); assert.equal(JSON.stringify(result).includes('private'), false); assert.equal(JSON.stringify(result).includes('secret'), false);
  }
});
test('aggregate isolates new feed errors and identifies partially supported body fields', async () => {
  const result = await createNativeHealthReader(aggregateTransport({
    '/app/userBody/current': ok({ weight: 80, unknown: 'private' }),
    '/mobile/userHealth/physicalCondition/detailByDate?dateStr=2026-10-06': new Error('secret'),
  })).snapshot(snapshotPeriod);
  assert.equal(result.feeds.bodyMeasurements.available, true);
  assert.equal(result.feeds.bodyMeasurements.status, 'partial-schema');
  assert.deepEqual(result.coverage.availableFeeds, ['fatigue', 'trainingLoad', 'strengthScore', 'sleep', 'bodyMeasurements', 'healthCards', 'heartRateZones']);
  assert.deepEqual(result.coverage.errorFeeds, ['physicalCondition']);
  assert.deepEqual(result.coverage.incompleteFeeds, ['recovery', 'bodyMeasurements', 'physicalCondition']);
  assert.equal(JSON.stringify(result).includes('private'), false); assert.equal(JSON.stringify(result).includes('secret'), false);
});
test('aggregate usable coverage excludes identity-only feeds and flags partial row schemas', async () => {
  for (const measured of [false, true]) {
    const result = await createNativeHealthReader(aggregateTransport({
      '/app/userDataStat/trainingPartFatigueInfo': ok([{ trainingPartId2: 11, ...(measured ? { fatigue: 0, unknown: 'secret' } : {}) }]),
      '/mobile/userHealth/trainingLoad/dateRange?startDate=2026-10-01&endDate=2026-10-06': ok([{ dateStr: '2026-10-06', trainingLoadUnit: 'TRIMP', recommendMin: 20, recommendMax: 40 }]),
    })).snapshot(snapshotPeriod);
    assert.deepEqual(result.coverage.availableFeeds, measured ? ['fatigue', 'strengthScore', 'sleep', 'bodyMeasurements', 'physicalCondition', 'healthCards', 'heartRateZones'] : ['strengthScore', 'sleep', 'bodyMeasurements', 'physicalCondition', 'healthCards', 'heartRateZones']);
    assert.deepEqual(result.coverage.incompleteFeeds, ['fatigue', 'trainingLoad', 'recovery']);
    assert.deepEqual(result.coverage.errorFeeds, []);
    assert.equal(result.feeds.fatigue.status, measured ? 'partial-schema' : 'empty');
    assert.equal(result.feeds.trainingLoad.status, 'empty');
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
});
test('aggregate snapshot reads all confirmed feeds and retains unsupported recovery semantics', async () => {
  const t = aggregateTransport(), result = await createNativeHealthReader(t).snapshot(snapshotPeriod);
  assert.equal(t.paths.length, 11);
  assert.equal(result.available, true); assert.equal(result.status, 'partial');
  assert.deepEqual(result.coverage.availableFeeds, ['fatigue', 'trainingLoad', 'strengthScore', 'sleep', 'bodyMeasurements', 'physicalCondition', 'healthCards', 'heartRateZones']);
  assert.deepEqual(result.coverage.incompleteFeeds, ['recovery']);
  assert.deepEqual(result.coverage.errorFeeds, []);
  assert.equal(result.feeds.recovery.realData, true);
  assert.equal(result.feeds.recovery.status, 'unsupported-schema');
  assert.equal(result.feeds.recovery.available, false);
  assert.equal(result.feeds.sleep.sleepSeconds, 25200);
  assert.equal(result.feeds.sleep.targetSleepMinutes, 480);
  assert.equal(result.feeds.trainingLoad.strengthVolumeEquivalent, false);
  assert.equal(result.biologicalReadinessCalculated, false);
  assert.equal(JSON.stringify(result).includes('unverified'), false);
});
test('aggregate isolates transport and validation failures with no raw error disclosure or retry', async () => {
  for (const failedFeed of ['/app/userDataStat/trainingPartFatigueInfo', '/app/strengthScore/summary']) {
    const t = aggregateTransport({ [failedFeed]: new Error('password=secret token=private') });
    const result = await createNativeHealthReader(t).snapshot(snapshotPeriod);
    assert.equal(result.status, 'partial'); assert.equal(result.available, true);
    assert.equal(result.coverage.errorFeeds.length, 1);
    assert.equal(result.feeds.sleep.status, 'reported');
    assert.equal(t.paths.filter(path => path === failedFeed).length, 1);
    assert.equal(JSON.stringify(result).includes('secret'), false);
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
  const result = await createNativeHealthReader(aggregateTransport({ '/app/userDataStat/trainingPartFatigueInfo': ok([{ trainingPartId2: 11, fatigue: '3' }]) })).snapshot(snapshotPeriod);
  assert.deepEqual(result.coverage.errorFeeds, ['fatigue']);
});
test('aggregate real-data flags prevent demo detail reads while preserving other feeds', async () => {
  const t = aggregateTransport({ '/mobile/userHealth/mockReport/hasRealRecoveryData': ok(false), '/mobile/userHealth/mockReport/hasRealSleepData': ok(false) });
  const result = await createNativeHealthReader(t).snapshot(snapshotPeriod);
  assert.equal(t.paths.length, 9);
  assert.equal(t.paths.some(path => path.includes('/recovery/detailByDate') || path.includes('/sleep?')), false);
  assert.equal(result.feeds.sleep.status, 'real-data-not-confirmed');
  assert.equal(result.feeds.recovery.status, 'real-data-not-confirmed');
  assert.deepEqual(result.coverage.errorFeeds, []);
  assert.deepEqual(result.coverage.availableFeeds, ['fatigue', 'trainingLoad', 'strengthScore', 'bodyMeasurements', 'physicalCondition', 'healthCards', 'heartRateZones']);
});
test('aggregate validates every explicit date and bounded range before any fetch', async () => {
  for (const period of [undefined, {}, { ...snapshotPeriod, date: '2026-02-30' }, { ...snapshotPeriod, date: '2026-09-30' }, { ...snapshotPeriod, date: '2026-10-07' }, { ...snapshotPeriod, start_date: '2026-10-07' }, { ...snapshotPeriod, start_date: '2026-01-01' }, { ...snapshotPeriod, end_date: '2026-10-06&token=x' }]) {
    const t = aggregateTransport();
    await assert.rejects(createNativeHealthReader(t).snapshot(period));
    assert.equal(t.paths.length, 0);
  }
});
test('aggregate empty and unsupported fields remain explicit without fabricated measurements', async () => {
  const t = aggregateTransport({
    '/app/userDataStat/heartRateStatIndex': ok({}),
    '/app/userDataStat/trainingPartFatigueInfo': ok([]),
    '/mobile/userHealth/trainingLoad/dateRange?startDate=2026-10-01&endDate=2026-10-06': ok([]),
    '/app/strengthScore/summary': ok({ unknown: 'secret' }),
    '/mobile/userHealth/recovery/detailByDate?dateStr=2026-10-06': ok({}),
    '/mobile/userHealth/sleep?dateStr=2026-10-06': ok({}),
    '/app/userBody/current': ok({}),
    '/mobile/userHealth/physicalCondition/detailByDate?dateStr=2026-10-06': ok({}),
    '/mobile/userHealth/newIndex/healthScore': ok({}),
  });
  const result = await createNativeHealthReader(t).snapshot(snapshotPeriod);
  assert.equal(result.available, false); assert.equal(result.status, 'partial');
  assert.deepEqual(result.coverage.availableFeeds, []);
  assert.deepEqual(result.coverage.errorFeeds, []);
  assert.equal(result.feeds.fatigue.status, 'empty');
  assert.equal(result.feeds.strengthScore.status, 'unsupported-schema');
  assert.equal(result.feeds.sleep.sleepSeconds, null);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});
