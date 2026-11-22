import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateEvidenceExcerptAnchors, normalizeEvidencePlanItems } from '../training-evidence.mjs';

// Błędy z logu zwykłych czatów: komunikaty mają mówić, co naprawić, a blokady pozostają bez zmian.
const abstract = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty';
const source = { id: 'e1', pubmed: { abstract } };
const row = (category, target, excerpt) => ({ category, target, status: 'applied', supportingExcerpts: [{ evidenceId: 'e1', excerpt }] });

test('limit 25 słów na źródło nadal blokuje i podaje liczbę oraz sposób naprawy', () => {
  const first = 'one two three four five six seven eight nine ten eleven twelve thirteen';
  const second = 'eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty';
  assert.throws(() => validateEvidenceExcerptAnchors([row('set_load', 'set:1:1', first), row('set_load', 'set:1:2', second)], [source]),
    /przekracza limit 25 \(obecnie 26 w 2 różnych fragmentach\)\. Napraw:.*liczy się raz/);
});

test('wspólny fragment dwóch kategorii nadal blokuje i wskazuje drugą kategorię', () => {
  const shared = 'one two three four five six';
  assert.throws(() => validateEvidenceExcerptAnchors([row('frequency', 'plan', shared), row('weekly_volume', 'plan', shared)], [source]),
    /Decyzja frequency \(plan\).*użyte także w: weekly_volume\. Napraw: dodaj inny dosłowny fragment/);
});

test('rozgrzewka included bez pozycji nadal blokuje i podpowiada omitted_user_preference', () => {
  assert.throws(() => normalizeEvidencePlanItems({ status: 'included', items: [] }, { status: 'omitted_user_preference', omissionReason: 'Nie chce.', items: [] }),
    /status included wymaga co najmniej jednego elementu\. Napraw:.*omitted_user_preference/);
});

test('komunikaty partial, długości fragmentu i setupKey zawierają instrukcję naprawy', () => {
  const sourceText = readFileSync(new URL('../training-evidence.mjs', import.meta.url), 'utf8');
  assert.match(sourceText, /fragment musi zawierać 5–25 słów \(otrzymano \$\{wordCount\}\)/);
  assert.match(sourceText, /częściowe dopasowanie wymaga direction=qualifies i relationship=indirect albo guideline\. Otrzymano/);
  assert.match(sourceText, /znaki ; \+ \| = są zabronione/);
  assert.match(sourceText, /matches\.includes\('partial'\) && \(normalized\.direction !== 'qualifies' \|\| relationship === 'direct'\)/);
});

test('evidence: komunikat 1–12 źródeł odróżnia evidence od decisionEvidence', async () => {
  const { normalizeTrainingEvidence } = await import('../training-evidence.mjs');
  assert.throws(() => normalizeTrainingEvidence('Uzasadnienie planu treningowego.', []),
    /Podaj od 1 do 12 źródeł.*\(otrzymano 0\)\. Pole evidence to lista 1–12 rzeczywistych źródeł z bieżących batchy.*oddzielne od decisionEvidence/);
});

test('decisionEvidence: puste mapowania wskazują gm_coach_derive_evidence_bindings', () => {
  const sourceText = readFileSync(new URL('../training-evidence.mjs', import.meta.url), 'utf8');
  assert.match(sourceText, /coverage\.length === 0 \? ' decisionEvidence jest puste: wywołaj gm_coach_derive_evidence_bindings/);
});

test('mcp_server: źródło niepotwierdzone dla kategorii podaje kategorię i wymaganie batchId, bez osłabienia warunku', () => {
  const server = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
  assert.match(server, /if \(!verified\) \{\s*throw new Error\(`Źródło \$\{source\.id\} nie zostało potwierdzone .*dla kategorii \$\{category\}.*batch, w którym wyszukano kategorię \$\{category\}.*musi być w researchBatchIds/);
  assert.match(server, /if \(!matches\.length\) \{[\s\S]*?throw new Error\(.*Napraw: usuń batch \$\{batchId\}/);
});

test('681: batch bez potwierdzonej kategorii podaje powód dla każdej kategorii i podpowiedź z paczki, warunek bez zmian', async () => {
  const vm = await import('node:vm');
  const server = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
  const start = server.indexOf('      const batchChecks = source.coveredCategories.map(');
  const end = server.indexOf('nie dopisuj batchy ręcznie.`);\n      }', start);
  assert.ok(start > 0 && end > start);
  const block = server.slice(start, end) + 'nie dopisuj batchy ręcznie.`);\n      }';
  const run = (results) => vm.runInNewContext(`(() => { ${block}; return matches.length; })()`, {
    source: { id: 'e9', coveredCategories: Object.keys(results) }, batchId: 'b-1',
    verifyCategoryInBatch: (_b, category) => results[category]
  });
  assert.throws(() => run({ set_load: { valid: false, reason: 'category_not_searched_in_batch' }, rest_intervals: { valid: false, reason: 'source_not_in_batch' }, frequency: { valid: false, reason: 'unknown_or_expired_batch' } }),
    e => /nie potwierdza żadnej z deklarowanych kategorii\. Powody dla batcha b-1: set_load: tej kategorii nie wyszukano w tym batchu.*; rest_intervals: ten PMID nie wystąpił w tym batchu; frequency: batch jest nieznany albo wygasł\. Napraw: usuń batch b-1/.test(e.message)
      && e.message.includes('Używaj researchBatchIds i coveredCategories dokładnie z wyniku gm_coach_prepare_evidence_pack; nie dopisuj batchy ręcznie.'));
  assert.throws(() => run({ a: { valid: false, reason: 'title_mismatch' }, b: { valid: false, reason: 'year_mismatch' }, c: { valid: false, reason: 'url_mismatch' } }),
    /a: tytuł różni się.*; b: rok różni się.*; c: URL nie jest adresem PubMed/);
  assert.equal(run({ set_load: { valid: true, source: {} }, frequency: { valid: false, reason: 'source_not_in_batch' } }), 1);
});

test('cyclePreferenceReviews jest akceptowane w indeksie strumieniowym cyklu', () => {
  const server = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
  assert.match(server, /cycleExactKeys\(index, \[[^\]]*'cyclePreferenceReviews'[^\]]*\], 'streamed cycle index'\)/);
});


// 678: realne błędy czatu — RIR w rozgrzewce i przerwane połączenie przy statystykach wielu ćwiczeń.
const serverSource678 = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
test('678: komunikat GM_COACH_INVALID_SET_DOSE wskazuje rozgrzewkę i typowe RIR 4, wymóg zostaje', () => {
  assert.match(serverSource678, /rirTarget: wymagane całkowite 0–5 dla oporowej serii powtórzeniowej \(także w rozgrzewce i rozciąganiu na powtórzenia; typowo rirTarget 4 dla rozgrzewki\)/);
  assert.match(serverSource678, /if \(!validRirTarget \|\| needsResearchBackedRir\) invalidFields\.push/);
  assert.match(serverSource678, /Pomiń dla serii czasowej\. Wymagane także w rozgrzewce i rozciąganiu na powtórzenia; typowo rirTarget 4 dla rozgrzewki\./);
  const reference = readFileSync(new URL('../skills/speediance-coach/references/tools-reference.md', import.meta.url), 'utf8');
  const at = reference.indexOf('### speediance_preview_program');
  assert.match(reference.slice(at, at + 600), /także w rozgrzewce i rozciąganiu na powtórzenia; typowo rirTarget 4 dla rozgrzewki/);
});

test('678: profil siły czyta statystyki maks. 4 naraz i zachowuje kolejność', async () => {
  const vm = await import('node:vm');
  const start = serverSource678.indexOf('async function getReferenceClientStyleStrengthProfile(');
  const end = serverSource678.indexOf('\n}\n', start) + 2;
  let active = 0, peak = 0, calls = 0;
  const ids = Array.from({ length: 10 }, (_, i) => i + 1);
  const context = {
    readProfileConfig: async () => ({ config: { deviceType: 1 }, password: 'x' }), readTrainingProfileRecord: async () => null,
    getAccountWeightUnitDetails: async () => ({ unit: 'kg', source: 'api' }), oneRepMaxCurveRows: () => [], getGoalRepRange: () => null,
    currentExerciseCatalog: async () => ({ exercises: [] }), getConfirmedExerciseName: (_c, id) => 'E' + id, readOwnedEquipment: async () => null,
    smartRmReadiness: { observe() {} }, profileConfigFingerprint: () => 'fp', REFERENCE_CLIENT_CORE_LIFT_NAMES: [],
    readExerciseStatistics: async (_p, id) => { calls++; active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--; return { id }; },
    extractExplicitOneRepMaxCandidates: (response) => [{ fromId: response.id }], selectBestOneRepMaxCandidate: () => ({ status: 'none' }),
    exerciseStatisticsDateStatus: () => 'missing', groupAccessoriesByName: () => [], setTimeout
  };
  vm.createContext(context);
  vm.runInContext(serverSource678.slice(start, end), context);
  const result = await context.getReferenceClientStyleStrengthProfile('p', { refreshSpeedianceData: true, exerciseIds: ids });
  assert.equal(calls, 10);
  assert.ok(peak > 1 && peak <= 4, 'peak=' + peak);
  assert.equal(JSON.stringify(result.exerciseStatistics.map(row => [row.exerciseId, row.candidates[0].fromId])), JSON.stringify(ids.map(id => [id, id])));
});


test('679: opis trainingHistoryStatus mówi, czego wymaga user_summary/reviewed_speediance; walidacja bez zmian', async () => {
  const { trainingProfileDataSchema } = await import('../coaching-profile.mjs');
  assert.match(trainingProfileDataSchema.properties.trainingHistoryStatus.description, /user_summary\/reviewed_speediance wymaga podania trainingHistorySummary \(krótki opis\) albo currentProgram/);
  const profileSource = readFileSync(new URL('../coaching-profile.mjs', import.meta.url), 'utf8');
  assert.match(profileSource, /wymaga krótkiego trainingHistorySummary albo currentProgram\./);
  const reference = readFileSync(new URL('../skills/speediance-coach/references/tools-reference.md', import.meta.url), 'utf8');
  const section = reference.slice(reference.indexOf('### gm_coach_audit_training_interview'), reference.indexOf('### gm_coach_get_memory'));
  assert.match(section, /trainingHistoryStatus=user_summary\/reviewed_speediance wymaga trainingHistorySummary \(krótki opis\) albo currentProgram/);
});

test('679: derive_evidence_bindings udostępnia prepareEvidencePack i fastScienceRoute dla zapamiętanego schematu', () => {
  const src = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
  const schema = src.slice(src.indexOf("name: 'gm_coach_derive_evidence_bindings'"), src.indexOf("name: 'gm_coach_prepare_evidence_pack'"));
  assert.match(schema, /prepareEvidencePack: \{ type: 'boolean'/);
  assert.match(schema, /context: \{ type: 'string', maxLength: 120/);
  const handler = src.slice(src.indexOf("case 'gm_coach_derive_evidence_bindings':"), src.indexOf("case 'gm_coach_prepare_evidence_pack':"));
  assert.match(handler, /args\.prepareEvidencePack === true[\s\S]*return prepareEvidencePack\(packArgs, \{ trainingResearch, exercises: preflightEvidenceExercises\(packArgs\) \}\)/);
  assert.match(handler, /fastScienceRoute: 'Jeśli gm_coach_prepare_evidence_pack jest na liście narzędzi/);
  assert.equal((src.match(/fastScienceRoute: 'Jeśli gm_coach_prepare_evidence_pack/g) || []).length, 3, 'derive + 2x planningInputContract');
  for (const p of ['../skills/speediance-coach/instructions-plan-lean.md', '../skills/training-science/instructions-plan-lean.md']) {
    assert.match(readFileSync(new URL(p, import.meta.url), 'utf8'), /JEDNO wywołanie gm_coach_search_training_research ze wszystkimi kategoriami naraz/);
  }
});


// --- 1.0.679: błędy z czatu „Plan treningowy 2 dni” ---
import { exerciseDecisionValue, deriveExpectedEvidenceBindings } from '../training-evidence.mjs';
import { classifyGuardError, describeGuard, guardErrorPayload, NON_OVERRIDABLE_GUARDS } from '../user-override.mjs';
import { PubMedResearchError } from '../training-research.mjs';

const omitted = { status: 'omitted_user_preference', omissionReason: 'Nie chce.', items: [] };

test('exercise_selection: tytuł czatu i nazwa z katalogu różniące się wielkością liter/spacjami dają tę samą wartość; inna nazwa nadal ją zmienia', () => {
  const base = { id: 2267, entryId: 2267, actionLibraryId: 5, title: 'Kneeling  barbell lat pulldown', section: 'main', loadType: 'bodyweight', sets: [{ unit: 'reps', reps: 6, mode: 1 }] };
  const fromCatalog = { ...base, title: 'Kneeling Barbell Lat Pulldown' };
  assert.equal(exerciseDecisionValue(base, 'exercise_selection'), exerciseDecisionValue(fromCatalog, 'exercise_selection'));
  assert.notEqual(exerciseDecisionValue(base, 'exercise_selection'), exerciseDecisionValue({ ...base, title: 'Seated Row' }, 'exercise_selection'));
});

test('exercise_selection: czat „incline dual-handle chest press” vs katalog „Incline Dual-Handle Chest Press” → zgodna wartość derive i podglądu', () => {
  const chat = { id: 235, entryId: 235, title: 'incline dual-handle chest press', section: 'main', loadType: 'bodyweight', sets: [{ unit: 'reps', reps: 8, mode: 1, rirTarget: 2, restSeconds: 120 }] };
  const catalog = { ...chat, title: 'Incline Dual-Handle Chest Press' };
  const derived = deriveExpectedEvidenceBindings([chat], omitted, omitted).find(item => item.category === 'exercise_selection');
  assert.equal(derived.value, exerciseDecisionValue(catalog, 'exercise_selection'));
  assert.notEqual(exerciseDecisionValue(chat, 'exercise_selection'), exerciseDecisionValue({ ...catalog, entryId: 236 }, 'exercise_selection'));
});

test('niezgodna wartość decyzji dostaje nieomijalny kod science_decision_mismatch ze wskazówką derive', () => {
  const error = new Error('Decyzja 15: wartość nie odpowiada znormalizowanej wartości exercise_selection (exercise:2267); zaktualizuj mapowanie po zmianie planu.');
  assert.equal(classifyGuardError(error), 'science_decision_mismatch');
  assert.equal(classifyGuardError(Object.assign(new Error('x'), { guardCode: 'science_decision_mismatch' })), 'science_decision_mismatch');
  assert.equal(guardErrorPayload('science_decision_mismatch').overridable, false);
  assert.ok(Object.hasOwn(NON_OVERRIDABLE_GUARDS, 'science_decision_mismatch'));
  assert.match(describeGuard('science_decision_mismatch'), /nie do pominięcia.*gm_coach_derive_evidence_bindings.*value\/target/);
  const source = readFileSync(new URL('../training-evidence.mjs', import.meta.url), 'utf8');
  assert.match(source, /guardCode: 'science_decision_mismatch'/);
});

test('odrzucone zapytanie PubMed (INVALID_QUERY) nie jest klasyfikowane jako science_gate', () => {
  const error = new PubMedResearchError('INVALID_QUERY', 'Podaj od 1 do 12 prostych słów kontekstu celu; operatory PubMed, tagi pól i symbole wieloznaczne są blokowane.');
  assert.equal(error.code, 'INVALID_QUERY');
  assert.equal(classifyGuardError(error), null);
  assert.equal(classifyGuardError(new Error('Brak oceny naukowej dla kategorii: weekly_volume')), 'science_gate');
});

test('customize-manual bez staticLoadRequested/weightUnit nadal blokuje i nazywa brakujące pola z przykładem', () => {
  const exercise = { id: 235, title: 'Incline Barbell Bench Press', loadType: 'customize-manual', sets: [{ unit: 'reps', reps: 5, mode: 1, rirTarget: 2, restSeconds: 150, weightKg: 79 }] };
  assert.throws(() => deriveExpectedEvidenceBindings([exercise], omitted, omitted),
    /Ćwiczenie 235: seria wymaga wartości zgodnej z loadType \(customize-manual\)\. Brakuje: staticLoadRequested=true \(pole ćwiczenia\), weight > 0 \(pole serii\), weightUnit kg\|lb \(pole serii\)\. Przykład: .*"weightUnit":"kg"/);
  const fixed = { ...exercise, staticLoadRequested: true, sets: [{ unit: 'reps', reps: 5, mode: 1, rirTarget: 2, restSeconds: 150, weight: 79, weightUnit: 'kg' }] };
  const load = deriveExpectedEvidenceBindings([fixed], omitted, omitted).find(item => item.category === 'set_load');
  assert.equal(load.value, 'loadType=customize-manual;weight=79;weightUnit=kg');
});

test('suggest_load, derive i get_exercise_history: komunikaty i opisy mówią, co podać', () => {
  const server = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
  assert.match(server, /Pola Labatt wymagają jawnego load_method=labatt-reference-epley\. Polami Labatt są: labatt_source, labatt_saved_anchor, labatt_history, target_rir; podano: /);
  assert.match(server, /description: 'Pola Labatt \(labatt_source, labatt_saved_anchor, labatt_history, target_rir\) są dozwolone wyłącznie z load_method=labatt-reference-epley/);
  assert.match(server, /description: 'TO JEST odczyt historii wykonanych treningów .*consent_to_read_history=true/);
  assert.equal((server.match(/staticLoadRequested: \{ type: 'boolean', description: 'customize-manual: ustaw true/g) || []).length, 2);
  assert.match(server, /2–8 gotowych sesji \(każda sesja .*staticLoadRequested=true.*weightUnit kg\|lb/);
  const reference = readFileSync(new URL('../skills/speediance-coach/references/tools-reference.md', import.meta.url), 'utf8');
  assert.match(reference, /\*\*To jest odczyt historii wykonania:\*\*/);
  assert.match(reference, /\*\*Pola Labatt:\*\* labatt_source, labatt_saved_anchor, labatt_history, target_rir/);
  assert.match(reference, /\*\*customize-manual:\*\* ćwiczenie wymaga staticLoadRequested=true/);
});



// 680: realna rezerwacja istniejącego szablonu Customize — komunikaty, kody i bezpieczne ścieżki.
const server680 = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
const vm680 = await import('node:vm');
const slice680 = (from, to) => { const s = server680.indexOf(from); const e = server680.indexOf(to, s + from.length); assert.ok(s >= 0 && e > s, from); return server680.slice(s + from.length, e); };

test('680 #1: scheduleDate równe date jest akceptowane, różne blokuje z kodem i wskazówką', () => {
  const head = slice680("    case 'speediance_preview_saved_program_schedule': {", '      const date = normalizeScheduleDate');
  const run = args => vm680.runInNewContext('(function(){' + head + ' return "ok"; })', { args })();
  const base = { program_code: 'ABC', base_digest: 'a'.repeat(64), date: '2026-11-20' };
  assert.equal(run({ ...base, scheduleDate: '2026-11-20' }), 'ok');
  assert.equal(run(base), 'ok');
  assert.throws(() => run({ ...base, scheduleDate: '2026-11-21' }), e => e.code === 'GM_COACH_SCHEDULE_DATE_CONFLICT' && /użyj tylko pola date; scheduleDate pomiń/.test(e.message));
});

test('680 #2: derive przyjmuje Customize z weight/weightUnit/staticLoadRequested', () => {
  const schema = server680.slice(server680.indexOf("name: 'gm_coach_derive_evidence_bindings'"), server680.indexOf("name: 'gm_coach_search_training_research'"));
  assert.equal((schema.match(/weightUnit: \{ type: 'string', enum: \['kg', 'lb'\]/g) || []).length, 2);
  assert.equal((schema.match(/staticLoadRequested: \{ type: 'boolean'/g) || []).length, 2);
});

test('680 #3: derive bez section wylicza sekcję z executionRef jak podgląd; Stale value podaje oczekiwane/otrzymane i kod', async () => {
  const fn = server680.slice(server680.indexOf('function preflightEvidenceExercises('), server680.indexOf('\n}\n', server680.indexOf('function preflightEvidenceExercises(')) + 2);
  const preflight = vm680.runInNewContext('(' + fn + ')', {});
  const warm = { id: 2267, title: 'Arm Circles', loadType: 'bodyweight', sets: [{ unit: 'reps', reps: 10, mode: 1 }] };
  const main = { id: 235, title: 'Bench', loadType: 'bodyweight', sets: [{ unit: 'reps', reps: 5, mode: 1 }] };
  const stretch = { id: 300, entryId: 9, title: 'Stretch', loadType: 'bodyweight', section: 'main', sets: [{ unit: 'sec', durationSeconds: 30, mode: 1 }] };
  const out = preflight({ exercises: [warm, main, stretch], warmup: { status: 'included', items: [{ executionRef: 2267 }] }, postWorkoutStretching: { status: 'included', items: [{ executionRef: 9 }] } });
  assert.equal(out[0].section, 'warmup');
  assert.equal(out[1].section, undefined);
  assert.equal(out[2].section, 'main', 'jawna section ma pierwszeństwo');
  const { expandExplicitDecisionGroups } = await import('../science-decision-groups.mjs');
  const bindings = [{ category: 'exercise_selection', target: 'exercise:2267', value: 'W' }];
  assert.throws(() => expandExplicitDecisionGroups([{ category: 'exercise_selection', target: 'exercise:2267', value: 'M' }], [], bindings),
    e => e.guardCode === 'science_decision_mismatch' && /oczekiwano value="W", otrzymano "M"/.test(e.message));
});

test('680 #4: konflikt manual Customize i klient referencyjny Customize ma kod i mówi, którą flagę zostawić', () => {
  assert.match(server680, /\[GM_COACH_CUSTOMIZE_FLAG_CONFLICT\].*zostaw loadType=customize-manual i staticLoadRequested=true, a usuń userRequestedReferenceClientCustomize/);
  assert.match(server680, /userRequestedReferenceClientCustomize: \{ type: 'boolean', description: '[^']*pomiń tę flagę i użyj loadType=customize-manual \+ staticLoadRequested=true/);
});

test('680 #5: RIR zostaje wymagane, komunikat podpowiada rirTarget dla istniejącego szablonu bez RIR', () => {
  assert.match(server680, /Dla istniejącego szablonu bez RIR \(speediance_get_saved_program nie zwraca RIR\) podaj rirTarget zgodny z celem, np\. 2/);
  assert.match(server680, /if \(!validRirTarget \|\| needsResearchBackedRir\) invalidFields\.push/);
});

test('680 #7: delete po zweryfikowanym usunięciu przenosi znacznik pending tej nazwy do resolved-pending-writes-<data>', async () => {
  const { mkdtemp, writeFile, readdir, lstat, readFile, mkdir, rename, rm } = await import('node:fs/promises');
  const os = await import('node:os'); const pathMod = (await import('node:path')).default; const { createHash } = await import('node:crypto');
  const dir = await mkdtemp(pathMod.join(os.tmpdir(), 'gm680-del-'));
  try {
    const scoped = (p, n) => pathMod.join(p.dir, 'pending-program-write-' + createHash('sha256').update(n).digest('hex') + '.json');
    const paths = { dir, pendingWrite: pathMod.join(dir, 'pending-program-write.json') };
    await writeFile(scoped(paths, 'Push A'), JSON.stringify({ profile: 'synthetic', programName: 'Push A' }));
    await writeFile(scoped(paths, 'Other'), JSON.stringify({ profile: 'synthetic', programName: 'Other' }));
    const branch = slice680("    case 'speediance_delete_saved_program':", "    case 'speediance_preview_saved_program_schedule':");
    const run = vm680.runInNewContext('(async function(){' + branch + '})', {
      args: { confirm: true, base_digest: 'a'.repeat(64), program_name: 'Push A', program_code: 'one' },
      resolveProfile: async () => 'synthetic', withProfileMutationLock: async (_, fn) => fn(),
      readProfileConfig: async () => ({ config: { deviceType: 1 } }), assertWritableDeviceType: () => {},
      getSavedTemplateByCode: async () => ({ code: 'one', name: 'Push A' }), savedTemplateDigest: () => 'a'.repeat(64),
      getSavedTemplateId: () => 1, getTemplateCode: row => row.code, speedianceApiRequest: async () => ({ code: 0 }),
      getVerifiedSavedCustomTemplates: async () => ({ templates: [], completeness: { status: 'complete', issues: [] } }),
      deleteProgramCoachNote: async () => true, profilePaths: () => paths, scopedProgramPendingPath: scoped,
      optionalLstat: p => lstat(p).catch(() => null), readFile, mkdir, rename, path: pathMod, encodeURIComponent, JSON, String, Date
    });
    const result = await run();
    assert.equal(result.deleted, true);
    assert.equal(result.pendingMarkerResolved.moved, true);
    assert.match(result.pendingMarkerResolved.to, /^resolved-pending-writes-\d{8}[\\/]pending-program-write-[a-f0-9]{64}-deleted-one\.json$/);
    const left = await readdir(dir);
    assert.ok(left.includes(pathMod.basename(scoped(paths, 'Other'))), 'znacznik innej nazwy zostaje');
    assert.ok(!left.includes(pathMod.basename(scoped(paths, 'Push A'))));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('680 #8: reconcile zwykłego programu rozstrzyga znacznik tylko przy dokładnej, jedynej nazwie na kompletnej liście', async () => {
  const { mkdtemp, writeFile, readdir, lstat, readFile, mkdir, unlink, rm } = await import('node:fs/promises');
  const os = await import('node:os'); const pathMod = (await import('node:path')).default; const { createHash } = await import('node:crypto');
  const dir = await mkdtemp(pathMod.join(os.tmpdir(), 'gm680-rec-'));
  try {
    const scoped = (p, n) => pathMod.join(p.dir, 'pending-program-write-' + createHash('sha256').update(n).digest('hex') + '.json');
    const paths = { dir, pendingWrite: pathMod.join(dir, 'pending-program-write.json') };
    const branch = slice680("    case 'gm_coach_reconcile_pending_program_write':", "    case 'speediance_schedule_saved_program':");
    let writes = 0;
    const make = templates => vm680.runInNewContext('(async function(){' + branch + '})', {
      args: { confirm: true, program_code: 'one', program_name: 'Push A' },
      resolveProfile: async () => 'synthetic', withProfileMutationLock: async (_, fn) => fn(),
      readProfileConfig: async () => ({ config: { deviceType: 1 } }), profilePaths: () => paths, assertSafeProfileStorage: async () => {},
      scopedProgramPendingPath: scoped, optionalLstat: p => lstat(p).catch(() => null), readFile, mkdir, unlink, writeFile, path: pathMod,
      savedIdentityAccountFingerprint: () => 'acct', getSavedTemplateByCode: async () => ({ code: 'one', name: 'Push A' }),
      getVerifiedSavedCustomTemplates: async () => ({ templates, completeness: { status: 'complete' } }),
      speedianceApiRequest: async () => { writes++; throw new Error('no account calls'); }, getTemplateCode: t => t.code, JSON, Date, String
    });
    await writeFile(scoped(paths, 'Push A'), JSON.stringify({ profile: 'synthetic', programName: 'Push A', accountFingerprint: 'acct' }));
    await assert.rejects(make([{ code: 'one', name: 'Push A' }, { code: 'two', name: 'Push A' }])(), /2 szablonów o tej nazwie/);
    assert.ok((await readdir(dir)).includes(pathMod.basename(scoped(paths, 'Push A'))), 'znacznik zachowany przy duplikacie nazwy');
    const result = await make([{ code: 'one', name: 'Push A' }, { code: 'x', name: 'Push B' }])();
    assert.equal(result.pendingWriteReconciled, true);
    assert.equal(result.accountWrites, 0);
    assert.equal(writes, 0);
    const resolvedDir = (await readdir(dir)).find(n => /^resolved-pending-writes-\d{8}$/.test(n));
    const moved = JSON.parse(await readFile(pathMod.join(dir, resolvedDir, (await readdir(pathMod.join(dir, resolvedDir)))[0]), 'utf8'));
    assert.equal(moved.resolvedTemplateCode, 'one');
    assert.ok(!(await readdir(dir)).includes(pathMod.basename(scoped(paths, 'Push A'))));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('680 #9: prepareEvidencePack wybiera fragmenty 5–10 słów (≥2 kategorie w limicie 25 słów na źródło)', async () => {
  const { excerptCandidates } = await import('../evidence-pack.mjs');
  const abstract = 'Resistance training volume and weekly frequency were compared in trained adults over twelve weeks. Higher set volume increased muscle hypertrophy while rest intervals between sets of two minutes preserved strength outcomes in the cohort.';
  for (const category of ['weekly_volume', 'frequency', 'set_rest_interval']) {
    const candidates = excerptCandidates(abstract, category);
    assert.ok(candidates.length > 0);
    for (const c of candidates) assert.ok(c.words >= 5 && c.words <= 10, category + ': ' + c.words);
  }
});

test('680 #10: różnica planu i szablonu ma nieomijalny kod saved_plan_mismatch z pierwszymi różnicami; odczyt ma planFields', async () => {
  const { NON_OVERRIDABLE_GUARDS, OVERRIDABLE_GUARDS, describeGuard } = await import('../user-override.mjs');
  assert.ok(Object.hasOwn(NON_OVERRIDABLE_GUARDS, 'saved_plan_mismatch'));
  assert.ok(!Object.hasOwn(OVERRIDABLE_GUARDS, 'saved_plan_mismatch'));
  assert.match(describeGuard('saved_plan_mismatch'), /nie do pominięcia/);
  assert.match(server680, /\{ guardCode: 'saved_plan_mismatch', savedPlanMismatches: \(verification\.mismatches \?\? \[\]\)\.slice\(0, 8\) \}/);
  assert.match(server680, /Pierwsze różnice \(ćwiczenie\/seria\/pole: oczekiwane z planu vs odczytane z szablonu\)/);
  assert.match(server680, /planFields: \{ side, exerciseUnilateralPrescription: 'explicit-sides' \}/);
});

test('680 #11: preference_compliance zwraca requiredPreferenceReviews jako pole strukturalne i zachowuje tekst', async () => {
  const { assertPreferenceCompliance } = await import('../preference-compliance.mjs');
  const { softGuard, userOverrideContext } = await import('../user-override.mjs');
  const assessment = { status: 'unresolved-review-required', checks: [{ status: 'unresolved-review-required', field: 'noJumping', exerciseIndex: 1, scopeDigest: 'd'.repeat(64), requested: 'ask' }], reviews: [] };
  let caught;
  try { userOverrideContext.run({ override: null, overridden: [] }, () => softGuard('preference_compliance', () => assertPreferenceCompliance(assessment))); } catch (e) { caught = e; }
  assert.equal(caught.guardCode, 'preference_compliance');
  assert.deepEqual(caught.guardDetails.requiredPreferenceReviews, [{ field: 'noJumping', exerciseIndex: 1, scopeDigest: 'd'.repeat(64), userAnswerRequired: true }]);
  assert.match(caught.message, /Scoped preference review required before approval: \[\{"field":"noJumping"/);
  assert.match(server680, /guard: \{ \.\.\.guardErrorPayload\(code\), \.\.\.\(error\?\.guardDetails \?\? \{\}\) \}/);
});
