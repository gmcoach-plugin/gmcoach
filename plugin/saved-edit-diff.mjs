import { resolveSavedTemplateSetUnit } from './saved-templates.mjs';
import { sameObservedRmPresetDose, expandObservedRmPresetAction, getTemplatePresetId, getReferenceClientRmPresetById } from './preset-mapping.mjs';
import { getReferenceClientRmPresetRules } from './program-payload.mjs';
import { validateSavedEditOccurrenceMapping } from './saved-plan-identity.mjs';
const MAX_ACTIONS = 500;
const MAX_BYTES = 2_000_000;
export const SAVED_EDIT_CHANGE_CATEGORIES = Object.freeze(['name', 'exercise_order', 'exercise_selection', 'dose', 'rest', 'resistance_mode', 'load', 'unknown_metadata']);
const fields = {
  groupId: 'exercise_selection', actionLibraryId: 'exercise_selection',
  setsAndReps: 'dose', completionMethod: 'dose', selectCompletionMethod: 'dose', countType: 'dose', leftRight: 'dose',
  breakTime: 'rest', breakTime2: 'rest', sportMode: 'resistance_mode',
  templatePresetId: 'load', presetId: 'load', templatePresetName: 'load', presetName: 'load', templatePreset: 'load', preset: 'load',
  weights: 'load', counterweight: 'load', counterweight2: 'load', percent1rmStr: 'load', level: 'load', capacity: 'load'
};
const csv = new Set(['setsAndReps', 'completionMethod', 'selectCompletionMethod', 'countType', 'leftRight', 'breakTime', 'breakTime2', 'sportMode', 'weights', 'counterweight', 'counterweight2', 'percent1rmStr', 'level']);
const optionalPresetAliases = new Set(['presetId', 'templatePresetName', 'presetName', 'templatePreset', 'preset']);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
function comparable(value, field) {
  if (['groupId', 'actionLibraryId', 'templatePresetId'].includes(field) && (typeof value === 'string' || typeof value === 'number') && /^-?\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && (Number(value) > 0 || field === 'templatePresetId' && Number(value) === -1)) return Number(value);
  if (csv.has(field) && (typeof value === 'string' || typeof value === 'number')) {
    const tokens = String(value).split(',');
    if (tokens.every(token => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token.trim()) && Number.isFinite(Number(token)) && Math.abs(Number(token)) <= Number.MAX_SAFE_INTEGER)) return tokens.map(Number);
  }
  return canonical(value);
}
const same = (a, b, field) => JSON.stringify(comparable(a, field)) === JSON.stringify(comparable(b, field));
function namedRmRepChange(left, right) {
  const before = expandObservedRmPresetAction(left), after = expandObservedRmPresetAction(right);
  if (!before || !after || before.presetId !== after.presetId || before.reps.length !== after.reps.length ||
      same(before.reps, after.reps, 'setsAndReps') || !same(left.leftRight, right.leftRight, 'leftRight')) return null;
  if (![left, right].every(row => {
    const sides = String(row.leftRight ?? '').split(',').map(value => value.trim());
    return [1, before.reps.length].includes(sides.length) && sides.every(value => ['0', '1', '2'].includes(value)) &&
      before.reps.every((_reps, index) => resolveSavedTemplateSetUnit(row, index, before.reps.length).unit === 'reps');
  })) return null;
  if (!['weights', 'counterweight', 'counterweight2'].every(field => JSON.stringify(before[field]) === JSON.stringify(after[field]))) return null;
  return { before, after, capacity: Number(after.reps.reduce((sum, reps, index) => sum + reps * after.counterweight[index] * 2.2, 0).toFixed(6)) };
}
function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.actionLibraryList) || payload.actionLibraryList.length > MAX_ACTIONS) throw new Error('Saved-edit diff requires a bounded wire actionLibraryList (maximum 500 actions).');
  let encoded;
  try { encoded = JSON.stringify(payload); } catch { throw new Error('Saved-edit diff requires serializable wire payloads.'); }
  // Real GET rows carry 101–107 read-only display keys (fixtures/real/saved-templates-hyp.json).
  if (encoded.length > MAX_BYTES || Object.keys(payload).length > 100 || payload.actionLibraryList.some(action => !action || typeof action !== 'object' || Array.isArray(action) || Object.keys(action).length > 200)) throw new Error('Saved-edit diff payload exceeds limits or contains invalid actions.');
  if (payload.name !== undefined && (typeof payload.name !== 'string' || payload.name.length > 2000)) throw new Error('Saved-edit diff name exceeds limits.');
  for (const action of payload.actionLibraryList) safeRecord(action);
}
function safeRecord(action) {
  if (!action) return null;
  return Object.fromEntries(Object.keys(fields).filter(field => Object.hasOwn(action, field)).map(field => {
    const value = action[field];
    if (optionalPresetAliases.has(field) && (value === null || value === undefined)) return [field, value];
    if (!['string', 'number', 'boolean'].includes(typeof value) || String(value).length > 16384) throw new Error('Saved-edit diff known wire fields must be bounded scalar values.');
    return [field, value];
  }));
}
const safeUnknownKey = key => /token|password|secret|authorization|cookie|email/i.test(key) ? '[redacted metadata key]' : key.slice(0, 128);
function permutation(before, after) {
  const identity = action => JSON.stringify([comparable(action.groupId, 'groupId'), comparable(action.actionLibraryId, 'actionLibraryId')]);
  const oldIds = before.map(identity), newIds = after.map(identity);
  const complete = oldIds.length === newIds.length && JSON.stringify([...oldIds].sort()) === JSON.stringify([...newIds].sort());
  const reordered = complete && JSON.stringify(oldIds) !== JSON.stringify(newIds);
  const validIds = [...before, ...after].every(action => ['groupId', 'actionLibraryId'].every(field => Number.isSafeInteger(Number(action[field])) && Number(action[field]) > 0));
  const unique = complete && validIds && new Set(oldIds).size === oldIds.length && new Set(newIds).size === newIds.length;
  if (reordered && !unique) throw new Error('Ambiguous duplicate saved-action reorder requires verified occurrence mapping.');
  return { reordered, unique, oldIds, newIds };
}
export function buildSavedEditDiff(baseline, resulting, allowedChanges) {
  return buildSavedEditDiffInternal(baseline, resulting, allowedChanges);
}
function buildSavedEditDiffInternal(baseline, resulting, allowedChanges, occurrencePairing) {
  validatePayload(baseline); validatePayload(resulting);
  if (!Array.isArray(allowedChanges) || !allowedChanges.length || new Set(allowedChanges).size !== allowedChanges.length || allowedChanges.some(category => !SAVED_EDIT_CHANGE_CATEGORIES.includes(category))) throw new Error('allowed_changes must contain unique, explicit saved-edit categories.');
  const categories = new Set();
  const topLevelDifferences = [];
  for (const field of new Set([...Object.keys(baseline), ...Object.keys(resulting)])) {
    if (field === 'actionLibraryList' || same(baseline[field], resulting[field], field)) continue;
    const category = field === 'name' ? 'name' : field === 'totalCapacity' ? 'load' : 'unknown_metadata';
    categories.add(category);
    topLevelDifferences.push(category === 'unknown_metadata' ? { field: safeUnknownKey(field), category } : { field, category, old: baseline[field], new: resulting[field] });
  }
  const { oldIds, newIds, reordered, unique } = occurrencePairing ?? permutation(baseline.actionLibraryList, resulting.actionLibraryList);
  if (reordered) categories.add('exercise_order');
  const actions = [];
  for (let index = 0; index < Math.max(oldIds.length, newIds.length); index++) {
    const old = baseline.actionLibraryList[reordered && unique ? oldIds.indexOf(newIds[index]) : index], next = resulting.actionLibraryList[index];
    const differences = [];
    if (!old || !next) { categories.add('exercise_selection'); differences.push({ field: 'action', category: 'exercise_selection', change: old ? 'removed' : 'added' }); }
    else for (const field of new Set([...Object.keys(old), ...Object.keys(next)])) {
      if (same(old[field], next[field], field)) continue;
      const category = fields[field] ?? 'unknown_metadata';
      categories.add(category);
      differences.push(category === 'unknown_metadata' ? { field: safeUnknownKey(field), category } : { field, category, old: old[field], new: next[field] });
    }
    if (differences.length) actions.push({ index, old: safeRecord(old), new: safeRecord(next), differences });
  }
  // Occurrence mapping with a membership change: report baseline occurrences that are no longer present.
  if (occurrencePairing?.membershipChange) for (const [oldIndex, key] of oldIds.entries()) if (!newIds.includes(key)) {
    categories.add('exercise_selection');
    actions.push({ index: oldIndex, old: safeRecord(baseline.actionLibraryList[oldIndex]), new: null, differences: [{ field: 'action', category: 'exercise_selection', change: 'removed' }] });
  }
  const changes = [...categories].sort();
  const unauthorizedChanges = changes.filter(category => !allowedChanges.includes(category));
  return { complete: true, changed: changes.length > 0, allowedChanges: [...allowedChanges], categories: changes, unauthorizedChanges, permitted: unauthorizedChanges.length === 0, topLevelDifferences, actions };
}

export function diffSavedEditPayloads(before, after, { exerciseMetadataByAction, savedEditOccurrenceMapping } = {}) {
  // Normalize only proven equivalent representations, never raw dose or identity.
  // The caller retains the original GET digest for concurrency control.
  validatePayload(before); validatePayload(after);
  const normalizedBefore = structuredClone(before), normalizedAfter = structuredClone(after);
  const pairing = savedEditOccurrenceMapping ? validateSavedEditOccurrenceMapping(savedEditOccurrenceMapping, before, after) : permutation(before.actionLibraryList, after.actionLibraryList);
  const values = value => typeof value === 'number' || typeof value === 'string' ? String(value).split(',').map(v => v.trim()) : [];
  // GET representation only (never dose): read-only display keys that the write payload does not echo, rest omitted in
  // breakTime but present in breakTime2, countType metadata when completionMethod agrees, and blank counterweights.
  const blank = value => value === undefined || value === null || String(value).split(',').every(cell => cell.trim() === '');
  const cellsOf = value => String(value ?? '').split(',').map(cell => cell.trim());
  const sameExpanded = (a, b) => { const x = cellsOf(a), y = cellsOf(b); const n = Math.max(x.length, y.length); if (x.length !== y.length && x.length !== 1 && y.length !== 1) return false; for (let i = 0; i < n; i++) if (Number(x.length === 1 ? x[0] : x[i]) !== Number(y.length === 1 ? y[0] : y[i])) return false; return true; };
  for (let index = 0; index < before.actionLibraryList.length; index++) {
    const rightIndex = pairing.reordered && pairing.unique ? pairing.newIds.indexOf(pairing.oldIds[index]) : index;
    const left = before.actionLibraryList[index], right = after.actionLibraryList[rightIndex], row = normalizedBefore.actionLibraryList[index];
    if (!right || Number(left.groupId) !== Number(right.groupId) || Number(left.actionLibraryId) !== Number(right.actionLibraryId)) continue;
    for (const key of Object.keys(left)) if (!Object.hasOwn(fields, key) && !Object.hasOwn(right, key)) delete row[key];
    if (blank(left.breakTime) && !blank(right.breakTime) && same(right.breakTime, left.breakTime2, 'breakTime2')) row.breakTime = right.breakTime;
    // A single compressed GET countType cell (e.g. numeric 2 for every set) is metadata when completionMethod agrees;
    // per-set countType changes stay strict.
    // Real GET returns countType as a JSON number (one cell for all sets); that shape is metadata when completionMethod agrees.
    if (Object.hasOwn(right, 'countType') && (sameExpanded(left.countType, right.countType) || ((typeof left.countType === 'number' || (cellsOf(left.countType).length === 1 && cellsOf(right.countType).length > 1)) && sameExpanded(left.completionMethod, right.completionMethod)))) row.countType = right.countType;
    for (const key of ['counterweight', 'counterweight2']) if (blank(left[key]) && Object.hasOwn(right, key) && blank(right[key])) row[key] = right[key];
  }
  let derivedRmCapacity = false;
  for (let index = 0; index < before.actionLibraryList.length; index++) {
    const rightIndex = pairing.reordered && pairing.unique ? pairing.newIds.indexOf(pairing.oldIds[index]) : index;
    const left = before.actionLibraryList[index], right = after.actionLibraryList[rightIndex];
    if (!right || Number(left.groupId) !== Number(right.groupId) || Number(left.actionLibraryId) !== Number(right.actionLibraryId)) continue;
    const count = values(left.setsAndReps).length;
    if (!count || count !== values(right.setsAndReps).length) continue;
    const metadata = exerciseMetadataByAction?.get(`${Number(left.groupId)}:${Number(left.actionLibraryId)}`);
    const units = Array.from({ length: count }, (_, setIndex) => [
      resolveSavedTemplateSetUnit(left, setIndex, count, undefined, false, metadata).unit,
      resolveSavedTemplateSetUnit(right, setIndex, count, undefined, false, metadata).unit,
    ]);
    if (units.some(([a, b]) => !['reps', 'seconds'].includes(a) || a !== b)) continue;
    const repChange = units.every(([unit]) => unit === 'reps') && namedRmRepChange(left, right);
    if (repChange && Number(right.capacity) === repChange.capacity) {
      normalizedBefore.actionLibraryList[index].capacity = right.capacity;
      derivedRmCapacity = true;
    }
    if (getTemplatePresetId(left) === -1 && getTemplatePresetId(right) === -1) {
      const staticWeights = action => {
        if (!['counterweight', 'counterweight2'].every(field => action[field] === '' || action[field] === undefined || action[field] === null)) return null;
        if (!['number', 'string'].includes(typeof action.weights)) return null;
        const tokens = String(action.weights).split(',').map(value => value.trim());
        if (![1, count].includes(tokens.length) || tokens.some(value => !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value)) || Number(value) > 2200)) return null;
        return tokens.length === 1 ? Array(count).fill(Number(tokens[0])) : tokens.map(Number);
      };
      const beforeWeights = staticWeights(left), afterWeights = staticWeights(right);
      if (beforeWeights && afterWeights) {
        normalizedBefore.actionLibraryList[index].weights = beforeWeights.join(',');
        normalizedAfter.actionLibraryList[rightIndex].weights = afterWeights.join(',');
      }
    }
    const nameAliases = ['templatePresetName', 'presetName', 'templatePreset', 'preset'];
    const validNameTypes = action => nameAliases.every(field => action[field] == null || typeof action[field] === 'string');
    if (units.every(([unit]) => unit === 'reps') && validNameTypes(left) && validNameTypes(right) && (sameObservedRmPresetDose(left, right) || repChange)) {
      // Both complete rows independently prove the same named preset dose.
      // Absent aliases, numeric ID strings and shared cells are readback forms,
      // not a new load prescription. Raw payload/digest remain unchanged.
      for (const [original, normalized] of [[left, normalizedBefore.actionLibraryList[index]], [right, normalizedAfter.actionLibraryList[rightIndex]]]) {
        const dose = expandObservedRmPresetAction(original);
        for (const alias of ['presetId', ...nameAliases]) delete normalized[alias];
        normalized.templatePresetId = dose.presetId;
        for (const field of ['weights', 'counterweight', 'counterweight2']) normalized[field] = dose[field].join(',');
      }
    }
    for (const [original, normalized] of [[left, normalizedBefore.actionLibraryList[index]], [right, normalizedAfter.actionLibraryList[rightIndex]]]) {
      const completion = values(original.completionMethod);
      if (![1, count].includes(completion.length)) continue;
      normalized.completionMethod = units.map(([unit]) => unit === 'seconds' ? '2' : '1').join(',');
      // countType is metadata. Change its representation only when it mirrors
      // the proven completion code; unrelated countType values remain strict.
      const counts = values(original.countType);
      if ([1, count].includes(counts.length) && Array.from({ length: count }, (_, i) => Number(counts[counts.length === 1 ? 0 : i]) === Number(completion[completion.length === 1 ? 0 : i])).every(Boolean)) normalized.countType = normalized.completionMethod;
    }
  }
  if (derivedRmCapacity && Number(after.totalCapacity) === after.actionLibraryList.reduce((sum, action) => sum + Number(action.capacity), 0)) normalizedBefore.totalCapacity = after.totalCapacity;
  const result = buildSavedEditDiffInternal(normalizedBefore, normalizedAfter, [...SAVED_EDIT_CHANGE_CATEGORIES], pairing);
  const { allowedChanges, unauthorizedChanges, permitted, ...neutral } = result;
  return { ...neutral, differences: [...result.topLevelDifferences, ...result.actions.flatMap(action => action.differences.map(change => ({ index: action.index, ...change })))] };
}

export function assertSavedEditScope(diff, allowedChanges) {
  if (!diff || diff.complete !== true || !Array.isArray(diff.categories)) throw new Error('Complete saved-edit diff required.');
  if (!Array.isArray(allowedChanges) || !allowedChanges.length || new Set(allowedChanges).size !== allowedChanges.length || allowedChanges.some(category => !SAVED_EDIT_CHANGE_CATEGORIES.includes(category))) throw new Error('allowed_changes must contain unique, explicit saved-edit categories.');
  const unauthorized = diff.categories.filter(category => !allowedChanges.includes(category));
  if (unauthorized.length) throw new Error(`Saved-edit changes outside approved scope: ${unauthorized.join(', ')}.`);
  return { ...diff, allowedChanges: [...allowedChanges], unauthorizedChanges: [], permitted: true };
}


/** Presentation only: derive preserved settings from independently valid approved wire.
 * Never expose counters/marker values or reinterpret them as kg, percentages or RIR. */
export function savedEditExecutionDisclosure(baseline, generated, approved, occurrenceMapping) {
  validatePayload(baseline); validatePayload(generated); validatePayload(approved);
  if (generated.actionLibraryList.length !== approved.actionLibraryList.length) throw new Error('Saved-edit presentation action count changed.');
  const pairing = occurrenceMapping
    ? validateSavedEditOccurrenceMapping(occurrenceMapping, baseline, approved)
    : permutation(baseline.actionLibraryList, approved.actionLibraryList);
  const identity = row => JSON.stringify([comparable(row.groupId, 'groupId'), comparable(row.actionLibraryId, 'actionLibraryId')]);
  const queues = new Map();
  baseline.actionLibraryList.forEach((row, index) => { const key = identity(row); if (!queues.has(key)) queues.set(key, []); queues.get(key).push(index); });
  const items = [];
  approved.actionLibraryList.forEach((row, actionIndex) => {
    const generatedRow = generated.actionLibraryList[actionIndex];
    if (identity(row) !== identity(generatedRow)) throw new Error('Saved-edit presentation generated occurrence changed.');
    const baselineIndex = occurrenceMapping ? pairing.oldIds.indexOf(pairing.newIds[actionIndex]) : queues.get(identity(row))?.shift();
    if (baselineIndex === undefined || baselineIndex < 0) return;
    const oldDose = expandObservedRmPresetAction(baseline.actionLibraryList[baselineIndex]);
    const generatedDose = expandObservedRmPresetAction(generatedRow);
    const approvedDose = expandObservedRmPresetAction(row);
    if (!oldDose || !generatedDose || !approvedDose || oldDose.presetId !== approvedDose.presetId || generatedDose.presetId !== approvedDose.presetId) return;
    const equal = (a,b) => a.length === b.length && a.every((value,index) => value === b[index]);
    if (!equal(oldDose.counterweight, approvedDose.counterweight) || equal(generatedDose.counterweight, approvedDose.counterweight)) return;
    items.push(Object.freeze({ actionIndex, baselineIndex, groupId: Number(row.groupId), actionLibraryId: Number(row.actionLibraryId),
      ...(occurrenceMapping ? {entryId: occurrenceMapping.after[actionIndex].entryId, occurrenceOrdinal: occurrenceMapping.after[actionIndex].ordinal} : {}),
      machinePreset: getReferenceClientRmPresetById(approvedDose.presetId).name, existingPresetSettingsPreserved: true,
      perSetSettingsDiffer: new Set(approvedDose.counterweight).size > 1,
      message: 'Zachowano dotychczasowe ustawienia Smart RM dla poszczególnych serii. Opór nadal dobiera urządzenie; kilogramy nie są znane.' }));
  });
  return Object.freeze({ kind: 'saved-template-update', calendarChanged: false, newTemplateCreated: false, items: Object.freeze(items) });
}

// Reconcile the actual wire payload, rather than hiding serializer drift in its
// diff. Occurrences match in order; duplicate catalog identities are not merged.
export function reconcileSavedEditPayload(baseline, proposed, context = {}, { explicitActions, explicitTotalCapacity = false, allowedChanges, generatedPresetDefaults = false } = {}) {
  validatePayload(baseline); validatePayload(proposed);
  const pairing = context.savedEditOccurrenceMapping ? validateSavedEditOccurrenceMapping(context.savedEditOccurrenceMapping, baseline, proposed) : permutation(baseline.actionLibraryList, proposed.actionLibraryList);
  const result = structuredClone(proposed);
  const occurrences = new Map();
  const identity = action => JSON.stringify([comparable(action.groupId, 'groupId'), comparable(action.actionLibraryId, 'actionLibraryId')]);
  for (const action of baseline.actionLibraryList) {
    const key = identity(action);
    if (!occurrences.has(key)) occurrences.set(key, []);
    occurrences.get(key).push(action);
  }
  let allEquivalent = baseline.actionLibraryList.length === result.actionLibraryList.length;
  let capacityRestored = false;
  for (let index = 0; index < result.actionLibraryList.length; index++) {
    const action = result.actionLibraryList[index];
    const old = context.savedEditOccurrenceMapping
      ? baseline.actionLibraryList[pairing.oldIds.indexOf(pairing.newIds[index])]
      : occurrences.get(identity(action))?.shift();
    if (!old) { allEquivalent = false; continue; }
    const left = structuredClone(old), right = structuredClone(action);
    delete left.capacity; delete right.capacity;
    // Only the writer's default selection may fill an absent optional field.
    // Any non-default selection is an executable change and remains strict.
    const count = String(action.setsAndReps ?? '').split(',').length;
    const metadata = context.exerciseMetadataByAction?.get(`${Number(old.groupId)}:${Number(old.actionLibraryId)}`);
    const knownUnits = Object.hasOwn(old, 'setsAndReps') && Object.hasOwn(action, 'setsAndReps') &&
      Array.from({ length: count }, (_, position) => {
        const before = resolveSavedTemplateSetUnit(old, position, count, undefined, false, metadata).unit;
        const after = resolveSavedTemplateSetUnit(action, position, count, undefined, false, metadata).unit;
        return ['reps', 'seconds'].includes(before) && before === after;
      }).every(Boolean);
    if (!knownUnits) { allEquivalent = false; continue; }
    const defaultSelection = String(action.selectCompletionMethod ?? '').split(',').map(value => value.trim());
    const explicit = explicitActions?.[index];
    const selectionGenerated = !Object.hasOwn(old, 'selectCompletionMethod') &&
      (!explicit || !Object.hasOwn(explicit, 'selectCompletionMethod')) &&
      [1, count].includes(defaultSelection.length) && defaultSelection.every(value => value === '1');
    if (selectionGenerated) {
      delete right.selectCompletionMethod;
      // The writer's generated default is not a requested dose edit, even
      // when the same row legitimately changes load or resistance mode.
      delete action.selectCompletionMethod;
    }
    // Scientific normalization owns the default adapter selector; callers
    // cannot supply the saved selector. A scoped non-load scientific edit keeps
    // the already valid stored selectors, including distinct per-set values.
    // This opt-in belongs only to the fresh scientific serializer callsites.
    const safeGeneratedScope = generatedPresetDefaults === true && explicitActions === undefined && !explicitTotalCapacity &&
      Array.isArray(allowedChanges) && allowedChanges.length > 0 && new Set(allowedChanges).size === allowedChanges.length &&
      allowedChanges.every(category => ['name', 'rest', 'resistance_mode', 'exercise_order'].includes(category)) &&
      (!allowedChanges.includes('exercise_order') || pairing.unique);
    let preservedGeneratedLoad = false;
    const safeDoseScope = generatedPresetDefaults === true && explicitActions === undefined && !explicitTotalCapacity &&
      Array.isArray(allowedChanges) && new Set(allowedChanges).size === allowedChanges.length &&
      allowedChanges.includes('dose') &&
      allowedChanges.every(category => ['dose', 'name', 'rest', 'resistance_mode', 'exercise_order'].includes(category)) &&
      (!allowedChanges.includes('exercise_order') || pairing.unique);
    let recomputedRmCapacity = false;
    if (safeGeneratedScope || safeDoseScope) {
      const oldDose = expandObservedRmPresetAction(left), generatedDose = expandObservedRmPresetAction(right);
      const preset = generatedDose && getReferenceClientRmPresetById(generatedDose.presetId);
      const rules = preset && getReferenceClientRmPresetRules(preset.name);
      if (oldDose && generatedDose && oldDose.presetId === generatedDose.presetId && rules &&
          generatedDose.counterweight.every(value => value === rules.defaultRmLevel)) {
        const preserved = { ...right, counterweight: oldDose.counterweight.join(','), counterweight2: oldDose.counterweight2.join(',') };
        const repChange = safeDoseScope && namedRmRepChange(left, preserved);
        if (safeDoseScope && (oldDose.reps.length !== count ||
            !same(left.leftRight, right.leftRight, 'leftRight') ||
            ![left, right].every(row => Array.from({ length: count }, (_value, position) => resolveSavedTemplateSetUnit(row, position, count).unit === 'reps').every(Boolean)) ||
            !repChange && JSON.stringify(oldDose.reps) !== JSON.stringify(generatedDose.reps))) { allEquivalent = false; continue; }
        const remaining = diffSavedEditPayloads({ actionLibraryList: [left] }, { actionLibraryList: [preserved] }, { ...context, savedEditOccurrenceMapping: undefined });
        if (remaining.complete === true && remaining.categories.every(category => allowedChanges.includes(category))) {
          right.counterweight = preserved.counterweight;
          right.counterweight2 = preserved.counterweight2;
          action.counterweight = preserved.counterweight;
          action.counterweight2 = preserved.counterweight2;
          preservedGeneratedLoad = true;
          if (repChange) {
            action.capacity = repChange.capacity;
            capacityRestored = true;
            recomputedRmCapacity = true;
          }
        }
      }
    }
    const comparison = diffSavedEditPayloads({ actionLibraryList: [left] }, { actionLibraryList: [right] }, { ...context, savedEditOccurrenceMapping: undefined });
    if (recomputedRmCapacity) { allEquivalent = false; continue; }
    // An authorized static mode edit changes no reps or load. reference client capacity
    // depends on reps and load, so retain stored opaque capacity in that case.
    const preservedStaticModeCapacity = safeGeneratedScope && allowedChanges.includes('resistance_mode') &&
      [left, right].every(row => getTemplatePresetId(row) === -1 &&
        ['counterweight', 'counterweight2'].every(field => row[field] === '' || row[field] == null) &&
        [1, count].includes(String(row.weights ?? '').split(',').length) &&
        String(row.weights ?? '').split(',').every(value => /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()) && Number.isFinite(Number(value)) && Number(value) <= 2200) &&
        [1, count].includes(String(row.sportMode ?? '').split(',').length) &&
        String(row.sportMode ?? '').split(',').every(value => ['1', '2', '3'].includes(value.trim())));
    const equivalent = !comparison.categories.some(category => ['exercise_selection', 'dose', 'load', 'unknown_metadata'].includes(category) ||
      category === 'resistance_mode' && !preservedGeneratedLoad && !preservedStaticModeCapacity);
    if (!equivalent) { allEquivalent = false; continue; }
    const capacityExplicit = explicit && Object.hasOwn(explicit, 'capacity') && !same(explicit.capacity, old.capacity, 'capacity');
    if (!capacityExplicit) {
      capacityRestored ||= !same(action.capacity, old.capacity, 'capacity');
      if (Object.hasOwn(old, 'capacity')) action.capacity = structuredClone(old.capacity);
      else delete action.capacity;
    } else allEquivalent = false;
    if (selectionGenerated) delete action.selectCompletionMethod;
  }
  if (allEquivalent && !explicitTotalCapacity) {
    if (Object.hasOwn(baseline, 'totalCapacity')) result.totalCapacity = structuredClone(baseline.totalCapacity);
    else delete result.totalCapacity;
  } else if (capacityRestored && !explicitTotalCapacity) {
    // A mixed edit must sum the capacities actually sent. The old aggregate
    // may be opaque; no inferred offset is carried into a changed program.
    let total = 0;
    for (const action of result.actionLibraryList) {
      const capacity = action.capacity;
      const numericScalar = typeof capacity === 'number' || typeof capacity === 'string' && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(capacity.trim());
      if (!numericScalar || !Number.isFinite(Number(capacity)) || Number(capacity) < 0 || Number(capacity) > 1_000_000_000) throw new Error('Mixed saved edit requires confirmed finite per-action capacity metadata.');
      total += Number(capacity);
    }
    if (!Number.isFinite(total) || total > 1_000_000_000) throw new Error('Mixed saved-edit totalCapacity exceeds limits.');
    result.totalCapacity = Number(total.toFixed(6));
  }
  return result;
}
