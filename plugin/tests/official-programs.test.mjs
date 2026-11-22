import test from 'node:test';
import assert from 'node:assert/strict';
import { readOfficialPrograms as read } from '../official-programs.mjs';
const fixture = { id: 77, name: 'Strength Foundations', description: 'Eight weeks of basics.', weekCount: 8,
  weekTrainingFrequency: 3, difficultyId: 1, isPermission: true };

test('reads one bounded public page and filters name/description while retaining permission', async () => {
  const calls = [];
  const result = await read({ query: 'STRENGTH', apiRead: async path => { calls.push(path); return [fixture]; } });
  assert.deepEqual(calls, ['/mobile/exclusivePlan/page?pageNo=1&pageSize=200']);
  assert.deepEqual(result.programs, [fixture]);
  assert.equal(result.partial, false);
  assert.equal(result.paginationExhaustive, false);
  const none = await read({ query: 'yoga', apiRead: async () => [fixture] });
  assert.equal(none.matchedCount, 0);
  assert.equal((await read({ apiRead: async () => [{ ...fixture, isPermission: false }] })).programs[0].isPermission, false);
});

test('caps scanning and returned results and reports incomplete coverage', async () => {
  const result = await read({ apiRead: async () => Array.from({ length: 250 }, (_, i) => ({ ...fixture, id: i + 1 })) });
  assert.equal(result.scannedCount, 200);
  assert.equal(result.programs.length, 50);
  assert.equal(result.matchedCount, 200);
  assert.equal(result.omittedCount, 200);
  assert.equal(result.partial, true);
});

test('detail uses positive exact identity and only supported bounded weekList fields', async () => {
  let called;
  const result = await read({ programId: '77', apiRead: async path => { called = path; return {
    ...fixture, token: 'private-secret', weekList: [{ name: 'Week 1', email: 'private@test', nested: { secret: 'hidden' } }, { name: 'Week 2' }]
  }; } });
  assert.equal(called, '/app/exclusivePlan/77');
  assert.deepEqual(result.structure.weekList, [{ name: 'Week 1' }, { name: 'Week 2' }]);
  assert.doesNotMatch(JSON.stringify(result), /private-secret|private@test|hidden/);
  const mismatch = await read({ programId: 78, apiRead: async () => fixture });
  assert.equal(mismatch.program, null);
  assert.equal(mismatch.partial, true);
});

test('validates identifiers/query before any API call', async () => {
  let calls = 0;
  const apiRead = async () => { calls++; return []; };
  for (const programId of [0, -1, true, 1.5, '../77', '77/evil', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(read({ programId, apiRead }), TypeError);
  }
  await assert.rejects(read({ query: 'x'.repeat(201), apiRead }), TypeError);
  assert.equal(calls, 0);
});

test('malformed rows, duplicates and failed API shapes remain partial with sanitized issues', async () => {
  const result = await read({ apiRead: async () => [null, fixture, fixture, { ...fixture, id: 78, isPermission: 'private-secret' }] });
  assert.equal(result.programs.length, 2);
  assert.equal(result.partial, true);
  assert.doesNotMatch(JSON.stringify(result), /private-secret/);
  const failure = await read({ apiRead: async () => { throw new Error('token=private-secret'); } });
  assert.deepEqual(failure.issues, ['official-program-read-failed']);
  assert.doesNotMatch(JSON.stringify(failure), /private-secret/);
  assert.equal((await read({ apiRead: async () => ({ records: [fixture] }) })).partial, true);
  assert.equal((await read({ apiRead: async () => ({ code: 91, message: 'private-secret' }) })).partial, true);
});

test('unsupported nested structures and overlong week lists do not silently appear complete', async () => {
  const result = await read({ programId: 77, apiRead: async () => ({ ...fixture,
    weekList: Array.from({ length: 60 }, () => ({ name: 'Week', exercises: [{ secret: 'private-secret' }] })),
    secretList: [{ token: 'private-secret' }]
  }) });
  assert.equal(result.structure.weekList.length, 50);
  assert.equal(result.partial, true);
  assert.ok(result.issues.includes('unsupported-program-structure'));
  assert.doesNotMatch(JSON.stringify(result), /private-secret/);
});

test('missing structure and advertised week count mismatch remain partial', async () => {
  const missing = await read({ programId: 77, apiRead: async () => fixture });
  assert.equal(missing.partial, true);
  assert.ok(missing.issues.includes('missing-week-list'));
  const short = await read({ programId: 77, apiRead: async () => ({ ...fixture, weekList: [{ name: 'Week 1' }, { name: 'Week 2' }] }) });
  assert.ok(short.issues.includes('incomplete-week-coverage'));
});

test('unknown objects and bounded program/week fields disclose incomplete structure', async () => {
  const fields = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`field${i}`, 1]));
  const weekFields = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`field${i}`, 1]));
  const bounded = await read({ programId: 77, apiRead: async () => ({ ...fixture, ...fields,
    weekList: [{ name: 'Week 1', ...weekFields }] }) });
  assert.ok(bounded.issues.includes('program-field-limit-reached'));
  assert.ok(bounded.issues.includes('week-field-limit-reached'));
  const unknown = await read({ programId: 77, apiRead: async () => ({ ...fixture, weekList: [], hiddenStructure: { secret: 'private-secret' } }) });
  assert.ok(unknown.issues.includes('unsupported-program-structure'));
  assert.doesNotMatch(JSON.stringify(unknown), /private-secret/);
});

test('oversized numeric strings reject before API and overlong text truncates boundedly', async () => {
  let calls = 0;
  await assert.rejects(read({ programId: '1'.repeat(100_000), apiRead: async () => { calls++; } }), TypeError);
  assert.equal(calls, 0);
  const result = await read({ apiRead: async () => [{ ...fixture, name: 'N'.repeat(100_000), description: 'D'.repeat(100_000) }] });
  assert.equal(result.programs[0].name.length, 160);
  assert.equal(result.programs[0].description.length, 240);
  assert.equal(result.partial, true);
});


test('selected official day uses exact bounded course identities and no other days', async () => {
  const {readOfficialProgramDay}=await import('../official-programs.mjs');
  const calls=[];
  const raw={id:77,name:'P',weekCount:1,isPermission:true,exclusivePlanWeekList:[{week:1,exclusivePlanDayList:[{day:1,courseList:[{id:9,courseTitle:'C'}]},{day:2,courseList:[]}]}]};
  const apiRead=async path=>{calls.push(path);return path==='/app/exclusivePlan/77'?raw:{id:9,courseTitle:'C',isPermission:true,actionLibraryList:[{title:'E',setsAndReps:'3 x 8'}]};};
  const args={programId:77,week:1,day:1,apiRead,assertCurrent:async()=>{}};
  const result=await readOfficialProgramDay(args);
  assert.deepEqual(calls,['/app/exclusivePlan/77','/app/v2/course/info/9?weightConfig=1']);
  assert.equal(result.selectedDay.courses[0].selectedCourseId,9);
  assert.equal(result.selectedDay.scientificApproval,false);
  calls.length=0;
  assert.equal((await readOfficialProgramDay({...args,day:2})).selectedDay.status,'rest-day');
  assert.deepEqual(calls,['/app/exclusivePlan/77']);
  assert.equal((await readOfficialProgramDay({...args,day:3})).selectedDay.issues[0],'selected-day-unavailable');
  const mismatch=await readOfficialProgramDay({...args,apiRead:async path=>path==='/app/exclusivePlan/77'?raw:{id:10,courseTitle:'Wrong',actionLibraryList:[]}});
  assert.equal(mismatch.selectedDay.partial,true);assert.equal(mismatch.selectedDay.courses[0].detail.course,null);
  for(const kind of ['overflow','duplicate','permission']) {
    const changed=structuredClone(raw);
    if(kind==='overflow')changed.exclusivePlanWeekList[0].exclusivePlanDayList[0].courseList=Array.from({length:6},(_,i)=>({id:i+1,courseTitle:'C'}));
    if(kind==='duplicate')changed.exclusivePlanWeekList[0].exclusivePlanDayList[0].courseList.push({id:9,courseTitle:'C'});
    if(kind==='permission')changed.isPermission=false;
    let count=0; const blocked=await readOfficialProgramDay({...args,apiRead:async()=>{count++;return changed;}});
    assert.equal(count,1);assert.equal(blocked.selectedDay.partial,true);
  }
  let current=true;
  await assert.rejects(readOfficialProgramDay({...args,assertCurrent:async()=>{if(!current)throw Error('drift');},apiRead:async()=>{current=false;return raw;}}),/drift/);
  const failed=await readOfficialProgramDay({...args,apiRead:async path=>{if(path==='/app/exclusivePlan/77')return raw;throw Error('offline');}});
  assert.equal(failed.selectedDay.partial,true);assert.equal(failed.selectedDay.courses.length,1);
});
