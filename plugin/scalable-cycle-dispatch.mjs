import { buildSessionTable } from './session-table.mjs';
import { createHash } from 'node:crypto';
import { DRAFT_LIMITS } from './cycle-draft-store.mjs';
import { readCycleIndex } from './streaming-cycle-preparation.mjs';
import { normalizeCyclePreferenceReviews } from './preference-compliance.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ID = { type: 'string', pattern: '^[a-f0-9]{48}$' };
const DIGEST = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
export function scalableCycleTools(cycleSchema, reviewSchema, profileSchema) {
  const { sessions, occurrences, ...header } = cycleSchema.properties;
  const identity = { profile: profileSchema, draftId: ID };
  const review = { ...reviewSchema.properties }; delete review.cyclePreviewId;
  return [
    { name: 'speediance_begin_training_cycle_draft', description: 'Rozpocznij trwały szkic dużego cyklu. Wymaga pełnego podglądu stron, oceny naukowej i wyraźnej zgody. Nie zapisuje Speediance. Wspólny limit 64 000 000 bajtów obejmuje łącznie wejście, przygotowane definicje i strony podglądu; samo wejście nie może zajmować całego limitu.', inputSchema: object({ profile: profileSchema, header: object(header, cycleSchema.required.filter(key => !['sessions', 'occurrences'].includes(key))), expectedSessions: { type: 'integer', minimum: 1, maximum: 364 }, expectedOccurrences: { type: 'integer', minimum: 1, maximum: 364 } }, ['header', 'expectedSessions', 'expectedOccurrences']) },
    { name: 'speediance_upload_training_cycle_batch', description: 'Dodaj ograniczoną partię definicji lub dat. Ponowienie batchId wymaga tych samych danych. Kontrola pełnego cyklu następuje po zamknięciu szkicu.', inputSchema: object({ ...identity, batchId: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,128}$' }, kind: { enum: ['sessions', 'occurrences'] }, items: { type: 'array', minItems: 1, maxItems: 364, items: { oneOf: [sessions.items, occurrences.items] } } }, ['draftId', 'batchId', 'kind', 'items']) },
    { name: 'speediance_finalize_training_cycle_draft', description: 'Sprawdź kompletne daty, definicje i organizację cyklu; zamknij szkic bez zapisu do Speediance.', inputSchema: object(identity, ['draftId']) },
    { name: 'speediance_set_training_cycle_preference_reviews', description: 'Dodaj do zamkniętego szkicu cyklu potwierdzenie preferencji (zakres ćwiczeń, ograniczenia ruchowe, superserie itd.) raz na poziomie cyklu, bez ponownego przesyłania sesji. Serwer sam wylicza preferenceCompliance każdej sesji z wywiadu/profilu; to potwierdzenie obowiązuje dla wszystkich sesji. Sprzeczności z wykluczeniami nadal blokują. blockProgressionOverrides dopisuje jawne unchangedDoseReason dla bloku bez porównywalnej progresji (oznacza progressionOverrideUserAuthorized=true, więc podaj tylko po zgodzie użytkownika). Każda zmiana unieważnia przygotowanie; ponownie przygotuj szkic.', inputSchema: object({ ...identity, cyclePreferenceReviews: header.cyclePreferenceReviews, blockProgressionOverrides: { type: 'array', minItems: 1, maxItems: 52, items: { type: 'object', additionalProperties: false, required: ['blockId', 'unchangedDoseReason'], properties: { blockId: { type: 'string', minLength: 1, maxLength: 60 }, unchangedDoseReason: { type: 'string', minLength: 1, maxLength: 1500 } } } } }, ['draftId']) },
    { name: 'speediance_prepare_training_cycle_draft', description: 'Przygotuj wszystkie sesje rzeczywistą bramką naukową i serializacją. Odczytaj każdą stronę. Wspólny limit 64 000 000 bajtów obejmuje wejście, przygotowane definicje i strony; zaakceptowany upload nie gwarantuje miejsca na wykonanie. Odrzucenie nie skraca planu. 364 definicje to limit liczby, nie gwarancja zmieszczenia każdego planu. Opcjonalnie: cyclePreferenceReviews (potwierdzenie preferencji raz dla cyklu) i blockProgressionOverrides ([{blockId, unchangedDoseReason}] dla bloku bez porównywalnej progresji, tylko po zgodzie użytkownika) — zapisywane w zamkniętym szkicu bez ponownego przesyłania sesji; stare przygotowanie jest unieważniane i szkic przygotowywany od razu na nowo w tym wywołaniu.', inputSchema: object({ ...identity, cyclePreferenceReviews: header.cyclePreferenceReviews, blockProgressionOverrides: { type: 'array', minItems: 1, maxItems: 52, items: { type: 'object', additionalProperties: false, required: ['blockId', 'unchangedDoseReason'], properties: { blockId: { type: 'string', minLength: 1, maxLength: 60 }, unchangedDoseReason: { type: 'string', minLength: 1, maxLength: 1500 } } } } }, ['draftId']) },
    { name: 'speediance_bind_training_cycle_continuation', description: 'Powiąż nowy przygotowany szkic z dziennikiem oryginalnego cyklu po restarcie. Wymaga identycznych dawek i dat oraz wyraźnego zamiaru wznowienia. Nie zatwierdza badań ani zapisu; pobierz ponownie wszystkie strony, oceń aktualne badania i uzyskaj nową zgodę.', inputSchema: object({ ...identity, originalDraftId: ID, resumeIntent: {const:'resume-original-exact-cycle'} }, ['draftId','originalDraftId','resumeIntent']) },
    { name: 'speediance_read_training_cycle_page', description: 'Odczytaj stronę pełnego niezmiennego podglądu: dawki sesji, daty, progresję i deload. Pobranie strony nie potwierdza przeczytania przez człowieka.', inputSchema: object({ ...identity, index: { type: 'integer', minimum: 0, maximum: 999 }, detail: { type: 'string', enum: ['compact', 'full'], default: 'compact' } }, ['draftId', 'index']) },
    { name: 'speediance_read_training_cycle_pages', description: 'Bez draftId (albo draftId=latest) zwraca listę szkiców cyklu profilu od najnowszego: draftId, stan, liczba sesji, zakres dat, presentationDigest, czas utworzenia, czy jest zapisana ocena. Z draftId: read1..16 exact prepared pages in requested order with a UTF8 budget for the complete compact JSON text content returned by MCP (content[].text), excluding external JSONRPC/content wrapper overhead. One local locked receipt transaction; no Speediance writes, human-reading proof or scientific approval. Overflow fails the entire requested batch without receipt updates; explicitly request a smaller batch if needed, no automatic retry.', inputSchema: object({ profile: profileSchema, draftId: { type: 'string', pattern: '^([a-f0-9]{48}|latest)$', description: 'Pomiń albo podaj latest, aby dostać listę szkiców profilu (od najnowszego) zamiast stron.' }, indexes: { type: 'array', minItems: 1, maxItems: 16, uniqueItems: true, items: { type: 'integer', minimum: 0, maximum: 999 } }, maxOutputBytes: { type: 'integer', minimum: 1024, maximum: 1000000, default: 64000 }, detail: { type: 'string', enum: ['compact', 'full'], default: 'compact', description: 'compact (domyślnie): skrót decyzji i długich list; full: pełne dane strony.' }, includeStoredReview: { type: 'boolean', description: 'W trybie listy dołącz zapisane rationale/evidence/decisionEvidence ostatniej oceny najnowszego szkicu.' } }, []) },
    { name: 'gm_coach_review_training_cycle_draft', description: 'Po pobraniu wszystkich stron oceń pełny cykl na podstawie aktualnych badań i czterech dokładnych bindingValues. Nie uprawnia do zapisu.', inputSchema: object({ ...identity, presentationDigest: DIGEST, ...review, reuseStoredReview: { type: 'boolean', description: 'true: użyj rationale/evidence/decisionEvidence zapisanych w szkicu przy poprzedniej ocenie (np. po restarcie lub w nowym czacie); wtedy pomiń te pola.' } }, ['draftId', 'presentationDigest']) },
    { name: 'speediance_execute_training_cycle_draft', description: 'Po pokazaniu całego planu i wyraźnej zgodzie zapisz dokładny naukowo oceniony cykl z trwałym dziennikiem i odczytem zwrotnym. Nie ponawia niepewnych zapisów. Zapis działa w tle: jeśli trwa dłużej niż ok. 20 s, odpowiedź to executionStatus=in-progress z postępem; wywołaj ponownie z tym samym draftId i digestami, aby sprawdzić postęp lub wznowić po przerwaniu (także po zużytej zgodzie, dla tego samego dziennika). Opcjonalnie approve_template_deletions: kody z templateCapacity.deletionProposal, wyłącznie po wyraźnej zgodzie użytkownika na ich nieodwracalne usunięcie; GM Coach usunie tylko tyle najstarszych zatwierdzonych, ile brakuje, potwierdzi usunięcie odczytem i zapisze cykl w tym samym kroku.', inputSchema: object({ ...identity, presentationDigest: DIGEST, researchReviewDigest: DIGEST, confirm: { const: true }, finishFromStoredReview: { type: 'boolean', description: 'true: dokończ zatwierdzony, niezmieniony plan jednym wywołaniem (serwer przygotuje szkic, odczyta strony i ponowi ocenę z zapisanych danych). Wymaga presentationDigest zatwierdzonego planu; researchReviewDigest wtedy pomiń. Gdy plan się zmienił, nic nie zapisze.' }, approve_template_deletions: { type: 'array', maxItems: 100, uniqueItems: true, items: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,128}$' } } }, ['draftId', 'presentationDigest', 'confirm']) },
    ...['status', 'cancel'].map(action => ({ name: `speediance_${action}_training_cycle_draft`, description: action === 'status' ? 'Odczytaj stan trwałego szkicu.' : 'Anuluj szkic. Nie usuwa zapisanych treningów ani dziennika niepewnych operacji.', inputSchema: object(identity, ['draftId']) }))
  ];
}
/** Shared patch for a sealed draft: cycle-level preference reviews and per-block unchanged-dose reasons. */
export function normalizeCycleDraftPatch(args) {
  const reviews = args.cyclePreferenceReviews === undefined ? undefined : normalizeCyclePreferenceReviews(args.cyclePreferenceReviews);
  const raw = args.blockProgressionOverrides ?? [];
  if (!Array.isArray(raw) || raw.length > 52 || raw.some(row => !row || typeof row !== 'object' || Object.keys(row).some(k => !['blockId', 'unchangedDoseReason'].includes(k)) || typeof row.blockId !== 'string' || !row.blockId.trim() || row.blockId.length > 60 || typeof row.unchangedDoseReason !== 'string' || !row.unchangedDoseReason.trim() || row.unchangedDoseReason.length > 1500) || new Set(raw.map(row => row.blockId)).size !== raw.length) throw new Error('Invalid blockProgressionOverrides.');
  if (!reviews?.length && !raw.length) throw new Error('Provide cyclePreferenceReviews or blockProgressionOverrides.');
  return { reviews, blockOverrides: raw.map(row => ({ blockId: row.blockId, unchangedDoseReason: row.unchangedDoseReason.trim() })) };
}
function exact(args, allowed) { if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !allowed.includes(key))) throw new Error('Unexpected scalable draft argument.'); }
/** One definition is shown once; occurrence rows reference its exact digest.
 * Comparisons and global organization remain complete, never summarized away. */
export async function* scalableCyclePages(prepared) {
  const hiddenIdentities = new Map();
  const occurrenceSessions = new Map(prepared.facts.occurrences.map(row => [row.occurrenceId, row.sessionId]));
  for (const metadata of prepared.sessions) {
    const session = prepared.getSession ? await prepared.getSession(metadata.sessionId) : metadata;
    const hidden = new Set();
    if (!session.plan.showCalculatedLoads) for (const exercise of session.plan.exercises) if (exercise.loadType === 'profile-auto') hidden.add(JSON.stringify([exercise.id, exercise.entryId ?? exercise.id, exercise.section ?? 'main']));
    hiddenIdentities.set(metadata.sessionId, hidden);
  }
  function displayed(value, inheritedHidden = false, sessionIds = []) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(item => displayed(item, inheritedHidden, sessionIds));
    const scopedSessions = value.sessionId ? [value.sessionId] : value.from?.occurrenceId || value.to?.occurrenceId
      ? [value.from?.occurrenceId, value.to?.occurrenceId].map(id => occurrenceSessions.get(id)).filter(Boolean) : sessionIds;
    const hidden = inheritedHidden || scopedSessions.some(id => hiddenIdentities.get(id)?.has(JSON.stringify([value.catalogId, value.entryId, value.section])));
    const result = Object.fromEntries(Object.entries(value).filter(([key]) => !hidden || !['prescribedLoad', 'load', 'calculatedLoad', 'loadEstimate', 'serializedDisplayWeight', 'apiLoadNormalized'].includes(key)).map(([key, item]) => [key, displayed(item, hidden, scopedSessions)]));
    if (hidden && (value.prescribedLoad || value.load)) result.calculatedLoadPresentation = 'hidden-user-default';
    return result;
  }
  const { occurrences, ...facts } = prepared.facts;
  yield { section: 'manifest', profile: prepared.profile, contextDigest: prepared.contextDigest, prescriptionDigest: prepared.facts.prescriptionDigest, bindingValues: prepared.facts.bindingValues, templateSlots: prepared.templateSlots, sessionCount: prepared.sessions.length, occurrenceCount: occurrences.length, mutationAuthorized: false, physicalWorkVerified: false };
  // Split nested global facts at stable paths, preserving every value even if
  // comparisons themselves exceed a page. No truncation or arbitrary excerpts.
  function* bounded(value, fieldPath = []) {
    if (Buffer.byteLength(JSON.stringify(value)) <= DRAFT_LIMITS.page - 2000) { yield { section: 'cycle-facts', fieldPath, value }; return; }
    if (!value || typeof value !== 'object') throw new Error('Single cycle fact exceeds page limit.');
    yield { section: 'cycle-facts-container', fieldPath, container: Array.isArray(value) ? 'array' : 'object', length: Array.isArray(value) ? value.length : Object.keys(value).length };
    for (const [key, item] of Object.entries(value)) yield* bounded(item, [...fieldPath, Array.isArray(value) ? Number(key) : key]);
  }
  yield* bounded(displayed(facts));
  for (const metadataRow of prepared.sessions) {
    const session = prepared.getSession ? await prepared.getSession(metadataRow.sessionId) : metadataRow;
    const { plan, payload, executionPlan, ...metadata } = session;
    const displayExercises = rows => rows.map(exercise => {
      const { strengthAnchor, resolvedStrengthProfile, ...publicExercise } = exercise;
      return { ...publicExercise, sets: exercise.sets.map(set => {
      const { calculatedLoad, loadUnit, loadEstimate, ...shown } = set;
      if (exercise.loadType === 'profile-auto' && !plan.showCalculatedLoads) { delete shown.serializedDisplayWeight; delete shown.serializedDisplayUnit; delete shown.apiLoadNormalized; }
      if (exercise.loadType === 'profile-auto' && plan.showCalculatedLoads) Object.assign(shown, { calculatedLoad, loadUnit, loadEstimate });
      return shown;
    }) }; });
    const data = { section: 'session', ...metadata, programName: payload.name, timeBudgetAssessment: plan.timeBudgetAssessment ?? null, warmup: plan.warmup, postWorkoutStretching: plan.postWorkoutStretching, preferenceReviews: plan.preferenceReviews ?? [], preferenceCompliance: plan.preferenceCompliance ?? null, recoveryContext: plan.recoveryContext, resolvedRecoveryContext: plan.resolvedRecoveryContext, exercises: displayExercises(plan.exercises), executableExercises: displayExercises(executionPlan.exercises), supersetBlocks: plan.supersetBlocks ?? [], rationale: plan.rationale, evidence: plan.evidence.map(({ pubmed, ...source }) => source), verifiedSources: plan.evidence.map(source => ({ evidenceId: source.id, title: source.title, publicationDate: source.publicationDate, url: source.url, pubmed: source.pubmed ? { sourceId: source.pubmed.sourceId, year: source.pubmed.year, journal: source.pubmed.journal, publicationTypes: source.pubmed.publicationTypes, hasAbstract: Boolean(source.pubmed.abstract) } : null, metadataOrigin: 'verified-pubmed-record', semanticSupportVerified: false })), evidencePresentation: plan.evidence.map(source => ({ evidenceId: source.id, presentationProvenance: { metadataOrigin: 'verified-pubmed-record', verifiedMetadataFields: ['title', 'publicationDate', 'url'], assistantInterpretationFields: ['supports', 'finding', 'population', 'limitations', 'sourceAssessments', 'decisionEvidence'], interpretationOrigin: 'assistant-supplied', semanticSupportVerified: false, categorySearchMatchIsSupportProof: false } })), decisionEvidence: plan.decisionEvidence };
    if (Buffer.byteLength(JSON.stringify(data)) <= DRAFT_LIMITS.page - 2000) yield data;
    else yield* bounded(data, ['sessions', session.sessionId]);
  }
  yield* bounded(occurrences.map(row => { const { exercisePrescriptions, ...metadata } = row; return { ...metadata, prescriptionDefinition: row.sessionId }; }), ['occurrences']);
}
export function createScalableCycleDispatch(services) {
  const { storeFor, identity, validateInput, validateHeader, validatePart, prepare, review, execute } = services;
  for (const capability of [storeFor, identity, validateInput, validateHeader, validatePart, prepare, review, execute]) if (typeof capability !== 'function') throw new Error('Missing actual cycle integration capability.');
  const executionJobs = new Map();
  const inlineWaitMs = Number.isFinite(services.inlineWaitMs) ? services.inlineWaitMs : 20_000;
  async function executionReport(job, account, snapshot, status) {
    const progress = typeof services.executionProgress === 'function' ? await services.executionProgress(account.profile, job.sessionIds).catch(() => null) : null;
    return { executionStatus: status, draftStateNote: 'Zapis trwa w tle na serwerze; przerwanie połączenia go nie zatrzymuje.', startedAt: new Date(job.startedAt).toISOString(), elapsedSeconds: Math.round((Date.now() - job.startedAt) / 1000), resumedFromConsumedApproval: job.resumed, progress,
      nextStep: 'Aby sprawdzić postęp, wywołaj ponownie speediance_execute_training_cycle_draft z tym samym draftId, presentationDigest i researchReviewDigest (confirm=true). Nie twórz szablonów ani rezerwacji ręcznie.', mutationAuthorized: true };
  }
  const handle = async (name, args) => {
    const keys = {
      speediance_begin_training_cycle_draft: ['profile', 'header', 'expectedSessions', 'expectedOccurrences'],
      speediance_upload_training_cycle_batch: ['profile', 'draftId', 'batchId', 'kind', 'items'],
      speediance_finalize_training_cycle_draft: ['profile', 'draftId'],
      speediance_bind_training_cycle_continuation: ['profile','draftId','originalDraftId','resumeIntent'],
      speediance_read_training_cycle_page: ['profile', 'draftId', 'index', 'detail'],
      speediance_read_training_cycle_pages: ['profile', 'draftId', 'indexes', 'maxOutputBytes', 'includeStoredReview', 'detail'],
      gm_coach_review_training_cycle_draft: ['profile', 'draftId', 'presentationDigest', 'rationale', 'evidence', 'decisionEvidence', 'styleCompatibilityReview', 'prepareStyleReview', 'reuseStoredReview'],
      speediance_execute_training_cycle_draft: ['profile', 'draftId', 'presentationDigest', 'researchReviewDigest', 'confirm', 'approve_template_deletions', 'finishFromStoredReview'],
      speediance_set_training_cycle_preference_reviews: ['profile', 'draftId', 'cyclePreferenceReviews', 'blockProgressionOverrides'],
      speediance_prepare_training_cycle_draft: ['profile', 'draftId', 'cyclePreferenceReviews', 'blockProgressionOverrides'],
      speediance_status_training_cycle_draft: ['profile', 'draftId'], speediance_cancel_training_cycle_draft: ['profile', 'draftId']
    }[name];
    if (name === 'speediance_read_training_cycle_pages') {
      if (!args || typeof args !== 'object' || Array.isArray(args) || ![Object.prototype, null].includes(Object.getPrototypeOf(args)) || Reflect.ownKeys(args).some(key => typeof key !== 'string' || !keys.includes(key))) throw new Error('Unexpected scalable page batch argument.');
      const captured = {};
      for (const key of keys) { const cell = Object.getOwnPropertyDescriptor(args, key); if (!cell) { if (key in args) throw new Error('Inherited page batch argument.'); continue; } if (!Object.hasOwn(cell, 'value')) throw new Error('Page batch accessors forbidden.'); captured[key] = cell.value; }
      if (captured.draftId === undefined || captured.draftId === 'latest') {
        if (captured.indexes !== undefined) throw new Error('Listing mode does not take indexes; omit draftId only to list drafts.');
        if (captured.profile !== undefined && (typeof captured.profile !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(captured.profile))) throw new Error('Invalid cycle profile.');
        const account = await identity(captured.profile), store = await storeFor(account);
        const listed = await store.list({ account: account.fingerprint, includeStoredReview: captured.includeStoredReview === true });
        listed.drafts = listed.drafts.map(row => { const job = executionJobs.get(account.fingerprint + ':' + row.draftId); return job ? { ...row, execution: { state: job.state, startedAt: new Date(job.startedAt).toISOString(), ...(job.finishedAt ? { finishedAt: new Date(job.finishedAt).toISOString() } : {}), ...(job.error ? { error: job.error } : {}) } } : row; });
        return JSON.stringify({ profile: account.profile, ...listed });
      }
      if (captured.includeStoredReview !== undefined) throw new Error('includeStoredReview applies only to listing mode.');
      const indexes = captured.indexes;
      if (!Array.isArray(indexes) || Object.getPrototypeOf(indexes) !== Array.prototype || indexes.length < 1 || indexes.length > 16 || Reflect.ownKeys(indexes).some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= indexes.length))) throw new Error('Invalid page batch indexes.');
      captured.indexes = [];
      for (let i = 0; i < indexes.length; i++) { const cell = Object.getOwnPropertyDescriptor(indexes, String(i)); if (!cell || !Object.hasOwn(cell, 'value') || !Number.isSafeInteger(cell.value) || cell.value < 0 || cell.value >= DRAFT_LIMITS.pages || captured.indexes.includes(cell.value)) throw new Error('Invalid page batch indexes.'); captured.indexes.push(cell.value); }
      if (captured.maxOutputBytes !== undefined && (!Number.isSafeInteger(captured.maxOutputBytes) || captured.maxOutputBytes < 1024 || captured.maxOutputBytes > DRAFT_LIMITS.request)) throw new Error('Invalid page batch byte budget.');
      args = captured;
    }
    if (!keys) throw new Error('Unknown scalable cycle tool.'); exact(args, keys);
    if (args.profile !== undefined && (typeof args.profile !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(args.profile))) throw new Error('Invalid cycle profile.');
    const beginning = name === 'speediance_begin_training_cycle_draft';
    if (!beginning && (typeof args.draftId !== 'string' || !/^[a-f0-9]{48}$/.test(args.draftId))) throw new Error('Invalid draft identity.');
    if (beginning) {
      if (!Number.isSafeInteger(args.expectedSessions) || !Number.isSafeInteger(args.expectedOccurrences) || args.expectedSessions < 1 || args.expectedSessions > args.expectedOccurrences || args.expectedOccurrences > 364) throw new Error('Invalid announced counts.');
      if (!args.header || typeof args.header !== 'object' || Array.isArray(args.header)) throw new Error('Invalid cycle header.');
      await validateHeader({ input: args.header, expectedSessions: args.expectedSessions, expectedOccurrences: args.expectedOccurrences });
    }
    if (name === 'speediance_upload_training_cycle_batch') {
      if (typeof args.batchId !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(args.batchId) || !['sessions', 'occurrences'].includes(args.kind)) throw new Error('Invalid upload batch identity/kind.');
      await validatePart(args.kind, args.items);
    }
    if (name === 'speediance_read_training_cycle_page' && (!Number.isSafeInteger(args.index) || args.index < 0 || args.index >= DRAFT_LIMITS.pages)) throw new Error('Invalid page index.');
    if (['gm_coach_review_training_cycle_draft', 'speediance_execute_training_cycle_draft'].includes(name) && (typeof args.presentationDigest !== 'string' || !/^[a-f0-9]{64}$/.test(args.presentationDigest))) throw new Error('Invalid presentation digest.');
    if (name === 'speediance_execute_training_cycle_draft' && (args.confirm !== true || (args.finishFromStoredReview !== true && (typeof args.researchReviewDigest !== 'string' || !/^[a-f0-9]{64}$/.test(args.researchReviewDigest))))) throw new Error('Invalid explicit approval. Podaj confirm=true i researchReviewDigest albo finishFromStoredReview=true z presentationDigest zatwierdzonego planu.');
    if (name === 'gm_coach_review_training_cycle_draft' && args.reuseStoredReview === true && ['rationale', 'evidence', 'decisionEvidence', 'styleCompatibilityReview', 'prepareStyleReview'].some(field => args[field] !== undefined)) throw new Error('reuseStoredReview:true replaces rationale/evidence/decisionEvidence; omit them.');
    if (name === 'gm_coach_review_training_cycle_draft' && args.reuseStoredReview !== true && (typeof args.rationale !== 'string' || !args.rationale.trim() || !Array.isArray(args.evidence) || !Array.isArray(args.decisionEvidence))) throw new Error('Invalid scientific review shape.');
    const account = await identity(args.profile), store = await storeFor(account), key = { draftId: args.draftId, account: account.fingerprint };
    const inspect = consume => store.inspect({ ...key, consume });
    switch (name) {
      case 'speediance_begin_training_cycle_draft': {
        exact(args, ['profile', 'header', 'expectedSessions', 'expectedOccurrences']);
        if (!Number.isSafeInteger(args.expectedSessions) || !Number.isSafeInteger(args.expectedOccurrences) || args.expectedSessions < 1 || args.expectedSessions > args.expectedOccurrences || args.expectedOccurrences > 364) throw new Error('Invalid announced counts.');
        if (args.header?.profile !== undefined && args.header.profile !== account.profile) throw new Error('Conflicting profile in cycle header.');
        const header = { input: { ...args.header, profile: account.profile }, expectedSessions: args.expectedSessions, expectedOccurrences: args.expectedOccurrences };
        await validateHeader(header); return store.begin({ account: account.fingerprint, profile: account.profile, header });
      }
      case 'speediance_upload_training_cycle_batch': exact(args, ['profile', 'draftId', 'batchId', 'kind', 'items']); await validatePart(args.kind, args.items); return store.upload({ ...key, batchId: args.batchId, kind: args.kind, items: args.items });
      case 'speediance_finalize_training_cycle_draft': exact(args, ['profile', 'draftId']); return store.seal({ ...key, validateComplete: async (header, parts) => readCycleIndex(header, parts, validateInput) });
      case 'speediance_prepare_training_cycle_draft': {
        exact(args, ['profile', 'draftId', 'cyclePreferenceReviews', 'blockProgressionOverrides']);
        if (args.cyclePreferenceReviews !== undefined || args.blockProgressionOverrides !== undefined) {
          const patch = normalizeCycleDraftPatch(args);
          await store.setPreferenceReviews({ ...key, ...patch });
        } else {
          // A prepared/reviewed draft is reset to sealed and prepared again (stale presentation after restart or code update).
          const current = await store.status(key);
          if (['prepared', 'reviewed'].includes(current?.state)) await store.setPreferenceReviews({ ...key, reviews: undefined, blockOverrides: [] });
        }
        return store.prepare({ ...key, buildPages: async function* (header, parts, capabilities) { const index = await readCycleIndex(header, parts, validateInput); const prepared = await prepare({ header, index, access: capabilities }, account.profile, account.fingerprint); if (prepared.profileFingerprint !== account.fingerprint) throw new Error('Resolved account changed during cycle preparation.'); yield* scalableCyclePages(prepared); } });
      }
      case 'speediance_bind_training_cycle_continuation': {
        if (typeof services.bindContinuation !== 'function' || !/^[a-f0-9]{48}$/.test(args.originalDraftId ?? '') || args.originalDraftId === args.draftId || args.resumeIntent !== 'resume-original-exact-cycle') throw new Error('Fresh separate revision and explicit resume intent required.');
        return services.bindContinuation({store,account,draftId:args.draftId,originalDraftId:args.originalDraftId});
      }
      case 'speediance_read_training_cycle_page': exact(args, ['profile', 'draftId', 'index', 'detail']); return store.page({ ...key, index: args.index, ...(args.detail === 'full' ? {} : { projectPage: compactPresentationPage }) });
      case 'speediance_read_training_cycle_pages': {
        const value = await store.pages({ ...key, indexes: args.indexes, maxOutputBytes: args.maxOutputBytes, ...(args.detail === 'full' ? {} : { projectPage: compactPresentationPage }) });
        // Generic MCP wrapper preserves strings verbatim; no pretty-print overhead.
        return JSON.stringify(value);
      }
      case 'gm_coach_review_training_cycle_draft': {
        exact(args, ['profile', 'draftId', 'presentationDigest', 'rationale', 'evidence', 'decisionEvidence', 'styleCompatibilityReview', 'prepareStyleReview', 'reuseStoredReview']);
        const snapshot = await inspect(async (record, parts, access) => ({ header: record.header, index: await readCycleIndex(record.header, parts, validateInput), access, manifestDigest: record.manifestDigest, continuation:record.continuation, storedReviewInput: record.reviewInput }));
        if (args.reuseStoredReview === true) {
          const stored = snapshot.storedReviewInput;
          if (!stored || typeof stored.rationale !== 'string' || !Array.isArray(stored.evidence) || !Array.isArray(stored.decisionEvidence)) throw new Error('This draft has no stored review; supply rationale, evidence and decisionEvidence.');
          const rebound = reboundStoredReview(stored);
          return store.review({ ...key, presentationDigest: args.presentationDigest, reviewInput: rebound, validateReview: async ({ reviewInput }) => review(snapshot, account.profile, reviewInput, { presentationDigest: args.presentationDigest, manifestDigest: snapshot.manifestDigest }, account.fingerprint) });
        }
        if (args.prepareStyleReview === true) return review(snapshot, account.profile, {rationale:args.rationale,evidence:args.evidence,decisionEvidence:args.decisionEvidence,prepareStyleReview:true}, {presentationDigest:args.presentationDigest,manifestDigest:snapshot.manifestDigest}, account.fingerprint);
        return store.review({ ...key, presentationDigest: args.presentationDigest, reviewInput: { rationale: args.rationale, evidence: args.evidence, decisionEvidence: args.decisionEvidence, styleCompatibilityReview: args.styleCompatibilityReview }, validateReview: async ({ reviewInput }) => review(snapshot, account.profile, reviewInput, { presentationDigest: args.presentationDigest, manifestDigest: snapshot.manifestDigest }, account.fingerprint) });
      }
      case 'speediance_execute_training_cycle_draft': {
        exact(args, ['profile', 'draftId', 'presentationDigest', 'researchReviewDigest', 'confirm', 'approve_template_deletions', 'finishFromStoredReview']);
        const approvedDeletions = args.approve_template_deletions;
        // Item 10: one call finishes an approved, unchanged plan: prepare -> read every page (process receipts) -> review from stored data -> execute.
        if (args.finishFromStoredReview === true && executionJobs.get(account.fingerprint + ':' + args.draftId)?.state !== 'running') {
          const prepared = await handle('speediance_prepare_training_cycle_draft', { profile: args.profile, draftId: args.draftId });
          if (prepared.presentationDigest !== args.presentationDigest) throw new Error('Plan zmienił się od zatwierdzenia (nowy presentationDigest ' + prepared.presentationDigest + '). Niczego nie zapisano. Pokaż użytkownikowi strony planu i uzyskaj nową zgodę, potem wywołaj speediance_execute_training_cycle_draft z nowym presentationDigest i finishFromStoredReview=true.');
          for (let index = 0; index < prepared.pageCount; index++) await handle('speediance_read_training_cycle_page', { profile: args.profile, draftId: args.draftId, index });
          const reviewed = await handle('gm_coach_review_training_cycle_draft', { profile: args.profile, draftId: args.draftId, presentationDigest: args.presentationDigest, reuseStoredReview: true });
          args = { ...args, researchReviewDigest: reviewed.researchReviewDigest, finishFromStoredReview: undefined };
          services.log?.('cycle-finish-from-stored-review', { draftId: args.draftId, pages: prepared.pageCount });
        }
        if (approvedDeletions !== undefined && (!Array.isArray(approvedDeletions) || approvedDeletions.length > 100 || new Set(approvedDeletions).size !== approvedDeletions.length || approvedDeletions.some(code => typeof code !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(code)))) throw new Error('Invalid approve_template_deletions.');
        const snapshot = await inspect(async (record, parts, access) => ({ header: record.header, index: await readCycleIndex(record.header, parts, validateInput), access, reviewInput: record.reviewInput, proof: record.review, manifestDigest: record.manifestDigest, continuation:record.continuation, assertContinuationSource:()=>{if(record.continuation)store.assertContinuationSource(record.continuation);} }));
        const jobKey = account.fingerprint + ':' + args.draftId, existing = executionJobs.get(jobKey);
        if (existing?.state === 'running') return await executionReport(existing, account, snapshot, 'in-progress');
        if (existing?.state === 'done' && existing.presentationDigest === args.presentationDigest) return { ...existing.result, executionStatus: 'completed' };
        if (existing?.state === 'failed') executionJobs.delete(jobKey);
        const proof = await store.authorize({ ...key, presentationDigest: args.presentationDigest, researchReviewDigest: args.researchReviewDigest, confirm: args.confirm, allowConsumedResume: true, revalidate: async expected => { const current = await review(snapshot, account.profile, snapshot.reviewInput, { presentationDigest: args.presentationDigest, manifestDigest: snapshot.manifestDigest }, account.fingerprint); for (const field of ['contextDigest', 'prescriptionDigest', 'researchReviewDigest']) if (current[field] !== expected[field]) throw new Error('Cycle context or research changed; review all pages again.'); } });
        // Background job: survives client timeouts; repeated calls report progress or resume from the durable journal.
        const job = { state: 'running', startedAt: Date.now(), presentationDigest: args.presentationDigest, sessionIds: snapshot.index?.sessionIds ?? [], resumed: proof.resumedFromConsumedApproval === true };
        job.promise = (async () => {
          try { store.assertAuthorization(proof); job.result = await execute(snapshot, account.profile, snapshot.reviewInput, proof, () => store.assertAuthorization(proof), account.fingerprint, approvedDeletions === undefined ? {} : { approve_template_deletions: [...approvedDeletions] }); job.state = 'done'; }
          catch (error) { job.state = 'failed'; job.error = error?.message ?? String(error); }
          finally { job.finishedAt = Date.now(); store.releaseAuthorization(proof); }
        })();
        executionJobs.set(jobKey, job);
        services.log?.('cycle-execution-start', { draftId: args.draftId, resumed: job.resumed });
        job.promise.then(async () => services.log?.('cycle-execution-' + job.state, { draftId: args.draftId, seconds: Math.round((job.finishedAt - job.startedAt) / 1000), error: job.error ?? null, progress: typeof services.executionProgress === 'function' ? await services.executionProgress(account.profile, job.sessionIds).catch(() => null) : null }));
        await Promise.race([job.promise, new Promise(resolve => setTimeout(resolve, inlineWaitMs))]);
        if (job.state === 'done') return { ...job.result, executionStatus: 'completed' };
        if (job.state === 'failed') { executionJobs.delete(jobKey); throw new Error(job.error); }
        return await executionReport(job, account, snapshot, 'in-progress');
      }
      case 'speediance_set_training_cycle_preference_reviews': {
        exact(args, ['profile', 'draftId', 'cyclePreferenceReviews', 'blockProgressionOverrides']);
        return store.setPreferenceReviews({ ...key, ...normalizeCycleDraftPatch(args) });
      }
      case 'speediance_status_training_cycle_draft': exact(args, ['profile', 'draftId']); return store.status(key);
      case 'speediance_cancel_training_cycle_draft': exact(args, ['profile', 'draftId']); return store.cancel(key);
      default: throw new Error('Unknown scalable cycle tool.');
    }
  };
  return handle;
}
/** Presentation identity excludes live template slots/deletion proposal (re-read from the API at every preparation and execution). */
export function stablePresentationPage(page) {
  if (!page || typeof page !== 'object' || page.section !== 'manifest' || !Object.hasOwn(page, 'templateSlots')) return page;
  const { templateSlots, ...rest } = page; return rest;
}
const CYCLE_DECISION_CATEGORIES = ['weekly_volume', 'frequency', 'progression_rotation', 'recovery_deload'];
/** Stored decisions are re-bound to the current server binding values (filled again by the server). */
export function reboundStoredReview(stored) {
  return { ...stored, decisionEvidence: stored.decisionEvidence.map(decision => {
    if (!decision || typeof decision !== 'object' || !CYCLE_DECISION_CATEGORIES.includes(decision.category)) return decision;
    const { value, target, ...rest } = decision;
    return { ...rest, ...(Array.isArray(decision.sourceAssessments) ? { sourceAssessments: decision.sourceAssessments.map(item => { if (!item || typeof item !== 'object') return item; const { reviewedValue, ...other } = item; return other; }) } : {}) };
  }) };
}
export const scalablePresentationDigest = (manifestDigest, pageDigests) => hash({ manifestDigest, pages: pageDigests });

/** Item 11: compact view of a presentation page (default). Server-derived per-set decision mappings and long fact arrays are summarized;
 * the stored page, its digest and the presentation identity are unchanged. Full data: detail='full'. */
export function compactPresentationPage(data) {
  if (!data || typeof data !== 'object') return data;
  // Cycle-fact values are shortened; every session page instead carries the full sessionTable (never shortened).
  const shrink = (value, depth = 0) => {
    if (Array.isArray(value)) return value.length > 12 ? { compactArray: true, count: value.length, first: value.slice(0, 3).map(item => shrink(item, depth + 1)) } : value.map(item => shrink(item, depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['comparison', 'leverFindings', 'serializedWorkRows'].includes(key)).map(([key, item]) => [key, depth > 6 ? '[…]' : shrink(item, depth + 1)]));
    return value;
  };
  const out = { ...data };
  let changed = false;
  if (Array.isArray(data.executableExercises)) { out.sessionTable = buildSessionTable({ name: data.programName ?? data.name ?? data.sessionId, exercises: data.executableExercises, warmup: data.warmup, postWorkoutStretching: data.postWorkoutStretching }); changed = true; }
  if (Array.isArray(data.decisionEvidence)) {
    changed = true;
    const byCategory = {};
    for (const decision of data.decisionEvidence) { const row = byCategory[decision?.category] ??= { count: 0, status: decision?.status, example: { target: decision?.target, value: decision?.value, evidenceIds: decision?.evidenceIds } }; row.count++; }
    out.decisionEvidence = { compact: true, total: data.decisionEvidence.length, byCategory };
  }
  for (const key of ['evidencePresentation', 'executableExercises']) if (key in out) { out[key] = { omittedInCompactView: true }; changed = true; }
  if (data.section === 'cycle-facts' || 'value' in data) { const shrunk = shrink(data.value); if (JSON.stringify(shrunk) !== JSON.stringify(data.value)) { out.value = shrunk; changed = true; } }
  if (!changed) return data;
  out.compactView = 'Skrót strony; pełne dane: detail="full".';
  return out;
}

