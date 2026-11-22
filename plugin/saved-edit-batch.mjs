// Wsadowa edycja zapisanych szablonów: jedno wywołanie podglądu i jedno wywołanie zapisu dla wielu szablonów.
// Każda pozycja przechodzi pełną ścieżkę pojedynczego narzędzia (te same bramki, zgody i odczyt zwrotny);
// wspólne pola (źródła, decyzje naukowe, oceny preferencji, wywiad) są dziedziczone z wywołania głównego.
export const BATCH_MAX_ITEMS = 30;
export const BATCH_CONCURRENCY = 3;
// Podgląd: pozycja dziedziczy wszystkie pola główne poza polami opisującymi konkretny szablon.
const PER_TEMPLATE_PREVIEW_KEYS = new Set(['program_code', 'base_digest', 'edit_preview_id', 'name', 'exercises', 'warmup', 'postWorkoutStretching', 'supersetBlocks', 'scheduleDate', 'batch_items']);
const SHARED_UPDATE_KEYS = ['profile', 'confirm'];

export function expandBatchItems(name, args) {
  const shared = name === 'speediance_update_saved_program' ? SHARED_UPDATE_KEYS : Object.keys(args).filter((key) => !PER_TEMPLATE_PREVIEW_KEYS.has(key));
  const { batch_items: items, ...top } = args;
  if (!Array.isArray(items) || !items.length) throw new Error('batch_items musi być niepustą listą.');
  if (items.length + 1 > BATCH_MAX_ITEMS) throw new Error('Najwyżej ' + BATCH_MAX_ITEMS + ' szablonów w jednym wywołaniu; podziel listę.');
  const all = [top, ...items].map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Każda pozycja batch_items musi być obiektem.');
    const merged = { ...item };
    for (const key of shared) if (merged[key] === undefined && top[key] !== undefined) merged[key] = top[key];
    return merged;
  });
  const codes = all.map((item) => item.program_code);
  if (codes.some((code) => typeof code !== 'string' || !code)) throw new Error('Każda pozycja wymaga program_code.');
  if (new Set(codes).size !== codes.length) throw new Error('Ten sam program_code występuje w batch_items więcej niż raz.');
  return all;
}

const compactPreview = (r) => ({ editPreviewId: r?.editPreviewId, programCode: r?.programCode, baseDigest: r?.baseDigest, writeReady: r?.writeReady, changedCategories: r?.editDiff?.categories, changed: r?.editDiff?.changed, sessionTable: r?.sessionTable });
const compactUpdate = (r) => ({ updated: r?.updated, verification: r?.verification ?? r?.readbackVerification?.status ?? (r?.updated ? 'verified' : undefined), programCode: r?.programCode, programName: r?.programName, mismatches: r?.readbackVerification?.mismatches, coachNotesUpdated: r?.coachNotesUpdated });

// Ocena preferencji podana raz (pole + decyzja) obowiązuje dla każdej pozycji: brakujący scopeDigest danego szablonu
// jest brany z komunikatu serwera. Bez oceny dla pola błąd zostaje zwrócony bez zmian.
export async function dispatchWithScopedReviews(dispatch, name, item) {
  try { return await dispatch(name, item); }
  catch (first) {
    let error = first;
    // Skrót zakresu z innego szablonu: pobierz wymagany zakres dla tego szablonu (bez ocen) i podstaw te same decyzje.
    if (name === 'speediance_preview_saved_program_update' && /Invalid scoped preference review/.test(String(first?.message ?? ''))) {
      try { return await dispatch(name, { ...item, preferenceReviews: [] }); } catch (probe) { error = probe; }
    }
    const match = name === 'speediance_preview_saved_program_update' && String(error?.message ?? '').match(/Scoped preference review required before approval: (\[.*?\])\. /s);
    const given = Array.isArray(item.preferenceReviews) ? item.preferenceReviews : [];
    if (!match) throw error;
    let needed; try { needed = JSON.parse(match[1]); } catch { throw error; }
    if (!Array.isArray(needed) || !needed.every(n => given.some(r => r?.field === n?.field))) throw error;
    const reviews = needed.map(n => { const g = given.find(r => r.field === n.field); return { field: g.field, decision: g.decision, rationale: g.rationale, ...(g.userConfirmed === undefined ? {} : { userConfirmed: g.userConfirmed }), scopeDigest: n.scopeDigest }; });
    return dispatch(name, { ...item, preferenceReviews: reviews });
  }
}

// Jedna decyzja na kategorię z wywołania głównego obowiązuje dla każdego szablonu: serwer wylicza dokładne cele
// i wartości tego szablonu i przepisuje na nie tę samą ocenę (te same źródła, cytaty i oceny).
export async function retargetDecisions(dispatch, item) {
  if (!Array.isArray(item.decisionEvidence) || !item.decisionEvidence.length) return item;
  const bindings = await dispatch('gm_coach_derive_evidence_bindings', { ...(item.profile ? { profile: item.profile } : {}), exercises: item.exercises, warmup: item.warmup, postWorkoutStretching: item.postWorkoutStretching, supersetBlocks: item.supersetBlocks ?? [], ...(item.intakeAnswers?.primaryGoal ? { primaryGoal: item.intakeAnswers.primaryGoal } : {}) });
  const categories = Array.isArray(bindings?.categories) ? bindings.categories : null;
  if (!categories) return item;
  const decisions = [];
  for (const c of categories) {
    const template = item.decisionEvidence.find((d) => d?.category === c.category && (!c.requiredStatus || d.status === c.requiredStatus)) ?? item.decisionEvidence.find((d) => d?.category === c.category);
    if (!template) continue;
    const value = c.exampleValue ?? template.value;
    decisions.push({ ...template, target: c.exampleTarget, value, ...(Array.isArray(template.sourceAssessments) ? { sourceAssessments: template.sourceAssessments.map((a) => ({ ...a, reviewedValue: value })) } : {}) });
  }
  return { ...item, decisionEvidence: decisions };
}

/** dispatch(name, args) wykonuje jedno zwykłe wywołanie narzędzia. Błąd jednej pozycji nie zatrzymuje pozostałych. */
export async function runSavedEditBatch(dispatch, name, args, { concurrency = BATCH_CONCURRENCY, now = () => Date.now() } = {}) {
  const items = expandBatchItems(name, args);
  const results = new Array(items.length);
  const started = now();
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      const t0 = now();
      try {
        // Wspólne decyzje (z pól głównych) są rozwijane jednakowo dla każdego szablonu, także pierwszego.
        const ownDecisions = index > 0 && args.batch_items[index - 1]?.decisionEvidence;
        const prepared = name === 'speediance_preview_saved_program_update' && !ownDecisions ? await retargetDecisions(dispatch, item) : item;
        const out = await dispatchWithScopedReviews(dispatch, name, prepared);
        results[index] = { programCode: item.program_code, ok: true, ms: now() - t0, ...(name === 'speediance_update_saved_program' ? compactUpdate(out) : compactPreview(out)) };
      } catch (error) {
        results[index] = { programCode: item.program_code, ok: false, ms: now() - t0, error: String(error?.message ?? error).slice(0, 1500) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  const failed = results.filter((r) => !r.ok || (name === 'speediance_update_saved_program' && r.updated !== true));
  return {
    batch: true, tool: name, count: results.length, ok: results.length - failed.length, failed: failed.length, totalMs: now() - started, results,
    note: name === 'speediance_update_saved_program'
      ? (failed.length ? 'Część szablonów nie została potwierdzona odczytem; nie ponawiaj ich na ślepo, odczytaj je najpierw.' : 'Wszystkie szablony zapisano i potwierdzono odczytem zwrotnym.')
      : 'Zapisz jednym wywołaniem speediance_update_saved_program z batch_items: [{program_code, base_digest, edit_preview_id}] dla pozostałych pozycji (pierwsza w polach głównych), confirm:true.'
  };
}
