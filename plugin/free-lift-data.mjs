import { resolveSetUnit } from './unit-interpretation.mjs';

const SCALE_FACTOR = 2.2;
const SCALE_TOLERANCE = 0.01;
const MAX_CAPACITY_SETS = 10_000;
const MAX_ACTIONS = 200;
const MAX_SETS_PER_ACTION = 200;
const MAX_TOTAL_SETS = 2_000;
const SOURCE = 'https://github.com/labatt/speediance-mcp/blob/96efbb3da0fa9d903defecbd2f726ea1885ce12e/src/speediance_mcp/speediance/parsing.py#L148';

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function number(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim() !== '')) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}
function id(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}
function explicitId(action, fields) {
  const keys = fields.filter((field) => Object.hasOwn(action, field) && action[field] !== undefined && action[field] !== null);
  if (!keys.length) return { status: 'missing' };
  const values = keys.map((key) => id(action[key]));
  return values.includes(null) || new Set(values).size !== 1
    ? { status: 'invalid' } : { status: 'explicit', value: values[0], fields: keys };
}
function cleanText(value, limit = 160) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, limit) : undefined;
}

function reconcileScale(info, weightUnit) {
  const sessionCapacity = number(info.totalCapacity);
  let rawSetCapacitySum = 0;
  let count = 0;
  let complete = info.actionList.length > 0;
  for (const action of info.actionList) {
    if (!record(action) || !Array.isArray(action.setList) || !action.setList.length) { complete = false; continue; }
    for (const set of action.setList) {
      if (++count > MAX_CAPACITY_SETS) { complete = false; break; }
      const capacity = record(set) && record(set.summary) ? number(set.summary.totalCapacity) : null;
      if (capacity === null) complete = false;
      else rawSetCapacitySum += capacity;
    }
    if (count > MAX_CAPACITY_SETS) break;
  }
  complete = complete && Number.isFinite(rawSetCapacitySum);
  const base = {
    status: 'unknown', factor: null, capacityComplete: complete, tolerance: SCALE_TOLERANCE,
    ...(sessionCapacity === null ? {} : { sessionCapacity }),
    ...(complete ? { rawSetCapacitySum } : {}),
    source: SOURCE
  };
  if (!complete || !(sessionCapacity > 0) || !(rawSetCapacitySum > 0)) {
    return { ...base, reason: 'missing-incomplete-or-nonpositive-capacity' };
  }
  if (Math.abs(rawSetCapacitySum - sessionCapacity) <= SCALE_TOLERANCE * sessionCapacity) {
    return { ...base, status: 'matched-unscaled', factor: 1 };
  }
  if (Math.abs(rawSetCapacitySum / SCALE_FACTOR - sessionCapacity) <= SCALE_TOLERANCE * sessionCapacity) {
    // The pinned community source observed x2.2 on kg accounts, not lb.
    if (weightUnit === 'lb') return { ...base, reason: 'account-unit-scaling-conflict' };
    return { ...base, status: 'matched-2.2', factor: SCALE_FACTOR };
  }
  return { ...base, reason: 'capacity-scale-conflict' };
}

function safeResolution(resolution) {
  return {
    unit: resolution.unit, unitResolution: resolution.unitResolution,
    ...(resolution.unitWarning ? { unitWarning: resolution.unitWarning } : {}),
    unitEvidence: resolution.unitEvidence.slice(0, 24).map(({ field, source, interpretedUnit, issue }) => ({
      field, source, ...(interpretedUnit ? { interpretedUnit } : {}), ...(issue ? { issue } : {})
    }))
  };
}

/**
 * Normalize the documented CLI Free Lift {kind:'free',info:{actionList:[...]}}
 * summary shape. This is community-observed API decoding, not assessed strength.
 * summaryWeight is one reported set scalar; it is never per-rep telemetry.
 * No tonnage, e1RM, RIR, side-load multiplication or invented target dose.
 */
export function normalizeFreeLiftSummary(payload, { weightUnit = 'unknown' } = {}) {
  if (!['kg', 'lb', 'unknown'].includes(weightUnit)) throw new TypeError('weightUnit must be kg, lb or unknown.');
  if (!record(payload) || payload.kind !== 'free' || !record(payload.info) || !Array.isArray(payload.info.actionList)) return null;
  const actions = payload.info.actionList;
  if (!actions.some((action) => record(action) && Array.isArray(action.setList) && action.setList.some((set) => record(set) && record(set.summary)))) return null;
  const scaleReconciliation = reconcileScale(payload.info, weightUnit);
  const result = {
    format: 'free-lift-set-summary', weightUnit, scaleReconciliation,
    ...(number(payload.info.totalCapacity) === null ? {} : { totalApiCapacity: number(payload.info.totalCapacity) }),
    exercises: [], partial: false, omittedExerciseCount: 0, omittedSetCount: 0,
    diagnostics: [], provenance: {
      source: SOURCE, exerciseSource: 'info.actionList[]', setSource: 'info.actionList[].setList[].summary',
      weightSemantics: 'Reported summary scalar, not per-rep telemetry or assessed 1RM.',
      timeSemantics: 'summary.time is actual elapsed set time; no planned duration is inferred.',
      capacitySemantics: 'API capacity is retained as reported, not presented as verified lifted tonnage.'
    }
  };
  const diagnostic = (reason, path) => {
    result.partial = true;
    if (result.diagnostics.length < 100) result.diagnostics.push({ reason, ...(path ? { path } : {}) });
  };
  if (actions.length > MAX_ACTIONS) {
    result.omittedExerciseCount += actions.length - MAX_ACTIONS;
    diagnostic('action-limit-reached');
  }
  let setCount = 0;
  for (let actionIndex = 0; actionIndex < Math.min(actions.length, MAX_ACTIONS); actionIndex++) {
    const action = actions[actionIndex];
    const path = `$.info.actionList[${actionIndex}]`;
    if (!record(action) || !Array.isArray(action.setList)) {
      result.omittedExerciseCount++; diagnostic('invalid-free-lift-action', path); continue;
    }
    const group = explicitId(action, ['groupId', 'group_id', 'actionLibraryGroupId', 'action_library_group_id']);
    const variant = explicitId(action, ['actionLibraryId', 'action_library_id']);
    if (group.status !== 'explicit' || variant.status === 'invalid') {
      result.omittedExerciseCount++; diagnostic(group.status !== 'explicit' ? 'unverified-exercise-group-id' : 'invalid-exercise-variant-id', path); continue;
    }
    const limit = Math.min(action.setList.length, MAX_SETS_PER_ACTION, MAX_TOTAL_SETS - setCount);
    if (limit < action.setList.length) {
      result.omittedSetCount += action.setList.length - limit;
      diagnostic(setCount + limit >= MAX_TOTAL_SETS ? 'total-set-limit-reached' : 'action-set-limit-reached', path);
    }
    const sets = [];
    for (let index = 0; index < limit; index++) {
      const item = action.setList[index];
      const setPath = `${path}.setList[${index}].summary`;
      if (!record(item) || !record(item.summary)) {
        result.omittedSetCount++; diagnostic('invalid-free-lift-set-summary', setPath); continue;
      }
      const summary = item.summary;
      const resolution = safeResolution(resolveSetUnit({ records: [action, item, summary], setIndex: index, setCount: action.setList.length }));
      const done = number(summary.finishedCount);
      const seconds = number(summary.time);
      const rawWeight = number(summary.weight);
      const capacity = number(summary.totalCapacity);
      const set = {
        set: index + 1, path: setPath, ...resolution,
        ...(Number.isSafeInteger(done) && done <= 100_000 ? resolution.unit === 'reps' ? { reps: done } : { rawCount: done } : {}),
        ...(seconds !== null && seconds <= 86_400 ? { elapsedSeconds: seconds } : {}),
        ...(capacity !== null ? { apiCapacity: capacity } : {}),
        ...(rawWeight === null ? {} : {
          rawSummaryWeight: rawWeight,
          ...(scaleReconciliation.factor !== null ? { summaryWeight: rawWeight / scaleReconciliation.factor, scaleFactor: scaleReconciliation.factor } : {}),
          weightUnit: scaleReconciliation.factor === null ? 'unknown' : weightUnit,
          summaryWeightSource: {
            field: 'info.actionList[].setList[].summary.weight',
            semantics: 'reported-set-summary-scalar-not-per-rep-telemetry',
            reconciliationStatus: scaleReconciliation.status,
            ...(scaleReconciliation.factor === null ? {} : { scaleFactor: scaleReconciliation.factor }),
            capacitySources: ['info.totalCapacity', 'info.actionList[].setList[].summary.totalCapacity'],
            source: SOURCE
          }
        }),
        ...([1, 2].includes(number(summary.leftRight)) ? { side: number(summary.leftRight) } : {}),
        evidence: { groupIdFields: group.fields, countSource: 'summary.finishedCount', elapsedTimeSource: 'summary.time', perRepTelemetry: false }
      };
      if (resolution.unit === 'unknown') diagnostic('unresolved-completed-set-unit', setPath);
      if (resolution.unit === 'reps' && summary.finishedCount === undefined) diagnostic('missing-completed-count', setPath);
      if (resolution.unit === 'seconds' && summary.time === undefined) diagnostic('missing-elapsed-time', setPath);
      if (done !== null && (!Number.isSafeInteger(done) || done > 100_000)) diagnostic('invalid-completed-count', setPath);
      if (summary.finishedCount !== undefined && done === null) diagnostic('invalid-completed-count', setPath);
      if (summary.time !== undefined && (seconds === null || seconds > 86_400)) diagnostic('invalid-elapsed-time', setPath);
      if (summary.weight !== undefined && rawWeight === null) diagnostic('invalid-summary-weight', setPath);
      if (rawWeight > 0 && scaleReconciliation.factor === null) diagnostic('unresolved-summary-weight-scale', setPath);
      if (rawWeight > 0 && weightUnit === 'unknown') diagnostic('unknown-account-weight-unit', setPath);
      sets.push(set);
      setCount++;
    }
    if (!sets.length) { result.omittedExerciseCount++; diagnostic('no-normalized-free-lift-sets', path); continue; }
    result.exercises.push({
      exercise: cleanText(action.actionLibraryName) || `Exercise group ${group.value}`, path,
      groupId: group.value, ...(variant.status === 'explicit' ? { actionLibraryId: variant.value } : {}),
      sets, evidence: { groupIdFields: group.fields, variantScope: variant.status === 'explicit' ? 'explicit-variant' : 'group-only' }
    });
  }
  return result;
}
