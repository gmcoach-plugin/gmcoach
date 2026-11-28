import {bindRetainedPortableSource,retainedSourceExportMetadata} from './retained-portable-source.mjs';
import { createHash } from 'node:crypto';
import { reconcileSavedPlanIdentity } from './saved-plan-identity.mjs';
import { buildPresetPayload } from './program-serialization.mjs';
import { buildSavedTemplateUpdatePayload, verifyCreatedTemplateReadback, createSavedTemplateSnapshot, savedTemplateDigest, acceptEquivalentReadbackDifferences } from './saved-templates.mjs';
import { reconcileSavedEditPayload, diffSavedEditPayloads, assertSavedEditScope } from './saved-edit-diff.mjs';

const fingerprint = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const forbidden = /password|token|email|credential|intakeanswers/i;
const limits = { bytes: 1_000_000, nodes: 50_000, depth: 20 };
function cloneJson(value) {
  let nodes = 0;
  const active = new Set();
  function visit(item, depth) {
    if (++nodes > limits.nodes || depth > limits.depth) throw new Error('Review record exceeds JSON bounds.');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (!item || typeof item !== 'object' || active.has(item) || ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(item))) throw new Error('Review record requires finite plain JSON.');
    if (Object.getOwnPropertySymbols(item).length) throw new Error('Review record rejects symbol keys.');
    active.add(item);
    const keys = Object.getOwnPropertyNames(item).filter(key => !(Array.isArray(item) && key === 'length'));
    if (Array.isArray(item) && (keys.length !== item.length || keys.some((key, index) => key !== String(index)))) throw new Error('Review record requires dense JSON arrays.');
    const result = Array.isArray(item) ? [] : {};
    for (const key of keys) {
      if (forbidden.test(key)) throw new Error('Review record rejects private credential or intake fields.');
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Review record rejects accessors and hidden fields.');
      if (!Array.isArray(item) && descriptor.value === undefined) continue;
      Object.defineProperty(result, key, { value: visit(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    active.delete(item);
    return result;
  }
  const copy = visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(copy), 'utf8') > limits.bytes) throw new Error('Review record exceeds byte limit.');
  return copy;
}
const digest = plan => createHash('sha256').update(JSON.stringify(plan)).digest('hex');
function freezeJson(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeJson(child); Object.freeze(value); }
  return value;
}
const planFields = new Set('scienceGate cyclePreferenceReviews name accessoryRequirementScope confirmedDisplayUnit confirmedSessionMinutes confirmedWeeklyMinutes confirmedSessionMinutesStatus timeEstimation timeBudgetAssessment preferenceReviews preferenceCompliance scheduleDate rationale evidence decisionEvidence warmup postWorkoutStretching supersetBlocks showCalculatedLoads exercises recoveryContext resolvedRecoveryContext isDeload cycleContext deloadLoadOverride'.split(' '));
const exerciseFields = new Set('trainingGoal entryId section unilateralPrescription sideTransitionSeconds sideTransitionRationale id title loadType dataStatType movementKind actionLibraryId strengthAnchor resolvedStrengthProfile smartRmPresetName smartRmPresetId smartRmPresetSource smartRmActionLibraryId smartRmAccountReadiness percentLoad sets fixedKgAuthorized staticLoadRequested'.split(' '));
const setFields = new Set('side unit durationSeconds reps rmLevel level rirTarget intensity loadEstimate weightKg weight weightUnit requestedWeight loadStepNormalized loadStepNote mode rest calculatedLoad loadUnit serializedDisplayWeight serializedDisplayUnit apiLoadNormalized rmLevelValidation percent1RM percentResolved'.split(' '));
function snapshotFields(value, allowed, transform = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Normalized snapshot requires a plain object.');
  if (Object.getOwnPropertySymbols(value).length) throw new Error('Review record rejects symbol keys.');
  const result = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    if (forbidden.test(key)) throw new Error('Review record rejects private fields.');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(descriptor, 'value')) throw new Error('Review record rejects accessors.');
    if (!allowed.has(key) || (!descriptor.enumerable && key !== 'fixedKgAuthorized')) throw new Error('Review record rejects unexpected or hidden normalized fields.');
    if (descriptor.value === undefined) continue;
    if (key === 'confirmedSessionMinutes' && (!Number.isSafeInteger(descriptor.value) || descriptor.value < 10 || descriptor.value > 240)) throw new Error('Invalid confirmed session minutes.');
    if(key==='trainingGoal'&&!['hypertrophy','strength','endurance'].includes(descriptor.value))throw new Error('Invalid reviewed exercise training goal.');
    if (key === 'fixedKgAuthorized' && typeof descriptor.value !== 'boolean') throw new Error('Invalid fixed kg authorization.');
    result[key] = transform[key] ? transform[key](descriptor.value) : cloneJson(descriptor.value);
  }
  return result;
}
function normalizeReviewedDeloadCycleContext(value) {
  const copy = cloneJson(value);
  if (!copy || Array.isArray(copy) || Object.getPrototypeOf(copy) !== Object.prototype ||
      Object.keys(copy).length !== 2 || !Object.hasOwn(copy, 'week') || !Object.hasOwn(copy, 'deloadWeek') ||
      !Number.isSafeInteger(copy.week) || copy.week < 1 || copy.week > 104 ||
      !Number.isSafeInteger(copy.deloadWeek) || copy.deloadWeek < 1 || copy.deloadWeek > 104) {
    throw new Error('Invalid reviewed deload cycle context.');
  }
  return { week: copy.week, deloadWeek: copy.deloadWeek };
}
export function normalizeReviewedAccessoryRequirementScope(value) {
  const copy = cloneJson(value);
  const exact = (row, keys) => row && typeof row === 'object' && !Array.isArray(row) && Object.keys(row).length === keys.length && keys.every(key=>Object.hasOwn(row,key));
  const ids = row => Array.isArray(row) && row.length <= 128 && row.every((id,index)=>Number.isSafeInteger(id) && id>0 && (index===0 || row[index-1]<id));
  if (!exact(copy,['version','inventoryStatus','inventorySource','inventoryDigest','requirements']) || copy.version!==1 || !['complete','partial','unknown'].includes(copy.inventoryStatus) || !['speediance-account','user-confirmed-local','unknown'].includes(copy.inventorySource) || !fingerprint(copy.inventoryDigest) || !Array.isArray(copy.requirements) || copy.requirements.length>364) throw new Error('Invalid reviewed accessory requirement scope.');
  for (const [index,row] of copy.requirements.entries()) {
    const keys=['occurrenceIndex','catalogId','entryId','actionLibraryId','section','metadataStatus','requiredAccessoryIds','setupStatus','catalogMetadataDigest'];
    if (Object.hasOwn(row,'requirementConfirmation')) keys.push('requirementConfirmation');
    if (!exact(row,keys) || row.occurrenceIndex!==index || !Number.isSafeInteger(row.catalogId) || row.catalogId<=0 || !(Number.isSafeInteger(row.entryId) && row.entryId>0 || typeof row.entryId==='string' && row.entryId.length>0 && row.entryId.length<=128) || !(row.actionLibraryId===null || Number.isSafeInteger(row.actionLibraryId) && row.actionLibraryId>0) || !['warmup','main','stretching'].includes(row.section) || !['valid-ids','valid-empty','missing','invalid','conflict','unknown'].includes(row.metadataStatus) || !ids(row.requiredAccessoryIds) || row.setupStatus!=='unknown' || !fingerprint(row.catalogMetadataDigest)) throw new Error('Invalid reviewed accessory occurrence.');
    if (row.metadataStatus==='valid-empty' && row.requiredAccessoryIds.length || row.metadataStatus==='valid-ids' && !row.requiredAccessoryIds.length) throw new Error('Reviewed accessory status differs from required IDs.');
    if (Object.hasOwn(row,'requirementConfirmation')) {
      if (!['valid-empty','valid-ids'].includes(row.metadataStatus)) throw new Error('Confirmation requires resolved accessory status.');
      const confirmation=row.requirementConfirmation;
      if (!exact(confirmation,['source','id','groupId','actionLibraryId','rawRequirementDigest','createdAt','expiresAt','activeStoreDigest']) || confirmation.source!=='user-confirmed-complete' || !/^[a-f0-9]{48}$/.test(confirmation.id) || confirmation.groupId!==row.catalogId || confirmation.actionLibraryId!==row.actionLibraryId || !fingerprint(confirmation.rawRequirementDigest) || !fingerprint(confirmation.activeStoreDigest) || !Number.isSafeInteger(confirmation.createdAt) || confirmation.createdAt<0 || !Number.isSafeInteger(confirmation.expiresAt) || confirmation.expiresAt<=confirmation.createdAt || confirmation.expiresAt-confirmation.createdAt>30*86400000) throw new Error('Invalid reviewed accessory confirmation provenance.');
    }
  }
  return copy;
}
export function snapshotNormalizedPlan(plan) {
  const snapshot = snapshotFields(plan, planFields, { accessoryRequirementScope: normalizeReviewedAccessoryRequirementScope, cycleContext: normalizeReviewedDeloadCycleContext, exercises: exercises => {
    if (!Array.isArray(exercises)) throw new Error('Exercises must be an array.');
    return exercises.map(exercise => snapshotFields(exercise, exerciseFields, { sets: sets => {
      if (!Array.isArray(sets)) throw new Error('Sets must be an array.');
      return sets.map(set => snapshotFields(set, setFields));
    } }));
  } });
  if (Object.hasOwn(snapshot, 'isDeload') && typeof snapshot.isDeload !== 'boolean') throw new Error('Invalid reviewed deload intent.');
  if (Object.hasOwn(snapshot, 'deloadLoadOverride') && (snapshot.deloadLoadOverride !== 'smart-rm' || snapshot.isDeload !== true)) throw new Error('Invalid reviewed deload override provenance.');
  const reviewedCycleDeload = Object.hasOwn(snapshot, 'cycleContext') &&
    Number.isSafeInteger(snapshot.cycleContext?.week) && Number.isSafeInteger(snapshot.cycleContext?.deloadWeek) &&
    snapshot.cycleContext.week >= 1 && snapshot.cycleContext.deloadWeek >= 1 &&
    snapshot.cycleContext.week === snapshot.cycleContext.deloadWeek;
  if (reviewedCycleDeload && snapshot.isDeload !== true) throw new Error('Reviewed cycle context declares a deload but the plan does not preserve deload intent.');
  if (Object.hasOwn(snapshot,'accessoryRequirementScope')) {
    const scope=snapshot.accessoryRequirementScope;
    if (!Array.isArray(snapshot.exercises) || scope.requirements.length!==snapshot.exercises.length || scope.requirements.some((row,index)=>{const exercise=snapshot.exercises[index];return row.catalogId!==exercise.id || row.entryId!==(exercise.entryId??exercise.id) || row.actionLibraryId!==(exercise.actionLibraryId??null) || row.section!==(exercise.section??'main');})) throw new Error('Reviewed accessory scope differs from actual exercise occurrences.');
  }
  return snapshot;
}

// Historical content is useful for renewing evidence, never current execution proof.
export function historicalReviewForDisplay(record, accountFingerprint, templateCode) {
  const flags = { scientificApproval: false, requiresFreshScientificReview: true, currentPrescriptionVerified: false };
  if (record === null || record === undefined) return { ...flags, status: 'missing' };
  try {
    const copy = cloneJson(record);
    if (!fingerprint(accountFingerprint) || copy.accountFingerprint !== accountFingerprint || copy.templateCode !== templateCode) return { ...flags, status: 'stale' };
    if (![1, 2].includes(copy.version) || digest(snapshotNormalizedPlan(copy.plan)) !== copy.planDigest || !Array.isArray(copy.plan.evidence) || !copy.plan.evidence.length || !Array.isArray(copy.plan.decisionEvidence) || !copy.plan.decisionEvidence.length) throw new Error('Invalid historical plan.');
    if (copy.version === 2) {
      const { provenanceDigest, ...bound } = copy.savedEdit;
      if (digest(bound) !== provenanceDigest || savedTemplateDigest(bound.baselineTemplate) !== bound.baseDigest || bound.baselineTemplate.code !== templateCode) throw new Error('Invalid historical saved-edit provenance.');
    }
    return { ...flags, status: 'historical-unverified', reviewedAt: copy.reviewedAt, pluginVersion: copy.pluginVersion, plan: copy.plan };
  } catch { return { ...flags, status: 'invalid' }; }
}
function verifyDose(record, readback, { metadataById, deviceType, displayUnit, staticLoadContext = {} }) {
  if (!staticLoadContext || ![Object.prototype, null].includes(Object.getPrototypeOf(staticLoadContext)) ||
      Object.getOwnPropertySymbols(staticLoadContext).length || Object.getOwnPropertyNames(staticLoadContext).some(key => !Object.hasOwn(Object.getOwnPropertyDescriptor(staticLoadContext, key), 'value'))) throw new Error('Saved-edit context rejects accessors or inherited objects.');
  const hasStaticLoads = record.plan.exercises.some(exercise => ['profile-auto', 'customize-manual', 'fixed-kg'].includes(exercise.loadType));
  if (!(metadataById instanceof Map) || deviceType !== 1 || (hasStaticLoads && !['kg', 'lb'].includes(displayUnit)) || (displayUnit !== undefined && !['kg', 'lb'].includes(displayUnit))) throw new Error('Fresh metadata and Gym Monster family are required; static prescriptions also require display unit.');
  if (displayUnit !== undefined && staticLoadContext.accountUnit !== undefined && displayUnit !== staticLoadContext.accountUnit) throw new Error('Review display unit differs from static protocol account unit.');
  if (staticLoadContext.displayUnit !== undefined && (!['kg','lb'].includes(staticLoadContext.displayUnit) || staticLoadContext.displayUnit !== displayUnit)) throw new Error('Review display unit differs from static protocol context display unit.');
  let verificationAccountUnit = displayUnit;
  if (!hasStaticLoads && displayUnit === undefined && staticLoadContext.staticLoadProtocol === 'account-unit-verbatim') {
    if (staticLoadContext.evidenceStatus !== 'verified-reference' || !['kg','lb'].includes(staticLoadContext.accountUnit) || staticLoadContext.accountIdentityFingerprint !== record.accountFingerprint || staticLoadContext.contextDigest !== record.staticContextDigest) throw new Error('Nonstatic alternative protocol requires its verified account-bound review context.');
    verificationAccountUnit = staticLoadContext.accountUnit;
  }
  let expectedPayload = cloneJson(buildPresetPayload(record.plan, metadataById, deviceType, displayUnit, staticLoadContext).payload);
  if (record.version === 2) {
    const provenance = cloneJson(record.savedEdit);
    if (Object.keys(provenance).some(key => !['baselineTemplate', 'baseDigest', 'allowedChanges', 'occurrenceMapping', 'finalWirePayload', 'provenanceDigest'].includes(key)) ||
        !fingerprint(provenance.baseDigest) || !fingerprint(provenance.provenanceDigest) ||
        staticLoadContext.contextDigest !== record.staticContextDigest ||
        provenance.baselineTemplate.code !== record.templateCode || savedTemplateDigest(provenance.baselineTemplate) !== provenance.baseDigest) throw new Error('Invalid saved-edit baseline/context binding.');
    const { provenanceDigest, ...bound } = provenance;
    if (digest(bound) !== provenanceDigest) throw new Error('Saved-edit provenance changed.');
    if (provenance.occurrenceMapping !== null && provenance.occurrenceMapping?.accountFingerprint !== record.accountFingerprint) throw new Error('Saved-edit occurrence account differs.');
    const context = { ...staticLoadContext, displayUnit, savedEditOccurrenceMapping: provenance.occurrenceMapping ?? undefined };
    const baseline = buildSavedTemplateUpdatePayload(provenance.baselineTemplate, context);
    const generated = { ...baseline, ...expectedPayload, id: baseline.id, code: baseline.code };
    const reconciled = reconcileSavedEditPayload(baseline, generated, context, { allowedChanges: provenance.allowedChanges, generatedPresetDefaults: true });
    assertSavedEditScope(diffSavedEditPayloads(baseline, reconciled, context), provenance.allowedChanges);
    if (digest(reconciled) !== digest(provenance.finalWirePayload)) throw new Error('Saved-edit regenerated wire differs from approved payload.');
    expectedPayload = cloneJson(reconciled);
  } else if (record.version !== 1 || record.savedEdit !== undefined) throw new Error('Invalid review provenance version.');
  if (record.expectedPayload && digest(record.expectedPayload) !== digest(expectedPayload)) throw new Error('Regenerated prescription differs from reviewed payload.');
  const verification = acceptEquivalentReadbackDifferences(verifyCreatedTemplateReadback({ expectedPayload, readback, expectedCode: record.templateCode, expectedTotalCapacity: expectedPayload.totalCapacity, staticLoadProtocol: staticLoadContext.staticLoadProtocol, accountUnit: verificationAccountUnit, exerciseMetadataByAction: staticLoadContext.exerciseMetadataByAction }), expectedPayload, readback);
  if (!verification.safeToReportSuccess) throw new Error('Reviewed prescription differs from readback: ' + [...(verification.mismatches ?? []), ...(verification.unavailable ?? [])].slice(0, 12).map(row => row.path + (row.expected !== undefined ? ' oczekiwano ' + JSON.stringify(row.expected) + ', jest ' + JSON.stringify(row.actual) : ' (brak w odczycie)')).join('; ') + '.');
  return expectedPayload;
}
function validate(record, wire) {
  if (![1, 2].includes(record.version) || typeof record.pluginVersion !== 'string' || !record.pluginVersion.trim() || record.pluginVersion.length > 100 || typeof record.reviewedAt !== 'string' || !Number.isFinite(Date.parse(record.reviewedAt)) || new Date(record.reviewedAt).toISOString() !== record.reviewedAt) throw new Error('Invalid review record version or timestamp.');
  if (![record.accountFingerprint, record.intakeFingerprint, record.staticContextDigest, record.planDigest].every(fingerprint)) throw new Error('Review record requires SHA-256 fingerprints.');
  if (typeof record.templateCode !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(record.templateCode)) throw new Error('Invalid template code.');
  if (wire?.code !== undefined && String(wire.code) !== record.templateCode) throw new Error('Review template code differs from verified wire.');
  const plan = record.plan;
  if (!plan || !Array.isArray(plan.exercises) || !plan.exercises.length || !Array.isArray(plan.evidence) || !plan.evidence.length || !Array.isArray(plan.decisionEvidence) || !plan.decisionEvidence.length || digest(plan) !== record.planDigest) throw new Error('Review record requires intact plan and evidence.');
  const match = reconcileSavedPlanIdentity(record.savedPlanIdentity, wire, record.accountFingerprint);
  if (match.status !== 'matched') throw new Error('Review record identity differs from verified wire.');
  const entries = new Map();
  for (const exercise of plan.exercises) {
    const entryId = exercise.entryId ?? exercise.id;
    if (entries.has(entryId)) throw new Error('Review plan has duplicate entry identities.');
    entries.set(entryId, exercise);
  }
  for (const mapping of match.mappings) {
    const exercise = entries.get(mapping.entryId);
    if (!exercise || exercise.id !== mapping.groupId || exercise.actionLibraryId !== mapping.actionLibraryId || (exercise.section ?? 'main') !== mapping.section) throw new Error('Review plan differs from saved identity.');
  }
  if ([...entries.keys()].some(id => !match.mappings.some(mapping => mapping.entryId === id))) throw new Error('Review identity omits plan entries.');
}

export function createReviewedPlanRecord({ pluginVersion, reviewedAt, accountFingerprint, intakeFingerprint, staticContextDigest, templateCode, savedPlanIdentity, plan, verifiedReadback, metadataById, deviceType, displayUnit, staticLoadContext, savedEdit, retainedSource }) {
  const snapshot = snapshotNormalizedPlan(plan);
  const record = cloneJson({ version: savedEdit === undefined ? 1 : 2, pluginVersion, reviewedAt, accountFingerprint, intakeFingerprint, staticContextDigest, templateCode, savedPlanIdentity, plan: snapshot, planDigest: digest(snapshot) });
  if (savedEdit !== undefined) {
    const supplied = cloneJson(savedEdit);
    if (Object.keys(supplied).some(key => !['baselineTemplate', 'baseDigest', 'allowedChanges', 'occurrenceMapping', 'finalWirePayload'].includes(key))) throw new Error('Unexpected saved-edit provenance input.');
    const bound = cloneJson({ baselineTemplate: createSavedTemplateSnapshot(supplied.baselineTemplate), baseDigest: supplied.baseDigest, allowedChanges: supplied.allowedChanges, occurrenceMapping: supplied.occurrenceMapping ?? null, finalWirePayload: supplied.finalWirePayload });
    record.savedEdit = { ...bound, provenanceDigest: digest(bound) };
  }
  record.expectedPayload = verifyDose(record, verifiedReadback, { metadataById, deviceType, displayUnit, staticLoadContext });
  validate(record, buildSavedTemplateUpdatePayload(verifiedReadback, { ...staticLoadContext, displayUnit }));
  if(retainedSource!==undefined){try{record.retainedPortableSource=bindRetainedPortableSource({candidate:retainedSource,accountFingerprint,templateCode,wireDigest:savedTemplateDigest(verifiedReadback),staticWeightUnit:displayUnit??null,staticLoadProtocol:staticLoadContext.staticLoadProtocol,exerciseMetadata:retainedSourceExportMetadata(snapshot,metadataById)});}catch{record.retainedPortableSource={version:1,status:'unavailable',reason:'confirmed-export-context-unavailable'};}}
  if (record.version === 2) freezeJson(record.savedEdit);
  return record;
}

export function inspectReviewedPlanRecord({ record, currentWirePayload, accountFingerprint, intakeFingerprint, staticContextDigest, templateCode, metadataById, deviceType, displayUnit, staticLoadContext } = {}) {
  const result = { scientificApproval: false, requiresFreshScientificReview: true };
  if (record === null || record === undefined) return { ...result, status: 'missing' };
  try {
    const copy = cloneJson(record);
    if (![accountFingerprint, intakeFingerprint, staticContextDigest].every(fingerprint)) return { ...result, status: 'invalid' };
    if (copy.accountFingerprint !== accountFingerprint || copy.intakeFingerprint !== intakeFingerprint || copy.staticContextDigest !== staticContextDigest || templateCode !== copy.templateCode) return { ...result, status: 'stale' };
    if (typeof currentWirePayload?.name !== 'string' || !currentWirePayload.name.trim()) throw new Error('Current template display name is unavailable.');
    if (!copy.expectedPayload || digest(snapshotNormalizedPlan(copy.plan)) !== copy.planDigest) throw new Error('Invalid normalized snapshot.');
    // Display-only rename does not alter the reviewed training prescription. Creation still verifies the exact name.
    verifyDose(copy, { ...currentWirePayload, name: copy.expectedPayload.name }, { metadataById, deviceType, displayUnit, staticLoadContext });
    validate(copy, buildSavedTemplateUpdatePayload(currentWirePayload, { ...staticLoadContext, displayUnit }));
    return { ...result, status: 'historical-review-matched' };
  } catch { return { ...result, status: 'invalid' }; }
}
