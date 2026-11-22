import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exportSharedPlan, importSharedPlan, compareSharedPlanChanges } from '../portable-shared-plan.mjs';

const source = () => ({
  prescription: {
    name: 'Shared strength day', rationale: 'Historical plan rationale.',
    exercises: [{ entryId: 7, id: 1, actionLibraryId: 101, title: 'Press', section: 'main', loadType: 'smart-rm', smartRmPresetName: 'Strength',
      sets: [{ unit: 'reps', reps: 8, mode: 1, restSeconds: 90, rirTarget: 2, sourceRmSelector: 7 }] }]
  },
  research: {
    evidence: [{ id: 'e1', researchSourceId: 'pubmed:123', researchBatchIds: [], supports: 'Historical dose', coveredCategories: ['repetitions'], title: 'Source', publicationDate: '2026', finding: 'Historical finding', population: 'Adults', limitations: 'Unverified historical interpretation', url: 'https://example.test/research' }],
    decisionEvidence: [{ category: 'repetitions', target: '7', value: '8', status: 'applied', relationship: 'direct', evidenceIds: ['e1'], supportingExcerpts: [{ evidenceId: 'e1', excerpt: 'A historic excerpt.' }], sourceAssessments: [{ evidenceId: 'e1', reviewedValue: '8', direction: 'supports', interventionMatch: 'direct', outcomeMatch: 'direct', populationMatch: 'direct', limitations: 'Historical only', rationale: 'Past assessment' }], reasoning: 'Original historical reasoning' }]
  }
});
const metadata = [{ entryId: 7, exportIsUnilateral: false, exportIsBarbell: false }];
function bodyweightSource() {
  const input = source(), exercise = input.prescription.exercises[0];
  exercise.title = 'Bodyweight squat'; exercise.loadType = 'bodyweight';
  delete exercise.smartRmPresetName;
  delete exercise.sets[0].sourceRmSelector;
  return input;
}
function roundTrip() {
  const exported = exportSharedPlan({ source: source(), staticWeightUnit: 'kg', staticLoadProtocol: 'account-unit-verbatim', exerciseMetadata: metadata });
  const imported = importSharedPlan({ artifactText: exported.artifactText, profile: 'synthetic' });
  return { exported, imported };
}

test('paired export/import preserves full historical evidence separately and grants no authority', () => {
  const { exported, imported } = roundTrip();
  assert.equal(exported.status, 'exported');
  assert.equal(JSON.parse(exported.artifactText).referenceClientJson.exercises[0].sets[0].reps, 8);
  assert.equal(imported.sourceArchive.research.decisionEvidence[0].sourceAssessments[0].rationale, 'Past assessment');
  assert.equal(imported.targetProfile, 'synthetic');
  assert.equal(Object.hasOwn(imported.planForPreview, 'profile'), false);
  assert.equal(imported.planForPreview.exercises[0].sets[0].unit, 'reps');
  assert.equal(imported.planForPreview.exercises[0].sets[0].rirTarget, 2);
  assert.equal(imported.planForPreview.exercises[0].sets[0].sourceRmSelector, undefined);
  assert.deepEqual(imported.planForPreview.evidence, []);
  assert.deepEqual(imported.planForPreview.decisionEvidence, []);
  assert.equal(imported.planForPreview.scienceGate, 'user_declined');
  assert.equal(Object.hasOwn(imported.planForPreview, 'warmup'), false, 'no current warmup decision is invented');
  assert.equal(Object.hasOwn(imported.planForPreview, 'postWorkoutStretching'), false, 'no current stretching decision is invented');
  assert.equal(Object.hasOwn(imported.planForPreview, 'profile'), false, 'destination profile is not written into source plan identity');
  assert.deepEqual(imported.currentReviewRequired, ['warmup', 'postWorkoutStretching', 'recipient_injuries_limitations', 'recipient_preferences_keep_or_change', 'recipient_schedule_missing_only']);
  assert.deepEqual(imported.planForPreview.currentReviewRequired, imported.currentReviewRequired);
  assert.deepEqual(imported.automaticTechnicalChecks, ['destination_account', 'current_exercise_catalog', 'required_accessories', 'account_unit_for_static_loads_if_needed']);
  assert.ok(!imported.currentReviewRequired.includes('intakeAnswers') && !imported.currentReviewRequired.includes('profile'));
  assert.ok(imported.currentReviewRequired.includes('warmup'));
  assert.ok(imported.currentReviewRequired.includes('postWorkoutStretching'));
  assert.equal(imported.provenance.historicalScienceReassessed, false);
  for (const value of [imported.originScientificApproval, imported.originVerified, imported.writeReady, imported.mutationSent, exported.provenance.originVerified, exported.provenance.scientificApproval]) assert.equal(value, false);
  assert.deepEqual(imported.unresolvedImportedSelectors, [{ entryId: 7, setIndex: 0, selector: 7, status: 'requires-reviewed-selector-policy' }]);
});

test('explicit reassessment option asks the ordinary fresh science path to review anew', () => {
  const { exported } = roundTrip();
  const imported = importSharedPlan({ artifact: { referenceClientJson: exported.referenceClientJson, sidecar: exported.sidecar }, reassessScience: true });
  assert.equal(imported.reassessmentRequested, true);
  assert.equal(imported.changeResearchStatus, 'reassessment_requested');
  assert.equal(imported.planForPreview.reassessmentRequested, true);
  assert.equal(Object.hasOwn(imported.planForPreview, 'scienceGate'), false);
  assert.deepEqual(imported.planForPreview.evidence, []);
  assert.deepEqual(imported.planForPreview.decisionEvidence, []);
  assert.equal(imported.researchReviewStatus, 'fresh_review_required');
});

test('edited candidate diffs against immutable source without changing historical provenance', () => {
  const { exported, imported } = roundTrip(), edited = structuredClone(imported.planForPreview);
  edited.exercises[0].sets[0].reps = 10;
  edited.name = 'Shared strength day v2';
  const changes = compareSharedPlanChanges(imported.sourceArchive, edited);
  assert.deepEqual(changes.map(row => row.path), ['name', 'exercises.7.sets.0.reps']);
  assert.equal(changes[1].before, 8); assert.equal(changes[1].after, 10);
  const reimported = importSharedPlan({ artifactText: exported.artifactText, candidate: { name: edited.name, exercises: edited.exercises } });
  assert.ok(reimported.changes.every(change => change.scienceStatus === 'not_reassessed'));
  assert.equal(imported.sourceArchive.prescription.exercises[0].sets[0].reps, 8);
  assert.equal(imported.sourceArchive.research.decisionEvidence[0].value, '8');
});

test('import retains historical section declaration and executable section exercise without fabricating opt-out', () => {
  const input = source();
  input.prescription.warmup = { status: 'included', instructions: ['Historical warm-up note.'] };
  input.prescription.exercises.push({ entryId: 8, id: 2, actionLibraryId: 102, title: 'Warm-up movement', section: 'warmup', loadType: 'bodyweight', sets: [{ unit: 'reps', reps: 6, mode: 1, restSeconds: 30 }] });
  const exported = exportSharedPlan({ source: input, staticWeightUnit: 'kg', staticLoadProtocol: 'account-unit-verbatim', exerciseMetadata: metadata });
  const imported = importSharedPlan({ artifactText: exported.artifactText });
  assert.equal(imported.planPresentation.historicalSections.warmup.status, 'included');
  assert.equal(imported.planForPreview.exercises.find(row => row.entryId === 8).section, 'warmup');
  assert.equal(Object.hasOwn(imported.planForPreview, 'warmup'), false);
  assert.equal(imported.planForPreview.exercises.some(row => row.entryId === 8), true);
});

test('all-bodyweight plan exports and imports as a bounded source-only archive without fabricated reference client rows', () => {
  const input = bodyweightSource();
  const exported = exportSharedPlan({ source: input, staticWeightUnit: 'kg', staticLoadProtocol: 'account-unit-verbatim', exerciseMetadata: [] });
  const artifact = JSON.parse(exported.artifactText);
  assert.deepEqual(Object.keys(artifact).sort(), ['kind', 'referenceClientJson', 'representation', 'sidecar', 'version']);
  assert.equal(artifact.kind, 'gm-coach-shared-plan');
  assert.equal(artifact.version, 1);
  assert.equal(artifact.representation, 'source-only');
  assert.deepEqual(artifact.referenceClientJson.exercises, []);
  assert.deepEqual(artifact.sidecar.payload.mapping, []);
  assert.deepEqual(artifact.sidecar.payload.sourceOnlyOmissions, [{ sourceEntryId: 7, sourceSetIndex: 0, reason: 'not-represented-in-reference-client-json' }]);
  assert.deepEqual(artifact.sidecar.payload.prescription, input.prescription);
  assert.deepEqual(artifact.sidecar.payload.research, input.research);
  assert.equal(artifact.sidecar.payload.staticSourceContext.unit, 'unknown');
  assert.equal(exported.representation, 'source-only');
  assert.equal(exported.referenceClientExecutionCoverage, 'none-source-archive-only');
  for (const value of [exported.provenance.originVerified, exported.provenance.scientificApproval, exported.provenance.writeReady, exported.provenance.mutationSent]) assert.equal(value, false);

  const imported = importSharedPlan({ artifactText: exported.artifactText });
  assert.equal(imported.representation, 'source-only');
  assert.equal(imported.referenceClientExecutionCoverage, 'none-source-archive-only');
  assert.equal(JSON.stringify(imported.sourceArchive.prescription), JSON.stringify(input.prescription));
  assert.deepEqual(imported.planForPreview.exercises.map(({ entryId, title, loadType, sets }) => ({ entryId, title, loadType, sets })), [
    { entryId: 7, title: 'Bodyweight squat', loadType: 'bodyweight', sets: [{ unit: 'reps', reps: 8, mode: 1, restSeconds: 90, rirTarget: 2 }] }
  ]);
  for (const value of [imported.provenance.originVerified, imported.provenance.scientificApproval, imported.provenance.writeReady, imported.provenance.mutationSent]) assert.equal(value, false);
});

test('source-only envelope rejects unknown versions, authority fields, reference client rows and unsafe descriptors', () => {
  const exported = exportSharedPlan({ source: bodyweightSource(), staticWeightUnit: 'kg', staticLoadProtocol: 'account-unit-verbatim', exerciseMetadata: [] });
  const base = JSON.parse(exported.artifactText);
  for (const change of [
    value => { value.kind = 'other'; },
    value => { value.version = 2; },
    value => { value.representation = 'paired-reference-client-json'; },
    value => { value.approvalId = 'foreign'; },
    value => { value.referenceClientJson.exercises.push({}); }
  ]) {
    const malformed = structuredClone(base); change(malformed);
    assert.throws(() => importSharedPlan({ artifact: malformed }), /Unsupported|source-only/i);
  }
  let hits = 0;
  const guarded = { ...base };
  Object.defineProperty(guarded, 'representation', { enumerable: true, get() { hits++; return 'source-only'; } });
  assert.throws(() => importSharedPlan({ artifact: guarded }), /accessors/i);
  assert.equal(hits, 0);
});

test('candidate changes include exercise reorder, section declarations and superset edits', () => {
  const input = source();
  const row = structuredClone(input.prescription.exercises[0]);
  row.entryId = 8; row.id = 2; row.actionLibraryId = 102; row.title = 'Row';
  row.sets[0].sourceRmSelector = 8;
  input.prescription.exercises.push(row);
  const metadataRows = [...metadata, { entryId: 8, exportIsUnilateral: false, exportIsBarbell: false }];
  const exported = exportSharedPlan({ source: input, staticWeightUnit: 'kg', staticLoadProtocol: 'account-unit-verbatim', exerciseMetadata: metadataRows });
  const importedBase = importSharedPlan({ artifactText: exported.artifactText }).planForPreview;
  const candidate = {
    name: input.prescription.name,
    exercises: [
      structuredClone(importedBase.exercises[1]),
      structuredClone(importedBase.exercises[0])
    ],
    warmup: { status: 'included', items: [{ kind: 'general', activity: 'Current warm-up', dosage: '5 minutes' }] },
    postWorkoutStretching: { status: 'omitted_user_preference', omissionReason: 'Recipient declined stretching.', items: [] },
    supersetBlocks: [{ members: [{ exerciseId: 7, setupKey: 'machine-A' }, { exerciseId: 8, setupKey: 'machine-A' }] }]
  };
  const imported = importSharedPlan({ artifactText: exported.artifactText, candidate });
  assert.deepEqual(imported.changes.filter(change => ['exercises.order', 'warmup', 'postWorkoutStretching', 'supersetBlocks'].includes(change.path)).map(change => change.path), ['exercises.order', 'warmup', 'postWorkoutStretching', 'supersetBlocks']);
  assert.equal(imported.planForPreview.warmup.status, 'included');
  assert.equal(imported.planForPreview.exercises[0].entryId, 8);
  assert.ok(imported.changes.every(change => change.scienceStatus === 'not_reassessed'));
});

test('candidate import rejects duplicate exercise identities and sensitive or unsupported fields', () => {
  const { exported, imported } = roundTrip();
  const duplicate = structuredClone(imported.planForPreview.exercises);
  duplicate.push(structuredClone(duplicate[0]));
  assert.throws(() => importSharedPlan({ artifactText: exported.artifactText, candidate: { exercises: duplicate } }), /Duplicate candidate exercise identity/);
  assert.throws(() => importSharedPlan({ artifactText: exported.artifactText, candidate: { profile: 'other' } }), /Unsupported/);
  assert.throws(() => importSharedPlan({ artifactText: exported.artifactText, candidate: { approvalId: 'foreign' } }), /Unsupported/);
  assert.throws(() => importSharedPlan({ artifactText: exported.artifactText, candidate: { name: imported.planForPreview.name, exercises: imported.planForPreview.exercises, currentReviewRequired: [] } }), /Unsupported/);
});

test('changed sidecar or paired reference client data fail unless hashes are recomputed; self hash is not author proof', () => {
  const { exported } = roundTrip(), tampered = structuredClone(exported.sidecar);
  tampered.payload.research.evidence[0].finding = 'Tampered';
  assert.throws(() => importSharedPlan({ referenceClientJson: exported.referenceClientJson, sidecar: tampered }), /integrity/);
  const referenceClient = structuredClone(exported.referenceClientJson); referenceClient.exercises[0].sets[0].reps = 9;
  assert.throws(() => importSharedPlan({ referenceClientJson: referenceClient, sidecar: exported.sidecar }), /integrity/);
  const selfRehashed = structuredClone(exported.sidecar); selfRehashed.payload.research.evidence[0].finding = 'Edited and rehashed';
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  selfRehashed.payloadHash = createHash('sha256').update(JSON.stringify(canonical(selfRehashed.payload)), 'utf8').digest('hex');
  const accepted = importSharedPlan({ referenceClientJson: exported.referenceClientJson, sidecar: selfRehashed });
  assert.equal(accepted.provenance.originVerified, false);
  assert.equal(accepted.provenance.scientificApproval, false);
});

test('bounded parser rejects malformed/oversized JSON, accessors and extra authority claims', () => {
  assert.throws(() => importSharedPlan({ artifactText: '{not json' }), /valid JSON/);
  assert.throws(() => importSharedPlan({ artifactText: ' '.repeat(1_000_001) }), /1 MB/);
  const oversizedArtifact = { referenceClientJson: { name: 'x', exercises: [] }, sidecar: { payload: { finding: 'x'.repeat(1_000_001) } } };
  assert.throws(() => importSharedPlan({ artifact: oversizedArtifact }), /20,000 characters|1 MB|Archive byte bound/);
  const { exported } = roundTrip();
  const input = { referenceClientJson: exported.referenceClientJson, sidecar: exported.sidecar };
  Object.defineProperty(input, 'approvalId', { enumerable: true, value: 'foreign' });
  assert.throws(() => importSharedPlan(input), /Unsupported/);
  let hits = 0; const guarded = {};
  Object.defineProperty(guarded, 'artifactText', { enumerable: true, get() { hits++; return exported.artifactText; } });
  assert.throws(() => importSharedPlan(guarded), /accessors/i);
  assert.equal(hits, 0);
});
