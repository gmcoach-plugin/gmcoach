import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrainingResearchRegistry } from '../plugin/training-research.mjs';
import { prepareEvidencePack, REVIEW } from '../plugin/evidence-pack.mjs';
import { normalizeEvidenceCoverage, normalizeTrainingEvidence, validateEvidenceExcerptAnchors } from '../plugin/training-evidence.mjs';

const exercise = {
  id: 42, title: 'Wyciskanie na klatkę', loadType: 'profile-auto',
  strengthAnchor: { oneRepMax: 100, unit: 'kg', source: 'saved-profile' },
  sets: [{ unit: 'reps', reps: 8, rirTarget: 2, calculatedLoad: 80, loadUnit: 'kg', loadEstimate: { prescribedReps: 8, targetPercent1RM: 0.8, method: 'reference-client-speediance-vbt-anchor-interpolation' }, mode: 1, rest: 75 }]
};
const warmup = { status: 'omitted_user_preference', omissionReason: 'Użytkownik poprosił o pominięcie rozgrzewki.', items: [] };
const postWorkoutStretching = { status: 'omitted_user_preference', omissionReason: 'Użytkownik poprosił o pominięcie rozciągania.', items: [] };
const recoveryContext = { status: 'declined', contextDigest: 'abc123' };
const RETRACTED = '90000009';

const sentences = [
  'Twenty four trained young adults completed eight weeks of supervised resistance training with progressive overload.',
  'Higher weekly training volume produced greater muscle hypertrophy than lower volume protocols in these participants.',
  'Training frequency of two sessions per week per muscle group was sufficient for strength gains.',
  'Loads between sixty and eighty five percent of one repetition maximum increased maximal strength similarly.',
  'Longer rest intervals between sets preserved repetition performance and total volume across sessions.',
  'Exercise order with multi joint movements first improved performance of the subsequent single joint exercises.',
  'Repetitions in reserve ratings provided a practical estimate of proximity to muscular failure during sets.',
  'Planned deload weeks and periodized progression reduced fatigue while maintaining strength adaptations over time.',
  'Eccentric and concentric resistance modes produced comparable hypertrophy when total work was equated between groups.'
];
function abstractFor(pmid) {
  const n = Number(pmid.slice(-1));
  return sentences.slice(n % 3).concat(sentences.slice(0, n % 3)).join(' ');
}
function xmlFor(ids) {
  return '<?xml version="1.0"?><PubmedArticleSet>' + ids.map(pmid => '<PubmedArticle><MedlineCitation><PMID>' + pmid + '</PMID><Article><Journal><Title>Journal of Strength Research</Title><JournalIssue><PubDate><Year>2022</Year></PubDate></JournalIssue></Journal><ArticleTitle>Resistance training study ' + pmid + '</ArticleTitle><Abstract><AbstractText>' + abstractFor(pmid) + '</AbstractText></Abstract><PublicationTypeList>' + (pmid === RETRACTED ? '<PublicationType>Retracted Publication</PublicationType>' : '<PublicationType>Randomized Controlled Trial</PublicationType>') + '<PublicationType>Journal Article</PublicationType></PublicationTypeList></Article></MedlineCitation></PubmedArticle>').join('') + '</PubmedArticleSet>';
}
function createFetch() {
  const calls = { esearch: 0, efetch: 0 };
  let counter = 0;
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.includes('esearch')) {
      calls.esearch += 1;
      const k = counter++;
      const ids = [RETRACTED, ...[0, 1].map(i => String(90000000 + ((k * 2 + i) % 8)))];
      return new Response(JSON.stringify({ esearchresult: { idlist: ids } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    calls.efetch += 1;
    return new Response(xmlFor(parsed.searchParams.get('id').split(',')), { status: 200, headers: { 'content-type': 'text/xml' } });
  };
  return { fetchImpl, calls };
}
async function buildPack() {
  const { fetchImpl, calls } = createFetch();
  const registry = createTrainingResearchRegistry({ fetchImpl, minRequestIntervalMs: 0, searchCacheTtlMs: 0 });
  const searches = [];
  const trainingResearch = { search: async (input) => { searches.push(input); return registry.search(input); } };
  const pack = await prepareEvidencePack({ exercises: [exercise], warmup, postWorkoutStretching, recoveryContext, context: 'hypertrophy trained adults' }, { trainingResearch });
  return { pack, searches, calls };
}
const wordCount = text => text.match(/\S+/gu).length;
const withAbstracts = (pack) => pack.evidence.map(source => ({ ...source, pubmed: { abstract: pack.sourceHints.find(h => h.evidenceId === source.id).abstract } }));

test('one tool call runs one parallel search round covering every applied category', async () => {
  const { pack, searches } = await buildPack();
  const searched = searches.flatMap(s => s.queries.map(q => q.category));
  assert.equal(new Set(searched).size, searched.length, 'each category searched once');
  assert.equal(searches.length, Math.ceil(searched.length / 16));
  assert.ok(searched.length > 8 && searched.length <= 16, 'fixture spans more than the former 8-category limit');
  assert.equal(searches.length, 1, 'all categories in one search call');
  for (const s of searches) { assert.equal(s.maxResultsPerQuery, 5); assert.equal(s.broadenEmpty, true); assert.ok(s.queries.every(q => q.query === 'hypertrophy trained adults')); }
  assert.deepEqual(pack.researchBatchIds.length, searches.length);
  const applied = pack.decisionEvidenceDraft.filter(d => d.status === 'applied');
  for (const category of ['set_load', 'weekly_volume', 'rest_intervals', 'recovery_context']) assert.ok(applied.some(d => d.category === category), category);
  assert.equal(pack.readOnly, true);
  assert.equal(pack.scientificApproval, false);
  assert.match(pack.nextStep, /speediance_preview_program/);
});

test('excerpts are literal, within 25 words per source and category specific', async () => {
  const { pack } = await buildPack();
  assert.deepEqual(pack.needsModelAttention, []);
  assert.equal(pack.anchorCheck.ok, true);
  assert.ok(pack.evidence.length >= 1 && pack.evidence.length <= 12);
  const sources = withAbstracts(pack);
  const applied = pack.decisionEvidenceDraft.filter(d => d.status === 'applied');
  for (const decision of applied) for (const item of decision.supportingExcerpts) {
    assert.ok(wordCount(item.excerpt) >= 5 && wordCount(item.excerpt) <= 25);
    assert.doesNotThrow(() => validateEvidenceExcerptAnchors([{ ...decision, supportingExcerpts: [item] }], sources));
  }
  assert.doesNotThrow(() => validateEvidenceExcerptAnchors(applied, sources));
  const perSource = new Map();
  for (const d of applied) for (const item of d.supportingExcerpts) {
    const quotes = perSource.get(item.evidenceId) ?? new Map();
    quotes.set(item.excerpt.toLowerCase(), wordCount(item.excerpt));
    perSource.set(item.evidenceId, quotes);
  }
  for (const quotes of perSource.values()) assert.ok([...quotes.values()].reduce((a, b) => a + b, 0) <= 25);
  const anchors = applied.map(d => d.supportingExcerpts.map(x => x.evidenceId + '|' + x.excerpt.toLowerCase()));
  anchors.forEach((own, index) => assert.ok(own.some(a => anchors.every((other, j) => j === index || !other.includes(a)))));
});

test('not_used and not_applicable decisions are complete; scientific judgements are left for the model', async () => {
  const { pack } = await buildPack();
  const byCategory = new Map(pack.decisionEvidenceDraft.map(d => [d.category, d]));
  for (const category of ['supersets', 'intensity_techniques']) {
    const d = byCategory.get(category);
    assert.equal(d.status, 'not_used'); assert.equal(d.value, 'not_used'); assert.equal(d.relationship, 'not_applicable');
    assert.deepEqual([d.evidenceIds, d.supportingExcerpts, d.sourceAssessments], [[], [], []]);
    assert.ok(d.reasoning && d.reasoning !== REVIEW);
  }
  for (const category of ['warmup', 'post_workout_stretching', 'timed_exercise']) assert.equal(byCategory.get(category).status, 'not_applicable');
  for (const d of pack.decisionEvidenceDraft.filter(d => d.status === 'applied')) {
    assert.equal(d.relationship, REVIEW); assert.equal(d.reasoning, REVIEW);
    for (const a of d.sourceAssessments) for (const f of ['direction', 'interventionMatch', 'outcomeMatch', 'populationMatch', 'limitations', 'rationale']) assert.equal(a[f], REVIEW);
  }
  for (const e of pack.evidence) for (const f of ['finding', 'population', 'limitations']) assert.equal(e[f], REVIEW);
  assert.ok(pack.sourceHints.every(h => h.year === 2022 && h.publicationTypes.includes('Randomized Controlled Trial')));
  // 681: każde źródło z evidence ma w sourceHints pełny (nieobcięty) abstrakt, a nextStep zakazuje zbędnych odczytów.
  for (const e of pack.evidence) {
    const hint = pack.sourceHints.find(h => h.evidenceId === e.id);
    assert.ok(hint, e.id);
    assert.equal(hint.abstract, abstractFor(e.researchSourceId.replace(/\D/g, '')));
  }
  assert.match(pack.nextStep, /Abstrakty potrzebne do oceny są już w sourceHints — nie wywołuj read_training_research_batch, find_research_in_batches ani read_selected_research_abstracts/);
  assert.match(pack.nextStep, /od razu wyślij speediance_preview_program z evidence, researchBatchIds i decisionEvidence z paczki/);
  assert.throws(() => normalizeEvidenceCoverage(pack.evidence, pack.decisionEvidenceDraft, [exercise], warmup, postWorkoutStretching, [], recoveryContext));
});

test('blocked publications never enter evidence', async () => {
  const { pack } = await buildPack();
  assert.ok(pack.evidence.every(e => e.researchSourceId !== 'pubmed:' + RETRACTED));
  assert.ok(pack.excludedBlockedSources.some(x => x.sourceId === 'pubmed:' + RETRACTED));
});

test('end to end: pack plus model assessments passes the real coverage and anchor validators', async () => {
  const { pack } = await buildPack();
  const evidence = pack.evidence.map(e => ({ ...e, finding: 'Model: wynik streszczony z abstraktu.', population: 'Model: trenujący dorośli.', limitations: 'Model: krótka interwencja.' }));
  const decisions = pack.decisionEvidenceDraft.map(d => {
    if (d.status !== 'applied') return d;
    const value = d.valueToFill ? d.category + ': decyzja opisana przez model' : d.value;
    const { valueToFill, ...rest } = d;
    return { ...rest, value, relationship: 'direct', reasoning: 'Model: ocena zastosowania.',
      sourceAssessments: d.sourceAssessments.map(a => ({ ...a, reviewedValue: value, direction: 'supports', interventionMatch: 'direct', outcomeMatch: 'direct', populationMatch: 'direct', limitations: 'Model: ograniczenia.', rationale: 'Model: uzasadnienie.' })) };
  });
  assert.doesNotThrow(() => normalizeTrainingEvidence('Plan testowy.', evidence));
  const normalized = normalizeEvidenceCoverage(evidence, decisions, [exercise], warmup, postWorkoutStretching, [], recoveryContext);
  assert.ok(normalized.length >= decisions.length);
  assert.doesNotThrow(() => validateEvidenceExcerptAnchors(normalized, withAbstracts({ ...pack, evidence })));
});


test('pakiet nigdy nie proponuje fragmentu krótszego niż 5 słów ani z samą interpunkcją/etykietą', async () => {
  const { excerptCandidates } = await import('../plugin/evidence-pack.mjs');
  const abstract = 'RESULTS: Load – volume (n = 12) increased muscle hypertrophy in trained men. Short one here.';
  const out = excerptCandidates(abstract, 'set_volume', 5);
  assert.ok(out.length > 0);
  for (const c of out) {
    const words = c.excerpt.match(/\S+/gu);
    assert.ok(words.length >= 5, c.excerpt);
    assert.ok(words.every(w => /[\p{L}\p{N}]/u.test(w)), c.excerpt);
    assert.doesNotMatch(c.excerpt, /^RESULTS:/);
  }
});
