import test from 'node:test';
import assert from 'node:assert/strict';
import { expandPlanForSerialization, normalizeSupersetBlocks, serializeSupersetBlock } from '../superset-serialization.mjs';

const exerciseA = { groupId: 11, title: 'Press' };
const exerciseB = { groupId: 22, title: 'Row' };

test('interleaves a repeated A/B pair and assigns transition/recovery rests per round', () => {
  const result = serializeSupersetBlock({
    members: [
      { exercise: exerciseA, setupKey: 'low-flat', set: { reps: 8, weight: 40 } },
      { exercise: exerciseB, setupKey: 'low-flat', set: { reps: 10, weight: 35 } }
    ],
    rounds: 3
  });

  assert.equal(result.rounds, 3);
  assert.equal(result.setupKey, 'low-flat');
  assert.deepEqual(result.steps.map(({ exercise, round, restAfterSeconds }) => [
    exercise.groupId, round, restAfterSeconds
  ]), [
    [11, 1, 1], [22, 1, 90],
    [11, 2, 1], [22, 2, 90],
    [11, 3, 1], [22, 3, 90]
  ]);
  assert.deepEqual(result.steps.map(({ set }) => set), [
    { reps: 8, weight: 40 }, { reps: 10, weight: 35 },
    { reps: 8, weight: 40 }, { reps: 10, weight: 35 },
    { reps: 8, weight: 40 }, { reps: 10, weight: 35 }
  ]);
});

test('infers rounds from equal progressive set arrays and preserves each prescription', () => {
  const result = serializeSupersetBlock({
    members: [
      {
        exercise: exerciseA,
        setupKey: 'mid-bench',
        sets: [{ reps: 10, weight: 30 }, { reps: 8, weight: 35 }]
      },
      {
        exercise: exerciseB,
        setupKey: 'mid-bench',
        sets: [{ reps: 12, weight: 25 }, { reps: 10, weight: 30 }]
      }
    ]
  });

  assert.equal(result.rounds, 2);
  assert.deepEqual(result.steps.map(({ exercise, set, restAfterSeconds }) => [
    exercise.groupId, set.reps, set.weight, restAfterSeconds
  ]), [
    [11, 10, 30, 1], [22, 12, 25, 90],
    [11, 8, 35, 1], [22, 10, 30, 90]
  ]);
});

test('supports a three-exercise round and keeps the requested interleaving order', () => {
  const result = serializeSupersetBlock({
    members: [11, 22, 33].map((groupId) => ({
      exercise: { groupId, title: `Exercise ${groupId}` },
      setupKey: 'same-station',
      set: { durationSeconds: 30, unit: 'sec' }
    })),
    rounds: 2,
    transitionRestSeconds: 5,
    recoveryRestSeconds: 75
  });

  assert.deepEqual(result.steps.map(({ exercise, round, restAfterSeconds }) => [
    exercise.groupId, round, restAfterSeconds
  ]), [
    [11, 1, 5], [22, 1, 5], [33, 1, 75],
    [11, 2, 5], [22, 2, 5], [33, 2, 75]
  ]);
});

test('floors zero-second transition and recovery rests to the machine 1-second minimum', () => {
  const result = serializeSupersetBlock({
    members: [
      { exercise: exerciseA, setupKey: 'same', set: { reps: 8 } },
      { exercise: exerciseB, setupKey: 'same', set: { reps: 8 } }
    ],
    rounds: 1,
    transitionRestSeconds: 0,
    recoveryRestSeconds: 0
  });

  assert.equal(result.transitionRestSeconds, 1);
  assert.equal(result.recoveryRestSeconds, 1);
  assert.deepEqual(result.steps.map((step) => step.restAfterSeconds), [1, 1]);
});

test('rejects different or missing setup keys before producing any sequence', () => {
  const base = [
    { exercise: exerciseA, setupKey: 'low-flat', set: { reps: 8 } },
    { exercise: exerciseB, setupKey: 'low-flat', set: { reps: 8 } }
  ];
  assert.equal(serializeSupersetBlock({ members: base }).steps.length, 6);
  assert.throws(() => serializeSupersetBlock({
    members: [base[0], { ...base[1], setupKey: 'high-incline' }]
  }), /różne setupKey/);
  assert.throws(() => serializeSupersetBlock({
    members: [base[0], { exercise: exerciseB, set: { reps: 8 } }]
  }), /potwierdzony.*setupKey/);
});

test('rejects uneven progressive sets because skipping or padding a round is undefined', () => {
  assert.throws(() => serializeSupersetBlock({
    members: [
      { exercise: exerciseA, setupKey: 'same', sets: [{ reps: 10 }, { reps: 8 }] },
      { exercise: exerciseB, setupKey: 'same', sets: [{ reps: 12 }] }
    ]
  }), /liczby serii.*różne/);
});

test('rejects an explicit round count that conflicts with progressive prescriptions', () => {
  assert.throws(() => serializeSupersetBlock({
    members: [
      { exercise: exerciseA, setupKey: 'same', sets: [{ reps: 10 }, { reps: 8 }] },
      { exercise: exerciseB, setupKey: 'same', sets: [{ reps: 12 }, { reps: 10 }] }
    ],
    rounds: 3
  }), /ma 2 progresywnych serii.*podano 3 rund/);
});

test('validates member count, rounds, rest ranges, and required exercise identities', () => {
  const validPair = [
    { exercise: exerciseA, setupKey: 'same', set: { reps: 8 } },
    { exercise: exerciseB, setupKey: 'same', set: { reps: 8 } }
  ];
  for (const rounds of [0, -1, 1.5, 13, '3']) {
    assert.throws(() => serializeSupersetBlock({ members: validPair, rounds }), /rund musi być/);
  }
  assert.throws(() => serializeSupersetBlock({ members: [validPair[0]] }), /2 albo 3/);
  assert.throws(() => serializeSupersetBlock({
    members: [...validPair, { exercise: { title: 'No ID' }, setupKey: 'same', set: { reps: 8 } }]
  }), /dodatni groupId albo id/);
  assert.throws(() => serializeSupersetBlock({ members: validPair, transitionRestSeconds: -1 }), /transitionRestSeconds/);
  assert.throws(() => serializeSupersetBlock({ members: validPair, recoveryRestSeconds: 601 }), /recoveryRestSeconds/);
});

test('block rest overrides member rest without mutating caller-owned exercises or sets', () => {
  const setA = { reps: 8, rest: 120, restSeconds: 120 };
  const setB = { reps: 10, rest: 150 };
  const exercise = { ...exerciseA };
  const result = serializeSupersetBlock({
    members: [
      { exercise, setupKey: 'same', set: setA },
      { exercise: exerciseB, setupKey: 'same', set: setB }
    ],
    rounds: 1
  });

  assert.deepEqual(result.steps.map(({ set, restAfterSeconds }) => [set, restAfterSeconds]), [
    [{ reps: 8 }, 1], [{ reps: 10 }, 90]
  ]);
  assert.deepEqual(setA, { reps: 8, rest: 120, restSeconds: 120 });
  assert.deepEqual(setB, { reps: 10, rest: 150 });
  assert.notEqual(result.steps[0].exercise, exercise);
});

test('expands superset steps in actual saved-template order between ordinary exercises', () => {
  const block = serializeSupersetBlock({
    members: [
      { exercise: exerciseA, setupKey: 'low-row', sets: [{ unit: 'reps', reps: 8, mode: 1, rest: 90 }, { unit: 'reps', reps: 8, mode: 1, rest: 90 }] },
      { exercise: exerciseB, setupKey: 'low-row', sets: [{ unit: 'reps', reps: 10, mode: 1, rest: 90 }, { unit: 'reps', reps: 10, mode: 1, rest: 90 }] }
    ]
  });
  const result = expandPlanForSerialization({
    exercises: [
      { id: 11, sets: [{ reps: 8 }] },
      { id: 22, sets: [{ reps: 10 }] },
      { id: 33, sets: [{ reps: 12 }] }
    ],
    supersetBlocks: [{ ...block, members: [{ exerciseId: 11 }, { exerciseId: 22 }] }]
  });
  assert.deepEqual(result.map(({ exercise, sets, superset }) => [exercise.id, sets[0].reps, sets[0].rest, superset]), [
    [11, 8, 1, true], [22, 10, 90, true],
    [11, 8, 1, true], [22, 10, 90, true],
    [33, 12, undefined, false]
  ]);
});

function normalizedExercises({ bodyweight = false } = {}) {
  const type = bodyweight ? 'bodyweight' : 'profile-auto';
  const set = { unit: 'reps', reps: 8, mode: 1, rest: 75 };
  return [
    { id: 11, title: 'Cable Press', loadType: type, sets: [{ ...set }, { ...set, reps: 10 }] },
    { id: 22, title: 'Cable Row', loadType: 'profile-auto', sets: [{ ...set }, { ...set, reps: 10 }] },
    { id: 33, title: 'Squat', loadType: 'profile-auto', sets: [{ ...set }] }
  ];
}

test('normalizes a confirmed shared setup, writes transition/recovery rests, and expands interleaved rounds', () => {
  const exercises = normalizedExercises();
  const blocks = normalizeSupersetBlocks([{
    members: [
      { exerciseId: 11, setupKey: 'low-cable-straight-bar' },
      { exerciseId: 22, setupKey: 'low-cable-straight-bar' }
    ],
    transitionRestSeconds: 3,
    recoveryRestSeconds: 90
  }], exercises);
  assert.equal(blocks[0].rounds, 2);
  assert.deepEqual(blocks[0].members, [
    { exerciseId: 11, setupKey: 'low-cable-straight-bar' },
    { exerciseId: 22, setupKey: 'low-cable-straight-bar' }
  ]);
  assert.deepEqual(exercises[0].sets.map(({ rest }) => rest), [3, 3]);
  assert.deepEqual(exercises[1].sets.map(({ rest }) => rest), [90, 90]);
  const sequence = expandPlanForSerialization({ exercises, supersetBlocks: blocks });
  assert.deepEqual(sequence.map(({ exercise, sets }) => [exercise.id, sets[0].reps, sets[0].rest]), [
    [11, 8, 3], [22, 8, 90], [11, 10, 3], [22, 10, 90], [33, 8, 75]
  ]);
});

test('allows a bodyweight mat movement with one confirmed machine setup, but rejects loaded mat-only members', () => {
  const exercises = normalizedExercises({ bodyweight: true });
  const blocks = normalizeSupersetBlocks([{
    members: [
      { exerciseId: 11, setupKey: 'mat-only' },
      { exerciseId: 22, setupKey: 'low-cable-straight-bar' }
    ],
    rounds: 2
  }], exercises);
  assert.equal(blocks[0].setupKey, 'low-cable-straight-bar');
  assert.deepEqual(blocks[0].members.map(({ setupKey }) => setupKey), [
    'mat-only', 'low-cable-straight-bar'
  ]);
  assert.equal(blocks[0].setupDeclarationVersion, 1);
  assert.equal(blocks[0].setupDeclarationStatus, 'caller-declared-unverified');

  const loadedExercises = normalizedExercises();
  assert.throws(() => normalizeSupersetBlocks([{
    members: [
      { exerciseId: 11, setupKey: 'mat-only' },
      { exerciseId: 22, setupKey: 'low-cable-straight-bar' }
    ]
  }], loadedExercises), /mat-only wymaga ćwiczenia bodyweight/);
});

test('rejects changed setup, non-contiguous members, and uneven round counts', () => {
  const exercises = normalizedExercises();
  assert.throws(() => normalizeSupersetBlocks([{
    members: [
      { exerciseId: 11, setupKey: 'low-cable' },
      { exerciseId: 22, setupKey: 'high-cable' }
    ]
  }], exercises), /różne ustawienia urządzenia/);
  assert.throws(() => normalizeSupersetBlocks([{
    members: [
      { exerciseId: 11, setupKey: 'same' },
      { exerciseId: 33, setupKey: 'same' }
    ]
  }], exercises), /muszą występować obok siebie/);
  assert.throws(() => normalizeSupersetBlocks([{
    members: [
      { exerciseId: 11, setupKey: 'same' },
      { exerciseId: 22, setupKey: 'same' }
    ]
  }], [exercises[0], { ...exercises[1], sets: exercises[1].sets.slice(0, 1) }]), /liczby serii.*różne/);
});

test('duplicate catalog exercises use entry IDs without replacing actual API identity', () => {
  const exercises = [101, 102].map(entryId => ({ id: 42, entryId, title: 'Same catalog movement', loadType: 'bodyweight', sets: [{ reps: 8, mode: 1, rest: 60 }] }));
  const blocks = normalizeSupersetBlocks([{ members: [{ exerciseId: 101, setupKey: 'mat-only' }, { exerciseId: 102, setupKey: 'mat-only' }] }], exercises);
  assert.deepEqual(blocks[0].steps.map(step => step.exercise.entryId), [101, 102]);
  assert.deepEqual(blocks[0].steps.map(step => step.exercise.groupId), [42, 42]);
  const expanded = expandPlanForSerialization({ exercises, supersetBlocks: blocks });
  assert.deepEqual(expanded.map(entry => entry.exercise.entryId), [101, 102]);
  assert.throws(() => expandPlanForSerialization({ exercises: [exercises[0], exercises[0]] }), /unikalne/);
  assert.throws(() => normalizeSupersetBlocks([{ members: [{ exerciseId: 101, setupKey: 'mat-only' }, { exerciseId: 102, setupKey: 'mat-only' }] }], [{ ...exercises[0], section: 'warmup' }, exercises[1]]), /main/);
});
