// Reguła ogólna: tryby oporu (Eccentric, Chain) jako dźwignia progresji i nowy bodziec w blokach.
// Dobierane tylko tam, gdzie pasują do ćwiczenia i celu, 1–2 ćwiczenia na trening, nie w deloadzie, z uzasadnieniem.
// Zwraca wyłącznie informacje i propozycje; wyraźne życzenie użytkownika ma pierwszeństwo.
export const SPECIAL_MODES = Object.freeze({ 2: 'Chain', 3: 'Eccentric' });
export const MAX_SPECIAL_MODE_EXERCISES = 2;
const modesOf = (exercise) => [...new Set((exercise?.sets ?? []).map((s) => Number(s?.mode ?? s?.resistanceMode ?? 1)))];
const isSpecial = (exercise) => (exercise?.section ?? 'main') === 'main' && modesOf(exercise).some((m) => SPECIAL_MODES[m]);

/** occurrences: [{ sessionId?, week, deload?, exercisePrescriptions: [{ title, section, sets: [{ mode }] }] }] */
export function auditResistanceModes(occurrences, { experienceLevel, blocks = [], deloadWeeks = [] } = {}) {
  const rows = Array.isArray(occurrences) ? occurrences : [];
  const notices = [];
  const deload = new Set([...(deloadWeeks ?? []), ...blocks.filter((b) => b?.deload === true || /deload/i.test(String(b?.id ?? '') + String(b?.progression ?? ''))).flatMap((b) => { const out = []; for (let w = b.startWeek; w <= (b.endWeek ?? b.startWeek); w++) out.push(w); return out; })]);
  let specialTotal = 0;
  for (const row of rows) {
    const special = (row.exercisePrescriptions ?? []).filter(isSpecial);
    specialTotal += special.length;
    const label = row.sessionId ?? row.date ?? ('tydzień ' + row.week);
    if (special.length > MAX_SPECIAL_MODE_EXERCISES) notices.push({ code: 'resistance_modes_too_many', session: label, count: special.length, info: 'Tryb specjalny w ' + special.length + ' ćwiczeniach; zwykle wystarczą 1–2 na trening.' });
    if ((row.deload === true || deload.has(row.week)) && special.length) notices.push({ code: 'resistance_mode_in_deload', session: label, info: 'Deload zwykle w trybie Standard; tryb specjalny zostaw, tylko jeśli użytkownik tego chce.' });
  }
  const leversUsed = new Set(blocks.flatMap((b) => b?.progressionLevers ?? []));
  if (experienceLevel === 'advanced' && rows.length && specialTotal === 0 && blocks.filter((b) => !(b?.deload)).length >= 2 && !leversUsed.has('mode'))
    notices.push({ code: 'resistance_modes_unused_advanced', info: 'Zaawansowany cykl ma wyłącznie tryb Standard. Rozważ Eccentric (np. wyciskania, rozpiętki) albo Chain (np. hip thrust, przysiad) w 1–2 ćwiczeniach na trening w późniejszym bloku, z uzasadnieniem; deload w Standard.', fix: 'Dodaj dźwignię progressionLevers: ["mode"] w bloku i ustaw mode=3 (Eccentric) lub 2 (Chain) w wybranych seriach roboczych.' });
  return { rule: 'Tryby oporu jako dźwignia progresji: 1–2 ćwiczenia na trening, nie w deloadzie, z uzasadnieniem.', status: notices.length ? 'info' : 'ok', notices };
}
