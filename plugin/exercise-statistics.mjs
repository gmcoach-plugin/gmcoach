const MAX_DEPTH = 8;
const MAX_NODES = 500;
const MAX_ARRAY_ITEMS = 60;
const MAX_STRING_LENGTH = 96;

const sensitiveField = /(?:password|passwd|token|secret|credential|cookie|authorization|email|phone|mobile|address|birthday|avatar|photo|session)|^(?:user(?:id|name)?|account(?:id|name)?)$/i;
const relevantField = /(?:^code$|^message$|^dayStr$|exercise|action|group|training|date|time|count|rep|weight|load|capacity|volume|unit|mode|(?:^|[^a-z])rm|one.?rm|1rm|record|best|max|percent|\bpr\b|level|score|stat|page|total|current|size|hasnext)/i;
const containerField = /^(?:data|result|records?|rows?|list|page|items?|content|stats?|statistics|userActionStatPage)$/i;
const safeTextField = /(?:^dayStr$|unit|date|time|exercise|action|group|training|mode|record|stat)/i;
const oneRepMaxFields = new Set(['oneRM', 'oneRepMax', 'one_rep_max', 'one_rm', 'assessed1RM', 'assessedOneRepMax']);
const estimatedOneRepMaxFields = new Set(['e1RM', 'estimated1RM', 'estimatedOneRepMax', 'estimated_one_rep_max', 'estimated_one_rm']);

/** Reject impossible calendar dates rather than accepting Date.parse rollover. */
export function parseExerciseStatisticsDate(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 40) return NaN;
  const date = value.trim();
  const calendar = /^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/.exec(date);
  if (calendar) {
    const year = Number(calendar[1]);
    const month = Number(calendar[2]);
    const day = Number(calendar[3]);
    const parsedDay = new Date(`${calendar[1]}-${calendar[2]}-${calendar[3]}T00:00:00.000Z`);
    if (parsedDay.getUTCFullYear() !== year || parsedDay.getUTCMonth() !== month - 1 || parsedDay.getUTCDate() !== day) return NaN;
  }
  return Date.parse(date);
}

/** Keep missing and malformed source dates separate; neither proves recency. */
export function exerciseStatisticsDateStatus(value) {
  if (value === undefined || value === null || value === '') return 'date-not-returned';
  return Number.isFinite(parseExerciseStatisticsDate(value)) ? 'date-available' : 'date-invalid';
}

const recordDateFields = ['date', 'recordDate', 'createTime', 'createdAt', 'time', 'dayStr'];

function recordDate(value, inheritedDate) {
  // An explicitly malformed or empty record date must not borrow an older
  // parent date and appear current. Inherit only when the field is absent.
  for (const key of recordDateFields) {
    if (Object.hasOwn(value, key)) return value[key];
  }
  return inheritedDate;
}

function recordDateSource(value, inheritedSource) {
  for (const key of recordDateFields) {
    if (Object.hasOwn(value, key)) return key;
  }
  return inheritedSource;
}

function positiveWeight(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    value = value.value ?? value.weight ?? value.load ?? value.amount;
  }
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 1000 ? numeric : null;
}

function weightUnitOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  for (const key of ['unit', 'weightUnit', 'weight_unit', 'displayUnit', 'display_unit']) {
    const raw = value[key];
    if (typeof raw === 'string') {
      const unit = raw.trim().toLowerCase();
      if (['kg', 'kgs', 'kilogram', 'kilograms', 'metric'].includes(unit)) return 'kg';
      if (['lb', 'lbs', 'pound', 'pounds', 'imperial'].includes(unit)) return 'lb';
    }
    if (raw === 0) return 'kg';
    if (raw === 1) return 'lb';
  }
  return null;
}

function explicitStatisticIds(value, inherited, requestedGroupId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return inherited;
  const parseId = (raw) => {
    if (typeof raw !== 'number' && !(typeof raw === 'string' && /^\d+$/.test(raw.trim()))) return null;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  };
  const groupFields = ['groupId', 'actionLibraryGroupId'].filter((key) => Object.hasOwn(value, key));
  for (const key of groupFields) {
    if (parseId(value[key]) !== requestedGroupId) return null;
  }
  let actionLibraryId = inherited.actionLibraryId;
  if (Object.hasOwn(value, 'actionLibraryId')) {
    actionLibraryId = parseId(value.actionLibraryId);
    if (actionLibraryId === null) return null;
  }
  return { groupId: requestedGroupId, ...(actionLibraryId === undefined ? {} : { actionLibraryId }) };
}

/**
 * Extract only fields explicitly named as 1RM/e1RM. Generic maxWeight, load,
 * counterweight and rmLevel values are deliberately never promoted to 1RM.
 */
export function extractExplicitOneRepMaxCandidates(envelope, groupId, accountDisplayUnit = 'unknown', {
  accountUnitSource = 'account-display-unit',
  allowUnknownUnit = false,
  recordsPath,
  maxRecords = MAX_ARRAY_ITEMS,
  aggregateOnly = false
} = {}) {
  if (!Number.isSafeInteger(groupId) || groupId < 1) throw new TypeError('groupId musi być dodatnim ID grupy ćwiczeń.');
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new TypeError('Odpowiedź statystyk ćwiczenia ma nieoczekiwany format.');
  const inheritedAccountUnit = ['kg', 'lb'].includes(accountDisplayUnit) ? accountDisplayUnit : null;
  const found = [];
  const selectedPath = recordsPath?.replace(/^\$\.data(?=\.|$)/, '$');
  let visited = 0;
  const visit = (value, inheritedUnit = null, path = '$', depth = 0, parent = null, inheritedIds = { groupId }, inheritedDate, inheritedDateSource) => {
    if (!value || typeof value !== 'object' || depth > 12 || visited++ > MAX_NODES) return;
    if (Array.isArray(value)) {
      if (aggregateOnly || recordsPath !== undefined && path !== recordsPath.replace(/^\$\.data(?=\.|$)/, '$')) return;
      value.slice(0, Math.min(MAX_ARRAY_ITEMS, maxRecords)).forEach((item, index) => visit(item, inheritedUnit, `${path}[${index}]`, depth + 1, parent, inheritedIds, inheritedDate, inheritedDateSource));
      return;
    }
    const ids = explicitStatisticIds(value, inheritedIds, groupId);
    if (!ids) return;
    const observationDate = recordDate(value, inheritedDate);
    const observationDateSource = recordDateSource(value, inheritedDateSource);
    const unit = weightUnitOf(value) || inheritedUnit || (weightUnitOf(parent) || inheritedAccountUnit);
    for (const [field, raw] of Object.entries(value)) {
      const isAssessedField = oneRepMaxFields.has(field);
      const isEstimatedField = estimatedOneRepMaxFields.has(field);
      if (!isAssessedField && !isEstimatedField) continue;
      const valueNumber = positiveWeight(raw);
      const fieldUnit = weightUnitOf(raw) || unit;
      const fieldIds = explicitStatisticIds(raw, ids, groupId);
      if (valueNumber === null || !fieldIds || (!fieldUnit && allowUnknownUnit !== true)) continue;
      const entry = {
        ...fieldIds,
        ...(recordsPath !== undefined || aggregateOnly ? { statisticsScope: /\[\d+\]/.test(path) ? 'selected-record-collection' : 'envelope-aggregate', sourcePath: path } : {}),
        value: valueNumber,
        unit: fieldUnit || 'unknown',
        kind: isEstimatedField ? 'estimated' : 'reported',
        field,
        unitSource: !fieldUnit ? 'unknown' : weightUnitOf(raw) || weightUnitOf(value) || weightUnitOf(parent) ? 'statistic-record' : accountUnitSource
      };
      // userActionStatPage dayStr labels a weekly aggregate, not a performed
      // session. Keep it for bucket ordering while explicitly preserving that
      // precision. Do not invent week boundaries or an exact workout date.
      // Evidence: labatt/speediance-mcp coaching.py at 96efbb3; reference client’s
      // tests/test_daily_exercise_stats.py at fdd62c8.
      const rawRecord = raw && typeof raw === 'object' ? raw : {};
      const date = recordDate(rawRecord, observationDate);
      const dateSource = recordDateSource(rawRecord, observationDateSource);
      if (typeof date === 'string' && date.trim() && date.length <= 40) entry.observedAt = date.trim();
      if (dateSource === 'dayStr') {
        entry.observationDateSource = 'dayStr';
        entry.datePrecision = 'week';
      }
      if (value.assessed === true || value.isAssessed === true || value.assessmentStatus === 'assessed') entry.assessed = true;
      found.push(entry);
    }
    for (const [key, child] of Object.entries(value)) {
      if (!child || typeof child !== 'object') continue;
      if (selectedPath !== undefined || aggregateOnly) {
        const childPath = `${path}.${key}`;
        const insideSelectedRecord = selectedPath !== undefined && path.startsWith(`${selectedPath}[`);
        const selectedAncestor = selectedPath !== undefined && (childPath === selectedPath || selectedPath.startsWith(`${childPath}.`));
        // Aggregates belong only to the actual envelope chain, not arbitrary
        // nested metadata objects. Selected records keep their own field scope.
        const knownEnvelope = aggregateOnly && /^(?:data|result|page|stats|statistics|userActionStatPage)$/i.test(key);
        if (!insideSelectedRecord && !selectedAncestor && !knownEnvelope) continue;
      }
      visit(child, unit, `${path}.${key}`, depth + 1, value, ids, observationDate, observationDateSource);
    }
  };
  const envelopeIds = explicitStatisticIds(envelope, { groupId }, groupId);
  if (envelopeIds) visit(envelope.data ?? envelope, weightUnitOf(envelope), '$', 0, envelope, envelopeIds, recordDate(envelope), recordDateSource(envelope));
  const unique = new Map();
  for (const candidate of found) {
    const key = `${candidate.groupId}:${candidate.actionLibraryId ?? 'unbound'}:${candidate.kind}:${candidate.field}:${candidate.value}:${candidate.unit}:${candidate.observedAt || ''}:${candidate.datePrecision || ''}`;
    unique.set(key, candidate);
  }
  return [...unique.values()];
}

function shapeOf(value, depth = 0, state = { nodes: 0 }) {
  state.nodes += 1;
  if (state.nodes > MAX_NODES) return '[limit]';
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return { type: 'array', items: '[depth limit]' };
    const sample = value.slice(0, 3).map((item) => shapeOf(item, depth + 1, state));
    return { type: 'array', length: value.length, sample };
  }
  if (typeof value !== 'object') return typeof value;
  if (depth >= MAX_DEPTH) return '[depth limit]';
  const fields = {};
  for (const [key, child] of Object.entries(value).slice(0, 80)) {
    if (sensitiveField.test(key)) continue;
    fields[key.slice(0, 80)] = shapeOf(child, depth + 1, state);
    if (state.nodes > MAX_NODES) break;
  }
  return fields;
}

function sanitize(value, depth = 0, state = { nodes: 0 }, parentKey = '') {
  state.nodes += 1;
  if (state.nodes > MAX_NODES) return '[limit]';
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return safeTextField.test(parentKey) ? value.slice(0, MAX_STRING_LENGTH) : undefined;
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return [];
    return value.slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitize(item, depth + 1, state, parentKey))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== 'object' || depth >= MAX_DEPTH) return undefined;
  const result = {};
  for (const [key, child] of Object.entries(value).slice(0, 100)) {
    if (sensitiveField.test(key)) continue;
    const isContainer = containerField.test(key);
    if (!isContainer && !relevantField.test(key)) continue;
    if (typeof child === 'string' && !safeTextField.test(key)) continue;
    const safe = sanitize(child, depth + 1, state, key);
    if (safe !== undefined) result[key.slice(0, 80)] = safe;
    if (state.nodes > MAX_NODES) break;
  }
  return result;
}

export function summarizeExerciseStatisticsResponse(envelope, groupId) {
  if (!Number.isSafeInteger(groupId) || groupId < 1) throw new TypeError('groupId musi być dodatnim ID grupy ćwiczeń.');
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new TypeError('Odpowiedź statystyk ćwiczenia ma nieoczekiwany format.');
  }
  return {
    groupId,
    source: 'Speediance /app/actionLibraryGroup/userActionStatPage (nieoficjalny endpoint)',
    apiCode: Number.isFinite(Number(envelope.code)) ? Number(envelope.code) : null,
    dateSemantics: { dayStr: 'weekly-bucket-label-not-session-date' },
    responseShape: shapeOf(envelope),
    sanitizedData: sanitize(envelope.data ?? envelope)
  };
}
