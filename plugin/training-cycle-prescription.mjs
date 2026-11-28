import { createHash } from 'node:crypto';
import { boundedCycleDigest } from './bounded-cycle-json.mjs';
import { snapshotNormalizedPlan } from './reviewed-plan-record.mjs';
import { getReferenceClientRmPresetRules, validateReferenceClientRmLevel } from './program-payload.mjs';
import { getReferenceClientRmPresetByName } from './preset-mapping.mjs';

const DAY = 86400000;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Stable prescribed execution/coaching fields only. Anchor source, timestamps,
// research batches and account readiness are provenance, retained in planDigest.
const executionExerciseFields = ['trainingGoal', 'id', 'entryId', 'actionLibraryId', 'section', 'unilateralPrescription', 'sideTransitionSeconds', 'sideTransitionRationale', 'loadType', 'staticLoadRequested', 'dataStatType', 'movementKind', 'smartRmPresetName', 'smartRmPresetId', 'smartRmActionLibraryId'];
const executionSetFields = ['side', 'unit', 'durationSeconds', 'reps', 'rmLevel', 'level', 'rirTarget', 'intensity', 'loadEstimate', 'weightKg', 'weight', 'weightUnit', 'mode', 'rest', 'calculatedLoad', 'loadUnit', 'percent1RM', 'percentResolved'];
const pick = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
function executionSignature(plan) {
  return { exercises: plan.exercises.map(exercise => ({ ...pick(exercise, executionExerciseFields), sets: exercise.sets.map(set => pick(set, executionSetFields)) })), supersetBlocks: plan.supersetBlocks ?? [] };
}
export const trainingCyclePrescriptionSchema = {
  type: 'object', additionalProperties: false, required: ['startDate', 'totalWeeks', 'occurrences'],
  properties: {
    startDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    totalWeeks: { type: 'integer', minimum: 1, maximum: 52 },
    claimedWeeklySessionCounts: { type: 'array', maxItems: 52, items: { type: 'integer', minimum: 0, maximum: 364 } },
    deload: { type: 'object', additionalProperties: false, required: ['week', 'baselineWeek'], properties: { week: { type: 'integer', minimum: 1, maximum: 52, description: 'Explicit target comparison week; an empty target records zero prescribed sessions, not physiological recovery. Public cycle preview separately requires a declared rest week.' }, baselineWeek: { type: 'integer', minimum: 1, maximum: 52, description: 'Actual baseline with sessions. Public scheduled-deload preview requires the latest actual working week before the target, skipping explicitly declared rest weeks.' } } },
    occurrences: { type: 'array', minItems: 1, maxItems: 364, items: { type: 'object', additionalProperties: false, required: ['date', 'sessionId', 'templateCode', 'executionDigest', 'normalizedPlan'], properties: {
      date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, occurrenceId: { type: 'string', maxLength: 128 }, sessionId: { type: 'string', maxLength: 128 }, templateCode: { type: 'string', maxLength: 128 }, executionDigest: { type: 'string', pattern: '^[a-f0-9]{64}$' }, normalizedPlan: { type: 'object', description: 'Exact normalized plan snapshot, including executable exercises and sets; this local tool does not establish API or scientific verification.' }
    } } }
  }
};
function dateDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid cycle date.');
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) throw new Error('Invalid cycle date.');
  return ms / DAY;
}
function dense(value, limit, label) {
  if (!Array.isArray(value) || value.length > limit || Object.keys(value).length !== value.length || value.some((_, index) => !Object.hasOwn(value, index))) throw new Error(`Invalid dense ${label}.`);
  return value;
}
function text(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}
function positive(value, label, maximum = 100000) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`Invalid ${label}.`);
  return value;
}
function validateLoad(exercise, set) {
  const type = exercise.loadType;
  if (!['smart-rm', 'profile-auto', 'customize-manual', 'fixed-kg', 'bodyweight', 'cardio', 'vita'].includes(type)) throw new Error('Unknown load type.');
  if (type === 'customize-manual' && (exercise.staticLoadRequested !== true || !Number.isFinite(set.weight) || set.weight <= 0 || set.weight > 1000 || !['kg', 'lb'].includes(set.weightUnit) || set.weightKg !== undefined || set.rmLevel !== undefined)) throw new Error('Invalid manual Customize prescription.');
  if (set.unit === 'sec' && Object.hasOwn(set, 'rirTarget')) throw new Error('Timed prescription cannot use repetition RIR.');
  if (set.rirTarget !== undefined && (!Number.isSafeInteger(set.rirTarget) || set.rirTarget < 0 || set.rirTarget > 5)) throw new Error('Invalid RIR.');
  if (type === 'bodyweight' && (set.weightKg !== undefined || set.rmLevel !== undefined)) throw new Error('Invalid bodyweight load.');
  if (type === 'fixed-kg' && (!Number.isFinite(set.weightKg) || set.weightKg < 0.1 || set.weightKg > 500)) throw new Error('Invalid fixed kg.');
  if (type === 'vita' && (exercise.dataStatType !== 6 || !Number.isSafeInteger(set.level) || set.level < 1 || set.level > 999 || set.weightKg !== undefined || set.rmLevel !== undefined)) throw new Error('Invalid Vita load.');
  if (type === 'cardio' && (set.unit !== 'sec' || set.mode !== 1 || !Number.isSafeInteger(set.intensity) || set.intensity < 1 || set.intensity > 10)) throw new Error('Invalid cardio prescription.');
  if (type === 'smart-rm') {
    const rules = getReferenceClientRmPresetRules(exercise.smartRmPresetName);
    if (!rules || set.unit !== 'reps' || getReferenceClientRmPresetByName(exercise.smartRmPresetName)?.id !== exercise.smartRmPresetId || !Number.isSafeInteger(set.rirTarget) || set.reps < rules.minReps || set.reps > rules.maxReps) throw new Error('Invalid Smart RM prescription.');
    validateReferenceClientRmLevel({ rmLevel: set.rmLevel, reps: set.reps, presetName: exercise.smartRmPresetName }, { allowPercentLevel: Boolean(set.percentResolved) });
  }
  if (type === 'profile-auto') {
    const estimate = set.loadEstimate, anchor = exercise.strengthAnchor;
    if (!estimate || !anchor || typeof anchor.source !== 'string' || !['kg', 'lb'].includes(anchor.unit) || set.loadUnit !== anchor.unit || !Number.isFinite(set.calculatedLoad) || set.calculatedLoad <= 0 || !Number.isFinite(estimate.targetPercent1RM) || estimate.targetPercent1RM <= 0 || estimate.targetPercent1RM > 1 || estimate.prescribedReps !== set.reps) throw new Error('Invalid prepared Customize prescription.');
  }
}
function dose(plan) {
  const result = { mainSets: 0, prescribedReps: 0, prescribedSeconds: 0 };
  const ids = new Set();
  for (const exercise of dense(plan.exercises, 60, 'exercises')) {
    positive(exercise.id, 'catalog id', Number.MAX_SAFE_INTEGER);
    const entryId = exercise.entryId ?? exercise.id;
    positive(entryId, 'entry id', Number.MAX_SAFE_INTEGER);
    if (ids.has(entryId)) throw new Error('Duplicate exercise entry id.');
    ids.add(entryId);
    if (!['main', 'warmup', 'stretching'].includes(exercise.section ?? 'main')) throw new Error('Unknown executable section.');
    const sets = dense(exercise.sets, 60, 'sets');
    if (!sets.length) throw new Error('Missing executable sets.');
    if (Object.hasOwn(exercise, 'sideTransitionSeconds') && (!Number.isSafeInteger(exercise.sideTransitionSeconds) || exercise.sideTransitionSeconds < 1 || exercise.sideTransitionSeconds > 30 || exercise.unilateralPrescription === 'explicit-sides' || typeof exercise.sideTransitionRationale !== 'string' || !exercise.sideTransitionRationale.trim() || exercise.sideTransitionRationale.length > 500)) throw new Error('Invalid operational side transition.');
    if (exercise.unilateralPrescription !== undefined && !['paired-symmetric', 'explicit-sides'].includes(exercise.unilateralPrescription)) throw new Error('Unknown unilateral prescription.');
    if (!Object.hasOwn(exercise, 'sideTransitionSeconds') && Object.hasOwn(exercise, 'sideTransitionRationale')) throw new Error('Side transition rationale requires seconds.');
    if (exercise.unilateralPrescription === 'explicit-sides' && (sets.length % 2 || sets.some((set, index) => set.side !== (index % 2 ? 2 : 1)))) throw new Error('Explicit sides require ordered left/right set pairs.');
    for (const set of sets) {
      if (!['reps', 'sec'].includes(set.unit)) throw new Error('Unknown dose unit.');
      const amount = positive(set.unit === 'reps' ? set.reps : set.durationSeconds, 'work dose', set.unit === 'reps' ? 100 : 86400);
      if (set.unit === 'reps' && set.durationSeconds !== undefined || set.unit === 'sec' && set.reps !== undefined) throw new Error('Conflicting dose fields.');
      if (!Number.isSafeInteger(set.rest) || set.rest < 0 || set.rest > 600) throw new Error('Invalid set rest.');
      if (![1, 2, 3].includes(set.mode)) throw new Error('Invalid resistance mode.');
      validateLoad(exercise, set);
      if ((exercise.section ?? 'main') !== 'main') continue;
      result.mainSets++;
      result[set.unit === 'reps' ? 'prescribedReps' : 'prescribedSeconds'] += amount;
    }
  }
  if (!result.mainSets) throw new Error('Missing main work.');
  return result;
}

function prescriptionSummary(plan) {
  // Public cycle preparation supplies a separate execution projection whose
  // static values have passed actual wire encode/decode. A local supplied plan
  // remains an unverified prescription; this helper does not establish protocol.
  const observations = Array.isArray(plan.preferenceCompliance?.catalogObservations) ? plan.preferenceCompliance.catalogObservations : [];
  return plan.exercises.map((exercise, exerciseIndex) => ({
    ...(() => { const name = observations.find(row => row?.exerciseIndex === exerciseIndex && row.mainMuscleGroupStatus === 'available')?.mainMuscleGroupName; return typeof name === 'string' && name.trim() ? { muscleGroup: name } : {}; })(),
    catalogId: exercise.id, entryId: exercise.entryId ?? exercise.id,
    section: exercise.section ?? 'main',
    ...(exercise.trainingGoal === undefined ? {} : {trainingGoal: exercise.trainingGoal}),
    actionLibraryId: Number.isSafeInteger(exercise.actionLibraryId) && exercise.actionLibraryId > 0 ? exercise.actionLibraryId : null,
    loadType: exercise.loadType, unilateralPrescription: exercise.unilateralPrescription ?? 'unknown',
    ...(exercise.sideTransitionSeconds === undefined ? {} : { sideTransitionSeconds: exercise.sideTransitionSeconds, sideTransitionRationale: exercise.sideTransitionRationale }),
    ...(exercise.smartRmPresetName ? { machinePreset: exercise.smartRmPresetName } : {}),
    localPrescribedSets: exercise.sets.length,
    expandedExecutionRows: 'unknown',
    sets: exercise.sets.map((set, index) => ({
      localSetIndex: index + 1, unit: set.unit,
      amount: set.unit === 'reps' ? set.reps : set.durationSeconds,
      side: set.side ?? 'unknown', mode: set.mode, restSeconds: set.rest,
      ...(set.rirTarget === undefined ? {} : { rirTarget: set.rirTarget }),
      ...(exercise.loadType === 'smart-rm' ? { rmLevel: validateReferenceClientRmLevel({ rmLevel: set.rmLevel, reps: set.reps, presetName: exercise.smartRmPresetName }, { allowPercentLevel: Boolean(set.percentResolved) }).rmLevel } : {}),
      ...(exercise.loadType === 'fixed-kg' ? { prescribedLoad: { value: set.weightKg, unit: 'kg' } } : {}),
      ...(exercise.loadType === 'customize-manual' ? { prescribedLoad: { value: set.weight, unit: set.weightUnit } } : {}),
      ...(exercise.loadType === 'profile-auto' ? { prescribedLoad: { value: set.calculatedLoad, unit: set.loadUnit } } : {}),
      ...(exercise.loadType === 'vita' ? { level: set.level } : {}),
      ...(exercise.loadType === 'cardio' ? { targetIntensity: set.intensity } : {})
    }))
  }));
}

// Pair local prescriptions by catalog/entry/section and calendar occurrence order.
// This exposes changes, never identifies physiological progression or matched performance.
export function compareWeeklyPrescriptions(beforeRows, afterRows, charge) {
  const group = rows => {
    const groups = new Map();
    for (const row of rows) for (const exercise of row.exercisePrescriptions) {
      const key = JSON.stringify([exercise.catalogId, exercise.entryId, exercise.section]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ date: row.date, occurrenceId: row.occurrenceId, exercise });
    }
    return groups;
  };
  const before = group(beforeRows), after = group(afterRows), comparisons = [];
  const appendComparison = value => { charge?.(value); comparisons.push(value); };
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const left = before.get(key) ?? [], right = after.get(key) ?? [];
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
      const a = left[index], b = right[index];
      const identity = JSON.parse(key);
      const result = { catalogId: identity[0], entryId: identity[1], section: identity[2], occurrenceOrdinal: index + 1,
        ...(a ? { from: { date: a.date, occurrenceId: a.occurrenceId } } : {}),
        ...(b ? { to: { date: b.date, occurrenceId: b.occurrenceId } } : {}) };
      if (!a || !b) { appendComparison({ ...result, status: 'unmatched', reason: a ? 'removed-occurrence' : 'added-occurrence' }); continue; }
      const previous = a.exercise, next = b.exercise;
      const reasons = [];
      if (previous.actionLibraryId === null || next.actionLibraryId === null) reasons.push('variant-unknown');
      else if (previous.actionLibraryId !== next.actionLibraryId) reasons.push('variant-changed');
      if (previous.trainingGoal !== next.trainingGoal) reasons.push('training-goal-changed');
      if (previous.loadType !== next.loadType) reasons.push('load-type-changed');
      if (previous.unilateralPrescription !== next.unilateralPrescription) reasons.push('side-prescription-changed');
      const setComparisons = [];
      for (let setIndex = 0; setIndex < Math.max(previous.sets.length, next.sets.length); setIndex++) {
        const x = previous.sets[setIndex], y = next.sets[setIndex];
        if (!x || !y) { setComparisons.push({ localSetIndex: setIndex + 1, status: 'unmatched', reason: x ? 'removed-set' : 'added-set' }); continue; }
        const setReasons = [...reasons];
        if (x.unit !== y.unit) setReasons.push('dose-unit-changed');
        if (x.side !== y.side) setReasons.push('side-changed');
        if ((x.prescribedLoad || y.prescribedLoad) && (!x.prescribedLoad || !y.prescribedLoad || x.prescribedLoad.unit !== y.prescribedLoad.unit)) setReasons.push('load-unit-changed-or-unknown');
        if (setReasons.length) { setComparisons.push({ localSetIndex: setIndex + 1, status: 'unmatched', reasons: setReasons }); continue; }
        const change = { localSetIndex: setIndex + 1, status: 'comparable-local-prescription', unit: x.unit,
          deltaAmount: y.amount - x.amount, deltaRestSeconds: y.restSeconds - x.restSeconds,
          mode: { from: x.mode, to: y.mode },
          rir: Number.isFinite(x.rirTarget) && Number.isFinite(y.rirTarget)
            ? { status: 'known', from: x.rirTarget, to: y.rirTarget, delta: y.rirTarget - x.rirTarget }
            : { status: Number.isFinite(x.rirTarget) !== Number.isFinite(y.rirTarget) ? 'presence-changed' : 'unknown', ...(Number.isFinite(x.rirTarget) ? { from: x.rirTarget } : {}), ...(Number.isFinite(y.rirTarget) ? { to: y.rirTarget } : {}) } };
        if (x.prescribedLoad && y.prescribedLoad) change.load = { unit: x.prescribedLoad.unit, delta: y.prescribedLoad.value - x.prescribedLoad.value };
        if (previous.loadType === 'smart-rm') {
          change.machinePreset = { from: previous.machinePreset, to: next.machinePreset, physicalLoad: 'unknown' };
          change.machineRmLevel = { from: x.rmLevel, to: y.rmLevel, physicalLoadDirection: 'unknown' };
        }
        if (previous.loadType === 'vita') change.level = { from: x.level, to: y.level };
        if (previous.loadType === 'cardio') change.targetIntensity = { from: x.targetIntensity, to: y.targetIntensity };
        setComparisons.push(change);
      }
      appendComparison({ ...result, status: reasons.length ? 'unmatched' : 'local-prescription-comparison',
        ...(reasons.length ? { reasons } : {}), deltaLocalPrescribedSets: next.localPrescribedSets - previous.localPrescribedSets, operationalSideTransition: { from: previous.sideTransitionSeconds ?? null, to: next.sideTransitionSeconds ?? null, interpretation: 'setup-time-not-recovery-or-progression' }, sets: setComparisons });
    }
  }
  return { pairing: 'catalog-entry-section-and-calendar-occurrence-order', physiologicalProgressionConfirmed: false, expandedExecutionRows: 'unknown', exercises: comparisons };
}


const preparedCycleProjections = new WeakSet(), projectedCycleInputs = new WeakSet();
function freezeCycleProjection(value) { if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeCycleProjection(child); Object.freeze(value); } return value; }
export function projectPreparedCyclePlan(normalizedPlan) {
  dense(normalizedPlan?.exercises, 60, 'exercises').forEach(exercise => dense(exercise?.sets, 60, 'sets').forEach(set => { if (set?.unit === 'sec' && Object.hasOwn(set, 'rirTarget')) throw new Error('Timed prescription cannot use repetition RIR.'); }));
  const plan = snapshotNormalizedPlan(normalizedPlan), work = dose(plan);
  const projection = freezeCycleProjection({ ...work, timeBudgetAssessment: plan.timeBudgetAssessment ?? null, planDigest: hash(plan), executablePrescriptionDigest: hash(executionSignature(plan)), exercisePrescriptions: prescriptionSummary(plan) });
  preparedCycleProjections.add(projection); return projection;
}
export function deriveProjectedTrainingCyclePrescription(input) { projectedCycleInputs.add(input); return deriveTrainingCyclePrescription(input); }

// Facts describe prescriptions, not completed work, physiological volume or approval.
export function deriveTrainingCyclePrescription(input) {
  const scalable = projectedCycleInputs.has(input);
  let comparisonBytes = 0;
  const chargeComparison = scalable ? value => { comparisonBytes += Buffer.byteLength(JSON.stringify(value)); if (comparisonBytes > 8_000_000) throw new Error('Cycle comparisons exceed bounded budget.'); } : undefined;
  const start = dateDay(input?.startDate);
  const totalWeeks = positive(input.totalWeeks, 'total weeks');
  if (totalWeeks > 52) throw new Error('Cycle exceeds 52 weeks.');
  const occurrences = dense(input.occurrences, 364, 'occurrences');
  if (!occurrences.length) throw new Error('Missing dated occurrences.');
  const occurrenceKeys = new Set();
  let snapshotBytes = 0;
  const rows = occurrences.map(row => {
    const day = dateDay(row?.date);
    const occurrenceId = row.occurrenceId ?? row.sessionId;
    text(occurrenceId, 'occurrence id');
    const occurrenceKey = JSON.stringify([row.date, occurrenceId]);
    if (day < start || day >= start + totalWeeks * 7 || occurrenceKeys.has(occurrenceKey)) throw new Error('Duplicate or out-of-cycle occurrence.');
    occurrenceKeys.add(occurrenceKey);
    text(row.sessionId, 'session id'); text(row.templateCode, 'template code');
    if (!/^[a-f0-9]{64}$/.test(row.executionDigest ?? '')) throw new Error('Invalid execution digest.');
    if (projectedCycleInputs.has(input)) {
      const projection = row.projection;
      if (!preparedCycleProjections.has(projection)) throw new Error('Unverified projected cycle definition.');
      return { date: row.date, occurrenceId, sessionId: row.sessionId, templateCode: row.templateCode, executionDigest: row.executionDigest, week: Math.floor((day - start) / 7) + 1, ...projection, localPrescribedSets: projection.mainSets, expandedExecutionRows: 'unknown' };
    }
    // Snapshot rejects hidden/private/unexpected data; dense validation precedes its map.
    dense(row.normalizedPlan?.exercises, 60, 'exercises').forEach(ex => dense(ex?.sets, 60, 'sets').forEach(set => {
      if (set?.unit === 'sec' && Object.hasOwn(set, 'rirTarget')) throw new Error('Timed prescription cannot use repetition RIR.');
    }));
    const plan = snapshotNormalizedPlan(row.normalizedPlan);
    snapshotBytes += Buffer.byteLength(JSON.stringify(plan), 'utf8');
    if (snapshotBytes > 8_000_000) throw new Error('Cycle snapshot exceeds total byte limit.');
    const work = dose(plan);
    return { date: row.date, occurrenceId, sessionId: row.sessionId, templateCode: row.templateCode, executionDigest: row.executionDigest, planDigest: hash(plan), executablePrescriptionDigest: hash(executionSignature(plan)), week: Math.floor((day - start) / 7) + 1, ...work, localPrescribedSets: work.mainSets, expandedExecutionRows: 'unknown', exercisePrescriptions: prescriptionSummary(plan) };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.occurrenceId.localeCompare(b.occurrenceId));
  const identities = new Map();
  for (const row of rows) {
    const identity = `${row.templateCode}:${row.executionDigest}:${row.executablePrescriptionDigest}`;
    if (identities.has(row.sessionId) && identities.get(row.sessionId) !== identity) throw new Error('Session identity refers to different prescriptions.');
    identities.set(row.sessionId, identity);
  }
  const weeks = Array.from({ length: totalWeeks }, (_, index) => {
    const entries = rows.filter(row => row.week === index + 1);
    return { week: index + 1, dates: entries.map(row => row.date), trainingDayCount: new Set(entries.map(row => row.date)).size, executablePrescriptionDigests: entries.map(row => row.executablePrescriptionDigest), sessionCount: entries.length, mainSets: entries.reduce((n, r) => n + r.mainSets, 0), prescribedReps: entries.reduce((n, r) => n + r.prescribedReps, 0), prescribedSeconds: entries.reduce((n, r) => n + r.prescribedSeconds, 0) };
  });
  weeks.forEach(week => { week.localPrescribedSets = week.mainSets; week.expandedExecutionRows = 'unknown'; });
  if (input.claimedWeeklySessionCounts !== undefined) {
    const counts = dense(input.claimedWeeklySessionCounts, 52, 'weekly counts');
    if (counts.length !== totalWeeks || counts.some((count, index) => count !== weeks[index].sessionCount)) throw new Error('Claimed weekly frequency differs from actual dates.');
  }
  const gaps = rows.slice(1).map((row, index) => ({ from: rows[index].date, to: row.date, days: dateDay(row.date) - dateDay(rows[index].date), intradaySeparation: 'unknown' }));
  const transitions = weeks.slice(1).map((week, index) => ({ fromWeek: index + 1, toWeek: index + 2, executablePrescriptionChanged: JSON.stringify(week.executablePrescriptionDigests) !== JSON.stringify(weeks[index].executablePrescriptionDigests), deltaMainSets: week.mainSets - weeks[index].mainSets, deltaReps: week.prescribedReps - weeks[index].prescribedReps, deltaSeconds: week.prescribedSeconds - weeks[index].prescribedSeconds }));
  transitions.forEach(transition => { transition.prescriptionComparison = compareWeeklyPrescriptions(rows.filter(row => row.week === transition.fromWeek), rows.filter(row => row.week === transition.toWeek), chargeComparison); });
  let deload = { status: 'not-declared' };
  if (input.deload !== undefined) {
    const { week, baselineWeek } = input.deload;
    if (!Number.isSafeInteger(week) || !Number.isSafeInteger(baselineWeek) || baselineWeek < 1 || week <= baselineWeek || week > totalWeeks) throw new Error('Invalid explicit deload comparison weeks.');
    const baseline = weeks[baselineWeek - 1], target = weeks[week - 1];
    if (!baseline.sessionCount) throw new Error('Deload comparison requires actual baseline sessions.');
    const executablePrescriptionChanged = JSON.stringify(target.executablePrescriptionDigests) !== JSON.stringify(baseline.executablePrescriptionDigests);
    deload = { status: 'prescription-comparison-needs-review', week, baselineWeek, targetPrescription: target.sessionCount ? 'actual-prescribed-sessions' : 'zero-prescribed-sessions', executablePrescriptionChanged, deltaMainSets: target.mainSets - baseline.mainSets, deltaReps: target.prescribedReps - baseline.prescribedReps, deltaSeconds: target.prescribedSeconds - baseline.prescribedSeconds, physiologicalDeloadConfirmed: false };
    const changes = [deload.deltaMainSets, deload.deltaReps, deload.deltaSeconds];
    const reduced = changes.some(n => n < 0), increased = changes.some(n => n > 0);
    deload.aggregateDoseDirection = reduced && increased ? 'mixed' : reduced ? 'reduced' : increased ? 'increased' : 'unchanged';
    deload.prescriptionComparison = compareWeeklyPrescriptions(rows.filter(row => row.week === baselineWeek), rows.filter(row => row.week === week), chargeComparison);
    if (!reduced && !executablePrescriptionChanged) throw new Error('Declared deload has no reduced prescribed dose or changed execution prescription.');
  }
  const facts = { startDate: input.startDate, totalWeeks, occurrences: rows, weeks, gaps, transitions, deload, muscleGroupAttribution: 'unavailable' };
  const prescriptionDigest = scalable ? boundedCycleDigest(facts) : hash(facts);
  const bindingValues = Object.fromEntries(['weekly_volume', 'frequency', 'progression_rotation', 'recovery_deload'].map(category => [category, `cyclePrescription=${prescriptionDigest};category=${category}`]));
  return { ...facts, prescriptionDigest, bindingValues, scientificApproval: false, mutationSent: false, requiresFreshScientificReview: true, note: 'Derived dated local prescriptions only. Execution digests are supplied identities, not API verification. Main sets/localPrescribedSets count local main-work rows before unilateral or superset serialization; expanded execution rows and physical work are unknown. Calendar-order comparisons do not establish physiological progression, deload, muscle attribution or recovery.' };
}

// Pure server projection of validated session requirements; no ownership/setup inference.
export function deriveCycleAccessoryRotation(facts, sessions) {
  if (!Array.isArray(facts?.occurrences) || facts.occurrences.length > 364 || !Array.isArray(facts?.organization?.blocks) || !Array.isArray(sessions) || sessions.length > 364) throw Error('Accessory rotation requires bounded actual cycle facts.');
  const byId = new Map(sessions.map(row => [row.sessionId, row.equipmentSafety?.accessoryRequirements]));
  if (byId.size !== sessions.length) throw Error('Accessory rotation session identities must be unique.');
  const occurrences = facts.occurrences.map(row => {
    const requirements = byId.get(row.sessionId);
    if (requirements !== undefined && (requirements.version !== 1 || !Array.isArray(requirements.requirements) || requirements.requirements.length > 60)) throw Error('Invalid session accessory requirements.');
    const entries = requirements?.requirements ?? [];
    const validIds = new Set(); let unknownRequirements = requirements === undefined ? 1 : 0;
    for (const entry of entries) {
      if (!Array.isArray(entry.requiredAccessoryIds) || entry.requiredAccessoryIds.length > 128 || entry.requiredAccessoryIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw Error('Invalid projected accessory identity.');
      if (!['valid-ids','valid-empty'].includes(entry.metadataStatus)) unknownRequirements++;
      else for (const id of entry.requiredAccessoryIds) validIds.add(id);
    }
    return { date: row.date, occurrenceId: row.occurrenceId, sessionId: row.sessionId, week: row.week, executionDigest: row.executionDigest,
      requirementStatus: unknownRequirements ? 'partial-observation' : 'complete-catalog-requirements', unknownRequirements,
      knownRequiredAccessoryIds: [...validIds].sort((a,b) => a-b), setupStatus: 'unknown',
      requirements: requirements ?? {version:1,inventoryStatus:'unknown',inventorySource:'unknown',requirements:[],metadataStatus:'missing'} };
  });
  const blocks = [...facts.organization.blocks].sort((a,b) => a.startWeek-b.startWeek).map(block => {
    const rows = occurrences.filter(row => row.week >= block.startWeek && row.week <= block.endWeek);
    const ids = [...new Set(rows.flatMap(row => row.knownRequiredAccessoryIds))].sort((a,b) => a-b);
    const unknownRequirements = rows.reduce((n,row) => n+row.unknownRequirements,0);
    return { blockId:block.id,startWeek:block.startWeek,endWeek:block.endWeek,occurrenceRefs:rows.map(row => ({date:row.date,occurrenceId:row.occurrenceId,sessionId:row.sessionId,week:row.week})),
      knownRequiredAccessoryIds:ids,unknownRequirements,status:!rows.length?'zero-prescribed-occurrences':unknownRequirements?'partial-observation':'complete-catalog-requirements',setupStatus:'unknown' };
  });
  const comparisons = blocks.slice(1).map((next,index) => {
    const previous = blocks[index], complete = previous.unknownRequirements === 0 && next.unknownRequirements === 0;
    return { fromBlock:previous.blockId,toBlock:next.blockId,status:complete?'complete-requirement-set-comparison':'partial-observation',
      observedAddedIds:next.knownRequiredAccessoryIds.filter(id => !previous.knownRequiredAccessoryIds.includes(id)),
      observedRetainedIds:next.knownRequiredAccessoryIds.filter(id => previous.knownRequiredAccessoryIds.includes(id)),
      observedRemovedIds:previous.knownRequiredAccessoryIds.filter(id => !next.knownRequiredAccessoryIds.includes(id)),
      absenceConfirmed:complete,actualSetupChangesConfirmed:false,benefitConfirmed:false };
  });
  const projection = { version:1,occurrences,blocks,comparisons,physicalDetectionVerified:false,scientificBenefitVerified:false,
    interpretation:'Catalog accessory requirements only; partial differences do not prove absence, setup changes, progression or benefit. Stable accessories may be appropriate.' };
  const scopeDigest = boundedCycleDigest(projection,8_000_000);
  return {...projection,scopeDigest,scientificAssessmentRequirement:'Review the exact progression_rotation binding and actual block accessory observations; justify stability or rotation for the goal and preferences. More accessories is not evidence of benefit.'};
}
