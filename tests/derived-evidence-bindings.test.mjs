import test from 'node:test';
import assert from 'node:assert/strict';
import { derivedDecisionCount, deriveExpectedEvidenceBindings, normalizeEvidenceCoverage, validateEvidenceExcerptAnchors, TRAINING_EVIDENCE_CATEGORIES } from '../plugin/training-evidence.mjs';

const EXCERPT = 'Resistance exercise improved strength after the intervention.';
const source = {
  id: 'e1', researchSourceId: 'pubmed:41843416', researchBatchIds: ['11111111-1111-4111-8111-111111111111'],
  supports: 'Zakres serii', coveredCategories: [...TRAINING_EVIDENCE_CATEGORIES], title: 'Resistance training prescription',
  publicationDate: '2026', finding: 'Wynik.', population: 'Dorośli.', limitations: 'Ograniczenia.', url: 'https://pubmed.ncbi.nlm.nih.gov/41843416/',
  pubmed: { abstract: 'Background. ' + EXCERPT + ' Conclusions follow.' }
};
const exercise = { id: 42, title: 'Bodyweight squat', loadType: 'bodyweight', sets: [
  { unit: 'reps', reps: 8, rirTarget: 2, mode: 1, rest: 60 },
  { unit: 'reps', reps: 8, rirTarget: 2, mode: 1, rest: 60 },
  { unit: 'reps', reps: 10, rirTarget: 2, mode: 1, rest: 90 }
] };
const sections = {
  warmup: { status: 'omitted_user_preference', omissionReason: 'Użytkownik pominął rozgrzewkę.', items: [] },
  postWorkoutStretching: { status: 'omitted_user_preference', omissionReason: 'Użytkownik pominął rozciąganie.', items: [] }
};
const bindings = deriveExpectedEvidenceBindings([exercise], sections.warmup, sections.postWorkoutStretching);

function decision(binding, reasoning = 'Uzasadnienie kategorii.') {
  let status = binding.requiredStatus ?? 'applied';
  let value = binding.value ?? 'Planowana decyzja.';
  if (!binding.requiredStatus && ['timed_exercise', 'warmup', 'post_workout_stretching'].includes(binding.category)) status = 'not_applicable';
  if (!binding.requiredStatus && ['supersets', 'intensity_techniques'].includes(binding.category)) { status = 'not_used'; value = 'not_used'; }
  const na = status === 'not_applicable';
  return { category: binding.category, target: binding.target, value, status, relationship: na ? 'not_applicable' : 'indirect',
    evidenceIds: na ? [] : ['e1'], supportingExcerpts: na ? [] : [{ evidenceId: 'e1', excerpt: EXCERPT }],
    ...(na ? {} : { sourceAssessments: [{ evidenceId: 'e1', reviewedValue: value, direction: 'supports', interventionMatch: 'direct', outcomeMatch: 'direct', populationMatch: 'direct', limitations: 'Brak.', rationale: 'Ocena źródła dla kategorii.' }] }),
    reasoning };
}
const full = () => bindings.map(binding => decision(binding));
const perCategory = () => { const seen = new Set(); return full().filter(item => !seen.has(item.category) && seen.add(item.category)); };
const norm = coverage => normalizeEvidenceCoverage([source], coverage, [exercise], sections.warmup, sections.postWorkoutStretching);

test('category-level evidence derives every per-binding mapping', () => {
  const supplied = perCategory();
  assert.ok(supplied.length < bindings.length);
  const result = norm(supplied);
  assert.equal(result.length, bindings.length);
  assert.equal(derivedDecisionCount(result), bindings.length - supplied.length);
  for (const binding of bindings.filter(item => item.value !== undefined)) {
    const row = result.find(item => item.category === binding.category && item.target === binding.target);
    assert.equal(row.value, binding.value);
    if (row.sourceAssessments) assert.equal(row.sourceAssessments[0].reviewedValue, binding.value);
  }
  assert.deepEqual(norm(perCategory()), result, 'derivation is deterministic');
});

test('missing category is reported once by category name', () => {
  const supplied = perCategory().filter(item => item.category !== 'set_rest_interval');
  assert.throws(() => norm(supplied), error => /Brak oceny naukowej dla kategorii: set_rest_interval\./.test(error.message));
});

test('explicit mappings are accepted and take precedence over derived ones', () => {
  assert.equal(derivedDecisionCount(norm(full())), 0);

  const target = bindings.filter(item => item.category === 'set_rest_interval')[2];
  const supplied = [...perCategory(), decision(target, 'Jawne uzasadnienie dłuższej przerwy.')];
  const result = norm(supplied);
  assert.equal(result.find(item => item.category === 'set_rest_interval' && item.target === target.target).reasoning, 'Jawne uzasadnienie dłuższej przerwy.');
  assert.equal(result.length, bindings.length);
});

