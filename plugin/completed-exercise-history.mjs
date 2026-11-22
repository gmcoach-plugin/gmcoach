import { safeReportedCompletedSettingCodes } from './completed-setting-codes.mjs';
import { annotateTimedWorkoutOutput } from './workout-data.mjs';
import { presentLoadChannels } from './load-channel-presentation.mjs';
import { projectSessionPlanningView } from './session-planning-view.mjs';

const GROUP_FIELDS = ['groupId', 'group_id', 'actionLibraryGroupId', 'action_library_group_id'];
const VARIANT_FIELDS = ['actionLibraryId', 'action_library_id'];
const MAX_DIAGNOSTICS = 100;
const MAX_SETS = 200;
const MAX_TOTAL_SETS = 2_000;

function positiveId(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function explicitId(record, fields) {
  const present = fields.filter((key) => Object.hasOwn(record, key) && record[key] !== null && record[key] !== undefined);
  if (!present.length) return { status: 'missing' };
  const values = present.map((key) => positiveId(record[key]));
  if (values.includes(null) || new Set(values).size !== 1) return { status: 'invalid' };
  return { status: 'explicit', value: values[0], fields: present };
}

function sessionId(value) {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const id = String(value);
  return /^[A-Za-z0-9._-]{1,128}$/.test(id) && !['.', '..'].includes(id) ? id : null;
}

function actualDate(value) {
  // CLI Summary.date is the actual local calendar day, not an exact start time.
  // Never use dayStr, the weekly statistic label, as a session date.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return null;
  return { value, time };
}

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function text(value, limit = 160) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, limit) : undefined;
}

function safeSource(value) {
  if (value === 'speediance-cli+free-training-detail') return value;
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value) ? value : 'completed-session-detail';
}

function safeScaleEvidence(value) {
  if (!object(value)) return undefined;
  const result = {};
  for (const key of ['status', 'reason', 'source']) {
    if (typeof value[key] === 'string') result[key] = text(value[key], 300);
  }
  for (const key of ['factor', 'tolerance', 'sessionCapacity', 'rawSetCapacitySum']) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0) result[key] = value[key];
  }
  if (typeof value.capacityComplete === 'boolean') result.capacityComplete = value.capacityComplete;
  return result;
}

function sourceRecords(value, path = '$', result = new Map(), depth = 0, budget = { visited: 0 }) {
  if (!value || typeof value !== 'object' || depth > 20 || budget.visited++ >= 50_000) return result;
  if (Array.isArray(value)) {
    value.forEach((child, index) => sourceRecords(child, `${path}[${index}]`, result, depth + 1, budget));
  } else {
    result.set(path, value);
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith('gmCoach')) continue;
      sourceRecords(child, `${path}.${key}`, result, depth + 1, budget);
    }
  }
  return result;
}

// Input is server-owned annotateTimedWorkoutOutput output, never caller-provided history rows.
// Whitelist only normalized channel fields; do not forward raw source records.
function safeReportedLoadSequences(rows) {
  if (!Array.isArray(rows)) return undefined;
  return rows.slice(0,21).filter(object).map(row => {
    const out={sourcePath:text(row.sourcePath,240),channel:['aggregate-weights','left-cable','right-cable'].includes(row.channel)?row.channel:'unknown',
      unit:['kg','lb'].includes(row.unit)?row.unit:'unknown',unitSource:text(row.unitSource,100),source:text(row.source,500),
      semantics:'reported-ordered-samples',sampleToRepetitionMapping:'unverified',automaticApplication:false,
      status:['reported','invalid','suppressed'].includes(row.status)?row.status:'invalid',complete:row.complete===true,truncated:row.truncated===true};
    if(typeof row.reason==='string')out.reason=text(row.reason,120);
    if(out.status!=='reported')return out;
    // Normalizer caps accepted samples at200; reject malformed generated records, never silently filter.
    if(!Array.isArray(row.samples)||row.samples.length===0||row.samples.length>200||row.samples.some(value=>typeof value!=='number'||!Number.isFinite(value)||value<0)){
      return {...out,status:'invalid',complete:false,reason:'invalid-normalized-sample-sequence'};
    }
    out.samples=row.samples.slice();out.reportedSampleCount=out.samples.length;
    out.firstReportedSample=out.samples[0];out.lastReportedSample=out.samples.at(-1);
    out.segments=[];
    for(let index=0;index<out.samples.length;index++){
      const value=out.samples[index],previous=out.segments.at(-1);
      if(previous&&previous.value===value)previous.sampleCount++;
      else out.segments.push({value,sampleCount:1,startSampleIndex:index});
    }
    out.observedSampleSummary={scope:out.truncated?'accepted-prefix-only':'accepted-samples',sampleCount:out.samples.length,
      distinctReportedValueCount:new Set(out.samples).size,consecutiveSegmentCount:out.segments.length,
      upwardTransitionCount:out.segments.slice(1).filter((segment,index)=>segment.value>out.segments[index].value).length,
      downwardTransitionCount:out.segments.slice(1).filter((segment,index)=>segment.value<out.segments[index].value).length,
      constantReportedSamples:out.segments.length===1,minimumReportedSample:Math.min(...out.samples),maximumReportedSample:Math.max(...out.samples),
      sampleToRepetitionMapping:'unverified',workingLoadInferred:false,dropSetInferred:false};
    return out;
  });
}

function safeSet(set) {
  const out = { set: set.set, unit: ['reps', 'seconds'].includes(set.unit) ? set.unit : 'unknown' };
  const loadSequences=safeReportedLoadSequences(set.reportedLoadSequences);
  if(loadSequences?.length){
    out.reportedLoadSequences=loadSequences;
    out.loadChannelPresentation=presentLoadChannels(loadSequences);
  }
  const settings = safeReportedCompletedSettingCodes(set.reportedSettingCodes);
  if (settings) out.reportedSettingCodes = settings;
  if (Number.isFinite(set.reportedCablePeakLoad) && set.reportedCablePeakLoad >= 0) out.reportedCablePeakLoad = set.reportedCablePeakLoad;
  for (const field of ['reportedCablePeakLoadStatus', 'reportedCablePeakLoadUnit', 'reportedCablePeakLoadReason']) {
    if (typeof set[field] === 'string') out[field] = text(set[field], 240);
  }
  if (object(set.reportedCablePeakLoadEvidence)) {
    const evidence = set.reportedCablePeakLoadEvidence;
    out.reportedCablePeakLoadEvidence = Object.fromEntries(
      ['source', 'interpretation', 'algorithm', 'side', 'leftPeak', 'rightPeak', 'leftSampleCount', 'rightSampleCount', 'weightsSampleCount', 'perRepTelemetry', 'assessedOneRepMax']
        .flatMap(field => typeof evidence[field] === 'string' ? [[field, text(evidence[field], 500)]] :
          typeof evidence[field] === 'boolean' || (typeof evidence[field] === 'number' && Number.isFinite(evidence[field])) ? [[field, evidence[field]]] : [])
    );
    if (Array.isArray(evidence.sourceFields)) out.reportedCablePeakLoadEvidence.sourceFields = evidence.sourceFields.slice(0, 8).filter(x => typeof x === 'string').map(x => text(x, 120));
  }
  for (const key of ['reps', 'targetCount', 'rawCount', 'rawTargetCount', 'durationSeconds', 'elapsedSeconds',
    'weightMin', 'weightMax', 'summaryWeight', 'rawSummaryWeight', 'scaleFactor', 'apiCapacity', 'liftedVolume', 'inferredLoadPoints', 'side']) {
    if (typeof set[key] === 'number' && Number.isFinite(set[key]) && set[key] >= 0) out[key] = set[key];
  }
  if (Array.isArray(set.completedNumericDiagnostics)) out.completedNumericDiagnostics = set.completedNumericDiagnostics.slice(0, 3).filter(object).map(row => ({ field: text(row.field, 40), status: 'unknown', reason: text(row.reason, 80), sourceFields: Array.isArray(row.sourceFields) ? row.sourceFields.slice(0, 3).filter(x => typeof x === 'string').map(x => text(x, 40)) : [] }));
  if (set.completedCountStatus === 'invalid-or-unavailable') out.completedCountStatus = set.completedCountStatus;
  if (Object.hasOwn(set, 'weightUnit')) out.weightUnit = ['kg', 'lb'].includes(set.weightUnit) ? set.weightUnit : 'unknown';
  if (['kg·powt.', 'lb·powt.'].includes(set.liftedVolumeUnit)) out.liftedVolumeUnit = set.liftedVolumeUnit;
  for (const key of ['unitResolution', 'unitWarning', 'liftedVolumeStatus', 'liftedVolumeReason', 'liftedVolumeSource', 'summaryWeightSource', 'summaryWeightWarning']) {
    if (typeof set[key] === 'string') out[key] = text(set[key], 1000);
  }
  if (object(set.liftedVolumeSource)) {
    out.liftedVolumeSource = Object.fromEntries(['weightSource', 'capacitySource', 'loadPointMethod']
      .filter((key) => typeof set.liftedVolumeSource[key] === 'string')
      .map((key) => [key, text(set.liftedVolumeSource[key], 240)]));
  }
  if (Array.isArray(set.unitEvidence)) {
    out.unitEvidence = set.unitEvidence.slice(0, 24).map((item) => ({
      ...(typeof item.field === 'string' ? { field: text(item.field, 64) } : {}),
      ...(typeof item.source === 'string' ? { source: text(item.source, 96) } : {}),
      ...(['reps', 'seconds'].includes(item.interpretedUnit) ? { interpretedUnit: item.interpretedUnit } : {}),
      ...(typeof item.issue === 'string' ? { issue: text(item.issue, 96) } : {})
    }));
  }
  // Only generated, bounded scale evidence is forwarded; raw summary objects
  // can contain private account fields and must never reach a history response.
  for (const key of ['summaryWeightSource', 'summaryWeightProvenance', 'scaleReconciliation']) {
    if (!object(set[key])) continue;
    const allowed = ['source', 'method', 'status', 'warning', 'scale', 'factor', 'rawCapacitySum', 'sessionCapacity', 'ratio',
      'field', 'scaleSource', 'rawWeight', 'normalizedWeight', 'rawSummaryWeight', 'divisor', 'reconciliation',
      'semantics', 'reconciliationStatus', 'scaleFactor'];
    out[key] = Object.fromEntries(allowed.flatMap((field) => {
      const value = set[key][field];
      if (typeof value === 'number' && Number.isFinite(value)) return [[field, value]];
      if (typeof value === 'string') return [[field, text(value, 240)]];
      return [];
    }));
    if (Array.isArray(set[key].capacitySources)) {
      out[key].capacitySources = set[key].capacitySources.slice(0, 8)
        .filter(value => typeof value === 'string').map(value => text(value, 240));
    }
  }
  return out;
}

/**
 * Read-only bounded completed-session scan. fetchSession({trainingId,type})
 * returns {payload,source,partial}; payload is the CLI {training_id,kind,info,detail}
 * document (object or JSON string). No endpoint guessing, persistence, 1RM or RIR.
 * Group evidence is required; an explicitly supplied variant narrows that scope.
 * maxScanWallMs is checked between reads; it does not abort an ongoing callback.
 * The caller must enforce its own per-request timeout in fetchSession.
 */
export async function scanCompletedExerciseHistory({
  summaries, groupId, actionLibraryId, maxSessions = 10, days = 90,
  displayUnit = 'unknown', fetchSession, now = new Date(), maxScanWallMs = 45_000, calendarCompletedOnly = false, maxTotalSets = MAX_TOTAL_SETS
} = {}) {
  if (!Number.isSafeInteger(groupId) || groupId < 1) throw new TypeError('groupId must be a positive integer.');
  if (actionLibraryId !== undefined && (!Number.isSafeInteger(actionLibraryId) || actionLibraryId < 1)) throw new TypeError('actionLibraryId must be a positive integer.');
  if (!Number.isSafeInteger(maxSessions) || maxSessions < 1 || maxSessions > 30) throw new TypeError('maxSessions must be between 1 and 30.');
  if (!Number.isSafeInteger(days) || days < 1 || days > 365) throw new TypeError('days must be between 1 and 365.');
  if (!['kg', 'lb', 'unknown'].includes(displayUnit)) throw new TypeError('displayUnit must be kg, lb or unknown.');
  if (typeof fetchSession !== 'function') throw new TypeError('fetchSession is required.');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('now must be a valid Date.');
  if (!Number.isSafeInteger(maxScanWallMs) || maxScanWallMs < 1 || maxScanWallMs > 120_000) throw new TypeError('maxScanWallMs must be between 1 and 120000.');
  if (typeof calendarCompletedOnly !== 'boolean') throw new TypeError('Invalid calendar scan scope.');
  const rows = Array.isArray(summaries) ? summaries : object(summaries) && Array.isArray(summaries.sessions) ? summaries.sessions : null;
  if (!rows || rows.length > 10_000) throw new TypeError('summaries must contain a bounded CLI summary array.');
  const localDay = `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const today = actualDate(localDay)?.time;
  if (!Number.isFinite(today)) throw new TypeError('now is outside the supported calendar range.');
  const earliest = today - (days - 1) * 86_400_000;
  const result = {
    groupId, ...(actionLibraryId === undefined ? {} : { requestedActionLibraryId: actionLibraryId }),
    displayUnit, windowDays: days, maxSessions, summarySessionCount: rows.length,
    scannedSessionCount: 0, omittedSessionCount: 0, omittedExerciseCount: 0, omittedSetCount: 0,
    outsideWindowCount: 0, sessionsWithoutMatchCount: 0, errorCount: 0,
    partial: false, matches: [], diagnostics: [],
    dateSemantics: 'CLI actual session calendar day; same-day session order is not known.',
    loadSemantics: 'Observed normalized history only; weightMin/weightMax are telemetry, summaryWeight is an API set summary with scale provenance. Neither is assessed 1RM or independently verified per-repetition load.'
  };
  const diagnostic = (reason, id) => {
    result.partial = true;
    if (result.diagnostics.length < MAX_DIAGNOSTICS) result.diagnostics.push({ reason, ...(id ? { sessionId: id } : {}) });
  };
  if (!Number.isSafeInteger(maxTotalSets) || maxTotalSets < 1 || maxTotalSets > MAX_TOTAL_SETS) throw new TypeError('Invalid returned-set budget.');
  const candidates = [];
  const identifiers = new Map();
  for (const row of rows) {
    const id = object(row) ? sessionId(row.training_id) : null;
    if (id) identifiers.set(id, (identifiers.get(id) || 0) + 1);
  }
  for (const row of rows) {
    const id = object(row) ? sessionId(row.training_id) : null;
    const date = object(row) ? actualDate(row.date) : null;
    const reason = !id ? 'invalid-session-id' : identifiers.get(id) > 1 ? 'ambiguous-session-id' :
      !(calendarCompletedOnly ? ['course','ai'] : ['program','free']).includes(row.kind) ? 'unknown-session-type' : !date ? 'missing-or-invalid-session-date' : calendarCompletedOnly && (row.identityProvenance?.calendarIdentityVerified !== true || row.identityProvenance?.sourceEndpoint !== '/app/v5/trainingCalendar/monthNew') ? 'unverified-calendar-identity' : null;
    if (reason) { result.omittedSessionCount++; diagnostic(reason, id); continue; }
    if (date.time < earliest || date.time > today) { result.outsideWindowCount++; continue; }
    candidates.push({ trainingId: id, type: row.kind, date: date.value, time: date.time });
  }
  candidates.sort((a, b) => b.time - a.time || a.trainingId.localeCompare(b.trainingId, 'en'));
  const started = Date.now();
  let returnedSetCount = 0;
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    if (result.scannedSessionCount >= maxSessions || Date.now() - started >= maxScanWallMs) {
      result.omittedSessionCount += candidates.length - index;
      diagnostic(result.scannedSessionCount >= maxSessions ? 'session-limit-reached' : 'scan-time-budget-reached');
      break;
    }
    result.scannedSessionCount++;
    try {
      const fetched = await fetchSession({ trainingId: candidate.trainingId, type: candidate.type, ...(calendarCompletedOnly ? {date: candidate.date} : {}) });
      if (!object(fetched) || fetched.payload === undefined) throw new Error('invalid-fetch-result');
      const serialized = typeof fetched.payload === 'string' ? fetched.payload : JSON.stringify(fetched.payload);
      if (Buffer.byteLength(serialized, 'utf8') > 4_000_000) throw new Error('oversized-payload');
      const payload = JSON.parse(serialized);
      if (!object(payload) || sessionId(payload.training_id) !== candidate.trainingId || payload.kind !== candidate.type || calendarCompletedOnly && (payload.date !== candidate.date || payload.identityProvenance?.calendarIdentityVerified !== true || payload.identityProvenance?.sourceEndpoint !== '/app/v5/trainingCalendar/monthNew')) {
        result.omittedSessionCount++; diagnostic('session-response-identity-mismatch', candidate.trainingId); continue;
      }
      // Ignore cached/generated annotations: establish IDs from the original fields.
      delete payload.gmCoachSessionSummary;
      delete payload.gmCoachTimeInterpretation;
      const records = sourceRecords(payload);
      const verifiedPaths = new Map();
      const priorOmittedExercises = result.omittedExerciseCount;
      for (const [path, raw] of records) {
        const completed = Array.isArray(raw.finishedReps) || Array.isArray(raw.finished_reps);
        const freeSummary = candidate.type === 'free' && /^\$\.info\.actionList\[\d+\]$/.test(path) && Array.isArray(raw.setList);
        if (!completed && !freeSummary) continue;
        const group = explicitId(raw, GROUP_FIELDS);
        if (group.status !== 'explicit') {
          result.omittedExerciseCount++; diagnostic('unverified-exercise-group-id', candidate.trainingId); continue;
        }
        if (group.value !== groupId) continue;
        const variant = explicitId(raw, VARIANT_FIELDS);
        if (variant.status === 'invalid') {
          result.omittedExerciseCount++; diagnostic('conflicting-or-invalid-exercise-variant', candidate.trainingId); continue;
        }
        if (actionLibraryId !== undefined && variant.status === 'missing') {
          result.omittedExerciseCount++; diagnostic('requested-exercise-variant-not-confirmed', candidate.trainingId); continue;
        }
        if (actionLibraryId !== undefined && variant.status === 'explicit' && variant.value !== actionLibraryId) continue;
        verifiedPaths.set(path, { group, variant });
      }
      const normalized = JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(payload), { displayUnit }));
      const exercises = normalized.gmCoachSessionSummary?.exercises || [];
      const planningExercises = exercises.length ? projectSessionPlanningView(normalized).exercises : [];
      if (fetched.partial === true) diagnostic('partial-session-detail', candidate.trainingId);
      const normalizedSummary = normalized.gmCoachSessionSummary;
      const completedFieldsAmbiguous = Array.isArray(normalizedSummary?.completedFieldDiagnostics) && normalizedSummary.completedFieldDiagnostics.length > 0;
      if (completedFieldsAmbiguous) diagnostic('ambiguous-completed-series-fields', candidate.trainingId);
      const numericFieldsAmbiguous = Array.isArray(normalizedSummary?.completedNumericDiagnostics) && normalizedSummary.completedNumericDiagnostics.length > 0;
      if (numericFieldsAmbiguous) diagnostic('conflicting-or-malformed-completed-numeric-fields', candidate.trainingId);
      if ((!completedFieldsAmbiguous && !numericFieldsAmbiguous && normalizedSummary?.partial === true) || normalizedSummary?.freeLiftSummaryCoverage?.partial === true) {
        diagnostic('partial-free-lift-summary-normalization', candidate.trainingId);
      }
      if (normalizedSummary?.freeLiftSummaryCoverage?.warning) {
        diagnostic('ambiguous-overlapping-free-lift-summary-omitted', candidate.trainingId);
      }
      for (const key of ['omittedExerciseCount', 'omittedSetCount']) {
        const count = normalizedSummary?.[key] ?? normalizedSummary?.freeLiftSummaryCoverage?.[key];
        if (Number.isSafeInteger(count) && count > 0) {
          result[key] += key === 'omittedExerciseCount'
            ? Math.max(0, count - (result.omittedExerciseCount - priorOmittedExercises)) : count;
          diagnostic('omitted-free-lift-summary-records', candidate.trainingId);
        }
      }
      if (!exercises.length) {
        result.omittedSessionCount++; diagnostic('no-normalized-completed-sets', candidate.trainingId); continue;
      }
      let matched = false;
      for (const exercise of exercises) {
        const verified = verifiedPaths.get(exercise.path);
        if (!verified) continue;
        const { group, variant } = verified;
        if (!Array.isArray(exercise.sets) || !exercise.sets.length) {
          result.omittedExerciseCount++; diagnostic('empty-completed-set-list', candidate.trainingId); continue;
        }
        const count = Math.min(exercise.sets.length, MAX_SETS, maxTotalSets - returnedSetCount);
        if (count < exercise.sets.length) {
          result.omittedSetCount += exercise.sets.length - count;
          diagnostic(returnedSetCount + count >= maxTotalSets ? 'history-set-limit-reached' : 'exercise-set-limit-reached', candidate.trainingId);
        }
        if (count === 0) { result.omittedExerciseCount++; continue; }
        const planningExercise=planningExercises[exercises.indexOf(exercise)];
        const sets = exercise.sets.slice(0, count).map((set,index)=>{
          const out=safeSet(set),native=planningExercise?.sets?.[index]?.nativeExecutionEvidence;
          if(native)out.nativeExecutionEvidence=native;
          return out;
        });
        returnedSetCount += count;
        if (sets.some((set) => set.unit === 'unknown')) diagnostic('unresolved-completed-set-unit', candidate.trainingId);
        if (sets.some((set) => set.weightUnit === 'unknown')) diagnostic('unresolved-history-weight-unit', candidate.trainingId);
        if (sets.some((set) => set.reportedCablePeakLoadStatus === 'unknown')) diagnostic('unresolved-reported-cable-peak-load', candidate.trainingId);
        result.matches.push({
          sessionId: candidate.trainingId, sessionType: candidate.type, date: candidate.date,
          datePrecision: 'day', groupId,
          ...(variant.status === 'explicit' ? { actionLibraryId: variant.value } : {}),
          exerciseName: text(exercise.exercise), sets,
          evidence: {
            source: safeSource(fetched.source), normalization: 'annotateTimedWorkoutOutput',
            dateSource: calendarCompletedOnly ? 'validated-completed-calendar.date' : 'cli-summary.date', groupIdFields: group.fields,
            variantScope: variant.status === 'explicit' ? 'explicit-variant' : 'group-only',
            ...(variant.status === 'explicit' ? { variantIdFields: variant.fields } : {}),
            weightUnitSource: text(normalized.gmCoachSessionSummary.weightUnitSource, 64),
            ...(normalizedSummary?.scaleReconciliation ? { scaleReconciliation: safeScaleEvidence(normalizedSummary.scaleReconciliation) } : {}),
            assessedOneRepMax: false, inferredRir: false
          }
        });
        matched = true;
      }
      if (!matched) result.sessionsWithoutMatchCount++;
    } catch {
      result.errorCount++;
      result.omittedSessionCount++;
      diagnostic('session-read-or-normalization-failed', candidate.trainingId);
    }
  }
  return result;
}
