const VALID_WEIGHT_UNITS = new Set(['kg', 'lb']);
const LOAD_POINT_CANDIDATES = [1, 2];
const LOAD_POINT_RATIO_TOLERANCE = 0.02;

function strictNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readSetEvidence(set) {
  const detail = isRecord(set?.trainingInfoDetail) ? set.trainingInfoDetail : null;
  const rawWeights = detail?.weights;
  const weightsFieldPresent = rawWeights !== undefined && rawWeights !== null;
  const weights = Array.isArray(rawWeights) ? rawWeights : null;
  const parsedWeights = weights?.map(strictNumber) ?? null;
  const weightsValid = Boolean(parsedWeights) && parsedWeights.every((weight) => weight !== null && weight >= 0);
  const weightSum = weightsValid
    ? parsedWeights.reduce((sum, weight) => sum + weight, 0)
    : null;
  const capacityFieldPresent = set && Object.hasOwn(set, 'capacity') && set.capacity !== null && set.capacity !== undefined;
  const capacity = strictNumber(set?.capacity);
  const capacityValid = capacity !== null && capacity >= 0;
  const completedReps = strictNumber(set?.finishedCount);
  const explicitZeroLoad = weightsValid && parsedWeights.length > 0 && parsedWeights.every((weight) => weight === 0) &&
    capacity === 0 && Number.isSafeInteger(completedReps) && completedReps === parsedWeights.length;
  const hasNonzeroOrMalformedWeights = weightsFieldPresent && (
    !weights || !weightsValid || parsedWeights.some((weight) => weight > 0)
  );
  const isLoadedCandidate = !explicitZeroLoad && (
    (capacity !== null && capacity > 0) ||
    hasNonzeroOrMalformedWeights ||
    (set?.unit === 'reps' && Number.isSafeInteger(completedReps) && completedReps > 0)
  );

  return {
    weightsFieldPresent,
    weights,
    parsedWeights,
    weightsValid,
    weightSum,
    capacityFieldPresent,
    capacity,
    capacityValid,
    completedReps,
    explicitZeroLoad,
    isLoadedCandidate
  };
}

function inferSetVolume(set, weightUnit, setIndex) {
  if (!isRecord(set)) {
    return { set: setIndex + 1, status: 'unknown', reason: 'INVALID_HISTORY_SET' };
  }

  // The pinned community parser gives side arrays precedence over aggregate
  // weights (which may be force telemetry). Their independent/ragged samples
  // do not establish completed per-repetition loads or a tonnage formula.
  const detail = isRecord(set.trainingInfoDetail) ? set.trainingInfoDetail : {};
  const sideFields = ['leftWeights', 'rightWeights', 'left_weights', 'right_weights'];
  const hasSideTelemetry = [set, detail].some(record => sideFields.some(key => {
    const value = record[key];
    return value !== undefined && value !== null &&
      !(Array.isArray(value) && value.length === 0) && value !== '';
  }));
  if (hasSideTelemetry) {
    return { set: setIndex + 1, status: 'unknown', reason: 'SIDE_TELEMETRY_NOT_VERIFIED_PER_REP_LOADS' };
  }

  const evidence = readSetEvidence(set);
  if (!evidence.isLoadedCandidate) {
    return {
      set: setIndex + 1,
      status: 'excluded',
      reason: evidence.explicitZeroLoad ? 'EXPLICIT_ZERO_LOAD' : 'NO_POSITIVE_LOAD_EVIDENCE'
    };
  }

  const unknown = (reason) => ({ set: setIndex + 1, status: 'unknown', reason });
  if (set.unit !== 'reps') return unknown('UNIT_NOT_EXPLICIT_REPS');
  if (!VALID_WEIGHT_UNITS.has(weightUnit)) return unknown('UNKNOWN_WEIGHT_UNIT');
  if (!Number.isSafeInteger(evidence.completedReps) || evidence.completedReps <= 0) {
    return unknown('INVALID_COMPLETED_REP_COUNT');
  }
  if (!evidence.weightsFieldPresent || !evidence.weights) return unknown('MISSING_PER_REP_WEIGHTS');
  if (!evidence.weightsValid) return unknown('INVALID_PER_REP_WEIGHTS');
  if (evidence.weights.length === 1 && evidence.completedReps > 1) {
    return unknown('SCALAR_WEIGHT_AMBIGUOUS_FOR_MULTI_REP_SET');
  }
  if (evidence.weights.length !== evidence.completedReps) return unknown('WEIGHT_COUNT_DOES_NOT_MATCH_COMPLETED_REPS');
  if (!(evidence.weightSum > 0)) return unknown('NONPOSITIVE_WEIGHT_SUM');
  if (!evidence.capacityFieldPresent || !evidence.capacityValid || !(evidence.capacity > 0)) {
    return unknown('MISSING_OR_NONPOSITIVE_HISTORY_CAPACITY');
  }

  const ratio = evidence.capacity / evidence.weightSum;
  const loadPoints = LOAD_POINT_CANDIDATES.find((candidate) =>
    Math.abs(ratio - candidate) <= LOAD_POINT_RATIO_TOLERANCE
  );
  if (!loadPoints) return unknown('CAPACITY_RATIO_NOT_CLEAR_ONE_OR_TWO');

  return {
    set: setIndex + 1,
    status: 'measured',
    weightUnit,
    completedReps: evidence.completedReps,
    perRepWeightSum: Number(evidence.weightSum.toFixed(6)),
    historyCapacity: evidence.capacity,
    capacityToWeightRatio: Number(ratio.toFixed(6)),
    loadPoints,
    liftedVolume: Number((evidence.weightSum * loadPoints).toFixed(3)),
    liftedVolumeUnit: `${weightUnit}·powt.`,
    provenance: {
      weightSource: 'finishedReps[].trainingInfoDetail.weights',
      capacitySource: 'finishedReps[].capacity',
      loadPointMethod: 'capacity / sum(per-rep weights), within 0.02 of 1 or 2'
    }
  };
}

/**
 * Summarize lifted volume from completed workout history detail only.
 *
 * Input records must be exercise objects containing `finishedReps` history sets.
 * Planned template fields such as `actionLibraryList`, `setsAndReps`, and template
 * `capacity` are deliberately not read. Set `leftRight`, exercise names, and exercise
 * flags are also deliberately ignored: none of them establishes the number of loaded
 * cable points.
 *
 * A set contributes only when its explicit unit is reps, the account unit is known,
 * per-rep loads match completed reps, and history capacity clearly implies one or two
 * load points. Any unresolved loaded set suppresses the session total.
 */
export function summarizeHistoryLiftedVolume(historyExercises, weightUnit) {
  const unit = VALID_WEIGHT_UNITS.has(weightUnit) ? weightUnit : 'unknown';
  if (!Array.isArray(historyExercises) || historyExercises.length === 0) {
    return {
      complete: false,
      totalLiftedVolume: null,
      totalLiftedVolumeUnit: unit === 'unknown' ? null : `${unit}·powt.`,
      loadedSetCount: 0,
      unknownLoadedSetCount: 0,
      exercises: [],
      reason: 'NO_HISTORY_EXERCISES',
      provenance: volumeProvenance(unit)
    };
  }

  const exercises = historyExercises.map((exercise, exerciseIndex) => {
    if (!isRecord(exercise) || !Array.isArray(exercise.finishedReps) || exercise.finishedReps.length === 0) {
      return {
        exercise: exerciseIndex + 1,
        status: 'unknown',
        reason: 'MISSING_FINISHED_HISTORY_SETS',
        sets: []
      };
    }

    let sets = exercise.finishedReps.map((set, setIndex) => inferSetVolume(set, unit, setIndex));
    const inferredPoints = new Set(sets
      .filter((set) => set.status === 'measured')
      .map((set) => set.loadPoints));
    if (inferredPoints.size > 1) {
      sets = sets.map((set) => ({
        set: set.set,
        status: 'unknown',
        reason: 'INCONSISTENT_LOAD_POINTS_WITHIN_EXERCISE'
      }));
      return {
        exercise: exerciseIndex + 1,
        status: 'unknown',
        reason: 'INCONSISTENT_LOAD_POINTS_WITHIN_EXERCISE',
        loadPoints: null,
        sets
      };
    }

    const loadedSets = sets.filter((set) => set.status !== 'excluded');
    const hasUnknown = loadedSets.some((set) => set.status !== 'measured');
    return {
      exercise: exerciseIndex + 1,
      status: loadedSets.length === 0 ? 'no-loaded-sets' : hasUnknown ? 'unknown' : 'measured',
      ...(inferredPoints.size === 1 ? { loadPoints: [...inferredPoints][0] } : {}),
      sets
    };
  });

  const allHistorySets = exercises.flatMap((exercise) => exercise.sets);
  const loadedSets = allHistorySets.filter((set) => set.status !== 'excluded');
  const unknownLoadedSetCount = loadedSets.filter((set) => set.status !== 'measured').length;
  const complete = loadedSets.length > 0 && unknownLoadedSetCount === 0 &&
    exercises.every((exercise) => exercise.status !== 'unknown');
  const totalLiftedVolume = complete
    ? Number(loadedSets.reduce((sum, set) => sum + set.liftedVolume, 0).toFixed(3))
    : null;

  return {
    complete,
    totalLiftedVolume,
    totalLiftedVolumeUnit: unit === 'unknown' ? null : `${unit}·powt.`,
    loadedSetCount: loadedSets.length,
    unknownLoadedSetCount,
    exercises,
    ...(complete ? {} : { reason: loadedSets.length === 0 ? 'NO_LOADED_SETS' : 'INCOMPLETE_OR_AMBIGUOUS_HISTORY_LOADS' }),
    provenance: volumeProvenance(unit)
  };
}

function volumeProvenance(weightUnit) {
  return {
    sourceScope: 'completed workout exercise.finishedReps history only',
    formula: 'sum(per-rep weights) × inferred load points',
    weightField: 'finishedReps[].trainingInfoDetail.weights',
    capacityField: 'finishedReps[].capacity',
    loadPointInference: 'capacity / sum(per-rep weights) must be within 0.02 of exactly 1 or 2',
    weightUnit: weightUnit === 'unknown' ? 'unknown; no conversion performed' : `resolved account unit supplied by caller: ${weightUnit}`,
    coverage: 'only observed history sets with positive load evidence; unresolved loaded sets suppress the total',
    apiStatus: 'reverse-engineered community heuristic; not an official Speediance contract'
  };
}
