import { getReferenceClientRmPresetRules, MAX_PRESET_REPS } from './program-payload.mjs';

// Public reference client UI values. These are exercise-level preset IDs; they are
// selected independently from the exact actionLibraryId (exercise variant).
// They are not per-variant metadata returned by the Speediance catalog.
export const REFERENCE_CLIENT_RM_PRESETS = Object.freeze([
  Object.freeze({ id: 1, name: 'Gain Muscle' }),
  Object.freeze({ id: 3, name: 'Stamina' }),
  Object.freeze({ id: 5, name: 'Strength' })
]);

export function normalizedPresetName(name) {
  return typeof name === 'string'
    ? name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
    : '';
}

export function getReferenceClientRmPresetByName(name) {
  const normalized = normalizedPresetName(name);
  return REFERENCE_CLIENT_RM_PRESETS.find((preset) => normalizedPresetName(preset.name) === normalized) || null;
}

export function getReferenceClientRmPresetById(id) {
  return REFERENCE_CLIENT_RM_PRESETS.find((preset) => preset.id === id) || null;
}

export function buildReferenceClientRmPresetCandidates() {
  return REFERENCE_CLIENT_RM_PRESETS.map((preset) => ({
    ...preset,
    source: 'public reference client global preset menu; exercise variant selected separately',
    scope: 'reference-client-global'
  }));
}

/**
 * Validate only the reference client's global preset menu. A positive
 * `actionLibraryId` is separately resolved/validated against the live catalog
 * by the caller; it is not part of the preset mapping.
 */
export function hasGlobalReferenceClientRmPreset(candidates, { presetId, presetName, actionLibraryId } = {}) {
  const referenceClientPreset = getReferenceClientRmPresetById(presetId);
  const expectedName = normalizedPresetName(presetName);
  if (!referenceClientPreset || !expectedName || normalizedPresetName(referenceClientPreset.name) !== expectedName ||
      !Number.isSafeInteger(actionLibraryId) || actionLibraryId < 1 || !Array.isArray(candidates)) return false;
  return candidates.some((candidate) =>
    candidate?.scope === 'reference-client-global' &&
    candidate.id === presetId &&
    normalizedPresetName(candidate.name) === expectedName
  );
}

// Global reference client presets must remain selectable when an exercise-variant
// metadata endpoint omits or contradicts its preset list. The exact variant
// still has to be independently confirmed in the exercise catalog.

function numericCsv(value) {
  // The readback sequence parser also accepts a numeric singleton. Treat that
  // representation like one shared CSV cell without accepting coercible types.
  if (typeof value === 'number') return Number.isFinite(value) ? [value] : [];
  if (typeof value !== 'string' || !value.trim()) return [];
  const parts = value.split(',');
  if (parts.some((part) => !part.trim())) return [];
  const numbers = parts.map((part) => Number(part.trim()));
  return numbers.every(Number.isFinite) ? numbers : [];
}

export function getTemplatePresetId(action) {
  const values = [action?.templatePresetId, action?.presetId].filter(value => value !== undefined && value !== null);
  const parsed = values.map(parseTemplatePresetId);
  if (!parsed.length || parsed.some(value => value === null) || new Set(parsed).size !== 1) return null;
  return parsed[0];
}

function parseTemplatePresetId(value) {
  if (Number.isSafeInteger(value)) return value >= -1 && value <= 1000 ? value : null;
  if (typeof value === 'string' && /^-?\d{1,6}$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= -1 && parsed <= 1000 ? parsed : null;
  }
  return null;
}

/**
 * Recognize the pinned hbui3 community-client preset wire shape. Rows with a
 * non-Custom preset ID use weights=3.5 as a placeholder and store their integer
 * RM target in both counterweight fields. The API often omits the preset name
 * on readback. The saved-template verifier accepts one common load cell for
 * repeated equal per-set values, including both RM counterweight fields.
 * Expand shared cells before validation and writing; never treat them as kg.
 */
export function hasValidReferenceClientRmPresetNameAliases(action, presetId = getTemplatePresetId(action)) {
  const referenceClientPreset = getReferenceClientRmPresetById(presetId);
  if (!referenceClientPreset) return false;
  return [action?.templatePresetName, action?.presetName, action?.templatePreset, action?.preset]
    .every(value => value == null || typeof value === 'string' &&
      (!value.trim() || normalizedPresetName(value) === normalizedPresetName(referenceClientPreset.name)));
}

export function expandObservedRmPresetAction(action) {
  const presetId = getTemplatePresetId(action);
  const referenceClientPreset = getReferenceClientRmPresetById(presetId);
  if (!referenceClientPreset || !hasValidReferenceClientRmPresetNameAliases(action, presetId)) return null;
  const rules = getReferenceClientRmPresetRules(referenceClientPreset.name);
  const reps = numericCsv(action?.setsAndReps);
  const expand = (values) => values.length === reps.length ? values
    : values.length === 1 ? Array(reps.length).fill(values[0]) : null;
  let weights = expand(numericCsv(action?.weights));
  const counterweight2 = expand(numericCsv(action?.counterweight2));
  // Real Speediance GET shape for Smart RM rows (fixtures/real/saved-templates-hyp.json): counterweight is omitted,
  // counterweight2 carries the RM level and weights carries the device-computed display load (e.g. 52 for RM 13).
  // Only in that shape the write form is restored: counterweight = counterweight2 and weights = the 3.5 placeholder.
  const percentCells = expand(numericCsv(action?.percent1rmStr));
  const readbackShape = action?.counterweight === undefined && counterweight2 !== null && percentCells !== null && percentCells.every(value => value > 0 && value <= 100);
  const counterweight = readbackShape ? counterweight2 : expand(numericCsv(action?.counterweight));
  if (readbackShape && weights && weights.every(value => value > 0)) weights = weights.map(() => 3.5);
  if (!reps.length || !weights || !counterweight || !counterweight2) return null;
  const minReps = rules?.minReps ?? 1;
  const maxReps = rules?.maxReps ?? MAX_PRESET_REPS;
  if (reps.some((value) => !Number.isSafeInteger(value) || value < minReps || value > maxReps)) return null;
  if (rules && counterweight.some((value) => value < rules.minRmLevel || value > rules.maxRmLevel)) return null;
  if (weights.some((value) => Math.abs(value - 3.5) > 1e-9)) return null;
  if (counterweight.some((value, index) =>
    !Number.isSafeInteger(value) || value < 1 || value > 20 || value !== counterweight2[index]
  )) return null;
  return { presetId, reps, weights, counterweight, counterweight2 };
}

export function isObservedRmPresetAction(action) {
  return expandObservedRmPresetAction(action) !== null;
}

/** Ignore readback compression only when both rows independently validate. */
export function sameObservedRmPresetDose(left, right) {
  const leftDose = expandObservedRmPresetAction(left);
  const rightDose = expandObservedRmPresetAction(right);
  if (!leftDose || !rightDose || leftDose.presetId !== rightDose.presetId) return false;
  return ['reps', 'weights', 'counterweight', 'counterweight2'].every((field) =>
    leftDose[field].length === rightDose[field].length &&
    leftDose[field].every((value, index) => value === rightDose[field][index]));
}

function presetIdValue(value) {
  const parsed = Number.isSafeInteger(value)
    ? value
    : (typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : NaN);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 1000 ? parsed : null;
}

export function mergePresetOptions(...collections) {
  const byNameAndId = new Map();
  for (const option of collections.flat()) {
    const id = presetIdValue(option?.id);
    if (!option || typeof option.name !== 'string' || !option.name.trim() || id === null) continue;
    const key = `${normalizedPresetName(option.name)}:${id}`;
    const current = byNameAndId.get(key) || { id, name: option.name.trim(), sourcePaths: [] };
    for (const sourcePath of option.sourcePaths || []) {
      if (typeof sourcePath === 'string' && !current.sourcePaths.includes(sourcePath)) current.sourcePaths.push(sourcePath);
    }
    for (const observedIn of option.observedInPrograms || []) {
      current.observedInPrograms ||= [];
      if (typeof observedIn === 'string' && !current.observedInPrograms.includes(observedIn)) current.observedInPrograms.push(observedIn);
    }
    byNameAndId.set(key, current);
  }
  return [...byNameAndId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
}

export function resolvePresetId(options, requestedName) {
  const requested = normalizedPresetName(requestedName);
  const matching = (Array.isArray(options) ? options : []).filter((option) => normalizedPresetName(option?.name) === requested);
  const ids = [...new Set(matching.map((option) => presetIdValue(option?.id)).filter((id) => id !== null))];
  return ids.length === 1
    ? { status: 'resolved', id: ids[0], matching }
    : { status: ids.length > 1 ? 'ambiguous' : 'missing', ids, matching };
}

/** Require an exact Smart RM preset ID/name pair for the selected API variant. */
export function hasExactRmPresetPair(candidates, { presetId, presetName, actionLibraryId } = {}) {
  const expectedName = normalizedPresetName(presetName);
  if (!Array.isArray(candidates) || !Number.isSafeInteger(presetId) || presetId < 0 ||
      !expectedName || !Number.isSafeInteger(actionLibraryId) || actionLibraryId < 1) return false;
  return candidates.some((candidate) =>
    candidate?.id === presetId &&
    normalizedPresetName(candidate?.name) === expectedName &&
    Array.isArray(candidate?.actionLibraryIds) && candidate.actionLibraryIds.includes(actionLibraryId)
  );
}
