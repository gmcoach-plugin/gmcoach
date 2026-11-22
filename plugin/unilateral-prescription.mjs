/** Explicit sides are actual API sets, not working sets awaiting duplication. */
export function normalizeUnilateralPrescription(value) {
  const prescription = value ?? 'paired-symmetric';
  if (!['paired-symmetric', 'explicit-sides'].includes(prescription)) {
    throw new TypeError('unilateralPrescription must be paired-symmetric or explicit-sides.');
  }
  return prescription;
}

export function validateExplicitSidePairs(sets) {
  if (!Array.isArray(sets) || sets.length < 2 || sets.length % 2 !== 0) {
    throw new TypeError('Explicit side prescriptions require complete ordered Left/Right pairs.');
  }
  sets.forEach((set, index) => {
    if (!set || typeof set !== 'object' || Array.isArray(set) || set.side !== (index % 2 === 0 ? 1 : 2)) {
      throw new TypeError(`Explicit side set ${index + 1} must specify side ${index % 2 === 0 ? 1 : 2}.`);
    }
  });
  return sets;
}

export function expandUnilateralPrescription(exercise, sets, { isUnilateral, superset = false } = {}) {
  const prescription = normalizeUnilateralPrescription(exercise?.unilateralPrescription);
  const suppliedTransition = Object.hasOwn(exercise ?? {}, 'sideTransitionSeconds');
  if (suppliedTransition && (!Number.isSafeInteger(exercise.sideTransitionSeconds) || exercise.sideTransitionSeconds < 1 || exercise.sideTransitionSeconds > 30 ||
      typeof exercise.sideTransitionRationale !== 'string' || !exercise.sideTransitionRationale.trim() || exercise.sideTransitionRationale.length > 500 || prescription !== 'paired-symmetric' || isUnilateral !== true)) {
    throw new Error('Side transition requires confirmed unilateral paired-symmetric exercise, 1–30 seconds and explicit operational rationale.');
  }
  if (!suppliedTransition && Object.hasOwn(exercise ?? {}, 'sideTransitionRationale')) throw new Error('Side transition rationale requires seconds.');
  if (!Array.isArray(sets)) throw new TypeError('Prescribed sets must be an array.');
  if (prescription === 'explicit-sides') {
    if (isUnilateral !== true) throw new Error('Explicit sides require confirmed unilateral catalog metadata.');
    if (superset) throw new Error('Explicit side prescriptions are not supported inside supersets.');
    validateExplicitSidePairs(sets);
    return sets.map(set => ({ ...set }));
  }
  if (sets.some(set => set && Object.hasOwn(set, 'side'))) {
    throw new Error('A set side requires explicit-sides; paired-symmetric must not silently discard it.');
  }
  return sets.flatMap(set => isUnilateral === true
    ? [{ ...set, side: 1, rest: exercise.sideTransitionSeconds ?? 1 }, { ...set, side: 2 }]
    : [{ ...set, side: 0 }]);
}
