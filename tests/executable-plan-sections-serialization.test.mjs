import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExecutablePlanSections } from '../plugin/executable-plan-sections.mjs';
import { buildPresetPayload } from '../plugin/program-serialization.mjs';
import { serializeSupersetBlock } from '../plugin/superset-serialization.mjs';

const timed = seconds => ({ unit: 'seconds', durationSeconds: seconds, mode: 1, rest: 30 });
const reps = count => ({ unit: 'reps', reps: count, mode: 1, rest: 90 });
function fixture() {
  return {
    name: 'Executable sections',
    exercises: [
      { id: 42, entryId: 1, section: 'warmup', title: 'Confirmed movement', loadType: 'bodyweight', sets: [timed(30)] },
      { id: 42, entryId: 2, section: 'main', title: 'Confirmed movement', loadType: 'bodyweight', sets: [reps(8)] },
      { id: 43, entryId: 3, section: 'stretching', title: 'Confirmed stretch', loadType: 'bodyweight', sets: [timed(45)] }
    ],
    warmup: { status: 'included', items: [{ executionRef: 1 }] },
    postWorkoutStretching: { status: 'included', items: [{ executionRef: 3 }] }
  };
}
function serialize(plan, unilateral = false) {
  validateExecutablePlanSections(plan);
  const metadata = new Map(plan.exercises.map(exercise => [exercise.id, {
    batch: { actionLibraryList: [{ id: exercise.id + 100 }] },
    detail: { isLeftRight: unilateral ? 1 : 0, isBarbell: 0 }
  }]));
  return buildPresetPayload(plan, metadata, 1, 'kg').payload.actionLibraryList;
}

test('real serializer preserves duplicate catalog groups as distinct ordered executable doses', () => {
  const plan = fixture();
  const before = structuredClone(plan);
  const actions = serialize(plan);
  assert.deepEqual(actions.map(action => [action.groupId, action.actionLibraryId, action.setsAndReps, action.completionMethod]), [
    [42, 142, '30', '2'], [42, 142, '8', '1'], [43, 143, '45', '2']
  ]);
  assert.deepEqual(plan, before);
});

test('independent section opt-outs produce no executable actions for omitted sections', () => {
  for (const omitted of [['warmup'], ['stretching'], ['warmup', 'stretching']]) {
    const plan = fixture();
    plan.exercises = plan.exercises.filter(exercise => !omitted.includes(exercise.section));
    for (const section of omitted) plan[section === 'warmup' ? 'warmup' : 'postWorkoutStretching'] = {
      status: 'omitted_user_preference', items: []
    };
    assert.deepEqual(serialize(plan).map(action => action.setsAndReps), [
      ...(!omitted.includes('warmup') ? ['30'] : []), '8', ...(!omitted.includes('stretching') ? ['45'] : [])
    ]);
  }
});

test('confirmed unilateral metadata expands each section dose without dropping or reordering actions', () => {
  const actions = serialize(fixture(), true);
  assert.deepEqual(actions.map(action => [action.groupId, action.setsAndReps, action.leftRight, action.completionMethod, action.breakTime]), [
    [42, '30,30', '1,2', '2,2', '1,30'],
    [42, '8,8', '1,2', '1,1', '1,90'],
    [43, '45,45', '1,2', '2,2', '1,30']
  ]);
});

test('main supersets resolve entry identity rather than accidentally capturing duplicate warmup group', () => {
  const plan = fixture();
  const partner = { id: 44, entryId: 4, section: 'main', title: 'Confirmed partner', loadType: 'bodyweight', sets: [reps(12)] };
  plan.exercises.splice(2, 0, partner);
  const members = [plan.exercises[1], partner];
  const block = serializeSupersetBlock({
    members: members.map(exercise => ({ exercise: { groupId: exercise.id, entryId: exercise.entryId }, setupKey: 'confirmed-same-setup', set: exercise.sets[0] })),
    rounds: 2, transitionRestSeconds: 1, recoveryRestSeconds: 90
  });
  plan.supersetBlocks = [{ ...block, members: members.map(exercise => ({ exerciseId: exercise.entryId })) }];
  const actions = serialize(plan);
  assert.deepEqual(actions.map(action => [action.groupId, action.setsAndReps, action.completionMethod, action.breakTime]), [
    [42, '30', '2', '30'],
    [42, '8', '1', '1'], [44, '12', '1', '90'],
    [42, '8', '1', '1'], [44, '12', '1', '90'],
    [43, '45', '2', '30']
  ]);
  plan.supersetBlocks[0].members[0].exerciseId = 1;
  assert.throws(() => serialize(plan), /main/);
});
