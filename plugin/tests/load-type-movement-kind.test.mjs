import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_EXERCISE_LOAD_TYPES,
  buildExerciseLoadPayload,
  inferDefaultLoadType,
  normalizeExerciseLoadType,
  resolveRequestedLoadType
} from '../program-payload.mjs';

const resistedKinds = ['bodyweight', 'mat', 'pilates', 'cardio', 'recovery'];
const resistedLoadTypes = ['smart-rm', 'profile-auto', 'customize-manual', 'fixed-kg'];
const repSet = { unit: 'reps', reps: 8, rirTarget: 2, rmLevel: 10 };
const preset = { smartRmPresetName: 'Gain Muscle' };
const profile = {
  strengthAnchor: { oneRepMax: 100, unit: 'kg', source: 'local-training-profile' },
  displayUnit: 'kg'
};

test('exports one canonical loadType vocabulary and keeps Pilates as a category', () => {
  assert.deepEqual(SUPPORTED_EXERCISE_LOAD_TYPES, [
    'smart-rm', 'profile-auto', 'customize-manual', 'fixed-kg', 'bodyweight', 'cardio', 'vita'
  ]);
  assert.equal(SUPPORTED_EXERCISE_LOAD_TYPES.includes('pilates'), false);
  for (const loadType of SUPPORTED_EXERCISE_LOAD_TYPES) {
    assert.equal(resolveRequestedLoadType({ defaultLoadType: loadType }), loadType);
  }
  assert.throws(() => resolveRequestedLoadType({ defaultLoadType: 'bodyweight', loadType: 'pilates' }), /Nieobsługiwany loadType/);
  assert.throws(() => resolveRequestedLoadType({ defaultLoadType: 'pilates' }), /domyślnego typu obciążenia/);
  assert.throws(() => buildExerciseLoadPayload('vita', [{ reps: 8, level: 10 }]), /jednoznacznym dataStatType=6/);
  assert.equal(buildExerciseLoadPayload('vita', [{ reps: 8, level: 10 }], {
    exerciseContext: { dataStatType: 6 }
  }).level, '10');
});

test('catalog movement kind sets safe defaults for timed/bodyweight work', () => {
  for (const movementKind of ['bodyweight', 'mat', 'pilates', 'recovery']) {
    assert.equal(inferDefaultLoadType([{ unit: 'seconds', durationSeconds: 30 }], '', movementKind), 'bodyweight');
    assert.equal(normalizeExerciseLoadType('bodyweight', [{ unit: 'seconds', durationSeconds: 30 }], false, false, movementKind), 'bodyweight');
  }
  assert.equal(inferDefaultLoadType([{ unit: 'seconds', durationSeconds: 30, intensity: 4 }], '', 'cardio'), 'cardio');
  assert.equal(normalizeExerciseLoadType('cardio', [{ unit: 'seconds', durationSeconds: 30, intensity: 4 }], false, false, 'cardio'), 'cardio');
});

test('rejects Smart RM, Customize, and fixed loads on confirmed non-resistance movements', () => {
  const loadOptions = {
    'smart-rm': { fixedKgAuthorized: false, smartRmPresetName: 'Gain Muscle' },
    'profile-auto': { ...profile },
    'customize-manual': { staticLoadRequested: true, displayUnit: 'kg' },
    'fixed-kg': { fixedKgAuthorized: true }
  };

  for (const movementKind of resistedKinds) {
    for (const loadType of resistedLoadTypes) {
      const sets = loadType === 'fixed-kg'
        ? [{ unit: 'reps', reps: 8, weightKg: 20 }]
        : loadType === 'customize-manual' ? [{ unit: 'reps', reps: 8, weight: 20, weightUnit: 'kg' }] : [repSet];
      const authorizeFixedKg = loadType === 'fixed-kg';
      assert.throws(
        () => normalizeExerciseLoadType(loadType, sets, authorizeFixedKg, false, movementKind),
        /Katalog Speediance potwierdza rodzaj ruchu/,
        `${loadType} must be rejected for ${movementKind}`
      );
      assert.throws(
        () => buildExerciseLoadPayload(loadType, sets, {
          ...loadOptions[loadType],
          exerciseContext: { title: 'Catalog exercise', movementKind }
        }),
        /Katalog Speediance potwierdza rodzaj ruchu/,
        `the final serializer must reject ${loadType} for ${movementKind}`
      );
    }
  }
});

test('preserves allowed resisted work and legacy inputs without catalog classification', () => {
  assert.equal(normalizeExerciseLoadType('smart-rm', [repSet], false, false, 'strength'), 'smart-rm');
  assert.equal(normalizeExerciseLoadType('profile-auto', [repSet], false, false, 'resistance'), 'profile-auto');
  assert.equal(normalizeExerciseLoadType('fixed-kg', [{ reps: 8, weightKg: 20 }], true, false, 'strength'), 'fixed-kg');
  assert.equal(normalizeExerciseLoadType('smart-rm', [repSet]), 'smart-rm');

  assert.deepEqual(buildExerciseLoadPayload('bodyweight', [{ reps: 10 }], {
    exerciseContext: { title: 'Mat exercise', movementKind: 'mat' }
  }), { weights: '0', counters: '', counterweight: '', counterweight2: '', capacity: 0 });
  assert.equal(buildExerciseLoadPayload('smart-rm', [repSet], preset).rmLevels[0], 10);
  assert.equal(buildExerciseLoadPayload('profile-auto', [{ reps: 8 }], profile).weights, '169.4');
  assert.equal(buildExerciseLoadPayload('fixed-kg', [{ reps: 8, weightKg: 20 }], {
    fixedKgAuthorized: true,
    displayUnit: 'kg',
    exerciseContext: { movementKind: 'strength' }
  }).weights, '44.0');
});
