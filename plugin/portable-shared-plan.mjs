import { createHash } from 'node:crypto';
import { archiveRawPortableSource, exportRepresentablePortableSource } from './portable-source-adapter.mjs';
import { importPortablePlan } from './portable-plan-codec.mjs';

const MAX_ARTIFACT_BYTES = 1_000_000;
const sha = value => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
function cloneBounded(value) {
  let nodes = 0;
  const active = new Set();
  function visit(item, depth) {
    if (++nodes > 50_000 || depth > 20) throw new Error('Shared-plan object exceeds structural bounds.');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'string') { if (item.length > 20_000) throw new Error('Shared-plan string exceeds 20,000 characters.'); return item; }
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item !== 'object' || active.has(item)) throw new Error('Shared-plan data must be finite JSON without cycles.');
    const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new Error('Shared-plan data must use plain JSON objects and arrays.');
    if (Object.getOwnPropertySymbols(item).length) throw new Error('Shared-plan data rejects symbol properties.');
    active.add(item);
    const names = Object.getOwnPropertyNames(item).filter(key => !(array && key === 'length'));
    if (array && (names.length !== item.length || names.some((key, index) => key !== String(index)))) throw new Error('Shared-plan arrays must be dense and have no extra properties.');
    const out = array ? [] : Object.create(null);
    for (const key of names) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Shared-plan data rejects prototype keys.');
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Shared-plan data rejects accessors and hidden fields.');
      out[key] = visit(descriptor.value, depth + 1);
    }
    active.delete(item);
    return out;
  }
  const out = visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(out), 'utf8') > MAX_ARTIFACT_BYTES) throw new Error('Shared-plan object exceeds the 1 MB limit.');
  return out;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonical(value) {
  return Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}
const sameJson = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

function assertDataRecord(value, allowed, required = []) {
  if (!plain(value) || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).some(key => !allowed.includes(key)) ||
      required.some(key => !Object.hasOwn(value, key))) throw new Error('Unsupported shared-plan input.');
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Shared plans reject accessors and hidden fields.');
  }
}

function boundedJson(value) {
  const text = JSON.stringify(value);
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_ARTIFACT_BYTES) throw new Error('Shared-plan artifact exceeds the 1 MB limit.');
  return text;
}

function presentation(sourceArchive) {
  const prescription = sourceArchive.prescription;
  return {
    name: prescription.name,
    rationale: prescription.rationale ?? null,
    exercises: prescription.exercises.map(exercise => ({
      entryId: exercise.entryId, id: exercise.id, actionLibraryId: exercise.actionLibraryId,
      title: exercise.title, section: exercise.section, loadType: exercise.loadType,
      trainingGoal: exercise.trainingGoal ?? null,
      smartRmPresetName: exercise.smartRmPresetName ?? null,
      unilateralPrescription: exercise.unilateralPrescription ?? 'paired-symmetric',
      sets: exercise.sets.map(set => ({
        ...(set.side === undefined ? {} : { side: set.side }), unit: set.unit,
        ...(set.reps === undefined ? {} : { reps: set.reps }),
        ...(set.durationSeconds === undefined ? {} : { durationSeconds: set.durationSeconds }),
        ...(set.weight === undefined ? {} : { historicalWeight: set.weight, historicalWeightUnit: set.weightUnit }),
        ...(set.weightKg === undefined ? {} : { historicalWeightKg: set.weightKg }),
        mode: set.mode, restSeconds: set.restSeconds, ...(set.rirTarget === undefined ? {} : { rirTarget: set.rirTarget }),
        ...(set.sourceRmSelector === undefined ? {} : { historicalRmSelector: set.sourceRmSelector })
      }))
    })),
    research: sourceArchive.research.evidence.map(item => ({ id: item.id, researchSourceId: item.researchSourceId, title: item.title, publicationDate: item.publicationDate, url: item.url, coveredCategories: [...item.coveredCategories] })),
    historicalDecisionCount: sourceArchive.research.decisionEvidence.length,
    sourceOnlyOmissions: sourceArchive.sourceOnlyOmissions.length,
    historicalSections: {
      warmup: sourceArchive.prescription.warmup ?? null,
      postWorkoutStretching: sourceArchive.prescription.postWorkoutStretching ?? null,
      supersetBlocks: sourceArchive.prescription.supersetBlocks ?? []
    }
  };
}

function previewPlan(sourceArchive) {
  const prescription = sourceArchive.prescription;
  const exercises = prescription.exercises.map(exercise => ({
    entryId: exercise.entryId, id: exercise.id, actionLibraryId: exercise.actionLibraryId, title: exercise.title,
    section: exercise.section, loadType: exercise.loadType,
    ...(exercise.trainingGoal === undefined ? {} : { trainingGoal: exercise.trainingGoal }),
    ...(exercise.smartRmPresetName === undefined ? {} : { smartRmPresetName: exercise.smartRmPresetName }),
    ...(exercise.unilateralPrescription === undefined ? {} : { unilateralPrescription: exercise.unilateralPrescription }),
    ...(exercise.sideTransitionSeconds === undefined ? {} : { sideTransitionSeconds: exercise.sideTransitionSeconds }),
    ...(exercise.sideTransitionRationale === undefined ? {} : { sideTransitionRationale: exercise.sideTransitionRationale }),
    sets: exercise.sets.map(set => ({
      ...(set.side === undefined ? {} : { side: set.side }), unit: set.unit === 'seconds' ? 'seconds' : set.unit,
      ...(set.reps === undefined ? {} : { reps: set.reps }),
      ...(set.durationSeconds === undefined ? {} : { durationSeconds: set.durationSeconds }),
      ...(set.rirTarget === undefined ? {} : { rirTarget: set.rirTarget }),
      ...(set.weight === undefined ? {} : { weight: set.weight }),
      ...(set.weightUnit === undefined ? {} : { weightUnit: set.weightUnit }),
      ...(set.weightKg === undefined ? {} : { weightKg: set.weightKg }),
      mode: set.mode, restSeconds: set.restSeconds
    }))
  }));
  // Imported section declarations are historical. Current section choice and
  // executable items must come from the receiving user before public preview.
  return {
    name: prescription.name, rationale: prescription.rationale ?? 'Imported source plan; current rationale not reassessed.',
    exercises, evidence: [], decisionEvidence: [], scienceGate: 'user_declined',
    supersetBlocks: prescription.supersetBlocks ?? [],
    currentReviewRequired: ['warmup', 'postWorkoutStretching', 'recipient_injuries_limitations', 'recipient_preferences_keep_or_change', 'recipient_schedule_missing_only',
      ...exercises.filter(exercise => exercise.loadType === 'customize-manual').map(exercise => `staticLoadRequested:${exercise.entryId}`)]
  };
}

function parseArtifact(input) {
  if (typeof input.artifactText === 'string') {
    if (Buffer.byteLength(input.artifactText, 'utf8') > MAX_ARTIFACT_BYTES) throw new Error('Shared-plan artifact exceeds the 1 MB limit.');
    try { return cloneBounded(JSON.parse(input.artifactText)); } catch (error) {
      if (error instanceof SyntaxError) throw new Error('Shared-plan artifact must be valid JSON.');
      throw error;
    }
  }
  if (Object.hasOwn(input, 'artifact')) return cloneBounded(input.artifact);
  if (Object.hasOwn(input, 'referenceClientJson') && Object.hasOwn(input, 'sidecar')) return cloneBounded({ referenceClientJson: input.referenceClientJson, sidecar: input.sidecar });
  throw new Error('Provide artifactText or a paired reference client JSON and sidecar.');
}

function normalizeEditableCandidate(input) {
  const candidate = cloneBounded(input);
  assertDataRecord(candidate, ['name', 'rationale', 'exercises', 'warmup', 'postWorkoutStretching', 'supersetBlocks'], []);
  if (candidate.name !== undefined && (typeof candidate.name !== 'string' || !candidate.name.trim() || candidate.name.length > 80)) throw new Error('Candidate name must contain 1–80 characters.');
  if (candidate.rationale !== undefined && (typeof candidate.rationale !== 'string' || !candidate.rationale.trim() || candidate.rationale.length > 2000)) throw new Error('Candidate rationale must contain 1–2,000 characters.');
  if (candidate.exercises !== undefined) {
    if (!Array.isArray(candidate.exercises) || candidate.exercises.length < 1 || candidate.exercises.length > 30) throw new Error('Candidate exercises must contain 1–30 rows.');
    const exerciseKeys = ['entryId', 'id', 'actionLibraryId', 'title', 'section', 'loadType', 'trainingGoal', 'smartRmPresetName', 'unilateralPrescription', 'sideTransitionSeconds', 'sideTransitionRationale', 'sets'];
    const setKeys = ['side', 'unit', 'reps', 'durationSeconds', 'rirTarget', 'weight', 'weightUnit', 'weightKg', 'mode', 'restSeconds', 'percent1RM', 'percentReason'];
    for (const exercise of candidate.exercises) {
      assertDataRecord(exercise, exerciseKeys, ['id', 'title', 'sets']);
      if (!Array.isArray(exercise.sets) || !exercise.sets.length || exercise.sets.length > 12) throw new Error('Candidate exercise sets must contain 1–12 rows.');
      for (const set of exercise.sets) assertDataRecord(set, setKeys, ['unit', 'mode', 'restSeconds']);
    }
  }
  for (const [sectionName, itemKeys] of [
    ['warmup', ['kind', 'activity', 'dosage', 'targetExerciseIds', 'executionRef']],
    ['postWorkoutStretching', ['target', 'method', 'dosage', 'instructions', 'executionRef']]
  ]) if (candidate[sectionName] !== undefined) {
    const section = candidate[sectionName];
    assertDataRecord(section, ['status', 'omissionReason', 'items'], ['status', 'items']);
    if (!['included', 'omitted_user_preference'].includes(section.status) || !Array.isArray(section.items) || section.items.length > 30) throw new Error(`Invalid current ${sectionName} declaration.`);
    for (const item of section.items) assertDataRecord(item, itemKeys, []);
  }
  if (candidate.supersetBlocks !== undefined) {
    if (!Array.isArray(candidate.supersetBlocks) || candidate.supersetBlocks.length > 3) throw new Error('Candidate supports at most 3 superset blocks.');
    for (const block of candidate.supersetBlocks) {
      assertDataRecord(block, ['rounds', 'transitionRestSeconds', 'recoveryRestSeconds', 'members'], ['members']);
      if (!Array.isArray(block.members) || block.members.length > 3) throw new Error('Invalid candidate superset members.');
      for (const member of block.members) assertDataRecord(member, ['exerciseId', 'setupKey'], ['exerciseId', 'setupKey']);
    }
  }
  return candidate;
}

/** Export a bounded paired artifact. The hash pairs the files; it does not authenticate an author. */
export function exportSharedPlan(input) {
  if (plain(input) && Object.hasOwn(input, 'savedArtifact')) return exportSavedSharedPlan(input);
  assertDataRecord(input, ['source', 'staticWeightUnit', 'staticLoadProtocol', 'exerciseMetadata'], ['source', 'staticWeightUnit', 'staticLoadProtocol', 'exerciseMetadata']);
  let exported, representation = 'paired-reference-client-json';
  try {
    exported = exportRepresentablePortableSource(input);
  } catch (error) {
    // Preserve a plan that has no reference client rows as a source archive. Never make
    // a synthetic row just to force a paired export.
    if (error?.message !== 'No representable reference client source rows.') throw error;
    exported = archiveRawPortableSource(input.source);
    representation = 'source-only';
  }
  return sharedArtifactResult(exported, representation, 'declared-source-artifact');
}

const SAVED_ARTIFACT_STATUSES = ['exported-retained-source', 'exported-reconstructed-source', 'unapproved-source-candidate'];
/** Share the exact result of gm_coach_export_saved_portable_source. Pair hashes are verified; unit, protocol and per-row metadata come from the artifact and its catalog rows. */
function exportSavedSharedPlan(input) {
  assertDataRecord(input, ['savedArtifact'], ['savedArtifact']);
  const saved = cloneBounded(input.savedArtifact);
  if (!plain(saved) || !Object.hasOwn(saved, 'referenceClientJson') || !Object.hasOwn(saved, 'sidecar')) {
    if (plain(saved) && saved.status === 'unavailable') throw new Error(`Saved plan source unavailable: ${saved.reason ?? 'unknown'}. Nothing to share.`);
    throw new Error('savedArtifact must be the unchanged result of gm_coach_export_saved_portable_source (referenceClientJson + sidecar).');
  }
  if (saved.status !== undefined && !SAVED_ARTIFACT_STATUSES.includes(saved.status)) throw new Error('Unsupported saved artifact status.');
  const verified = importPortablePlan({ referenceClientJson: saved.referenceClientJson, sidecar: saved.sidecar });
  let exported = { status: verified.status, referenceClientJson: saved.referenceClientJson, sidecar: saved.sidecar, sourceArchive: verified.sourceArchive };
  let representation = saved.referenceClientJson.exercises?.length ? 'paired-reference-client-json' : 'source-only';
  if (representation === 'source-only') {
    const archive = verified.sourceArchive, exercises = archive.prescription.exercises;
    const units = [...new Set(exercises.flatMap(ex => ex.sets.filter(set => set.weight !== undefined).map(set => set.weightUnit)))];
    const staticWeightUnit = ['kg', 'lb'].includes(archive.staticSourceContext?.unit) ? archive.staticSourceContext.unit : units.length === 1 && ['kg', 'lb'].includes(units[0]) ? units[0] : units.length ? null : 'kg';
    const staticLoadProtocol = ['legacy-reference-client-wire-lb-get-kg', 'account-unit-verbatim'].includes(archive.staticSourceContext?.protocol) ? archive.staticSourceContext.protocol : 'account-unit-verbatim';
    if (staticWeightUnit && !exercises.some(ex => ex.unilateralPrescription === 'paired-symmetric')) {
      const exerciseMetadata = exercises.map(ex => ({ entryId: ex.entryId, exportIsUnilateral: ex.unilateralPrescription === 'explicit-sides', exportIsBarbell: /barbell|sztang/i.test(String(ex.title ?? '')) }));
      try { exported = exportRepresentablePortableSource({ source: { prescription: archive.prescription, research: archive.research }, staticWeightUnit, staticLoadProtocol, exerciseMetadata }); representation = 'paired-reference-client-json'; } catch { exported = { status: verified.status, referenceClientJson: saved.referenceClientJson, sidecar: saved.sidecar, sourceArchive: verified.sourceArchive }; }
    }
  }
  if (representation === 'source-only' && !exported.sourceArchive.sourceOnlyOmissions.length) throw new Error('Saved artifact has no reference client rows and no omission ledger.');
  return sharedArtifactResult(exported, representation, 'saved-template-artifact');
}

function sharedArtifactResult(exported, representation, origin) {
  if (exported.status !== 'unapproved-source-candidate' || !exported.referenceClientJson || !exported.sidecar) throw new Error('Source cannot be represented by the portable reference client format.');
  if (representation === 'source-only' && (exported.referenceClientJson.exercises.length !== 0 || exported.sourceArchive.mapping.length !== 0)) throw new Error('Source-only export must not contain reference client rows or mappings.');
  const artifact = representation === 'source-only'
    ? { kind: 'gm-coach-shared-plan', version: 1, representation, referenceClientJson: exported.referenceClientJson, sidecar: exported.sidecar }
    : { referenceClientJson: exported.referenceClientJson, sidecar: exported.sidecar };
  const artifactText = boundedJson(artifact);
  const provenance = {
    origin, originVerified: false, integrity: 'sha256-pairing-only',
    scientificApproval: false, writeReady: false, mutationSent: false,
    representation, referenceClientExecutionCoverage: representation === 'source-only' ? 'none-source-archive-only' : 'paired-rows-with-source-only-omissions',
    sourceDigest: sha(exported.sidecar.payload),
    historicalEvidenceCount: exported.sourceArchive.research.evidence.length,
    historicalDecisionCount: exported.sourceArchive.research.decisionEvidence.length
  };
  return {
    status: 'exported', fileName: 'gm-coach-plan.json', mediaType: 'application/json', artifactText,
    referenceClientJson: exported.referenceClientJson, sidecar: exported.sidecar,
    representation, referenceClientExecutionCoverage: provenance.referenceClientExecutionCoverage,
    planPresentation: presentation(exported.sourceArchive), provenance
  };
}

/** Import preserves the original source as untrusted history and returns a separate, science-opt-out candidate. */
export function importSharedPlan(input) {
  assertDataRecord(input, ['artifactText', 'artifact', 'referenceClientJson', 'sidecar', 'reassessScience', 'profile', 'candidate'], []);
  if (input.reassessScience !== undefined && typeof input.reassessScience !== 'boolean') throw new Error('reassessScience must be boolean.');
  if (input.profile !== undefined && (typeof input.profile !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(input.profile))) throw new Error('profile must be a valid local profile identifier.');
  const artifact = parseArtifact(input);
  let representation = 'paired-reference-client-json';
  if (Object.hasOwn(artifact, 'kind') || Object.hasOwn(artifact, 'version') || Object.hasOwn(artifact, 'representation')) {
    assertDataRecord(artifact, ['kind', 'version', 'representation', 'referenceClientJson', 'sidecar'], ['kind', 'version', 'representation', 'referenceClientJson', 'sidecar']);
    if (artifact.kind !== 'gm-coach-shared-plan' || artifact.version !== 1 || artifact.representation !== 'source-only') throw new Error('Unsupported source-only shared-plan envelope.');
    representation = 'source-only';
    if (!plain(artifact.referenceClientJson) || !Array.isArray(artifact.referenceClientJson.exercises) || artifact.referenceClientJson.exercises.length !== 0) throw new Error('Source-only shared plans must not contain reference client rows.');
  } else {
    assertDataRecord(artifact, ['referenceClientJson', 'sidecar'], ['referenceClientJson', 'sidecar']);
  }
  const imported = importPortablePlan({ referenceClientJson: artifact.referenceClientJson, sidecar: artifact.sidecar });
  if (representation === 'source-only' && (imported.sourceArchive.mapping.length !== 0 || imported.sourceArchive.sourceOnlyOmissions.length === 0)) throw new Error('Source-only shared plans require an omission ledger and no reference client mappings.');
  const original = imported.sourceArchive;
  const sourceDigest = sha(original);
  const editableCandidate = input.candidate === undefined ? null : normalizeEditableCandidate(input.candidate);
  const planForPreview = { ...previewPlan(original), ...(editableCandidate ?? {}) };
  const reassessScience = input.reassessScience === true;
  if (reassessScience) { delete planForPreview.scienceGate; planForPreview.reassessmentRequested = true; }
  else planForPreview.scienceGate = 'user_declined';
  planForPreview.evidence = [];
  planForPreview.decisionEvidence = [];
  const changes = compareSharedPlanChanges(original, planForPreview)
    .map(change => ({ ...change, scienceStatus: reassessScience ? 'reassessment_requested' : 'not_reassessed' }));
  deepFreeze(original);
  return {
    status: 'imported-source-candidate', sourceArchive: original, planForPreview,
    representation, referenceClientExecutionCoverage: representation === 'source-only' ? 'none-source-archive-only' : 'paired-rows-with-source-only-omissions',
    planPresentation: presentation(original),
    provenance: {
      origin: 'declared-source-artifact', originVerified: false, integrity: 'sha256-pairing-only',
      sourceDigest, historicalScienceRetained: true, historicalScienceReassessed: false,
      scientificApproval: false, writeReady: false, mutationSent: false,
      representation, referenceClientExecutionCoverage: representation === 'source-only' ? 'none-source-archive-only' : 'paired-rows-with-source-only-omissions',
      historicalEvidenceCount: original.research.evidence.length,
      historicalDecisionCount: original.research.decisionEvidence.length
    },
    changes, ...(input.profile === undefined ? {} : { targetProfile: input.profile }),
    sciencePolicy: reassessScience ? 'fresh_reassessment_requested' : 'preserve_original_no_reassessment',
    scienceGate: reassessScience ? null : 'user_declined', reassessmentRequested: reassessScience,
    researchReviewStatus: reassessScience ? 'fresh_review_required' : 'not_reviewed_user_requested',
    changeResearchStatus: reassessScience ? 'reassessment_requested' : 'not_reassessed', originScientificApproval: false,
    originVerified: false, writeReady: false, mutationSent: false,
    unresolvedImportedSelectors: imported.unresolvedImportedSelectors,
    currentReviewRequired: [...planForPreview.currentReviewRequired],
    automaticTechnicalChecks: ['destination_account', 'current_exercise_catalog', 'required_accessories', 'account_unit_for_static_loads_if_needed']
  };
}

/** Compare an edited preview candidate with its immutable imported prescription. */
export function compareSharedPlanChanges(sourceArchive, candidate) {
  sourceArchive = cloneBounded(sourceArchive);
  candidate = cloneBounded(candidate);
  assertDataRecord(sourceArchive, ['prescription', 'research', 'mapping', 'sourceOnlyOmissions', 'staticSourceContext'], ['prescription', 'research', 'mapping', 'sourceOnlyOmissions', 'staticSourceContext']);
  assertDataRecord(candidate, ['name', 'rationale', 'exercises', 'evidence', 'decisionEvidence', 'scienceGate', 'warmup', 'postWorkoutStretching', 'supersetBlocks', 'currentReviewRequired', 'reassessmentRequested'], ['name', 'exercises']);
  const baseline = sourceArchive.prescription;
  const changes = [];
  if (candidate.name !== baseline.name) changes.push({ path: 'name', before: baseline.name, after: candidate.name });
  if (candidate.rationale !== baseline.rationale && candidate.rationale !== 'Imported source plan; current rationale not reassessed.') changes.push({ path: 'rationale', before: baseline.rationale ?? null, after: candidate.rationale ?? null });
  const key = ex => String(ex.entryId ?? ex.id);
  const keyed = (rows, label) => {
    const map = new Map();
    for (const exercise of rows) {
      const id = key(exercise);
      if (map.has(id)) throw new Error(`Duplicate ${label} exercise identity ${id}.`);
      map.set(id, exercise);
    }
    return map;
  };
  const before = keyed(baseline.exercises, 'source');
  const after = keyed(candidate.exercises, 'candidate');
  const beforeOrder = baseline.exercises.map(key), afterOrder = candidate.exercises.map(key);
  if (!sameJson(beforeOrder, afterOrder)) changes.push({ path: 'exercises.order', before: beforeOrder, after: afterOrder });
  for (const [id, ex] of before) if (!after.has(id)) changes.push({ path: `exercises.${id}`, kind: 'removed' });
  for (const [id, ex] of after) {
    const old = before.get(id);
    if (!old) { changes.push({ path: `exercises.${id}`, kind: 'added' }); continue; }
    for (const field of ['id', 'actionLibraryId', 'title', 'section', 'loadType', 'trainingGoal', 'smartRmPresetName', 'unilateralPrescription', 'sideTransitionSeconds', 'sideTransitionRationale']) {
      if (JSON.stringify(ex[field] ?? null) !== JSON.stringify(old[field] ?? null)) changes.push({ path: `exercises.${id}.${field}`, before: old[field] ?? null, after: ex[field] ?? null });
    }
    const setCount = Math.max(old.sets.length, ex.sets.length);
    for (let index = 0; index < setCount; index++) {
      const left = old.sets[index], right = ex.sets[index];
      if (!left || !right) { changes.push({ path: `exercises.${id}.sets.${index}`, kind: left ? 'removed' : 'added' }); continue; }
      for (const field of ['unit', 'reps', 'durationSeconds', 'side', 'mode', 'restSeconds', 'rirTarget', 'weight', 'weightUnit', 'weightKg', 'percent1RM', 'percentReason']) {
        const rightValue = field === 'unit' && right[field] === 'sec' ? 'seconds' : right[field];
        if (JSON.stringify(rightValue ?? null) !== JSON.stringify(left[field] ?? null)) changes.push({ path: `exercises.${id}.sets.${index}.${field}`, before: left[field] ?? null, after: rightValue ?? null });
      }
    }
  }
  for (const section of ['warmup', 'postWorkoutStretching']) if (Object.hasOwn(candidate, section) && !sameJson(candidate[section], baseline[section] ?? null)) {
    changes.push({ path: section, before: baseline[section] ?? null, after: candidate[section] });
  }
  if (Object.hasOwn(candidate, 'supersetBlocks') && !sameJson(candidate.supersetBlocks, baseline.supersetBlocks ?? [])) {
    changes.push({ path: 'supersetBlocks', before: baseline.supersetBlocks ?? [], after: candidate.supersetBlocks });
  }
  return changes;
}
