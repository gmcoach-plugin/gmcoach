import { CONFIRMED_CUSTOMIZE_ANCHOR_SOURCES } from './coaching-profile.mjs';
import { quantizeCustomizeLoad } from './customize-load-step.mjs';
// The active reference client custom-workout contract exposes three Dynamic Weight
// profiles. These are reference client template codes, passed through to sportMode. The
// separate speediance-cli `push` contract uses a conflicting enum; never map
// one endpoint's numeric modes through the other endpoint's enum.
export const REFERENCE_CLIENT_RESISTANCE_MODE_NAMES = Object.freeze({
  1: 'Standard',
  2: 'Chain',
  3: 'Eccentric'
});

// Canonical plan load types. `pilates` is an exercise category, not a load
// method: unresisted mat work uses bodyweight, and band resistance has no
// verified Speediance template field.
export const SUPPORTED_EXERCISE_LOAD_TYPES = Object.freeze([
  'smart-rm', 'profile-auto', 'customize-manual', 'fixed-kg', 'bodyweight', 'cardio', 'vita'
]);

const SUPPORTED_EXERCISE_LOAD_TYPE_SET = new Set(SUPPORTED_EXERCISE_LOAD_TYPES);
const RESISTED_LOAD_TYPES = new Set(['smart-rm', 'profile-auto', 'customize-manual', 'fixed-kg']);

export function getReferenceClientResistanceModeName(mode) {
  const normalized = typeof mode === 'string' && /^\d+$/.test(mode) ? Number(mode) : mode;
  return Number.isSafeInteger(normalized)
    ? REFERENCE_CLIENT_RESISTANCE_MODE_NAMES[normalized] ?? null
    : null;
}

export function isWritableResistanceMode(mode) {
  return Number.isSafeInteger(mode) && getReferenceClientResistanceModeName(mode) !== null;
}

/** Pass a supported reference client template-mode code unchanged to sportMode. */
export function mapReferenceClientResistanceModeToWire(mode) {
  if (isWritableResistanceMode(mode)) return mode;
  throw new RangeError(`Nieobsługiwany kod trybu klienta referencyjnego w szablonie: ${String(mode)}. Dostępne: 1=Standard, 2=Chain, 3=Eccentric.`);
}

export function mapReferenceClientResistanceModesToWire(modes) {
  if (!Array.isArray(modes)) throw new TypeError('Lista trybów klienta referencyjnego musi być tablicą.');
  return modes.map(mapReferenceClientResistanceModeToWire);
}

// The public upstream client is tested on Gym Monster 1 only. Keep reading
// other configured device types available, but never create/schedule a program
// for an unverified numeric device type that could resolve to a different
// Speediance product or exercise catalog.
export function assertWritableDeviceType(deviceType) {
  if (deviceType === 1) return;
  throw new Error(
    `Zapis i planowanie programu są zablokowane dla device_type=${String(deviceType)}. ` +
    'device_type to rodzina API, nie numer generacji maszyny: w kliencie referencyjnym 1=Gym Monster, 2=Gym Pal, 3=Velonix. Gym Monster 2 nie oznacza device_type=2. ' +
    'Obecna ścieżka zapisu obsługuje rodzinę Gym Monster (device_type=1); upstream testował ją na GM1, nie potwierdza wykonania na każdej generacji. Nie zmieniaj typu konta bez potwierdzenia właściwego katalogu. ' +
    'Możesz nadal odczytywać katalog i historię. Przygotuj plan tekstowy do ręcznego użycia w aplikacji Speediance.'
  );
}

/**
 * Pilates band resistance is accepted by the visible reference client input
 * contract, but GM Coach has no verified Speediance wire field for it.
 * Fail closed before profile-auto/fixed-kg can silently replace band levels.
 * Unresisted bodyweight Pilates remains available through the bodyweight path.
 */
export function assertPilatesResistanceSupported({
  title = '',
  category = '',
  loadType,
  bands
} = {}) {
  const isPilates = /pilates/iu.test(`${category} ${title}`) || loadType === 'pilates' || bands !== undefined;
  const titleSuggestsBandResistance = isPilates && /\b(?:band|bands|banded)\b|taśm\p{L}*/iu.test(String(title));
  const hasBandRequest = bands !== undefined || titleSuggestsBandResistance;
  if (!isPilates) return;
  if (hasBandRequest || loadType !== 'bodyweight') {
    throw new Error(
      'Ćwiczenie Pilates z taśmą/oporem nie może być zapisane przez GM Coach: ' +
      'kontrakt klienta referencyjnego przyjmuje bands 1–6, ale GM Coach nie ma potwierdzonego pola Speediance do ich serializacji. ' +
      'Nie zamienię taśm na profile-auto, Smart RM ani stałe kg. Wybierz wariant Pilates bez zewnętrznego oporu (bodyweight) albo inne potwierdzone ćwiczenie.'
    );
  }
}

function isTimedSetInput(set) {
  const unit = String(set?.unit ?? '').trim().toLowerCase();
  return set?.durationSeconds !== undefined || ['sec', 'secs', 'second', 'seconds', 's', 'time', 'duration'].includes(unit);
}

/**
 * GM Coach defaults resisted rep-based work to the machine-side RM preset,
 * per the user's explicit product preference. reference client Customize remains an
 * explicit opt-in path with static per-set weights. Timed sets never use RM or
 * Customize; confirmed timed strength requires the separate fixed-kg opt-in.
 */
function normalizeExerciseMovementKind(movementKind) {
  if (movementKind === undefined || movementKind === null || movementKind === '') return undefined;
  if (typeof movementKind !== 'string') throw new TypeError('Rodzaj ruchu ćwiczenia musi być tekstem z potwierdzonego katalogu.');
  const normalized = movementKind.trim().toLocaleLowerCase('en-US');
  if (['strength', 'resistance'].includes(normalized)) return 'strength';
  if (normalized === 'bodyweight') return 'bodyweight';
  if (normalized === 'cardio') return 'cardio';
  if (['mat', 'pilates'].includes(normalized)) return 'mat';
  if (normalized === 'recovery') return 'recovery';
  throw new TypeError(`Nieobsługiwany rodzaj ruchu ćwiczenia: ${movementKind}.`);
}

function assertLoadTypeMatchesMovementKind(loadType, movementKind) {
  const normalizedMovementKind = normalizeExerciseMovementKind(movementKind);
  if (RESISTED_LOAD_TYPES.has(loadType) && normalizedMovementKind && normalizedMovementKind !== 'strength') {
    const movementLabel = normalizedMovementKind === 'mat' ? 'mat/Pilates' : normalizedMovementKind;
    throw new TypeError(
      `Katalog Speediance potwierdza rodzaj ruchu „${movementLabel}”; nie można dodać oporu przez ${loadType}. ` +
      'Użyj wariantu oporowego potwierdzonego jako strength albo właściwej ścieżki bez zewnętrznego oporu.'
    );
  }
}

export function inferDefaultLoadType(sets, title = '', movementKind) {
  const normalizedTitle = String(title).trim().toLocaleLowerCase('en-US');
  const normalizedMovementKind = normalizeExerciseMovementKind(movementKind);
  const hasTimedSets = Array.isArray(sets) && sets.some(isTimedSetInput);
  if (hasTimedSets && normalizedMovementKind) {
    if (normalizedMovementKind === 'strength') return 'fixed-kg';
    if (normalizedMovementKind === 'cardio') return 'cardio';
    return 'bodyweight';
  }
  if (normalizedMovementKind === 'bodyweight' || normalizedMovementKind === 'mat' || normalizedMovementKind === 'recovery') return 'bodyweight';
  if (normalizedMovementKind === 'cardio') return 'cardio';
  if (/\bpilates\b|\bmat(?:a|ę|y|owy|owa)?\b/.test(normalizedTitle)) return 'bodyweight';
  if (hasTimedSets) {
    return sets.some((set) => set?.intensity !== undefined) ? 'cardio' : 'bodyweight';
  }
  return 'smart-rm';
}

export function resolveRequestedLoadType({
  loadType,
  defaultLoadType,
  referenceClientCustomizeRequested = false,
  fixedKgRequested = false
} = {}) {
  if (!SUPPORTED_EXERCISE_LOAD_TYPE_SET.has(defaultLoadType)) {
    throw new TypeError(`Brakuje poprawnego domyślnego typu obciążenia. Dozwolone: ${SUPPORTED_EXERCISE_LOAD_TYPES.join(', ')}.`);
  }
  if (loadType !== undefined && !SUPPORTED_EXERCISE_LOAD_TYPE_SET.has(loadType)) {
    throw new TypeError(`Nieobsługiwany loadType „${String(loadType)}”. Dozwolone: ${SUPPORTED_EXERCISE_LOAD_TYPES.join(', ')}.`);
  }
  if (referenceClientCustomizeRequested === true && fixedKgRequested === true) {
    throw new TypeError('Wybierz jedną ścieżkę: statyczne Customize albo ręczne fixed-kg.');
  }
  if (defaultLoadType !== 'smart-rm') return loadType ?? defaultLoadType;
  if (referenceClientCustomizeRequested === true && loadType !== undefined && loadType !== 'profile-auto') {
    throw new TypeError('Jawna prośba o Customize koliduje z podanym loadType.');
  }
  if (fixedKgRequested === true && loadType !== undefined && loadType !== 'fixed-kg') {
    throw new TypeError('Jawna prośba o fixed-kg koliduje z podanym loadType.');
  }
  if (referenceClientCustomizeRequested === true) return 'profile-auto';
  if (fixedKgRequested === true) return 'fixed-kg';
  return loadType ?? defaultLoadType;
}

export function normalizeExerciseLoadType(loadType, sets, userRequestedFixedKg = false, fixedKgRequestedForWholeWorkout = false, movementKind) {
  const normalized = loadType ?? inferDefaultLoadType(sets, '', movementKind);
  const fixedKgWasRequested = userRequestedFixedKg === true || fixedKgRequestedForWholeWorkout === true;
  assertLoadTypeMatchesMovementKind(normalized, movementKind);
  if (normalized === 'customize-manual' && sets.some(isTimedSetInput) && normalizeExerciseMovementKind(movementKind) !== 'strength') throw new TypeError('Timed manual Customize requires confirmed strength movement metadata.');
  if (normalized === 'vita') {
    if (fixedKgWasRequested) {
      throw new Error('Ćwiczenie Vita przyjmuje wyłącznie poziom intensywności; nie można zastąpić go ręcznym kg.');
    }
    normalizeVitaSets(sets);
    return normalized;
  }
  const hasManualKg = sets.some((set) => set?.weightKg !== undefined);
  if (normalized === 'fixed-kg' && !fixedKgWasRequested) {
    throw new Error('Ręczne stałe kilogramy są dozwolone tylko po wyraźnej prośbie użytkownika. Domyślnie użyj maszynowego presetu RM klienta referencyjnego.');
  }
  if (userRequestedFixedKg === true && normalized !== 'fixed-kg') {
    throw new Error('Znacznik prośby o kilogramy dla ćwiczenia wymaga loadType=fixed-kg.');
  }
  if (hasManualKg && normalized !== 'fixed-kg') {
    throw new Error('weightKg nie może być podane dla Smart RM, klient referencyjny Customize ani ćwiczenia bodyweight.');
  }
  if (normalized === 'smart-rm') {
    if (sets.some(isTimedSetInput)) {
      throw new TypeError('Smart RM wymaga powtórzeń; serie czasowe pozostają w sekundach i nie mogą używać Smart RM.');
    }
    for (const [index, set] of sets.entries()) {
      if (!Number.isSafeInteger(set?.reps) || (set?.rmLevel !== undefined && (!Number.isSafeInteger(set.rmLevel) || set.rmLevel < 1 || set.rmLevel > 20))) {
        throw new TypeError(`Seria ${index + 1}: maszynowy Smart RM wymaga reps; jawny rmLevel musi być całkowity 1–20, a brakujący poziom dobiera domyślnie wybrany preset klienta referencyjnego.`);
      }
      if (set.rirTarget !== undefined && (!Number.isSafeInteger(set.rirTarget) || set.rirTarget < 0 || set.rirTarget > 5)) {
        throw new TypeError(`Seria ${index + 1}: rirTarget, jeśli podano, musi być całkowity od 0 do 5 i pozostaje niezależny od rmLevel.`);
      }
    }
  }
  if (!SUPPORTED_EXERCISE_LOAD_TYPE_SET.has(normalized)) {
    throw new Error('Typ obciążenia musi być smart-rm, profile-auto, fixed-kg, bodyweight, cardio albo vita.');
  }
  return normalized;
}

// reference client's user-facing inputs use the account display unit, but its raw
// custom-template writer serializes normalized kg as pounds (kg * 2.2). GM
// Coach posts directly to that API boundary, so it must perform the wire
// conversion itself. Speediance readback normalizes static weights to kg.
export function formatFixedKgForApi(weightKg, displayUnit, staticLoadProtocol = 'legacy-reference-client-wire-lb-get-kg') {
  if (typeof weightKg !== 'number' || !Number.isFinite(weightKg) || weightKg < 0.1 || weightKg > 500) {
    throw new RangeError('Stałe obciążenie musi wynosić od 0,1 do 500 kg.');
  }
  if (!['kg', 'lb'].includes(displayUnit)) throw new TypeError('Jednostka obciążenia konta musi być kg albo lb.');
  return encodeStaticLoad({ protocol: staticLoadProtocol, load: weightKg, loadUnit: 'kg', accountUnit: displayUnit, loadIntent: 'canonical-kg' });
}

/** Serialize a load already expressed in the account's display unit to the
 * raw reference client/Speediance API weight field. */
export function formatDisplayWeightForApi(displayWeight, displayUnit, staticLoadProtocol = 'legacy-reference-client-wire-lb-get-kg') {
  if (typeof displayWeight !== 'number' || !Number.isFinite(displayWeight) || displayWeight < 0 || displayWeight > 1_000) {
    throw new RangeError('Obciążenie w jednostce konta musi wynosić od 0 do 1000.');
  }
  if (!['kg', 'lb'].includes(displayUnit)) throw new TypeError('Jednostka obciążenia konta musi być kg albo lb.');
  return encodeStaticLoad({ protocol: staticLoadProtocol, load: displayWeight, loadUnit: displayUnit, accountUnit: displayUnit, loadIntent: 'account-customize' });
}

/** Prefer the live account unit; use an explicit user confirmation only when
 * the account API cannot provide one. The caller keeps this fallback in the
 * current plan object, never in persistent profile settings. */
export function resolveAccountDisplayUnit(apiUnit, confirmedDisplayUnit) {
  if (confirmedDisplayUnit !== undefined && !['kg', 'lb'].includes(confirmedDisplayUnit)) {
    throw new TypeError('Potwierdzona jednostka konta musi być kg albo lb.');
  }
  if (['kg', 'lb'].includes(apiUnit)) return apiUnit;
  if (apiUnit !== undefined && apiUnit !== null && apiUnit !== 'unknown') {
    throw new TypeError('API Speediance zwróciło nieobsługiwaną jednostkę konta.');
  }
  return confirmedDisplayUnit ?? 'unknown';
}

/**
 * reference client stores Row/Ski targets in the workout title because the template
 * API has no confirmed per-set cardio-intensity field. Preserve that behavior
 * while making the actual serialized title visible before approval.
 */
export function addCardioIntensityTags(name, exercises) {
  if (typeof name !== 'string' || !name.trim() || !Array.isArray(exercises)) {
    throw new TypeError('Nazwa planu i lista ćwiczeń są wymagane do zapisania tagów cardio.');
  }
  const tags = [];
  for (const exercise of exercises) {
    if (exercise?.loadType !== 'cardio') continue;
    const title = typeof exercise.title === 'string' ? exercise.title : '';
    const icon = /\b(?:row(?:ing)?|wioślar\p{L}*|ergometer)\b/iu.test(title)
      ? '🚣'
      : /\b(?:ski(?:ing)?|ski[ -]?erg|nart\p{L}*)\b/iu.test(title)
        ? '⛷'
        : null;
    if (!icon) throw new Error(`Nie można oznaczyć intensywności cardio dla „${title}”: używaj tylko rozpoznanego ćwiczenia Row lub Ski z katalogu GM.`);
    if (!Array.isArray(exercise.sets) || exercise.sets.length < 1 || exercise.sets.some((set) => !Number.isSafeInteger(set?.intensity) || set.intensity < 1 || set.intensity > 10)) {
      throw new Error(`Ćwiczenie cardio „${title}” wymaga intensywności 1–10 dla każdej serii.`);
    }
    tags.push(`${icon}${exercise.sets.map((set) => set.intensity).join(',')}`);
  }
  const taggedName = tags.length ? `${name.trim()} · ${tags.join(' ')}` : name.trim();
  if (taggedName.length > 80) throw new RangeError('Nazwa wraz z tagami intensywności cardio przekracza limit 80 znaków; skróć nazwę planu przed podglądem.');
  return taggedName;
}

export function estimateReferenceClientStylePercent1RM(reps, repMaxCurve) {
  if (!Number.isSafeInteger(reps) || reps < 1 || reps > MAX_PRESET_REPS) {
    throw new RangeError(`Customize/profile-auto obsługuje powtórzenia 1–${MAX_PRESET_REPS}; nie ekstrapoluję.`);
  }
  if (repMaxCurve !== undefined) {
    if (!Array.isArray(repMaxCurve) || repMaxCurve.length < 1 || repMaxCurve.length > 20 || repMaxCurve.some((point) =>
      !Number.isSafeInteger(point?.reps) || point.reps < 1 || point.reps > 20 ||
      !Number.isFinite(point.percent1RM) || point.percent1RM <= 0 || point.percent1RM > 100 ||
      (point.referenceClientCrossChecked !== undefined && typeof point.referenceClientCrossChecked !== 'boolean') ||
      (point.referenceClientReportedApproximate !== undefined && typeof point.referenceClientReportedApproximate !== 'boolean')
    )) {
      throw new TypeError('repMaxCurve wymaga od 1 do 20 punktów reps 1–20, percent1RM 0–100 i opcjonalnych flag metadanych typu boolean.');
    }
    if (new Set(repMaxCurve.map((point) => point.reps)).size !== repMaxCurve.length) {
      throw new TypeError('repMaxCurve nie może zawierać powtórzonych punktów reps.');
    }
    for (const point of repMaxCurve) {
      if (point.percent1RM / 100 !== REFERENCE_CLIENT_REPORTED_REP_MAX_CURVE[point.reps]) {
        throw new RangeError(`repMaxCurve dla ${point.reps} reps nie odpowiada tabeli zwróconej przez get_strength_profile. Flagi caller-supplied nie pozwalają zastąpić jej lokalnym wzorem.`);
      }
    }
  }
  // Exact reproduction of the captured reference client universal table, not an
  // exercise-specific measured curve or a claim of physiological precision.
  // There is no interpolation, extrapolation, or reps/RIR -> Smart RM mapping.
  const targetPercent1RM = REFERENCE_CLIENT_REPORTED_REP_MAX_CURVE[reps];
  return {
    prescribedReps: reps,
    targetPercent1RM,
    approximate: false,
    method: 'reference-client-reported-rep-max-curve'
  };
}

/**
 * Reproduce reference client’s observed assessment-based suggest_load selection.
 * The extra curve step and nearest-even whole-account-unit rounding belong to that
 * suggestion path, not to direct table lookup or Smart RM serialization.
 * Nearest-even tie behavior is compatible with the observed assessment
 * outputs; it is not proof of every branch of reference client’s private engine.
 * This does not reproduce reference client’s private history/VBT fallback resolver or
 * prove an individual's rep capacity, RIR, or physical device load.
 */
export function resolveReferenceClientSuggestedDisplayLoad({ oneRepMax, reps, displayUnit } = {}) {
  if (typeof oneRepMax !== 'number' || !Number.isFinite(oneRepMax) || oneRepMax < 0.1 || oneRepMax > 1000) {
    throw new RangeError('Sugestia klienta referencyjnego wymaga dodatniego oneRepMax 0,1–1000 w jednostce konta.');
  }
  if (!['kg', 'lb'].includes(displayUnit)) {
    throw new TypeError('Sugestia klienta referencyjnego wymaga potwierdzonej jednostki konta kg albo lb.');
  }
  if (!Number.isSafeInteger(reps) || reps < 1 || reps > 20) {
    throw new RangeError('Sugestia klienta referencyjnego wymaga powtórzeń 1–20; nie ekstrapoluję.');
  }
  const referenceReps = Math.min(reps + 1, 20);
  const targetPercent1RM = REFERENCE_CLIENT_REPORTED_REP_MAX_CURVE[referenceReps];
  const rawLoad = oneRepMax * targetPercent1RM;
  const whole = Math.floor(rawLoad);
  // Python round(binary64) uses nearest-even only at an exact binary half.
  // Values immediately above or below it must retain their rounding direction.
  const halfUnitTie = rawLoad - whole === 0.5;
  const suggestedLoad = halfUnitTie ? whole + (whole % 2) : Math.round(rawLoad);
  return {
    prescribedReps: reps,
    referenceReps,
    targetPercent1RM,
    suggestedLoad,
    displayUnit,
    rounding: 'nearest-even-whole-account-unit',
    method: 'reference-client-observed-assessment-suggestion'
  };
}

/** Preset ranges/defaults copied from the visible reference client v1.2 UI contract. */
export const REFERENCE_CLIENT_RM_PRESET_RULES = Object.freeze({
  'gain muscle': Object.freeze({ minRmLevel: 9, maxRmLevel: 13, defaultRmLevel: 13, minReps: 8, maxReps: 12, defaultReps: 12, defaultRest: 60, minRest: 45, maxRest: 120 }),
  stamina: Object.freeze({ minRmLevel: 15, maxRmLevel: 20, defaultRmLevel: 17, minReps: 13, maxReps: 20, defaultReps: 15, defaultRest: 45, minRest: 30, maxRest: 180 }),
  strength: Object.freeze({ minRmLevel: 4, maxRmLevel: 9, defaultRmLevel: 7, minReps: 2, maxReps: 8, defaultReps: 6, defaultRest: 90, minRest: 60, maxRest: 180 }),
});

export function getReferenceClientRmPresetRules(presetName) {
  if (typeof presetName !== 'string') return null;
  const normalized = presetName.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  return REFERENCE_CLIENT_RM_PRESET_RULES[normalized] || null;
}

const RM_PRESET_IDS = Object.freeze({ 'Gain Muscle': 1, Stamina: 3, Strength: 5 });
/** Preset matching a rep count when the user named none: Gain Muscle first (8–12), then Strength (2–8), Stamina (13–20). */
export function recommendReferenceClientRmPresetForReps(reps) {
  if (!Number.isSafeInteger(reps)) return null;
  for (const presetName of ['Gain Muscle', 'Strength', 'Stamina']) {
    const rules = getReferenceClientRmPresetRules(presetName);
    if (reps >= rules.minReps && reps <= rules.maxReps) return { presetName, presetId: RM_PRESET_IDS[presetName], minReps: rules.minReps, maxReps: rules.maxReps };
  }
  return null;
}

/**
 * Match reference client v1.2's preset-specific RM selector ranges and default value.
 * Keep that setting independent from planned reps and RIR. The public
 * serializer does not publish an arithmetic mapping from reps/RIR or expose
 * the device's RM-to-resistance calculation.
 */
export function validateReferenceClientRmLevel({ rmLevel, reps, presetName } = {}, { allowPercentLevel = false } = {}) {
  const rules = getReferenceClientRmPresetRules(presetName);
  if (!rules) throw new Error(`Nieznany preset RM „${String(presetName ?? '')}”; obsługiwane są wyłącznie dokładnie nazwane presety klienta referencyjnego.`);
  if (!Number.isSafeInteger(reps) || reps < 1 || reps > MAX_PRESET_REPS) {
    throw new RangeError(`Maszynowy preset RM wymaga zaplanowanych powtórzeń 1–${MAX_PRESET_REPS}.`);
  }
  if (reps < rules.minReps || reps > rules.maxReps) {
    const fit = recommendReferenceClientRmPresetForReps(reps);
    throw new RangeError(`Preset ${presetName} obsługuje ${rules.minReps}–${rules.maxReps} powtórzeń; seria ma ${reps}. ${fit ? `Dla ${reps} powt. użyj ${fit.presetName} (ID ${fit.presetId}, ${fit.minReps}–${fit.maxReps}); jeśli użytkownik nie narzucił presetu, popraw sam bez pytania.` : `Żaden preset Smart RM nie obsługuje ${reps} powt.; użyj Customize albo zmień powtórzenia za zgodą użytkownika.`}`);
  }
  const resolvedRmLevel = rmLevel ?? rules.defaultRmLevel;
  if (!Number.isSafeInteger(resolvedRmLevel) || resolvedRmLevel < 1 || resolvedRmLevel > 20) {
    throw new RangeError('Poziom RM musi być całkowitą wartością 1–20 przekazywaną osobno przez klienta referencyjnego.');
  }
  // %1RM sets take their level from the percent table (4–20); only the default-level selector is limited to the preset's level range.
  if (!(allowPercentLevel && resolvedRmLevel >= 4) && (resolvedRmLevel < rules.minRmLevel || resolvedRmLevel > rules.maxRmLevel)) {
    throw new RangeError(`Preset ${presetName} obsługuje poziom RM ${rules.minRmLevel}–${rules.maxRmLevel}; podano ${resolvedRmLevel}.`);
  }
  return {
    prescribedReps: reps,
    rmLevel: resolvedRmLevel,
    presetName,
    method: rmLevel === undefined ? 'reference-client-preset-default-rm-level' : 'reference-client-direct-preset-rm-level'
  };
}

// Historical rounded examples from the earlier tool description. Retained for
// compatibility only; calculations use the full response-backed table below.
export const REFERENCE_CLIENT_REPORTED_REP_MAX_REFERENCE_PERCENT = Object.freeze({
  5: 0.87,
  8: 0.80,
  12: 0.67
});

// Universal repMaxCurve returned by get_strength_profile in the
// authorized one-time comparison on 2026-10-02. Values are ratios (1 = 100%).
// This captures reference client’s table, not physical machine-load verification.
export const REFERENCE_CLIENT_REPORTED_REP_MAX_CURVE = Object.freeze({
  1: 1, 2: .95, 3: .93, 4: .90, 5: .87, 6: .85, 7: .83, 8: .80,
  9: .77, 10: .75, 11: .73, 12: .67, 13: .66, 14: .65, 15: .64,
  16: .62, 17: .58, 18: .55, 19: .53, 20: .50
});

// Public plans first pass exact stored-profile resolution. These canonical
// sources describe provenance; labels alone never prove account readiness.
// Keep historical low-level serializer aliases for its existing direct callers.
const VERIFIED_STRENGTH_ANCHOR_SOURCES = new Set([
  ...CONFIRMED_CUSTOMIZE_ANCHOR_SOURCES,
  'local-training-profile',
  'user-confirmed-one-rep-max',
  'user-confirmed-working-set',
  'speediance-reported',
  'speediance-estimated'
]);

export function normalizeSetWork(set, index, { repsOnly = false } = {}) {
  if (!set || typeof set !== 'object' || Array.isArray(set)) {
    throw new TypeError(`Seria ${index + 1} wymaga jawnej liczby powtórzeń albo czasu w sekundach.`);
  }
  const rawUnit = set.unit;
  const unit = rawUnit === undefined
    ? set.reps !== undefined && set.durationSeconds === undefined ? 'reps'
      : set.durationSeconds !== undefined && set.reps === undefined ? 'seconds'
        : null
    : ['rep', 'reps'].includes(String(rawUnit).trim().toLowerCase()) ? 'reps'
      : ['sec', 'secs', 'second', 'seconds', 's', 'time', 'duration'].includes(String(rawUnit).trim().toLowerCase()) ? 'seconds'
        : null;
  if (unit === 'reps') {
    const maximumReps = repsOnly ? MAX_PRESET_REPS : 100;
    if (!Number.isSafeInteger(set.reps) || set.reps < 1 || set.reps > maximumReps || set.durationSeconds !== undefined) {
      const range = repsOnly ? `powtórzenia 1–${maximumReps}` : 'reps 1–100';
      throw new TypeError(`Seria ${index + 1}: wymagane są jawne ${range} bez jednoczesnego durationSeconds.`);
    }
    return { unit, amount: set.reps };
  }
  if (unit === 'seconds' && !repsOnly) {
    if (!Number.isSafeInteger(set.durationSeconds) || set.durationSeconds < 1 || set.durationSeconds > 86_400 || set.reps !== undefined) {
      throw new TypeError(`Seria ${index + 1}: czas musi być jawnym durationSeconds 1–86400 bez jednoczesnego reps.`);
    }
    return { unit, amount: set.durationSeconds };
  }
  if (repsOnly && unit === 'seconds') {
    throw new TypeError(`Seria ${index + 1}: Smart RM i Customize wymagają powtórzeń; czas pozostaje w sekundach.`);
  }
  throw new TypeError(`Seria ${index + 1}: jednostka musi być jawnie rozpoznawalna jako reps albo sekundy.`);
}

export const VITA_LEVEL_MIN = 1;
export const VITA_LEVEL_MAX = 999;

function normalizeVitaSets(sets) {
  if (!Array.isArray(sets) || sets.length < 1 || sets.length > 12) {
    throw new TypeError('Ćwiczenie Vita wymaga od 1 do 12 serii.');
  }
  return sets.map((set, index) => {
    const work = normalizeSetWork(set, index);
    if (!Number.isSafeInteger(set.level) || set.level < VITA_LEVEL_MIN || set.level > VITA_LEVEL_MAX) {
      throw new RangeError(`Seria Vita ${index + 1}: level musi być całkowitą wartością ${VITA_LEVEL_MIN}–${VITA_LEVEL_MAX}, zgodnie z kontrolką klienta referencyjnego.`);
    }
    if (set.rirTarget !== undefined && (!Number.isSafeInteger(set.rirTarget) || set.rirTarget < 0 || set.rirTarget > 5)) {
      throw new RangeError(`Seria Vita ${index + 1}: rirTarget, jeśli podano, musi być całkowity od 0 do 5.`);
    }
    const incompatibleFields = ['weight', 'weightKg', 'rmLevel', 'targetPercent1RM', 'rmValue', 'intensity'];
    if (incompatibleFields.some((field) => set[field] !== undefined)) {
      throw new TypeError(`Seria Vita ${index + 1} przyjmuje dose reps albo durationSeconds oraz level; usuń kg, RM i cardio intensity.`);
    }
    return { unit: work.unit, amount: work.amount, level: set.level };
  });
}

function getProfileOneRepMax(strengthAnchor) {
  if (!strengthAnchor || typeof strengthAnchor !== 'object' || Array.isArray(strengthAnchor)) {
    throw new TypeError('Brakuje oneRepMax albo aktualnej workingWeight+workingReps dla dokładnego ćwiczenia.');
  }
  if (strengthAnchor.source === 'recent-history') {
    throw new TypeError('Niezweryfikowane rekordy recent-history nie mogą być kotwicą; potwierdź aktualny ciężar roboczy, reps, RIR i jednostkę.');
  }
  if (!VERIFIED_STRENGTH_ANCHOR_SOURCES.has(strengthAnchor.source)) {
    throw new TypeError('Kotwica siłowa wymaga potwierdzonego źródła: lokalnego profilu, jawnej odpowiedzi użytkownika albo jednoznacznego pola 1RM ze statystyk Speediance.');
  }
  const unit = strengthAnchor?.unit;
  if (!['kg', 'lb'].includes(unit)) {
    throw new TypeError('Kotwica siłowa musi mieć jednostkę kg albo lb zgodną z profilem Speediance.');
  }
  const oneRepMax = strengthAnchor?.oneRepMax;
  if (typeof oneRepMax === 'number' && Number.isFinite(oneRepMax) && oneRepMax >= 0.1 && oneRepMax <= 1000) {
    if (strengthAnchor.anchorKind !== undefined && !['reported-oneRepMax', 'estimated-e1RM'].includes(strengthAnchor.anchorKind)) throw new TypeError('Nieprawidłowy anchorKind liczbowej kotwicy.');
    return { value: oneRepMax, unit, source: 'oneRepMax',
      ...(strengthAnchor.anchorKind === undefined ? {} : { anchorKind: strengthAnchor.anchorKind }),
      ...(strengthAnchor.anchorKind === 'estimated-e1RM' ? { approximate: true, evidenceSource: strengthAnchor.source } : {}),
      ...(Array.isArray(strengthAnchor.repMaxCurve) ? { repMaxCurve: strengthAnchor.repMaxCurve } : {}) };
  }
  const workingWeight = strengthAnchor?.workingWeight;
  const workingReps = strengthAnchor?.workingReps;
  if (typeof workingWeight === 'number' && Number.isFinite(workingWeight) && workingWeight >= 0.1 && workingWeight <= 1000 &&
      Number.isSafeInteger(workingReps) && workingReps >= 1 && workingReps <= 20) {
    const workingRir = strengthAnchor.workingRir ?? 0;
    if (!Number.isSafeInteger(workingRir) || workingRir < 0 || workingRir > 5) {
      throw new TypeError('workingRir musi być całkowite od 0 do 5.');
    }
    const effectiveReps = workingReps + workingRir;
    const anchorPercent = estimateReferenceClientStylePercent1RM(effectiveReps, strengthAnchor.repMaxCurve).targetPercent1RM;
    return {
      value: workingWeight / anchorPercent,
      unit,
      source: 'working-set-estimate',
      evidenceSource: strengthAnchor.source,
      approximate: true,
      anchorPercent,
      effectiveReps,
      ...(strengthAnchor.workingRir === undefined ? { workingSetAssumption: '0 RIR assumed' } : { workingRir }),
      ...(Array.isArray(strengthAnchor.repMaxCurve) ? { repMaxCurve: strengthAnchor.repMaxCurve } : {})
    };
  }
  throw new TypeError('Obciążenie z profilu wymaga jawnego 1RM albo aktualnego ciężaru roboczego z powtórzeniami dla dokładnego ćwiczenia.');
}

export function buildExerciseLoadPayload(loadType, sets, { fixedKgAuthorized = false, staticLoadRequested = false, strengthAnchor, displayUnit, exerciseContext, smartRmPresetName, percentLoad = false, staticLoadProtocol = 'legacy-reference-client-wire-lb-get-kg' } = {}) {
  const effectiveLoadType = loadType ?? inferDefaultLoadType(sets, exerciseContext?.title, exerciseContext?.movementKind);
  // Smart RM always carries a percent when the plan resolved one (percent-1rm.mjs): level + percent1rmStr, kg estimated or left to Speediance.
  if (effectiveLoadType === 'smart-rm' && Array.isArray(sets) && sets.length > 0 && sets.every((set) => set?.percentResolved)) percentLoad = true;
  assertPilatesResistanceSupported({
    ...(exerciseContext || {}),
    loadType: effectiveLoadType,
    bands: exerciseContext?.bands
  });
  if (!SUPPORTED_EXERCISE_LOAD_TYPE_SET.has(effectiveLoadType) || !Array.isArray(sets)) {
    throw new TypeError('Nieprawidłowy typ obciążenia lub lista serii.');
  }
  if (effectiveLoadType === 'vita') {
    if (exerciseContext?.dataStatType !== 6) {
      throw new TypeError('Vita można serializować wyłącznie przy jednoznacznym dataStatType=6 z aktualnych metadanych Speediance.');
    }
    if (fixedKgAuthorized) throw new TypeError('Ćwiczenie Vita nie obsługuje ręcznego fixed-kg.');
    const work = normalizeVitaSets(sets);
    return {
      weights: sets.map(() => '0').join(','),
      counters: '',
      counterweight: '',
      counterweight2: '',
      capacity: 0,
      level: work.map(({ level }) => String(level)).join(',')
    };
  }
  // Keep the authorization check at the final serialization boundary too.
  // This prevents a future caller from bypassing the plan validator by directly
  // building an API payload with arbitrary fixed kilograms.
  normalizeExerciseLoadType(effectiveLoadType, sets, fixedKgAuthorized === true, false, exerciseContext?.movementKind);
  if (effectiveLoadType === 'customize-manual' && (staticLoadRequested !== true || !['kg', 'lb'].includes(displayUnit) || strengthAnchor !== undefined || sets.some(set => !Number.isFinite(set.weight) || set.weight <= 0 || set.weightUnit !== displayUnit || set.weightKg !== undefined || set.rmLevel !== undefined || set.rmValue !== undefined || set.targetPercent1RM !== undefined))) {
    throw new TypeError('Manual Customize requires explicit authorization and positive per-set weights in the current account unit, without anchor or RM fields.');
  }
  const plannedWork = sets.map((set, index) => normalizeSetWork(set, index, {
    repsOnly: ['profile-auto', 'smart-rm'].includes(effectiveLoadType)
  }));
  if (effectiveLoadType === 'profile-auto' && sets.some((set) => set?.rmLevel !== undefined)) {
    throw new TypeError('Statyczne Customize przyjmuje ciężar wyliczony z 1RM i reps; nie przyjmuje poziomu rmLevel.');
  }
  if (effectiveLoadType === 'smart-rm' && sets.some((set) => set?.targetPercent1RM !== undefined || set?.rmValue !== undefined)) {
    throw new TypeError('Smart RM przyjmuje bezpośredni rmLevel; nie podawaj procentu 1RM ani aliasu rmValue.');
  }
  const profileLoadType = effectiveLoadType === 'profile-auto';
  const strengthProfile = profileLoadType ? getProfileOneRepMax(strengthAnchor) : null;
  if (profileLoadType && !['kg', 'lb'].includes(displayUnit)) {
    throw new TypeError('Customize wymaga świeżo potwierdzonej jednostki konta kg albo lb.');
  }
  if (profileLoadType && strengthProfile.unit !== displayUnit) {
    throw new TypeError(`Jednostka kotwicy (${strengthProfile.unit}) nie zgadza się z jednostką wyświetlaną konta (${displayUnit}).`);
  }
  const loadEstimates = profileLoadType
    ? sets.map((set, index) => {
      if (plannedWork[index].unit !== 'reps') throw new TypeError(`Customize/profile-auto wymaga powtórzeń w serii ${index + 1}; nie konwertuj czasu na RM.`);
      // Validate caller-supplied table metadata against the captured response.
      // Load selection follows the separately observed assessment suggestion
      // path. The +1 table step is not a physiological RIR guarantee.
      estimateReferenceClientStylePercent1RM(set.reps, strengthProfile.repMaxCurve);
      const referenceClientSuggestion = resolveReferenceClientSuggestedDisplayLoad({ oneRepMax: strengthProfile.value, reps: set.reps, displayUnit });
      return {
        // reference client suggestion snapped to the device Customize step (kg and lb alike; lb via the kg step, 0.1 lb).
        ...referenceClientSuggestion, suggestedLoad: quantizeCustomizeLoad(referenceClientSuggestion.suggestedLoad, displayUnit, 'nearest'),
        approximate: strengthProfile.approximate === true,
        ...(strengthProfile.approximate === true ? {
          anchorSource: strengthProfile.source,
          anchorEvidenceSource: strengthProfile.evidenceSource,
          anchorPercent1RM: strengthProfile.anchorPercent,
          effectiveReps: strengthProfile.effectiveReps,
          ...(strengthProfile.workingRir === undefined ? {} : { workingRir: strengthProfile.workingRir }),
          ...(strengthProfile.workingSetAssumption === undefined ? {} : { workingSetAssumption: strengthProfile.workingSetAssumption })
        } : {})
      };
    })
    : [];
  const rmSelections = effectiveLoadType === 'smart-rm'
    ? sets.map((set, index) => {
      if (plannedWork[index].unit !== 'reps') throw new TypeError(`Smart RM wymaga powtórzeń w serii ${index + 1}; nie zamieniaj czasu na RM.`);
      if (set.targetPercent1RM !== undefined) throw new TypeError(`Seria ${index + 1}: klient referencyjny nie przekazuje procentu do pola RM; nie zapisuję targetPercent1RM.`);
      if (percentLoad) {
        // %1RM mode: the level comes from the percent table (percent-1rm.mjs), not the preset default range.
        const resolved = set.percentResolved;
        if (!resolved || !Number.isSafeInteger(resolved.rmLevel) || resolved.rmLevel < 4 || resolved.rmLevel > 20 || !/^\d+(\.\d)?$/.test(String(resolved.weightWire))) {
          throw new TypeError(`Seria ${index + 1}: %1RM wymaga rozwiązanego percentResolved (poziom RM i kg).`);
        }
        validateReferenceClientRmLevel({ reps: set.reps, presetName: smartRmPresetName });
        return { prescribedReps: set.reps, rmLevel: resolved.rmLevel, presetName: smartRmPresetName, method: 'percent-1rm-table' };
      }
      return validateReferenceClientRmLevel({ rmLevel: set.rmLevel, reps: set.reps, presetName: smartRmPresetName }, { allowPercentLevel: Boolean(set.percentResolved) });
    })
    : [];
  const calculatedDisplayLoads = profileLoadType
    ? sets.map((set, index) => {
      const targetDisplayLoad = loadEstimates[index].suggestedLoad;
      const targetKg = targetDisplayLoad * (strengthProfile.unit === 'lb' ? 0.45359237 : 1);
      if (!Number.isFinite(targetKg) || targetKg < 0.1 || targetKg > 500) {
        throw new RangeError(`Wyliczone obciążenie z profilu dla serii ${index + 1} jest poza bezpiecznym zakresem 0,1–500 kg.`);
      }
      return targetDisplayLoad;
    })
    : [];
  const weights = sets.map((set, index) => percentLoad && effectiveLoadType === 'smart-rm'
    ? String(set.percentResolved.weightWire)
    : effectiveLoadType === 'smart-rm'
    ? '3.5'
    : effectiveLoadType === 'fixed-kg'
    ? formatFixedKgForApi(set.weightKg, displayUnit, staticLoadProtocol)
    : effectiveLoadType === 'customize-manual'
      ? formatDisplayWeightForApi(set.weight, displayUnit, staticLoadProtocol)
    : effectiveLoadType === 'profile-auto'
      ? formatDisplayWeightForApi(calculatedDisplayLoads[index], displayUnit, staticLoadProtocol)
      : '0');
  // Customize/bodyweight/cardio do not have RM selectors. Joining one empty
  // string per set produces ","/",," which is not an empty API field and
  // makes a valid non-RM readback impossible to verify.
  const counters = effectiveLoadType === 'smart-rm' ? rmSelections.map(({ rmLevel }) => String(rmLevel)) : [];
  const rawCapacity = sets.reduce((total, set, index) => {
    const workAmount = plannedWork[index].amount;
    // Public reference client API metadata uses the RM selector, not the 3.5 marker.
    // This is neither a physical load nor measured workout tonnage.
    const capacityLoad = effectiveLoadType === 'smart-rm'
      ? rmSelections[index].rmLevel * 2.2
      : effectiveLoadType === 'fixed-kg'
        ? staticLoadBeforeWireRounding({ protocol: staticLoadProtocol, load: set.weightKg, loadUnit: 'kg', accountUnit: displayUnit, loadIntent: 'canonical-kg' })
        : effectiveLoadType === 'customize-manual'
          ? staticLoadBeforeWireRounding({ protocol: staticLoadProtocol, load: set.weight, loadUnit: set.weightUnit, accountUnit: displayUnit, loadIntent: 'account-customize' })
        : effectiveLoadType === 'profile-auto'
          ? staticLoadBeforeWireRounding({ protocol: staticLoadProtocol, load: calculatedDisplayLoads[index], loadUnit: displayUnit, accountUnit: displayUnit, loadIntent: 'account-customize' })
          : Number(weights[index]);
    return total + workAmount * capacityLoad;
  }, 0);
  const capacity = Number(rawCapacity.toFixed(6));
  return {
    weights: weights.join(','),
    counters: counters.join(','),
    // %1RM as saved by the app: counterweight stays empty, counterweight2 carries the RM level.
    counterweight: counters.join(','),
    counterweight2: counters.join(','),
    ...(percentLoad ? { counterweight: '', percent1rmStr: sets.map((set) => String(set.percentResolved.percent1RM)).join(',') } : {}),
    capacity,
    ...(profileLoadType ? {
      loadEstimates: loadEstimates.map((estimate) => ({
        ...estimate,
        targetPercent1RM: Math.round(estimate.targetPercent1RM * 1000) / 10
      })),
      profileAnchor: { ...strengthProfile, oneRepMax: strengthProfile.value }
    } : {}),
    ...(rmSelections.length ? { rmLevels: rmSelections.map(({ rmLevel }) => rmLevel), rmSelections } : {})
  };
}

// Legacy template readbacks sometimes expose RM levels in the 1–20 range.
// They are not used to calculate new per-set loads.
export const MAX_PRESET_REPS = 20;
import { encodeStaticLoad, staticLoadBeforeWireRounding } from './static-load-protocol.mjs';

// ---- %1RM for Smart RM (kept in this module so every plan harness that spreads program-payload exports can use it) ----
// %1RM (percent-1rm) for Smart RM presets, serialized like the Speediance app:
// templatePresetId + level '0' + weights = kg + counterweight2 = RM level, counterweight empty.
// The percent itself is never stored; the app shows it from weights/1RM.

/** Percent ranges offered by the app per preset (user-reported). */
export const PERCENT_1RM_PRESET_RANGES = Object.freeze({
  'gain muscle': Object.freeze({ min: 50, max: 90 }),
  stamina: Object.freeze({ min: 50, max: 70 }),
  strength: Object.freeze({ min: 50, max: 90 }),
});

/**
 * RM level -> percent as the app shows it. Equals REFERENCE_CLIENT_REPORTED_REP_MAX_CURVE
 * (levels 4..20) except level 12, where the app sample (70% -> counterweight2 12) differs
 * from the captured curve (.67). Levels 1-3 (>90%) are not offered by any preset.
 */
export const PERCENT_1RM_BY_RM_LEVEL = Object.freeze(Object.fromEntries(
  Object.entries(REFERENCE_CLIENT_REPORTED_REP_MAX_CURVE)
    .filter(([level]) => Number(level) >= 4)
    .map(([level, ratio]) => [Number(level), Number(level) === 12 ? 70 : Math.round(ratio * 100)])
));

const LEVEL_BY_PERCENT = new Map(Object.entries(PERCENT_1RM_BY_RM_LEVEL).map(([level, percent]) => [percent, Number(level)]));
const ALLOWED_SOURCES = new Set(['user-confirmed-one-rep-max', 'speediance-reported', 'local-training-profile', 'speediance-estimated']);

function rangeFor(presetName) {
  const rules = getReferenceClientRmPresetRules(presetName);
  const key = typeof presetName === 'string' ? presetName.trim().replace(/[_-]+/g, ' ').toLocaleLowerCase('en-US') : '';
  const range = PERCENT_1RM_PRESET_RANGES[key];
  if (!rules || !range) throw new Error(`Nieznany preset %1RM „${String(presetName ?? '')}”; użyj Gain Muscle, Stamina albo Strength.`);
  return { rules, range };
}

export function allowedPercents(presetName) {
  const { range } = rangeFor(presetName);
  return [...LEVEL_BY_PERCENT.keys()].filter((p) => p >= range.min && p <= range.max).sort((a, b) => a - b);
}

/** 1RM must be explicit, in kg, and from a named source; otherwise reject (no guessing). */
export function validateOneRepMaxSource(oneRepMax) {
  if (!oneRepMax || typeof oneRepMax !== 'object' || Array.isArray(oneRepMax)) {
    throw new Error('%1RM wymaga 1RM ćwiczenia: podaj percentLoad.oneRepMax {value, unit:"kg", source}. Brak 1RM — nie zgaduję kilogramów.');
  }
  const { value, unit, source } = oneRepMax;
  if (unit !== 'kg') throw new Error('%1RM: 1RM musi być podane w kg (zapis weights = kg).');
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 500) throw new RangeError('%1RM: 1RM musi mieścić się w 1–500 kg.');
  if (!ALLOWED_SOURCES.has(source)) throw new Error('%1RM: źródło 1RM musi być jednym z: ' + [...ALLOWED_SOURCES].join(', ') + '.');
  return { value, unit, source, ...(source === 'speediance-estimated' ? { approximate: true } : {}) };
}

/**
 * Device step: up to 10 kg 0.5 kg, above 10 kg whole kg (same as Customize),
 * rounded to nearest (half up). Matches app pairs for 43.5 / 44 / 11.1 kg 1RMs.
 */
export function roundPercentLoadKg(rawKg) {
  const step = rawKg <= 10 + 1e-9 ? 0.5 : 1;
  const kg = Math.floor(rawKg / step + 0.5 + 1e-9) * step;
  return { kg, step, wire: step === 0.5 ? kg.toFixed(1) : String(kg) };
}

/** Auto choice: level = reps + RIR (reps in reserve), % = table[level], clamped to the preset range. */
export function chooseAutoPercent1RM({ reps, rirTarget, presetName, goalLabel } = {}) {
  const { rules, range } = rangeFor(presetName);
  if (!Number.isSafeInteger(reps) || reps < rules.minReps || reps > rules.maxReps) {
    throw new RangeError(`Preset ${presetName} obsługuje ${rules.minReps}–${rules.maxReps} powtórzeń; seria ma ${reps}.`);
  }
  if (!Number.isSafeInteger(rirTarget) || rirTarget < 0 || rirTarget > 5) throw new RangeError('Automatyczny dobór %1RM wymaga rirTarget 0–5 (poziom RM = powtórzenia + RIR).');
  const wanted = Math.min(20, Math.max(4, reps + rirTarget));
  let level = wanted;
  const levels = Object.keys(PERCENT_1RM_BY_RM_LEVEL).map(Number).sort((a, b) => a - b);
  while (PERCENT_1RM_BY_RM_LEVEL[level] > range.max && level < 20) level += 1;
  while (PERCENT_1RM_BY_RM_LEVEL[level] < range.min && level > levels[0]) level -= 1;
  const percent = PERCENT_1RM_BY_RM_LEVEL[level];
  const clamped = level !== wanted || reps + rirTarget !== wanted;
  return {
    percent1RM: percent, rmLevel: level, method: 'auto-reps-plus-rir', clamped,
    rationale: `${goalLabel ?? presetName}: ${reps} powt. + RIR ${rirTarget} → poziom ${reps + rirTarget}${clamped ? ` (przycięty do ${level}, zakres presetu ${range.min}–${range.max}%)` : ''} → ${percent}%1RM`
  };
}

/** Warmup helper: Smart RM cannot go below the preset floor (50%). Lighter warmups must use Customize kg. */
export const SMART_RM_MIN_PERCENT = 50;
export function warmupLoadRoute(targetPercent1RM) {
  if (!Number.isFinite(targetPercent1RM) || targetPercent1RM <= 0 || targetPercent1RM > 100) throw new RangeError('Docelowy % rozgrzewki musi mieścić się w 1–100.');
  return targetPercent1RM >= SMART_RM_MIN_PERCENT
    ? { loadType: 'smart-rm', reason: `${targetPercent1RM}% 1RM mieści się w zakresie presetu (od ${SMART_RM_MIN_PERCENT}%): Smart RM z procentem.` }
    : { loadType: 'customize-manual', reason: `${targetPercent1RM}% 1RM jest poniżej najniższych ${SMART_RM_MIN_PERCENT}% presetu: Customize z konkretnymi kg.` };
}

/**
 * Resolve one set: manual percent overrides auto. Smart RM ALWAYS carries a percent
 * (counterweight2 level + percent1rmStr). A known 1RM adds estimated kg for weights;
 * without 1RM the server computes kg (weights = '3.5' marker, hypothesis for the trial write).
 * A manual percent that differs from the auto choice needs percentReason when requireReason is set.
 */
export function resolvePercent1RMSet({ reps, rirTarget, percent1RM, percentReason, requireReason = false, presetName, oneRepMax, goalLabel, presetDefaultLevel } = {}) {
  const source = oneRepMax === undefined ? undefined : validateOneRepMaxSource(oneRepMax);
  const { rules, range } = rangeFor(presetName);
  if (!Number.isSafeInteger(reps) || reps < rules.minReps || reps > rules.maxReps) throw new RangeError(`Preset ${presetName} obsługuje ${rules.minReps}–${rules.maxReps} powtórzeń; seria ma ${reps}.`);
  let choice;
  let auto;
  if (rirTarget !== undefined) auto = chooseAutoPercent1RM({ reps, rirTarget, presetName, goalLabel });
  if (percent1RM !== undefined) {
    if (!Number.isFinite(percent1RM) || !LEVEL_BY_PERCENT.has(percent1RM)) throw new RangeError(`%1RM ${percent1RM} nie ma poziomu RM w krzywej; dozwolone: ${[...LEVEL_BY_PERCENT.keys()].sort((a, b) => a - b).join(', ')}.`);
    if (percent1RM < range.min || percent1RM > range.max) throw new RangeError(`Preset ${presetName} obsługuje %1RM ${range.min}–${range.max}; podano ${percent1RM}.`);
    const reason = typeof percentReason === 'string' ? percentReason.trim() : '';
    if (reason.length > 200) throw new RangeError('percentReason może mieć maks. 200 znaków.');
    if (requireReason && (!auto || auto.percent1RM !== percent1RM) && !reason) {
      throw new Error(`%1RM ${percent1RM} różni się od automatycznego doboru${auto ? ' (' + auto.percent1RM + '%)' : ''}: podaj percentReason (np. seria wprowadzająca, piramida, top set + back-off, progresja albo prośba użytkownika).`);
    }
    choice = { percent1RM, rmLevel: LEVEL_BY_PERCENT.get(percent1RM), method: 'manual-override', clamped: false, rationale: `ręcznie ${percent1RM}%1RM${reason ? ': ' + reason : ''}` };
  } else if (auto) {
    choice = auto;
  } else if (Number.isSafeInteger(presetDefaultLevel) && PERCENT_1RM_BY_RM_LEVEL[presetDefaultLevel] !== undefined) {
    const percent = Math.min(range.max, Math.max(range.min, PERCENT_1RM_BY_RM_LEVEL[presetDefaultLevel]));
    choice = { percent1RM: percent, rmLevel: LEVEL_BY_PERCENT.get(percent), method: 'preset-default-level', clamped: false, rationale: `${goalLabel ?? presetName}: brak RIR, domyślny poziom presetu ${presetDefaultLevel} → ${percent}%1RM` };
  } else {
    choice = chooseAutoPercent1RM({ reps, rirTarget, presetName, goalLabel });
  }
  const base = { ...choice, presetName, inputs: { reps, ...(rirTarget === undefined ? {} : { rirTarget }), ...(percent1RM === undefined ? {} : { percent1RM }), ...(percentReason ? { percentReason: String(percentReason).trim() } : {}), ...(presetDefaultLevel === undefined ? {} : { presetDefaultLevel }) } };
  if (!source) {
    return { ...base, loadKg: null, weightWire: '3.5', weightSource: 'speediance-computes',
      preview: `${presetName} · ${choice.percent1RM}% 1RM (poziom RM ${choice.rmLevel}), kg dobierze Speediance; ${choice.rationale}` };
  }
  const rounded = roundPercentLoadKg(source.value * choice.percent1RM / 100);
  return { ...base, loadKg: rounded.kg, weightWire: rounded.wire, roundingStepKg: rounded.step, oneRepMax: source, weightSource: 'gm-coach-estimate',
    preview: `${presetName} · ${choice.percent1RM}% 1RM ≈ ${rounded.kg} kg (poziom RM ${choice.rmLevel}; 1RM ${source.value} kg [${source.source}${source.approximate ? ', szacunek' : ''}]); ${choice.rationale}` };
}
