// Reguła: dwa kolejne dni kalendarzowe (N i N+1) nie powtarzają tego samego ćwiczenia,
// łącznie z brzuchem, rozgrzewką i rozciąganiem. Zwraca ostrzeżenia z gotową zamianą
// na inne ćwiczenie tej samej sekcji (i tej samej partii, gdy jest znana) z puli planu.
const DAY = 86_400_000;
const dayNumber = (date) => { const t = Date.parse(String(date) + 'T00:00:00Z'); return Number.isFinite(t) ? Math.round(t / DAY) : null; };
const keyOf = (e) => String(e?.catalogId ?? e?.groupId ?? e?.id ?? '');
const label = (e) => e?.title ?? e?.name ?? ('ćwiczenie ' + keyOf(e));

export function auditConsecutiveDayRepeats(occurrences, { candidates = [] } = {}) {
  const byDay = new Map();
  const pool = new Map();
  for (const row of Array.isArray(occurrences) ? occurrences : []) {
    const day = dayNumber(row?.date);
    if (day === null) continue;
    const list = byDay.get(day) ?? [];
    for (const e of Array.isArray(row.exercisePrescriptions) ? row.exercisePrescriptions : []) {
      if (!keyOf(e)) continue;
      list.push({ ...e, date: row.date });
      if (!pool.has(keyOf(e))) pool.set(keyOf(e), e);
    }
    byDay.set(day, list);
  }
  for (const c of Array.isArray(candidates) ? candidates : []) if (keyOf(c) && !pool.has(keyOf(c))) pool.set(keyOf(c), c);
  const warnings = [];
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    const next = byDay.get(day + 1);
    if (!next) continue;
    const today = byDay.get(day);
    const used = new Set([...today, ...next, ...(byDay.get(day + 2) ?? [])].map(keyOf));
    const todayKeys = new Set(today.map(keyOf));
    for (const e of next) {
      if (!todayKeys.has(keyOf(e))) continue;
      const section = e.section ?? 'main';
      const sameSection = [...pool.values()].filter((c) => (c.section ?? 'main') === section && !used.has(keyOf(c)));
      const replacement = sameSection.find((c) => e.muscleGroup && c.muscleGroup === e.muscleGroup) ?? (e.muscleGroup ? undefined : sameSection[0]);
      warnings.push({
        code: 'consecutive_day_repeat', date: e.date, previousDate: today[0].date, section, catalogId: e.catalogId ?? e.groupId ?? e.id,
        message: label(e) + ' (' + section + ') powtarza się w kolejnych dniach ' + today[0].date + ' i ' + e.date + '.',
        suggestedReplacement: replacement ? { catalogId: replacement.catalogId ?? replacement.groupId ?? replacement.id, title: label(replacement), section, ...(replacement.muscleGroup ? { muscleGroup: replacement.muscleGroup } : {}) } : null,
        fix: replacement ? 'Zamień w dniu ' + e.date + ' na ' + label(replacement) + ' (ta sama kategoria).' : 'Wyszukaj inne ćwiczenie tej samej kategorii przez gm_coach_find_exercise_candidates.'
      });
      if (replacement) used.add(keyOf(replacement));
    }
  }
  return { rule: 'Kolejne dni nie powtarzają tych samych ćwiczeń (także brzuch, rozgrzewka, rozciąganie).', status: warnings.length ? 'warning' : 'ok', warnings };
}
