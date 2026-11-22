const note = 'Audyt organizacji planu, bez odczytu ani zapisu konta. Nie potwierdza badań, dostępności ćwiczeń ani wykonania urządzenia; każdy wynikowy trening wymaga osobnego podglądu i bramki naukowej.';
const text = (value) => typeof value === 'string' && value.trim().length > 0;

export const trainingCycleSchema = {
  type: 'object', additionalProperties: false,
  required: ['totalWeeks', 'sessionsPerWeek', 'blocks', 'sessions', 'weeks', 'deload'],
  properties: {
    totalWeeks: { type: 'integer', minimum: 1, maximum: 52 },
    restWeeks: { type: 'array', maxItems: 52, items: { type: 'object', additionalProperties: false, required: ['week','reason'], properties: { week: { type: 'integer', minimum: 1, maximum: 52 }, reason: { type: 'string', minLength: 1, maxLength: 1500 } } } },
    sessionsPerWeek: { type: 'integer', minimum: 1, maximum: 7 },
    sessionMinutes: { type: 'integer', minimum: 10, maximum: 240, description: 'Potwierdzony limit sesji użytkownika; pomiń tylko gdy odmówił lub nie zna.' },
    structurePreference: { type: 'string', enum: ['default', 'user-custom'], description: 'Każdy domyślny blok ma dwa tygodnie; nieparzysty końcowy tydzień jest blokiem resztkowym. user-custom tylko po wyborze osoby.' },
    customStructureReason: { type: 'string', maxLength: 500 },
    blocks: { type: 'array', minItems: 1, maxItems: 52, items: {
      type: 'object', additionalProperties: false, required: ['id', 'startWeek', 'endWeek', 'progression', 'rotation'], properties: {
        id: { type: 'string', minLength: 1, maxLength: 60 },
        startWeek: { type: 'integer', minimum: 1, maximum: 52 }, endWeek: { type: 'integer', minimum: 1, maximum: 52 },
        progression: { type: 'string', minLength: 1, maxLength: 1500, description: 'Konkretne kryteria i zmiany reps/serii/wysiłku/wykonywalnego wariantu; RM pozostaje maszynowe. Bez automatycznego kg.' },
        rotation: { type: 'string', minLength: 1, maxLength: 1000, description: 'Celowa rotacja i ograniczenie zmian ustawienia albo uzasadnienie pozostawienia ćwiczeń.' },
        progressionLevers: { type: 'array', minItems: 1, maxItems: 10, uniqueItems: true, items: { type: 'string', enum: ['reps', 'sets', 'rir', 'mode', 'rest', 'exercise-variant', 'set-scheme', 'density', 'load-customize', 'duration'] }, description: 'Opcjonalne dźwignie progresji bloku dla każdego celu: powtórzenia, czas pracy w sekundach (duration), serie, RIR, tryb, przerwa, wariant ćwiczenia, schemat serii, gęstość, dostosowanie obciążenia. Zmieniaj zestaw między kolejnymi blokami roboczymi; bez automatycznego kg.' },
        setSchemes: { type: 'array', minItems: 1, maxItems: 9, uniqueItems: true, items: { type: 'string', enum: ['straight', 'ascending-reps', 'descending-reps', 'pyramid', 'top-set-backoff', 'drop-set', 'reverse-drop-set', 'rest-pause-cluster', 'varied-set-count'] }, description: 'Opcjonalne schematy serii w bloku: proste, rosnące lub malejące powtórzenia, piramida, seria szczytowa z seriami zejściowymi, drop set, odwrotny drop set, rest-pause/klastry, zmienna liczba serii.' },
        exerciseRotation: { type: 'object', additionalProperties: false, required: ['anchors', 'accessories', 'reason'], properties: { anchors: { type: 'string', enum: ['kept', 'rotated'] }, accessories: { type: 'string', enum: ['kept', 'rotated'] }, reason: { type: 'string', minLength: 1, maxLength: 1000 } }, description: 'Opcjonalna rotacja ćwiczeń: główne (anchors) zwykle zostają przez kilka bloków, akcesoryjne mogą rotować. Unikaj rotowania głównych w dwóch kolejnych blokach roboczych.' },
        sectionRotation: { type: 'object', additionalProperties: false, required: ['warmup', 'stretching', 'reason'], properties: { warmup: { type: 'string', enum: ['rotated', 'kept'] }, stretching: { type: 'string', enum: ['rotated', 'kept'] }, reason: { type: 'string', minLength: 1, maxLength: 1000 } }, description: 'Opcjonalna rotacja rozgrzewki i rozciągania między blokami; nie zostawiaj obu bez zmian w dwóch kolejnych blokach roboczych.' }
      }
    } },
    sessions: { type: 'array', minItems: 1, maxItems: 364, items: {
      type: 'object', additionalProperties: false, required: ['id', 'estimatedMinutes', 'warmup', 'stretching'], properties: {
        id: { type: 'string', minLength: 1, maxLength: 100 },
        estimatedMinutes: { type: 'number', exclusiveMinimum: 0, maximum: 480, description: 'Szacunek obejmujący ćwiczenia, przerwy, rozgrzewkę, rozciąganie i konfigurację; nie obietnica dokładnego czasu.' },
        warmup: { type: 'string', enum: ['executable', 'user-declined'] }, stretching: { type: 'string', enum: ['executable', 'user-declined'] }
      }
    } },
    weeks: { type: 'array', minItems: 1, maxItems: 52, items: {
      type: 'object', additionalProperties: false, required: ['week', 'blockId', 'sessionIds'], properties: {
        week: { type: 'integer', minimum: 1, maximum: 52 }, blockId: { type: 'string', minLength: 1, maxLength: 60 },
        sessionIds: { type: 'array', minItems: 0, maxItems: 7, items: { type: 'string', minLength: 1, maxLength: 100 } }
      }
    } },
    deload: { type: 'object', additionalProperties: false, required: ['strategy', 'rationale', 'adjustmentCriteria'], properties: {
      strategy: { type: 'string', enum: ['scheduled', 'readiness-triggered', 'not-indicated', 'user-declined'], description: 'Końcowy deload jest tylko domyślnym wariantem organizacyjnym. Termin i dawka są indywidualne i wymagają źródeł; ocena może wskazać wcześniejszy deload albo not-indicated, więc koniec nie jest uniwersalnym wymogiem naukowym. scheduled wymaga rzeczywistego porównania dawki. readiness-triggered jest planowaniem bez automatycznego monitorowania/uruchomienia; not-indicated wymaga związanych z planem danych historii i regeneracji oraz osobnej oceny naukowej; user-declined wyłącznie po jawnej odmowie. Ten lokalny audyt nie wiąże danych profilu ani nie zatwierdza nauki.' },
      userOverrideAuthorized: { type: 'boolean', description: 'Wymagane jako true wyłącznie dla strategy=user-declined i tylko po jawnej preferencji użytkownika. Nie stosuj do wcześniejszego zaplanowanego deloadu ani do science-assessed not-indicated.' },
      week: { type: 'integer', minimum: 1, maximum: 52 },
      rationale: { type: 'string', minLength: 1, maxLength: 1500 },
      adjustmentCriteria: { type: 'string', minLength: 1, maxLength: 1500, description: 'Indywidualna dawka i kryteria oparte na dowodach oraz sygnałach osoby; bez uniwersalnego progu ani procentu redukcji. readiness-triggered jest tylko notatką planistyczną; plugin nie monitoruje triggera ani sam nie zmienia programu.' }
    } }
  }
};

export function auditTrainingCycle(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Podaj strukturę cyklu treningowego.');
  const { totalWeeks, sessionsPerWeek, blocks, sessions, weeks, deload } = input;
  if (!Number.isSafeInteger(totalWeeks) || totalWeeks < 1 || totalWeeks > 52 ||
      !Number.isSafeInteger(sessionsPerWeek) || sessionsPerWeek < 1 || sessionsPerWeek > 7 ||
      !Array.isArray(blocks) || !Array.isArray(sessions) || !Array.isArray(weeks) ||
      blocks.length > 52 || sessions.length > 364 || weeks.length > 52) throw new Error('Nieprawidłowa długość albo struktura cyklu.');
  const issues = [], warnings = [];
  const add = (code, message) => issues.push({ code, message });
  if (input.structurePreference !== undefined && !['default', 'user-custom'].includes(input.structurePreference)) add('structure_preference', 'Nieznana preferencja układu bloków.');
  if (input.structurePreference === 'user-custom' && !text(input.customStructureReason)) add('custom_structure_reason', 'Inny układ wymaga zapisanej preferencji użytkownika.');
  if (input.sessionMinutes !== undefined && (!Number.isSafeInteger(input.sessionMinutes) || input.sessionMinutes < 10 || input.sessionMinutes > 240)) add('duration_limit', 'Nieprawidłowy limit czasu sesji.');
  const blockMap = new Map(), sessionMap = new Map(), covered = new Map();
  for (const block of blocks) {
    if (!block || !text(block.id) || blockMap.has(block.id)) { add('block_identity', 'Każdy blok musi mieć unikalne ID.'); continue; }
    blockMap.set(block.id, block);
    if (!Number.isSafeInteger(block.startWeek) || !Number.isSafeInteger(block.endWeek) || block.startWeek < 1 || block.endWeek < block.startWeek || block.endWeek > totalWeeks) { add('block_range', `Nieprawidłowe tygodnie bloku ${block.id}.`); continue; }
    for (let week = block.startWeek; week <= block.endWeek; week++) {
      if (covered.has(week)) add('overlapping_blocks', `Tydzień ${week} ma więcej niż jeden blok.`);
      covered.set(week, block.id);
    }
    if (!text(block.progression)) add('progression_missing', `Brak progresji i kryteriów dla bloku ${block.id}.`);
    if (!text(block.rotation)) add('rotation_missing', `Brak decyzji o rotacji dla bloku ${block.id}.`);
  }
  if (input.structurePreference !== 'user-custom') {
    const ranges = blocks.map((b) => [b?.startWeek, b?.endWeek]).sort((a, b) => a[0] - b[0]);
    const expected = Array.from({ length: Math.ceil(totalWeeks / 2) }, (_, index) => [index * 2 + 1, Math.min(index * 2 + 2, totalWeeks)]);
    if (JSON.stringify(ranges) !== JSON.stringify(expected)) add(totalWeeks === 6 ? 'six_week_blocks' : 'two_week_blocks', 'Każdy domyślny blok wymaga dwóch tygodni; ostatni nieparzysty tydzień jest blokiem resztkowym. To organizacja, nie dowód adaptacji.');
  }
  for (const session of sessions) {
    if (!session || !text(session.id) || sessionMap.has(session.id)) { add('session_identity', 'Każdy wariant treningu wymaga unikalnego ID.'); continue; }
    sessionMap.set(session.id, session);
    if (!Number.isFinite(session.estimatedMinutes) || session.estimatedMinutes <= 0 || session.estimatedMinutes > 480) add('session_duration', `Brak poprawnego szacunku czasu ${session.id}.`);
    else if (input.sessionMinutes !== undefined && session.estimatedMinutes > input.sessionMinutes) add('session_too_long', `${session.id}: ${session.estimatedMinutes} min przekracza limit ${input.sessionMinutes} min.`);
    for (const field of ['warmup', 'stretching']) if (!['executable', 'user-declined'].includes(session[field])) add('executable_sections', `${session.id}: ${field} wymaga pozycji wykonawczych lub jawnej rezygnacji użytkownika.`);
  }
  const rests = new Map();
  if (input.restWeeks !== undefined && (!Array.isArray(input.restWeeks) || input.restWeeks.length > 52)) add('rest_weeks', 'Nieprawidłowa lista tygodni odpoczynku.');
  for (const rest of Array.isArray(input.restWeeks) ? input.restWeeks : []) {
    if (!rest || !Number.isSafeInteger(rest.week) || rest.week < 1 || rest.week > totalWeeks || rests.has(rest.week) || !text(rest.reason) || rest.reason.length > 1500 || Object.keys(rest).some(key => !['week','reason'].includes(key))) { add('rest_week', 'Tydzień odpoczynku wymaga unikalnego poprawnego tygodnia i uzasadnienia.'); continue; }
    rests.set(rest.week, rest.reason);
  }
  const validRestWeeks = new Set();
  const seen = new Set(), used = new Set();
  for (const row of weeks) {
    if (!row || !Number.isSafeInteger(row.week) || row.week < 1 || row.week > totalWeeks || seen.has(row.week)) { add('week_identity', 'Każdy tydzień cyklu musi wystąpić dokładnie raz.'); continue; }
    seen.add(row.week);
    if (!blockMap.has(row.blockId) || covered.get(row.week) !== row.blockId) add('week_block', `Tydzień ${row.week} nie pasuje do zakresu wskazanego bloku.`);
    const expected = rests.has(row.week) ? 0 : sessionsPerWeek;
    if (!Array.isArray(row.sessionIds) || row.sessionIds.length !== expected) add('weekly_sessions', `Tydzień ${row.week} wymaga ${expected} zaplanowanych sesji.`);
    else if (rests.has(row.week)) validRestWeeks.add(row.week);
    for (const id of Array.isArray(row.sessionIds) ? row.sessionIds : []) {
      used.add(id);
      if (!sessionMap.has(id)) add('missing_template', `Tydzień ${row.week}: brak wariantu treningu ${String(id)}.`);
    }
  }
  for (let week = 1; week <= totalWeeks; week++) {
    if (!covered.has(week)) add('missing_block', `Brak bloku dla tygodnia ${week}.`);
    if (!seen.has(week)) add('missing_week', `Brak sesji dla tygodnia ${week}.`);
  }
  if (!deload || !['scheduled', 'readiness-triggered', 'not-indicated', 'user-declined'].includes(deload.strategy) || !text(deload.rationale) || !text(deload.adjustmentCriteria)) {
    add('deload_policy', 'Brak indywidualnej decyzji o deloadzie, uzasadnienia i kryteriów; science approval pozostaje osobną bramką.');
  } else {
    if (deload.strategy === 'scheduled' && (!Number.isSafeInteger(deload.week) || deload.week < 1 || deload.week > totalWeeks)) add('deload_week', 'Zaplanowany deload wymaga tygodnia należącego do uzgodnionego horyzontu.');
    if (deload.strategy !== 'scheduled' && deload.week !== undefined) add('deload_week', 'Polityka niezaplanowana nie może deklarować tygodnia ani wykonawczej dawki deloadu.');
    if (deload.strategy === 'user-declined' && deload.userOverrideAuthorized !== true) add('deload_user_preference', 'user-declined wymaga jawnej preferencji użytkownika; nie używaj jej jako synonimu not-indicated.');
    if (deload.strategy !== 'user-declined' && deload.userOverrideAuthorized === true) add('deload_override_scope', 'userOverrideAuthorized jest dozwolone wyłącznie przy jawnej strategii user-declined.');
  }
  auditBlockRotation(blocks, deload, add, warnings, text);
  for (const id of sessionMap.keys()) if (!used.has(id)) warnings.push({ code: 'unused_session', message: `Wariant ${id} nie jest użyty w cyklu.` });
  const deloadExecutionStatus = !deload ? 'invalid-policy' : ({
    scheduled: 'scheduled-dose-and-baseline-require-science-review',
    'readiness-triggered': 'planning-only-no-monitor-or-automatic-trigger',
    'not-indicated': 'no-scheduled-deload-personal-context-and-science-review-required',
    'user-declined': 'no-deload-by-explicit-user-preference'
  })[deload.strategy] ?? 'invalid-policy';
  const deloadAssessmentStatus = !deload ? 'not-assessed' : ({
    scheduled: 'actual-dose-comparison-and-science-review-required',
    'readiness-triggered': 'planning-only-no-monitor-or-automatic-trigger',
    'not-indicated': 'server-bound-personal-inputs-and-science-review-required',
    'user-declined': 'no-deload-by-explicit-user-preference'
  })[deload.strategy] ?? 'invalid-policy';
  return { organizationComplete: issues.length === 0, scientificApproval: false, mutationSent: false, totalWeeks, expectedSessionCount: (totalWeeks - validRestWeeks.size) * sessionsPerWeek, declaredRestWeeks: [...validRestWeeks].sort((a,b)=>a-b), deloadExecutionStatus, deloadAssessmentStatus, ...(deload?.strategy === 'not-indicated' ? { personalContextBound: false } : {}), issues, warnings, note };
}

const PROGRESSION_LEVERS = ['reps', 'sets', 'rir', 'mode', 'rest', 'exercise-variant', 'set-scheme', 'density', 'load-customize', 'duration'];
const SET_SCHEMES = ['straight', 'ascending-reps', 'descending-reps', 'pyramid', 'top-set-backoff', 'drop-set', 'reverse-drop-set', 'rest-pause-cluster', 'varied-set-count'];
function validEnumArray(value, allowed) {
  return Array.isArray(value) && value.length >= 1 && value.length <= 10 && new Set(value).size === value.length && value.every((v) => allowed.includes(v));
}
function validRotation(value, keys, allowed, text) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((k) => [...keys, 'reason'].includes(k)) &&
    keys.every((k) => allowed.includes(value[k])) && text(value.reason) && value.reason.length <= 1000;
}
// Fill missing structured block fields when the progression/rotation text
// names them unambiguously (PL/EN). Explicit fields always win.
const LEVER_PATTERNS = [['duration', /sekund|\bduration\b|\bseconds?\b|dłuższ\w* (czas|prac)/u], ['reps', /powtórze|\breps?\b|repetition/u], ['sets', /\bseri[aei]?\b.*(dodaj|więcej|\+)|liczb\w* serii|\bsets?\b/u], ['rir', /\brir\b|zapas/u], ['rest', /przerw|\brest\b/u],
  ['exercise-variant', /wariant|rotacj\w* ćwicze|variant/u], ['mode', /tryb|eccentric|ekscentr|\bmode\b/u], ['density', /gęstoś|density|superseri/u], ['set-scheme', /piramid|drop.?set|top.?set|rest.?pause|klaster|cluster/u]];
const SCHEME_PATTERNS = [['pyramid', /piramid|pyramid/u], ['top-set-backoff', /top.?set|seri\w* szczyt|back.?off/u], ['drop-set', /(?<!reverse )drop.?set/u], ['reverse-drop-set', /reverse drop|odwrotn\w* drop/u], ['rest-pause-cluster', /rest.?pause|klaster|cluster/u], ['ascending-reps', /rosnąc\w* powt|ascending/u], ['descending-reps', /malejąc\w* powt|descending/u]];
function deriveBlockFields(block, warn) {
  const prog = String(block.progression ?? '').toLocaleLowerCase('pl-PL');
  const rot = String(block.rotation ?? '').toLocaleLowerCase('pl-PL');
  const derived = {}, out = { ...block };
  if (out.progressionLevers === undefined) { const v = LEVER_PATTERNS.filter(([, p]) => p.test(prog)).map(([k]) => k); if (v.length) out.progressionLevers = derived.progressionLevers = v; }
  if (out.setSchemes === undefined) { const v = SCHEME_PATTERNS.filter(([, p]) => p.test(prog + ' ' + rot)).map(([k]) => k); out.setSchemes = derived.setSchemes = v.length ? v : ['straight']; }
  const reason = (block.rotation ?? '').slice(0, 1000) || 'Wyprowadzone z opisu bloku.';
  if (out.exerciseRotation === undefined && rot) {
    const changes = /(rotuj|rotacj(?!i\b)|zmiana|zmień|wymian|now\w* warian|inn\w* warian|rotat|swap)/u.test(rot) && !/^(bez zmian|bez rotacji|no rotation)\W*$/u.test(rot.trim());
    const anchorsKept = /(główn|anchor)\S*\s+(ćwiczenia\s+)?(bez zmian|zostaj|pozostaj|kept)/u.test(rot);
    const accessoriesKept = /(akcesor|pomocnicz|accessor)\S*\s+(ćwiczenia\s+)?(bez zmian|zostaj|pozostaj|kept)/u.test(rot);
    const anchorsMove = changes && !anchorsKept && /(główn|anchor|wyciskani|przysiad|martw|wiosłow)/u.test(rot);
    out.exerciseRotation = derived.exerciseRotation = { anchors: anchorsMove ? 'rotated' : 'kept', accessories: changes && !accessoriesKept ? 'rotated' : 'kept', reason };
  }
  if (out.sectionRotation === undefined && /(rozgrzew|warm|rozciąg|stretch)/u.test(rot + ' ' + prog)) {
    const all = rot + ' ' + prog, moved = s => new RegExp('(' + s + ')[^.;]{0,60}(rotuj|rotacj|zmian|now|inn|rotat|różn)|(rotuj|rotacj|zmian|now|inn|rotat|różn)[^.;]{0,60}(' + s + ')', 'u').test(all);
    out.sectionRotation = derived.sectionRotation = { warmup: moved('rozgrzew|warm') ? 'rotated' : 'kept', stretching: moved('rozciąg|stretch') ? 'rotated' : 'kept', reason };
  }
  if (Object.keys(derived).length) warn('block_fields_derived', 'Blok ' + block.id + ': pola ' + Object.keys(derived).join(', ') + ' wyprowadzono automatycznie z opisu progression/rotation: ' + JSON.stringify(derived) + '. Sprawdź je i przy następnym wywołaniu podaj jawnie.');
  return out;
}
function auditBlockRotation(blocks, deload, add, warnings, text) {
  const warn = (code, message) => warnings.push({ code, message });
  const working = [];
  for (const rawBlock of blocks) {
    if (!rawBlock || typeof rawBlock !== 'object' || !text(rawBlock.id)) continue;
    const block = deriveBlockFields(rawBlock, warn);
    const id = block.id;
    const ok = { levers: false, section: false, exercise: false };
    if (block.progressionLevers === undefined) warn('progression_levers_missing', 'Blok ' + id + ' nie deklaruje dźwigni progresji. Dodaj do bloku np. progressionLevers: [sets, rir] (dozwolone: reps, duration, sets, rir, mode, rest, exercise-variant, set-scheme, density, load-customize).');
    else if (!validEnumArray(block.progressionLevers, PROGRESSION_LEVERS)) add('block_progression_levers', 'Nieprawidłowe progressionLevers w bloku ' + id + '.'); else ok.levers = true;
    if (block.setSchemes === undefined) warn('set_schemes_missing', 'Blok ' + id + ' nie deklaruje schematów serii. Dodaj np. setSchemes: [straight, top-set-backoff] (dozwolone: straight, ascending-reps, descending-reps, pyramid, top-set-backoff, drop-set, reverse-drop-set, rest-pause-cluster, varied-set-count).');
    else if (!validEnumArray(block.setSchemes, SET_SCHEMES)) add('block_set_schemes', 'Nieprawidłowe setSchemes w bloku ' + id + '.');
    if (block.exerciseRotation === undefined) warn('exercise_rotation_missing', 'Blok ' + id + ' nie deklaruje rotacji ćwiczeń. Dodaj np. exerciseRotation: {anchors: kept, accessories: rotated, reason: tekst}.');
    else if (!validRotation(block.exerciseRotation, ['anchors', 'accessories'], ['kept', 'rotated'], text)) add('block_exercise_rotation', 'Nieprawidłowe exerciseRotation w bloku ' + id + '.'); else ok.exercise = true;
    if (block.sectionRotation === undefined) warn('section_rotation_missing', 'Blok ' + id + ' nie deklaruje rotacji rozgrzewki i rozciągania. Dodaj np. sectionRotation: {warmup: rotated, stretching: rotated, reason: tekst}.');
    else if (!validRotation(block.sectionRotation, ['warmup', 'stretching'], ['rotated', 'kept'], text)) add('block_section_rotation', 'Nieprawidłowe sectionRotation w bloku ' + id + '.'); else ok.section = true;
    const isDeload = deload?.strategy === 'scheduled' && Number.isSafeInteger(deload.week) && block.startWeek <= deload.week && deload.week <= block.endWeek;
    if (!isDeload && Number.isSafeInteger(block.startWeek)) working.push({ block, ok });
  }
  working.sort((a, b) => a.block.startWeek - b.block.startWeek);
  for (let i = 1; i < working.length; i++) {
    const p = working[i - 1], n = working[i], pair = p.block.id + ' i ' + n.block.id;
    if (p.ok.levers && n.ok.levers) {
      const a = new Set(p.block.progressionLevers), b = new Set(n.block.progressionLevers);
      const sameSet = (x, y) => Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((v) => y.includes(v));
      const schemesChanged = Array.isArray(p.block.setSchemes) && Array.isArray(n.block.setSchemes) && !sameSet(p.block.setSchemes, n.block.setSchemes);
      if (a.size === b.size && [...a].every((x) => b.has(x)) && !schemesChanged) warn('progression_repeated', 'Bloki ' + pair + ' używają tych samych dźwigni progresji; zmień bodziec.');
    }
    if (p.ok.section && n.ok.section && [p, n].every((x) => x.block.sectionRotation.warmup === 'kept' && x.block.sectionRotation.stretching === 'kept')) warn('section_rotation_stale', 'Rozgrzewka i rozciąganie bez zmian w blokach ' + pair + '.');
    if (p.ok.exercise && n.ok.exercise && p.block.exerciseRotation.anchors === 'rotated' && n.block.exerciseRotation.anchors === 'rotated') warn('anchor_rotation_churn', 'Ćwiczenia główne rotują w kolejnych blokach ' + pair + '; utrudnia to ocenę progresji.');
  }
}
