import { buildPubMedCategoryQuery } from './training-research.mjs';
import { countExcerptWords, deriveExpectedEvidenceBindings, deriveScienceResearchScope, validateEvidenceExcerptAnchors, EXCERPT_MAX_WORDS, EXCERPT_MIN_WORDS, SOURCE_MAX_UNIQUE_WORDS, TRAINING_EVIDENCE_CATEGORIES } from './training-evidence.mjs';

// Read-only accelerator for the ordinary single-session science stage. It only
// prepares candidate sources and literal excerpts; it never fills scientific
// judgements (match levels, direction, relationship) and never approves a plan.
export const REVIEW = 'REVIEW';
const MAX_SOURCES = 12;
const MAX_WORDS_PER_SOURCE = SOURCE_MAX_UNIQUE_WORDS;
const MAX_QUERIES_PER_SEARCH = 16;
const MAX_RESULTS_PER_QUERY = 5;
const MAX_EXCERPT_WORDS = Math.min(10, EXCERPT_MAX_WORDS);
const MIN_EXCERPT_WORDS = EXCERPT_MIN_WORDS;
const AEROBIC = new Set(['cardio_exercise_selection', 'cardio_intensity', 'cardio_work_rest']);
const NOT_APPLICABLE_WHEN_ABSENT = new Set(['timed_exercise', 'warmup', 'post_workout_stretching', 'nutrition_context', 'stretching_mobility']);

const phrases = (query) => new Set([...query.matchAll(/"([^"]+)"/g)].map(m => m[1].replace(/\*/g, '').toLocaleLowerCase('en-US')));
let keywordCache = null;
function categoryKeywords(category) {
  if (!keywordCache) {
    keywordCache = new Map();
    const sets = new Map();
    for (const c of TRAINING_EVIDENCE_CATEGORIES) { try { sets.set(c, phrases(buildPubMedCategoryQuery(c, 'zzqq'))); } catch { sets.set(c, new Set()); } }
    for (const aerobic of [true, false]) {
      const group = [...sets].filter(([c]) => AEROBIC.has(c) === aerobic).map(([, s]) => s);
      const common = new Set([...(group[0] ?? [])].filter(p => group.every(s => s.has(p))));
      for (const [c, s] of sets) if (AEROBIC.has(c) === aerobic) keywordCache.set(c, [...s].filter(p => !common.has(p) && p !== 'zzqq'));
    }
  }
  return keywordCache.get(category) ?? [];
}

export function buildEvidencePackQueryContext(context) {
  const words = String(context ?? '').split(/\s+/u).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(w => /^[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*$/u.test(w) && !/^(?:AND|OR|NOT)$/iu.test(w));
  return words.slice(0, 6).join(' ') || 'adults';
}

function sentencesOf(abstract) {
  return abstract.split(/\n+/u).flatMap(part => part.split(/(?<=[.!?])\s+(?=[A-Z0-9(])/u)).map(s => s.trim()).filter(Boolean);
}

function anchorOk(excerpt, abstract) {
  try {
    validateEvidenceExcerptAnchors([{ category: 'probe', target: 'plan', status: 'applied', supportingExcerpts: [{ evidenceId: 'e1', excerpt }] }], [{ id: 'e1', pubmed: { abstract } }]);
    return true;
  } catch { return false; }
}
const norm = (text) => text.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-US');

/** Literal 5–maxWords word windows from abstract sentences, ranked by category keyword hits. */
export function excerptCandidates(abstract, category, maxWords = MAX_EXCERPT_WORDS) {
  if (typeof abstract !== 'string' || !abstract.trim() || maxWords < MIN_EXCERPT_WORDS) return [];
  const keywords = categoryKeywords(category);
  const out = [];
  const seen = new Set();
  sentencesOf(abstract).forEach((sentence, sentenceIndex) => {
    const tokens = sentence.match(/\S+/gu) ?? [];
    if (tokens.length < MIN_EXCERPT_WORDS) return;
    const length = Math.min(maxWords, tokens.length);
    for (let start = 0; start + length <= tokens.length; start += 1) {
      const window = tokens.slice(start, start + length);
      // Every token must be a real word: a model that drops a bare dash/label/bullet would otherwise cite <5 words.
      if (window.some(t => !/[\p{L}\p{N}]/u.test(t)) || /:$/u.test(window[0])) continue;
      const excerpt = window.join(' ');
      const wordCount = countExcerptWords(excerpt);
      if (wordCount < MIN_EXCERPT_WORDS || wordCount > EXCERPT_MAX_WORDS) continue;
      const key = norm(excerpt);
      if (seen.has(key)) continue;
      seen.add(key);
      const hits = keywords.filter(k => key.includes(k)).length;
      const label = /:$/u.test(tokens[start]) ? 1 : 0;
      out.push({ excerpt, words: wordCount, score: hits * 10 - label * 3 - (sentenceIndex === 0 ? 1 : 0) + (start === 0 ? 1 : 0) });
    }
  });
  return out.sort((a, b) => b.score - a.score).filter(c => anchorOk(c.excerpt, abstract));
}

function populationHint(abstract) {
  const sentence = sentencesOf(abstract ?? '').find(s => /\b(participants?|adults?|men|women|subjects|athletes|older|untrained|trained|young|volunteers|patients|individuals)\b/iu.test(s));
  if (!sentence) return null;
  return (sentence.match(/\S+/gu) ?? []).slice(0, 25).join(' ');
}

function decisionGroups(bindings, researchScope, nutritionContextKnown) {
  const groups = [];
  const seen = new Set();
  for (const binding of bindings) {
    const researchCategories = binding.researchCategories ?? [binding.category];
    const key = binding.category + '\u0000' + researchCategories.join(',');
    if (seen.has(key)) continue;
    // A second signature of the same category matters only for applied bindings (mixed cardio/resistance).
    if (groups.some(g => g.binding.category === binding.category) && (binding.requiredStatus ?? 'applied') !== 'applied') continue;
    seen.add(key);
    let status = binding.requiredStatus;
    let statusInferred = false;
    if (!status) {
      statusInferred = true;
      const inScope = researchCategories.some(c => researchScope.includes(c)) || (binding.category === 'nutrition_context' && nutritionContextKnown);
      status = inScope ? 'applied' : NOT_APPLICABLE_WHEN_ABSENT.has(binding.category) ? 'not_applicable' : 'not_used';
    }
    groups.push({ binding, researchCategories, status, statusInferred });
  }
  return groups;
}

export async function prepareEvidencePack(args, { trainingResearch, exercises } = {}) {
  if (!trainingResearch || typeof trainingResearch.search !== 'function') throw new TypeError('trainingResearch.search is required.');
  const planExercises = exercises ?? args.exercises;
  const supersetBlocks = args.supersetBlocks ?? [];
  const bindings = deriveExpectedEvidenceBindings(planExercises, args.warmup, args.postWorkoutStretching, supersetBlocks, args.recoveryContext ?? null);
  const researchScope = deriveScienceResearchScope({ exercises: planExercises, warmup: args.warmup, postWorkoutStretching: args.postWorkoutStretching, supersetBlocks,
    decisionEvidence: args.nutritionContextKnown ? [{ category: 'nutrition_context', status: 'applied' }] : [] });
  const groups = decisionGroups(bindings, researchScope, args.nutritionContextKnown === true);
  const applied = groups.filter(g => g.status === 'applied');
  const searchCategories = TRAINING_EVIDENCE_CATEGORIES.filter(c => applied.some(g => g.researchCategories.includes(c)));
  const queryContext = buildEvidencePackQueryContext(args.context);
  const queries = searchCategories.map(category => ({ category, query: queryContext }));
  const chunks = Array.from({ length: Math.ceil(queries.length / MAX_QUERIES_PER_SEARCH) }, (_, i) => queries.slice(i * MAX_QUERIES_PER_SEARCH, (i + 1) * MAX_QUERIES_PER_SEARCH));
  // 5 results per category raise the chance that one PubMed record is returned for
  // several categories, so the 12-source cap covers every applied category.
  const batches = await Promise.all(chunks.map(chunk => trainingResearch.search({ queries: chunk, maxResultsPerQuery: MAX_RESULTS_PER_QUERY, broadenEmpty: true })));

  const pool = new Map(); // sourceId -> { record, categoryBatches: Map(category -> Set(batchId)), order }
  const excludedBlockedSources = [];
  for (const batch of batches) {
    const byId = new Map(batch.sources.map(s => [s.id, s]));
    for (const q of batch.queries) {
      for (const blocked of q.excludedBlockedSources ?? []) excludedBlockedSources.push({ ...blocked, category: q.category });
      for (const sourceId of q.sourceIds) {
        const record = byId.get(sourceId);
        if (!record || typeof record.abstract !== 'string' || !record.abstract.trim()) continue;
        if (!pool.has(sourceId)) pool.set(sourceId, { record, categoryBatches: new Map(), order: pool.size });
        const entry = pool.get(sourceId);
        if (!entry.categoryBatches.has(q.category)) entry.categoryBatches.set(q.category, new Set());
        entry.categoryBatches.get(q.category).add(batch.batchId);
      }
    }
  }

  const usedWords = (s) => [...s.used.values()].reduce((a, b) => a + b, 0);
  const neededCategories = new Set(searchCategories);
  // Set cover: prefer sources confirmed for many applied categories, so the 12-source cap is not exhausted early.
  const coverage = (e) => [...e.categoryBatches.keys()].filter(c => neededCategories.has(c)).length;
  const candidateCount = (rc) => [...pool.values()].filter(e => e.categoryBatches.has(rc)).length;
  const rarity = (g) => Math.min(...g.researchCategories.map(candidateCount));
  // Deterministic selection; several orders are tried and the one with the fewest uncovered categories wins.
  const runSelection = (order, useCoverage, excerptWords) => {
    const selected = new Map(); // sourceId -> { id, used: Map(normalizedExcerpt -> words), categories, batches }
    const needs = [];
    const drafts = new Map();
    for (const index of order) {
      const group = groups[index];
      const { binding } = group;
      const base = { category: binding.category, target: binding.target, value: binding.value ?? REVIEW };
      if (group.status !== 'applied') {
        drafts.set(index, { ...base, value: binding.value ?? group.status, status: group.status, relationship: 'not_applicable', evidenceIds: [], supportingExcerpts: [], sourceAssessments: [],
          reasoning: group.status === 'not_used' ? 'Element nie występuje w tym planie (not_used); bez wyszukiwania źródeł.' : 'Element nie dotyczy tego planu lub został pominięty zgodnie z wyborem użytkownika (not_applicable); bez wyszukiwania źródeł.',
          ...(group.statusInferred ? { statusInferredFromPlan: true } : {}) });
        continue;
      }
      const picks = [];
      let failed = null;
      for (const researchCategory of group.researchCategories) {
        if (picks.some(p => pool.get(p.sourceId).categoryBatches.has(researchCategory))) continue;
        const candidates = [...pool.entries()].filter(([sourceId, e]) => e.categoryBatches.has(researchCategory) && !picks.some(p => p.sourceId === sourceId))
          .map(([sourceId, e]) => ({ sourceId, e, sel: selected.get(sourceId) }))
          .filter(({ sel }) => sel || selected.size < MAX_SOURCES)
          .map(c => ({ ...c, budget: MAX_WORDS_PER_SOURCE - (c.sel ? usedWords(c.sel) : 0) }))
          .filter(c => c.budget >= MIN_EXCERPT_WORDS)
          .sort((a, b) => (b.sel ? 1 : 0) - (a.sel ? 1 : 0) || (useCoverage ? coverage(b.e) - coverage(a.e) : 0) || a.e.order - b.e.order);
        let chosen = null;
        for (const c of candidates) {
          const usedHere = c.sel ? new Set(c.sel.used.keys()) : new Set();
          const excerpt = excerptCandidates(c.e.record.abstract, researchCategory, Math.min(excerptWords, c.budget)).find(x => !usedHere.has(norm(x.excerpt)));
          if (excerpt) { chosen = { sourceId: c.sourceId, excerpt: excerpt.excerpt, words: excerpt.words }; break; }
        }
        if (!chosen) { failed = researchCategory; break; }
        picks.push(chosen);
      }
      if (failed) {
        needs.push({ index, category: binding.category, target: binding.target, researchCategory: failed,
          reason: 'Brak źródła z batcha z wolnym limitem 25 słów lub osobnym dosłownym fragmentem dla tej kategorii (albo osiągnięto 12 źródeł). Uzupełnij ją jednym wywołaniem z followUpSearch.' });
        drafts.set(index, { ...base, status: 'applied', relationship: REVIEW, evidenceIds: [], supportingExcerpts: [], sourceAssessments: [], reasoning: REVIEW, needsModelAttention: true });
        continue;
      }
      const evidenceIds = [];
      const supportingExcerpts = [];
      for (const pick of picks) {
        let sel = selected.get(pick.sourceId);
        if (!sel) { sel = { id: 'e' + (selected.size + 1), used: new Map(), categories: new Set(), batches: new Set() }; selected.set(pick.sourceId, sel); }
        sel.used.set(norm(pick.excerpt), pick.words);
        const entry = pool.get(pick.sourceId);
        for (const rc of group.researchCategories) if (entry.categoryBatches.has(rc)) { sel.categories.add(rc); for (const b of entry.categoryBatches.get(rc)) sel.batches.add(b); }
        evidenceIds.push(sel.id);
        supportingExcerpts.push({ evidenceId: sel.id, excerpt: pick.excerpt });
      }
      drafts.set(index, { ...base, status: 'applied', relationship: REVIEW, evidenceIds, supportingExcerpts,
        sourceAssessments: evidenceIds.map(evidenceId => ({ evidenceId, reviewedValue: base.value, direction: REVIEW, interventionMatch: REVIEW, outcomeMatch: REVIEW, populationMatch: REVIEW, limitations: REVIEW, rationale: REVIEW })),
        reasoning: REVIEW, ...(binding.value === undefined ? { valueToFill: true } : {}) });
    }
  
    return { selected, needsModelAttention: needs.sort((a, b) => a.index - b.index).map(({ index, ...rest }) => rest), decisionEvidenceDraft: groups.map((_, i) => drafts.get(i)) };
  };
  const natural = groups.map((_, i) => i);
  const rareFirst = [...natural].sort((a, b) => rarity(groups[a]) - rarity(groups[b]) || a - b);
  // Shorter (still 5+ word) excerpts let one source cover more categories within its 25-word limit.
  const strategies = [MAX_EXCERPT_WORDS, MIN_EXCERPT_WORDS + 1].flatMap(words => [[natural, false, words], [natural, true, words], [rareFirst, false, words], [rareFirst, true, words]]);
  const { selected, needsModelAttention, decisionEvidenceDraft } = strategies
    .map(([order, useCoverage, words]) => runSelection(order, useCoverage, words))
    .reduce((best, next) => next.needsModelAttention.length < best.needsModelAttention.length ? next : best);
  const followUpCategories = [...new Set(needsModelAttention.map(n => n.researchCategory))];
  const followUpSearch = followUpCategories.length
    ? { queries: followUpCategories.slice(0, MAX_QUERIES_PER_SEARCH).map(category => ({ category, query: queryContext })), maxResultsPerQuery: MAX_RESULTS_PER_QUERY, broadenEmpty: true }
    : null;
  const evidence = [...selected.entries()].map(([sourceId, sel]) => {
    const { record } = pool.get(sourceId);
    return { id: sel.id, researchSourceId: sourceId, researchBatchIds: [...sel.batches], supports: [...sel.categories].join(', ').slice(0, 240),
      coveredCategories: TRAINING_EVIDENCE_CATEGORIES.filter(c => sel.categories.has(c)), title: record.title, publicationDate: String(record.year ?? ''),
      finding: REVIEW, population: REVIEW, limitations: REVIEW, url: record.url ?? ('https://pubmed.ncbi.nlm.nih.gov/' + sourceId.slice(7) + '/') };
  });
  const sourceHints = [...selected.entries()].map(([sourceId, sel]) => {
    const { record } = pool.get(sourceId);
    return { evidenceId: sel.id, researchSourceId: sourceId, year: record.year ?? null, journal: record.journal ?? null, publicationTypes: record.publicationTypes ?? [],
      populationHint: populationHint(record.abstract), quotedWords: usedWords(sel), abstract: record.abstract };
  });
  const anchorCheck = (() => {
    try {
      const withAbstracts = evidence.map(e => ({ id: e.id, pubmed: { abstract: pool.get(e.researchSourceId).record.abstract } }));
      validateEvidenceExcerptAnchors(decisionEvidenceDraft.filter(d => d.status === 'applied' && d.evidenceIds.length), withAbstracts);
      return { ok: true };
    } catch (error) { return { ok: false, message: error.message }; }
  })();

  return {
    researchBatchIds: batches.map(b => b.batchId),
    searchCount: batches.length,
    queryContext,
    searchedCategories: searchCategories,
    evidence,
    sourceHints,
    decisionEvidenceDraft,
    needsModelAttention,
    ...(followUpSearch ? { followUpSearch } : {}),
    excludedBlockedSources,
    anchorCheck,
    ...(planExercises?.autoAdjustments?.length ? { autoAdjustments: planExercises.autoAdjustments } : {}),
    fieldsToReview: ['evidence[].finding', 'evidence[].population', 'evidence[].limitations', 'decisionEvidenceDraft[].relationship', 'decisionEvidenceDraft[].reasoning', 'decisionEvidenceDraft[].sourceAssessments[].direction/interventionMatch/outcomeMatch/populationMatch/limitations/rationale', 'decisionEvidenceDraft[].value gdy valueToFill=true (wtedy także reviewedValue)'],
    readOnly: true,
    scientificApproval: false,
    nextStep: 'Przeczytaj abstrakty w sourceHints i uzupełnij każde pole REVIEW własną oceną (populationMatch/interventionMatch/outcomeMatch, direction, relationship, limitations, rationale, reasoning oraz finding/population/limitations źródeł); przy braku wsparcia zmień dawkę albo źródło. Nie zmieniaj ani nie dodawaj fragmentów bez sprawdzenia limitu 25 unikalnych słów na źródło i osobnego fragmentu na kategorię. '
      + (followUpSearch
        ? 'Dla kategorii z needsModelAttention wykonaj DOKŁADNIE JEDNO wywołanie gm_coach_search_training_research z argumentami followUpSearch: ' + JSON.stringify(followUpSearch) + '; dobierz z jego wyniku po jednym dosłownym fragmencie na kategorię i nie wykonuj innych wyszukiwań. '
        : 'Wszystkie kategorie mają źródła — nie wykonuj żadnych dodatkowych wyszukiwań gm_coach_search_training_research. ')
      + 'Następnie wyślij evidence i decisionEvidence do speediance_preview_program. Abstrakty potrzebne do oceny są już w sourceHints — nie wywołuj read_training_research_batch, find_research_in_batches ani read_selected_research_abstracts dla tych źródeł; oceń pola REVIEW i od razu wyślij speediance_preview_program z evidence, researchBatchIds i decisionEvidence z paczki.'
  };
}
