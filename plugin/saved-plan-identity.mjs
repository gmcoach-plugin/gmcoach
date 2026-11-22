import { createHash } from 'node:crypto';
import { normalizeExerciseEntry, validateExecutablePlanSections } from './executable-plan-sections.mjs';
import { expandObservedRmPresetAction, getTemplatePresetId } from './preset-mapping.mjs';
import { resolveSavedTemplateSetUnit } from './saved-templates.mjs';

const fingerprintPattern = /^[a-f0-9]{64}$/;
const positive = value => ['string', 'number'].includes(typeof value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 && /^(?:\d+)$/.test(String(value));
const validFingerprint = value => typeof value === 'string' && fingerprintPattern.test(value);
const ignored = new Set(['name', 'title', 'image', 'imageUrl', 'thumbnail', 'capacity']);
const numericFields = new Set(['groupId', 'actionLibraryId', 'templatePresetId', 'setsAndReps', 'breakTime', 'breakTime2', 'sportMode', 'leftRight', 'selectCompletionMethod', 'completionMethod', 'countType', 'weights', 'counterweight', 'counterweight2', 'level']);
function canonical(value, field) {
  if (numericFields.has(field) && (typeof value === 'string' || typeof value === 'number')) {
    const tokens = String(value).split(',');
    if (tokens.every(token => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token.trim()) && Number.isFinite(Number(token)) && Math.abs(Number(token)) <= Number.MAX_SAFE_INTEGER)) return tokens.map(Number);
  }
  if (Array.isArray(value)) return value.map(item => canonical(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function assertBoundedJson(value) {
  let nodes = 0;
  const active = new Set();
  function visit(item, depth) {
    if (++nodes > 20000 || depth > 12) throw new Error('Identity metadata exceeds nesting or node limits.');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (!item || typeof item !== 'object' || ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(item)) || active.has(item)) throw new Error('Identity metadata must contain finite JSON values.');
    active.add(item);
    if (Array.isArray(item) && (item.length > 1000 || Object.keys(item).length !== item.length)) throw new Error('Identity metadata arrays must be bounded and dense.');
    if (Object.keys(item).length > 1000) throw new Error('Identity metadata object exceeds field limits.');
    for (const key of Object.keys(item)) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error('Identity metadata accessors are unsupported.');
      visit(descriptor.value, depth + 1);
    }
    active.delete(item);
  }
  visit(value, 0);
}
function executionDigest(payload, semanticRm = false, semanticStatic = false, semanticCompletion = false) {
  if (!payload || !Array.isArray(payload.actionLibraryList) || !payload.actionLibraryList.length || payload.actionLibraryList.length > 100) throw new Error('Identity requires between 1 and 100 verified wire actions.');
  assertBoundedJson(payload.actionLibraryList);
  const encoded = JSON.stringify(payload.actionLibraryList);
  if (encoded.length > 1_000_000) throw new Error('Identity wire payload exceeds limit.');
  const actions = payload.actionLibraryList.map(action => {
    // Real Speediance GET rows carry 101–107 display keys (fixtures/real/saved-templates-hyp.json); 200 keeps the bound.
    if (!action || typeof action !== 'object' || Array.isArray(action) || Object.keys(action).length > 200 || !positive(action.groupId) || !positive(action.actionLibraryId)) throw new Error('Identity requires bounded actions with verified group and variant IDs.');
    let digestAction = action;
    let confirmedDose = false;
    const dose = semanticRm && expandObservedRmPresetAction(action);
    if (dose && dose.reps.every((_, index) => resolveSavedTemplateSetUnit(action, index, dose.reps.length).unit === 'reps')) {
      digestAction = { ...action, weights: dose.weights.join(','), counterweight: dose.counterweight.join(','), counterweight2: dose.counterweight2.join(',') };
      confirmedDose = true;
    }
    if (semanticStatic && getTemplatePresetId(action) === -1 &&
        ['templatePresetName', 'presetName', 'templatePreset', 'preset'].every(field => action[field] == null || typeof action[field] === 'string' && ['', 'customize'].includes(action[field].trim().toLowerCase())) &&
        ['counterweight', 'counterweight2'].every(field => action[field] === '' || action[field] == null) &&
        ['string', 'number'].includes(typeof action.setsAndReps) && ['string', 'number'].includes(typeof action.weights)) {
      const amounts = String(action.setsAndReps).split(',').map(value => value.trim());
      const loads = String(action.weights).split(',').map(value => value.trim());
      if (amounts.length && amounts.every(value => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 86400) &&
          [1, amounts.length].includes(loads.length) && loads.every(value => /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && Number.isFinite(Number(value)) && Number(value) <= 2200) &&
          amounts.every((_, index) => ['reps', 'seconds'].includes(resolveSavedTemplateSetUnit(action, index, amounts.length).unit))) {
        digestAction = { ...action, weights: Array.from({ length: amounts.length }, (_, index) => Number(loads[loads.length === 1 ? 0 : index])).join(',') };
        confirmedDose = true;
      }
    }
    if (semanticCompletion && confirmedDose && ['string', 'number'].includes(typeof action.completionMethod)) {
      const count = String(action.setsAndReps).split(',').length;
      const completion = String(action.completionMethod).split(',').map(value => value.trim());
      const units = Array.from({ length: count }, (_, index) => resolveSavedTemplateSetUnit(action, index, count).unit);
      if ([1, count].includes(completion.length) && completion.every(value => /^[012]$/.test(value) && value === completion[0]) &&
          units.every(unit => ['reps', 'seconds'].includes(unit) && unit === units[0])) {
        digestAction = { ...digestAction, completionMethod: Array(count).fill(Number(completion[0])).join(',') };
      }
    }
    return Object.fromEntries(Object.keys(digestAction).filter(key => !ignored.has(key)).sort().map(key => [key, canonical(digestAction[key], key)]));
  });
  return createHash('sha256').update(JSON.stringify(actions)).digest('hex');
}
function validateIdentity(identity) {
  if (!identity || ![1, 2, 3, 4].includes(identity.version) || !validFingerprint(identity.accountFingerprint) || !validFingerprint(identity.executionDigest) || !Array.isArray(identity.mappings) || !identity.mappings.length || identity.mappings.length > 100) throw new Error('Invalid saved plan identity.');
  const byEntry = new Map();
  let previousSection = -1;
  for (const [index, mapping] of identity.mappings.entries()) {
    if (!mapping || mapping.actionIndex !== index || !Number.isSafeInteger(mapping.entryId) || mapping.entryId < 1 || !['warmup', 'main', 'stretching'].includes(mapping.section) || !Number.isSafeInteger(mapping.groupId) || !Number.isSafeInteger(mapping.actionLibraryId) || !positive(mapping.groupId) || !positive(mapping.actionLibraryId)) throw new Error('Invalid saved plan mapping.');
    const previous = byEntry.get(mapping.entryId);
    if (previous && (mapping.section !== 'main' || previous.section !== 'main' || previous.groupId !== mapping.groupId || previous.actionLibraryId !== mapping.actionLibraryId)) throw new Error('Inconsistent repeated entry mapping.');
    byEntry.set(mapping.entryId, mapping);
    const rank = ['warmup', 'main', 'stretching'].indexOf(mapping.section);
    if (rank < previousSection) throw new Error('Invalid section order in saved identity.');
    previousSection = rank;
  }
  if (![...byEntry.values()].some(mapping => mapping.section === 'main')) throw new Error('Saved identity requires main entries.');
}
export function createSavedPlanIdentity(plan, serializedEntries, verifiedWirePayload, accountFingerprint) {
  if (!validFingerprint(accountFingerprint)) throw new Error('Identity requires a SHA-256 account fingerprint.');
  validateExecutablePlanSections(plan);
  if (!Array.isArray(serializedEntries) || serializedEntries.length !== verifiedWirePayload?.actionLibraryList?.length || serializedEntries.length > 100 || plan.exercises.length > 100) throw new Error('Identity requires exact serialized action alignment and at most 100 entries.');
  const planEntries = new Map(plan.exercises.map(exercise => [normalizeExerciseEntry(exercise).entryId, exercise]));
  const mappings = serializedEntries.map(({ exercise }, actionIndex) => {
    const local = normalizeExerciseEntry(exercise);
    const original = planEntries.get(local.entryId);
    const action = verifiedWirePayload.actionLibraryList[actionIndex];
    if (!original || normalizeExerciseEntry(original).section !== local.section || original.id !== exercise.id || !positive(action?.groupId) || !positive(action?.actionLibraryId) || Number(action.groupId) !== original.id || original.actionLibraryId !== undefined && Number(action.actionLibraryId) !== original.actionLibraryId) throw new Error('Serialized identity differs from verified catalog group or variant.');
    return { actionIndex, entryId: local.entryId, section: local.section, groupId: Number(action.groupId), actionLibraryId: Number(action.actionLibraryId) };
  });
  if ([...planEntries.keys()].some(entryId => !mappings.some(mapping => mapping.entryId === entryId))) throw new Error('Identity omits an executable plan entry.');
  const identity = { version: 4, accountFingerprint, executionDigest: executionDigest(verifiedWirePayload, true, true, true), mappings };
  validateIdentity(identity);
  return identity;
}
export function reconcileSavedPlanIdentity(identity, currentWirePayload, accountFingerprint) {
  if (identity === undefined || identity === null) return { status: 'missing' };
  try {
    validateIdentity(identity);
    if (!validFingerprint(accountFingerprint)) return { status: 'invalid' };
    if (identity.accountFingerprint !== accountFingerprint || identity.executionDigest !== executionDigest(currentWirePayload, identity.version >= 2, identity.version >= 3, identity.version >= 4) || identity.mappings.length !== currentWirePayload.actionLibraryList.length) return { status: 'stale' };
    for (const mapping of identity.mappings) {
      const action = currentWirePayload.actionLibraryList[mapping.actionIndex];
      if (Number(action.groupId) !== mapping.groupId || Number(action.actionLibraryId) !== mapping.actionLibraryId) return { status: 'stale' };
    }
    return { status: 'matched', mappings: identity.mappings.map(({ actionIndex, entryId, section, groupId, actionLibraryId }) => ({ actionIndex, entryId, section, groupId, actionLibraryId })) };
  } catch { return { status: 'invalid' }; }
}

/** Build an edit mapping only from an independently matched saved identity. */
/** identityBaseline: the sent wire the identity was created from, accepted by the caller only after the current GET verified against it. */
export function createSavedEditOccurrenceMapping(identity, baseline, plan, serializedEntries, proposed, accountFingerprint, { identityBaseline, allowMembershipChange = false } = {}) {
  let old = reconcileSavedPlanIdentity(identity, identityBaseline ?? baseline, accountFingerprint);
  if (old.status === 'matched' && identityBaseline && (identityBaseline.actionLibraryList.length !== baseline.actionLibraryList.length ||
    identityBaseline.actionLibraryList.some((action, index) => Number(action.groupId) !== Number(baseline.actionLibraryList[index]?.groupId) || Number(action.actionLibraryId) !== Number(baseline.actionLibraryList[index]?.actionLibraryId)))) old = { status: 'stale' };
  const next = createSavedPlanIdentity(plan, serializedEntries, proposed, accountFingerprint);
  let derivedFromReadback = false;
  if (old.status !== 'matched') {
    // Stale or missing local identity: rebuild the old side from the verified current readback by group+variant occurrence.
    const derived = deriveMappingsFromReadback(baseline, next.mappings);
    if (!derived) throw new Error('Duplicate reorder requires matched saved occurrence identity.');
    if (derived.unmatched && !allowMembershipChange) throw new Error('Reorder changed saved occurrence membership.');
    old = { status: 'matched', mappings: derived.mappings };
    derivedFromReadback = true;
  }
  const decorate = mappings => {
    const counts = new Map();
    return mappings.map(mapping => {
      const ordinal = counts.get(mapping.entryId) ?? 0;
      counts.set(mapping.entryId, ordinal + 1);
      return { ...mapping, ordinal };
    });
  };
  const before = decorate(old.mappings), after = decorate(next.mappings);
  const key = mapping => JSON.stringify([mapping.entryId, mapping.ordinal, mapping.section, mapping.groupId, mapping.actionLibraryId]);
  const membershipChanged = JSON.stringify(before.map(key).sort()) !== JSON.stringify(after.map(key).sort());
  // Added/removed/replaced occurrences are allowed only within an explicit exercise_selection scope; the diff reports them.
  if (membershipChanged && !allowMembershipChange) throw new Error('Reorder changed saved occurrence membership.');
  return { version: 1, accountFingerprint, baselineDigest: executionDigest(baseline), before, after, ...(membershipChanged ? { membershipChange: true } : {}), ...(derivedFromReadback ? { derivedFromReadback: true } : {}) };
}

export function deriveMappingsFromReadback(baseline, nextMappings) {
  const actions = baseline?.actionLibraryList;
  if (!Array.isArray(actions) || !actions.length) return null;
  const seen = new Set();
  for (const action of actions) {
    const pair = Number(action?.groupId) + ':' + Number(action?.actionLibraryId);
    if (seen.has(pair)) return null; // repeated occurrences are ambiguous without a matched identity
    seen.add(pair);
  }
  const pool = nextMappings.map(mapping => ({ ...mapping, used: false }));
  let synthetic = 1_000_000, unmatched = false;
  const mappings = actions.map((action, actionIndex) => {
    const groupId = Number(action?.groupId), actionLibraryId = Number(action?.actionLibraryId);
    if (!positive(groupId) || !positive(actionLibraryId)) throw new Error('Readback action lacks verified group or variant IDs.');
    const hit = pool.find(row => !row.used && row.groupId === groupId && row.actionLibraryId === actionLibraryId);
    if (hit) { hit.used = true; return { actionIndex, entryId: hit.entryId, section: hit.section, groupId, actionLibraryId }; }
    unmatched = true;
    return { actionIndex, entryId: synthetic++, section: 'main', groupId, actionLibraryId };
  });
  if (pool.some(row => !row.used)) unmatched = true;
  return { mappings, unmatched };
}

/** Validate index alignment for internal diff/reconciliation; never a public argument. */
export function validateSavedEditOccurrenceMapping(mapping, baseline, proposed) {
  if (!mapping || mapping.version !== 1 || !validFingerprint(mapping.accountFingerprint) ||
      mapping.baselineDigest !== executionDigest(baseline)) throw new Error('Invalid or stale saved occurrence binding.');
  const keys = (rows, actions) => {
    if (!Array.isArray(rows) || rows.length !== actions.length) throw new Error('Incomplete occurrence binding.');
    const counts = new Map();
    return rows.map((row, index) => {
      const ordinal = counts.get(row?.entryId) ?? 0;
      if (!row || row.actionIndex !== index || !Number.isSafeInteger(row.entryId) || row.entryId < 1 || row.ordinal !== ordinal ||
          !['warmup', 'main', 'stretching'].includes(row.section) || Number(actions[index].groupId) !== row.groupId || Number(actions[index].actionLibraryId) !== row.actionLibraryId) throw new Error('Invalid occurrence row alignment.');
      counts.set(row.entryId, ordinal + 1);
      return JSON.stringify([row.entryId, ordinal, row.section, row.groupId, row.actionLibraryId]);
    });
  };
  const oldKeys = keys(mapping.before, baseline.actionLibraryList), newKeys = keys(mapping.after, proposed.actionLibraryList);
  if (mapping.membershipChange !== true && JSON.stringify([...oldKeys].sort()) !== JSON.stringify([...newKeys].sort())) throw new Error('Occurrence binding changes membership.');
  return { oldIds: oldKeys, newIds: newKeys, unique: true, reordered: JSON.stringify(oldKeys) !== JSON.stringify(newKeys), membershipChange: mapping.membershipChange === true };
}
