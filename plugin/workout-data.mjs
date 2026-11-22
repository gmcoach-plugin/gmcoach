import { reportedCompletedSettingCodes } from './completed-setting-codes.mjs';
import { resolveSetUnit } from './unit-interpretation.mjs';
import { summarizeHistoryLiftedVolume } from './training-volume.mjs';
import { normalizeFreeLiftSummary } from './free-lift-data.mjs';
import { resolveReportedCablePeakLoad } from './cable-load-telemetry.mjs';
import { presentLoadChannels } from './load-channel-presentation.mjs';

const SERIES_FIELDS = ['finishedReps', 'finished_reps', 'setsAndReps', 'sets_and_reps', 'finishedCount', 'finished_count', 'reps', 'setReps', 'set_reps'];
const EXPLICIT_SECONDS_FIELDS = ['durationSeconds', 'duration_seconds', 'timeSeconds', 'time_seconds', 'seconds'];
const WEIGHT_FIELDS = ['weights', 'weightValues', 'weight_values'];
const MAX_VISITED_NODES = 50_000;

// Public history reference, not an official API specification:
// pookey/gm-summary @ 57f42f0e510a2199ceeb135f2ef59f6d7ca019a4,
// speediance.py/_parse_exercise. Preserve API reports, never infer a PR.
function reportedHistoryMetrics(exercise, weightUnit) {
  const flagFields = { weight: 'maxWeightPr', capacity: 'totalCapacityPr', oneRepMax: 'oneRepMaxPr' };
  const result = {};
  if (Object.values(flagFields).some(field => Object.hasOwn(exercise, field))) {
    result.reportedPersonalRecords = {
      source: 'completed-history API exercise fields', independentlyVerified: false,
      flags: Object.fromEntries(Object.entries(flagFields).map(([name, sourceField]) => {
        const present = Object.hasOwn(exercise, sourceField);
        const raw = exercise[sourceField];
        const recognized = present && (typeof raw === 'boolean' || raw === 0 || raw === 1);
        return [name, { sourceField, status: recognized ? 'reported' : 'unknown',
          ...(recognized ? { value: raw === true || raw === 1 } : { reason: present ? 'unsupported-flag-value' : 'missing-field' }),
          ...(present && (raw === null || ['string', 'number', 'boolean'].includes(typeof raw)) ? { rawValue: raw } : {}) }];
      }))
    };
  }
  if (Object.hasOwn(exercise, 'oneRepMax')) {
    const valid = typeof exercise.oneRepMax === 'number' && Number.isFinite(exercise.oneRepMax) && exercise.oneRepMax > 0;
    result.reportedOneRepMax = { sourceField: 'oneRepMax', status: valid ? 'reported' : 'unknown',
      ...(valid ? { value: exercise.oneRepMax } : { reason: 'invalid-reported-metric' }),
      unit: weightUnit, unitSource: 'resolved session/account context',
      assessedStrengthAnchor: false, latestAssessmentConfirmed: false, independentlyVerified: false };
  }
  return result;
}

function arrayValues(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return [value];
  if (typeof value === 'string' && value.trim()) return value.split(',').map((part) => part.trim());
  return [];
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value.finishedCount ?? value.finished_count ?? value.value
    : value;
  if (candidate === null || candidate === undefined || candidate === '') return null;
  if (typeof candidate !== 'number' && typeof candidate !== 'string') return null;
  if (typeof candidate === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(candidate.trim())) return null;
  const numeric = Number(candidate);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizedUnit(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (['sec', 'secs', 'second', 'seconds', 's', 'time', 'duration'].includes(text)) return 'seconds';
  if (['rep', 'reps', 'repetition', 'repetitions', 'count'].includes(text)) return 'reps';
  return null;
}

function normalizedWeightUnit(value) {
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (['kg', 'kgs', 'kilogram', 'kilograms', 'metric'].includes(text)) return 'kg';
    if (['lb', 'lbs', 'pound', 'pounds', 'imperial'].includes(text)) return 'lb';
    if (text === '0') return 'kg';
    if (text === '1') return 'lb';
    return null;
  }
  // Speediance's account setting uses 0=metric and 1=imperial.
  if (value === 0) return 'kg';
  if (value === 1) return 'lb';
  return null;
}
// Speediance's share view labels weightunit=1 as kg; the generic userinfo
// `unit` code uses the opposite convention. Keep field-specific decoding.
function accountFieldWeightUnit(value, field) {
  if (['weightUnit','weight_unit'].includes(field) && [0,1,'0','1'].includes(value)) return Number(value) === 1 ? 'kg' : 'lb';
  return normalizedWeightUnit(value);
}

function explicitDurationSeconds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  for (const key of EXPLICIT_SECONDS_FIELDS) {
    const seconds = numberValue(value[key]);
    if (Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 86_400) return seconds;
  }
  return null;
}

function elapsedSeconds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return numberValue(value.time ?? value.elapsedSeconds ?? value.elapsed_seconds);
}

function completedNumericFields(value) {
  const diagnostics = [];
  function select(fields, kind, integer) {
    const supplied = fields.filter(field => Object.hasOwn(value ?? {}, field));
    if (!supplied.length) return null;
    const values = supplied.map(field => ['number', 'string'].includes(typeof value[field]) ? numberValue(value[field]) : null);
    const malformed = values.some(number => number === null || number < 0 || (integer && !Number.isSafeInteger(number)));
    const conflict = !malformed && values.some(number => number !== values[0]);
    if (malformed || conflict) {
      diagnostics.push({ field: kind, sourceFields: supplied, status: 'unknown', reason: malformed ? 'malformed-supplied-alias' : 'conflicting-supplied-aliases' });
      return null;
    }
    return values[0];
  }
  const finishedCount = select(['finishedCount', 'finished_count'], 'completed-count', true);
  const targetCount = select(['targetCount', 'target_count'], 'target-count', true);
  const elapsed = select(['time', 'elapsedSeconds', 'elapsed_seconds'], 'elapsed-time', false);
  return { finishedCount, targetCount, elapsed, diagnostics };
}

function completedSetFields(finishedCount, targetCount, unit) {
  finishedCount = Number.isSafeInteger(finishedCount) && finishedCount >= 0 ? finishedCount : null;
  targetCount = Number.isSafeInteger(targetCount) && targetCount >= 0 ? targetCount : null;
  if (unit === 'reps') {
    return {
      ...(finishedCount !== null ? { reps: finishedCount } : {}),
      ...(targetCount !== null ? { targetCount } : {})
    };
  }
  return {
    ...(finishedCount !== null ? { rawCount: finishedCount } : {}),
    ...(targetCount !== null ? { rawTargetCount: targetCount } : {})
  };
}

function vitaCompletedFields(resolution, finishedCount, targetCount, elapsed) {
  if (resolution.completionKind !== 'vita-timed-reps') return {};
  return {
    ...(Number.isSafeInteger(finishedCount) && finishedCount >= 0 ? { achievedReps: finishedCount } : {}),
    ...(Number.isSafeInteger(targetCount) && targetCount > 0 && targetCount <= 86_400 ? { targetDurationSeconds: targetCount } : {}),
    ...(elapsed === 0 && finishedCount === 0 ? { executionStatus: 'skipped', elapsedSeconds: 0 } : {})
  };
}

function classifySetValue(value, parentRecord, setIndex, setCount, endpoint = 'finished-history') {
  const resolution = resolveSetUnit({ records: [parentRecord, value], setIndex, setCount, endpoint });
  const { unit } = resolution;

  const isCompletedSetRecord = value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.hasOwn(value, 'finishedCount') || Object.hasOwn(value, 'finished_count'));
  if (isCompletedSetRecord && endpoint !== 'finished-history') {
    // A counter-shaped object inside a planned array is not a completed record.
    const fields = completedNumericFields(value);
    return { set: setIndex + 1, ...completedSetFields(fields.finishedCount, fields.targetCount, 'unknown'), ...(fields.diagnostics.length ? { completedNumericDiagnostics: fields.diagnostics } : {}), ...resolution, completedResultEstablished: false };
  }
  if (isCompletedSetRecord) {
    const { finishedCount, targetCount, elapsed, diagnostics } = completedNumericFields(value);
    const doseSeconds = unit === 'seconds' ? explicitDurationSeconds(value) : null;

    return {
      set: setIndex + 1,
      ...(diagnostics.length ? { completedNumericDiagnostics: diagnostics } : {}),
      ...completedSetFields(finishedCount, targetCount, unit),
      ...vitaCompletedFields(resolution, finishedCount, targetCount, elapsed),
      ...(elapsed !== null && elapsed >= 0 ? { elapsedSeconds: elapsed } : {}),
      ...(doseSeconds === null ? {} : { durationSeconds: doseSeconds }),
      ...resolution
    };
  }

  const numericValue = numberValue(value);

  if (unit === 'seconds' && Number.isSafeInteger(numericValue) && numericValue >= 1 && numericValue <= 86_400) {
    return { set: setIndex + 1, durationSeconds: numericValue, ...resolution };
  }
  if (unit === 'reps' && Number.isSafeInteger(numericValue) && numericValue >= 0 && numericValue <= 100_000) {
    return { set: setIndex + 1, reps: numericValue, ...resolution };
  }
  return { set: setIndex + 1, unit, rawValue: value, ...resolution };
}

function explicitObjectLabel(value) {
  for (const key of ['actionLibraryName', 'exerciseName', 'exercise_name', 'actionName', 'action_name', 'title', 'name']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
  }
  return null;
}

function objectLabel(value) {
  const label = explicitObjectLabel(value);
  if (label) return label;
  const fields = ['groupId', 'group_id', 'exerciseId', 'exercise_id', 'actionLibraryGroupId', 'action_library_group_id'];
  const values = fields.filter(key => value[key] !== undefined).map(key => {
    const id = value[key];
    return typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id)) ? Number(id) : NaN;
  });
  return values.length && values.every(id => Number.isSafeInteger(id) && id > 0 && id === values[0]) ? `Ćwiczenie ID ${values[0]}` : 'Ćwiczenie';
}

function finiteNumbers(value) {
  const values = arrayValues(value);
  const parsed = values.map(item => typeof item === 'number' || typeof item === 'string' ? numberValue(item) : null);
  return parsed.some(item => item === null || item < 0) ? [] : parsed;
}

function reportedCompletedSide(set, path) {
  const scopes = [{ value: set, path },
    { value: set?.trainingInfoDetail, path: `${path}.trainingInfoDetail` },
    { value: set?.training_info_detail, path: `${path}.training_info_detail` }];
  const evidence = scopes.filter(({ value }) => value && typeof value === 'object' && Object.hasOwn(value, 'leftRight'))
    .map(({ value, path }) => ({ sourcePath: `${path}.leftRight`, rawValue: value.leftRight }));
  if (!evidence.length) return {};
  const present = evidence.filter(({ rawValue }) => rawValue !== null && rawValue !== undefined && rawValue !== '');
  const codes = present.map(({ rawValue }) => typeof rawValue === 'number' || typeof rawValue === 'string' && /^\d+$/.test(rawValue) ? Number(rawValue) : NaN);
  const valid = codes.length > 0 && codes.every(value => [0, 1, 2].includes(value)) && new Set(codes).size === 1;
  if (valid) return { side: codes[0], sideLabel: ['obustronnie', 'lewa', 'prawa'][codes[0]] };
  const boundedEvidence = evidence.map(({ sourcePath, rawValue }) => {
    if (rawValue === null || typeof rawValue === 'number' && Number.isFinite(rawValue) && Math.abs(rawValue) <= 2147483648 || typeof rawValue === 'string' && rawValue.length <= 16 && /^(?:-?\d+(?:\.\d+)?|Infinity|NaN)?$/.test(rawValue)) return { sourcePath, rawValue };
    return { sourcePath, valueType: Array.isArray(rawValue) ? 'array' : typeof rawValue,
      reason: 'unsupported-or-unbounded-side-value', ...(typeof rawValue === 'string' || Array.isArray(rawValue) ? { length: rawValue.length } : {}) };
  });
  return { reportedSide: { status: present.length ? 'invalid-or-conflicting' : 'unavailable', evidence: boundedEvidence } };
}

function loadValuesForSet(value) {
  const detail = value && typeof value === 'object'
    ? value.trainingInfoDetail ?? value.training_info_detail ?? value
    : null;
  if (!detail || typeof detail !== 'object') return [];
  for (const key of WEIGHT_FIELDS) {
    if (detail[key] !== undefined) return finiteNumbers(detail[key]);
  }
  return [];
}

// With cable-side telemetry the aggregate weights channel may contain derived
// force spikes, not resistance. Invalid/nonempty side evidence must not fall
// back to a plausible aggregate load either. Keep raw channels in the original
// response; the independent cable peak resolver owns their interpreted display.
function hasReportedCableSideTelemetry(set) {
  return [set, set?.trainingInfoDetail, set?.training_info_detail].some(record => record && typeof record === 'object' &&
    ['leftWeights', 'rightWeights', 'left_weights', 'right_weights'].some(key => {
      const value = record[key];
      return value !== undefined && value !== null && value !== '' &&
        !(Array.isArray(value) && value.length === 0);
    }));
}

// Display filtering must not erase malformed evidence before volume validation.
// Ordered reported samples, not performed repetitions or machine resistance proof.
// reference client’s public history renderer preserves consecutive weights; retain raw channel
// provenance without its capacity/reps fallback or assumed cable-to-total conversion.
function reportedLoadSequences(set, setPath, weightUnit) {
  const sources = [[set, setPath], [set?.trainingInfoDetail, `${setPath}.trainingInfoDetail`], [set?.training_info_detail, `${setPath}.training_info_detail`]];
  const sideEvidence = hasReportedCableSideTelemetry(set);
  const sequences = [];
  for (const [record, path] of sources) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    for (const field of [...WEIGHT_FIELDS, 'leftWeights', 'rightWeights', 'left_weights', 'right_weights']) {
      if (!Object.hasOwn(record, field)) continue;
      const aggregate = WEIGHT_FIELDS.includes(field);
      const channel = aggregate ? 'aggregate-weights' : /^left/.test(field) ? 'left-cable' : 'right-cable';
      const row = {sourcePath:`${path}.${field}`,channel,unit:weightUnit.unit,unitSource:weightUnit.source,
        semantics:'reported-ordered-samples',sampleToRepetitionMapping:'unverified',complete:false,
        automaticApplication:false,source:'https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/4e12bc6108f43c2705e935aa3d5db563cb8a3c06/templates/history.html#L354'};
      if (aggregate && sideEvidence) { sequences.push({...row,status:'suppressed',reason:'side-telemetry-present-aggregate-may-be-derived'}); continue; }
      const raw = record[field];
      let values, truncated = false;
      if (Array.isArray(raw)) { truncated=raw.length>200; values=raw.slice(0,200); }
      else if (typeof raw === 'string') {
        // Do not cut inside a CSV token and turn a partial value into a sample.
        let text=raw;
        if(text.length>4000){text=text.slice(0,4000);const last=text.lastIndexOf(',');text=last<0?'':text.slice(0,last);truncated=true;}
        values=text.split(',');if(values.length>200){values=values.slice(0,200);truncated=true;}
      } else { sequences.push({...row,status:'invalid',reason:'unsupported-sample-container'}); continue; }
      if(!values.length || values.some(v=>!(typeof v==='number'&&Number.isFinite(v)&&v>=0 || typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0))){sequences.push({...row,status:'invalid',reason:'invalid-or-empty-samples',truncated});continue;}
      const samples=values.map(Number), segments=[];
      for(let index=0;index<samples.length;index++){
        const value=samples[index],last=segments[segments.length-1];
        if(last&&last.value===value)last.sampleCount++;
        else segments.push({value,sampleCount:1,startSampleIndex:index});
      }
      sequences.push({...row,status:'reported',samples,segments,reportedSampleCount:samples.length,complete:!truncated,truncated,
        firstReportedSample:samples[0],lastReportedSample:samples[samples.length-1],
        observedSampleSummary:{scope:truncated?'accepted-prefix-only':'accepted-samples',sampleCount:samples.length,
          distinctReportedValueCount:new Set(samples).size,consecutiveSegmentCount:segments.length,
          upwardTransitionCount:segments.slice(1).filter((segment,index)=>segment.value>segments[index].value).length,
          downwardTransitionCount:segments.slice(1).filter((segment,index)=>segment.value<segments[index].value).length,
          constantReportedSamples:segments.length===1,minimumReportedSample:Math.min(...samples),maximumReportedSample:Math.max(...samples),
          sampleToRepetitionMapping:'unverified',workingLoadInferred:false,dropSetInferred:false}});
    }
  }
  return sequences.length ? {reportedLoadSequences:sequences} : {};
}

function rawVolumeWeightsForSet(value) {
  const detail = value?.trainingInfoDetail ?? value?.training_info_detail ?? value;
  if (!detail || typeof detail !== 'object') return undefined;
  for (const key of WEIGHT_FIELDS) {
    const raw = detail[key];
    if (raw === undefined) continue;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') return raw.split(',').map(part => {
      const token = part.trim();
      return token !== '' && Number.isFinite(Number(token)) ? Number(token) : token;
    });
    return raw;
  }
  return undefined;
}

function collectExerciseRecords(value, path = '$', results = [], depth = 0, budget = { visited: 0 }) {
  if (!value || typeof value !== 'object' || depth > 20 || budget.visited++ > MAX_VISITED_NODES) return results;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectExerciseRecords(item, `${path}[${index}]`, results, depth + 1, budget));
    return results;
  }
  const entries = Object.entries(value);
  const completedEntries = entries.filter(([key, child]) => ['finishedReps', 'finished_reps'].includes(key) && Array.isArray(child));
  if (completedEntries.length > 1) {
    results.completedFieldDiagnostics ??= [];
    if (results.completedFieldDiagnostics.length < 100) results.completedFieldDiagnostics.push({path, reason: 'multiple-completed-series-fields; set-association-unresolved'});
  }
  const setsEntry = completedEntries.length === 1 ? completedEntries[0] : null;
  if (setsEntry) {
    results.push({ exercise: value, path, setsField: setsEntry[0], sets: setsEntry[1] });
  }
  for (const [key, child] of entries) collectExerciseRecords(child, `${path}.${key}`, results, depth + 1, budget);
  return results;
}

const ACCOUNT_UNIT_SCOPES = ['account', 'user', 'userinfo', 'userInfo', 'profile', 'data', 'result'];
const EXPLICIT_WEIGHT_UNIT_FIELDS = ['displayWeightUnit', 'display_weight_unit', 'weightUnit', 'weight_unit', 'displayUnit', 'display_unit'];

function unitFromAccountScope(scope, allowGenericUnit = false) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return null;
  for (const key of EXPLICIT_WEIGHT_UNIT_FIELDS) {
    if (scope[key] !== undefined) {
      const found = accountFieldWeightUnit(scope[key],key);
      if (found) return { unit: found, source: key };
    }
  }
  if (allowGenericUnit && scope.unit !== undefined) {
    const found = normalizedWeightUnit(scope.unit);
    if (found) return { unit: found, source: 'unit' };
  }
  return null;
}

function knownWeightUnit(root, suppliedUnit) {
  const candidates = [], queue = [{ value: root, accountScope: false }], seen = new Set();
  const supplied = normalizedWeightUnit(suppliedUnit);
  if (supplied) candidates.push({ unit: supplied, source: 'profile' });
  else if (suppliedUnit !== undefined && suppliedUnit !== null && String(suppliedUnit).trim() !== '' && suppliedUnit !== 'unknown') return { unit: 'unknown', source: 'invalid-supplied-weight-unit' };
  let visited = 0, invalid = false;
  while (queue.length) {
    if (++visited > 100) return { unit: 'unknown', source: 'session-weight-unit-resource-bound' };
    const { value, accountScope } = queue.shift();
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (accountScope) return { unit: 'unknown', source: 'invalid-session-weight-unit-scope' };
      if (seen.has(value)) continue;
      seen.add(value);
      // Payload collections are not account objects. Inspect explicit weight
      // aliases on contained objects, never generic dose unit in their rows.
      for (const child of value) if (child && typeof child === 'object') queue.push({ value: child, accountScope: false });
      continue;
    }
    if (typeof value !== 'object') return { unit: 'unknown', source: 'invalid-session-weight-unit-scope' };
    if (seen.has(value)) continue;
    seen.add(value);
    for (const field of [...EXPLICIT_WEIGHT_UNIT_FIELDS, ...(accountScope ? ['unit'] : [])]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor) continue;
      if (!Object.hasOwn(descriptor, 'value')) { invalid = true; continue; }
      const raw = descriptor.value;
      if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) continue;
      const unit = accountFieldWeightUnit(raw,field);
      if (!unit) invalid = true;
      else candidates.push({ unit, source: field });
    }
    for (const key of ['account', 'user', 'userinfo', 'userInfo', 'profile', 'data', 'result', 'info']) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) continue;
      if (!Object.hasOwn(descriptor, 'value')) { invalid = true; continue; }
      queue.push({ value: descriptor.value, accountScope: accountScope || ['account','user','userinfo','userInfo','profile'].includes(key) });
    }
  }
  if (invalid) return { unit: 'unknown', source: 'invalid-explicit-session-weight-unit' };
  if (new Set(candidates.map(row => row.unit)).size > 1) return { unit: 'unknown', source: 'conflicting-explicit-session-weight-unit-context' };
  return candidates[0] ?? { unit: 'unknown', source: 'unknown' };
}

/** Inspect only one recognized account object scope at a time. No cross-endpoint
 * precedence is inferred; conflicting recognized aliases remain unknown. */
export function inspectAccountWeightUnit(accountInfo) {
 const fields=[...EXPLICIT_WEIGHT_UNIT_FIELDS,'unit'];
 const queue=[{value:accountInfo,path:'$'}],seen=new Set();let visited=0;
 const own=(value,key)=>{const d=Object.getOwnPropertyDescriptor(value,key);return d&&Object.hasOwn(d,'value')?d.value:undefined;};
 while(queue.length&&visited++<100){
  const {value:scope,path}=queue.shift();
  if(!scope||typeof scope!=='object'||Array.isArray(scope)||![Object.prototype,null].includes(Object.getPrototypeOf(scope))||seen.has(scope))continue;
  seen.add(scope);const candidates=[];
  for(const field of fields){
   const raw=own(scope,field);
   const unit=accountFieldWeightUnit(raw,field);
   if(unit)candidates.push({field,unit,...([0,1,'0','1'].includes(raw)?{rawCode:Number(raw)}:{})});
  }
  if(candidates.length){const conflict=new Set(candidates.map(row=>row.unit)).size>1;
   return {unit:conflict?'unknown':candidates[0].unit,status:conflict?'conflicting-recognized-account-unit-fields':'known',scopePath:path,candidates};}
  for(const key of ACCOUNT_UNIT_SCOPES){const child=own(scope,key);if(child&&typeof child==='object')queue.push({value:child,path:`${path}.${key}`});}
 }
 return {unit:'unknown',status:queue.length?'account-unit-resource-bound':'not-reported',candidates:[]};
}
/** Extract current account unit; recognized same-scope disagreement is unknown. */
export function extractAccountWeightUnit(accountInfo) {return inspectAccountWeightUnit(accountInfo).unit;}

function explicitApiCapacity(root) {
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
  const keys = ['totalCapacity', 'total_capacity', 'totalVolume', 'total_volume'];
  for (const key of keys) {
    const value = numberValue(root[key]);
    if (value !== null && value >= 0) return value;
  }
  for (const key of ['session', 'summary', 'workout', 'training']) {
    const nested = root[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const value = explicitApiCapacity(nested);
      if (value !== null) return value;
    }
  }
  return null;
}

function annotateSessionWork(root, suppliedWeightUnit, loadDisplayPreferences = {}) {
  const records = collectExerciseRecords(root);
  const weightUnit = knownWeightUnit(root, suppliedWeightUnit);
  const free = normalizeFreeLiftSummary(root, { weightUnit: weightUnit.unit });
  // Summary weights must never be expanded into invented per-repetition telemetry.
  if (!records.length) {
    if (records.completedFieldDiagnostics?.length) return { ...(free ?? {exercises: []}), weightUnitSource: weightUnit.source, partial: true, completedFieldDiagnostics: records.completedFieldDiagnostics };
    return free ? { ...free, weightUnitSource: weightUnit.source } : null;
  }
  const historyVolume = summarizeHistoryLiftedVolume(records.map(({ exercise, sets }) => ({
    ...exercise,
    finishedReps: sets.map((set, setIndex) => {
      const resolution = resolveSetUnit({ records: [exercise, set], setIndex, setCount: sets.length, endpoint: 'finished-history' });
      const detail = set?.trainingInfoDetail ?? set?.training_info_detail;
      return {
        ...set,
        ...resolution,
        finishedCount: completedNumericFields(set).diagnostics.length ? null : completedNumericFields(set).finishedCount,
        capacity: numberValue(set?.capacity),
        trainingInfoDetail: {
          ...(detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : {}),
          weights: rawVolumeWeightsForSet(set)
        }
      };
    })
  })), weightUnit.unit);
  let calculatedFrom = 'unavailable';
  const exercises = records.map(({ exercise, path, setsField, sets }, exerciseIndex) => {
    const parsedSets = sets.map((set, index) => {
      const weights = loadValuesForSet(set);
      const reportedSettingCodes = reportedCompletedSettingCodes(set, `${path}.${setsField}[${index}]`);
      const capacity = numberValue(set?.capacity ?? set?.totalCapacity ?? set?.total_capacity);
      const resolution = resolveSetUnit({ records: [exercise, set], setIndex: index, setCount: sets.length, endpoint: 'finished-history' });
      const { unit } = resolution;
      const { finishedCount, targetCount, elapsed, diagnostics } = completedNumericFields(set);
      const countInvalid = (Object.hasOwn(set ?? {}, 'finishedCount') || Object.hasOwn(set ?? {}, 'finished_count')) && !(Number.isSafeInteger(finishedCount) && finishedCount >= 0);
      const volumeSet = historyVolume.exercises[exerciseIndex]?.sets[index];

      const doseSeconds = unit === 'seconds' ? explicitDurationSeconds(set) : null;
      const loadSequences = reportedLoadSequences(set, `${path}.${setsField}[${index}]`, weightUnit);
      const displayPreference = loadDisplayPreferences[String(exercise.groupId ?? exercise.id)] ?? 'per-side';
      const actualWork = {
        ...completedSetFields(finishedCount, targetCount, unit),
        ...vitaCompletedFields(resolution, finishedCount, targetCount, elapsed),
        ...(doseSeconds === null ? {} : { durationSeconds: doseSeconds })
      };
      return {
        set: index + 1,
        ...(diagnostics.length ? { completedNumericDiagnostics: diagnostics } : {}),
        ...(reportedSettingCodes ? { reportedSettingCodes } : {}),
        ...resolveReportedCablePeakLoad(set, { weightUnit: weightUnit.unit }),
        ...loadSequences,
        ...(loadSequences.reportedLoadSequences ? { loadChannelPresentation: presentLoadChannels(loadSequences.reportedLoadSequences, { preference: displayPreference }) } : {}),
        ...actualWork,
        ...(countInvalid ? { completedCountStatus: 'invalid-or-unavailable' } : {}),
        ...resolution,
        ...(elapsed !== null && elapsed >= 0 ? { elapsedSeconds: elapsed } : {}),
        ...(weights.length && !hasReportedCableSideTelemetry(set) ? {
          weightMin: Math.min(...weights),
          weightMax: Math.max(...weights),
          weightUnit: weightUnit.unit
        } : {}),
        ...(capacity !== null && capacity >= 0 ? { apiCapacity: capacity } : {}),
        ...(volumeSet?.status === 'measured' ? {
          liftedVolume: volumeSet.liftedVolume,
          liftedVolumeUnit: volumeSet.liftedVolumeUnit,
          inferredLoadPoints: volumeSet.loadPoints,
          liftedVolumeSource: volumeSet.provenance
        } : volumeSet?.status === 'unknown' ? {
          liftedVolumeStatus: 'unknown',
          liftedVolumeReason: volumeSet.reason
        } : {}),
        ...reportedCompletedSide(set, `${path}.${setsField}[${index}]`)
      };
    });
    const ownCapacity = numberValue(exercise.totalCapacity ?? exercise.total_capacity ?? exercise.capacity);
    const setCapacities = parsedSets.map((set) => set.apiCapacity).filter((value) => Number.isFinite(value));
    const apiCapacity = ownCapacity !== null && ownCapacity >= 0
      ? ownCapacity
      : setCapacities.length === parsedSets.length && setCapacities.length > 0
        ? setCapacities.reduce((sum, value) => sum + value, 0)
        : null;
    if (apiCapacity !== null) calculatedFrom = 'Speediance capacity';
    return {
      exercise: objectLabel(exercise),
      path,
      ...reportedHistoryMetrics(exercise, weightUnit.unit),
      reportedActionRating: {
        sourcePath:`${path}.actionRating`,source:'https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/4e12bc6108f43c2705e935aa3d5db563cb8a3c06/templates/history.html#L296',
        status:!Object.hasOwn(exercise,'actionRating')?'missing':typeof exercise.actionRating==='number'&&Number.isFinite(exercise.actionRating)?'reported':'invalid',
        ...(typeof exercise.actionRating==='number'&&Number.isFinite(exercise.actionRating)?{value:exercise.actionRating}:{}),
        semantics:'Speediance-reported-rating-meaning-unverified',scale:'unverified',unit:'unknown',
        scientificInterpretation:false,recoveryReadinessInferred:false,
        note:'reference client renders positive values with Math.min/Math.max against five stars; that UI operation does not establish the endpoint scale, valid range, or clinical/training meaning. No clamping or inference.'
      },
      ...(typeof exercise.isLeftRight === 'boolean' ? { isUnilateral: exercise.isLeftRight, isUnilateralStatus: 'reported-boolean' } : exercise.isLeftRight === undefined ? {} : { isUnilateralStatus: 'unknown' }),
      ...(typeof exercise.isBarbell === 'boolean' ? { isBarbell: exercise.isBarbell, isBarbellStatus: 'reported-boolean' } : exercise.isBarbell === undefined ? {} : { isBarbellStatus: 'unknown' }),
      sets: parsedSets,
      ...(apiCapacity !== null ? { apiCapacity } : {})
    };
  });
  const completedNumericDiagnostics = exercises.flatMap(exercise => exercise.sets.flatMap(set => (set.completedNumericDiagnostics ?? []).map(diagnostic => ({ path: exercise.path, set: set.set, ...diagnostic })))).slice(0, 100);
  const topLevelCapacity = explicitApiCapacity(root);
  const exerciseCapacities = exercises.map((exercise) => exercise.apiCapacity);
  const aggregateCapacity = topLevelCapacity !== null
    ? topLevelCapacity
    : exerciseCapacities.length > 0 && exerciseCapacities.every((value) => Number.isFinite(value))
      ? exerciseCapacities.reduce((sum, value) => sum + value, 0)
      : null;
  if (topLevelCapacity !== null) calculatedFrom = 'Speediance totalCapacity';
  const summary = {
    ...(records.completedFieldDiagnostics?.length ? { partial: true, completedFieldDiagnostics: records.completedFieldDiagnostics } : {}),
    ...(completedNumericDiagnostics.length ? { partial: true, completedNumericDiagnostics } : {}),
    weightUnit: weightUnit.unit,
    weightUnitSource: weightUnit.source,
    ...(aggregateCapacity !== null ? { totalApiCapacity: aggregateCapacity } : {}),
    ...(aggregateCapacity !== null ? { apiCapacitySource: calculatedFrom } : {}),
    ...(historyVolume.complete ? {
      totalLiftedVolume: historyVolume.totalLiftedVolume,
      totalLiftedVolumeUnit: historyVolume.totalLiftedVolumeUnit,
      liftedVolumeSource: historyVolume.provenance,
      liftedVolumeCoverage: 'wszystkie serie z dodatnim dowodem obciążenia w historii zakończonego treningu'
    } : {
      liftedVolumeStatus: 'incomplete-or-ambiguous',
      unknownLoadedSetCount: historyVolume.unknownLoadedSetCount,
      liftedVolumeReason: historyVolume.reason,
      liftedVolumeSource: historyVolume.provenance
    }),
    exercises,
    note: 'totalApiCapacity pozostaje surową wartością Speediance i sama nie jest kilogramami ani tonażem. totalLiftedVolume (kg·powt. lub lb·powt.) jest wyliczane wyłącznie z ukończonych serii historii z jawnie rozpoznaną jednostką, znaną jednostką konta, wagą z każdego powtórzenia oraz pojemnością historii, której stosunek do sumy wag wyraźnie wskazuje 1 albo 2 punkty obciążenia i jest spójny w ćwiczeniu. Przy niepełnych lub niejednoznacznych danych suma jest pomijana. To heurystyka oparta na nieoficjalnych, reverse-engineered przykładach, a nie oficjalny kontrakt Speediance.'
  };
  if (!free) return summary;
  const identity = (value) => {
    const groupFields = ['groupId', 'group_id', 'actionLibraryGroupId', 'action_library_group_id'];
    const variantFields = ['actionLibraryId', 'action_library_id'];
    const read = (fields) => {
      const values = fields.filter(key => value?.[key] != null).map(key =>
        typeof value[key] === 'number' || (typeof value[key] === 'string' && /^\d+$/.test(value[key])) ? Number(value[key]) : NaN);
      return values.length && values.every(id => Number.isSafeInteger(id) && id > 0 && id === values[0]) ? values[0] : null;
    };
    return { group: read(groupFields), variant: read(variantFields) };
  };
  const actions = root?.info?.actionList || [];
  let ambiguousOverlap = false;
  let deduplicatedExerciseCount = 0;
  let ambiguousExerciseCount = 0;
  let ambiguousSetCount = 0;
  const sameIdentity = (left, right) => left.group !== null && left.group === right.group && left.variant === right.variant;
  // Call-local index: preserve Array.find first-match semantics, never cache session/account data.
  const completedDetailsByPath = new Map();
  for (const exercise of summary.exercises) if (!completedDetailsByPath.has(exercise.path)) completedDetailsByPath.set(exercise.path, exercise);
  const completeSetEquivalence = (freeExercise, completedRecord) => {
    const detail = completedDetailsByPath.get(completedRecord.path);
    if (!detail || detail.sets.length !== freeExercise.sets.length) return false;
    return freeExercise.sets.every((set, index) => {
      const other = detail.sets[index];
      const count = set.unit === 'reps' ? set.reps : set.elapsedSeconds;
      const otherCount = other.unit === 'reps' ? other.reps : other.elapsedSeconds;
      const weights = loadValuesForSet(completedRecord.sets[index]);
      return ['reps', 'seconds'].includes(set.unit) && set.unit === other.unit &&
        Number.isFinite(count) && count === otherCount &&
        Number.isFinite(set.elapsedSeconds) && set.elapsedSeconds === other.elapsedSeconds &&
        Number.isFinite(set.apiCapacity) && set.apiCapacity === other.apiCapacity &&
        Number.isFinite(set.summaryWeight) && set.weightUnit !== 'unknown' && set.weightUnit === other.weightUnit &&
        weights.length > 0 && weights.every(weight => weight === set.summaryWeight) &&
        set.side === other.side;
    });
  };
  const additional = (free.exercises || []).filter(exercise => {
    const index = /^\$\.info\.actionList\[(\d+)\]$/.exec(exercise.path)?.[1];
    const raw = index === undefined ? null : actions[Number(index)];
    const id = identity(raw);
    const sameAction = records.find(record => record.exercise === raw || record.path === exercise.path);
    if (sameAction) {
      if (completeSetEquivalence(exercise, sameAction)) deduplicatedExerciseCount++;
      else {
        ambiguousOverlap = true;
        ambiguousExerciseCount++;
        ambiguousSetCount += exercise.sets?.length || 0;
      }
      return false;
    }
    const overlapping = records.filter(record => {
      const other = identity(record.exercise);
      return id.group !== null && id.group === other.group &&
        (id.variant === other.variant || id.variant === null || other.variant === null);
    });
    if (!overlapping.length) return true;
    const matchingActions = actions.filter(action => sameIdentity(id, identity(action)));
    if (overlapping.length === 1 && matchingActions.length === 1 && sameIdentity(id, identity(overlapping[0].exercise)) &&
      completeSetEquivalence(exercise, overlapping[0])) {
      // Read-only name recovery uses the already proven association, never a guessed ID/name lookup.
      const reportedName = raw?.actionLibraryName;
      if (id.variant !== null && !explicitObjectLabel(overlapping[0].exercise) &&
        typeof reportedName === 'string' && reportedName.trim() && reportedName.length <= 200 &&
        !/[\u0000-\u001f\u007f]/.test(reportedName)) {
        const detail = completedDetailsByPath.get(overlapping[0].path);
        detail.exercise = reportedName.trim();
        detail.exerciseNameSource = { sourcePath: `${exercise.path}.actionLibraryName`, association: 'unique-group-variant-and-complete-set-equivalence', scope: 'reported-read-only' };
      }
      deduplicatedExerciseCount++; return false;
    }
    ambiguousOverlap = true;
    ambiguousExerciseCount++;
    ambiguousSetCount += exercise.sets?.length || 0;
    return false;
  });
  if (additional.length || ambiguousOverlap) {
    summary.exercises.push(...additional);
    delete summary.totalLiftedVolume;
    delete summary.totalLiftedVolumeUnit;
    delete summary.liftedVolumeCoverage;
    summary.liftedVolumeStatus = 'incomplete-or-ambiguous';
    summary.liftedVolumeReason = 'Free Lift scalar summary loads are not verified per-repetition telemetry.';
  }
  summary.freeLiftSummaryCoverage = {
    mergedExerciseCount: additional.length,
    deduplicatedExerciseCount,
    partial: free.partial === true || ambiguousOverlap,
    omittedExerciseCount: (free.omittedExerciseCount || 0) + ambiguousExerciseCount,
    omittedSetCount: (free.omittedSetCount || 0) + ambiguousSetCount
  };
  summary.scaleReconciliation = free.scaleReconciliation;
  if (free.partial === true || ambiguousOverlap) summary.partial = true;
  if (ambiguousOverlap) summary.freeLiftSummaryCoverage.warning = 'Ambiguous overlapping summary actions omitted: unique identity and complete set equivalence were not established.';
  return summary;
}

function scanSeriesUnits(value, path = '$', results = [], depth = 0, budget = { visited: 0 }) {
  if (!value || typeof value !== 'object' || depth > 20 || budget.visited++ > MAX_VISITED_NODES) return results;
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSeriesUnits(item, `${path}[${index}]`, results, depth + 1, budget));
    return results;
  }
  const entries = Object.entries(value);
  const completedEntries = entries.filter(([key, child]) => ['finishedReps', 'finished_reps'].includes(key) && Array.isArray(child));
  if (completedEntries.length > 1) {
    results.completedFieldDiagnostics ??= [];
    if (results.completedFieldDiagnostics.length < 100) results.completedFieldDiagnostics.push({ path, reason: 'multiple-completed-series-fields; set-association-unresolved' });
    // An ambiguous exercise subtree cannot independently reconstitute selected completed sets.
    return results;
  }
  const getField = (keys) => {
    const entry = entries.find(([key]) => keys.includes(key));
    if (!entry) return null;
    const parsed = arrayValues(entry[1]);
    parsed.fieldName = entry[0];
    return parsed;
  };
  const isSetRecord = entries.some(([key]) => ['finishedCount', 'finished_count', 'trainingInfoDetail', 'training_info_detail'].includes(key));
  const completedEntry = completedEntries[0];
  const values = completedEntry ? completedEntry[1] : isSetRecord ? null : getField(SERIES_FIELDS.filter(key => !['finishedReps', 'finished_reps', 'finishedCount', 'finished_count'].includes(key)));
  const sourceScope = completedEntry ? 'completed-history' : 'planned-or-returned-dose; completion-not-established';
  const sourceField = completedEntry?.[0] ?? values?.fieldName;
  const sets = values ? values.map((item, index) => classifySetValue(item, value, index, values.length, completedEntry ? 'finished-history' : 'generic')) : [];
  const explicitSeconds = [];
  if (!sets.length && !completedEntry) {
    for (const [key, rawValue] of entries) {
      if (!EXPLICIT_SECONDS_FIELDS.includes(key)) continue;
      for (const value of arrayValues(rawValue)) {
        const seconds = typeof value === 'number' ? value : Number(value);
        if (Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 86_400) {
          explicitSeconds.push({ set: explicitSeconds.length + 1, durationSeconds: seconds, unit: 'seconds', unitResolution: 'explicit-duration-field', unitEvidence: [{ field: key, source: `explicit-duration:${key}`, rawValue: value }] });
        }
      }
    }
  }
  if (sets.length || explicitSeconds.length) results.push({ exercise: objectLabel(value), path, sourceScope, ...(sourceField ? { sourceField } : {}), completedResultEstablished: Boolean(completedEntry), sets: [...sets, ...explicitSeconds] });
  for (const [key, child] of entries) {
    // Completed set objects were classified with their parent context already.
    if (completedEntry && (SERIES_FIELDS.includes(key) || EXPLICIT_SECONDS_FIELDS.includes(key))) continue;
    scanSeriesUnits(child, `${path}.${key}`, results, depth + 1, budget);
  }
  return results;
}

/** Keep the original CLI JSON and add reliable interpretations where Speediance exposes their fields. */
export function annotateTimedWorkoutOutput(rawOutput, { displayUnit, loadDisplayPreferences } = {}) {
  if (typeof rawOutput !== 'string' || !rawOutput.trim()) return rawOutput;
  let data;
  try { data = JSON.parse(rawOutput); }
  catch { return rawOutput; }
  if (!data || typeof data !== 'object') return rawOutput;

  const series = scanSeriesUnits(data);
  const completedNumericDiagnostics = series.flatMap(row => row.sets.flatMap(set => (set.completedNumericDiagnostics ?? []).map(diagnostic => ({ path: row.path, set: set.set, ...diagnostic })))).slice(0, 100);
  const result = Array.isArray(data) ? { sessions: data } : { ...data };
  if (series.length || series.completedFieldDiagnostics?.length) {
    const timedExercises = series.flatMap(({ exercise, path, sourceScope, sourceField, completedResultEstablished, sets }) => {
      const timedSets = sets.filter((set) => set.unit === 'seconds' && set.durationSeconds !== undefined);
      return timedSets.length ? [{ exercise, path, sourceScope, ...(sourceField ? { sourceField } : {}), completedResultEstablished, sets: timedSets }] : [];
    });
    result.gmCoachTimeInterpretation = {
      series,
      timedExercises,
      ...(completedNumericDiagnostics.length ? { partial: true, completedNumericDiagnostics } : {}),
      ...(series.completedFieldDiagnostics?.length ? { partial: true, completedFieldDiagnostics: series.completedFieldDiagnostics } : {}),
      sourceScopeNote: 'Each series declares sourceScope and completedResultEstablished. Planned or returned doses without completed-history fields are not evidence of performed repetitions or duration.',
      note: 'Jawne pola unit/repUnit/durationUnit i durationSeconds/timeSeconds/seconds rozpoznają jednostkę. Rozpoznany completionMethod 1=reps i 0/2=seconds jest reverse-engineered i zwracany jako api-code-inference z ostrzeżeniem; countType to metadane, nie jednostka pracy. Nie pytaj ponownie, gdy jednostka jest jednoznaczna. Konflikt z jawną jednostką, nieobsługiwany completionMethod albo niezgodna lista dawki daje unit=unknown. Surowe pole time opisuje czas wykonania serii i samo nie zmienia liczby na sekundy pracy. Dane API pozostają zachowane.'
    };
  }
  const sessionWork = annotateSessionWork(data, displayUnit, loadDisplayPreferences);
  if (sessionWork) result.gmCoachSessionSummary = { ...sessionWork, completedResultPresentation: "Dla odczytu obciążenia preferuj loadChannelPresentation.text: rozróżnia lewą i prawą linkę oraz niepotwierdzoną podstawę pojedynczej wartości. Brak combined nie upoważnia do sumowania niezależnych szczytów kanałów. Przy odczycie WYKONANEGO treningu zawsze pokaż w tabeli rzeczywiste odczyty każdej serii: wykonane reps albo rozpoznany czas pracy, osobno elapsedSeconds, obciążenie i jego jednostkę oraz dostępne wyniki. showCalculatedLoads dotyczy wyłącznie obliczeń PODGLĄDU planu i nigdy nie ukrywa danych ukończonej sesji Smart RM. Używaj gmCoachSessionSummary.exercises[].sets oraz sessionHistory, gdy rzeczywiście odczytano detale. reportedLoadSequences pokaż jako kolejność raportowanych próbek w osobnych kanałach, z segmentami i liczbą próbek (nie powtórzeń); zaznacz truncated i unknown, nie sumuj kanałów i nie pokazuj suppressed jako ciężaru. weightMin/weightMax pokaż jako zakres odczytanych próbek; summaryWeight jako raportowane podsumowanie obciążenia; reportedCablePeakLoad jako szczyt linki/linków z returned evidence, nie stały ciężar roboczy. Zachowaj pochodzenie i cable-vs-total interpretation; nie podwajaj ani nie dziel samodzielnie. Dla unknown nie dopisuj kg/lb. Preset, targetCount i dawka szablonu są osobnymi danymi planowanymi, nie zastępują wyniku. Nie wyliczaj wyniku z RM, 1RM, placeholdera weights=3.5 ani ustawień planu. Brak ciężaru zaznacz jako brak odczytu, nie jako zero. reportedActionRating pokaż wyłącznie jako raportowaną ocenę Speediance o niepotwierdzonym znaczeniu i skali; nie tłumacz jej na RPE, RIR, technikę, zmęczenie ani regenerację. Dane są raportem API, nie niezależnym pomiarem fizycznego oporu." };
  if (!series.length && !sessionWork) return rawOutput;
  return JSON.stringify(result);
}

/** Plan payloads require an explicit unit before this function is called. */
export function classifyPrescriptionUnit(unit) {
  return normalizedUnit(unit) || 'unknown';
}
