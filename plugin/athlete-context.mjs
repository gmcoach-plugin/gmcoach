import { quantizeCustomizeLoad } from './customize-load-step.mjs';
import { resolveReferenceClientSuggestedDisplayLoad, REFERENCE_CLIENT_REPORTED_REP_MAX_CURVE } from './program-payload.mjs';
import { findStoredStrengthAnchor, CONFIRMED_CUSTOMIZE_ANCHOR_SOURCES } from './coaching-profile.mjs';
import { parseExerciseStatisticsDate } from './exercise-statistics.mjs';

export const GOAL_REP_RANGES = Object.freeze({
  strength: Object.freeze({ minimum: 3, maximum: 5 }),
  muscle: Object.freeze({ minimum: 8, maximum: 12 }),
  endurance: Object.freeze({ minimum: 15, maximum: 20 }),
  maintenance: Object.freeze({ minimum: 6, maximum: 10 })
});

const MAX_NODES = 20_000;
const PAGE_ARRAY_NAME = /(?:record|history|stat|list|item|row|result|content)/i;
const DATE_FIELDS = ['date', 'dayStr', 'trainingDate', 'recordDate', 'createTime', 'createdAt', 'timestamp', 'time'];
const NEXT_FIELDS = ['hasNext', 'hasMore', 'hasNextPage', 'has_next', 'has_more'];
const PAGE_FIELDS = ['pageNo', 'page', 'currentPage', 'pageNumber'];
const PAGE_TOTAL_FIELDS = ['totalPages', 'pageCount', 'pages', 'totalPage'];
const TOTAL_FIELDS = ['total', 'totalCount', 'recordCount', 'totalRecords'];

const SUPPORTED_CUSTOMIZE_ANCHOR_SOURCES = new Set(CONFIRMED_CUSTOMIZE_ANCHOR_SOURCES);

/**
 * Return whether an anchor provenance can be used by the current Customize
 * serializer. Raw recent-history records are not an accepted source until the
 * history API exposes a verified working-set mapping and load-estimation rule.
 */
export function isSupportedCustomizeAnchorSource(source) {
  return SUPPORTED_CUSTOMIZE_ANCHOR_SOURCES.has(source);
}

export function normalizeExerciseName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') : '';
}

/** Exact name wins; ambiguous substring matches never trigger an account read. */
export function matchExerciseQuery(query, exercises) {
  if (typeof query !== 'string' || !Array.isArray(exercises)) return { status: 'invalid' };
  const normalized = normalizeExerciseName(query);
  if (!normalized) return { status: 'empty' };
  const exact = exercises.filter((item) => normalizeExerciseName(item?.title) === normalized);
  if (exact.length === 1) return { status: 'matched', exercise: exact[0], match: 'exact' };
  if (exact.length > 1) return { status: 'ambiguous', matches: exact };
  const words = normalized.split(/\s+/).filter(Boolean);
  const wordMatches = exercises.filter((item) => {
    const title = normalizeExerciseName(item?.title);
    return words.every((word) => title.includes(word));
  });
  if (wordMatches.length === 1) return { status: 'matched', exercise: wordMatches[0], match: 'all-words' };
  return { status: 'ambiguous', matches: wordMatches.slice(0, 20) };
}

/**
 * Select a direct statistic only if its field name, unit and exercise are already
 * explicit. Competing equal-rank values remain ambiguous instead of guessing.
 */
export function selectBestOneRepMaxCandidate(candidates, expectedUnit) {
  if (!Array.isArray(candidates)) return { status: 'missing', candidate: null };
  const eligible = candidates.filter((item) =>
    item && Number.isFinite(item.value) && item.value > 0 && ['kg', 'lb'].includes(item.unit) && item.unit === expectedUnit
  );
  if (!eligible.length) return { status: 'missing', candidate: null };
  const rank = (item) => item.kind === 'reported' && item.assessed === true ? 3 : item.kind === 'reported' ? 2 : 1;
  const topRank = Math.max(...eligible.map(rank));
  const ranked = eligible.filter((item) => rank(item) === topRank);
  const dated = ranked.filter((item) => Number.isFinite(parseExerciseStatisticsDate(item.observedAt)));
  if (dated.length) {
    const weekly = dated.filter((item) => item.datePrecision === 'week');
    const exact = dated.filter((item) => item.datePrecision !== 'week');
    // A bucket label cannot be ordered against a point observation without
    // knowing the bucket boundaries. Never promote the Monday label to an
    // exact date or quietly replace a conflicting session/assessment value.
    if (weekly.length && exact.length && new Set(ranked.map((item) => item.value)).size > 1) {
      return { status: 'ambiguous', candidate: null, candidates: ranked };
    }
    const newestTime = Math.max(...dated.map((item) => parseExerciseStatisticsDate(item.observedAt)));
    const newest = dated.filter((item) => parseExerciseStatisticsDate(item.observedAt) === newestTime);
    const undated = ranked.filter((item) => !Number.isFinite(parseExerciseStatisticsDate(item.observedAt)));
    const candidatesAtUnresolvedHorizon = [...newest, ...undated];
    const values = new Set(candidatesAtUnresolvedHorizon.map((item) => item.value));
    return values.size === 1
      ? { status: 'selected', candidate: newest[0] }
      : { status: 'ambiguous', candidate: null, candidates: candidatesAtUnresolvedHorizon };
  }
  const values = new Set(ranked.map((item) => item.value));
  return values.size === 1
    ? { status: 'selected', candidate: ranked[0] }
    : { status: 'ambiguous', candidate: null, candidates: ranked };
}

/**
 * Accept a recent session set only when its normalized record proves the exact
 * exercise, work-set role, reps, weight unit, date, and RIR. Velocity-only
 * records stay unsupported until a verified velocity-to-e1RM method exists.
 */
export function selectVerifiedRecentWorkingSet(candidates, {
  exerciseId,
  exerciseName,
  expectedUnit
} = {}) {
  if (!Array.isArray(candidates) || !Number.isSafeInteger(exerciseId) || exerciseId < 1 ||
      !normalizeExerciseName(exerciseName) || !['kg', 'lb'].includes(expectedUnit)) {
    return { status: 'needs-anchor', reason: 'missing-exercise-context', candidate: null };
  }
  const matchingExercise = candidates.filter((item) =>
    item?.exerciseId === exerciseId &&
    normalizeExerciseName(item.exerciseName) === normalizeExerciseName(exerciseName)
  );
  const verified = matchingExercise.filter((item) =>
    item.isWorkingSet === true &&
    item.workUnit === 'reps' &&
    item.unit === expectedUnit &&
    Number.isFinite(item.weight) && item.weight > 0 && item.weight <= 1000 &&
    Number.isSafeInteger(item.reps) && item.reps >= 1 && item.reps <= 20 &&
    Number.isFinite(parseExerciseStatisticsDate(item.observedAt)) &&
    Number.isSafeInteger(item.rir) && item.rir >= 0 && item.rir <= 5
  );
  if (!verified.length) {
    const velocityOnly = matchingExercise.some((item) =>
      item.isWorkingSet === true && item.workUnit === 'reps' && item.unit === expectedUnit &&
      Number.isFinite(item.weight) && item.weight > 0 && Number.isSafeInteger(item.reps) &&
      Number.isFinite(Number(item.velocity)) && !Number.isSafeInteger(item.rir)
    );
    return {
      status: 'needs-anchor',
      reason: velocityOnly ? 'unsupported-velocity-model' : 'unverified-history-record',
      candidate: null
    };
  }
  const newestTime = Math.max(...verified.map((item) => parseExerciseStatisticsDate(item.observedAt)));
  const newest = verified.filter((item) => parseExerciseStatisticsDate(item.observedAt) === newestTime);
  const signatures = new Set(newest.map((item) => `${item.weight}:${item.reps}:${item.rir}:${item.unit}`));
  if (signatures.size !== 1) return { status: 'needs-anchor', reason: 'ambiguous-latest-working-set', candidate: null };
  const item = newest[0];
  return {
    status: 'selected',
    candidate: {
      exerciseId,
      exerciseName: item.exerciseName.trim(),
      observedAt: new Date(newestTime).toISOString(),
      weight: item.weight,
      reps: item.reps,
      rir: item.rir,
      unit: item.unit,
      workUnit: 'reps',
      isWorkingSet: true
    }
  };
}

/** Reproduce the observed reference client assessment-based static suggestion path.
 * The next table step is software behavior, not a measured RIR prescription. */
export function estimateStaticLoads({ strengthAnchor, reps }) {
  if (!strengthAnchor || !['kg', 'lb'].includes(strengthAnchor.unit)) {
    throw new TypeError('Wymagana jest kotwica 1RM/e1RM z jawną jednostką kg albo lb.');
  }
  const oneRepMax = strengthAnchor.oneRepMax;
  if (typeof oneRepMax !== 'number' || !Number.isFinite(oneRepMax) || oneRepMax <= 0 || oneRepMax > 1000) {
    throw new TypeError('Kotwica musi zawierać dodatnie oneRepMax.');
  }
  if (!Array.isArray(reps) || reps.length < 1 || reps.length > 100) {
    throw new TypeError('Podaj od 1 do 100 wartości powtórzeń.');
  }
  return reps.map((count, index) => {
    const estimate = resolveReferenceClientSuggestedDisplayLoad({ oneRepMax, reps: count, displayUnit: strengthAnchor.unit });
    return {
      set: index + 1,
      reps: count,
      percent1RM: Math.round(estimate.targetPercent1RM * 1000) / 10,
      // Device Customize step for kg and lb alike (lb via the kg step, 0.1 lb display).
      estimatedLoad: quantizeCustomizeLoad(estimate.suggestedLoad, strengthAnchor.unit, 'nearest'),
      unit: strengthAnchor.unit,
      referenceClientRmStep: estimate.referenceReps,
      rounding: estimate.rounding,
      method: estimate.method,
      approximate: Boolean(strengthAnchor.estimateMethod) || strengthAnchor.approximate === true,
      ...(strengthAnchor.estimateMethod ? { anchorKind: 'estimated-e1RM', anchorEstimateMethod: strengthAnchor.estimateMethod, workingSetAssumption: strengthAnchor.workingSetAssumption } : {}),
      curve: estimate.method
    };
  });
}

/**
 * Return complete Customize suggestions within the observed 1–20 domain. The
 * assessment suggestion's next-step and whole-unit rounding are separate from
 * direct universal table lookup or a measured exercise-specific velocity model.
 */
export function estimateStaticLoadsWithCoverage({ strengthAnchor, reps }) {
  if (!Array.isArray(reps) || reps.length < 1 || reps.length > 100 ||
      reps.some((count) => !Number.isSafeInteger(count) || count < 1 || count > 20)) {
    throw new TypeError('Podaj od 1 do 100 liczb powtórzeń z zakresu 1–20.');
  }
  const supportedRepSet = new Set(Object.keys(REFERENCE_CLIENT_REPORTED_REP_MAX_CURVE).map(Number));
  const supportedReps = reps.filter((count) => supportedRepSet.has(count));
  const unsupportedRepCounts = [...new Set(reps.filter((count) => !supportedRepSet.has(count)))];
  const estimatedSupportedLoads = supportedReps.length ? estimateStaticLoads({ strengthAnchor, reps: supportedReps }) : [];
  let estimatedIndex = 0;
  const supportedSuggestions = reps.flatMap((count, index) => {
    if (!supportedRepSet.has(count)) return [];
    const estimate = estimatedSupportedLoads[estimatedIndex++];
    return [{ ...estimate, set: index + 1 }];
  });
  const needsInput = unsupportedRepCounts.length > 0;
  return {
    needsInput,
    requestedReps: [...reps],
    supportedRepCounts: [...new Set(supportedReps)],
    unsupportedRepCounts,
    // Never return a partial set of static loads that could be mistaken for
    // a complete prescription.
    suggestions: needsInput ? [] : supportedSuggestions
  };
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

/** Best-effort pagination metadata for the reverse-engineered stats endpoint. */
export function inspectExerciseStatisticsPage(envelope, page, pageSize) {
  const queues = [{ value: envelope, path: '$', depth: 0 }];
  let visited = 0;
  let selectedArray = null;
  const recordArrays = [];
  let explicitHasMore;
  let declaredPageCount;
  let declaredTotal;
  let declaredCurrentPage;
  const declarations = [];
  while (queues.length && visited++ < MAX_NODES) {
    const { value, path, depth } = queues.shift();
    if (!isRecord(value) || depth > 12) continue;
    for (const [key, child] of Object.entries(value)) {
      if (Array.isArray(child) && child.every((item) => isRecord(item) || item === null)) {
        if (PAGE_ARRAY_NAME.test(key)) recordArrays.push({ values: child, path: `${path}.${key}` });
      }
      if (NEXT_FIELDS.includes(key) && typeof child === 'boolean') declarations.push({ path, kind: 'next', value: child });
      const numeric = typeof child === 'number' || typeof child === 'string' && /^\d+$/.test(child);
      if (numeric && Number.isSafeInteger(Number(child)) && Number(child) >= 0) {
        if (PAGE_TOTAL_FIELDS.includes(key)) declarations.push({ path, kind: 'pages', value: Number(child) });
        if (TOTAL_FIELDS.includes(key)) declarations.push({ path, kind: 'total', value: Number(child) });
        if (PAGE_FIELDS.includes(key)) declarations.push({ path, kind: 'page', value: Number(child) });
      }
      if (isRecord(child)) queues.push({ value: child, path: `${path}.${key}`, depth: depth + 1 });
      // Row contents are records, not competing pagination envelopes.
    }
  }
  if (recordArrays.length > 1) return { page, recordCount: null, hasMore: null, paginationSource: 'ambiguous-record-arrays', competingRecordsPaths: recordArrays.map(item => item.path).sort() };
  selectedArray = recordArrays[0] ?? null;
  const recordCount = selectedArray?.values.filter(isRecord).length ?? null;
  const scoped = declarations.filter(item => selectedArray && selectedArray.path.startsWith(`${item.path}.`));
  const unique = kind => [...new Set(scoped.filter(item => item.kind === kind).map(item => item.value))];
  const conflict = ['next', 'pages', 'total', 'page'].some(kind => unique(kind).length > 1);
  [explicitHasMore] = unique('next');
  [declaredPageCount] = unique('pages');
  [declaredTotal] = unique('total');
  [declaredCurrentPage] = unique('page');
  if (conflict || queues.length) return { page, recordCount, hasMore: null, paginationSource: conflict ? 'conflicting-pagination' : 'traversal-limit', ...(selectedArray ? { recordsPath: selectedArray.path } : {}) };
  if (declaredTotal !== undefined && recordCount !== null && Math.max(0, (declaredCurrentPage ?? page) - 1) * pageSize + recordCount > declaredTotal) return { page, recordCount, hasMore: null, paginationSource: 'conflicting-pagination', recordsPath: selectedArray.path };
  const signals = [explicitHasMore,
    declaredPageCount === undefined ? undefined : page < declaredPageCount,
    declaredTotal === undefined || recordCount === null ? undefined : Math.max(0, (declaredCurrentPage ?? page) - 1) * pageSize + recordCount < declaredTotal
  ].filter(value => value !== undefined);
  if (new Set(signals).size > 1) return { page, recordCount, hasMore: null, paginationSource: 'conflicting-pagination', ...(selectedArray ? { recordsPath: selectedArray.path } : {}) };
  let hasMore = explicitHasMore;
  let paginationSource = explicitHasMore === undefined ? null : 'explicit-has-next';
  if (hasMore === undefined && declaredPageCount !== undefined) {
    hasMore = page < declaredPageCount;
    paginationSource = 'page-count';
  }
  if (hasMore === undefined && declaredTotal !== undefined && recordCount !== null) {
    const offset = Math.max(0, (declaredCurrentPage ?? page) - 1) * pageSize;
    hasMore = offset + recordCount < declaredTotal;
    paginationSource = 'record-total';
  }
  if (hasMore === undefined && recordCount !== null) {
    hasMore = recordCount >= pageSize;
    paginationSource = 'page-size-heuristic';
  }
  return {
    page,
    recordCount,
    hasMore: hasMore ?? null,
    paginationSource: paginationSource || 'unknown',
    ...(selectedArray ? { recordsPath: selectedArray.path } : {})
  };
}

/** Trim only the already-sanitized record array identified by the raw page scan. */
export function trimSanitizedStatisticsRecords(summary, recordsPath, maxRecords) {
  if (!summary || typeof summary !== 'object' || !Number.isSafeInteger(maxRecords) || maxRecords < 0 || typeof recordsPath !== 'string') {
    return { summary, recordCount: null, returnedRecords: null, trimmed: false };
  }
  let target = summary.sanitizedData;
  const parts = [...recordsPath.matchAll(/\.([A-Za-z0-9_$-]+)|\[(\d+)\]/g)].map((match) => match[1] ?? Number(match[2]));
  if (parts[0] === 'data') parts.shift();
  for (const part of parts) target = typeof part === 'number' ? target?.[part] : target?.[part];
  if (!Array.isArray(target)) return { summary, recordCount: null, returnedRecords: null, trimmed: false };
  const recordCount = target.length;
  if (target.length > maxRecords) target.splice(maxRecords);
  return {
    summary,
    recordCount,
    returnedRecords: Math.min(recordCount, maxRecords),
    trimmed: recordCount > maxRecords
  };
}

/** Carry only dated, safe local profile fields into an athlete snapshot. */
export function buildCoachAthleteContext(profileRecord) {
  const data = profileRecord?.profileData;
  if (!data || typeof data !== 'object') return { savedProfile: false, goal: null, preferences: null, recoverySelfReport: null };
  return {
    savedProfile: true,
    goal: {
      ...(data.primaryGoal ? { primaryGoal: data.primaryGoal } : {}),
      ...(data.goalTimeline ? { timeline: data.goalTimeline } : {}),
      ...(Array.isArray(data.priorityAreas) ? { priorityAreas: data.priorityAreas } : {})
    },
    preferences: {
      ...(data.exercisePreferences ? { exercisePreferences: data.exercisePreferences } : {}),
      ...(data.exerciseRestrictions ? { exerciseRestrictions: data.exerciseRestrictions } : {}),
      ...(data.supersetPreferences ? { supersetPreferences: data.supersetPreferences } : {}),
      ...(data.resistanceModePreferences ? { resistanceModePreferences: data.resistanceModePreferences } : {})
    },
    recoverySelfReport: {
      ...(data.sleepHoursAverage !== undefined ? { sleepHoursAverage: data.sleepHoursAverage } : {}),
      ...(data.recoveryContext ? { recoveryContext: data.recoveryContext } : {}),
      ...(data.trainingResponse ? { trainingResponse: data.trainingResponse } : {})
    }
  };
}

export function getGoalRepRange(goal) {
  return GOAL_REP_RANGES[goal] || null;
}

/**
 * Resolve a local profile anchor by stable exercise ID and its saved exact name.
 * The profile is already scoped to one connected account; this path performs no
 * Speediance request and refuses duplicated or malformed ID entries.
 */
export function findProfileStrengthAnchor(profileData, exerciseId) {
  if (!Number.isSafeInteger(exerciseId) || exerciseId < 1 || !Array.isArray(profileData?.strengthAnchors)) {
    return { status: 'missing', exerciseName: null, anchor: null };
  }
  const matches = profileData.strengthAnchors.filter((item) => item?.groupId === exerciseId);
  if (matches.length !== 1) {
    return { status: matches.length > 1 ? 'ambiguous' : 'missing', exerciseName: null, anchor: null };
  }
  const exerciseName = typeof matches[0]?.exerciseName === 'string' ? matches[0].exerciseName.trim() : '';
  if (!exerciseName) return { status: 'invalid', exerciseName: null, anchor: null };
  const anchor = findStoredStrengthAnchor(matches, exerciseId, exerciseName);
  return anchor
    ? { status: 'matched', exerciseName, anchor }
    : { status: 'invalid', exerciseName, anchor: null };
}

/** Non-strength reference-client-style suggestions stay load-free and require explicit targets. */
export function buildNonStrengthLoadSuggestion({ kind, exerciseName, durationSeconds, intensity, bandColors, reps, restSeconds }) {
  if (kind === 'cardio') {
    if (typeof exerciseName !== 'string' || !/\b(?:row(?:ing)?|ski(?:ing)?|ski[ -]?erg|wioślar\p{L}*|nart\p{L}*)\b/iu.test(exerciseName)) {
      throw new Error('Cardio w GM Monsterze obsługuje tu tylko potwierdzone ćwiczenie Row albo Ski z katalogu Speediance.');
    }
    if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 7200 ||
        !Number.isSafeInteger(intensity) || intensity < 1 || intensity > 10) {
      return {
        needsInput: true,
        question: 'Podaj czas w sekundach i docelową intensywność RPE 1–10 dla tego ćwiczenia Row/Ski. GM Coach nie wymyśli celu ani nie potraktuje go jako ustawienia oporu urządzenia.'
      };
    }
    return {
      needsInput: false,
      suggestion: { kind: 'cardio', exerciseName, durationSeconds, intensity, unit: 'seconds', load: null }
    };
  }
  if (kind === 'pilates') {
    if (bandColors !== undefined && (!Array.isArray(bandColors) || bandColors.length < 1 || bandColors.length > 6 || bandColors.some((color) => !Number.isSafeInteger(color) || color < 1 || color > 6))) {
      throw new Error('band_colors musi zawierać od 1 do 6 numerów kolorów 1–6.');
    }
    if (!Array.isArray(bandColors) || bandColors.length === 0) {
      return { needsInput: true, question: 'Jakie kolory/poziomy taśm Pilates masz dostępne? Bez potwierdzonej listy nie dobiorę oporu.' };
    }
    return { needsInput: false, suggestion: { kind: 'pilates', bandColors: [...new Set(bandColors)].sort((a, b) => a - b), load: 'band-resistance' } };
  }
  if (kind === 'mat' || kind === 'bodyweight') {
    const repValues = Array.isArray(reps) ? reps : reps === undefined ? undefined : [reps];
    if (repValues !== undefined && (!repValues.length || repValues.length > 100 || repValues.some((count) => !Number.isSafeInteger(count) || count < 1 || count > 100))) throw new Error('reps musi zawierać od 1 do 100 wartości powtórzeń.');
    if (durationSeconds !== undefined && (!Number.isSafeInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 7200)) throw new Error('duration_seconds musi wynosić od 1 do 7200.');
    if ((repValues === undefined) === (durationSeconds === undefined)) {
      return { needsInput: true, question: 'Dla ćwiczenia bez obciążenia podaj albo liczbę powtórzeń, albo czas w sekundach — nie zamieniaj jednej jednostki na drugą.' };
    }
    if (restSeconds !== undefined && (!Number.isSafeInteger(restSeconds) || restSeconds < 0 || restSeconds > 600)) throw new Error('rest_seconds musi wynosić od 0 do 600.');
    return {
      needsInput: false,
      suggestion: {
        kind,
        ...(repValues === undefined ? { durationSeconds, unit: 'seconds' } : { sets: repValues.map((count, index) => ({ set: index + 1, reps: count })), unit: 'reps' }),
        ...(restSeconds === undefined ? {} : { restSeconds }),
        load: null
      }
    };
  }
  throw new Error('movement_kind musi być strength, cardio, pilates, mat albo bodyweight.');
}

/** Optional read-only approximation from pinned Labatt source, not private reference client parity.
 * https://github.com/labatt/speediance-mcp/blob/96efbb3da0fa9d903defecbd2f726ea1885ce12e/src/speediance_mcp/tools/coaching.py#L202-L228
 * Input is explicitly user-declared, never treated as fresh API/unit/Smart RM evidence. */
export function buildLabattReferenceSuggestion(args, { now = Date.now() } = {}) {
  const fail = (message) => { throw new TypeError(`Labatt-reference: ${message}`); };
  const number = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1000;
  const count = (value) => Number.isSafeInteger(value) && value >= 1 && value <= 30;
  const dense = (value, minimum, maximum) => {
    if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).some((key) => typeof key !== 'string' || (key !== 'length' && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)))) return false;
    for (let index = 0; index < value.length; index++) {
      const descriptor = descriptors[index];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.get || descriptor.set) return false;
    }
    return true;
  };
  const allowed = new Set(['profile','exercise_id','exercise_name','load_method','labatt_source','labatt_history','labatt_saved_anchor','set_reps','target_rir','unit','working_weight','working_reps','movement_kind','goal','refresh_speediance_data','consent_to_read_speediance','one_rep_max','working_rir','duration_seconds','intensity','band_colors','rest_seconds']);
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some((key) => !allowed.has(key))) fail('unsupported public/provenance fields.');
  if (typeof args.profile !== 'string' || !args.profile.trim()) fail('explicit nonempty profile is required; no account discovery.');
  if (!Number.isSafeInteger(args.exercise_id) || args.exercise_id < 1 || !['kg', 'lb'].includes(args.unit)) fail('exact exercise_id and declared kg/lb are required.');
  if (args.load_method !== 'labatt-reference-epley' || !['working-set', 'history', 'saved-anchor'].includes(args.labatt_source)) fail('explicit method and source selection are required.');
  if ((args.movement_kind ?? 'strength') !== 'strength' || args.refresh_speediance_data === true || args.one_rep_max !== undefined || args.working_rir !== undefined || args.duration_seconds !== undefined || args.intensity !== undefined || args.band_colors !== undefined) fail('strength-only declared inputs; no automatic account read, account 1RM or historical RIR inference.');
  if (!dense(args.set_reps, 1, 100) || !args.set_reps.every(count)) fail('set_reps must densely contain explicit 1–30 data values.');
  if (!Number.isSafeInteger(args.target_rir) || args.target_rir < 0 || args.target_rir > 5) fail('target_rir 0–5 is required.');
  if (args.goal !== undefined && !['strength', 'muscle', 'maintenance', 'endurance'].includes(args.goal)) fail('unsupported goal.');
  if (args.labatt_saved_anchor !== undefined && !number(args.labatt_saved_anchor)) fail('invalid declared saved load anchor.');
  if (args.labatt_source !== 'working-set' && (args.working_weight !== undefined || args.working_reps !== undefined)) fail('working-set fields conflict with selected source.');
  if (args.labatt_source !== 'history' && args.labatt_history !== undefined) fail('history conflicts with selected source.');
  if (args.labatt_source === 'working-set' && args.labatt_saved_anchor !== undefined) fail('saved anchor conflicts with working-set source.');
  const epley = (weight, reps) => reps === 1 ? weight : weight * (1 + reps / 30);
  let basis = null;
  if (args.labatt_source === 'working-set') {
    if (!number(args.working_weight) || !count(args.working_reps)) fail('working_weight and working_reps are required.');
    basis = { weight: args.working_weight, reps: args.working_reps, source: 'user-declared-working-set' };
  } else if (args.labatt_source === 'history') {
    if (!dense(args.labatt_history, 0, 30)) fail('bounded dense declared history 0–30 sessions is required.');
    const seen = new Set();
    const candidates = [];
    for (const session of args.labatt_history) {
      if (!session || typeof session !== 'object' || Array.isArray(session) || Object.keys(session).some((key) => !['exerciseId', 'sessionId', 'observedAt', 'unit', 'sets'].includes(key))) fail('unsupported history/provenance fields.');
      const date = typeof session.observedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(session.observedAt) ? Date.parse(session.observedAt) : NaN;
      if (!Number.isFinite(date) || new Date(date).toISOString().slice(0,19) !== session.observedAt.slice(0,19) || date > now) fail('history requires an exact valid nonfuture UTC timestamp, not weekly labels.');
      if (session.exerciseId !== args.exercise_id || session.unit !== args.unit || !Number.isSafeInteger(session.sessionId) || session.sessionId < 1 || seen.has(session.sessionId)) fail('history identity/unit conflict or duplicate session.');
      seen.add(session.sessionId);
      if (!dense(session.sets, 1, 100)) fail('bounded dense ordered actual sets are required.');
      let best = null;
      for (const set of session.sets) {
        if (!set || typeof set !== 'object' || Array.isArray(set) || Object.keys(set).some((key) => !['weight', 'reps'].includes(key)) || !number(set.weight) || !count(set.reps)) fail('history sets require positive declared weight/reps only.');
        if (!best || epley(set.weight,set.reps) > epley(best.weight,best.reps)) best = set;
      }
      candidates.push({ ...best, date: session.observedAt, time: date, sessionId: session.sessionId, source: 'user-declared-session-log' });
    }
    candidates.sort((a,b) => b.time - a.time);
    if (candidates.length > 1 && candidates[0].time === candidates[1].time) fail('ambiguous latest timestamp; no array-order guess.');
    if (candidates.length) { const { time, ...selected } = candidates[0]; basis = selected; }
  } else if (args.labatt_saved_anchor === undefined) fail('declared saved load anchor is required.');
  const reference = { repository: 'labatt/speediance-mcp', commit: '96efbb3da0fa9d903defecbd2f726ea1885ce12e', algorithm: 'Epley solved for target reps + RIR; floor(x*2+0.5)/2', privateReferenceClientParity: false };
  const suggestions = args.set_reps.map((reps, index) => {
    const raw = basis ? epley(basis.weight,basis.reps) / (1 + (reps + args.target_rir) / 30) : args.labatt_saved_anchor;
    const load = basis ? Math.floor(raw * 2 + 0.5) / 2 : raw;
    if (load !== undefined && (!number(load))) fail('calculated load outside supported positive range.');
    return { set: index+1, reps, targetRir: args.target_rir, estimatedLoad: load ?? null, unit: args.unit, approximate: true };
  });
  return { loadMethod: 'labatt-reference-epley', declaredSource: args.labatt_source, reference, basis, basisAssumption: basis ? 'Logged reps only; historical RIR and working-set role are not inferred.' : 'Explicit saved load anchor used verbatim.', suggestions, needsAnchor: suggestions.some((item) => item.estimatedLoad === null), approximate: true, provenance: 'user-declared-only', historyCoverage: args.labatt_source === 'history' ? 'supplied-subset-only' : 'not-requested', writesToSpeediance: false, scientificApproval: false, smartRmReadiness: false, note: 'Read-only Customize approximation. This does not verify account/history units, catalog variant, physical load or RIR. Keep the scientific gate and fresh account-unit/approval/write guards before any separately requested plan.' };
}
