import { getReferenceClientRmPresetRules, validateReferenceClientRmLevel } from './program-payload.mjs';

// Jedyna funkcja liczenia słów cytatu: walidator i gm_coach_prepare_evidence_pack używają tego samego kodu.
export const EXCERPT_MIN_WORDS = 5;
export const EXCERPT_MAX_WORDS = 25;
export const SOURCE_MAX_UNIQUE_WORDS = 25;
export function countExcerptWords(text) {
  return String(text ?? '').match(/\S+/gu)?.length ?? 0;
}

export function resolveEvidenceEntryId(exercise) {
  if (!exercise || !Number.isSafeInteger(exercise.id) || exercise.id < 1) throw new Error('Ćwiczenie wymaga dodatniego katalogowego id.');
  const entryId = exercise.entryId ?? exercise.id;
  if (!Number.isSafeInteger(entryId) || entryId < 1) throw new Error('Ćwiczenie wymaga dodatniego bezpiecznego entryId.');
  return entryId;
}

/** Bind exercise-level evidence to the actual catalog entry, never a title-only alias. */
export function exerciseDecisionValue(exercise, category) {
  const entryId = resolveEvidenceEntryId(exercise);
  if (category === 'exercise_dose') {
    if (!Array.isArray(exercise.sets) || exercise.sets.length < 1) throw new Error('Dawkowanie ćwiczenia wymaga serii.');
    return `setCount=${exercise.sets.length}`;
  }
  if (category !== 'exercise_selection') throw new Error(`Nieznana decyzja ćwiczenia: ${category}`);
  if (typeof exercise.title !== 'string' || !exercise.title.trim()) throw new Error('Wybór ćwiczenia wymaga nazwy katalogowej.');
  const section = exercise.section ?? 'main';
  if (!['warmup', 'main', 'stretching'].includes(section)) throw new Error('Nieprawidłowa sekcja ćwiczenia.');
  if (exercise.actionLibraryId !== undefined && (!Number.isSafeInteger(exercise.actionLibraryId) || exercise.actionLibraryId < 1)) throw new Error('Wariant ćwiczenia wymaga dodatniego actionLibraryId.');
  // Tytuł w tej samej postaci co porównanie z katalogiem w podglądzie (trim, pojedyncze spacje, małe litery):
  // derive (tytuł od czatu) i podgląd (nazwa z katalogu) dają identyczną wartość, a zmiana nazwy nadal ją zmienia.
  return JSON.stringify({ catalogId: exercise.id, entryId, title: exercise.title.normalize('NFC').replace(/[\u200b-\u200d\ufeff\u00ad]/gu, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US'),
    ...(exercise.actionLibraryId === undefined ? {} : { actionLibraryId: exercise.actionLibraryId }), section, ...(exercise.trainingGoal===undefined?{}:{trainingGoal:exercise.trainingGoal}) });
}

function normalizeExecutionRef(item) {
  if (item.executionRef === undefined) return {};
  if (!Number.isSafeInteger(item.executionRef) || item.executionRef < 1) throw new Error('executionRef musi być dodatnim bezpiecznym entryId.');
  return { executionRef: item.executionRef };
}

const LIMITS = {
  id: 3,
  researchSourceId: 32,
  rationale: 2000,
  supports: 240,
  supportingExcerpt: 500,
  title: 240,
  publicationDate: 40,
  finding: 1000,
  population: 500,
  limitations: 800,
  url: 500
};

export const TRAINING_EVIDENCE_PLAN_CATEGORIES = Object.freeze([
  'weekly_volume', 'frequency', 'intensity_load', 'rest_intervals', 'exercise_order',
  'warmup', 'progression_rotation', 'recovery_deload', 'supersets', 'resistance_modes',
  'intensity_techniques', 'stretching_mobility', 'timed_exercise', 'post_workout_stretching',
  'nutrition_context', 'recovery_context'
]);
const EXERCISE_DECISION_CATEGORIES = Object.freeze(['exercise_selection', 'exercise_dose']);
const SET_DECISION_CATEGORIES = Object.freeze([
  'set_work_dose', 'set_load', 'set_effort_rir', 'set_resistance_mode', 'set_rest_interval'
]);
const ITEM_DECISION_CATEGORIES = Object.freeze(['warmup_element', 'post_workout_stretching_item']);
const CARDIO_RESEARCH_CATEGORIES = Object.freeze([
  'cardio_exercise_selection', 'cardio_intensity', 'cardio_work_rest'
]);
export const TRAINING_EVIDENCE_CATEGORIES = Object.freeze([
  ...TRAINING_EVIDENCE_PLAN_CATEGORIES,
  ...EXERCISE_DECISION_CATEGORIES,
  ...SET_DECISION_CATEGORIES,
  ...ITEM_DECISION_CATEGORIES,
  ...CARDIO_RESEARCH_CATEGORIES
]);
// These three cardio categories are query/coverage labels, not extra decision
// targets. Keep the decision payload schema restricted to the established set.
const DECISION_CATEGORIES = Object.freeze([
  ...TRAINING_EVIDENCE_PLAN_CATEGORIES,
  ...EXERCISE_DECISION_CATEGORIES,
  ...SET_DECISION_CATEGORIES,
  ...ITEM_DECISION_CATEGORIES
]);
const DECISION_STATUSES = ['applied', 'not_used', 'not_applicable'];
const EVIDENCE_RELATIONSHIPS = ['direct', 'indirect', 'guideline', 'not_applicable'];
const ASSESSMENT_DIRECTIONS = ['supports', 'qualifies', 'contradicts', 'unclear'];
const ASSESSMENT_MATCH_LEVELS = ['direct', 'partial', 'none'];
const ALWAYS_APPLICABLE_PLAN_CATEGORIES = [
  'weekly_volume', 'frequency', 'intensity_load', 'rest_intervals', 'exercise_order',
  'progression_rotation', 'recovery_deload', 'recovery_context'
];

// Research discovery scope only. normalizeEvidenceCoverage and the PubMed gate
// still validate the complete submitted decision/evidence graph independently.
export function deriveScienceResearchScope(plan) {
  if (!plan || !Array.isArray(plan.exercises)) throw new TypeError('Plan wymaga listy ćwiczeń.');
  const required = new Set(ALWAYS_APPLICABLE_PLAN_CATEGORIES);
  const exercises = plan.exercises;
  const cardio = exercises.some(exercise => exercise.loadType === 'cardio');
  const resistance = exercises.some(exercise => exercise.loadType !== 'cardio');
  const timed = exercises.some(exercise => exercise.sets?.some(set => set.unit === 'sec' || set.unit === 'seconds'));
  const specialResistanceMode = exercises.some(exercise => exercise.loadType !== 'cardio' && exercise.sets?.some(set => set.mode === 2 || set.mode === 3));
  if (cardio) {
    required.add('cardio_exercise_selection');
    required.add('cardio_intensity');
    required.add('cardio_work_rest');
  }
  if (resistance) {
    for (const category of ['exercise_selection', 'exercise_dose', 'set_work_dose', 'set_load', 'set_resistance_mode', 'set_rest_interval']) required.add(category);
    if (exercises.some(exercise => exercise.loadType !== 'cardio' && exercise.sets?.some(set => set.rirTarget !== undefined))) required.add('set_effort_rir');
  }
  if (cardio && exercises.some(exercise => exercise.loadType === 'cardio' && exercise.sets?.some(set => set.rirTarget !== undefined))) required.add('set_effort_rir');
  if (!resistance) {
    required.delete('intensity_load');
    required.delete('rest_intervals');
  }
  if (timed && exercises.some(exercise => exercise.loadType !== 'cardio' && exercise.sets?.some(set => set.unit === 'sec' || set.unit === 'seconds'))) required.add('timed_exercise');
  if (specialResistanceMode) required.add('resistance_modes');
  if (plan.supersetBlocks?.length) required.add('supersets');
  if (plan.warmup?.status === 'included') {
    required.add('warmup');
    if (plan.warmup.items?.length) required.add('warmup_element');
  }
  if (plan.postWorkoutStretching?.status === 'included') {
    required.add('post_workout_stretching');
    required.add('stretching_mobility');
    if (plan.postWorkoutStretching.items?.length) required.add('post_workout_stretching_item');
  }
  for (const decision of plan.decisionEvidence ?? []) {
    if (decision.status !== 'applied') continue;
    if (['nutrition_context', 'resistance_modes', 'stretching_mobility'].includes(decision.category)) required.add(decision.category);
  }
  return TRAINING_EVIDENCE_CATEGORIES.filter(category => required.has(category));
}
// Intensity techniques have no dedicated payload field. Drop sets, reverse
// drops and rest-pause/cluster structures are executable only when they are
// expressed as consecutive set rows of one exercise with a short rest; the
// decision value is derived from those rows. Supersets are allowed only through
// the explicit, same-setup block structure.
const UNSERIALIZED_TECHNIQUE_CATEGORIES = Object.freeze(['intensity_techniques']);
const SET_ROW_TECHNIQUE_LABELS = Object.freeze(['drop-set', 'rest-pause', 'cluster set', 'myo-reps']);
const SET_ROW_DROP_MAX_REST_SECONDS = 15;
const SET_ROW_CLUSTER_MAX_REST_SECONDS = 30;

/**
 * Derive the set-row representation of intensity techniques. A pair of
 * consecutive rep rows of the same exercise (same side) separated by a short
 * rest forms: drop-set (more reps or lower explicit kg; Smart RM picks a lighter
 * load), reverse-drop-set (fewer reps or higher kg) or rest-pause-cluster
 * (same target). Returns 'not_used' when no such rows exist.
 */
export function deriveSetRowTechniqueValue(exercises = [], supersetBlocks = []) {
  const supersetMembers = new Set((supersetBlocks || []).flatMap((block) => (block?.members || []).map((member) => member?.exerciseId)));
  const parts = [];
  for (const exercise of exercises || []) {
    if (!exercise || exercise.loadType === 'cardio' || supersetMembers.has(resolveEvidenceEntryId(exercise)) || !Array.isArray(exercise.sets)) continue;
    let run = null;
    const flush = () => { if (run) parts.push(`${resolveEvidenceEntryId(exercise)}:${run.kind}@${run.start}-${run.end}`); run = null; };
    for (let index = 0; index < exercise.sets.length - 1; index += 1) {
      const current = exercise.sets[index];
      const next = exercise.sets[index + 1];
      const rest = current?.restSeconds ?? current?.rest;
      const repRows = [current, next].every((set) => (set?.unit === 'reps' || set?.unit === undefined) && Number.isSafeInteger(set?.reps));
      if (!repRows || (current.side ?? null) !== (next.side ?? null) || !Number.isInteger(rest)) { flush(); continue; }
      const kgCurrent = current.weightKg;
      const kgNext = next.weightKg;
      const kgKnown = Number.isFinite(kgCurrent) && Number.isFinite(kgNext);
      let kind = null;
      if (rest <= SET_ROW_DROP_MAX_REST_SECONDS) {
        if ((kgKnown && kgNext < kgCurrent) || (!kgKnown && next.reps > current.reps)) kind = 'drop-set';
        else if ((kgKnown && kgNext > kgCurrent) || (!kgKnown && next.reps < current.reps)) kind = 'reverse-drop-set';
      }
      if (!kind && rest <= SET_ROW_CLUSTER_MAX_REST_SECONDS && next.reps === current.reps && (!kgKnown || kgNext === kgCurrent)) kind = 'rest-pause-cluster';
      if (!kind) { flush(); continue; }
      if (run && run.kind === kind && run.end === index + 1) run.end = index + 2;
      else { flush(); run = { kind, start: index + 1, end: index + 2 }; }
    }
    flush();
  }
  return parts.length ? `set-rows:${parts.join(';')}` : 'not_used';
}
const UNSERIALIZED_TECHNIQUE_TERMS = Object.freeze([
  { label: 'superseria/superset', pattern: /(?<![\p{L}\p{N}_])superser\p{L}*(?![\p{L}\p{N}_])|\bsuper[ -]?ser\p{L}*\b|\bsupersets?\b|\bpaired[ -]?sets?\b|\bgiant[ -]?set\p{L}*\b|\btri[ -]?set\p{L}*\b|\bcompound[ -]?set\p{L}*\b/giu },
  { label: 'drop-set', pattern: /\bdrop[ -]?set\p{L}*\b|\bmechanical[ -]?drop[ -]?sets?\b|\bser(?:ie|ii|ię|iami)\s+(?:drop|zrzutow\p{L}*)\b/giu },
  { label: 'rest-pause', pattern: /\brest[ -]?pause\p{L}*\b|\brest[ -]?pauz\p{L}*\b/giu },
  { label: 'cluster set', pattern: /\bcluster[ -]?sets?\b|\bserie\s+klastrow\p{L}*\b/giu },
  { label: 'myo-reps', pattern: /\bmyo[ -]?reps?\b/giu },
  { label: 'powtórzenia wymuszone', pattern: /\bforced[ -]?reps?\b|\bpowtórzeni\p{L}*\s+wymuszon\p{L}*\b/giu },
  { label: 'powtórzenia częściowe', pattern: /\bpartial[ -]?reps?\b|\bpartial[ -]?range[ -]?reps?\b|\bpowtórzeni\p{L}*\s+częściow\p{L}*\b/giu },
  { label: 'przeciążenie ekscentryczne/negatywy', pattern: /\b(?:accentuated[ -]?eccentric\w*|eccentric(?:ally)?[ -]+(?:overload\w*|accentuat\w*|only)|negative[ -]?reps?\b|\bnegatyw\p{L}*\b|\btryb\s+eccentr\p{L}*)/giu },
  { label: 'tempo/pauzowane powtórzenia', pattern: /\btempo\b|\btime\s+under\s+tension\b|\bpaused?\s+reps?\b|\bpauzowan\p{L}*\s+powtórzeni\p{L}*\b|\bpowtórzeni\p{L}*\s+z\s+pauz\p{L}*\b/giu }
]);
const POLISH_EXECUTION_CUE = /\b(?:wykonaj|wykonuj|zastosuj|stosuj|użyj|uzyj|zrób|zrob|rób|rob|dodaj|dołóż|doluz|połącz|polacz|łącz|lacz|włącz|wlacz|zaplanuj|zaplanow\p{L}*|uwzględnij)\b/giu;
const ENGLISH_IMPERATIVE_AT_CLAUSE_START = /^(?:please\s+|then\s+|now\s+)?(?:perform|apply|add|pair|combine|schedule|program|use)\b/iu;
const PLAN_SUBJECT = /\b(?:ten\s+plan|w\s+tym\s+planie|w\s+planie|plan\s+treningowy|this\s+plan|in\s+this\s+plan|the\s+(?:training\s+)?plan|this\s+workout|the\s+workout)\b/giu;
const PLAN_USAGE_VERB = /\b(?:zawiera|uwzględnia|stosuje|używa|uzywa|powinien\s+(?:stosować|zastosować|uwzględnić|używać)|includes?|contains?|uses?|has|will\s+(?:use|include|contain)|should\s+(?:use|include|contain)|must\s+(?:use|include|contain))\b/giu;
const CLAUSE_NEGATION = /\b(?:nie|bez|not|never|no|don't|doesn't|didn't|won't|cannot|can't|shouldn't|mustn't)\b/iu;

function requiredText(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${field} musi być niepustym tekstem o długości do ${maxLength} znaków.`);
  }
  return value.trim();
}

export function normalizeTrainingEvidence(rationale, sources, { allowEmpty = false } = {}) {
  const normalizedRationale = requiredText(rationale, 'Uzasadnienie planu', LIMITS.rationale);
  if (!Array.isArray(sources) || sources.length < (allowEmpty ? 0 : 1) || sources.length > 12) {
    throw new Error(`Podaj od ${allowEmpty ? 0 : 1} do 12 źródeł naukowych wspierających plan (otrzymano ${Array.isArray(sources) ? sources.length : 'brak listy'}). Pole evidence to lista 1–12 rzeczywistych źródeł z bieżących batchy gm_coach_search_training_research (id np. e1, researchSourceId, researchBatchIds, coveredCategories); jest oddzielne od decisionEvidence, które tylko wskazuje te źródła przez evidenceIds.`);
  }

  const evidence = sources.map((source, index) => {
    const prefix = `Źródło ${index + 1}`;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new Error(`${prefix}: wymagane są dane źródła.`);
    }
    const id = requiredText(source.id, `${prefix}: ID`, LIMITS.id);
    if (!/^e(?:[1-9]|1[0-2])$/.test(id)) throw new Error(`${prefix}: ID musi mieć format e1–e12.`);
    const researchSourceId = requiredText(source.researchSourceId, `${prefix}: PubMed ID`, LIMITS.researchSourceId);
    if (!/^pubmed:\d{1,12}$/.test(researchSourceId)) throw new Error(`${prefix}: wymagany jest identyfikator PubMed w formacie pubmed:<PMID>.`);
    if (!Array.isArray(source.researchBatchIds) || source.researchBatchIds.length < 1 || source.researchBatchIds.length > 8) {
      throw new Error(`${prefix}: researchBatchIds musi zawierać od 1 do 8 identyfikatorów świeżego wyszukiwania GM Coach.`);
    }
    const researchBatchIds = source.researchBatchIds.map((batchId) => {
      const normalized = requiredText(batchId, `${prefix}: identyfikator batcha`, 36);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
        throw new Error(`${prefix}: identyfikator batcha musi być UUID zwróconym przez wyszukiwanie GM Coach.`);
      }
      return normalized;
    });
    if (new Set(researchBatchIds).size !== researchBatchIds.length) throw new Error(`${prefix}: researchBatchIds zawiera powtórzone identyfikatory.`);
    const supports = requiredText(source.supports, `${prefix}: czego dotyczy`, LIMITS.supports);
    if (!Array.isArray(source.coveredCategories) || source.coveredCategories.length < 1 || source.coveredCategories.length > TRAINING_EVIDENCE_CATEGORIES.length) {
      throw new Error(`${prefix}: coveredCategories musi zawierać od 1 do ${TRAINING_EVIDENCE_CATEGORIES.length} kategorii badań.`);
    }
    // Duplikaty kategorii nie zmieniają zakresu źródła: deduplikujemy zamiast blokować.
    const coveredCategories = [...new Set(source.coveredCategories)];
    if (coveredCategories.some((category) => typeof category !== 'string' || !TRAINING_EVIDENCE_CATEGORIES.includes(category))) {
      throw new Error(`${prefix}: coveredCategories zawiera nieobsługiwaną kategorię badań.`);
    }
    const title = requiredText(source.title, `${prefix}: tytuł`, LIMITS.title);
    const publicationDate = requiredText(source.publicationDate, `${prefix}: data publikacji`, LIMITS.publicationDate);
    const finding = requiredText(source.finding, `${prefix}: wynik`, LIMITS.finding);
    const population = requiredText(source.population, `${prefix}: populacja`, LIMITS.population);
    const limitations = requiredText(source.limitations, `${prefix}: ograniczenia`, LIMITS.limitations);
    const rawUrl = requiredText(source.url, `${prefix}: URL`, LIMITS.url);
    let parsedUrl;
    try { parsedUrl = new URL(rawUrl); }
    catch { throw new Error(`${prefix}: URL musi być poprawnym adresem HTTPS.`); }
    if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname || parsedUrl.username || parsedUrl.password) {
      throw new Error(`${prefix}: dozwolone są wyłącznie bezpieczne adresy HTTPS bez danych logowania.`);
    }
    return {
      id,
      researchSourceId,
      researchBatchIds,
      supports,
      coveredCategories,
      title,
      publicationDate,
      finding,
      population,
      limitations,
      url: parsedUrl.href
    };
  });

  const ids = evidence.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error('ID źródeł muszą być unikalne.');
  const pubmedIds = evidence.map(({ researchSourceId }) => researchSourceId);
  if (new Set(pubmedIds).size !== pubmedIds.length) {
    throw new Error('Ten sam rekord PubMed występuje więcej niż raz. Połącz jego kategorie i batch ID w jednym źródle, aby nie liczyć jednej publikacji jako kilku.');
  }

  return { rationale: normalizedRationale, evidence };
}

export function normalizeEvidencePlanItems(warmup, postWorkoutStretching) {
  return {
    warmup: normalizePlanItemSection(warmup, 'Rozgrzewka', {
      itemFields: ['kind', 'activity', 'dosage', 'targetExerciseIds', 'executionRef'],
      normalizeItem(item, index) {
        if (!['general', 'dynamic_mobility', 'ramp_up_set', 'skill_rehearsal'].includes(item.kind)) {
          throw new Error(`Rozgrzewka ${index + 1}: kind musi być general, dynamic_mobility, ramp_up_set albo skill_rehearsal.`);
        }
        let targetExerciseIds;
        if (item.targetExerciseIds !== undefined) {
          if (!Array.isArray(item.targetExerciseIds) || item.targetExerciseIds.length > 30 || item.targetExerciseIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
            throw new Error(`Rozgrzewka ${index + 1}: targetExerciseIds musi być listą dodatnich ID ćwiczeń.`);
          }
          targetExerciseIds = [...new Set(item.targetExerciseIds)];
          if (targetExerciseIds.length !== item.targetExerciseIds.length) {
            throw new Error(`Rozgrzewka ${index + 1}: targetExerciseIds zawiera powtórzone ID.`);
          }
        }
        return {
          ...normalizeExecutionRef(item),
          kind: item.kind,
          activity: requiredText(item.activity, `Rozgrzewka ${index + 1}: aktywność`, 100),
          dosage: requiredText(item.dosage, `Rozgrzewka ${index + 1}: dawkowanie`, 100),
          ...(targetExerciseIds === undefined ? {} : { targetExerciseIds })
        };
      }
    }),
    postWorkoutStretching: normalizePlanItemSection(postWorkoutStretching, 'Rozciąganie po treningu', {
      itemFields: ['target', 'method', 'dosage', 'instructions', 'executionRef'],
      normalizeItem(item, index) {
        if (!['static', 'dynamic', 'pnf'].includes(item.method)) {
          throw new Error(`Rozciąganie ${index + 1}: method musi być static, dynamic albo pnf.`);
        }
        return {
          ...normalizeExecutionRef(item),
          target: requiredText(item.target, `Rozciąganie ${index + 1}: obszar docelowy`, 80),
          method: item.method,
          dosage: requiredText(item.dosage, `Rozciąganie ${index + 1}: dawkowanie`, 80),
          instructions: requiredText(item.instructions, `Rozciąganie ${index + 1}: instrukcja`, 100)
        };
      }
    })
  };
}

/**
 * Enforces the user's explicit warmup/stretching preference against the typed
 * plan sections. This checks recorded preference values only; it cannot prove
 * that a supplied answer was actually stated by the user in the conversation.
 */
export function assertPlanSectionPreferences(plan, preferences = {}) {
  const sections = [
    { key: 'warmup', label: 'rozgrzewkę', preferenceKey: 'warmupPreference' },
    { key: 'postWorkoutStretching', label: 'rozciąganie po treningu', preferenceKey: 'stretchingPreference' }
  ];

  for (const { key, label, preferenceKey } of sections) {
    const section = plan?.[key];
    const preference = preferences?.[preferenceKey];
    if (section?.status === 'omitted_user_preference' && preference !== 'no') {
      throw new Error(`Plan zablokowany — ${label} można pominąć tylko przy jawnie zapisanej preferencji ${preferenceKey}=no; obecny profil lub odpowiedzi tego nie potwierdzają.`);
    }
    if (section?.status === 'included' && preference === 'no') {
      throw new Error(`Plan zablokowany — profil lub odpowiedzi zawierają ${preferenceKey}=no, więc ${label} należy pominąć zgodnie z życzeniem użytkownika.`);
    }
  }
}

function normalizePlanItemSection(value, label, { itemFields, normalizeItem }) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !['included', 'omitted_user_preference'].includes(value.status) || !Array.isArray(value.items)) {
    throw new Error(`${label}: wymagany jest status included albo omitted_user_preference oraz lista items.`);
  }
  if (value.items.length > 30) throw new Error(`${label}: lista items może zawierać maksymalnie 30 pozycji.`);
  for (const field of Object.keys(value)) {
    if (!['status', 'omissionReason', 'items'].includes(field)) throw new Error(`${label}: nieobsługiwane pole ${field}.`);
  }
  if (value.status === 'included' && value.items.length === 0) {
    throw new Error(`${label}: status included wymaga co najmniej jednego elementu. Napraw: dodaj pozycje do items albo, jeśli użytkownik nie chce tej sekcji, ustaw status omitted_user_preference, items=[] i omissionReason.`);
  }
  if (value.status === 'omitted_user_preference' && value.items.length !== 0) {
    throw new Error(`${label}: po rezygnacji użytkownika lista items musi być pusta.`);
  }
  if (value.status === 'omitted_user_preference') {
    return {
      status: value.status,
      omissionReason: requiredText(value.omissionReason, `${label}: powód pominięcia`, 240),
      items: []
    };
  }
  if (value.omissionReason !== undefined) throw new Error(`${label}: omissionReason wolno podać tylko przy jawnym pominięciu przez użytkownika.`);
  const items = value.items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${label} ${index + 1}: wymagany jest obiekt elementu.`);
    for (const field of Object.keys(item)) {
      if (!itemFields.includes(field)) throw new Error(`${label} ${index + 1}: nieobsługiwane pole ${field}.`);
    }
    return normalizeItem(item, index);
  });
  return { status: 'included', items };
}

/** Creates a stable evidence value for the structured, same-setup superset blocks. */
function formatSupersetEvidenceValue(supersetBlocks, exercises) {
  if (!Array.isArray(supersetBlocks)) {
    throw new TypeError('supersetBlocks musi być listą jawnych bloków superserii.');
  }
  if (supersetBlocks.length > 3) throw new Error('Plan może zawierać maksymalnie 3 bloki superserii.');
  const exerciseIds = new Set(exercises.map(resolveEvidenceEntryId));
  const exerciseById = new Map(exercises.map(exercise => [resolveEvidenceEntryId(exercise), exercise]));
  const mainExerciseIds = new Set(exercises.filter(exercise => (exercise.section ?? 'main') === 'main').map(resolveEvidenceEntryId));
  const seenMemberIds = new Set();
  return supersetBlocks.map((block, index) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      throw new Error(`Superseria ${index + 1}: wymagany jest kanoniczny obiekt bloku.`);
    }
    const declaresSetup = Object.hasOwn(block, 'setupDeclarationVersion') || Object.hasOwn(block, 'setupDeclarationStatus');
    if (declaresSetup && (block.setupDeclarationVersion !== 1 || block.setupDeclarationStatus !== 'caller-declared-unverified' ||
        typeof block.setupKey !== 'string' || !/^[A-Za-z0-9._:-]{1,80}$/.test(block.setupKey))) {
      throw new Error(`Superseria ${index + 1}: niepoprawna wersja lub status deklaracji ustawienia.`);
    }
    if (typeof block.setupKey !== 'string' || !block.setupKey.trim() || /[;+|=]/u.test(block.setupKey)) {
      throw new Error(`Superseria ${index + 1}: setupKey musi być niepustym kluczem bez separatorów mapowania (znaki ; + | = są zabronione). Napraw: użyj np. "station-a" albo "bench_cable-low" i tego samego klucza w powiązaniach.`);
    }
    if (!Number.isSafeInteger(block.rounds) || block.rounds < 1 || block.rounds > 100 ||
        !Number.isSafeInteger(block.transitionRestSeconds) || block.transitionRestSeconds < 0 ||
        !Number.isSafeInteger(block.recoveryRestSeconds) || block.recoveryRestSeconds < 0) {
      throw new Error(`Superseria ${index + 1}: podaj poprawne rundy, przerwę przejściową i przerwę regeneracyjną.`);
    }
    if (!Array.isArray(block.members) || block.members.length < 2) {
      throw new Error(`Superseria ${index + 1}: blok wymaga co najmniej dwóch ćwiczeń.`);
    }
    if (!Array.isArray(block.steps) || block.steps.length === 0) {
      throw new Error(`Superseria ${index + 1}: wymagane są kroki wykonania bloku.`);
    }
    const memberIds = block.members.map((member, memberIndex) => {
      if (!member || typeof member !== 'object' || Array.isArray(member) ||
          !Number.isSafeInteger(member.exerciseId) || !exerciseIds.has(member.exerciseId) || !mainExerciseIds.has(member.exerciseId) ||
          (declaresSetup
            ? typeof member.setupKey !== 'string' || !/^[A-Za-z0-9._:-]{1,80}$/.test(member.setupKey) ||
              (member.setupKey !== block.setupKey && !(member.setupKey === 'mat-only' && exerciseById.get(member.exerciseId)?.loadType === 'bodyweight')) ||
              (member.setupKey === 'mat-only' && exerciseById.get(member.exerciseId)?.loadType !== 'bodyweight')
            : member.setupKey !== block.setupKey)) {
        throw new Error(`Superseria ${index + 1}, element ${memberIndex + 1}: ćwiczenie musi należeć do planu i używać tego samego setupKey.`);
      }
      if (seenMemberIds.has(member.exerciseId)) {
        throw new Error(`Superseria: ćwiczenie ${member.exerciseId} nie może należeć do więcej niż jednego bloku.`);
      }
      seenMemberIds.add(member.exerciseId);
      return member.exerciseId;
    });
    if (new Set(memberIds).size !== memberIds.length) {
      throw new Error(`Superseria ${index + 1}: ćwiczenie nie może powtarzać się w jednym bloku.`);
    }
    if (declaresSetup && !block.members.some(member => member.setupKey === block.setupKey)) {
      throw new Error(`Superseria ${index + 1}: setupKey bloku nie odpowiada deklaracji żadnego elementu.`);
    }
    const legacyValue = `SS${index + 1}:${memberIds.join('+')}:${block.rounds}:${block.transitionRestSeconds}:${block.recoveryRestSeconds}`;
    return declaresSetup
      ? `${legacyValue}:declared-unverified-v1:${block.setupKey}:${block.members.map(member => `${member.exerciseId}@${member.setupKey}`).join('+')}`
      : legacyValue;
  }).join('|');
}

/**
 * Sprawdza kompletność mapowań, ich konkretne wartości, kategorie źródeł i
 * obecność krótkich fragmentów do późniejszej walidacji względem abstraktów.
 * Nie ocenia semantycznie, czy publikacja rzeczywiście popiera twierdzenie.
 */
export function deriveExpectedEvidenceBindings(exercises, warmup, postWorkoutStretching, supersetBlocks = [], recoveryContext = null) {
  if (!Array.isArray(exercises)) throw new Error('Plan wymaga listy ćwiczeń do kontroli powiązań ze źródłami.');
  if (new Set(exercises.map(resolveEvidenceEntryId)).size !== exercises.length) throw new Error('Rozwiązane entryId ćwiczeń muszą być unikalne.');
  const supersetValue = formatSupersetEvidenceValue(supersetBlocks, exercises);
  const normalizedPlanItems = normalizeEvidencePlanItems(warmup, postWorkoutStretching);
  warmup = normalizedPlanItems.warmup;
  postWorkoutStretching = normalizedPlanItems.postWorkoutStretching;

  const expected = new Map();
  const addExpected = (item) => expected.set(`${item.category}:${item.target}`, item);
  const cardioExercises = exercises.filter((exercise) => exercise?.loadType === 'cardio');
  const resistanceExercises = exercises.filter((exercise) => exercise?.loadType !== 'cardio');
  const timedExercises = exercises.filter((exercise) => exercise.sets?.some((set) => set?.unit === 'sec' || set?.unit === 'seconds'));
  const planResearchCategories = (category) => {
    if (category === 'intensity_load') {
      return [
        ...(cardioExercises.length ? ['cardio_intensity'] : []),
        ...(resistanceExercises.length ? ['intensity_load'] : [])
      ];
    }
    if (category === 'rest_intervals') {
      return [
        ...(cardioExercises.length ? ['cardio_work_rest'] : []),
        ...(resistanceExercises.length ? ['rest_intervals'] : [])
      ];
    }
    if (category === 'timed_exercise') {
      return [
        ...(timedExercises.some((exercise) => exercise.loadType === 'cardio') ? ['cardio_work_rest'] : []),
        ...(timedExercises.some((exercise) => exercise.loadType !== 'cardio') ? ['timed_exercise'] : [])
      ];
    }
    return [category];
  };
  const exerciseResearchCategories = (category, exercise) => {
    if (exercise.loadType !== 'cardio') return [category];
    if (category === 'exercise_selection') return ['cardio_exercise_selection'];
    if (category === 'exercise_dose') return ['cardio_work_rest'];
    return [category];
  };
  const setResearchCategories = (category, exercise) => {
    if (exercise.loadType !== 'cardio') return [category];
    if (category === 'set_load') return ['cardio_intensity'];
    if (category === 'set_work_dose' || category === 'set_rest_interval') return ['cardio_work_rest'];
    // Cardio has no selectable resistance mode in the current serializer: the
    // only writable value is Standard (mode 1). The chosen aerobic modality
    // (e.g. Row/Ski), intensity, and work/rest dose are evidenced separately.
    if (category === 'set_resistance_mode') return [];
    return [category];
  };
  for (const category of TRAINING_EVIDENCE_PLAN_CATEGORIES) {
    if (category === 'recovery_context') {
      addExpected({category,target:'plan',requiredStatus:'applied',researchCategories:['recovery_context'],...(recoveryContext ? {value:`status=${recoveryContext.status};contextDigest=${recoveryContext.contextDigest}`} : {})});
    } else if (category === 'supersets') {
      addExpected(supersetBlocks.length
        ? { category, target: 'plan', value: supersetValue, requiredStatus: 'applied' }
        : { category, target: 'plan', value: 'not_used', requiredStatus: 'not_used' });
    } else if (UNSERIALIZED_TECHNIQUE_CATEGORIES.includes(category)) {
      const setRowValue = deriveSetRowTechniqueValue(exercises, supersetBlocks);
      addExpected(setRowValue === 'not_used'
        ? { category, target: 'plan', value: 'not_used', requiredStatus: 'not_used' }
        : { category, target: 'plan', value: setRowValue, requiredStatus: 'applied', researchCategories: [category] });
    } else {
      addExpected({
        category,
        target: 'plan',
        researchCategories: planResearchCategories(category),
        ...(ALWAYS_APPLICABLE_PLAN_CATEGORIES.includes(category) ? { requiredStatus: 'applied' } : {})
      });
    }
  }

  for (const exercise of exercises) {
    if (!exercise || !Number.isSafeInteger(exercise.id) || exercise.id < 1) {
      throw new Error('Każde ćwiczenie musi mieć dodatnie ID.');
    }
    for (const category of EXERCISE_DECISION_CATEGORIES) {
      addExpected({
        category,
        target: `exercise:${resolveEvidenceEntryId(exercise)}`,
        value: exerciseDecisionValue(exercise, category),
        requiredStatus: 'applied',
        researchCategories: exerciseResearchCategories(category, exercise)
      });
    }
    if (!Array.isArray(exercise.sets) || exercise.sets.length < 1) {
      throw new Error(`Ćwiczenie ${exercise.id} musi zawierać serie do kontroli dowodów.`);
    }
    exercise.sets.forEach((set, setIndex) => {
      if (!set || typeof set !== 'object' || Array.isArray(set)) {
        throw new Error(`Ćwiczenie ${exercise.id}, seria ${setIndex + 1}: nieprawidłowy obiekt serii.`);
      }
      const target = `set:${resolveEvidenceEntryId(exercise)}:${setIndex + 1}`;
      if (set.unit !== 'reps' && Object.hasOwn(set, 'rirTarget')) {
        throw new Error(`Ćwiczenie ${exercise.id}: RIR oznacza zapas powtórzeń i wymaga unit=reps.`);
      }
      for (const category of SET_DECISION_CATEGORIES) {
        if (category === 'set_effort_rir' && set.rirTarget === undefined) continue;
        addExpected({
          category,
          target,
          value: setDecisionValue(exercise, set, category),
          researchCategories: setResearchCategories(category, exercise),
          requiredStatus: category === 'set_resistance_mode' && exercise.loadType === 'cardio'
            ? 'not_applicable'
            : 'applied'
        });
      }
    });
  }
  if (new Set(exercises.map(resolveEvidenceEntryId)).size !== exercises.length) {
    throw new Error('Rozwiązane entryId ćwiczeń muszą być unikalne; użyj odrębnych entryId dla powtórzonych ćwiczeń katalogowych.');
  }

  const exerciseIds = new Set(exercises.map(resolveEvidenceEntryId));
  warmup.items.forEach((item, itemIndex) => {
    if (item.targetExerciseIds?.some((id) => !exerciseIds.has(id))) {
      throw new Error(`Rozgrzewka ${itemIndex + 1}: targetExerciseIds wskazuje ćwiczenie spoza planu.`);
    }
    addExpected({
    category: 'warmup_element',
    target: `warmup:${itemIndex + 1}`,
    value: `${item.kind} — ${requiredText(item.activity, `Rozgrzewka ${itemIndex + 1}: aktywność`, 100)} — ${requiredText(item.dosage, `Rozgrzewka ${itemIndex + 1}: dawkowanie`, 100)}`,
    requiredStatus: 'applied'
    });
  });
  postWorkoutStretching.items.forEach((item, itemIndex) => addExpected({
    category: 'post_workout_stretching_item',
    target: `stretch:${itemIndex + 1}`,
    value: `${requiredText(item.target, `Rozciąganie ${itemIndex + 1}: obszar docelowy`, 80)} — ${requiredText(item.method, `Rozciąganie ${itemIndex + 1}: metoda`, 40)} — ${requiredText(item.dosage, `Rozciąganie ${itemIndex + 1}: dawkowanie`, 80)} — ${requiredText(item.instructions, `Rozciąganie ${itemIndex + 1}: instrukcja`, 100)}`,
    requiredStatus: 'applied'
  }));
  return [...expected.values()].map(item => ({ ...item, researchCategories: item.researchCategories ?? [item.category] }));
}

export function normalizeEvidenceCoverage(evidence, coverage, exercises, warmup, postWorkoutStretching, supersetBlocks = [], recoveryContext = null) {
  if (!Array.isArray(evidence) || !Array.isArray(coverage) || !Array.isArray(exercises)) {
    throw new Error('Plan wymaga źródeł, decisionEvidence oraz listy ćwiczeń do kontroli powiązań ze źródłami.');
  }
  const normalizedPlanItems = normalizeEvidencePlanItems(warmup, postWorkoutStretching);
  warmup = normalizedPlanItems.warmup;
  postWorkoutStretching = normalizedPlanItems.postWorkoutStretching;
  const expected = new Map(deriveExpectedEvidenceBindings(exercises, warmup, postWorkoutStretching, supersetBlocks, recoveryContext).map(item => [`${item.category}:${item.target}`, item]));
  coverage = fillServerBoundDecisionValues(coverage, expected, ['recovery_context']);
  const derivation = deriveCategoryDecisionEvidence(coverage, expected);
  coverage = derivation.coverage;
  if (coverage.length !== expected.size) {
    const supplied = new Set(coverage.filter(item => item && typeof item === 'object').map(item => `${item.category}:${item.target}`));
    const missing = [...expected].filter(([key]) => !supplied.has(key));
    const unexpected = [...supplied].filter(key => !expected.has(key));
    const sample = missing.slice(0, 20).map(([key, item]) => item.value === undefined ? key : `${key}=${item.value}`);
    const emptyHint = coverage.length === 0 ? ' decisionEvidence jest puste: wywołaj gm_coach_derive_evidence_bindings i podaj po jednej decyzji dla każdej zwróconej kategorii (category, target, value, status); nieużyte techniki jako not_used/not_applicable bez źródeł.' : '';
    const badTargets = coverage.filter(item => item && typeof item === 'object' && (typeof item.target !== 'string' || !/^(plan|exercise:[1-9]\d*|set:[1-9]\d*:[1-9]\d*|warmup:[1-9]\d*|stretch:[1-9]\d*)$/.test(item.target))).map(item => String(item.target));
    const formatHint = badTargets.length ? ` Nieprawidłowy format target: ${[...new Set(badTargets)].slice(0, 5).join(', ')}. Dozwolone: plan, exercise:<entryId>, set:<entryId>:<seria>, warmup:<N>, stretch:<N> (np. stretch:1, nie stretching:1).` : '';
    throw scienceCoverageError(`decisionEvidence musi zawierać dokładnie ${expected.size} mapowań dla planu, ćwiczeń, serii i uwzględnionych elementów rozgrzewki/rozciągania; otrzymano ${coverage.length}, brak ${missing.length}, nadmiarowych ${unexpected.length}. Brakujące (pierwsze 20): ${sample.join(' | ') || 'brak'}. Nadmiarowe (pierwsze 10): ${unexpected.slice(0, 10).join(' | ') || 'brak'}. Wystarczy jedna decyzja na kategorię (bez nadmiarowych par); pozostałe mapowania serwer wyprowadzi sam.${emptyHint}${formatHint}`, coverage, expected);

  }

  const normalized = normalizeExpectedEvidenceDecisions(evidence, coverage, expected);
  const usesTimedSets = exercises.some((exercise) => exercise.sets.some((set) => set.unit === 'sec' || set.unit === 'seconds'));
  const timedDecision = normalized.find((item) => item.category === 'timed_exercise' && item.target === 'plan');
  if (usesTimedSets && timedDecision.status !== 'applied') {
    throw new Error('Plan zawiera serie czasowe; decyzja timed_exercise musi mieć status applied i źródło.');
  }
  if (!usesTimedSets && timedDecision.status !== 'not_applicable') {
    throw new Error('Oznacz timed_exercise jako not_applicable, gdy plan nie zawiera serii czasowych.');
  }
  validatePlanItemDecision(normalized, 'warmup', warmup, 'Rozgrzewka');
  validatePlanItemDecision(normalized, 'post_workout_stretching', postWorkoutStretching, 'Rozciąganie po treningu');
  DERIVED_DECISION_COUNTS.set(normalized, derivation.derivedCount);
  return normalized;
}

/**
 * Enforces the explicit plan-level nutrition-context decision against the
 * locally audited intake state. This is a structural rule, not a semantic
 * judgment that the cited study supports the training choice.
 */
export function assertNutritionContextEvidence(decisionEvidence, requirement) {
  if (!Array.isArray(decisionEvidence)) {
    throw new TypeError('Plan do kontroli kontekstu żywieniowego musi zawierać listę decisionEvidence.');
  }
  if (!requirement || !['known', 'unknown'].includes(requirement.status)) {
    throw new TypeError('Audyt profilu musi określić, czy kontekst żywieniowy jest znany.');
  }
  const decisions = decisionEvidence.filter((item) => item?.category === 'nutrition_context' && item?.target === 'plan');
  if (decisions.length !== 1) {
    throw new Error('Plan wymaga dokładnie jednej decyzji nutrition_context dla całego planu.');
  }
  const decision = decisions[0];
  if (requirement.status === 'known') {
    if (decision.status !== 'applied') {
      throw new Error('Kontekst kalorii, bilansu i trendu masy jest znany; nutrition_context musi mieć status applied, źródło z kategorii nutrition_context i sourceAssessments dla każdego cytowanego źródła.');
    }
    if (!decision.evidenceIds?.length || !decision.supportingExcerpts?.length || !decision.sourceAssessments?.length) {
      throw new Error('Zastosowana decyzja nutrition_context wymaga źródła, cytatu i sourceAssessments dla każdego źródła oraz konkretnej wartości.');
    }
    return;
  }
  if (decision.status !== 'not_applicable') {
    throw new Error('Kontekst kalorii, bilansu lub trendu masy jest nieznany albo użytkownik odmówił; nutrition_context musi mieć status not_applicable bez źródeł i sourceAssessments.');
  }
  if (decision.evidenceIds?.length || decision.supportingExcerpts?.length || decision.sourceAssessments || decision.relationship !== 'not_applicable') {
    throw new Error('Decyzja nutrition_context not_applicable nie może zawierać źródeł, cytatów ani sourceAssessments.');
  }
  if (typeof decision.reasoning !== 'string' || !decision.reasoning.trim() || decision.reasoning.length > 240) {
    throw new Error('Decyzja nutrition_context not_applicable wymaga krótkiego powodu (maksymalnie 240 znaków).');
  }
}

/**
 * Fail closed for techniques that the current Speediance program schema cannot
 * serialize. This is a lexical guard against explicit execution instructions,
 * not a semantic parser: it cannot guarantee detection of every paraphrase.
 * Scientific discussion of a technique remains allowed when it is clearly
 * explanatory rather than an instruction to perform it.
 */
export function assertNoUnserializedTechniqueInstructions({
  planName = '',
  rationale = '',
  exercises = [],
  warmup,
  postWorkoutStretching,
  decisionEvidence = [],
  supersetBlocks = [],
  requireDecisionEvidence = true
} = {}) {
  if (!Array.isArray(exercises) || !Array.isArray(decisionEvidence) || !Array.isArray(supersetBlocks)) {
    throw new TypeError('Plan do kontroli technik musi zawierać listy ćwiczeń i decisionEvidence.');
  }

  const planDecisions = new Map(decisionEvidence
    .filter((item) => UNSERIALIZED_TECHNIQUE_CATEGORIES.includes(item?.category) && item?.target === 'plan')
    .map((item) => [item.category, item]));
  if (requireDecisionEvidence) {
    for (const category of UNSERIALIZED_TECHNIQUE_CATEGORIES) {
      const decision = planDecisions.get(category);
      if (!decision || decision.status !== 'not_used' || decision.value !== 'not_used') {
        throw new Error(`Plan zablokowany — ${category} musi mieć wartość i status not_used. Obecny zapis Speediance nie potrafi zapisać tej techniki jako wykonywalnej struktury programu.`);
      }
    }
  }

  const executionFields = [
    ['nazwa programu', planName],
    ...exercises.map((exercise, index) => [`tytuł ćwiczenia ${index + 1}`, exercise?.title]),
    ...(warmup?.items || []).flatMap((item, index) => [
      [`rozgrzewka ${index + 1}`, item?.activity],
      [`dawkowanie rozgrzewki ${index + 1}`, item?.dosage]
    ]),
    ...(postWorkoutStretching?.items || []).flatMap((item, index) => [
      [`rozciąganie ${index + 1}`, item?.target],
      [`instrukcja rozciągania ${index + 1}`, item?.instructions],
      [`dawkowanie rozciągania ${index + 1}`, item?.dosage]
    ])
  ];
  for (const [field, value] of executionFields) {
    const mention = findUnserializedTechniqueMention(value, { supersetsSerialized: supersetBlocks.length > 0 });
    if (mention) throw unserializedTechniqueError(field, mention.label);
  }

  const explanatoryFields = [
    ['uzasadnienie planu', rationale],
    ...decisionEvidence.flatMap((item, index) => [
      [`wartość decyzji ${index + 1}`, item?.value],
      [`uzasadnienie decyzji ${index + 1}`, item?.reasoning],
      ...((item?.sourceAssessments || []).map((assessment, assessmentIndex) => [
        `ocena semantyczna decyzji ${index + 1}, źródło ${assessmentIndex + 1}`,
        assessment?.rationale
      ]))
    ])
  ];
  for (const [field, value] of explanatoryFields) {
    const mention = findUnserializedTechniqueInstruction(value, { supersetsSerialized: supersetBlocks.length > 0 });
    if (mention) throw unserializedTechniqueError(field, mention.label);
  }
}

function findUnserializedTechniqueInstruction(value, { supersetsSerialized = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) return null;
  for (const sentence of value.split(/(?<=[.!?;\n])\s+/u)) {
    for (const { label, pattern } of UNSERIALIZED_TECHNIQUE_TERMS) {
      if (supersetsSerialized && label === 'superseria/superset') continue;
      const matches = [...sentence.matchAll(new RegExp(pattern.source, pattern.flags))];
      if (!matches.length) continue;
      if (hasAffirmativePlanUsage(sentence, matches)) return { label };
      if (hasAffirmativeExecutionCue(sentence, matches)) return { label };
    }
  }
  return null;
}

function hasAffirmativePlanUsage(sentence, techniqueMatches) {
  const planSubjectMatches = [...sentence.matchAll(new RegExp(PLAN_SUBJECT.source, PLAN_SUBJECT.flags))];
  const verbs = [...sentence.matchAll(new RegExp(PLAN_USAGE_VERB.source, PLAN_USAGE_VERB.flags))];
  return planSubjectMatches.some((subject) => verbs.some((verb) => {
    const verbStart = verb.index ?? 0;
    const verbEnd = verbStart + verb[0].length;
    const subjectStart = subject.index ?? 0;
    const subjectEnd = subjectStart + subject[0].length;
    if (subjectEnd > verbStart || verbStart - subjectEnd > 80 || hasNearbyNegation(sentence, verbStart, verbEnd)) return false;
    return techniqueMatches.some((mention) => {
      const mentionStart = mention.index ?? 0;
      return mentionStart >= verbEnd && mentionStart - verbEnd <= 80;
    });
  }));
}

function hasAffirmativeExecutionCue(sentence, techniqueMatches) {
  const polishCues = [...sentence.matchAll(new RegExp(POLISH_EXECUTION_CUE.source, POLISH_EXECUTION_CUE.flags))];
  const englishClauses = sentence.split(/(?<=[,:])\s+/u);
  const englishCues = [];
  let offset = 0;
  for (const clause of englishClauses) {
    const match = ENGLISH_IMPERATIVE_AT_CLAUSE_START.exec(clause.trim());
    if (match) {
      const trimOffset = clause.length - clause.trimStart().length;
      englishCues.push({ index: offset + trimOffset, 0: match[0] });
    }
    offset += clause.length + (sentence.slice(offset + clause.length).match(/^[,:]\s*/u)?.[0].length ?? 0);
  }
  return [...polishCues, ...englishCues].some((cue) => {
    const cueStart = cue.index ?? 0;
    const cueEnd = cueStart + cue[0].length;
    if (hasNearbyNegation(sentence, cueStart, cueEnd)) return false;
    return techniqueMatches.some((mention) => {
      const mentionStart = mention.index ?? 0;
      return mentionStart >= cueEnd && mentionStart - cueEnd <= 100;
    });
  });
}

function hasNearbyNegation(sentence, cueStart, cueEnd) {
  const before = sentence.slice(Math.max(0, cueStart - 35), cueStart);
  const after = sentence.slice(cueEnd, cueEnd + 35);
  return /\b(?:nie|not|never|no|don't|doesn't|didn't|won't|cannot|can't|shouldn't|mustn't)\b[^,;:.!?]{0,24}$/iu.test(before) ||
    /^\s*(?:nie|not|never|without|no)\b/iu.test(after) ||
    CLAUSE_NEGATION.test(before.slice(Math.max(0, before.lastIndexOf(','), before.lastIndexOf(';'), before.lastIndexOf(':'))));
}

function findUnserializedTechniqueMention(value, { supersetsSerialized = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) return null;
  for (const { label, pattern } of UNSERIALIZED_TECHNIQUE_TERMS) {
    if (supersetsSerialized && label === 'superseria/superset') continue;
    if (new RegExp(pattern.source, pattern.flags).test(value)) return { label };
  }
  return null;
}

function unserializedTechniqueError(field, technique) {
  return new Error(`Plan zablokowany — ${field} zawiera wykonawczą wzmiankę o ${technique}. Zapisany program GM nie ma pola do zakodowania superserii ani tej techniki; usuń ją z wykonywalnego planu. Wyjaśnienie naukowe bez instrukcji wykonania jest dozwolone.`);
}

function normalizeDecisionSourceAssessments(value, prefix, reviewedValue, status, relationship, evidenceIds) {
  if (status === 'not_applicable') {
    if (value !== undefined && !(Array.isArray(value) && value.length === 0)) throw new Error(`${prefix}: decyzja not_applicable nie może zawierać sourceAssessments.`);
    return undefined;
  }
  if (value === undefined) {
    if (status === 'applied') throw new Error(`${prefix}: zastosowana decyzja wymaga sourceAssessments z osobną oceną dla każdego evidenceId.`);
    if (evidenceIds.length) {
      throw new Error(`${prefix}: cytowane źródła wymagają sourceAssessments — dokładnie jednej osobnej oceny dla każdego evidenceId, także dla decyzji not_used.`);
    }
    return undefined;
  }
  if (!evidenceIds.length && status !== 'applied') return undefined;
  if (!Array.isArray(value) || value.length > 12) {
    throw new Error(`${prefix}: sourceAssessments musi być listą do 12 osobnych ocen źródeł.`);
  }
  if (value.length !== evidenceIds.length) {
    throw new Error(`${prefix}: sourceAssessments musi zawierać dokładnie jedną ocenę dla każdego evidenceId.`);
  }
  if (!evidenceIds.length) {
    throw new Error(`${prefix}: sourceAssessments nie może istnieć bez cytowanych evidenceIds.`);
  }

  const fields = [
    'evidenceId', 'reviewedValue', 'direction', 'interventionMatch', 'outcomeMatch',
    'populationMatch', 'limitations', 'rationale'
  ];
  const assessmentByEvidenceId = new Map();
  for (const [index, item] of value.entries()) {
    const assessmentPrefix = `${prefix}, sourceAssessments[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`${assessmentPrefix}: wymagana jest osobna ocena źródła.`);
    }
    if (Object.keys(item).some((field) => !fields.includes(field))) {
      throw new Error(`${assessmentPrefix}: sourceAssessment zawiera nieobsługiwane pole.`);
    }
    for (const field of fields) {
      if (!Object.hasOwn(item, field)) throw new Error(`${assessmentPrefix}: sourceAssessment wymaga pola ${field}.`);
    }
    const evidenceId = requiredText(item.evidenceId, `${assessmentPrefix}: evidenceId`, LIMITS.id);
    if (!evidenceIds.includes(evidenceId)) {
      throw new Error(`${assessmentPrefix}: evidenceId musi wskazywać źródło z evidenceIds tej decyzji.`);
    }
    if (assessmentByEvidenceId.has(evidenceId)) {
      throw new Error(`${assessmentPrefix}: sourceAssessments zawiera powtórzoną ocenę dla ${evidenceId}.`);
    }
    const normalized = {
      evidenceId,
      reviewedValue: requiredText(item.reviewedValue, `${assessmentPrefix}: reviewedValue`, 300),
      direction: item.direction,
      interventionMatch: item.interventionMatch,
      outcomeMatch: item.outcomeMatch,
      populationMatch: item.populationMatch,
      limitations: requiredText(item.limitations, `${assessmentPrefix}: limitations`, 600),
      rationale: requiredText(item.rationale, `${assessmentPrefix}: rationale`, 600)
    };
    if (normalized.reviewedValue !== reviewedValue) {
      throw new Error(`${assessmentPrefix}: reviewedValue musi dokładnie odpowiadać wartości decyzji.`);
    }
    if (!ASSESSMENT_DIRECTIONS.includes(normalized.direction)) {
      throw new Error(`${assessmentPrefix}: direction musi mieć wartość supports, qualifies, contradicts albo unclear.`);
    }
    if (!ASSESSMENT_MATCH_LEVELS.includes(normalized.interventionMatch) ||
        !ASSESSMENT_MATCH_LEVELS.includes(normalized.outcomeMatch) ||
        !ASSESSMENT_MATCH_LEVELS.includes(normalized.populationMatch)) {
      throw new Error(`${assessmentPrefix}: dopasowanie interwencji, wyniku i populacji musi mieć wartość direct, partial albo none.`);
    }
    if (status === 'applied') {
      if (normalized.direction === 'contradicts' || normalized.direction === 'unclear') {
        throw new Error(`${assessmentPrefix}: plan zablokowany — źródło ${evidenceId} ma kierunek ${normalized.direction}; nie może być maskowane oceną innego źródła.`);
      }
      const matches = [normalized.interventionMatch, normalized.outcomeMatch, normalized.populationMatch];
      if (matches.includes('none')) {
        throw new Error(`${assessmentPrefix}: plan zablokowany — źródło ${evidenceId} nie znajduje dopasowania do interwencji, wyniku lub populacji.`);
      }
      if (matches.includes('partial') && (normalized.direction !== 'qualifies' || relationship === 'direct')) {
        throw new Error(`${assessmentPrefix}: częściowe dopasowanie wymaga direction=qualifies i relationship=indirect albo guideline. Otrzymano direction=${normalized.direction}, relationship=${relationship}. Napraw: przy partial ustaw direction=qualifies, relationship decyzji indirect albo guideline i opisz ograniczenie; przy pełnym dopasowaniu wszystkich trzech pól użyj full.`);
      }
    }
    assessmentByEvidenceId.set(evidenceId, normalized);
  }

  const missingEvidenceId = evidenceIds.find((evidenceId) => !assessmentByEvidenceId.has(evidenceId));
  if (missingEvidenceId) {
    throw new Error(`${prefix}: brakuje sourceAssessment dla evidenceId ${missingEvidenceId}; ocena jednego źródła nie może obejmować pozostałych.`);
  }
  return evidenceIds.map((evidenceId) => assessmentByEvidenceId.get(evidenceId));
}

/**
 * Confirms that each cited evidence excerpt is present in the canonical
 * PubMed abstract attached by the MCP server. This is an exact-text and
 * provenance guard only; it cannot judge whether the abstract supports the
 * mapped training decision.
 */
export function validateEvidenceExcerptAnchors(decisionEvidence, evidence) {
  if (!Array.isArray(decisionEvidence) || !Array.isArray(evidence)) {
    throw new Error('Weryfikacja fragmentów wymaga mapowań decyzji i kanonicznych źródeł PubMed.');
  }
  const sourceById = new Map(evidence.map((source) => [source.id, source]));
  // One validation invocation only; cache current abstract text, never approval.
  const normalizedAbstractById = new Map();
  const uniqueQuotesBySource = new Map();
  const categoriesByExcerptAnchor = new Map();
  const appliedDecisionAnchors = [];

  for (const decision of decisionEvidence) {
    if (!Array.isArray(decision?.supportingExcerpts)) {
      throw new Error(`Decyzja ${decision?.category ?? 'nieznana'} (${decision?.target ?? 'nieznany cel'}): brak supportingExcerpts.`);
    }
    for (const item of decision.supportingExcerpts) {
      const source = sourceById.get(item?.evidenceId);
      const abstract = source?.pubmed?.abstract;
      if (!source || typeof abstract !== 'string' || !abstract.trim()) {
        throw new Error(`Decyzja ${decision.category} (${decision.target}): abstrakt ${item?.evidenceId ?? 'źródła'} nie jest dostępny w zweryfikowanym batchu PubMed.`);
      }
      const normalizedExcerpt = normalizeExcerptForMatch(item.excerpt);
      let cachedAbstract = normalizedAbstractById.get(item.evidenceId);
      if (!cachedAbstract || cachedAbstract.raw !== abstract) {
        cachedAbstract = { raw: abstract, normalized: normalizeExcerptForMatch(abstract) };
        normalizedAbstractById.set(item.evidenceId, cachedAbstract);
      }
      if (!normalizedExcerpt || !cachedAbstract.normalized.includes(normalizedExcerpt)) {
        throw new Error(`Decyzja ${decision.category} (${decision.target}): supportingExcerpt dla ${item.evidenceId} nie jest dokładnym fragmentem jego abstraktu PubMed.`);
      }
      let quotes = uniqueQuotesBySource.get(item.evidenceId);
      if (!quotes) {
        quotes = new Map();
        uniqueQuotesBySource.set(item.evidenceId, quotes);
      }
      quotes.set(normalizedExcerpt, countExcerptWords(item.excerpt));
      if (decision.status === 'applied') {
        const anchor = `${item.evidenceId}\u0000${normalizedExcerpt}`;
        const categories = categoriesByExcerptAnchor.get(anchor) || new Set();
        categories.add(decision.category);
        categoriesByExcerptAnchor.set(anchor, categories);
      }
    }
    if (decision.status === 'applied') {
      appliedDecisionAnchors.push({
        category: decision.category,
        target: decision.target,
        anchors: decision.supportingExcerpts.map((item) => `${item.evidenceId}\u0000${normalizeExcerptForMatch(item.excerpt)}`)
      });
    }
  }

  for (const decision of appliedDecisionAnchors) {
    const hasCategorySpecificAnchor = decision.anchors.some((anchor) => categoriesByExcerptAnchor.get(anchor)?.size === 1);
    if (!hasCategorySpecificAnchor) {
      const shared = [...new Set(decision.anchors.flatMap((anchor) => [...(categoriesByExcerptAnchor.get(anchor) || [])]).filter((category) => category !== decision.category))];
      throw new Error(`Decyzja ${decision.category} (${decision.target}): co najmniej jeden zweryfikowany fragment musi być osobnym wsparciem tej kategorii; ten sam fragment nie może być jej jedynym wsparciem razem z inną kategorią.${shared.length ? ` Fragmenty tej decyzji są użyte także w: ${shared.join(', ')}.` : ''} Napraw: dodaj inny dosłowny fragment (z tego lub innego źródła z batcha) użyty wyłącznie dla ${decision.category}, mieszcząc się w limicie 25 słów na źródło.`);
    }
  }

  for (const [sourceId, quotes] of uniqueQuotesBySource) {
    const totalWords = [...quotes.values()].reduce((total, count) => total + count, 0);
    if (totalWords > SOURCE_MAX_UNIQUE_WORDS) throw new Error(`Źródło ${sourceId}: łączna liczba unikalnych cytowanych słów przekracza limit 25 (obecnie ${totalWords} w ${quotes.size} różnych fragmentach). Napraw: powtarzaj identyczny fragment tam, gdzie wystarcza (liczy się raz), skróć fragmenty do co najmniej 5 słów albo cytuj inne źródło z batcha dla części kategorii.`);
  }
}

function normalizeExcerptForMatch(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC')
    .replace(/[\u2010-\u2015\u2212]/gu, '-')
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u201c\u201d]/gu, '"')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

function validatePlanItemDecision(coverage, category, planItems, label) {
  const decision = coverage.find((item) => item.category === category && item.target === 'plan');
  const expectedStatus = planItems.status === 'included' ? 'applied' : 'not_applicable';
  if (!decision || decision.status !== expectedStatus) {
    throw new Error(`${label}: status decyzji planu musi być ${expectedStatus} zgodnie z wyborem użytkownika.`);
  }
  if (expectedStatus === 'not_applicable' && decision.reasoning.length > 240) {
    throw new Error(`${label}: krótko uzasadnij pominięcie (maks. 240 znaków).`);
  }
}

// Jedna gotowa decyzja na kategorię z dokładnymi category/target/value/status z powiązań.
// not_used/not_applicable są kompletne poza reasoning; applied wymaga uzupełnienia pól REVIEW prawdziwymi źródłami.
export function buildDecisionSkeleton(bindings) {
  const seen = new Set();
  const out = [];
  for (const binding of bindings ?? []) {
    if (!binding || seen.has(binding.category)) continue;
    seen.add(binding.category);
    const status = binding.requiredStatus ?? 'applied';
    out.push({ category: binding.category, target: binding.target, ...(binding.value === undefined ? { value: 'REVIEW' } : { value: binding.value }), status,
      relationship: status === 'applied' ? 'REVIEW' : 'not_applicable', evidenceIds: [], supportingExcerpts: [], sourceAssessments: [], reasoning: 'REVIEW' });
  }
  return out;
}

// Shared structural and per-source semantic declaration gate. Fresh PubMed
// verification and actual cycle derivation remain the caller's responsibility.
function scienceCoverageError(message, coverage, expected, scope = 'session') {
  const supplied = new Set(Array.isArray(coverage) ? coverage.filter(item => item && typeof item === 'object' && typeof item.category === 'string' && typeof item.target === 'string').map(item => item.category + ':' + item.target) : []);
  const missing = [...expected].filter(([key]) => !supplied.has(key)).map(([, item]) => ({ category: item.category, target: item.target }));
  const decisionSkeleton = buildDecisionSkeleton([...expected.values()].filter(item => !supplied.has(item.category + ':' + item.target)));
  const scienceDiagnostics = {
    version: 1, code: 'GM_COACH_SCIENCE_COVERAGE_INCOMPLETE', scope,
    missingCategories: [...new Set(missing.map(item => item.category))],
    missingBindingCount: missing.length, missingBindings: missing.slice(0, 100),
    bindingsTruncated: missing.length > 100, authorizesMutation: false,
    repair: { action: 'supply_missing_scientific_decisions', bindingTool: 'gm_coach_derive_evidence_bindings',
      oneReviewedDecisionPerCategory: true, retainExistingSourcesAndDecisions: true, decisionSkeleton,
      requiresActualSourcesExcerptsAndAssessments: true, neverInventEvidence: true,
      nextStep: 'Complete only the listed categories using actual reviewed sources, then repeat the same preview/preparation. This error does not authorize a write or waive science.' }
  };
  return Object.assign(new Error(message), { code: scienceDiagnostics.code, scienceDiagnostics });
}
function normalizeExpectedEvidenceDecisions(evidence, coverage, expected) {
  if (!Array.isArray(evidence) || !Array.isArray(coverage) || coverage.length !== expected.size) {
    throw scienceCoverageError(`decisionEvidence requires exactly ${expected.size} decisions.`, coverage, expected);
  }
  const sourceById = new Map(evidence.map((source) => [source.id, source]));
  const seen = new Set();
  const normalized = coverage.map((original, index) => {
    let item = original;
    const prefix = `Decyzja ${index + 1}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${prefix}: wymagany jest obiekt decyzji.`);
    if (!DECISION_CATEGORIES.includes(item.category)) throw new Error(`${prefix}: nieobsługiwana kategoria decyzji.`);
    if (typeof item.target !== 'string' || !/^(plan|exercise:[1-9]\d*|set:[1-9]\d*:[1-9]\d*|warmup:[1-9]\d*|stretch:[1-9]\d*)$/.test(item.target)) {
      throw new Error(`${prefix}: target ma nieprawidłowy format. Dozwolone: plan, exercise:<entryId>, set:<entryId>:<seria>, warmup:<N>, stretch:<N> (np. stretch:1, nie stretching:1).`);
    }
    const key = `${item.category}:${item.target}`;
    if (!expected.has(key)) throw new Error(`${prefix}: nieoczekiwana para category/target (${key}).`);
    const required = expected.get(key);
    // recovery_context (plan) is a server-resolved declaration, not a model decision: a stale value copied from an
    // earlier resolve is replaced by the exact current binding instead of failing the scientific check.
    const recoveryStatus = value => /(?:^|;)status=([^;]*)/.exec(String(value ?? ''))?.[1] ?? null;
    if (item.category === 'recovery_context' && item.target === 'plan' && required.value !== undefined && item.value !== required.value &&
      recoveryStatus(item.value) !== null && recoveryStatus(item.value) === recoveryStatus(required.value)) {
      item = { ...item, value: required.value, ...(Array.isArray(item.sourceAssessments) ? { sourceAssessments: item.sourceAssessments.map(assessment => assessment && typeof assessment === 'object' ? { ...assessment, reviewedValue: required.value } : assessment) } : {}) };
    }
    if (required.requiredStatus && item.status !== required.requiredStatus) {
      throw new Error(`${prefix}: decyzja ${item.category} (${item.target}) musi mieć status ${required.requiredStatus}.`);
    }
    if (seen.has(key)) throw new Error(`${prefix}: powtórzona decyzja ${key}.`);
    seen.add(key);
    if (!DECISION_STATUSES.includes(item.status)) throw new Error(`${prefix}: status musi mieć wartość applied, not_used albo not_applicable.`);
    if (!EVIDENCE_RELATIONSHIPS.includes(item.relationship)) throw new Error(`${prefix}: relationship musi mieć wartość direct, indirect, guideline albo not_applicable.`);
    const reasoning = requiredText(item.reasoning, `${prefix}: uzasadnienie`, 600);
    const value = requiredText(item.value, `${prefix}: wartość mapowanej decyzji`, 300);
    if (required.value !== undefined && value !== required.value) {
      let selectionDetail = '';
      if (item.category === 'exercise_selection') {
        const fields = ['catalogId', 'entryId', 'title', 'actionLibraryId', 'section', 'trainingGoal'];
        let differing = null;
        try {
          const given = JSON.parse(value), wanted = JSON.parse(required.value);
          if (given && wanted && typeof given === 'object' && typeof wanted === 'object') {
            differing = [...new Set([...Object.keys(wanted), ...Object.keys(given)])].filter(key => JSON.stringify(given[key]) !== JSON.stringify(wanted[key]));
          }
        } catch { differing = null; }
        selectionDetail = ` Wartość exercise_selection to JSON z polami: ${fields.join(', ')}.` + (differing === null ? ' Nie udało się porównać pól (wartość nie jest poprawnym obiektem JSON).' : differing.length ? ` Różniące się klucze: ${differing.join(', ')}.` : ' Klucze są zgodne; różni się kolejność lub format JSON.');
      }
      const expectedDecision = { category: item.category, target: item.target, value: required.value };
      throw Object.assign(new Error(`${prefix}: wartość nie odpowiada znormalizowanej wartości ${item.category} (${item.target}); zaktualizuj mapowanie po zmianie planu. Napraw: wywołaj ponownie gm_coach_derive_evidence_bindings dla aktualnego planu i skopiuj value/target (oraz reviewedValue) bez zmian.${selectionDetail} Oczekiwane (skopiuj 1:1 do value i reviewedValue, bez ponownego derive): ${JSON.stringify(expectedDecision)}.`), { guardCode: 'science_decision_mismatch', guardDetails: { expectedDecision } });
    }
    if (Object.hasOwn(item, 'semanticAssessment')) {
      throw new Error(`${prefix}: stare pole semanticAssessment zostało zastąpione przez sourceAssessments z osobną oceną dla każdego evidenceId.`);
    }
    if (!Array.isArray(item.evidenceIds) || item.evidenceIds.length > 12 || item.evidenceIds.some((id) => typeof id !== 'string')) {
      throw new Error(`${prefix}: evidenceIds musi być listą do 12 ID źródeł.`);
    }
    const refs = [...new Set(item.evidenceIds)];
    if (refs.length !== item.evidenceIds.length) throw new Error(`${prefix}: evidenceIds zawiera powtórzone ID.`);
    for (const id of refs) {
      const source = sourceById.get(id);
      if (!source) throw new Error(`${prefix}: odwołanie do nieistniejącego źródła ${id}.`);
    }
    if (item.status === 'applied' && !refs.length) {
      throw new Error(`${prefix}: decyzja zastosowana lub rozważona wymaga co najmniej jednego źródła.`);
    }
    const requiredResearchCategories = required.researchCategories ?? [item.category];
    if (refs.length) {
      const missingCategory = requiredResearchCategories.find((category) =>
        !refs.some((id) => sourceById.get(id).coveredCategories.includes(category))
      );
      if (missingCategory) {
        if (requiredResearchCategories.length === 1 && refs.length === 1) {
          throw new Error(`${prefix}: źródło ${refs[0]} nie deklaruje obsługi kategorii ${missingCategory}.`);
        }
        throw new Error(`${prefix}: cytowane źródła nie deklarują obsługi kategorii ${missingCategory}.`);
      }
      for (const id of refs) {
        const source = sourceById.get(id);
        if (!requiredResearchCategories.some((category) => source.coveredCategories.includes(category))) {
          throw new Error(`${prefix}: źródło ${id} nie deklaruje obsługi wymaganych kategorii ${requiredResearchCategories.join(', ')}.`);
        }
      }
    }
    const sourceAssessments = normalizeDecisionSourceAssessments(
      item.sourceAssessments,
      prefix,
      value,
      item.status,
      item.relationship,
      refs
    );

    if (!Array.isArray(item.supportingExcerpts) || item.supportingExcerpts.length > 12) {
      throw new Error(`${prefix}: supportingExcerpts musi zawierać krótkie fragmenty abstraktu dla cytowanych źródeł.`);
    }
    const supportingExcerpts = item.supportingExcerpts.map((excerpt, excerptIndex) => {
      const excerptPrefix = `${prefix}, fragment ${excerptIndex + 1}`;
      if (!excerpt || typeof excerpt !== 'object' || Array.isArray(excerpt) || Object.keys(excerpt).some((field) => !['evidenceId', 'excerpt'].includes(field))) {
        throw new Error(`${excerptPrefix}: wymagane są wyłącznie evidenceId i excerpt.`);
      }
      const evidenceId = requiredText(excerpt.evidenceId, `${excerptPrefix}: evidenceId`, LIMITS.id);
      if (!refs.includes(evidenceId)) throw new Error(`${excerptPrefix}: evidenceId nie występuje w evidenceIds tej decyzji.`);
      const text = requiredText(excerpt.excerpt, `${excerptPrefix}: excerpt`, LIMITS.supportingExcerpt);
      const wordCount = countExcerptWords(text);
      if (wordCount < EXCERPT_MIN_WORDS || wordCount > EXCERPT_MAX_WORDS) throw new Error(`${excerptPrefix}: fragment musi zawierać 5–25 słów (otrzymano ${wordCount}). Napraw: wybierz dłuższy lub krótszy dosłowny fragment abstraktu; nie parafrazuj.`);
      return { evidenceId, excerpt: text };
    });
    if (new Set(supportingExcerpts.map(({ evidenceId }) => evidenceId)).size !== supportingExcerpts.length) {
      throw new Error(`${prefix}: supportingExcerpts zawiera powtórzone evidenceId.`);
    }

    const isNotApplicable = item.status === 'not_applicable';
    if (isNotApplicable || (item.status === 'not_used' && !refs.length)) {
      if (refs.length || supportingExcerpts.length || item.relationship !== 'not_applicable') {
        throw new Error(`${prefix}: decyzja bez źródeł wymaga pustych evidenceIds i supportingExcerpts oraz relationship=not_applicable.`);
      }
      if (isNotApplicable) {
        const explicitlyUnavailableSetDecision = required.requiredStatus === 'not_applicable';
        if (item.category === 'exercise_selection' || item.category === 'exercise_dose' ||
            (SET_DECISION_CATEGORIES.includes(item.category) && !explicitlyUnavailableSetDecision) || ITEM_DECISION_CATEGORIES.includes(item.category)) {
          throw new Error(`${prefix}: mapowanie ćwiczenia, serii i uwzględnionego elementu nie może być not_applicable.`);
        }
        if (ALWAYS_APPLICABLE_PLAN_CATEGORIES.includes(item.category)) {
          throw new Error(`${prefix}: decyzja ${item.category} zawsze dotyczy planu i nie może być not_applicable.`);
        }
      }
    } else if (!refs.length || item.relationship === 'not_applicable') {
      throw new Error(`${prefix}: decyzja zastosowana lub rozważona wymaga co najmniej jednego źródła i relacji direct, indirect albo guideline.`);
    } else if (supportingExcerpts.length !== refs.length || refs.some((id) => !supportingExcerpts.some((excerpt) => excerpt.evidenceId === id))) {
      throw new Error(`${prefix}: każde cytowane źródło musi mieć dokładnie jeden supportingExcerpt do sprawdzenia w abstrakcie PubMed.`);
    }
    if ((item.category === 'exercise_selection' || item.category === 'exercise_dose') && item.target === 'plan') {
      throw new Error(`${prefix}: ${item.category} musi wskazywać konkretne ćwiczenie.`);
    }
    if ((item.category === 'exercise_selection' || item.category === 'exercise_dose') && item.status !== 'applied') {
      throw new Error(`${prefix}: dobór i dawkowanie istniejącego ćwiczenia muszą mieć status applied.`);
    }
    if (EXERCISE_DECISION_CATEGORIES.includes(item.category) && !item.target.startsWith('exercise:')) {
      throw new Error(`${prefix}: ${item.category} musi wskazywać konkretne ćwiczenie.`);
    }
    if (SET_DECISION_CATEGORIES.includes(item.category) && !item.target.startsWith('set:')) {
      throw new Error(`${prefix}: ${item.category} musi wskazywać konkretną serię.`);
    }
    if (item.category === 'warmup_element' && !item.target.startsWith('warmup:')) {
      throw new Error(`${prefix}: warmup_element musi wskazywać konkretny element rozgrzewki.`);
    }
    if (item.category === 'post_workout_stretching_item' && !item.target.startsWith('stretch:')) {
      throw new Error(`${prefix}: post_workout_stretching_item musi wskazywać konkretny element rozciągania.`);
    }
    if (TRAINING_EVIDENCE_PLAN_CATEGORIES.includes(item.category) && item.target !== 'plan') {
      throw new Error(`${prefix}: kategoria ${item.category} musi dotyczyć całego planu.`);
    }
    return {
      category: item.category,
      target: item.target,
      value,
      status: item.status,
      relationship: item.relationship,
      evidenceIds: refs,
      supportingExcerpts,
      ...(sourceAssessments ? { sourceAssessments } : {}),
      reasoning
    };
  });

  for (const [key, item] of expected) {
    if (!seen.has(key)) throw scienceCoverageError(`Brak powiązania naukowego dla decyzji ${item.category} (${item.target}).`, coverage, expected);
  }
  return normalized;
}

/**
 * Expands category-level scientific decisions into every required binding.
 * A missing binding is derived only from an explicit decision supplied for the
 * same category with the required status; its sources, excerpts, assessments
 * and reasoning are copied unchanged and only target/value (and reviewedValue)
 * are replaced by the server-derived binding. Explicit mappings take precedence.
 * Categories without any template stay blocking with one message.
 */
const DERIVED_DECISION_COUNTS = new WeakMap();
/** Number of mappings derived by the server for a normalized decision list (0 when unknown). */
export function derivedDecisionCount(normalized) {
  return DERIVED_DECISION_COUNTS.get(normalized) ?? 0;
}

export function deriveCategoryDecisionEvidence(
coverage, expected) {
  if (!Array.isArray(coverage) || !coverage.length || !(expected instanceof Map)) return { coverage, derivedCount: 0 };
  const supplied = new Set(coverage.filter(item => item && typeof item === 'object').map(item => `${item.category}:${item.target}`));
  if (supplied.size !== coverage.length || [...supplied].some(key => !expected.has(key))) return { coverage, derivedCount: 0 };
  const derived = [];
  const missingCategories = new Set();
  for (const [key, required] of expected) {
    if (supplied.has(key)) continue;
    const template = coverage.find(item => item.category === required.category &&
      (!required.requiredStatus || item.status === required.requiredStatus));
    if (!template) { missingCategories.add(required.category); continue; }
    const value = required.value ?? template.value;
    const clone = structuredClone(template);
    clone.target = required.target;
    clone.value = value;
    if (Array.isArray(clone.sourceAssessments)) clone.sourceAssessments = clone.sourceAssessments.map(item => item && typeof item === 'object' ? { ...item, reviewedValue: value } : item);
    derived.push(clone);
  }
  if (missingCategories.size) {
    throw scienceCoverageError(`Brak oceny naukowej dla kategorii: ${[...missingCategories].join(', ')}. Podaj po jednej decyzji dla każdej brakującej kategorii według statusu z powiązań. Applied wymaga rzeczywistych źródeł, cytatów i ocen. Nieużyte not_used/not_applicable wymagają jawnej decyzji, relationship=not_applicable, pustych evidenceIds/supportingExcerpts/sourceAssessments i reasoning; bez wyszukiwania. Serwer rozwinie pozostałe cele kategorii z dokładnie wyliczonymi wartościami. Szkielet brakujących decyzji (skopiuj, uzupełnij REVIEW): ${JSON.stringify(buildDecisionSkeleton([...expected.values()].filter(item => missingCategories.has(item.category))))}`, coverage, expected);
  }
  return { coverage: derived.length ? [...coverage, ...derived] : coverage, derivedCount: derived.length };
}

export const TRAINING_CYCLE_EVIDENCE_CATEGORIES = Object.freeze([
  'weekly_volume', 'frequency', 'progression_rotation', 'recovery_deload'
]);

/** Validate declarations against server-derived cycle facts; never grants approval. */
export function normalizeCycleEvidenceCoverage(evidence, coverage, bindingValues) {
  if (!bindingValues || typeof bindingValues !== 'object' || Array.isArray(bindingValues) ||
      Object.keys(bindingValues).length !== TRAINING_CYCLE_EVIDENCE_CATEGORIES.length) {
    throw new Error('Cycle evidence requires exact derived bindingValues.');
  }
  const expected = new Map();
  let digest;
  for (const category of TRAINING_CYCLE_EVIDENCE_CATEGORIES) {
    const value = bindingValues[category];
    const match = typeof value === 'string' && value.length <= 300 && value.match(/^cyclePrescription=([a-f0-9]{64});category=([a-z_]+)(;scope=main-only;whole=unverified;nonMainIncrease=(?:true|false);nonMainUnknown=(?:true|false);comparison=[a-f0-9]{64}|;accessories=[a-f0-9]{64};setup=unknown;benefit=unverified)?$/);
    if (match?.[3]?.startsWith(';scope=') && category !== 'recovery_deload') throw new Error('Deload scope binding belongs only to recovery_deload.');
    if (match?.[3]?.startsWith(';accessories=') && category !== 'progression_rotation') throw new Error('Accessory scope binding belongs only to progression_rotation.');
    if (!match || match[2] !== category || (digest && digest !== match[1])) {
      throw new Error('Invalid or inconsistent derived cycle binding.');
    }
    digest = match[1];
    expected.set(`${category}:plan`, { category, target: 'plan', value, requiredStatus: 'applied' });
  }
  const missingCycleCategories = Array.isArray(coverage) ? TRAINING_CYCLE_EVIDENCE_CATEGORIES.filter(category => !coverage.some(item => item?.category === category)) : [];
  if (missingCycleCategories.length) throw scienceCoverageError(`Cycle evidence requires exactly ${expected.size} decisions (one per category); missing categories: ${missingCycleCategories.join(', ')}.`, coverage, expected, 'cycle');
  return normalizeExpectedEvidenceDecisions(evidence, fillServerBoundDecisionValues(coverage, expected, TRAINING_CYCLE_EVIDENCE_CATEGORIES), expected);

}

/** Insert exact server-owned plan-level binding values (target/value/reviewedValue) for single decisions of the given categories. */
export function fillServerBoundDecisionValues(coverage, expected, categories) {
  if (!Array.isArray(coverage) || !(expected instanceof Map)) return coverage;
  return coverage.map(item => {
    if (!item || typeof item !== 'object' || !categories.includes(item.category)) return item;
    if (coverage.filter(other => other?.category === item.category).length !== 1) return item;
    const required = expected.get(`${item.category}:plan`);
    if (!required || typeof required.value !== 'string') return item;
    // Fill only omitted fields; explicit model values stay subject to exact validation (stale values still fail).
    const filled = { ...item, target: item.target ?? 'plan', value: item.value ?? required.value };
    if (Array.isArray(item.sourceAssessments)) filled.sourceAssessments = item.sourceAssessments.map(source => source && typeof source === 'object' ? { ...source, reviewedValue: source.reviewedValue ?? filled.value } : source);
    return filled;
  });
}

function setDecisionValue(exercise, set, category) {
  const explicitSides = exercise.unilateralPrescription === 'explicit-sides';
  if (explicitSides && ![1, 2].includes(set.side)) {
    throw new Error(`Ćwiczenie ${exercise.id}: jawna recepta jednostronna wymaga side 1 albo 2 dla każdej serii.`);
  }
  if (!explicitSides && set.side !== undefined) {
    throw new Error(`Ćwiczenie ${exercise.id}: side wymaga unilateralPrescription=explicit-sides.`);
  }
  const value = baseSetDecisionValue(exercise, set, category);
  return explicitSides ? `${value};unilateralPrescription=explicit-sides;side=${set.side}` : value;
}

function baseSetDecisionValue(exercise, set, category) {
  const loadType = exercise.loadType ?? 'profile-auto';
  const restSeconds = set.restSeconds ?? set.rest;
  if (!Number.isInteger(restSeconds) || restSeconds < 0 || !Number.isSafeInteger(set.mode)) {
    throw new Error(`Ćwiczenie ${exercise.id}: seria wymaga znormalizowanych wartości trybu i przerwy.`);
  }
  let value;
  switch (category) {
    case 'set_work_dose':
      if (set.unit === 'sec' || set.unit === 'seconds') {
        if (!Number.isSafeInteger(set.durationSeconds)) throw new Error(`Ćwiczenie ${exercise.id}: seria czasowa wymaga durationSeconds.`);
        value = `unit=sec;durationSeconds=${set.durationSeconds}`;
      } else if (set.unit === 'reps' || set.unit === undefined) {
        if (!Number.isSafeInteger(set.reps)) throw new Error(`Ćwiczenie ${exercise.id}: seria powtórzeniowa wymaga reps.`);
        value = `unit=reps;reps=${set.reps}`;
      } else {
        throw new Error(`Ćwiczenie ${exercise.id}: seria ma nieobsługiwany unit.`);
      }
      return value;
    case 'set_load':
      if (loadType === 'vita') {
        if (exercise.dataStatType !== 6 || !Number.isSafeInteger(set.level) || set.level < 1 || set.level > 999 ||
            set.weightKg !== undefined || set.rmLevel !== undefined || set.rmValue !== undefined || set.targetPercent1RM !== undefined ||
            !['sec', 'reps'].includes(set.unit)) {
          throw new Error(`Ćwiczenie ${exercise.id}: Vita wymaga potwierdzonego typu katalogu 6 i osobnego poziomu 1–999, bez kg ani RM.`);
        }
        const amount = set.unit === 'sec' ? set.durationSeconds : set.reps;
        if (!Number.isSafeInteger(amount) || amount < 1) throw new Error(`Ćwiczenie ${exercise.id}: Vita wymaga prawidłowej dawki czasu albo powtórzeń.`);
        return `loadType=vita;dataStatType=6;level=${set.level};unit=${set.unit};${set.unit === 'sec' ? 'durationSeconds' : 'reps'}=${amount}`;
      }
      if (loadType === 'cardio') {
        if (!Number.isSafeInteger(set.intensity) || set.intensity < 1 || set.intensity > 10 || set.unit !== 'sec') {
          throw new Error(`Ćwiczenie ${exercise.id}: cardio wymaga intensywności 1–10 i serii zapisanej w sekundach.`);
        }
        return `loadType=cardio;unit=sec;durationSeconds=${set.durationSeconds};targetIntensity=${set.intensity}/10;storage=workout-name-tag`;
      }
      if (loadType === 'smart-rm') {
        if (set.unit !== 'reps' || !Number.isSafeInteger(set.reps) || !Number.isSafeInteger(set.rirTarget) ||
            !Number.isSafeInteger(exercise.smartRmPresetId) || !Number.isSafeInteger(set.rmLevel) || set.rmValue !== undefined || set.targetPercent1RM !== undefined) {
          throw new Error(`Ćwiczenie ${exercise.id}: maszynowy preset RM wymaga reps, osobnego RIR, wewnętrznego poziomu adaptera zgodnego z presetem i dokładnego smartRmPresetId; procentu ani rmValue nie zapisuj.`);
        }
        const rules = getReferenceClientRmPresetRules(exercise.smartRmPresetName);
        if (!rules || set.reps < rules.minReps || set.reps > rules.maxReps) {
          throw new Error(`Ćwiczenie ${exercise.id}: liczba reps nie mieści się w zakresie wybranego presetu.`);
        }
        let rmLevel;
        try { rmLevel = validateReferenceClientRmLevel({ rmLevel: set.rmLevel, reps: set.reps, presetName: exercise.smartRmPresetName }, { allowPercentLevel: Boolean(set.percentResolved) }).rmLevel; }
        catch (error) { throw new Error(`Ćwiczenie ${exercise.id}: ${error.message}`); }
        const presetName = typeof exercise.smartRmPresetName === 'string' ? `;presetName=${exercise.smartRmPresetName}` : '';
        return `loadType=reference-client-rm-preset;unit=reps;reps=${set.reps};rirTarget=${set.rirTarget};presetId=${exercise.smartRmPresetId}${presetName};${set.rmLevelValidation?.method === 'reference-client-reviewed-imported-rm-level' ? `rmCounterSource=reviewed-import-migration;importedSelector=${rmLevel}` : 'rmCounterSource=public-reference-client-preset-default'};loadSource=reference-client-machine-preset`;
      }
      if (loadType === 'profile-auto' && set.loadEstimate && exercise.strengthAnchor) {
        const percent = set.loadEstimate.targetPercent1RM;
        const prescribedReps = set.loadEstimate.prescribedReps;
        if (typeof percent !== 'number' || !Number.isFinite(percent) || percent <= 0 || percent > 1 ||
            prescribedReps !== set.reps ||
            typeof exercise.strengthAnchor.source !== 'string' ||
            typeof set.calculatedLoad !== 'number' || !Number.isFinite(set.calculatedLoad) || set.calculatedLoad <= 0 ||
            set.loadUnit !== exercise.strengthAnchor.unit) {
          throw new Error(`Ćwiczenie ${exercise.id}: obciążenie musi być obliczone przez serwer z kotwicy i obsługiwanej krzywej klienta referencyjnego.`);
        }
        return `loadType=reference-client-customize;prescribedReps=${prescribedReps};targetPercent1RM=${(percent * 100).toFixed(1)}%;calculatedWeight=${set.calculatedLoad}${set.loadUnit};curve=${set.loadEstimate.method};anchorSource=${exercise.strengthAnchor.source}${exercise.strengthAnchor.anchorKind === undefined ? '' : `;anchorKind=${exercise.strengthAnchor.anchorKind}`}${set.loadEstimate.approximate === true ? ';approximate=true' : ''};rirTarget=${set.rirTarget}`;
      }
      if (loadType === 'customize-manual' && exercise.staticLoadRequested === true && Number.isFinite(set.weight) && set.weight > 0 && ['kg', 'lb'].includes(set.weightUnit)) return `loadType=customize-manual;weight=${set.weight};weightUnit=${set.weightUnit}`;
      if (loadType === 'fixed-kg' && typeof set.weightKg === 'number' && Number.isFinite(set.weightKg)) return `loadType=fixed-kg;weightKg=${set.weightKg}`;
      if (loadType === 'bodyweight' && set.rmLevel === undefined && set.weightKg === undefined) return 'loadType=bodyweight';
      if (loadType === 'customize-manual') {
        const missing = [exercise.staticLoadRequested === true ? null : 'staticLoadRequested=true (pole ćwiczenia)',
          Number.isFinite(set.weight) && set.weight > 0 ? null : 'weight > 0 (pole serii)',
          ['kg', 'lb'].includes(set.weightUnit) ? null : 'weightUnit kg|lb (pole serii)'].filter(Boolean);
        throw new Error(`Ćwiczenie ${exercise.id}: seria wymaga wartości zgodnej z loadType (customize-manual). Brakuje: ${missing.join(', ')}. Przykład: {"id":${exercise.id},"loadType":"customize-manual","staticLoadRequested":true,"sets":[{"unit":"reps","reps":5,"mode":1,"rirTarget":2,"restSeconds":150,"weight":79,"weightUnit":"kg"}]}; nie używaj weightKg dla customize-manual.`);
      }
      throw new Error(`Ćwiczenie ${exercise.id}: seria wymaga wartości zgodnej z loadType (${loadType}). Wymagane: fixed-kg → weightKg; bodyweight → bez weightKg i rmLevel; profile-auto → loadEstimate z serwera; smart-rm → reps i cel/preset.`);
    case 'set_effort_rir':
      if (set.unit !== 'reps') throw new Error(`Ćwiczenie ${exercise.id}: RIR oznacza zapas powtórzeń i wymaga unit=reps.`);
      if (!Number.isSafeInteger(set.rirTarget) || set.rirTarget < 0 || set.rirTarget > 5) {
        throw new Error(`Ćwiczenie ${exercise.id}: decyzja set_effort_rir wymaga celu RIR od 0 do 5.`);
      }
      return `rirTarget=${set.rirTarget}`;
    case 'set_resistance_mode':
      if (loadType === 'cardio' && set.mode !== 1) {
        throw new Error(`Ćwiczenie ${exercise.id}: cardio ma obecnie wyłącznie stały tryb Standard; tryb oporu ${set.mode} nie jest dostępny dla tej modalności.`);
      }
      return `mode=${set.mode}`;
    case 'set_rest_interval':
      return `restSeconds=${restSeconds}`;
    default:
      throw new Error(`Nieobsługiwana kategoria decyzji serii: ${category}.`);
  }
}
