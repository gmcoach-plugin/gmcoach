import { quantizeCustomizeLoad } from './customize-load-step.mjs';
import { createHash } from 'node:crypto';
import { formatWireDecimal } from './static-load-wire-units.mjs';
import { buildExerciseLoadPayload, validateReferenceClientRmLevel, getReferenceClientRmPresetRules, mapReferenceClientResistanceModesToWire, MAX_PRESET_REPS } from './program-payload.mjs';
import { validateStaticLoad } from './static-load-limits.mjs';
import { encodeStaticLoad, staticLoadBeforeWireRounding, decodeStaticLoad, STATIC_LOAD_PROTOCOLS } from './static-load-protocol.mjs';
import { resolveSetUnit } from './unit-interpretation.mjs';
import { expandObservedRmPresetAction, getReferenceClientRmPresetById, getReferenceClientRmPresetByName, getTemplatePresetId, hasValidReferenceClientRmPresetNameAliases, isObservedRmPresetAction, normalizedPresetName } from './preset-mapping.mjs';
import { resolveGoalBoundSmartRmPresetName } from './goal-preset-routing.mjs';
import { reconcileSavedEditPayload } from './saved-edit-diff.mjs';

const CODE_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const ACTION_FIELDS = [
  'setsAndReps', 'breakTime', 'breakTime2', 'sportMode', 'leftRight',
  'selectCompletionMethod', 'completionMethod', 'countType', 'weights',
  'counterweight', 'counterweight2', 'level'
];
const READBACK_COMPARE_FIELDS = [
  ...ACTION_FIELDS.filter((field) => ![
    'selectCompletionMethod', 'completionMethod', 'countType'
  ].includes(field)),
  'templatePresetId'
];
const LOAD_FIELDS = new Set(['weights', 'counterweight', 'counterweight2']);
const LOAD_WIRE_TOLERANCE = 0.05;

function structuralJson(value) {
  if (Array.isArray(value)) return `[${value.map(structuralJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${structuralJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

// Endpoint-qualified read contract only: reference client action springGroupList per-set
// arrays contain {type,num}. This is not proof of a writable API band field.
export function readSavedTemplateSpringGroups(action, setIndex = 0, setCount = 1) {
  if (!Object.hasOwn(action ?? {}, 'springGroupList')) return { status: 'absent' };
  const raw = action.springGroupList;
  const provenance = 'reference client saved-action springGroupList read path';
  const unknown = () => ({ status: 'unknown', raw, provenance, writable: false });
  if (!Array.isArray(raw) || raw.length > 100 || raw.some((_, index) => !Object.hasOwn(raw, index)) || Array.from({length: raw.length}, (_, index) => Object.hasOwn(raw, index)).some(present => !present) || (raw.length > 1 && raw.length !== setCount) || !Number.isSafeInteger(setIndex) || setIndex < 0 || setIndex >= setCount) return unknown();
  if (raw.some(group => !Array.isArray(group) || group.length > 100 || Array.from({length: group.length}, (_, index) => Object.hasOwn(group, index)).some(present => !present) || group.some(item => !item || typeof item !== 'object' || !Number.isSafeInteger(item.type) || item.type < 1 || item.type > 6 || !Number.isSafeInteger(item.num) || item.num < 1 || item.num > 100))) return unknown();
  const group = raw[setIndex] ?? raw[0] ?? [];
  return { status: raw.every(group => group.length === 0) ? 'empty' : 'read-only-descriptors', descriptors: group.map(({type,num}) => ({type,num})), raw, provenance, writable: false };
}

function parseCsvNumbers(value, field, actionIndex) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Pole ${field} ćwiczenia ${actionIndex + 1} zawiera nieprawidłową liczbę.`);
    return [value];
  }
  if (typeof value !== 'string' || !value.trim()) return [];
  const parts = value.split(',').map((part) => part.trim());
  if (parts.every((part) => !part)) return [];
  const values = parts.map((part) => part ? Number(part) : NaN);
  if (values.some((number) => !Number.isFinite(number) || number < 0)) {
    throw new Error(`Pole ${field} ćwiczenia ${actionIndex + 1} zawiera nieprawidłową liczbę.`);
  }
  return values;
}

function valueAt(values, index, field, actionIndex) {
  if (values.length === 1) return values[0];
  if (values.length === 0) throw new Error(`Brak wartości ${field} dla ćwiczenia ${actionIndex + 1}; nie można bezpiecznie wyliczyć objętości.`);
  if (values.length !== index.count) throw new Error(`Liczba wartości ${field} nie zgadza się z liczbą serii w ćwiczeniu ${actionIndex + 1}.`);
  return values[index.position];
}

function positiveInteger(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/** Resolve the work unit for a set in a Speediance saved-template action. */
export function resolveSavedTemplateSetUnit(action, setIndex, setCount, exerciseCountType, exerciseCountTypeConflict = false, exerciseMetadata = {}) {
  const explicitOnly = { ...action };
  delete explicitOnly.completionMethod;
  delete explicitOnly.countType;
  delete explicitOnly.selectCompletionMethod;
  const explicit = resolveSetUnit({ records: [explicitOnly], setIndex, setCount });
  const completionField = alignedSavedTemplateField(action, 'completionMethod', setIndex, setCount);
  const countTypeField = alignedSavedTemplateField(action, 'countType', setIndex, setCount);
  const selectionField = alignedSavedTemplateField(action, 'selectCompletionMethod', setIndex, setCount);
  const evidence = [...explicit.unitEvidence];
  const addFieldEvidence = (field, source, resolved, issue) => {
    evidence.push({
      field,
      source,
      ...(resolved.present ? { rawValue: resolved.value } : {}),
      ...(resolved.unit ? { interpretedUnit: resolved.unit } : {}),
      ...(resolved.issue ?? issue ? { issue: resolved.issue ?? issue } : {})
    });
  };

  const completion = decodeSavedTemplateCompletionMethod(completionField, exerciseMetadata);
  const hasCompletionField = completionField.present;
  if (hasCompletionField) addFieldEvidence('completionMethod', 'api-code:saved-template.completionMethod', completion);
  if (selectionField.present) addFieldEvidence('selectCompletionMethod', 'saved-template.selectCompletionMethod-metadata', selectionField, 'non-unit-selection-metadata');
  if (countTypeField.present) {
    addFieldEvidence('countType', 'saved-template.countType-metadata', countTypeField,
      completion.unit ? 'not-used-when-completionMethod-resolves-unit' : 'not-a-reliable-saved-template-unit-signal');
  }
  // Speediance exposes completionMethod differently by endpoint/version.
  // Saved-program reads observed here use 0=timed, 1=reps; reference client's write
  // path uses 1=reps, 2=timed. countType may be 2 on both timed and rep sets,
  // so it must never veto a recognized completionMethod.
  const apiUnit = completion.unit;
  const explicitUnit = explicit.unit === 'unknown' ? null : explicit.unit;
  if (explicitUnit && apiUnit && explicitUnit !== apiUnit) {
    return {
      unit: 'unknown', unitResolution: 'conflicting-evidence', unitEvidence: evidence,
      unitWarning: 'Jawna jednostka serii i completionMethod są sprzeczne; jednostka pozostaje unknown.'
    };
  }
  if (explicit.unit === 'unknown' && explicit.unitResolution !== 'no-unit-signal') {
    return { ...explicit, unitEvidence: evidence };
  }
  if (hasCompletionField) {
    if (completionField.issue || !apiUnit) {
      return {
        unit: 'unknown', unitResolution: 'unresolved', unitEvidence: evidence,
        unitWarning: 'Nieobsługiwana wartość lub lista completionMethod niezgodna z liczbą serii; jednostka pozostaje unknown.'
      };
    }
    return {
      unit: explicitUnit ?? apiUnit,
      unitResolution: explicitUnit ? 'explicit' : 'api-code-inference',
      unitEvidence: evidence,
      ...(countTypeField.present && countTypeField.value !== null
        ? { unitNote: 'completionMethod rozstrzyga jednostkę. countType zachowano jako surowe metadane, ale nie użyto go jako jednostki serii.' }
        : {})
    };
  }

  // Without a per-set completionMethod, the action's countType has appeared as
  // a constant in real templates and can mislabel repetitions as time. Keep it
  // in evidence for diagnostics, but require an explicit unit or a later,
  // endpoint-specific catalog completionMethod before classifying this set.
  // Malformed countType is diagnostic metadata too: it cannot veto an
  // independently valid explicit dose unit when completionMethod is absent.
  if (exerciseCountType !== undefined || exerciseCountTypeConflict) {
    evidence.push({
      field: 'exercise-catalog.countType', source: 'exercise-catalog.countType',
      rawValue: exerciseCountTypeConflict ? 'conflict' : exerciseCountType,
      issue: 'not-a-work-unit-field'
    });
  }
  if (explicit.unit !== 'unknown') {
    return { ...explicit, unitEvidence: evidence };
  }
  return {
    ...explicit,
    unitEvidence: evidence,
    ...(countTypeField.present || exerciseCountType !== undefined || exerciseCountTypeConflict
      ? { unitWarning: 'Speediance nie zwróciło rozstrzygającego completionMethod ani jawnej jednostki; countType nie wystarcza do oznaczenia serii.' }
      : {})
  };
}

function alignedSavedTemplateField(action, field, setIndex, setCount) {
  if (!action || !Object.hasOwn(action, field) || action[field] === null || action[field] === undefined || action[field] === '') {
    return { present: false };
  }
  const values = templateCsvValues(action[field]);
  if (!values.length) return { present: false };
  if (values.length === 1) return { present: true, value: values[0] };
  if (values.length !== setCount) return { present: true, issue: `length:${values.length}/${setCount}` };
  return { present: true, value: values[setIndex] };
}

/** Describe explicit API side markers; exercise names and set parity are not evidence. */
export function resolveSavedTemplateSetSide(action, setIndex, setCount) {
  if (!action || !Number.isSafeInteger(setIndex) || setIndex < 0 ||
      !Number.isSafeInteger(setCount) || setCount < 1 || setIndex >= setCount) {
    throw new Error('Nie można określić strony nieprawidłowej serii szablonu.');
  }
  const sideValues = templateCsvValues(action.leftRight);
  if (sideValues.some(value => !/^[012]$/.test(value))) {
    return { side: 'unknown', sideLabel: 'strona nierozpoznana' };
  }
  const field = alignedSavedTemplateField(action, 'leftRight', setIndex, setCount);
  if (!field.present || field.issue) return { side: 'unknown', sideLabel: 'strona nierozpoznana' };
  const value = typeof field.value === 'number' ? field.value
    : typeof field.value === 'string' && /^[012]$/.test(field.value.trim()) ? Number(field.value.trim()) : NaN;
  if (![0, 1, 2].includes(value)) return { side: 'unknown', sideLabel: 'strona nierozpoznana' };
  return { side: value, sideLabel: value === 0 ? 'obustronnie' : value === 1 ? 'lewa' : 'prawa' };
}

function templateCsvValues(value) {
  if (Array.isArray(value)) return value.map((part) => String(part).trim());
  if (typeof value === 'number' && Number.isFinite(value)) return [String(value)];
  if (typeof value === 'string' && value.trim()) return value.split(',').map((part) => part.trim());
  return [];
}

function templateCsvAt(action, field, index) {
  const values = templateCsvValues(action?.[field]);
  if (values.length === 1) return values[0];
  return values[index] ?? null;
}

function decodeSavedTemplateCompletionMethod(field, exerciseMetadata) {
  if (!field.present || field.issue) return { ...field };
  const code = typeof field.value === 'number'
    ? field.value
    : (typeof field.value === 'string' && /^\d+$/.test(field.value.trim()) ? Number(field.value.trim()) : NaN);
  // Pinned labatt API-NOTES section 7 observes timed Vita POST -> GET code 5.
  // Catalog provenance is mandatory; raw level or an exercise title is insufficient.
  const confirmedVita = exerciseMetadata?.dataStatTypeStatus === 'available' && exerciseMetadata.dataStatType === 6;
  const unit = code === 0 || code === 2 || (code === 5 && confirmedVita) ? 'seconds' : code === 1 ? 'reps' : null;
  return { ...field, ...(unit ? { unit } : { issue: 'unsupported-saved-template-completionMethod' }) };
}

export function formatSavedTemplateDose(rawWorkValue, unit) {
  const value = String(rawWorkValue);
  if (unit === 'seconds') return `${value} s`;
  if (unit === 'reps') return `${value} powt.`;
  return `${value} (jednostka nierozpoznana)`;
}

/** Read-only rest observation. Shared cells are supported; contradictory or
 * malformed secondary fields never disappear behind a valid primary value. */
export function resolveSavedTemplateRestPresentation(action, setIndex, setCount) {
  if (!Number.isSafeInteger(setCount) || setCount < 1 || !Number.isSafeInteger(setIndex) || setIndex < 0 || setIndex >= setCount) throw new TypeError('Invalid saved rest set context.');
  const fields = ['breakTime', 'breakTime2'].map(field => {
    const raw = action?.[field];
    if (raw === undefined || raw === null || raw === '') return { field, status: 'absent' };
    const cells = typeof raw === 'number' ? [raw] : typeof raw === 'string' ? raw.split(',').map(value => value.trim()) : [];
    if (![1, setCount].includes(cells.length) || cells.some(value =>
      typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value)) ||
      !Number.isSafeInteger(Number(value)) || Number(value) < 0 || Number(value) > 600)) return { field, status: 'invalid' };
    return { field, status: 'reported', value: Number(cells[cells.length === 1 ? 0 : setIndex]) };
  });
  const reported = fields.filter(field => field.status === 'reported');
  if (fields.some(field => field.status === 'invalid')) return { restStatus: 'invalid', restUnit: 'unknown' };
  if (!reported.length) return { restStatus: 'unreported', restUnit: 'unknown' };
  if (new Set(reported.map(field => field.value)).size !== 1) return { restStatus: 'conflicting', restUnit: 'unknown' };
  return { restStatus: 'reported', restSeconds: reported[0].value, restUnit: 'seconds', restSourceFields: reported.map(field => field.field) };
}

function numericSetValues(value) {
  const parts = Array.isArray(value)
    ? value
    : typeof value === 'number'
      ? [value]
      : typeof value === 'string' && value.trim()
        ? value.split(',').map((part) => part.trim())
        : [];
  if (!parts.length || parts.some((part) =>
    !(typeof part === 'number' && Number.isFinite(part)) &&
    !(typeof part === 'string' && part.trim() && Number.isFinite(Number(part)))
  )) return [];
  return parts.map(Number);
}

function numericSetValueAt(values, setIndex, setCount) {
  if (values.length === 1) return values[0];
  if (values.length === setCount) return values[setIndex];
  return null;
}

// One saved-read operation only. Exact string keys; no action identity or array reuse.
export function createSavedTemplateLoadPresentationReader() {
  const entries = new Map();
  let retainedBytes = 0;
  const parse = value => {
    if (typeof value !== 'string') return numericSetValues(value);
    if (entries.has(value)) return entries.get(value);
    const parsed = numericSetValues(value);
    // Bound retained UTF-16 key storage and numeric array cells conservatively.
    const bytes = value.length * 2 + parsed.length * 8;
    if (entries.size < 16 && bytes <= 8192 - retainedBytes) {
      const stable = Object.freeze(parsed);
      entries.set(value, stable);
      retainedBytes += bytes;
      return stable;
    }
    return parsed;
  };
  return (...args) => resolveSavedTemplateLoadPresentationWithParser(parse, ...args);
}

export function resolveSavedTemplateLoadPresentation(...args) {
  return resolveSavedTemplateLoadPresentationWithParser(numericSetValues, ...args);
}

/** Render one saved resistance value without mislabeling a Smart RM level as kg/lb. */
function recordedRmPresentation(action, presetId, setIndex, setCount, workUnit) {
  if (!getReferenceClientRmPresetById(presetId)) return null;
  const aliases=['templatePresetName','presetName','templatePreset','preset'];
  const names=[];let invalid=false;
  for(const key of aliases){const d=Object.getOwnPropertyDescriptor(action,key);if(!d)continue;if(!Object.hasOwn(d,'value')){invalid=true;continue;}const value=d.value;if(value==null||value==='')continue;if(typeof value!=='string'||value.length>200||!value.trim()||/[\u0000-\u001f\u007f]/.test(value)){invalid=true;continue;}names.push(value.trim());}
  const canonical=names.map(normalizedPresetName);
  if(invalid||new Set(canonical).size>1||names.length&&(!canonical[0]||!hasValidReferenceClientRmPresetNameAliases(action,presetId)))return {
    loadType:'preset-load-unknown',loadUnit:'unknown',recordedPresetStatus:'conflicting-aliases',
    loadDiagnostics:['preset-name-conflict'],displayLoad:'sprzeczne oznaczenia presetu; obciążenie niepotwierdzone'
  };
  const diagnostics=['saved-load-representation-unqualified'];
  for(const field of ['setsAndReps','weights','counterweight','counterweight2']){
    const raw=action[field];if(raw===undefined||raw===null||raw==='')continue;
    const parsed=numericSetValues(raw);
    if(!parsed.length)diagnostics.push('saved-load-source-malformed');
    else if(parsed.length!==1&&parsed.length!==setCount)diagnostics.push('saved-load-source-alignment');
  }
  return {loadType:'preset-load-unknown',loadUnit:'unknown',recordedPresetId:presetId,
    ...(names.length?{recordedPresetName:names[0],recordedPresetSource:'returned-name-alias',recordedPresetStatus:'recorded-only'}:{recordedPresetStatus:'id-only-unqualified'}),
    loadDiagnostics:[...new Set(diagnostics)],
    displayLoad:names.length?`${names[0]} (zapisany preset)`:`Preset ID ${presetId}; znaczenie obciążenia w odczycie niepotwierdzone`};
}

function resolveSavedTemplateLoadPresentationWithParser(parseNumericValues, action, setIndex, setCount, weightUnit = 'unknown', workUnit, {
  staticLoadProtocol = 'legacy-reference-client-wire-lb-get-kg', accountUnit
} = {}) {
  if (!action || !Number.isSafeInteger(setIndex) || setIndex < 0 || !Number.isSafeInteger(setCount) || setCount < 1 || setIndex >= setCount) {
    throw new Error('Nie można opisać obciążenia nieprawidłowej serii szablonu.');
  }
  if (!['kg', 'lb', 'unknown'].includes(weightUnit)) throw new Error('Jednostka obciążenia musi być kg, lb albo unknown.');
  const springGroups = readSavedTemplateSpringGroups(action, setIndex, setCount);
  if (!['absent', 'empty'].includes(springGroups.status)) return { loadType: 'pilates-spring-descriptors', loadUnit: 'unknown', displayLoad: springGroups.status === 'unknown' ? 'Taśmy: dane nierozpoznane' : 'Taśmy: deskryptory odczytu; opór niepotwierdzony', springGroups };
  const weights = parseNumericValues(action.weights);
  const rawCounterweight = action.counterweight;
  const counterweights = parseNumericValues(rawCounterweight);
  const rawCounterweight2 = action.counterweight2;
  const counterweights2 = parseNumericValues(rawCounterweight2);
  const weight = numericSetValueAt(weights, setIndex, setCount);
  const rmLevel = numericSetValueAt(counterweights, setIndex, setCount);
  const rmLevel2 = numericSetValueAt(counterweights2, setIndex, setCount);
  const presetId = getTemplatePresetId(action);
  const hasPresetIdField = action.templatePresetId !== undefined || action.presetId !== undefined;
  if (isObservedRmPresetAction(action)) {
    const name = [action.templatePresetName, action.presetName, action.templatePreset, action.preset]
      .find((value) => typeof value === 'string' && value.trim());
    const label = name && normalizedPresetName(name)
      ? name.trim()
      : getReferenceClientRmPresetById(presetId).name;
    const resolvedWorkUnit = workUnit ?? resolveSavedTemplateSetUnit(action, setIndex, setCount).unit;
    if (resolvedWorkUnit !== 'reps') {
      return {
        loadType: 'preset-load-unknown',
        loadUnit: 'unknown',
        recordedPresetName: getReferenceClientRmPresetById(presetId).name,
        recordedPresetStatus: 'recorded-only', loadDiagnostics: ['rm-work-unit-unconfirmed'],
        displayLoad: resolvedWorkUnit === 'seconds'
          ? `${label} · seria czasowa; RM nie dotyczy`
          : `${label} · jednostka serii nierozpoznana`
      };
    }
    return {
      loadType: 'smart-rm-preset',
      loadUnit: 'device-managed',
      displayLoad: `${label} · Smart RM (opór dobiera urządzenie)`,
      technicalRmLevel: rmLevel,
      ...(rmLevel2 === null ? {} : { technicalRmLevel2: rmLevel2 })
    };
  }
  const recordedPreset = recordedRmPresentation(action, presetId, setIndex, setCount, workUnit);
  if (recordedPreset) return recordedPreset;
  if (presetId !== null && presetId >= 0) {
    return {
      loadType: 'preset-load-unknown',
      loadUnit: 'unknown',
      displayLoad: `preset ID ${presetId} · obciążenie nierozpoznane`
    };
  }
  if (hasPresetIdField && presetId !== -1) {
    return { loadType: 'preset-load-unknown', loadUnit: 'unknown', displayLoad: 'preset/obciążenie nierozpoznane' };
  }
  // Populated malformed/misaligned RM cells are not absent selectors.
  const hasSelectorInput = value => value != null && !(typeof value === 'string' && !value.trim()) && !(Array.isArray(value) && value.length === 0);
  const hasCounterweightData = hasSelectorInput(rawCounterweight) || hasSelectorInput(rawCounterweight2);
  const hasAmbiguousPresetWeightMarker = weight !== null && Math.abs(weight - 3.5) < 1e-9 && presetId === null;
  // reference client’s preset path writes both counterweight fields and weights=3.5.
  // If either counterweight is present but the full preset shape failed
  // recognition, never fall through and label the placeholder as account kg.
  if (hasCounterweightData || hasAmbiguousPresetWeightMarker) {
    return { loadType: 'rm-or-load-format-ambiguous', loadUnit: 'unknown', displayLoad: 'format RM/obciążenia niejednoznaczny' };
  }
  if (weight === null) return { loadType: 'unreported', loadUnit: 'unknown', displayLoad: null };
  if (weight === 0 && (presetId === -1 || presetId === null)) {
    return { loadType: 'no-external-load', loadUnit: 'none', displayLoad: 'bez zewnętrznego obciążenia' };
  }
  // Static GET values have incompatible public protocol lineages. Resolve only
  // after ruling out RM markers; a verbatim value needs its source account unit.
  if (!STATIC_LOAD_PROTOCOLS.includes(staticLoadProtocol)) throw new TypeError('Nieznany protokół obciążenia statycznego.');
  const sourceUnitKnown = staticLoadProtocol !== 'account-unit-verbatim' || ['kg', 'lb'].includes(accountUnit);
  const resolvedWeightUnit = sourceUnitKnown ? weightUnit : 'unknown';
  let decodedWeight = weight;
  if (resolvedWeightUnit !== 'unknown') {
    try {
      decodedWeight = decodeStaticLoad({
        protocol: staticLoadProtocol, wireOrReadback: weight, phase: 'readback',
        accountUnit: staticLoadProtocol === 'account-unit-verbatim' ? accountUnit : 'kg',
        outputUnit: resolvedWeightUnit
      });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      // A malformed GET row must not prevent reading other exercises. This
      // presentation result grants no permission to serialize an invalid load.
      return {
        loadType: 'load-format-invalid', loadUnit: 'unknown',
        displayLoad: `${weight} (nieprawidłowa wartość obciążenia z API)`
      };
    }
  }
  // Cosmetic noise cleanup only, never a dose-grid clamp. A value must be
  // within one IEEE754 ULP of a one-decimal representation to be shortened.
  // Actual non-grid values and unknown-unit values remain literal.
  const decimalCandidate = Math.round(decodedWeight * 10) / 10;
  const magnitude = Math.max(Math.abs(decodedWeight), Math.abs(decimalCandidate));
  const ulp = magnitude === 0 ? Number.MIN_VALUE : Math.max(Number.MIN_VALUE, 2 ** (Math.floor(Math.log2(magnitude)) - 52));
  const displayWeight = resolvedWeightUnit !== 'unknown' && decimalCandidate !== 0 && Math.sign(decimalCandidate) === Math.sign(decodedWeight) && Math.abs(decodedWeight - decimalCandidate) <= ulp
    ? decimalCandidate : decodedWeight;
  return {
    loadType: 'static-account-load',
    loadUnit: resolvedWeightUnit,
    displayLoad: resolvedWeightUnit === 'unknown' ? `${weight} (jednostka obciążenia nierozpoznana)` : `${displayWeight} ${resolvedWeightUnit}`
  };
}

/**
 * Validate per-set unit confirmations against the exact current action rows.
 * The caller resolves each answer against API evidence before storing it, so a
 * user answer cannot override a known, contradictory unit.
 */
export function indexSavedTemplateUnitConfirmations(actionLibraryList, confirmations) {
  if (confirmations === undefined) return new Map();
  if (!Array.isArray(actionLibraryList) || !Array.isArray(confirmations)) {
    throw new Error('Potwierdzenia jednostek muszą wskazywać serie z aktualnego szablonu.');
  }
  const result = new Map();
  for (const confirmation of confirmations) {
    const { groupId, actionLibraryId, sets } = confirmation || {};
    if (!Number.isSafeInteger(groupId) || groupId < 1 || !Number.isSafeInteger(actionLibraryId) || actionLibraryId < 1 || !Array.isArray(sets) || !sets.length) {
      throw new Error('Każde potwierdzenie jednostki wymaga dokładnego groupId, actionLibraryId i co najmniej jednej serii.');
    }
    const matchingActions = actionLibraryList.filter((action) =>
      Number(action?.groupId) === groupId && Number(action?.actionLibraryId) === actionLibraryId
    );
    if (matchingActions.length !== 1) {
      throw new Error(`Potwierdzenie jednostki wskazuje ${groupId}/${actionLibraryId}, które nie występuje dokładnie raz w bieżącym szablonie.`);
    }
    const workValues = parseCsvNumbers(matchingActions[0].setsAndReps, 'setsAndReps', 0);
    const rowKey = `${groupId}:${actionLibraryId}`;
    if (result.has(rowKey)) throw new Error(`Powtórzone potwierdzenie jednostek dla ćwiczenia ${groupId}/${actionLibraryId}.`);
    const perSet = new Map();
    for (const item of sets) {
      if (!item || !Number.isSafeInteger(item.set) || item.set < 1 || item.set > workValues.length || !['reps', 'seconds'].includes(item.unit)) {
        throw new Error(`Potwierdzenie jednostki dla ćwiczenia ${groupId}/${actionLibraryId} wskazuje nieprawidłową serię lub jednostkę.`);
      }
      if (perSet.has(item.set - 1)) throw new Error(`Powtórzone potwierdzenie jednostki dla serii ${item.set} ćwiczenia ${groupId}/${actionLibraryId}.`);
      perSet.set(item.set - 1, item.unit);
    }
    result.set(rowKey, perSet);
  }
  return result;
}

export function resolveSavedTemplateSetUnitWithConfirmation(action, setIndex, setCount, {
  exerciseCountType,
  exerciseCountTypeConflict = false,
  confirmedUnit,
  confirmationSource = 'user-confirmed-current-chat',
  exerciseMetadata
} = {}) {
  const resolved = resolveSavedTemplateSetUnit(action, setIndex, setCount, exerciseCountType, exerciseCountTypeConflict, exerciseMetadata);
  if (confirmedUnit === undefined) return resolved;
  if (!['reps', 'seconds'].includes(confirmedUnit)) {
    throw new Error('Potwierdzona jednostka musi być reps albo seconds.');
  }
  if (resolved.unitResolution === 'conflicting-evidence') {
    throw new Error('API zwróciło sprzeczne sygnały jednostki; potwierdzenie użytkownika nie może ich nadpisać. Najpierw wyjaśnij konflikt źródłowy.');
  }
  if (resolved.unit !== 'unknown') {
    if (resolved.unit !== confirmedUnit) {
      throw new Error(`API jednoznacznie wskazuje ${resolved.unit}; potwierdzenie ${confirmedUnit} nie może nadpisać rozpoznanej jednostki.`);
    }
    return resolved;
  }
  return {
    ...resolved,
    unit: confirmedUnit,
    unitResolution: confirmationSource === 'user-confirmed-saved-template' ? 'user-confirmed-saved-template' : 'user-confirmed',
    unitEvidence: [
      ...resolved.unitEvidence,
      { field: 'user-confirmed-unit', source: confirmationSource, rawValue: action?.setsAndReps, interpretedUnit: confirmedUnit }
    ],
    unitConfirmationNote: confirmationSource === 'user-confirmed-saved-template'
      ? 'API nie rozstrzygnęło jednostki; GM Coach zastosował wcześniejsze potwierdzenie zapisane lokalnie dla tej serii szablonu. Potwierdzenie nie zmienia danych Speediance.'
      : 'API nie rozstrzygnęło jednostki; użytkownik potwierdził ją dla tej odpowiedzi. Potwierdzenie nie zmienia danych Speediance.'
  };
}

/**
 * Check exact saved work values before Smart RM conversion. A user's explicit
 * unit confirmation may resolve only an API `unknown`; it cannot override a
 * determinate API result such as seconds.
 */
export function validateSavedTemplateSmartRmReps(action, sets, {
  exerciseCountType,
  exerciseCountTypeConflict = false,
  exerciseMetadata,
  unitConfirmedByUser = false,
  exerciseLabel = 'ćwiczenie'
} = {}) {
  const savedWorkValues = parseCsvNumbers(action?.setsAndReps, 'setsAndReps', 0);
  if (!Array.isArray(sets) || sets.length !== savedWorkValues.length || savedWorkValues.length < 1) {
    throw new Error(`${exerciseLabel}: liczba serii Smart RM musi dokładnie odpowiadać wartościom w aktualnym szablonie. Niczego nie zmieniono.`);
  }
  const units = [];
  for (const [setIndex, set] of sets.entries()) {
    if (!set || set.unit !== 'reps' || Number(set.reps) !== savedWorkValues[setIndex]) {
      throw new Error(`${exerciseLabel}, seria ${setIndex + 1}: potwierdzone powtórzenia muszą dokładnie odpowiadać wartości zapisanej w szablonie (${savedWorkValues[setIndex]}). Nie zamieniaj sekund na reps.`);
    }
    const resolution = resolveSavedTemplateSetUnit(
      action,
      setIndex,
      savedWorkValues.length,
      exerciseCountType,
      exerciseCountTypeConflict,
      exerciseMetadata
    );
    if (resolution.unitResolution === 'conflicting-evidence') {
      throw new Error(`${exerciseLabel}, seria ${setIndex + 1}: API zwróciło sprzeczne sygnały jednostki. Potwierdzenie reps nie może nadpisać konfliktu; Smart RM wymaga jednoznacznych powtórzeń.`);
    }
    if (resolution.unit !== 'reps' && !(resolution.unit === 'unknown' && unitConfirmedByUser === true)) {
      throw new Error(`${exerciseLabel}, seria ${setIndex + 1}: API wskazuje ${resolution.unit}. Smart RM wymaga jednoznacznych powtórzeń. Jeśli API zwraca unknown, zapytaj użytkownika, czy dokładna wartość ${savedWorkValues[setIndex]} oznacza powtórzenia; potwierdzenie może rozstrzygnąć unknown, ale nie nadpisuje rozpoznanej jednostki seconds.`);
    }
    units.push({
      set: setIndex + 1,
      unit: 'reps',
      unitResolution: resolution.unit === 'unknown' ? 'user-confirmed' : resolution.unitResolution,
      rawApiUnit: resolution.unit,
      ...(resolution.unitWarning ? { unitWarning: resolution.unitWarning } : {})
    });
  }
  return { savedWorkValues, sets: units };
}

export function getSavedTemplateId(template) {
  if (!template || typeof template !== 'object') return null;
  for (const key of ['id', 'templateId', 'customTrainingTemplateId']) {
    const id = positiveInteger(template[key]);
    if (id !== null) return id;
  }
  return null;
}

function nonNegativePresetId(value) {
  const id = Number.isSafeInteger(value)
    ? value
    : (typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : NaN);
  return Number.isSafeInteger(id) && id >= 0 && id <= 1000 ? id : null;
}

export function preserveMatchedPresetIds(currentActions, replacementActions) {
  if (!Array.isArray(currentActions) || !Array.isArray(replacementActions)) {
    throw new Error('Do zachowania presetów potrzebne są pełne listy ćwiczeń bieżącego i nowego szablonu.');
  }
  const { matchedPrevious } = matchSavedActionOccurrences(currentActions, replacementActions);
  return replacementActions.map((action, index) => {
    if (!action || typeof action !== 'object' || Array.isArray(action) || Object.hasOwn(action, 'templatePresetId')) return action;
    const existing = matchedPrevious[index]?.action;
    const presetId = nonNegativePresetId(existing?.templatePresetId);
    return presetId === null ? action : { ...action, templatePresetId: presetId };
  });
}

/** Prevent raw API fields from bypassing the typed reference client mode translation. */
export function assertRawActionListResistanceModesUnchanged(currentActions, replacementActions) {
  if (!Array.isArray(currentActions) || !Array.isArray(replacementActions)) {
    throw new Error('Sprawdzenie trybów wymaga bieżącej i pełnej listy ćwiczeń szablonu.');
  }
  const normalize = (value) => value === undefined || value === null || value === ''
    ? []
    : (typeof value === 'number' ? [String(value)] : String(value).split(',').map((part) => part.trim()));
  const { matchedPrevious } = matchSavedActionOccurrences(currentActions, replacementActions);
  for (const [index, action] of replacementActions.entries()) {
    const existing = matchedPrevious[index]?.action;
    const requestedModes = normalize(action?.sportMode);
    if (existing) {
      if (JSON.stringify(normalize(existing.sportMode)) !== JSON.stringify(requestedModes)) {
        throw new Error(`Ćwiczenie ${index + 1}: nie zmieniaj surowego sportMode przez action_library_list. Użyj resistance_mode_updates z trybami klienta referencyjnego, aby zachować zgodność enumów i nie pomylić ich z trybem GM1 Constant (nowsze materiały: Fixed Speed, marketingowo także Isokinetic) ani osobną asystą Spotter, których klient referencyjny nie zapisuje w tym polu.`);
      }
    } else if (requestedModes.some((mode) => mode !== '1')) {
      throw new Error(`Nowe ćwiczenie ${index + 1}: surowy sportMode może ustawić tylko domyślny Standard (kod szablonu klienta referencyjnego 1). Dla innych trybów zapisz ćwiczenie najpierw, a potem użyj resistance_mode_updates.`);
    }
  }
}

/**
 * Update per-set resistance modes on an existing template using reference client's
 * visible input codes unchanged into the matching sportMode fields.
 * Unchanged actions and all of their fields are copied byte-for-byte.
 */
export function applyReferenceClientResistanceModeUpdates(currentActions, updates) {
  if (!Array.isArray(currentActions) || !Array.isArray(updates) || updates.length < 1 || updates.length > 100) {
    throw new Error('Zmiana trybów wymaga bieżącej listy ćwiczeń i od 1 do 100 dokładnie wskazanych ćwiczeń.');
  }
  const updateByKey = new Map();
  for (const [updateIndex, update] of updates.entries()) {
    const groupId = Number(update?.groupId);
    const actionLibraryId = Number(update?.actionLibraryId);
    if (!Number.isSafeInteger(groupId) || groupId < 1 || !Number.isSafeInteger(actionLibraryId) || actionLibraryId < 1) {
      throw new Error(`Zmiana trybu ${updateIndex + 1}: wymagane są prawidłowe groupId i actionLibraryId.`);
    }
    const key = `${groupId}:${actionLibraryId}`;
    if (updateByKey.has(key)) throw new Error(`Zmiana trybów wskazuje powtórzone ćwiczenie/wariant ${key}.`);
    if (!Array.isArray(update.modes) || update.modes.length < 1 || update.modes.length > 100 ||
        update.modes.some((mode) => !Number.isSafeInteger(mode))) {
      throw new Error(`Zmiana trybu ${updateIndex + 1}: podaj jeden całkowity kod klienta referencyjnego dla każdej serii.`);
    }
    updateByKey.set(key, update);
  }

  for (const key of updateByKey.keys()) {
    const occurrences = currentActions.filter((action) => `${Number(action?.groupId)}:${Number(action?.actionLibraryId)}` === key).length;
    if (occurrences > 1) {
      throw new Error(`Ćwiczenie/wariant ${key} występuje ${occurrences} razy w szablonie. Zmiana trybu nie wskazuje jednoznacznej pozycji. Przygotuj pełny wynikowy plan i podgląd naukowy zamiast zbiorczej zmiany wszystkich wystąpień. Niczego nie zmieniono.`);
    }
  }
  const matched = new Set();
  const updated = currentActions.map((action, actionIndex) => {
    const key = `${Number(action?.groupId)}:${Number(action?.actionLibraryId)}`;
    const update = updateByKey.get(key);
    if (!update) return action;
    matched.add(key);
    if (!['absent', 'empty'].includes(readSavedTemplateSpringGroups(action, 0, String(action.setsAndReps ?? '').split(',').length).status)) throw new Error('Niepotwierdzony zapis oporu taśm: nie konwertuj springGroupList na Smart RM.');
    const workValues = parseCsvNumbers(action.setsAndReps, 'setsAndReps', actionIndex);
    if (workValues.length < 1 || update.modes.length !== workValues.length) {
      throw new Error(`Ćwiczenie ${key}: liczba trybów (${update.modes.length}) musi odpowiadać liczbie serii w aktualnym szablonie (${workValues.length}). Niczego nie zmieniono.`);
    }
    const wireModes = mapReferenceClientResistanceModesToWire(update.modes);
    return { ...action, sportMode: wireModes.join(',') };
  });

  for (const key of updateByKey.keys()) {
    if (!matched.has(key)) throw new Error(`Wskazane ćwiczenie/wariant ${key} nie występuje w aktualnym szablonie. Niczego nie zmieniono.`);
  }
  return updated;
}

/**
 * Converts selected saved actions to a named machine RM preset. Speediance
 * receives the exact preset ID, technical 3.5 placeholder, and the public
 * preset's internal adapter default in counterweight fields. These values
 * are neither prescribed rep-max targets, percentages, nor kilograms.
 */
export function applySmartRmConversions(currentActions, conversions, { primaryGoal, metadataById } = {}) {
  if (!Array.isArray(currentActions) || !Array.isArray(conversions) || conversions.length < 1 || conversions.length > 100) {
    throw new Error('Konwersja na maszynowy Smart RM wymaga zapisanej listy ćwiczeń i od 1 do 100 wskazanych ćwiczeń.');
  }
  if (typeof primaryGoal !== 'string' || !primaryGoal.trim()) {
    throw new Error('Konwersja zapisanego planu na Smart RM wymaga aktualnego celu treningowego z profilu albo rozmowy. Nie wyprowadzaj celu ze starej nazwy ani presetu szablonu.');
  }
  const conversionByKey = new Map();
  for (const [index, conversion] of conversions.entries()) {
    const key = `${Number(conversion?.groupId)}:${Number(conversion?.actionLibraryId)}`;
    if (!Number.isSafeInteger(Number(conversion?.groupId)) || Number(conversion.groupId) < 1 ||
        !Number.isSafeInteger(Number(conversion?.actionLibraryId)) || Number(conversion.actionLibraryId) < 1) {
      throw new Error(`Konwersja ${index + 1}: wymagane są prawidłowe groupId i actionLibraryId.`);
    }
    if (conversionByKey.has(key)) throw new Error(`Konwersja zawiera powtórzone ćwiczenie/wariant ${key}.`);
    if (conversion.smartRmPresetId !== undefined &&
        (!Number.isSafeInteger(conversion.smartRmPresetId) || !getReferenceClientRmPresetById(conversion.smartRmPresetId))) {
      throw new Error(`Konwersja ${index + 1}: smartRmPresetId musi być jednym z publicznych ID menu klienta referencyjnego: 1, 3 albo 5.`);
    }
    if (!getReferenceClientRmPresetByName(conversion.smartRmPresetName)) {
      throw new Error(`Konwersja ${index + 1}: wymagaj jawnego docelowego presetu wynikającego z celu. Nie dziedzicz presetu ze starego szablonu.`);
    }
    if (Object.hasOwn(conversion,'trainingGoal') && !['hypertrophy','strength','endurance'].includes(conversion.trainingGoal)) throw new Error('Invalid explicit exercise trainingGoal.');
    resolveGoalBoundSmartRmPresetName(conversion.trainingGoal ?? primaryGoal, conversion.smartRmPresetName);
    if (!Array.isArray(conversion.sets) || conversion.sets.length < 1 || conversion.sets.length > 100) {
      throw new Error(`Konwersja ${index + 1}: podaj serie powtórzeniowe w kolejności zapisanej w szablonie; RIR podaj tylko wtedy, gdy użytkownik je określił.`);
    }
    const conversionSets = conversion.sets.map((set) => ({ ...set }));
    conversionSets.forEach((set, setIndex) => {
      if (!set || set.unit !== 'reps' || !Number.isSafeInteger(set.reps) ||
          (set.rirTarget !== undefined && (!Number.isSafeInteger(set.rirTarget) || set.rirTarget < 0 || set.rirTarget > 5)) ||
          (set.rmLevel !== undefined && (!Number.isSafeInteger(set.rmLevel) || set.rmLevel < 1 || set.rmLevel > 20)) ||
          set.targetPercent1RM !== undefined || set.rmValue !== undefined) {
        throw new Error(`Konwersja ${index + 1}, seria ${setIndex + 1}: wymagane są unit=reps i reps; RIR, jeśli podano, musi być całkowite 0–5. Opcjonalny rmLevel musi być całkowity 1–20. Nie podawaj procentu ani rmValue.`);
      }
    });
    conversionByKey.set(key, { ...conversion, sets: conversionSets });
  }

  for (const key of conversionByKey.keys()) {
    const occurrences = currentActions.filter((action) => `${Number(action?.groupId)}:${Number(action?.actionLibraryId)}` === key).length;
    if (occurrences > 1) {
      throw new Error(`Ćwiczenie/wariant ${key} występuje ${occurrences} razy w szablonie. Konwersja Smart RM nie wskazuje jednoznacznej pozycji. Przygotuj pełny wynikowy plan i podgląd naukowy zamiast zbiorczej konwersji wszystkich wystąpień. Niczego nie zmieniono.`);
    }
  }
  const matched = new Set();
  const converted = currentActions.map((action, actionIndex) => {
    const key = `${Number(action?.groupId)}:${Number(action?.actionLibraryId)}`;
    const conversion = conversionByKey.get(key);
    if (!conversion) return action;
    matched.add(key);
    if (!['absent', 'empty'].includes(readSavedTemplateSpringGroups(action, 0, String(action.setsAndReps ?? '').split(',').length).status)) throw new Error('Niepotwierdzony zapis oporu taśm: nie konwertuj springGroupList na Smart RM.');
    const savedReps = parseCsvNumbers(action.setsAndReps, 'setsAndReps', actionIndex);
    if (savedReps.length !== conversion.sets.length || savedReps.some((reps) => !Number.isSafeInteger(reps) || reps < 1 || reps > MAX_PRESET_REPS)) {
      throw new Error(`Ćwiczenie ${actionIndex + 1}: wartości setsAndReps nie są jednoznacznym zakresem 1–${MAX_PRESET_REPS} powtórzeń albo liczba serii się nie zgadza. Nie zmieniono szablonu.`);
    }
    validateSavedTemplateSmartRmReps(action, conversion.sets, {
      exerciseMetadata: metadataById?.get(Number(action.groupId)),
      unitConfirmedByUser: conversion.unitConfirmedByUser === true,
      exerciseLabel: `Ćwiczenie ${actionIndex + 1}`
    });
    const savedModes = parseCsvNumbers(String(action.sportMode ?? ''), 'sportMode', actionIndex);
    if (!savedModes.length || (savedModes.length !== 1 && savedModes.length !== savedReps.length) || savedModes.some((mode) => ![1, 2, 3].includes(mode))) {
      throw new Error(`Ćwiczenie ${actionIndex + 1}: Smart RM można połączyć tylko z rozpoznanym trybem klienta referencyjnego (1=Standard, 2=Chain, 3=Eccentric) dla każdej serii. Zachowaj bieżący tryb; nie mapuj sprzętowego GM1 Constant (nowsze materiały: Fixed Speed, marketingowo Isokinetic) ani Spotter do tego pola. Nie zmieniono szablonu.`);
    }
    conversion.sets.forEach((set, setIndex) => {
      if (!set || set.unit !== 'reps' || set.reps !== savedReps[setIndex]) {
        throw new Error(`Ćwiczenie ${actionIndex + 1}, seria ${setIndex + 1}: wymagane są jawnie potwierdzone reps i dokładna liczba zapisana w tym szablonie. Nie wyprowadzaj ich z czasu.`);
      }
    });
    const existingPresetName = [action?.templatePresetName, action?.presetName, action?.templatePreset, action?.preset]
      .find((value) => typeof value === 'string' && value.trim());
    const presetName = conversion.smartRmPresetName;
    const referenceClientPreset = getReferenceClientRmPresetByName(presetName);
    if (!referenceClientPreset || !getReferenceClientRmPresetRules(presetName)) {
      throw new Error(`Ćwiczenie ${actionIndex + 1}: brakuje jawnej, wspieranej nazwy presetu zgodnej z celem. Nie dziedziczę „${existingPresetName || 'brak starego presetu'}”; niczego nie zmieniono.`);
    }
    if (conversion.smartRmPresetId !== undefined && conversion.smartRmPresetId !== referenceClientPreset.id) {
      throw new Error(`Ćwiczenie ${actionIndex + 1}: preset „${presetName}” ma publiczne ID klienta referencyjnego ${referenceClientPreset.id}, a podano ${conversion.smartRmPresetId}. Niczego nie zmieniono.`);
    }
    const presetId = referenceClientPreset.id;
    conversion.sets.forEach((set, setIndex) => {
      try { set.rmLevel = validateReferenceClientRmLevel({ rmLevel: set.rmLevel, reps: set.reps, presetName }).rmLevel; }
      catch (error) { throw new Error(`Ćwiczenie ${actionIndex + 1}, seria ${setIndex + 1}: ${error.message} Niczego nie zmieniono.`); }
    });
    const loadPayload = buildExerciseLoadPayload('smart-rm', conversion.sets, { smartRmPresetName: presetName });
    // A reviewed conversion replaces the preset, including read-only aliases
    // returned by older endpoints. Do not retain contradictory old aliases or
    // invent extra writable API fields for the new preset.
    const canonicalAction = { ...action };
    for (const alias of ['presetId', 'presetName', 'templatePreset', 'preset']) delete canonicalAction[alias];
    return {
      ...canonicalAction,
      templatePresetId: presetId,
      templatePresetName: referenceClientPreset.name,
      // Normalize the saved dose into the same per-set work-unit fields the
      // reference client writer sends. A prior endpoint may have left conflicting
      // legacy codes even after the user confirmed reps.
      setsAndReps: savedReps.join(','),
      selectCompletionMethod: conversion.sets.map(() => '1').join(','),
      completionMethod: conversion.sets.map(() => '1').join(','),
      countType: conversion.sets.map(() => '1').join(','),
      weights: loadPayload.weights,
      counterweight: loadPayload.counterweight,
      counterweight2: loadPayload.counterweight2
    };
  });
  for (const key of conversionByKey.keys()) {
    if (!matched.has(key)) throw new Error(`Wskazane ćwiczenie/wariant ${key} nie występuje w aktualnym szablonie. Niczego nie zmieniono.`);
  }
  return converted;
}

export function createSavedTemplateSnapshot(template, { includeActionLibraryList = true } = {}) {
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    throw new Error('Dane zapisanego programu Speediance są nieprawidłowe.');
  }
  const code = template.code ?? template.templateCode;
  if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
    throw new Error('Zapisany program nie ma stabilnego kodu Speediance; nie można go edytować bez ryzyka wskazania innego treningu.');
  }
  const id = getSavedTemplateId(template);
  if (id === null) throw new Error('Speediance nie zwróciło numerycznego ID szablonu wymaganego do jego aktualizacji lub usunięcia.');
  if (typeof template.name !== 'string' || !template.name.trim()) {
    throw new Error('Speediance nie zwróciło nazwy szablonu.');
  }
  if (!Array.isArray(template.actionLibraryList)) {
    throw new Error('Szczegóły programu nie zawierają listy ćwiczeń w oczekiwanym formacie.');
  }
  return {
    id,
    code,
    name: template.name.trim(),
    ...(positiveInteger(template.deviceType) !== null ? { deviceType: positiveInteger(template.deviceType) } : {}),
    ...(Number.isFinite(Number(template.totalCapacity)) ? { totalCapacity: Number(template.totalCapacity) } : {}),
    // bgColor is echoed by buildSavedTemplateUpdatePayload. Bind it into the
    // digest so a concurrent color-only edit cannot be overwritten as stale.
    bgColor: Number.isFinite(Number(template.bgColor)) ? Number(template.bgColor) : 0,
    ...(includeActionLibraryList ? { actionLibraryList: template.actionLibraryList } : {})
  };
}

export function savedTemplateDigest(template) {
  const snapshot = createSavedTemplateSnapshot(template);
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function validateActionList(value, { displayUnit, exerciseMetadataByAction, staticCapacityLoads, preservedBandIndices = new Set() } = {}) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new Error('action_library_list musi zawierać od 1 do 100 ćwiczeń z najnowszego podglądu programu.');
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > 512_000) throw new Error('Lista ćwiczeń przekracza dozwolony rozmiar.');
  let totalCapacity = 0;
  const actions = value.map((action, index) => {
    if (preservedBandIndices.has(index)) {
      if (typeof action.capacity !== 'number' || !Number.isFinite(action.capacity) || action.capacity < 0 || action.capacity > 1_000_000_000) throw new Error('Brak potwierdzonej capacity API zachowanej akcji taśm; nie można przeliczyć sumy edytowanego programu.');
      totalCapacity += action.capacity;
      return action;
    }
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      throw new Error(`Ćwiczenie ${index + 1} ma nieprawidłowy format.`);
    }
    if (positiveInteger(action.groupId) === null || positiveInteger(action.actionLibraryId) === null) {
      throw new Error(`Ćwiczenie ${index + 1} musi zachować groupId i actionLibraryId z katalogu Speediance.`);
    }
    if (typeof action.setsAndReps !== 'string' || !action.setsAndReps.trim() || action.setsAndReps.length > 2000) {
      throw new Error(`Ćwiczenie ${index + 1} musi zawierać setsAndReps z liczbą powtórzeń albo sekund dla każdej serii.`);
    }
    for (const field of ACTION_FIELDS) {
      if (action[field] !== undefined && typeof action[field] !== 'string' && typeof action[field] !== 'number') {
        throw new Error(`Pole ${field} ćwiczenia ${index + 1} musi zachować typ tekstowy lub liczbowy z API.`);
      }
      if (typeof action[field] === 'string' && action[field].length > 2000) {
        throw new Error(`Pole ${field} ćwiczenia ${index + 1} przekracza limit długości.`);
      }
    }
    const reps = parseCsvNumbers(action.setsAndReps, 'setsAndReps', index);
    if (!reps.length || reps.length > 100) throw new Error(`Ćwiczenie ${index + 1} musi mieć od 1 do 100 serii.`);
    if (action.confirmedUnits !== undefined && (!Array.isArray(action.confirmedUnits) ||
        action.confirmedUnits.length !== reps.length ||
        action.confirmedUnits.some((unit) => !['reps', 'seconds'].includes(unit)))) {
      throw new Error(`Ćwiczenie ${index + 1}: confirmedUnits musi jawnie podawać reps albo seconds dla każdej serii.`);
    }
    const resolvedUnits = reps.map((_, setIndex) => {
      const confirmation = action.confirmedUnits?.[setIndex];
      const resolution = resolveSavedTemplateSetUnitWithConfirmation(action, setIndex, reps.length, {
        exerciseMetadata: exerciseMetadataByAction?.get(savedActionIdentity(action)),
        ...(confirmation ? { confirmedUnit: confirmation } : {})
      });
      if (resolution.unit === 'unknown') {
        throw new Error(`Ćwiczenie ${index + 1}, seria ${setIndex + 1}: jednostka jest nierozpoznana. Zachowaj API completionMethod albo po jednoznacznym potwierdzeniu użytkownika przekaż confirmedUnits dla każdej serii; nie zgaduję na podstawie liczby.`);
      }
      return resolution.unit;
    });
    const presetId = Number(action.templatePresetId ?? -1);
    if (!Number.isSafeInteger(presetId) || presetId < -1) throw new Error(`Ćwiczenie ${index + 1} ma nieprawidłowy templatePresetId.`);
    const weights = parseCsvNumbers(String(action.weights ?? ''), 'weights', index);
    const counters = parseCsvNumbers(String(action.counterweight ?? ''), 'counterweight', index);
    const counterweight2 = parseCsvNumbers(String(action.counterweight2 ?? ''), 'counterweight2', index);
    const referenceClientPreset = getReferenceClientRmPresetById(presetId);
    if (referenceClientPreset) {
      const rules = getReferenceClientRmPresetRules(referenceClientPreset.name);
      if (resolvedUnits.some((unit) => unit !== 'reps')) {
        throw new Error(`Ćwiczenie ${index + 1}: preset ${referenceClientPreset.name} Smart RM wymaga powtórzeń w każdej serii; serie czasowe pozostają w sekundach i nie mogą być zapisywane jako Smart RM.`);
      }
      if (!rules || reps.some((count) => !Number.isSafeInteger(count) || count < rules.minReps || count > rules.maxReps)) {
        throw new Error(`Ćwiczenie ${index + 1}: preset ${referenceClientPreset.name} wymaga ${rules?.minReps ?? '?'}–${rules?.maxReps ?? '?'} powtórzeń w każdej serii.`);
      }
      if ((weights.length !== 1 && weights.length !== reps.length) || weights.some((weight) => Math.abs(weight - 3.5) > 1e-9)) {
        throw new Error(`Ćwiczenie ${index + 1}: preset ${referenceClientPreset.name} musi zachować placeholder klienta referencyjnego weights=3.5 w każdej serii.`);
      }
      if (counters.length !== reps.length || counters.some((rmLevel) => !Number.isSafeInteger(rmLevel) || rmLevel < rules.minRmLevel || rmLevel > rules.maxRmLevel)) {
        throw new Error(`Ćwiczenie ${index + 1}: preset ${referenceClientPreset.name} wymaga RM ${rules.minRmLevel}–${rules.maxRmLevel} dla każdej serii w counterweight.`);
      }
      if (counterweight2.length !== reps.length || counterweight2.some((rmLevel, setIndex) => rmLevel !== counters[setIndex])) {
        throw new Error(`Ćwiczenie ${index + 1}: preset ${referenceClientPreset.name} wymaga zgodnych counterweight i counterweight2 dla każdej serii.`);
      }
    }
    if (presetId === -1 && (counters.length || counterweight2.length)) {
      throw new Error(`Ćwiczenie ${index + 1}: statyczne Customize (templatePresetId=-1) nie może łączyć obciążenia weights z polami Smart RM counterweight.`);
    }
    if (presetId >= 0 && (!counters.length || counters.length !== reps.length ||
        counters.some((rmLevel) => !Number.isSafeInteger(rmLevel) || rmLevel < 1 || rmLevel > 20) ||
        (counterweight2.length && (counterweight2.length !== counters.length || counterweight2.some((rmLevel, setIndex) => rmLevel !== counters[setIndex]))))) {
      throw new Error(`Ćwiczenie ${index + 1}: preset wymaga poziomu RM 1–20 dla każdej serii w counterweight i zgodnych counterweight2, jeśli API je zwraca.`);
    }
    const rawCapacity = reps.reduce((sum, workAmount, position) => {
      const resistance = referenceClientPreset
        ? counters[position] * 2.2
        : valueAt(staticCapacityLoads?.get(index) ?? weights, { count: reps.length, position }, 'weights', index);
      // Named Smart RM uses the reference client RM selector × 2.2, not its 3.5
      // weight marker. This is compatibility metadata, not lifted volume.
      return sum + workAmount * resistance;
    }, 0);
    const capacity = Number(rawCapacity.toFixed(6));
    if (!Number.isFinite(capacity) || capacity > 1_000_000_000) throw new Error(`Objętość ćwiczenia ${index + 1} przekracza limit bezpieczeństwa.`);
    totalCapacity += capacity;
    const writerCompletionMethods = resolvedUnits.map((unit) => unit === 'seconds' ? '2' : '1');
    const { confirmedUnits: _confirmedUnits, ...wireAction } = action;
    return {
      ...wireAction,
      // GET and write endpoints use different completionMethod codes. Normalize
      // each confirmed/resolved set to the same writer contract as reference client.
      selectCompletionMethod: reps.map(() => '1').join(','),
      completionMethod: writerCompletionMethods.join(','),
      countType: writerCompletionMethods.join(','),
      capacity
    };
  });
  if (!Number.isFinite(totalCapacity) || totalCapacity > 1_000_000_000) throw new Error('Łączna objętość przekracza limit bezpieczeństwa.');
  return { actions, totalCapacity: Number(totalCapacity.toFixed(6)) };
}

function savedActionIdentity(action) {
  const groupId = positiveInteger(action?.groupId);
  const actionLibraryId = positiveInteger(action?.actionLibraryId);
  return groupId === null || actionLibraryId === null ? null : `${groupId}:${actionLibraryId}`;
}

function staticAccountUnitWeights(action, index) {
  const presetId = Number(action?.templatePresetId ?? -1);
  // The known reference client RM presets use weights=3.5 only as a wire placeholder;
  // their actual intensity is stored in counterweight and is machine-managed.
  if (getReferenceClientRmPresetById(presetId)) return null;
  const weights = parseCsvNumbers(String(action?.weights ?? ''), 'weights', index);
  if (!weights.length) return [0];
  // A one-value list is shared across all sets. Collapse repeated equal values
  // too, so adding a set with the same static load does not look like a load edit.
  return weights.every((weight) => weight === weights[0]) ? [weights[0]] : weights;
}

function sameStaticWeights(left, right) {
  return left.length === right.length && left.every((weight, index) => Math.abs(weight - right[index]) <= 1e-9);
}

function explicitStaticLoadChange(action) {
  if (action.staticLoadChanged === undefined) return false;
  if (typeof action.staticLoadChanged !== 'boolean') throw new Error('staticLoadChanged musi być boolean.');
  if (getTemplatePresetId(action) !== -1) throw new Error('staticLoadChanged jest dozwolone wyłącznie dla Customize templatePresetId=-1, nie Smart RM.');
  return action.staticLoadChanged;
}

function roundWeightForWire(value) {
  if (value === 0) return '0';
  return formatWireDecimal(value);
}

function rawReadbackKgToWire(value) {
  // Legacy compatibility interprets saved static GET values as kg; the pinned
  // hbui3 community writer serializes kg * 2.2. Hosted its author wire parity is unverified.
  return roundWeightForWire(value * 2.2);
}

export function matchSavedActionOccurrences(currentActions, nextActions) {
  const queues = new Map();
  currentActions.forEach((action, index) => {
    const key = savedActionIdentity(action);
    if (!key) return;
    const queue = queues.get(key) ?? [];
    queue.push({ action, index });
    queues.set(key, queue);
  });
  const matchedPrevious = nextActions.map((action) => {
    const key = savedActionIdentity(action);
    return key ? queues.get(key)?.shift() ?? null : null;
  });
  const unmatchedPrevious = [...queues.values()].flat();
  return { matchedPrevious, unmatchedPrevious };
}

function normalizeStaticActionWeightsForUpdate(currentActions, nextActions, displayUnit, { strictRmShape = false, staticLoadProtocol = 'legacy-reference-client-wire-lb-get-kg', accountUnit = displayUnit, staticLoadIntent = 'account-customize', preservedBandIndices = new Set() } = {}) {
  const { matchedPrevious } = matchSavedActionOccurrences(currentActions, nextActions);
  const staticCapacityLoads = new Map();
  const actions = nextActions.map((action, index) => {
    if (preservedBandIndices.has(index)) return action;
    const explicitlyChanged = explicitStaticLoadChange(action);
    const weights = parseCsvNumbers(String(action.weights ?? ''), 'weights', index);
    if (!weights.length) return action;
    const presetId = getTemplatePresetId(action);
    if (presetId === null) {
      if (weights.some((weight) => weight > 0)) {
        throw new Error(`Ćwiczenie ${index + 1}: brak jednoznacznego templatePresetId, więc GM Coach nie może ustalić, czy weights z GET są statycznym kg czy markerem presetu. Edycja całego szablonu jest zablokowana.`);
      }
      return action;
    }
    if (presetId !== -1) {
      if (getReferenceClientRmPresetById(presetId)) {
        const rmDose = expandObservedRmPresetAction(action);
        if (!rmDose) {
          if (!strictRmShape) return action; // Full replacements receive detailed validation below.
          throw new Error(`Ćwiczenie ${index + 1}: preset Smart RM musi zachować prawidłowy weights=3.5 i zgodne counterweight/counterweight2 dla każdej serii w zakresie wybranego presetu.`);
        }
        // Readback may compress a common RM selector into one cell. The
        // reference client write contract still receives both counters for every set.
        return {
          ...action,
          // Real GET omits counterweight and returns device display kg in weights; restore the 3.5 write marker only then.
          ...(action.counterweight === undefined ? { weights: rmDose.weights.join(',') } : {}),
          counterweight: rmDose.counterweight.join(','),
          counterweight2: rmDose.counterweight2.join(',')
        };
      }
      if (weights.some((weight) => weight > 0)) {
        throw new Error(`Ćwiczenie ${index + 1}: preset ID ${presetId} nie ma potwierdzonego formatu obciążenia. Edycja całego szablonu jest zablokowana, aby nie zmienić jego ciężaru.`);
      }
      return action;
    }
    const previous = matchedPrevious[index];
    const previousPresetId = getTemplatePresetId(previous?.action);
    const previousWeights = previousPresetId === -1 && previous
      ? staticAccountUnitWeights(previous.action, previous.index)
      : null;
    const nextAccountWeights = staticAccountUnitWeights(action, index);
    const unchangedRawReadback = !explicitlyChanged && Boolean(previousWeights && nextAccountWeights && sameStaticWeights(previousWeights, nextAccountWeights));
    const capacityLoads = [];
    const loadUnitForStep = staticLoadIntent === 'canonical-kg' ? 'kg' : accountUnit;
    const wireWeights = weights.map((rawWeight) => {
      // Urządzenie przechowuje tylko dozwolony krok Customize (<=10 kg co 0,5; >10 kg pełne kg) i obcina w dół; wysyłamy tę wartość.
      const weight = unchangedRawReadback || rawWeight === 0 ? rawWeight : (quantizeCustomizeLoad(rawWeight, loadUnitForStep, 'floor') ?? rawWeight);
      const rawLoad = unchangedRawReadback && staticLoadProtocol === 'legacy-reference-client-wire-lb-get-kg'
        ? weight * 2.2
        : staticLoadBeforeWireRounding({ protocol: staticLoadProtocol, load: weight,
          loadUnit: unchangedRawReadback ? accountUnit : staticLoadIntent === 'canonical-kg' ? 'kg' : accountUnit,
          accountUnit, loadIntent: unchangedRawReadback ? 'account-customize' : staticLoadIntent });
      capacityLoads.push(rawLoad);
      if (weight === 0) return '0';
      if (unchangedRawReadback) {
        if (staticLoadProtocol === 'legacy-reference-client-wire-lb-get-kg') return rawReadbackKgToWire(weight);
        return encodeStaticLoad({ protocol: staticLoadProtocol, load: weight, loadUnit: accountUnit, accountUnit, loadIntent: 'account-customize' });
      }
      return encodeStaticLoad({ protocol: staticLoadProtocol, load: weight,
        loadUnit: staticLoadIntent === 'canonical-kg' ? 'kg' : accountUnit,
        accountUnit, loadIntent: staticLoadIntent });
    });
    staticCapacityLoads.set(index, capacityLoads);
    return { ...action, weights: wireWeights.join(',') };
  });
  return { actions: actions.map(({ staticLoadChanged: _staticLoadChanged, ...action }) => action), matchedPrevious, staticCapacityLoads };
}

export function changedPositiveStaticLoadActions(currentActions, nextActions) {
  const queues = new Map();
  currentActions.forEach((action, index) => {
    const key = savedActionIdentity(action);
    if (!key) return;
    const queue = queues.get(key) ?? [];
    queue.push({ action, index }); queues.set(key, queue);
  });
  return nextActions.flatMap((action, index) => {
    const explicitlyChanged = explicitStaticLoadChange(action);
    const previous = queues.get(savedActionIdentity(action))?.shift();
    const weights = staticAccountUnitWeights(action, index);
    if (!weights) return [];
    const previousWeights = previous ? staticAccountUnitWeights(previous.action, previous.index) : null;
    if (!explicitlyChanged && previousWeights && sameStaticWeights(previousWeights, weights)) return [];
    return weights.some(weight => weight > 0) ? [{ action, weights, index }] : [];
  });
}

function assertStaticLoadEditAuthorized(currentActions, nextActions, {
  staticLoadAuthorization,
  displayUnit,
  displayUnitVerified
} = {}) {
  // These options are trusted server-side context: only set the authorization
  // after a direct user confirmation, and set displayUnitVerified only after a
  // fresh account-unit lookup. They must never be copied from action payloads.
  const authorizationValues = new Set(['customize', 'fixed-load']);
  const queues = new Map();
  currentActions.forEach((action, index) => {
    const key = savedActionIdentity(action);
    if (!key) return;
    const queue = queues.get(key) ?? [];
    queue.push({ action, index });
    queues.set(key, queue);
  });

  let changedStaticLoad = false;
  nextActions.forEach((action, index) => {
    const explicitlyChanged = explicitStaticLoadChange(action);
    const key = savedActionIdentity(action);
    const previous = key ? queues.get(key)?.shift() : null;
    const nextWeights = staticAccountUnitWeights(action, index);
    // Known reference client Smart RM rows and no-external-load rows retain their
    // own contracts. Other changed weight values are account-unit loads.
    if (!nextWeights) return;
    const previousWeights = previous ? staticAccountUnitWeights(previous.action, previous.index) : null;
    if (!explicitlyChanged && previousWeights && sameStaticWeights(previousWeights, nextWeights)) return;
    const includesExternalLoad = [...(previousWeights ?? []), ...nextWeights].some((weight) => weight > 0);
    if (includesExternalLoad || explicitlyChanged) changedStaticLoad = true;
  });

  if (!changedStaticLoad) return;
  if (!authorizationValues.has(staticLoadAuthorization)) {
    throw new Error('Zmiana stałego obciążenia wymaga jawnego potwierdzenia użytkownika: Customize albo fixed-load.');
  }
  if (!['kg', 'lb'].includes(displayUnit) || displayUnitVerified !== true) {
    throw new Error('Zmiana stałego obciążenia wymaga świeżo zweryfikowanej jednostki konta Speediance (kg albo lb); jednostka wpisana lub zapamiętana lokalnie nie wystarcza.');
  }
}

export function canonicalizeAuthorizedStaticPresetConversion(currentActions, actionLibraryList, { staticLoadAuthorization, displayUnitVerified, displayUnit } = {}) {
  if (Array.isArray(actionLibraryList) && ['customize', 'fixed-load'].includes(staticLoadAuthorization) && displayUnitVerified === true && ['kg', 'lb'].includes(displayUnit)) {
    const { matchedPrevious: matched } = matchSavedActionOccurrences(currentActions, actionLibraryList);
    actionLibraryList = actionLibraryList.map((action, index) => {
      const previous = matched[index]?.action;
      if (action.staticLoadChanged !== true || ![-1, '-1'].includes(action.templatePresetId) || !isObservedRmPresetAction(previous)) return action;
      const canonical = { ...action };
      for (const alias of ['presetId', 'presetName', 'templatePresetName', 'templatePreset', 'preset']) {
        if (!Object.hasOwn(action, alias)) continue;
        if (!Object.hasOwn(previous, alias) || structuralJson(action[alias]) !== structuralJson(previous[alias])) {
          throw new Error('Konwersja Customize zawiera zmieniony lub niepotwierdzony alias starego presetu.');
        }
        delete canonical[alias];
      }
      canonical.templatePresetId = -1;
      return canonical;
    });
  }
  return actionLibraryList;
}

export function buildSavedTemplateUpdatePayload(template, {
  name,
  actionLibraryList,
  displayUnit,
  staticLoadAuthorization,
  displayUnitVerified,
  staticLoadMetadataByAction,
  staticLoadProtocol = 'legacy-reference-client-wire-lb-get-kg',
  accountUnit = displayUnit,
  staticLoadIntent = 'account-customize',
  exerciseMetadataByAction
} = {}) {
  if (!STATIC_LOAD_PROTOCOLS.includes(staticLoadProtocol)) throw new Error('Nieznany protokół obciążenia statycznego.');
  if (!['account-customize', 'canonical-kg'].includes(staticLoadIntent)) throw new Error('Nieznany zamiar obciążenia statycznego.');
  if (staticLoadProtocol === 'account-unit-verbatim' && !['kg', 'lb'].includes(accountUnit)) throw new Error('Protokół account-unit-verbatim wymaga potwierdzonej jednostki konta.');
  if (displayUnit !== undefined && accountUnit !== undefined && displayUnit !== accountUnit) throw new Error('Sprzeczna jednostka konta i displayUnit.');
  const current = createSavedTemplateSnapshot(template);
  if (name !== undefined && typeof name !== 'string') throw new Error('Nazwa programu musi być tekstem.');
  const nextName = name === undefined ? current.name : name.trim();
  if (nextName.length < 1 || nextName.length > 80) {
    throw new Error('Nazwa programu musi mieć od 1 do 80 znaków.');
  }
  const replacingExercises = actionLibraryList !== undefined;
  actionLibraryList = canonicalizeAuthorizedStaticPresetConversion(current.actionLibraryList, actionLibraryList, { staticLoadAuthorization, displayUnitVerified, displayUnit });
  const bandBearing = action => !['absent', 'empty'].includes(readSavedTemplateSpringGroups(action, 0, String(action.setsAndReps ?? '').split(',').length).status);
  const bandActions = current.actionLibraryList.filter(bandBearing);
  if (replacingExercises && (bandActions.length || actionLibraryList?.some(bandBearing))) {
    const expected = bandActions.map(structuralJson).sort();
    const actual = actionLibraryList.filter(bandBearing).map(structuralJson).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Niepotwierdzony zapis taśm: zachowaj dokładnie wszystkie akcje springGroupList.');
  }
  const candidateActions = replacingExercises ? actionLibraryList : current.actionLibraryList;
  const preservedBandIndices = new Set(candidateActions.flatMap((action, index) => bandBearing(action) ? [index] : []));
  if (replacingExercises) {
    assertStaticLoadEditAuthorized(current.actionLibraryList.filter(action => !bandBearing(action)), actionLibraryList.filter(action => !bandBearing(action)), {
      staticLoadAuthorization,
      displayUnit,
      displayUnitVerified
    });
    for (const { action, weights } of changedPositiveStaticLoadActions(current.actionLibraryList.filter(action => !bandBearing(action)), actionLibraryList.filter(action => !bandBearing(action)))) {
      const metadata = staticLoadMetadataByAction instanceof Map
        ? staticLoadMetadataByAction.get(savedActionIdentity(action)) : undefined;
      for (const weight of weights) {
        if (weight > 0) validateStaticLoad(weight, { displayUnit: staticLoadIntent === 'canonical-kg' ? 'kg' : displayUnit, ...metadata });
      }
    }
  }
  const { actions: wireActions, staticCapacityLoads } = normalizeStaticActionWeightsForUpdate(
    current.actionLibraryList,
    replacingExercises ? actionLibraryList : current.actionLibraryList,
    displayUnit,
    { strictRmShape: !replacingExercises, staticLoadProtocol, accountUnit, staticLoadIntent, preservedBandIndices }
  );
  const replacement = replacingExercises ? validateActionList(wireActions, { displayUnit, exerciseMetadataByAction, staticCapacityLoads, preservedBandIndices }) : null;
  const nextActions = (replacement ? replacement.actions : wireActions).map((action, index) => {
    const original = (replacingExercises ? actionLibraryList : current.actionLibraryList)[index];
    return bandBearing(original) ? original : action;
  });
  let nextCapacity = current.totalCapacity;
  if (replacement) nextCapacity = replacement.totalCapacity;
  if (!Number.isFinite(nextCapacity)) {
    throw new Error('Brak wartości totalCapacity wymaganej przez API Speediance.');
  }
  const payload = {
    id: current.id,
    code: current.code,
    name: nextName,
    actionLibraryList: nextActions,
    totalCapacity: nextCapacity,
    ...(current.deviceType ? { deviceType: current.deviceType } : {}),
    bgColor: Number.isFinite(Number(template.bgColor)) ? Number(template.bgColor) : 0
  };
  if (!replacingExercises) return payload;
  const baseline = buildSavedTemplateUpdatePayload(template, { displayUnit, staticLoadProtocol, accountUnit, staticLoadIntent, exerciseMetadataByAction });
  return reconcileSavedEditPayload(baseline, payload, { exerciseMetadataByAction }, { explicitActions: actionLibraryList });
}

export function templateSummary(template) {
  const code = template?.code ?? template?.templateCode;
  const id = getSavedTemplateId(template);
  const actionLibraryList = Array.isArray(template?.actionLibraryList) ? template.actionLibraryList : null;
  return {
    ...(typeof code === 'string' && CODE_PATTERN.test(code) ? { code } : {}),
    ...(id !== null ? { id } : {}),
    ...(typeof template?.name === 'string' ? { name: template.name.trim() } : {}),
    ...(positiveInteger(template?.deviceType) !== null ? { deviceType: positiveInteger(template.deviceType) } : {}),
    ...(Number.isFinite(Number(template?.totalCapacity)) ? { totalCapacity: Number(template.totalCapacity) } : {}),
    ...(actionLibraryList ? { exerciseCount: actionLibraryList.length } : {})
  };
}

function expectedOrReadbackCode(template) {
  if (!template || typeof template !== 'object' || Array.isArray(template)) return null;
  const code = typeof template.code === 'string' ? template.code : template.templateCode;
  return typeof code === 'string' && CODE_PATTERN.test(code.trim()) ? code.trim() : null;
}

function parseVerificationSequence(value, { allowBlank = false, integer = false, minimum = 0, maximum = 1_000_000 } = {}) {
  if (typeof value !== 'string' && typeof value !== 'number') return { error: 'missing-or-invalid-type' };
  if (typeof value === 'string' && !value.trim()) return allowBlank ? { values: [] } : { error: 'empty' };
  const parts = typeof value === 'number' ? [value] : value.split(',').map((part) => part.trim());
  if (!parts.length || parts.some((part) => part === '')) return { error: 'empty-item' };
  const values = parts.map((part) => Number(part));
  if (values.some((number) => !Number.isFinite(number) || number < minimum || number > maximum || (integer && !Number.isSafeInteger(number)))) {
    return { error: 'invalid-number' };
  }
  return { values };
}

function parseVerificationPresetId(value) {
  const id = typeof value === 'number'
    ? value
    : (typeof value === 'string' && /^-?\d{1,6}$/.test(value.trim()) ? Number(value.trim()) : NaN);
  return Number.isSafeInteger(id) && id >= -1 && id <= 1000 ? id : null;
}

function verificationValue(action, field, parserOptions, path, unavailable) {
  if (!Object.hasOwn(action, field)) {
    unavailable.push({ path, reason: 'Pole nie występuje w odczycie; jego wartość jest nieznana.' });
    return null;
  }
  const parsed = parseVerificationSequence(action[field], parserOptions);
  if (parsed.error) {
    unavailable.push({ path, reason: `Nie można bezpiecznie odczytać pola (${parsed.error}).` });
    return null;
  }
  return parsed.values;
}

function addFieldMismatch(mismatches, path, expected, actual, reason = 'Wartość różni się od oczekiwanego payloadu.') {
  mismatches.push({ path, expected, actual, reason });
}

function compareExactSequence(expectedValues, actualValues, count) {
  if (!expectedValues || !actualValues) return null;
  if (expectedValues.length !== count || actualValues.length !== count) return false;
  return expectedValues.every((value, index) => value === actualValues[index]);
}

function compareLoadSequence(expectedValues, actualValues, count, tolerance) {
  if (!expectedValues || !actualValues) return null;
  if (expectedValues.length === 0 || actualValues.length === 0) {
    return expectedValues.length === actualValues.length;
  }
  const expandCommonValue = (values, other) => {
    if (values.length === count) return values;
    if (values.length === 1 && count > 1 && other.length === count &&
        other.every((value) => Math.abs(value - other[0]) <= tolerance)) {
      return Array(count).fill(values[0]);
    }
    if (values.length === 1 && other.length === 1 && count >= 1) return Array(count).fill(values[0]);
    return null;
  };
  const expectedExpanded = expandCommonValue(expectedValues, actualValues);
  const actualExpanded = expandCommonValue(actualValues, expectedValues);
  if (!expectedExpanded || !actualExpanded) return false;
  return expectedExpanded.every((value, index) => Math.abs(value - actualExpanded[index]) <= tolerance);
}

function addReadbackDecisionEntry(list, path, reason, values = {}) {
  list.push({ path, reason, ...values });
}

function finalizeReadbackDecision(mismatches, unavailable, warnings, code = null) {
  const status = mismatches.length ? 'mismatch' : (unavailable.length ? 'unavailable' : 'verified');
  return {
    status,
    verified: status === 'verified',
    safeToReportSuccess: status === 'verified',
    ...(code ? { code } : {}),
    mismatches,
    unavailable,
    warnings
  };
}

/**
 * Verify a newly-created Speediance template readback without accessing an
 * account. `existingTemplateCodes` must be a complete pre-create code list
 * (strings or template summaries); absence/incompleteness can never verify that
 * the returned stable code is new.
 *
 * Only documented boundary normalization is applied: static write weights
 * (pounds) are compared to readback weights (kg), surrounding whitespace in
 * names and CSV cells is ignored, numeric strings compare as numbers, and a
 * common load value may stand for repeated equal per-set loads. `weights` has a
 * 0.05 kg precision tolerance; preset markers/counterweights and non-load
 * fields compare exactly. `expectedSetUnits` is a local
 * sidecar of explicit reps/seconds labels; it is not serialized to Speediance.
 * Unknown units, IDs, codes, or fields produce `unavailable`, never success.
 */
function verifySavedTemplateReadback({
  expectedPayload,
  readback,
  existingTemplateCodes,
  expectedSetUnits,
  expectedCode,
  expectedTotalCapacity,
  compareCapacities = false,
  staticLoadProtocol = 'legacy-reference-client-wire-lb-get-kg',
  accountUnit,
  exerciseMetadataByAction
} = {}) {
  const mismatches = [];
  const unavailable = [];
  const warnings = [];
  let returnedCode = null;

  try {
    if (!STATIC_LOAD_PROTOCOLS.includes(staticLoadProtocol)) throw new Error('Nieznany protokół obciążenia statycznego.');
    if (staticLoadProtocol === 'account-unit-verbatim' && !['kg', 'lb'].includes(accountUnit)) throw new Error('Protokół account-unit-verbatim wymaga jednostki konta.');
    if (!expectedPayload || typeof expectedPayload !== 'object' || Array.isArray(expectedPayload)) {
      addReadbackDecisionEntry(unavailable, 'expectedPayload', 'Oczekiwany payload nie jest dostępny.');
    }
    if (!readback || typeof readback !== 'object' || Array.isArray(readback)) {
      addReadbackDecisionEntry(unavailable, 'readback', 'Speediance nie zwróciło obiektu szablonu do weryfikacji.');
      return finalizeReadbackDecision(mismatches, unavailable, warnings);
    }

    returnedCode = expectedOrReadbackCode(readback);
    if (!returnedCode) {
      addReadbackDecisionEntry(unavailable, 'readback.code', 'Brak prawidłowego stabilnego kodu nowego szablonu.');
    }

    if (expectedCode !== undefined) {
      if (typeof expectedCode !== 'string' || !CODE_PATTERN.test(expectedCode)) {
        addReadbackDecisionEntry(unavailable, 'expectedCode', 'Oczekiwany kod edytowanego szablonu jest nieprawidłowy.');
      } else if (returnedCode && returnedCode !== expectedCode) {
        addFieldMismatch(mismatches, 'readback.code', expectedCode, returnedCode, 'Kod stabilnego szablonu zmienił się podczas edycji.');
      }
    } else if (!Array.isArray(existingTemplateCodes)) {
      addReadbackDecisionEntry(unavailable, 'existingTemplateCodes', 'Brak kompletnej listy kodów sprzed utworzenia; nie można potwierdzić nowości kodu.');
    } else {
      const priorCodes = [];
      let hasInvalidPriorCode = false;
      for (const item of existingTemplateCodes) {
        const code = typeof item === 'string'
          ? (CODE_PATTERN.test(item.trim()) ? item.trim() : null)
          : expectedOrReadbackCode(item);
        if (!code) {
          hasInvalidPriorCode = true;
          continue;
        }
        priorCodes.push(code);
      }
      if (hasInvalidPriorCode) {
        addReadbackDecisionEntry(unavailable, 'existingTemplateCodes', 'Co najmniej jeden wcześniejszy szablon nie ma czytelnego stabilnego kodu.');
      }
      if (returnedCode && priorCodes.includes(returnedCode)) {
        addFieldMismatch(mismatches, 'readback.code', 'nowy kod', returnedCode, 'Kod zwrócony przez Speediance występuje już na liście sprzed utworzenia.');
      }
    }

    if (expectedTotalCapacity !== undefined) {
      const expectedCapacity = Number(expectedTotalCapacity);
      const actualCapacity = Number(readback.totalCapacity);
      if (!Number.isFinite(expectedCapacity)) {
        addReadbackDecisionEntry(unavailable, 'expectedPayload.totalCapacity', 'Oczekiwana łączna pojemność nie jest liczbą.');
      }
      if (!Number.isFinite(actualCapacity)) {
        addReadbackDecisionEntry(unavailable, 'readback.totalCapacity', 'Odczyt zwrotny nie zawiera prawidłowej łącznej pojemności.');
      }
      // Legacy wire: payload capacity = reps x wire lb (kg*2.2); GET = reps x kg (0,1). Porównaj w jednostce odczytu.
      const capacityInReadbackUnit = staticLoadProtocol === 'legacy-reference-client-wire-lb-get-kg' ? [expectedCapacity, expectedCapacity / 2.2] : [expectedCapacity];
      if (Number.isFinite(expectedCapacity) && Number.isFinite(actualCapacity) && !capacityInReadbackUnit.some((value, i) => Math.abs(value - actualCapacity) <= (i === 0 ? 1e-6 : 0.051 + value * 1e-6))) {
        addFieldMismatch(mismatches, 'readback.totalCapacity', capacityInReadbackUnit.at(-1), actualCapacity);
      }
    }

    const expectedName = typeof expectedPayload?.name === 'string' ? expectedPayload.name.trim() : null;
    const actualName = typeof readback.name === 'string' ? readback.name.trim() : null;
    if (!expectedName) addReadbackDecisionEntry(unavailable, 'expectedPayload.name', 'Oczekiwana nazwa nie jest dostępna.');
    if (!actualName) addReadbackDecisionEntry(unavailable, 'readback.name', 'Odczyt zwrotny nie zawiera nazwy szablonu.');
    if (expectedName && actualName && expectedName !== actualName) {
      addFieldMismatch(mismatches, 'readback.name', expectedName, actualName);
    }

    const expectedActions = Array.isArray(expectedPayload?.actionLibraryList) ? expectedPayload.actionLibraryList : null;
    const actualActions = Array.isArray(readback.actionLibraryList) ? readback.actionLibraryList : null;
    if (!expectedActions?.length) addReadbackDecisionEntry(unavailable, 'expectedPayload.actionLibraryList', 'Oczekiwany payload nie zawiera listy ćwiczeń.');
    if (!actualActions) addReadbackDecisionEntry(unavailable, 'readback.actionLibraryList', 'Odczyt zwrotny nie zawiera listy ćwiczeń.');

    if (expectedActions?.length && actualActions) {
      if (expectedActions.length !== actualActions.length) {
        addFieldMismatch(mismatches, 'readback.actionLibraryList.length', expectedActions.length, actualActions.length, 'Liczba ćwiczeń różni się od payloadu.');
      }

      const overlap = Math.min(expectedActions.length, actualActions.length);
      for (let actionIndex = 0; actionIndex < overlap; actionIndex += 1) {
        const expectedAction = expectedActions[actionIndex];
        const actualAction = actualActions[actionIndex];
        const basePath = `readback.actionLibraryList[${actionIndex}]`;
        if (expectedAction && actualAction && (Object.hasOwn(expectedAction, 'springGroupList') || Object.hasOwn(actualAction, 'springGroupList'))) {
          if (structuralJson(expectedAction.springGroupList) !== structuralJson(actualAction.springGroupList)) addFieldMismatch(mismatches, `${basePath}.springGroupList`, expectedAction.springGroupList, actualAction.springGroupList, 'Deskryptory taśm różnią się od zachowanego surowego pola; zapis oporu nie jest potwierdzony.');
        }
        if (!expectedAction || typeof expectedAction !== 'object' || Array.isArray(expectedAction) ||
            !actualAction || typeof actualAction !== 'object' || Array.isArray(actualAction)) {
          addReadbackDecisionEntry(unavailable, basePath, 'Ćwiczenie nie jest obiektem i nie można porównać jego pól.');
          continue;
        }

        for (const field of ['groupId', 'actionLibraryId']) {
          const expectedId = positiveInteger(expectedAction[field]);
          const actualId = positiveInteger(actualAction[field]);
          if (expectedId === null) addReadbackDecisionEntry(unavailable, `expectedPayload.actionLibraryList[${actionIndex}].${field}`, 'Oczekiwany identyfikator ćwiczenia/wariantu jest nieprawidłowy.');
          if (actualId === null) addReadbackDecisionEntry(unavailable, `${basePath}.${field}`, 'Brak prawidłowego identyfikatora ćwiczenia/wariantu w odczycie.');
          if (expectedId !== null && actualId !== null && expectedId !== actualId) {
            addFieldMismatch(mismatches, `${basePath}.${field}`, expectedId, actualId);
          }
        }

        const expectedWork = verificationValue(expectedAction, 'setsAndReps', { integer: true, minimum: 1, maximum: 86_400 }, `${basePath}.setsAndReps (expected)`, unavailable);
        const actualWork = verificationValue(actualAction, 'setsAndReps', { integer: true, minimum: 1, maximum: 86_400 }, `${basePath}.setsAndReps`, unavailable);
        let setCount = null;
        if (expectedWork?.length) {
          setCount = expectedWork.length;
          if (actualWork && (actualWork.length !== expectedWork.length || actualWork.some((value, index) => value !== expectedWork[index]))) {
            addFieldMismatch(mismatches, `${basePath}.setsAndReps`, expectedWork, actualWork, 'Wartości lub kolejność powtórzeń/czasów różnią się od payloadu.');
          }
        }
        if (!setCount) continue;

        for (const actionField of READBACK_COMPARE_FIELDS) {
          if (actionField === 'setsAndReps') continue;
          const fieldPath = `${basePath}.${actionField}`;
          if (actionField === 'templatePresetId') {
            const expectedPresetId = Object.hasOwn(expectedAction, actionField) ? parseVerificationPresetId(expectedAction[actionField]) : null;
            const actualPresetId = Object.hasOwn(actualAction, actionField) ? parseVerificationPresetId(actualAction[actionField]) : null;
            if (getTemplatePresetId(actualAction) === null) addReadbackDecisionEntry(unavailable, fieldPath, 'Preset ID jest nierozpoznany lub jego aliasy są sprzeczne.');
            const namedPreset = getReferenceClientRmPresetById(actualPresetId);
            if (namedPreset && !hasValidReferenceClientRmPresetNameAliases(actualAction, actualPresetId)) {
              addReadbackDecisionEntry(unavailable, fieldPath, 'Nazwy presetu są nieprawidłowe albo sprzeczne z jego globalnym ID.');
            }
            if (expectedPresetId === null) addReadbackDecisionEntry(unavailable, `${fieldPath} (expected)`, 'Oczekiwany preset ID jest brakujący albo nieznany.');
            if (actualPresetId === null) addReadbackDecisionEntry(unavailable, fieldPath, 'Odczyt nie potwierdza preset ID.');
            if (expectedPresetId !== null && actualPresetId !== null && expectedPresetId !== actualPresetId) {
              addFieldMismatch(mismatches, fieldPath, expectedPresetId, actualPresetId);
            }
            continue;
          }

          const isLoadField = LOAD_FIELDS.has(actionField);
          const parseOptions = actionField === 'breakTime' || actionField === 'breakTime2'
            ? { integer: true, minimum: 0, maximum: 600 }
            : actionField === 'sportMode'
              ? { integer: true, minimum: 1, maximum: 3 }
              : actionField === 'completionMethod'
                ? { integer: true, minimum: 0, maximum: 5 }
                : actionField === 'countType'
                ? { integer: true, minimum: 1, maximum: 2 }
                : actionField === 'setsAndReps'
                  ? { integer: true, minimum: 1, maximum: 86_400 }
                  : isLoadField
                    ? { allowBlank: true, minimum: 0, maximum: 1_000_000 }
                    : { integer: true, minimum: 0, maximum: 1_000 };
          const expectedValues = verificationValue(expectedAction, actionField, parseOptions, `${fieldPath} (expected)`, unavailable);
          const actualValues = verificationValue(actualAction, actionField, parseOptions, fieldPath, unavailable);
          if (!expectedValues || !actualValues) continue;

          const expectedReadbackValues = actionField === 'weights' && getTemplatePresetId(expectedAction) === -1
            ? expectedValues.map((value) => Math.round(decodeStaticLoad({ protocol: staticLoadProtocol,
              wireOrReadback: value, phase: 'wire', accountUnit: staticLoadProtocol === 'legacy-reference-client-wire-lb-get-kg' ? 'kg' : accountUnit,
              outputUnit: staticLoadProtocol === 'legacy-reference-client-wire-lb-get-kg' ? 'kg' : accountUnit }) * 1_000) / 1_000)
            : expectedValues;
          const matches = isLoadField
            ? compareLoadSequence(expectedReadbackValues, actualValues, setCount,
              actionField === 'weights' && getTemplatePresetId(expectedAction) === -1 ? LOAD_WIRE_TOLERANCE : 0)
            : compareExactSequence(expectedValues, actualValues, setCount);
          if (matches === false) {
            addFieldMismatch(mismatches, fieldPath, expectedReadbackValues, actualValues,
              isLoadField ? 'Wartości lub liczba obciążeń różnią się od payloadu.' : 'Wartości lub liczba serii różnią się od payloadu.');
          }
        }

        if (compareCapacities && Object.hasOwn(expectedAction, 'capacity')) {
          const expectedCapacity = Number(expectedAction.capacity);
          const actualCapacity = Number(actualAction.capacity);
          if (!Number.isFinite(expectedCapacity)) {
            addReadbackDecisionEntry(unavailable, `${basePath}.capacity (expected)`, 'Oczekiwana pojemność ćwiczenia jest nieprawidłowa.');
          }
          if (!Number.isFinite(actualCapacity)) {
            addReadbackDecisionEntry(unavailable, `${basePath}.capacity`, 'Odczyt nie zwrócił prawidłowej pojemności ćwiczenia.');
          }
          if (Number.isFinite(expectedCapacity) && Number.isFinite(actualCapacity) && Math.abs(expectedCapacity - actualCapacity) > 1e-6) {
            addFieldMismatch(mismatches, `${basePath}.capacity`, expectedCapacity, actualCapacity);
          }
        }

        const unitCheckCount = Math.min(expectedWork?.length ?? 0, actualWork?.length ?? 0);
        for (let setIndex = 0; setIndex < unitCheckCount; setIndex += 1) {
          const expectedSetUnit = expectedSetUnits?.[actionIndex]?.[setIndex];
          const expectedUnit = ['reps', 'seconds'].includes(expectedSetUnit)
            ? { unit: expectedSetUnit, unitResolution: 'explicit' }
            : resolveSavedTemplateSetUnit(expectedAction, setIndex, expectedWork.length, undefined, false, exerciseMetadataByAction?.get(savedActionIdentity(expectedAction)));
          const actualUnit = resolveSavedTemplateSetUnit(actualAction, setIndex, actualWork.length, undefined, false, exerciseMetadataByAction?.get(savedActionIdentity(actualAction)));
          const unitPath = `${basePath}.setsAndReps[${setIndex}] unit`;
          if (expectedUnit.unit === 'unknown') {
            addReadbackDecisionEntry(unavailable, `${unitPath} (expected)`, 'Oczekiwany zestaw nie ma jednoznacznej jednostki reps albo seconds.');
          }
          if (actualUnit.unit === 'unknown') {
            addReadbackDecisionEntry(unavailable, unitPath, 'Odczyt zwrotny nie pozwala potwierdzić reps albo seconds.');
          }
          if (expectedUnit.unit !== 'unknown' && actualUnit.unit !== 'unknown' && expectedUnit.unit !== actualUnit.unit) {
            addFieldMismatch(mismatches, unitPath, expectedUnit.unit, actualUnit.unit);
          }
        }
      }
    }

    return finalizeReadbackDecision(mismatches, unavailable, warnings, returnedCode);
  } catch (error) {
    addReadbackDecisionEntry(unavailable, 'verification', `Nieoczekiwany błąd porównania: ${error instanceof Error ? error.message : 'unknown error'}`);
    return finalizeReadbackDecision(mismatches, unavailable, warnings, returnedCode);
  }
}

export function verifyCreatedTemplateReadback(options = {}) {
  // Every readback path (after POST, resume match, single create/update, QuickTest, reviewed record) shares the same equivalences.
  return acceptEquivalentReadbackDifferences(verifySavedTemplateReadback(options), options.expectedPayload, options.readback);
}

export function verifyUpdatedTemplateReadback({ expectedPayload, readback, expectedCode, expectedSetUnits, staticLoadProtocol = 'legacy-reference-client-wire-lb-get-kg', accountUnit, exerciseMetadataByAction } = {}) {
  return acceptEquivalentReadbackDifferences(verifySavedTemplateReadback({
    expectedPayload,
    readback,
    expectedCode,
    expectedTotalCapacity: expectedPayload?.totalCapacity,
    expectedSetUnits,
    staticLoadProtocol,
    accountUnit,
    exerciseMetadataByAction,
    compareCapacities: true
  }), expectedPayload, readback);
}


// Project only already retained normalized unit inspection; never raw userinfo.
export function projectSavedAccountUnitDiagnostic(details) {
 const fixed=status=>({schemaVersion:1,source:'existing-bound-account-unit-inspection',readOnly:true,noWriteAuthority:true,status,unit:'unknown',candidates:[]});
 const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const own=(value,key)=>{const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))throw new TypeError('Invalid unit diagnostic.');return d.value;};
 try {
  if(!plain(details))return fixed('invalid-inspection');
  const descriptor=Object.getOwnPropertyDescriptor(details,'unitInspection');
  if(!descriptor)return 'unitInspection' in details?fixed('invalid-inspection'):fixed('not-retained');
  if(!Object.hasOwn(descriptor,'value')||!plain(descriptor.value))return fixed('invalid-inspection');
  const inspection=descriptor.value,status=own(inspection,'status'),unit=own(inspection,'unit'),rows=own(inspection,'candidates');
  if(!['known','conflicting-recognized-account-unit-fields','not-reported','account-unit-resource-bound'].includes(status)||!['kg','lb','unknown'].includes(unit)||!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype)return fixed('invalid-inspection');
  // Fixed-index allowlist: ignore every other array key/symbol without enumeration or getter access.
  const length=own(rows,'length');if(!Number.isSafeInteger(length)||length<0||length>7)return fixed('invalid-inspection');
  const candidates=[],seen=new Set();
  for(let i=0;i<length;i++){
   const row=own(rows,String(i));if(!plain(row))return fixed('invalid-inspection');
   const field=own(row,'field'),candidateUnit=own(row,'unit');
   if(!['displayWeightUnit','display_weight_unit','weightUnit','weight_unit','displayUnit','display_unit','unit'].includes(field)||!['kg','lb'].includes(candidateUnit)||seen.has(field))return fixed('invalid-inspection');
   const rawCode=Object.hasOwn(row,'rawCode')?own(row,'rawCode'):undefined;
   if(rawCode!==undefined&&rawCode!==0&&rawCode!==1)return fixed('invalid-inspection');
   seen.add(field);candidates.push({field,unit:candidateUnit,...(rawCode!==undefined?{rawCode}:{})});
  }
  const units=new Set(candidates.map(row=>row.unit));
  if(status==='known'&&(!length||units.size!==1||!units.has(unit)))return fixed('invalid-inspection');
  if(status==='conflicting-recognized-account-unit-fields'&&(unit!=='unknown'||units.size!==2))return fixed('invalid-inspection');
  if(['not-reported','account-unit-resource-bound'].includes(status)&&(unit!=='unknown'||length!==0))return fixed('invalid-inspection');
  let scopePath;
  if(length){scopePath=own(inspection,'scopePath');if(typeof scopePath!=='string'||scopePath.length>1024||!/^\$(?:\.(?:account|user|userinfo|userInfo|profile|data|result)){0,99}$/.test(scopePath))return fixed('invalid-inspection');}
  const result={...fixed(status),unit,...(scopePath!==undefined?{scopePath}:{}),candidates};
  return Buffer.byteLength(JSON.stringify(result),'utf8')<=1900?result:fixed('diagnostic-omitted-resource-bound');
 }catch{return fixed('invalid-inspection');}
}


// Bounded read-only raw selectors. Does not decode or authorize any resistance.
export function projectSavedLoadDiagnostics(template, {offset=0,limit=4,reservedBytes=0}={}) {
 if(!Number.isSafeInteger(offset)||offset<0||offset>10000||!Number.isSafeInteger(limit)||limit<1||limit>8)throw new TypeError('Invalid saved load diagnostic page.');
 if(!Number.isSafeInteger(reservedBytes)||reservedBytes<0||reservedBytes>2048)throw new TypeError('Invalid saved load diagnostic reservation.');
 const BYTE_LIMIT=16384-reservedBytes,ACTION_LIMIT=128,ARRAY_LIMIT=128,CELL_LIMIT=512;
 let remaining=BYTE_LIMIT,cells=0,floor=0;
 const charge=n=>{if(n>remaining-floor)throw new TypeError('Saved load diagnostics byte bound exceeded.');remaining-=n;};
 function text(s){
  if(s.length+2>remaining)throw new TypeError('Saved load diagnostics byte bound exceeded.');charge(2);
  for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);if(c===34||c===92||[8,9,10,12,13].includes(c))charge(2);else if(c<32)charge(6);else if(c<128)charge(1);else if(c<2048)charge(2);else if(c>=0xd800&&c<=0xdbff&&i+1<s.length&&s.charCodeAt(i+1)>=0xdc00&&s.charCodeAt(i+1)<=0xdfff){charge(4);i++;}else charge(c>=0xd800&&c<=0xdfff?6:3);}return s;
 }
 function primitive(v){if(typeof v==='string')return text(v);charge(v===null?4:typeof v==='boolean'?(v?4:5):25);return v;}
 function record(entries){charge(2+Math.max(0,entries.length-1));for(const [key]of entries){text(key);charge(1);}return Object.fromEntries(entries);}
 const status=s=>record([['status',text(s)]]);
 const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 function own(v,k){const d=Object.getOwnPropertyDescriptor(v,k);if(!d)return{status:'absent'};if(!Object.hasOwn(d,'value'))return{status:'accessor-rejected'};return{status:'present',value:d.value};}
 function scalar(v){
  if(++cells>CELL_LIMIT)throw new TypeError('Saved load diagnostics cell bound exceeded.');
  if(v===undefined)return status('undefined');if(typeof v==='number'&&!Number.isFinite(v))return status('nonfinite');
  if(typeof v==='string'&&v.length>512)return record([['status',text('oversized-string')],['length',primitive(v.length)]]);
  if(v!==null&&!['string','number','boolean'].includes(typeof v))return status('unsupported-type');
  return record([['status',text(v===null?'null':typeof v)],['value',primitive(v)]]);
 }
 function field(d){
  if(d.status!=='present')return status(d.status);const v=d.value;if(!Array.isArray(v))return scalar(v);
  if(Object.getPrototypeOf(v)!==Array.prototype)return status('unsupported-array-prototype');
  const length=Object.getOwnPropertyDescriptor(v,'length').value;
  if(length>ARRAY_LIMIT)return record([['status',text('oversized-array')],['length',primitive(length)]]);
  charge(2+Math.max(0,length-1));const items=[];
  for(let i=0;i<length;i++){const cell=own(v,String(i));items.push(cell.status==='absent'?status('sparse-cell'):cell.status==='accessor-rejected'?status(cell.status):scalar(cell.value));}
  return record([['status',text('array')],['value',items]]);
 }
 if(!plain(template))throw new TypeError('Saved load diagnostics require plain template.');
 const listField=own(template,'actionLibraryList');if(listField.status!=='present'||!Array.isArray(listField.value)||Object.getPrototypeOf(listField.value)!==Array.prototype)throw new TypeError('Saved load diagnostics action list unavailable.');
 const list=listField.value,length=Object.getOwnPropertyDescriptor(list,'length').value,count=Math.max(0,Math.min(length-offset,limit));
 const fields=['weights','counterweight','counterweight2','templatePresetId','presetId','templatePresetName','presetName','templatePreset','preset','presetLabel','presetTitle','preset_name','preset_id','level','sportMode','setsAndReps','completionMethod','selectCompletionMethod','countType'];
 charge(2+Math.max(0,count-1));const actions=[];
 for(let index=offset;index<offset+count;index++){
  // Reserve final envelope plus every future complete omission record before this row.
  const rowRemaining=remaining,rowCells=cells;floor=1024+512*(offset+count-index-1);try{
  const d=own(list,String(index));if(d.status!=='present'||!plain(d.value))throw new TypeError('Saved load diagnostics require plain dense actions.');const row=d.value;
  const identities=[];for(const key of ['groupId','actionLibraryId']){const f=own(row,key);identities.push([key,f.status==='present'&&Number.isSafeInteger(f.value)&&f.value>0?record([['status',text('valid')],['value',primitive(f.value)]]):status(f.status==='present'?'invalid':f.status)]);}
  const signals=record(fields.map(key=>[key,field(own(row,key))]));
  const spring=record(['springGroupList'].map(key=>{const f=own(row,key);return[key,text(f.status!=='present'?f.status:f.value===null?'null':Array.isArray(f.value)?'array':typeof f.value)];}));
  actions.push(record([['occurrenceIndex',primitive(index)],['identity',record(identities)],['signals',signals],['springPresence',spring]]));
  }catch(error){remaining=rowRemaining;cells=rowCells;floor=0;actions.push(record([['occurrenceIndex',primitive(index)],['status',text('diagnostic-omitted')],['reason',text(error instanceof TypeError?'unsupported-or-resource-bound':'projection-failed')]]));}finally{floor=0;}
 }
 const result=record([['schemaVersion',primitive(1)],['source',text('returned-saved-template')],['readOnly',primitive(true)],['noWriteAuthority',primitive(true)],['observedActions',primitive(length)],['offset',primitive(offset)],['retainedActions',primitive(count)],['nextOffset',primitive(offset+count<length?offset+count:null)],['truncated',primitive(offset+count<length)],['actions',actions]]);
 if(Buffer.byteLength(JSON.stringify(result),'utf8')>BYTE_LIMIT)throw new TypeError('Saved load diagnostics final byte bound exceeded.');
 return result;
}

/** Equivalent encodings observed in real GET readback (template 6aef8741…, cycle T1_GA):
 * - breakTime/weights/counterweight(2) omitted by GET (breakTime2 carries the rest);
 * - countType is unit metadata that GET may rewrite (1→2) when completionMethod resolves the unit;
 * - completionMethod 0 for a timed item whose countType still matches;
 * - totalCapacity and Smart RM weights are machine-managed when any Smart RM preset is present.
 * Any present value that differs in dose (reps/seconds, rest, mode, side, RM level, preset, order) still blocks. */
export function acceptEquivalentReadbackDifferences(result, expectedPayload, readback) {
  const expected = expectedPayload?.actionLibraryList, actual = readback?.actionLibraryList;
  if (!result || !Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) return result;
  const rm = index => [1, 3, 5].includes(Number(expected[index]?.templatePresetId)) && Number(expected[index].templatePresetId) === Number(actual[index]?.templatePresetId);
  const anyRm = expected.some((_, index) => rm(index));
  const parse = value => { const match = /^readback\.actionLibraryList\[(\d+)\]\.([A-Za-z0-9]+)$/.exec(value ?? ''); return match ? { index: Number(match[1]), field: match[2] } : null; };
  const absent = value => value === undefined || value === null || value === '';
  const cells = value => String(value ?? '').split(',').map(cell => cell.trim());
  const sameCells = (a, b) => { const x = cells(a), y = cells(b); const n = Math.max(x.length, y.length); for (let i = 0; i < n; i++) if ((x.length === 1 ? x[0] : x[i]) !== (y.length === 1 ? y[0] : y[i])) return false; return true; };
  const timedEquivalent = index => { const e = cells(expected[index]?.completionMethod), a = cells(actual[index]?.completionMethod); return a.every(cell => cell === '0') && e.every(cell => cell === '2') && sameCells(expected[index]?.countType, actual[index]?.countType); };
  const accepted = [];
  const keep = row => {
    if (row.path === 'readback.totalCapacity' && anyRm) { accepted.push('totalCapacity (Smart RM: pojemność wyliczana przez maszynę)'); return false; }
    const both = /^(readback\.actionLibraryList\[\d+\]\.[A-Za-z0-9]+) \(expected\)$/.exec(row.path ?? '');
    if (both) { const at2 = parse(both[1]); if (at2 && ['breakTime', 'counterweight', 'weights', 'capacity'].includes(at2.field) && absent(expected[at2.index]?.[at2.field]) && absent(actual[at2.index]?.[at2.field])) { accepted.push(row.path + ' (brak w payloadzie i w GET)'); return false; } return true; }
    const at = parse(row.path); if (!at) return true;
    const sent = expected[at.index] ?? {}, got = actual[at.index] ?? {};
    if (['breakTime', 'breakTime2', 'counterweight', 'counterweight2', 'weights'].includes(at.field) && absent(got[at.field])) {
      if (at.field === 'breakTime' || at.field === 'breakTime2') {
        const otherRest = at.field === 'breakTime' ? 'breakTime2' : 'breakTime';
        if (absent(got[otherRest]) || (!absent(sent[at.field]) && !sameCells(sent[at.field], got[otherRest]))) return true;
      } else if (at.field === 'weights') {
        if (!rm(at.index) && !cells(sent.weights).every(cell => Number(cell) === 0)) return true;
      } else if (!rm(at.index) && !absent(sent[at.field])) return true;
      accepted.push(row.path + ' (pominięte w GET)'); return false;
    }
    if (at.field === 'capacity' && (rm(at.index) || Number(sent.capacity ?? 0) === 0)) { accepted.push(row.path + (rm(at.index) ? ' (Smart RM: pojemność maszyny)' : ' (zerowa pojemność)')); return false; }
    // Static Customize row: GET capacity = reps x GET kg, sent capacity = reps x wire weights. Equal only when both are
    // exactly derived from the same reps and the row's weights are not themselves reported as different.
    if (at.field === 'capacity' && Number(sent.templatePresetId) === -1 && Number(got.templatePresetId) === -1) {
      const derived = (reps, loads) => { const r = cells(reps).map(Number), w = cells(loads).map(Number); if (!r.length || r.some(v => !Number.isFinite(v)) || w.some(v => !Number.isFinite(v))) return NaN; return r.reduce((sum, value, i) => sum + value * (w.length === 1 ? w[0] : w[i]), 0); };
      const weightRow = 'readback.actionLibraryList[' + at.index + '].weights';
      const weightsDiffer = [...(result.mismatches ?? []), ...(result.unavailable ?? [])].some(other => other.path === weightRow);
      // Real GET 2026-11-08 (6aef8741, ramp-up 2×8 @ 23 kg): sent capacity 368 (reps × kg), GET capacity 167.3 (reps × kg / 2.2).
      // Either side may use kg, wire lb (×2.2) or kg/2.2; both must be derived from the same reps and a verified weight.
      const derivedFrom = capacity => [sent.weights, got.weights].some(loads => [1, 2.2, 1 / 2.2].some(factor => Math.abs(derived(got.setsAndReps, loads) * factor - Number(capacity)) < 0.5));
      // Real GET 2026-11-09 (6aef9f0b, ramp-up 2×8 @ 14 kg): sent capacity 46.3, GET 21 — the same value in the other unit (÷2.2).
      const sameValueOtherUnit = [1, 2.2, 1 / 2.2].some(factor => Math.abs(Number(sent.capacity) * factor - Number(got.capacity)) < 0.5);
      if (!weightsDiffer && sameCells(sent.setsAndReps, got.setsAndReps) && ((derivedFrom(sent.capacity) && derivedFrom(got.capacity)) || sameValueOtherUnit)) { accepted.push(row.path + ' (Customize: pojemność wyliczona z tych samych powtórzeń i ciężaru, inna jednostka)'); return false; }
    }
    // Real GET of Smart RM rows (fixtures/real/saved-templates-hyp.json): weights = device-computed display kg, counterweight
    // omitted, RM level in counterweight2, percent1rmStr present. Equal only when the RM level matches what was sent.
    if (at.field === 'weights' && rm(at.index) && cells(sent.weights).every(cell => Number(cell) === 3.5) && absent(got.counterweight) &&
      !absent(got.percent1rmStr) && !absent(got.counterweight2) && sameCells(sent.counterweight2, got.counterweight2) && cells(got.weights).every(cell => Number(cell) > 0)) {
      accepted.push(row.path + ' (Smart RM: GET pokazuje ciężar wyliczony przez maszynę dla RM ' + cells(got.counterweight2)[0] + ')'); return false;
    }
    if (at.field === 'countType' && (sameCells(sent.completionMethod, got.completionMethod) || timedEquivalent(at.index))) { accepted.push(row.path + ' (metadane jednostki; jednostkę rozstrzyga completionMethod)'); return false; }
    if (at.field === 'completionMethod' && timedEquivalent(at.index)) { accepted.push(row.path + ' (0 = seria czasowa przy zgodnym countType)'); return false; }
    return true;
  };
  const mismatches = (result.mismatches ?? []).filter(keep), unavailable = (result.unavailable ?? []).filter(keep);
  const status = mismatches.length ? 'mismatch' : unavailable.length ? 'unavailable' : 'verified';
  return { ...result, mismatches, unavailable, status, verified: status === 'verified', safeToReportSuccess: status === 'verified', acceptedDifferences: [...(result.acceptedDifferences ?? []), ...accepted] };
}

