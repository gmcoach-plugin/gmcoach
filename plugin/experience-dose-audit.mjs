// Poziom zaawansowania realnie zmienia dawkę. Audyt zgłasza plan zbyt łatwy (albo zbyt ciężki
// dla początkującego) jako ostrzeżenie z gotową poprawką. Progi są orientacyjne, zgodne z
// przeglądami dawki (objętość tygodniowa na partię, bliskość upadku); bramka naukowa pozostaje osobna.
export const EXPERIENCE_TARGETS = Object.freeze({
  beginner: { priorityWeeklySets: [6, 12], otherWeeklySets: [4, 10], rirIsolation: [1, 3], rirCompound: [2, 4], progressionRequired: true, intensityTechniques: false },
  intermediate: { priorityWeeklySets: [10, 16], otherWeeklySets: [6, 12], rirIsolation: [0, 2], rirCompound: [1, 3], progressionRequired: true, intensityTechniques: true },
  advanced: { priorityWeeklySets: [12, 22], otherWeeklySets: [8, 16], rirIsolation: [0, 2], rirCompound: [1, 3], progressionRequired: true, intensityTechniques: true }
});
export const PROGRESS_WORDING = 'Plan zbudowany pod progresję, kontrolowaną w kolejnych blokach.';
const norm = (v) => String(v ?? '').toLowerCase().trim();

/** week: [{exercises:[{section, muscleGroup, compound, sets:[{rirTarget, unit}]}]}] — jeden reprezentatywny tydzień roboczy. */
export function auditExperienceDose({ experienceLevel, week = [], priorityAreas = [], blocks = [], history = null } = {}) {
  const t = EXPERIENCE_TARGETS[experienceLevel];
  if (!t) return { experienceLevel: experienceLevel ?? 'unknown', status: 'not-assessed', warnings: [], wording: PROGRESS_WORDING };
  const warnings = [], perMuscle = new Map(), rirIssues = [];
  const priorities = new Set(priorityAreas.map(norm));
  for (const session of week) for (const e of session?.exercises ?? []) {
    if ((e.section ?? 'main') !== 'main' || !e.muscleGroup) continue;
    const m = norm(e.muscleGroup);
    perMuscle.set(m, (perMuscle.get(m) ?? 0) + (e.sets?.length ?? 0));
    const [lo, hi] = e.compound ? t.rirCompound : t.rirIsolation;
    const rirs = (e.sets ?? []).map((s) => s.rirTarget).filter(Number.isFinite);
    if (rirs.length && Math.min(...rirs) > hi) rirIssues.push({ muscleGroup: e.muscleGroup, compound: Boolean(e.compound), minRir: Math.min(...rirs), target: [lo, hi] });
    if (experienceLevel === 'beginner' && rirs.length && Math.max(...rirs) < lo) rirIssues.push({ muscleGroup: e.muscleGroup, compound: Boolean(e.compound), maxRir: Math.max(...rirs), target: [lo, hi], tooHard: true });
  }
  for (const [m, sets] of perMuscle) {
    const [lo, hi] = priorities.has(m) ? t.priorityWeeklySets : t.otherWeeklySets;
    if (sets < lo) warnings.push({ code: 'dose_too_low_for_level', muscleGroup: m, weeklySets: sets, target: [lo, hi], fix: 'Dodaj ' + (lo - sets) + ' serii roboczych tygodniowo dla ' + m + ' (cel ' + lo + '–' + hi + ', kontroluj regenerację).' });
    else if (sets > hi + (experienceLevel === 'advanced' ? 4 : 0)) warnings.push({ code: 'dose_high_for_level', muscleGroup: m, weeklySets: sets, target: [lo, hi], fix: 'Rozważ ograniczenie do ' + hi + ' serii tygodniowo dla ' + m + ' albo uzasadnij regeneracją.' });
  }
  for (const r of rirIssues) warnings.push(r.tooHard
    ? { code: 'rir_too_low_for_level', ...r, fix: 'Dla początkującego ustaw RIR ' + r.target[0] + '–' + r.target[1] + ' (' + r.muscleGroup + ').' }
    : { code: 'rir_too_high_for_level', ...r, fix: 'Ustaw RIR ' + r.target[0] + '–' + r.target[1] + ' (' + (r.compound ? 'wielostawowe' : 'izolacje') + ', ' + r.muscleGroup + ').' });
  if (t.progressionRequired) for (const b of blocks) if (!Array.isArray(b?.progressionLevers) || !b.progressionLevers.length) warnings.push({ code: 'progression_missing_for_level', blockId: b?.id, fix: 'Dodaj dźwignię progresji w bloku ' + b?.id + ' (np. reps, sets, duration, rir, set-scheme: top-set-backoff lub drop-set).' });
  if (history && history.stagnantBlocks >= 2) warnings.push({ code: 'stagnation_change_stimulus', stagnantBlocks: history.stagnantBlocks, fix: 'Ostatnie bloki bez postępu: zmień bodziec (inna dźwignia progresji, schemat serii, wariant ćwiczenia głównego) i rozważ deload.' });
  return { experienceLevel, status: warnings.length ? 'warning' : 'ok', targets: t, weeklySetsPerMuscle: Object.fromEntries(perMuscle), warnings, wording: PROGRESS_WORDING };
}
