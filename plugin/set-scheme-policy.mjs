// Reguły ogólne serii (bez blokad; wyraźne życzenie użytkownika ma pierwszeństwo):
// 1) Różne powtórzenia w kolejnych seriach (piramida, malejące/rosnące, top set + back-off) są dozwolone.
//    Speediance zapisuje powtórzenia osobno dla każdej serii, ale preset Smart RM (templatePresetId) jest jeden
//    na ćwiczenie. Schemat ułożony przez plugin jest dopasowywany do zakresu presetu (obcięcie do granic).
//    Schemat zażądany wprost przez użytkownika (userRequestedRepScheme) jest zachowany: serie spoza zakresu
//    trafiają do kolejnego wpisu tego samego ćwiczenia z presetem pasującym do ich powtórzeń.
// 2) Rozgrzewka z ciężarem ma krótsze przerwy niż serie robocze: domyślnie 45–60 s.
export const SMART_RM_REP_RANGES = Object.freeze({ 'Gain Muscle': [8, 12], Strength: [2, 8], Stamina: [13, 20] });
const GOAL_BY_PRESET = Object.freeze({ 'Gain Muscle': 'hypertrophy', Strength: 'strength', Stamina: 'endurance' });
const PRESET_BY_GOAL = Object.freeze({ hypertrophy: 'Gain Muscle', strength: 'Strength', endurance: 'Stamina' });
const inRange = (reps, preset) => reps >= SMART_RM_REP_RANGES[preset][0] && reps <= SMART_RM_REP_RANGES[preset][1];

export function classifyRepScheme(reps) {
  if (reps.length < 2 || reps.every((r) => r === reps[0])) return 'straight';
  if (reps[0] < reps[1] && reps.slice(1).every((r) => r === reps[1])) return 'top-set-backoff';
  if (reps.every((r, i) => i === 0 || r >= reps[i - 1])) return 'ascending-reps';
  if (reps.every((r, i) => i === 0 || r <= reps[i - 1])) return 'descending-reps';
  return 'pyramid';
}

export function presetForReps(reps, preferred) {
  if (preferred && SMART_RM_REP_RANGES[preferred] && inRange(reps, preferred)) return preferred;
  return ['Strength', 'Gain Muscle', 'Stamina'].find((p) => inRange(reps, p)) ?? null;
}

const clamp = (reps, preset) => Math.min(SMART_RM_REP_RANGES[preset][1], Math.max(SMART_RM_REP_RANGES[preset][0], reps));

/** Zwraca listę ćwiczeń zapisywalną przez Speediance i informacje (nigdy nie rzuca). */
export function applySetSchemePolicy(exercises, { primaryGoal } = {}) {
  const notices = [], out = [], requiredConversions = [];
  for (const [index, exercise] of (Array.isArray(exercises) ? exercises : []).entries()) {
    const preset = exercise?.loadType === 'smart-rm' ? (exercise.smartRmPresetName ?? PRESET_BY_GOAL[exercise.trainingGoal] ?? PRESET_BY_GOAL[primaryGoal]) : null;
    const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
    const clean = () => { const { userRequestedRepScheme: _u, ...rest } = exercise; return rest; };
    if (!preset || !SMART_RM_REP_RANGES[preset] || sets.every((s) => s?.unit !== 'reps' || inRange(s.reps, preset))) { out.push(exercise && typeof exercise === 'object' && 'userRequestedRepScheme' in exercise ? clean() : exercise); continue; }
    if (exercise.userRequestedRepScheme === true) {
      const unsupported = sets.map((set, setIndex) => ({ set, setIndex })).filter(({ set }) => set?.unit === 'reps' && !presetForReps(set.reps, preset));
      if (unsupported.length) {
        requiredConversions.push({ code: 'customize_weight_required', exercise: index + 1, entryId: exercise.entryId ?? exercise.id,
          requestedSets: unsupported.map(({ set, setIndex }) => ({ set: setIndex + 1, reps: set.reps })),
          requiredFields: ['weight', 'weightUnit'], targetLoadType: 'customize-manual',
          info: 'Zachowano żądane powtórzenia. Poza zakresem Smart RM przygotuj Customize z potwierdzonym ciężarem i jednostką; nie wysyłaj tego ćwiczenia jako Smart RM.' });
        out.push(exercise);
        continue;
      }
      const groups = [];
      for (const set of sets) {
        const fit = set?.unit === 'reps' ? presetForReps(set.reps, preset) : preset;
        const target = fit;
        const value = set;
        const last = groups.at(-1);
        if (last && last.preset === target) last.sets.push(value); else groups.push({ preset: target, sets: [value] });
      }
      for (const group of groups) out.push({ ...clean(), smartRmPresetName: group.preset, trainingGoal: GOAL_BY_PRESET[group.preset], sets: group.sets });
      if (groups.length > 1) notices.push({ code: 'rep_scheme_split_by_preset', exercise: index + 1, presets: groups.map((g) => g.preset + ' ' + g.sets.map((s) => s.reps).join('/')), info: 'Zachowano Twoje powtórzenia: Speediance ma jeden preset na ćwiczenie, więc serie zapisano jako kolejne wpisy tego ćwiczenia z presetami ' + groups.map((g) => g.preset).join(' → ') + '.' });
      continue;
    }
    const adjusted = sets.map((s) => s?.unit === 'reps' ? { ...s, reps: clamp(s.reps, preset) } : s);
    notices.push({ code: 'rep_scheme_fitted_to_preset', exercise: index + 1, preset, from: sets.map((s) => s.reps), to: adjusted.map((s) => s.reps), info: 'Powtórzenia dopasowano do zakresu ' + preset + ' ' + SMART_RM_REP_RANGES[preset].join('–') + '.' });
    out.push({ ...exercise, sets: adjusted });
  }
  return { exercises: out, notices, requiredConversions, status: requiredConversions.length ? 'needs-customize-weight' : 'ready' };
}

export function describeSetSchemes(exercises) {
  return (exercises ?? []).map((e, i) => ({ exercise: i + 1, scheme: classifyRepScheme((e.sets ?? []).filter((s) => s?.unit === 'reps').map((s) => s.reps)), ...(e.setSchemeReason ? { reason: e.setSchemeReason } : {}) })).filter((x) => x.scheme !== 'straight');
}

/** Rozgrzewka z ciężarem: krótsza przerwa. Uzupełnia brakującą przerwę i informuje, gdy jest >= roboczej (bez zmiany). */
export function applyWarmupRestPolicy(exercises) {
  const list = Array.isArray(exercises) ? exercises : [];
  const notices = [];
  const workRest = (exercise) => {
    const key = exercise.id ?? exercise.groupId;
    const work = list.find((e) => (e.section ?? 'main') === 'main' && (e.id ?? e.groupId) === key) ?? list.find((e) => (e.section ?? 'main') === 'main');
    const rests = (work?.sets ?? []).map((s) => s.restSeconds ?? s.rest).filter(Number.isFinite);
    return rests.length ? Math.min(...rests) : null;
  };
  const out = list.map((exercise, index) => {
    if (exercise?.section !== 'warmup' || !['customize-manual', 'fixed-kg', 'smart-rm', 'profile-auto'].includes(exercise.loadType)) return exercise;
    const work = workRest(exercise);
    const fallback = work === null ? 60 : Math.max(45, Math.min(60, Math.round(work / 2 / 15) * 15));
    return { ...exercise, sets: (exercise.sets ?? []).map((set, setIndex) => {
      const own = set.restSeconds ?? set.rest;
      if (own === undefined) { notices.push({ code: 'warmup_rest_default', exercise: index + 1, set: setIndex + 1, restSeconds: fallback, info: 'Przerwa rozgrzewki ustawiona na ' + fallback + ' s.' }); return { ...set, restSeconds: fallback }; }
      if (work !== null && own >= work) notices.push({ code: 'warmup_rest_not_shorter', exercise: index + 1, set: setIndex + 1, warmupRest: own, workRest: work, info: 'Przerwa rozgrzewki (' + own + ' s) nie jest krótsza od roboczej (' + work + ' s); zwykle wystarcza ' + fallback + ' s.' });
      return set;
    }) };
  });
  return { exercises: out, notices };
}
