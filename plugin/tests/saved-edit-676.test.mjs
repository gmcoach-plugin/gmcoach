import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSavedEditBatch } from '../saved-edit-batch.mjs';
import { normalizeEvidenceCoverage } from '../training-evidence.mjs';

// Błędy z wsadowej edycji obciążenia 4 zapisanych szablonów (staging-release-676).
const server = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
const toolBlock = (name) => server.slice(server.indexOf("name: '" + name + "'"), server.indexOf("name: '" + name + "'") + 4000);

test('baselines: opis nazywa argument program_codes', () => {
  assert.match(toolBlock('gm_coach_get_saved_plan_baselines'), /argumencie program_codes.*template_codes\/codes nie są obsługiwane/);
});

test('research: opis podaje limit maxResultsPerQuery 1–5', () => {
  const block = toolBlock('gm_coach_search_training_research');
  assert.match(block, /maxResultsPerQuery przyjmuje 1–5/);
  assert.match(block, /maxResultsPerQuery: \{ type: 'integer', minimum: 1, maximum: 5/);
});

test('decisionEvidence.target: opis z przykładami, walidacja wskazuje stretch:N', () => {
  assert.match(server, /Przykłady: plan, exercise:1001, set:1001:2, warmup:1, stretch:1\. Nie używaj stretching:N/);
  assert.throws(() => normalizeEvidenceCoverage([], [{ category: 'post_workout_stretching_item', target: 'stretching:1' }], [], { status: 'omitted_user_preference', omissionReason: 'Nie chce.', items: [] }, { status: 'omitted_user_preference', omissionReason: 'Nie chce.', items: [] }),
    /stretch:<N> \(np\. stretch:1, nie stretching:1\)/);
});

test('batch_items: wspólne decyzje są przepisywane także dla pierwszego szablonu', async () => {
  const previews = [];
  const dispatch = async (name, args) => {
    if (name === 'gm_coach_derive_evidence_bindings') {
      const id = args.exercises[0].id;
      return { categories: [{ category: 'exercise_selection', exampleTarget: 'exercise:' + id, exampleValue: 'value-' + id }] };
    }
    previews.push(args);
    return { editPreviewId: 'p-' + args.program_code, programCode: args.program_code, writeReady: true };
  };
  const shared = [{ category: 'exercise_selection', target: 'exercise:1001', value: 'stale', status: 'applied', sourceAssessments: [{ evidenceId: 'e1', reviewedValue: 'stale' }] }];
  const out = await runSavedEditBatch(dispatch, 'speediance_preview_saved_program_update', {
    program_code: 'a', base_digest: 'd1', exercises: [{ id: 2001 }], decisionEvidence: shared, allowed_changes: ['load'],
    batch_items: [{ program_code: 'b', base_digest: 'd2', exercises: [{ id: 3001 }] }]
  }, { concurrency: 1 });
  assert.equal(out.ok, 2);
  for (const [code, id] of [['a', 2001], ['b', 3001]]) {
    const d = previews.find((p) => p.program_code === code).decisionEvidence[0];
    assert.equal(d.target, 'exercise:' + id); assert.equal(d.value, 'value-' + id); assert.equal(d.sourceAssessments[0].reviewedValue, 'value-' + id);
  }
});

test('edycja zapisanego szablonu tylko load/rest/order/mode nie wymaga pełnego wywiadu; inne kontrole zostają', () => {
  assert.match(server, /savedEditNarrowScope: args\[existingTemplatePreview\] === true && Array\.isArray\(args\.allowed_changes\) && args\.allowed_changes\.length > 0 && args\.allowed_changes\.every\(\(value\) => \['load', 'rest', 'exercise_order', 'resistance_mode'\]\.includes\(value\)\)/);
  assert.match(server, /if \(!quickTestSession && !savedEditNarrowScope\) assertTrainingInterviewComplete\(interview\.audit\);\n  if \(!quickTestSession && !scienceDeclined\) assertNutritionContextEvidence/);
  // Komunikat wywiadu podaje od razu pole zależne stylu.
  assert.match(server, /coach-choice wymaga też trainingStyleRationale \(podaj od razu/);
});

test('schemat preview_saved_program_update zawiera isDeload z programSchema', () => {
  const start = server.indexOf('function programSchema(');
  assert.match(server.slice(start, start + 2000), /isDeload: \{ type: 'boolean'/);
  assert.match(toolBlock('speediance_preview_saved_program_update'), /\.\.\.programSchema\(\)\.properties/);
});

