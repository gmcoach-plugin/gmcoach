const EXPLICIT_UNIT_FIELDS = ['unit', 'repUnit', 'rep_unit', 'durationUnit', 'duration_unit'];
const UNIT_CODE_FIELDS = ['completionMethod'];
const EXPLICIT_DURATION_FIELDS = ['durationSeconds', 'duration_seconds', 'timeSeconds', 'time_seconds', 'seconds'];

function rawFieldValues(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'number') return [value];
  if (typeof value === 'string' && value.trim()) return value.split(',').map((part) => part.trim());
  return [];
}

function valueForSet(record, field, setIndex, setCount) {
  if (!record || typeof record !== 'object' || !Object.hasOwn(record, field) || record[field] === null || record[field] === undefined || record[field] === '') {
    return { present: false };
  }
  const values = rawFieldValues(record[field]);
  if (!values.length) return { present: true, invalid: true, value: record[field], reason: 'invalid-field-shape' };
  if (values.length === 1) return { present: true, value: values[0] };
  if (values.length !== setCount) {
    return { present: true, invalid: true, value: record[field], reason: `length:${values.length}/${setCount}` };
  }
  return { present: true, value: values[setIndex] };
}

function normalizeExplicitUnit(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (['rep', 'reps', 'repetition', 'repetitions', 'count'].includes(text)) return 'reps';
  if (['sec', 'secs', 'second', 'seconds', 's', 'time', 'duration'].includes(text)) return 'seconds';
  return null;
}

function normalizeApiUnitCode(value) {
  const code = typeof value === 'number'
    ? value
    : (typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN);
  if (code === 1) return 'reps';
  if (code === 0 || code === 2) return 'seconds';
  return null;
}

export function interpretSpeedianceUnitCode(value) {
  return normalizeApiUnitCode(value);
}

/**
 * Resolve a set's unit from explicit labels/duration fields or an aligned,
 * reverse-engineered completionMethod code. Codes 0/2=seconds, 1=reps are exposed
 * only as api-code-inference with an explicit caveat; conflicts, unsupported
 * values, and misaligned arrays remain unknown. Program writes still require
 * explicit units at their own validation boundary.
 * Source: labatt/speediance-mcp, speediance/parsing.py kind_of at
 * 96efbb3da0fa9d903defecbd2f726ea1885ce12e maps methods 0/2 to timed.
 * Unsupported methods are not defaulted to reps here. countType is metadata,
 * observed as 2 in both rep and timed work, and never supplies/vetoes a unit.
 */
export function resolveSetUnit({ records = [], setIndex = 0, setCount = 1, extraSignals = [], endpoint = 'generic' } = {}) {
  const evidence = [];
  const claims = [];
  let invalid = false;
  const vitaTypes = records.filter(record => record && typeof record === 'object' &&
    Object.hasOwn(record, 'dataStatType')).map(record => record.dataStatType);
  const vitaHistory = endpoint === 'finished-history' && vitaTypes.length > 0 &&
    vitaTypes.every(value => value === 6);
  let vitaTimedReps = false;

  for (const record of new Set(records)) {
    if (!record || typeof record !== 'object') continue;
    for (const field of EXPLICIT_UNIT_FIELDS) {
      const aligned = valueForSet(record, field, setIndex, setCount);
      if (!aligned.present) continue;
      const source = `explicit:${field}`;
      if (aligned.invalid) {
        invalid = true;
        evidence.push({ field, source, rawValue: aligned.value, issue: aligned.reason });
        continue;
      }
      const unit = normalizeExplicitUnit(aligned.value);
      evidence.push({ field, source, rawValue: aligned.value, ...(unit ? { interpretedUnit: unit } : { issue: 'unsupported-explicit-unit' }) });
      if (!unit) invalid = true;
      else claims.push({ field, source, unit });
    }
    for (const field of EXPLICIT_DURATION_FIELDS) {
      const aligned = valueForSet(record, field, setIndex, setCount);
      if (!aligned.present) continue;
      const source = `explicit-duration:${field}`;
      if (aligned.invalid) {
        invalid = true;
        evidence.push({ field, source, rawValue: aligned.value, issue: aligned.reason });
        continue;
      }
      const duration = Number(aligned.value);
      if (!Number.isFinite(duration) || duration < 1 || duration > 86_400) {
        invalid = true;
        evidence.push({ field, source, rawValue: aligned.value, issue: 'invalid-duration-value' });
        continue;
      }
      evidence.push({ field, source, rawValue: aligned.value, interpretedUnit: 'seconds' });
      claims.push({ field, source, unit: 'seconds' });
    }
    for (const field of UNIT_CODE_FIELDS) {
      const aligned = valueForSet(record, field, setIndex, setCount);
      if (!aligned.present) continue;
      const source = `api-code:${field}`;
      if (aligned.invalid) {
        invalid = true;
        evidence.push({ field, source, rawValue: aligned.value, issue: aligned.reason });
        continue;
      }
      const isVitaCode = vitaHistory && (aligned.value === 5 || aligned.value === '5');
      const unit = isVitaCode ? 'seconds' : normalizeApiUnitCode(aligned.value);
      if (isVitaCode) vitaTimedReps = true;
      evidence.push({ field, source, rawValue: aligned.value, ...(unit ? { interpretedUnit: unit } : { issue: 'unsupported-api-unit-code' }) });
      if (unit) claims.push({ field, source, unit });
      else invalid = true;
    }
    if (Object.hasOwn(record, 'countType') && record.countType !== undefined && record.countType !== null && record.countType !== '') {
      evidence.push({ field: 'countType', source: 'countType-metadata', rawValue: record.countType, issue: 'not-a-work-unit-field' });
    }
  }
  for (const signal of extraSignals) {
    if (signal?.source === 'exercise-catalog.countType' || signal?.field === 'exercise-catalog.countType' || signal?.field === 'countType') {
      evidence.push({
        field: signal?.field ?? signal?.source,
        source: signal?.source ?? 'countType-metadata',
        rawValue: signal?.rawValue,
        issue: 'not-a-work-unit-field'
      });
      continue;
    }
    const suppliedUnit = signal?.unit === 'reps' || signal?.unit === 'seconds' ? signal.unit : null;
    const unit = suppliedUnit;
    evidence.push({
      field: signal?.field ?? signal?.source ?? 'additional-signal',
      source: signal?.source ?? 'additional-signal',
      rawValue: signal?.rawValue,
      ...(unit ? { interpretedUnit: unit } : { issue: 'unsupported-additional-signal' })
    });
    if (!unit) invalid = true;
    if (unit) claims.push({ field: signal?.field, source: signal?.source ?? 'additional-signal', unit });
  }

  const distinctUnits = [...new Set(claims.map((claim) => claim.unit))];
  if (invalid || distinctUnits.length !== 1) {
    return {
      unit: 'unknown',
      unitResolution: evidence.some((item) => item.issue !== 'not-a-work-unit-field') ? 'unresolved' : 'no-unit-signal',
      unitEvidence: evidence,
      ...(invalid ? { unitWarning: 'Nieobsługiwane pole/kod lub liczba wartości niezgodna z liczbą serii; jednostka pozostaje unknown.' } : {}),
      ...(!invalid && distinctUnits.length === 0 && evidence.some((item) => item.issue === 'unsupported-api-unit-code')
        ? { unitWarning: 'Nieobsługiwana wartość completionMethod; jednostka pozostaje unknown.' }
        : {}),
      ...(invalid && evidence.some((item) => item.issue === 'unsupported-api-unit-code')
        ? { unitWarning: 'Nieobsługiwana wartość completionMethod; jednostka pozostaje unknown.' }
        : {}),
      ...(distinctUnits.length > 1 ? { unitWarning: 'Pola jednostki są sprzeczne; jednostka pozostaje unknown.' } : {})
    };
  }

  const hasExplicit = claims.some((claim) => claim.source.startsWith('explicit'));
  const hasApiCode = claims.some((claim) => claim.source.startsWith('api-code'));
  return {
    unit: distinctUnits[0],
    unitResolution: hasExplicit ? 'explicit' : 'api-code-inference',
    unitEvidence: evidence,
    ...(vitaTimedReps ? { completionKind: 'vita-timed-reps', completionSource: 'https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/docs/API-NOTES.md#2-completionmethod-decides-what-targetcount-means' } : {}),
    ...(hasApiCode
      ? { unitWarning: vitaTimedReps ? 'Vita completionMethod=5: targetCount oznacza sekundy, finishedCount to powtórzenia wykonane w tym czasie. Interpretacja community-observed, nie oficjalny kontrakt Speediance.' : 'Jednostka wynika z reverse-engineered mapowania completionMethod (0/2=seconds, 1=reps); api-code-inference nie jest jawną etykietą Speediance.' }
      : {})
  };
}
