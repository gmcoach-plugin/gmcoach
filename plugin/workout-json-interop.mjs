import {createHash} from 'node:crypto';
import { getReferenceClientRmPresetById } from './preset-mapping.mjs';
import { getReferenceClientRmPresetRules } from './program-payload.mjs';
import { encodeStaticLoad, decodeStaticLoad } from './static-load-protocol.mjs';
import { getReferenceClientRmPresetByName } from './preset-mapping.mjs';
import { validateStaticLoad } from './static-load-limits.mjs';

export const workoutJsonExportSchema = {
  type: 'object', additionalProperties: false, required: ['normalizedPlan', 'staticWeightUnit', 'staticLoadProtocol'],
  properties: {
    normalizedPlan: { type: 'object', description: 'Explicit rep-based Coach prescription. Every exercise requires source exportIsUnilateral boolean; metric bilateral static loads also require exportIsBarbell boolean. Metadata is caller-supplied, not API-verified. No account/catalog reads; actual named RM selectors and reference-client-valid static load steps/limits are required. Export rest must match reference client import UI ranges: Customize 0–300, Gain Muscle 45–120, Stamina 30–180, Strength 60–180 seconds. These export UI limits do not restrict the account API.' },
    staticWeightUnit: { type: 'string', enum: ['kg', 'lb'] },
    staticLoadProtocol: { type: 'string', enum: ['legacy-reference-client-wire-lb-get-kg', 'account-unit-verbatim'], description: 'Explicit source protocol for normalization disclosure; not independently verified by this local tool.' }
  }
};

export const workoutJsonInspectionSchema = {
  type: 'object', additionalProperties: false, required: ['workoutJson'],
  properties: {
    workoutJson: { type: 'object', description: 'Public reference client export: name, exercises[{id,title,preset,isUnilateralExpanded,sets[{reps,weight,mode,rest}]}]. Preserved as imported evidence, never an approved executable plan.' },
    staticWeightUnit: { type: 'string', enum: ['kg', 'lb'], description: 'Explicit unit of the source JSON static weights. reference client export itself omits this unit; this is not current account-unit verification.' }
  }
};
function jsonClone(value) {
  let nodes = 0;
  const active = new Set();
  function visit(item, depth) {
    if (++nodes > 10000 || depth > 12) throw new Error('reference client JSON exceeds node or nesting limits.');
    if (item === null || ['string', 'boolean'].includes(typeof item)) {
      if (typeof item === 'string' && item.length > 10000) throw new Error('reference client JSON string exceeds limit.');
      return item;
    }
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (!item || typeof item !== 'object' || active.has(item) || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(item))) throw new Error('reference client input must be finite plain JSON without cycles.');
    if (Object.getOwnPropertySymbols(item).length) throw new Error('reference client JSON symbols are unsupported.');
    active.add(item);
    const keys = Object.getOwnPropertyNames(item).filter(key => !(Array.isArray(item) && key === 'length'));
    if (keys.length > 500 || Array.isArray(item) && (item.length > 500 || keys.length !== item.length)) throw new Error('reference client JSON arrays/objects exceed bounds or contain sparse entries.');
    const result = Array.isArray(item) ? [] : Object.create(null);
    for (const key of keys) {
      if (Array.isArray(item) && !/^(0|[1-9]\d*)$/.test(key)) throw new Error('reference client JSON arrays require plain indexed entries.');
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error('reference client JSON accessors are unsupported.');
      result[key] = visit(descriptor.value, depth + 1);
    }
    active.delete(item);
    return result;
  }
  const clone = visit(value, 0);
  const encoded = JSON.stringify(clone);
  if (Buffer.byteLength(encoded, 'utf8') > 500000) throw new Error('reference client JSON exceeds UTF-8 byte limit.');
  return JSON.parse(encoded);
}
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const positiveId = value => Number.isSafeInteger(value) && value > 0;
function numeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()) && Number.isFinite(Number(value))) return Number(value);
  return null;
}
function importedWeight(value) {
  // reference client permits a comma decimal separator for this field only. Require the
  // entire token instead of reproducing parseFloat's unsafe prefix acceptance.
  if (typeof value === 'string' && /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value.trim())) {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return numeric(value);
}

/** Local inspection only: imported numbers never supply omitted endpoint units. */
export function inspectWorkoutJson(input) {
  input = jsonClone(input);
  if (!object(input) || Object.keys(input).some(key => !['workoutJson', 'staticWeightUnit'].includes(key))) throw new Error('Unknown reference client inspection input field.');
  if (input.staticWeightUnit !== undefined && !['kg', 'lb'].includes(input.staticWeightUnit)) throw new Error('Explicit source static unit must be kg or lb.');
  const original = jsonClone(input.workoutJson);
  if (!object(original) || typeof original.name !== 'string' || !original.name.trim() || original.name.length > 80 || !Array.isArray(original.exercises) || !original.exercises.length || original.exercises.length > 60) throw new Error('reference client workout requires a bounded name and 1–60 exercises.');
  let setCount = 0;
  const diagnostics = [];
  const add = (path, reason) => diagnostics.push({ path, reason });
  for (const key of Object.keys(original)) if (!['name', 'exercises'].includes(key)) add(key, 'Unknown root field retained without executable interpretation.');
  const exercises = original.exercises.map((exercise, index) => {
    const path = `exercises[${index}]`;
    if (!object(exercise) || !positiveId(exercise.id) || typeof exercise.title !== 'string' || !exercise.title.trim() || exercise.title.length > 120 || !Array.isArray(exercise.sets) || !exercise.sets.length || exercise.sets.length > 100) throw new Error(`${path}: invalid bounded exercise identity/title/sets.`);
    setCount += exercise.sets.length;
    if (setCount > 300) throw new Error('reference client workout exceeds 300 imported sets.');
    const presetId = numeric(exercise.preset);
    const namedPreset = Number.isSafeInteger(presetId) ? getReferenceClientRmPresetById(presetId) : null;
    const namedRules = namedPreset && getReferenceClientRmPresetRules(namedPreset.name);
    if (presetId !== -1 && !namedPreset) add(`${path}.preset`, 'Unknown or missing preset; weight meaning unresolved.');
    if (exercise.isUnilateralExpanded !== undefined && typeof exercise.isUnilateralExpanded !== 'boolean') add(`${path}.isUnilateralExpanded`, 'Malformed expansion flag retained, not used to infer sides.');
    for (const key of Object.keys(exercise)) if (!['id', 'title', 'preset', 'isUnilateralExpanded', 'sets'].includes(key)) add(`${path}.${key}`, 'Unknown exercise field retained without executable interpretation.');
    const sets = exercise.sets.map((set, position) => {
      const setPath = `${path}.sets[${position}]`;
      if (!object(set)) throw new Error(`${setPath}: expected object.`);
      for (const key of Object.keys(set)) if (!['reps', 'weight', 'mode', 'rest'].includes(key)) add(`${setPath}.${key}`, 'Unknown set field retained without executable interpretation.');
      const amount = numeric(set.reps), weight = importedWeight(set.weight), mode = numeric(set.mode), rest = numeric(set.rest);
      if (weight !== null && typeof set.weight === 'string' && set.weight.includes(',')) add(`${setPath}.weight`, 'reference client source spelling: comma decimal parsed without changing the original token; this is not a unit conversion or executable load approval.');
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 86400) add(`${setPath}.reps`, 'Invalid imported amount.');
      if (!Number.isFinite(weight) || weight < 0 || weight > 1000) add(`${setPath}.weight`, 'Invalid imported load value.');
      if (namedPreset && (!namedRules || !Number.isSafeInteger(weight) || weight < namedRules.minRmLevel || weight > namedRules.maxRmLevel)) add(`${setPath}.weight`, `Invalid ${namedPreset.name} RM selector metadata; expected ${namedRules?.minRmLevel ?? 'unknown'}–${namedRules?.maxRmLevel ?? 'unknown'}.`);
      if (![1, 2, 3].includes(mode)) add(`${setPath}.mode`, 'Unsupported reference client resistance-mode code.');
      if (!Number.isSafeInteger(rest) || rest < 0 || rest > 600) add(`${setPath}.rest`, 'Invalid rest interval.');
      // Compatibility diagnostics describe the public reference client editor only.
      // JSON import parses these amounts without proving their original units;
      // neither the UI bounds nor this inspection authorize clamping/execution.
      const uiRules = namedRules ?? (presetId === -1 ? { minReps: 1, maxReps: 99, minRest: 0, maxRest: 300 } : null);
      const uiName = namedPreset?.name ?? 'Customize';
      if (uiRules && Number.isSafeInteger(amount) && amount >= 1 && amount <= 86400 && (amount < uiRules.minReps || amount > uiRules.maxReps)) {
        add(`${setPath}.reps`, `reference client import/editor UI compatibility: ${uiName} repetition input range is ${uiRules.minReps}–${uiRules.maxReps}; imported amount remains unchanged and its dose unit remains unknown.`);
      }
      if (uiRules && Number.isSafeInteger(rest) && rest >= 0 && rest <= 600 && (rest < uiRules.minRest || rest > uiRules.maxRest)) {
        add(`${setPath}.rest`, `reference client import/editor UI compatibility: ${uiName} rest input range is ${uiRules.minRest}–${uiRules.maxRest} seconds; imported rest remains unchanged. This is not an account API limit.`);
      }
      const load = presetId === -1
        ? { kind: 'manual-static-source', value: weight, unit: input.staticWeightUnit ?? 'unknown', accountUnitVerified: false }
        : namedPreset ? { kind: 'named-rm-selector-metadata', presetId, presetName: namedPreset.name, selector: weight, physicalLoadKnown: false, executableSelectorAuthorized: false }
          : { kind: 'unknown', rawWeight: set.weight ?? null };
      return { importedSetIndex: position, importedAmount: amount, doseUnit: 'unknown', side: 'unknown', mode, restSeconds: rest, load,
        unresolved: ['confirm-dose-unit-from-endpoint-or-catalog', 'confirm-catalog-variant', 'confirm-side-structure', 'fresh-scientific-review', ...(presetId === -1 && input.staticWeightUnit === undefined ? ['confirm-source-static-unit'] : []), ...(namedPreset ? ['review-imported-rm-selector-without-default-replacement'] : [])] };
    });
    return { importedExerciseIndex: index, catalogGroupId: exercise.id, sourceTitle: exercise.title, catalogVariantId: null,
      presetId, importedExpansionFlag: exercise.isUnilateralExpanded ?? null, unilateralMetadataVerified: false, expansionApplied: false, sets };
  });
  return { status: 'inspection-draft-only', sourceDigest:createHash('sha256').update(JSON.stringify(original)).digest('hex'), originalWorkout: original, name: original.name, exercises, diagnostics,
    scientificApproval: false, mutationSent: false, accountRead: false, requiresScientificPreview: true,
    limitations: ['reference client JSON omits dose unit, account unit, exact variant, verified sides, RIR, sections and scientific evidence.', 'No imported set is duplicated, clamped, renamed or converted into an executable prescription.'] };
}

/** Export an explicitly supplied prescription, never certify execution or research. */
export function exportWorkoutJson(input) {
  input = jsonClone(input);
  if (!object(input) || Object.keys(input).some(key => !['normalizedPlan', 'staticWeightUnit', 'staticLoadProtocol'].includes(key)) || !['kg', 'lb'].includes(input.staticWeightUnit) || !['legacy-reference-client-wire-lb-get-kg', 'account-unit-verbatim'].includes(input.staticLoadProtocol)) throw new Error('Export requires explicit account unit and static protocol.');
  const plan = input.normalizedPlan;
  if (!object(plan) || typeof plan.name !== 'string' || !plan.name.trim() || plan.name.length > 80 || !Array.isArray(plan.exercises) || !plan.exercises.length || plan.exercises.length > 60) throw new Error('Invalid bounded export prescription.');
  if (plan.supersetBlocks !== undefined && (!Array.isArray(plan.supersetBlocks) || plan.supersetBlocks.length)) throw new Error('reference client export cannot preserve supersets.');
  const normalizations = [];
  const representationNormalizations = [];
  let count = 0;
  const exercises = plan.exercises.map((exercise, index) => {
    if (!object(exercise) || !positiveId(exercise.id) || typeof exercise.title !== 'string' || !exercise.title.trim() || exercise.title.length > 120 || typeof exercise.exportIsUnilateral !== 'boolean' || !Array.isArray(exercise.sets) || !exercise.sets.length || exercise.sets.length > 100) throw new Error('Export requires exact source identity, title, sets and explicit unilateral metadata.');
    if ((exercise.section ?? 'main') !== 'main' || exercise.bands !== undefined || exercise.springGroupList !== undefined || !['customize-manual', 'fixed-kg', 'profile-auto', 'smart-rm'].includes(exercise.loadType)) throw new Error('Unsupported export section or load type.');
    count += exercise.sets.length; if (count > 300) throw new Error('Export exceeds 300 sets.');
    if (exercise.exportIsUnilateral) {
      if (exercise.unilateralPrescription !== 'explicit-sides' || exercise.sets.length % 2 || exercise.sets.some((set, position) => set.side !== (position % 2 ? 2 : 1))) throw new Error('Unilateral export requires explicit ordered left/right pairs.');
    } else if (exercise.sets.some(set => set.side !== undefined) || exercise.unilateralPrescription === 'explicit-sides') throw new Error('Bilateral export cannot contain unilateral sides.');
    const named = exercise.loadType === 'smart-rm' ? getReferenceClientRmPresetByName(exercise.smartRmPresetName) : null;
    const rules = named && getReferenceClientRmPresetRules(named.name);
    if (exercise.loadType === 'smart-rm' && (!named || exercise.smartRmPresetId !== named.id)) throw new Error('Export requires matching named preset identity.');
    const sets = exercise.sets.map((set, position) => {
      if (!object(set) || set.unit !== 'reps' || set.durationSeconds !== undefined || !Number.isSafeInteger(set.reps) || set.reps < 1 || set.reps > 99 || ![1, 2, 3].includes(set.mode) || !Number.isSafeInteger(set.rest) || set.rest < 0 || set.rest > 600) throw new Error('Export supports confirmed rep-based reference client dose/mode/rest only.');
      // Export targets reference client’s import UI, not the broader account API contract.
      const minRest = named ? rules.minRest : 0;
      const maxRest = named ? rules.maxRest : 300;
      if (set.rest < minRest || set.rest > maxRest) throw new Error(`Export rest must match reference client import UI range ${minRest}–${maxRest} seconds; no clamping applied.`);
      let weight;
      if (named) {
        weight = set.rmLevel;
        if (!Number.isSafeInteger(weight) || weight < rules.minRmLevel || weight > rules.maxRmLevel || set.reps < rules.minReps || set.reps > rules.maxReps) throw new Error('Export requires actual valid named RM selector and rep range; no default invented.');
      } else {
        if (exercise.loadType === 'customize-manual') {
          if (exercise.staticLoadRequested !== true || set.weightUnit !== input.staticWeightUnit) throw new Error('Manual export requires explicit authorization and matching source unit.');
          weight = set.weight;
        } else if (exercise.loadType === 'fixed-kg') {
          if (exercise.fixedKgAuthorized !== true) throw new Error('Fixed kg export requires explicit source authorization.');
          weight = input.staticWeightUnit === 'kg' ? set.weightKg : set.weightKg * 2.2;
        } else {
          if (set.loadUnit !== input.staticWeightUnit || !set.loadEstimate || !exercise.strengthAnchor) throw new Error('Profile export requires prepared load and anchor provenance.');
          weight = set.calculatedLoad;
        }
        if (!Number.isFinite(weight) || weight <= 0 || weight > 1000) throw new Error('Invalid export static load.');
        if (input.staticWeightUnit === 'kg' && !exercise.exportIsUnilateral && typeof exercise.exportIsBarbell !== 'boolean') throw new Error('Metric bilateral export requires explicit source exportIsBarbell metadata.');
        validateStaticLoad(weight, { displayUnit: input.staticWeightUnit, isUnilateral: exercise.exportIsUnilateral, isBarbell: exercise.exportIsBarbell });
        const wire = encodeStaticLoad({ protocol: input.staticLoadProtocol, load: weight, loadUnit: input.staticWeightUnit, accountUnit: input.staticWeightUnit, loadIntent: 'account-customize' });
        const serialized = Number(decodeStaticLoad({ protocol: input.staticLoadProtocol, wireOrReadback: Number(wire), phase: 'wire', accountUnit: input.staticWeightUnit, outputUnit: input.staticWeightUnit }).toFixed(6));
        if (Math.abs(serialized - weight) > 1e-6) normalizations.push({ exerciseIndex: index, setIndex: position, requestedWeight: weight, weightUnit: input.staticWeightUnit, expectedReferenceClientApiWeight: serialized, physicalResistanceVerified: false });
      }
      // reference client’s JSON importer uses parseInt(s.rest || 60): numeric zero is
      // replaced by 60, whereas the truthy JSON string "0" preserves zero.
      // This affects only the interchange representation, not the prescription.
      const exportedRest = set.rest === 0 ? '0' : set.rest;
      if (set.rest === 0) representationNormalizations.push({ exerciseIndex: index, setIndex: position, field: 'rest', requestedSeconds: 0, exportedValue: '0', expectedReferenceClientImportedSeconds: 0, reason: 'Preserve zero rest through the public reference client importer numeric-zero fallback.', accountApiVerified: false });
      return { reps: set.reps, weight, mode: set.mode, rest: exportedRest };
    });
    return { id: exercise.id, title: exercise.title, preset: named ? named.id : -1, isUnilateralExpanded: exercise.exportIsUnilateral, sets };
  });
  return { status: 'local-export-with-omissions', workoutJson: { name: plan.name, exercises }, staticWeightUnit: input.staticWeightUnit, staticLoadProtocol: input.staticLoadProtocol,
    sourceMetadataVerification: 'caller-supplied-only', accountUnitVerified: false, catalogSidesVerified: false,
    normalizations, representationNormalizations, omissions: ['reference client JSON omits account unit; retain staticWeightUnit alongside the file.', 'Exact variant and entry identity, RIR, scientific evidence, anchor provenance and section metadata are omitted.', 'fixed-kg/profile-auto become static Customize; reference client import may apply its UI limits and normalization.', 'Unilateral metadata and protocol are supplied by caller, not independently verified against the account/catalog.'],
    lossless: false, scientificApproval: false, mutationSent: false, accountRead: false, requiresScientificPreview: true };
}
