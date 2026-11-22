export const DELOAD_CUSTOMIZE_WEIGHT_REQUIRED = 'GM_COACH_DELOAD_CUSTOMIZE_WEIGHT_REQUIRED';

const ACCOUNT_UNITS = new Set(['kg', 'lb']);
const REP_UNITS = new Set(['reps', 'rep']);


function hasAccountWeight(set) {
  return set && typeof set === 'object' && Number.isFinite(set.weight) && set.weight > 0 && set.weight <= 1000 &&
    ACCOUNT_UNITS.has(set.weightUnit) && set.weightKg === undefined;
}

function requiredLoadRow(exercise, exerciseIndex, defaultLoadType) {
  const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
  const rows = sets.map((set, index) => {
    const unit = set?.unit ?? (set?.reps !== undefined ? 'reps' : undefined);
    if (!REP_UNITS.has(unit)) return null;
    const missingFields = [];
    if (!Number.isFinite(set?.weight) || set.weight <= 0 || set.weight > 1000) missingFields.push('weight');
    if (!ACCOUNT_UNITS.has(set?.weightUnit)) missingFields.push('weightUnit');
    return missingFields.length ? {
      set: index + 1,
      ...(set?.side === undefined ? {} : { side: set.side }),
      reps: set?.reps ?? null,
      unit: 'reps',
      missingFields
    } : null;
  }).filter(Boolean);
  return {
    exerciseIndex: exerciseIndex + 1,
    ...(Number.isSafeInteger(exercise.entryId) ? { entryId: exercise.entryId } : {}),
    ...(Number.isSafeInteger(exercise.id) ? { exerciseId: exercise.id } : {}),
    title: typeof exercise.title === 'string' ? exercise.title : `Ćwiczenie ${exerciseIndex + 1}`,
    section: exercise.section ?? 'main',
    sourceLoadType: exercise.loadType ?? defaultLoadType,
    requiredLoadType: 'customize-manual',
    requiredSets: rows.length ? rows : sets.map((set, index) => ({
      set: index + 1,
      ...(set?.side === undefined ? {} : { side: set.side }),
      reps: set?.reps ?? null,
      unit: set?.unit ?? (set?.reps !== undefined ? 'reps' : null),
      missingFields: ['weight', 'weightUnit']
    }))
  };
}

/**
 * Apply the explicit deload load preference to normalized plan inputs.
 * This never infers intent from a program name. For a deload, weighted main
 * rep work defaults to manual Customize; it cannot silently fall back to RM.
 */
export function applyDeloadLoadPolicy({ isDeload = false, deloadLoadOverride, exercises, inferredLoadTypes = [] } = {}) {
  if (typeof isDeload !== 'boolean') throw new TypeError('isDeload must be an explicit boolean.');
  if (deloadLoadOverride !== undefined && deloadLoadOverride !== 'smart-rm') {
    throw new TypeError('deloadLoadOverride, when supplied, must be smart-rm.');
  }
  if (!isDeload && deloadLoadOverride !== undefined) {
    throw new TypeError('deloadLoadOverride requires isDeload=true.');
  }
  if (!Array.isArray(exercises)) throw new TypeError('Deload policy requires an exercise array.');
  if (!isDeload || deloadLoadOverride === 'smart-rm') {
    return { exercises, requiredLoads: [], applied: false, mode: deloadLoadOverride ?? null };
  }

  const requiredLoads = [];
  const normalizedExercises = exercises.map((input, index) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    const section = input.section ?? 'main';
    if (section !== 'main') return input;
    const defaultLoadType = inferredLoadTypes[index] ?? input.inferredLoadType;
    const loadType = input.loadType ?? defaultLoadType;
    const hasRepSet = Array.isArray(input.sets) && input.sets.some(set => REP_UNITS.has(set?.unit ?? (set?.reps !== undefined ? 'reps' : undefined)));
    if (!hasRepSet || loadType !== 'smart-rm') return input;

    const allSetsHaveStaticWeight = input.sets.length > 0 && input.sets.every(hasAccountWeight);
    if (!allSetsHaveStaticWeight) {
      requiredLoads.push(requiredLoadRow(input, index, defaultLoadType));
      return input;
    }

    const { smartRmPresetId: _presetId, smartRmPresetName: _presetName, ...rest } = input;
    return { ...rest, loadType: 'customize-manual', staticLoadRequested: true };
  });

  return { exercises: normalizedExercises, requiredLoads, applied: true, mode: 'customize' };
}
