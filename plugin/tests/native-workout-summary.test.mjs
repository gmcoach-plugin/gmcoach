import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNativeWorkoutSummaries } from '../native-workout-summary.mjs';

test('mobile identity provenance preserves independent ids and source-specific type without calendar proof', () => {
  const cases = [
    { trainingId: '9223372036854775807', id: 22, type: '4' },
    { trainingId: 0, id: '9223372036854775807', type: 2 },
    { trainingId: 7, id: 8, type: 9 },
    { trainingId: 7, type: 999 },
    { id: 7 }
  ];
  for (const raw of cases) {
    const result = normalizeNativeWorkoutSummaries([raw])[0];
    const p = result.identityProvenance;
    assert.equal(p.sourceEndpoint, '/mobile/v2/report/userTrainingDataRecord');
    assert.equal(p.selectedIdentifierField, raw.trainingId ? 'trainingId' : 'id');
    assert.equal(p.reportedTrainingId, raw.trainingId || null);
    assert.equal(p.reportedRecordId, raw.id || null);
    assert.equal(p.rawReportType, raw.type ?? null);
    assert.equal(p.normalizedReportType, Number(raw.type ?? 0));
    assert.equal(p.namespaceHint, result.kind || null);
    assert.equal(p.namespaceHintSource, 'mobile-report-type-mapping');
    assert.equal(p.calendarIdentityVerified, false);
    assert.equal(p.detailNamespaceVerified, false);
  }
  const collisions = normalizeNativeWorkoutSummaries([{ trainingId: 7, type: 2 }, { trainingId: 7, type: 4 }]);
  assert.equal(collisions.length, 2);
  assert.deepEqual(collisions.map(x => x.kind), ['course', 'ai']);
  for (const invalid of ['01', 'bad', -1, 1.5, 9007199254740992, '9223372036854775808']) {
    assert.throws(() => normalizeNativeWorkoutSummaries([{ trainingId: 7, id: invalid, type: 5 }]));
    assert.throws(() => normalizeNativeWorkoutSummaries([{ trainingId: invalid, id: 7, type: 5 }]));
  }
});
test('history types use pinned namespaces and manual metrics remain unqualified', () => {
  for (const [type,kind] of [[1,'free'],[6,'free'],[7,'free'],[2,'course'],[3,'program'],[5,'program'],[4,'ai'],[9,'ai'],[10,'manual'],[8,''],[11,'']])
    assert.equal(normalizeNativeWorkoutSummaries([{trainingId:1,type}])[0].kind,kind);
  const result=normalizeNativeWorkoutSummaries([{trainingId:1,type:10,trainingTime:30.5,calorie:0,totalCapacity:42,title:'Manual'}])[0];
  assert.deepEqual(result.reportedMetrics,{trainingTime:30.5,calorie:0});
  assert.equal(result.duration_secs,null); assert.equal(result.calories,null); assert.equal(result.volume,null);
  assert.equal(result.metricUnitsVerified,false); assert.equal(result.exerciseDetailAvailable,false);
  for (const extra of [{id:2},{trainingTime:'30'},{calorie:-1},{type:10.5},{type:'10.5'},{type:true}])
    assert.throws(()=>normalizeNativeWorkoutSummaries([{trainingId:1,type:10,...extra}]));
});

test('native summary preserves reported scalar and exact identities without inventing tonnage', () => {
  const rows = normalizeNativeWorkoutSummaries([{ trainingId: '9223372036854775807', title: 'Fixture', type: 5, totalCapacity: 123.5, trainingTime: 60, calorie: 10 }, { trainingId: 0, id: 12, type: 1 }]);
  assert.equal(rows[0].training_id, '9223372036854775807');
  assert.equal(rows[0].kind, 'program');
  assert.equal(rows[0].volume, 123.5);
  assert.equal(rows[0].date, null);
  assert.equal(rows[1].training_id, 12);
  assert.equal(rows[1].kind, 'free');
  assert.equal(rows[1].title, 'Workout');
  assert.equal('totalLiftedVolume' in rows[0], false);
});

test('native summary rejects corrupt or lossy records rather than returning empty history', () => {
  for (const row of [null, { trainingId: 1.5 }, { trainingId: 9007199254740992 }, { trainingId: '9223372036854775808' }, { trainingId: 1, totalCapacity: NaN }, { trainingId: 1, startTimestamp: {} }]) {
    assert.throws(() => normalizeNativeWorkoutSummaries([row]));
  }
  assert.throws(() => normalizeNativeWorkoutSummaries({ records: [] }));
  assert.deepEqual(normalizeNativeWorkoutSummaries([]), []);
});

test('exact reported health1 rows are excluded before machine identity normalization',()=>{
 const imported={trainingId:null,title:'Walk',belongUserHealth:1,calorie:30,startTime:'2026-08-20 15:19:05',trainingTime:632};
 const machine={trainingId:42,id:42,type:5,title:'Machine',totalCapacity:0};
 assert.deepEqual(normalizeNativeWorkoutSummaries([imported,{...imported,trainingId:8000,type:5},machine]),normalizeNativeWorkoutSummaries([machine]));
 assert.deepEqual(normalizeNativeWorkoutSummaries([imported]),[]);
 // Boolean true is an import marker too (tests/native-workout-reader.test.mjs); other values do not assert import.
 for(const marker of [undefined,null,false,'1',2])assert.throws(()=>normalizeNativeWorkoutSummaries([{...imported,belongUserHealth:marker}]),/identity/);
 assert.equal(normalizeNativeWorkoutSummaries([{...machine,belongUserHealth:0}]).length,1);
 assert.equal(normalizeNativeWorkoutSummaries([{...machine,belongUserHealth:'1'}]).length,1,'unknown marker does not assert import');
 assert.throws(()=>normalizeNativeWorkoutSummaries([null]),/row/);
});
