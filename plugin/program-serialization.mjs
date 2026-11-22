export const MAX_SERIALIZED_API_SETS = 100;
import { addCardioIntensityTags, buildExerciseLoadPayload, mapReferenceClientResistanceModesToWire, normalizeSetWork } from './program-payload.mjs';
import { expandPlanForSerialization } from './superset-serialization.mjs';
import { resolveStaticLoadMetadata, validateStaticLoad } from './static-load-limits.mjs';
import { expandUnilateralPrescription } from './unilateral-prescription.mjs';

/** A lower bound only: repetition work, setup and unknown sides are not estimated. */
export function assertPlanTimeLowerBound(plan, sessionMinutes, metadataById = new Map()) {
  if (sessionMinutes === undefined) return;
  if (!Number.isSafeInteger(sessionMinutes) || sessionMinutes < 10 || sessionMinutes > 240) throw new Error('Nieprawidłowy limit czasu sesji.');
  const execution = [];
  for (const entry of expandPlanForSerialization(plan)) {
    const metadata = resolveStaticLoadMetadata(metadataById.get(entry.exercise.id));
    // Explicit sides already represent separate executed sets; do not duplicate them.
    const sets = expandUnilateralPrescription(entry.exercise, entry.sets, { isUnilateral: metadata.isUnilateral, superset: entry.superset });
    execution.push(...sets);
  }
  let seconds = 0;
  execution.forEach((set, index) => {
    const work = normalizeSetWork(set, index);
    if (work.unit === 'seconds') seconds += work.amount;
    // The last serialized rest is after the session and need not be performed.
    if (index < execution.length - 1) {
      if (!Number.isSafeInteger(set.rest) || set.rest < 0) throw new Error('Nieprawidłowa wykonywana przerwa serii.');
      seconds += set.rest;
    }
  });
  if (seconds > sessionMinutes * 60) throw new Error(`Plan przekracza limit ${sessionMinutes} min: sama pewna praca czasowa i przerwy wymagają co najmniej ${seconds} s. Czas powtórzeń i konfiguracji nie został doliczony.`);
}

/** Build the saved-program shape compatible with the pinned hbui3 community client writer; hosted its author serialization is unverified. */
export function buildPresetPayload(plan, metadataById, deviceType, displayUnit, { staticLoadProtocol = 'legacy-reference-client-wire-lb-get-kg' } = {}) {
  assertPlanTimeLowerBound(plan, plan.confirmedSessionMinutes, metadataById);
  const actionLibraryList = [];
  // Server-owned display rows captured from the exact expansion used below.
  // Keep them separate from the scientific prescription and wire payload.
  const executionExercises = [];
  let totalCapacity = 0;
  let apiSetCount = 0;
  for (const entry of expandPlanForSerialization(plan)) {
    const { exercise, sets: prescribedSets } = entry;
    const metadata = metadataById.get(exercise.id);
    const actionLibraryId = resolveActionLibraryVariantId(exercise, metadata);
    if (!Number.isSafeInteger(actionLibraryId) || actionLibraryId < 1) {
      throw new Error(`Nie udało się rozpoznać wariantu API dla ćwiczenia „${exercise.title}”. Programu nie zapisano.`);
    }
    const presetId = exercise.loadType === 'smart-rm' ? exercise.smartRmPresetId : -1;
    if (exercise.loadType === 'smart-rm' && !Number.isSafeInteger(presetId)) {
      throw new Error(`Ćwiczenie „${exercise.title}”: brak dokładnego, potwierdzonego ID presetu RM. Programu nie zapisano.`);
    }
    if (exercise.loadType === 'vita') assertVitaDataStatType(exercise, metadata);
    const cableMetadata = resolveStaticLoadMetadata(metadata);
    if (cableMetadata.isUnilateral === undefined && [metadata?.detail, metadata?.batch]
        .some(source => source && Object.hasOwn(source, 'isLeftRight'))) {
      throw new Error(`Ćwiczenie „${exercise.title}”: sprzeczne lub nieprawidłowe metadane stron linek. Programu nie zapisano.`);
    }
    const apiSets = expandUnilateralPrescription(exercise, prescribedSets, {
      isUnilateral: cableMetadata.isUnilateral, superset: entry.superset
    });
    executionExercises.push({ ...exercise, executionOccurrence: executionExercises.length, sets: apiSets.map(set => ({ ...set })) });
    apiSetCount += apiSets.length;
    if (apiSetCount > MAX_SERIALIZED_API_SETS) throw new Error('Plan przekracza lokalny limit rozmiaru 100 serii po rozwinięciu stron i superserii; nie jest to potwierdzony limit Speediance.');
    const normalizedWork = apiSets.map((set, index) => normalizeSetWork(set, index));
    const reps = normalizedWork.map(({ amount }) => String(amount));
    const breaks = apiSets.map((set) => String(set.rest));
    const modes = mapReferenceClientResistanceModesToWire(apiSets.map((set) => set.mode)).map(String);
    const leftRight = apiSets.map((set) => String(set.side));
    const completionMethods = normalizedWork.map(({ unit }) => unit === 'seconds' ? '2' : '1');
    const loadPayload = buildExerciseLoadPayload(exercise.loadType, apiSets, {
      staticLoadProtocol, fixedKgAuthorized: exercise.fixedKgAuthorized === true, staticLoadRequested: exercise.staticLoadRequested === true,
      strengthAnchor: exercise.strengthAnchor,
      smartRmPresetName: exercise.smartRmPresetName,
      exerciseContext: { title: exercise.title, movementKind: exercise.movementKind, dataStatType: exercise.dataStatType },
      ...(displayUnit ? { displayUnit } : {})
    });
    if (['fixed-kg', 'profile-auto', 'customize-manual'].includes(exercise.loadType)) {
      const context = {
        displayUnit: exercise.loadType === 'fixed-kg' ? 'kg' : displayUnit,
        ...cableMetadata
      };
      // Customize uses prescribed account units before imperial UI snapping.
      // Explicit manual kg remains canonical kg even on an imperial account.
      const displayLoads = exercise.loadType === 'profile-auto'
        ? loadPayload.loadEstimates.map(estimate => estimate.suggestedLoad)
        : apiSets.map(set => exercise.loadType === 'customize-manual' ? set.weight : set.weightKg);
      for (const weight of displayLoads) {
        validateStaticLoad(weight, context);
      }
    }
    totalCapacity += loadPayload.capacity;
    actionLibraryList.push({
      groupId: exercise.id,
      actionLibraryId,
      templatePresetId: presetId,
      setsAndReps: reps.join(','),
      breakTime: breaks.join(','),
      breakTime2: breaks.join(','),
      sportMode: modes.join(','),
      leftRight: leftRight.join(','),
      selectCompletionMethod: apiSets.map(() => '1').join(','),
      completionMethod: completionMethods.join(','),
      countType: completionMethods.join(','),
      weights: loadPayload.weights,
      counterweight: loadPayload.counterweight,
      counterweight2: loadPayload.counterweight2,
      level: exercise.loadType === 'vita' ? loadPayload.level : apiSets.map(() => '0').join(','),
      capacity: loadPayload.capacity
    });
  }
  return { payload: { name: addCardioIntensityTags(plan.name, plan.exercises), actionLibraryList, totalCapacity, deviceType, bgColor: 0 }, executionExercises };
}

/** Vita is a catalog dataStatType, never a title or caller assertion. Require
 * an exact live 6 in at least one current metadata source and reject any
 * explicit disagreement before building the wire payload. */
export function assertVitaDataStatType(exercise, metadata) {
  if (exercise?.dataStatType !== 6) {
    throw new Error(`Ćwiczenie „${exercise?.title ?? 'bez nazwy'}” wymaga aktualnego, jednoznacznego dataStatType=6 z katalogu Speediance.`);
  }
  const explicitValues = [metadata?.detail, metadata?.batch]
    .filter((source) => source && typeof source === 'object' && Object.hasOwn(source, 'dataStatType'))
    .map((source) => source.dataStatType);
  if (!explicitValues.length || explicitValues.some((value) => value !== 6)) {
    throw new Error(`Ćwiczenie „${exercise.title}” nie ma zgodnego, aktualnego dataStatType=6 w metadanych API. Programu nie zapisano.`);
  }
  return 6;
}

export function resolveActionLibraryVariantId(exercise, metadata) {
  if (metadata?.groupIdentity?.executableAllowed === false) throw new Error('Exercise metadata group identity is mismatched, invalid or ambiguous; executable variant blocked.');
  const variants = Array.isArray(metadata?.batch?.actionLibraryList)
    ? metadata.batch.actionLibraryList
      .map((variant) => ({ variant, id: Number(variant?.id) }))
      .filter(({ id }) => Number.isSafeInteger(id) && id > 0)
    : [];
  if (Number.isSafeInteger(exercise?.actionLibraryId) && exercise.actionLibraryId > 0) {
    const matches = variants.filter(({ id }) => id === exercise.actionLibraryId);
    if (matches.length === 1) return exercise.actionLibraryId;
    throw new Error(`Wariant API ${exercise.actionLibraryId} nie jest jednoznacznie dostępny dla ćwiczenia „${exercise.title}”. Programu nie zapisano.`);
  }
  if (variants.length === 1) return variants[0].id;
  const listed = variants.map(({ id, variant }) => `${id}${variant?.name ? ` (${String(variant.name).slice(0, 60)})` : ''}`).join(', ') || 'brak';
  throw new Error(`Ćwiczenie „${exercise.title}” ma ${variants.length ? 'wiele wariantów API' : 'brak wariantu API'} (${listed}). Pobierz speediance_get_exercise_presets i wybierz actionLibraryId dla dokładnego wariantu; nie zgaduję.`);
}

