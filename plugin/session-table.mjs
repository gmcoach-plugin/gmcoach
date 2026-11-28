/** Compact, always-present session table for previews (first key of the response, so truncation never hides it). */
const MODE = { 1: 'Standard', 2: 'Chain', 3: 'Eccentric' };
const dose = set => set.unit === 'sec' || set.unit === 'seconds' ? (set.durationSeconds ?? set.amount) + ' s' : (set.reps ?? set.amount) + ' powt.';
function groupSets(sets, exercise) {
  const out = [];
  for (const set of sets ?? []) {
    const key = JSON.stringify([dose(set), ...['rirTarget','mode','side','weight','weightUnit','weightKg','level','intensity','serializedDisplayWeight','serializedDisplayUnit','calculatedLoad','loadUnit','dropSet'].map(key => set[key] ?? null), set.percentResolved ? [set.percentResolved.percent1RM, set.percentResolved.rmLevel, set.percentResolved.loadKg] : null, set.rest ?? set.restSeconds ?? null]);
    const last = out.at(-1);
    if (last && last.key === key) last.count++; else out.push({ key, count: 1, set });
  }
  return out.map(({ count, set }) => (count + '×' + dose(set)) + (set.dropSet === true ? ' [Drop set]' : '') + (set.side === 1 ? ' (L)' : set.side === 2 ? ' (P)' : '') + (set.rirTarget !== undefined ? ', RIR ' + set.rirTarget : '') + (set.weight !== undefined ? ', ' + set.weight + ' ' + (set.weightUnit ?? '') : set.weightKg !== undefined ? ', ' + set.weightKg + ' kg' : '') + (set.percentResolved ? ', ' + (exercise?.smartRmPresetName ?? set.percentResolved.presetName ?? 'Smart RM') + ' · ' + set.percentResolved.percent1RM + '% 1RM' + (set.percentResolved.loadKg == null ? ' · kg dobierze Speediance' : ' ≈ ' + set.percentResolved.loadKg + ' kg') : '') + (set.level !== undefined ? ', Vita level ' + set.level : '') + (set.intensity !== undefined ? ', intens. ' + set.intensity + '/10' : '') + ', przerwa ' + (set.rest ?? set.restSeconds ?? 0) + ' s' + (set.mode && set.mode !== 1 ? ', ' + (MODE[set.mode] ?? 'tryb ' + set.mode) : ''));
}
export function buildSessionTable(plan) {
  const load = exercise => exercise.loadType === 'smart-rm' ? 'Smart RM ' + (exercise.smartRmPresetName ?? '') : exercise.loadType === 'customize-manual' ? 'Customize' : exercise.loadType === 'bodyweight' ? 'masa ciała' : exercise.loadType ?? '';
  const row = exercise => ({ section: exercise.section ?? 'main', entryId: exercise.entryId ?? exercise.id, catalogId: exercise.id, actionLibraryId: exercise.actionLibraryId, ...(exercise.executionOccurrence === undefined ? {} : { executionOccurrence: exercise.executionOccurrence }), title: exercise.title ?? String(exercise.id), load: load(exercise).trim(), sets: groupSets(exercise.sets, exercise).join('; ') });
  const exercises = (plan?.exercises ?? []).map(row);
  // Rationale shown under the table for %1RM sets (goal, reps, RIR, 1RM source).
  const percentLoadNotes = (plan?.exercises ?? []).flatMap(exercise => [...new Set((exercise.sets ?? []).filter(set => set.percentResolved).map(set => set.percentResolved.preview))].map(note => (exercise.title ?? String(exercise.id)) + ': ' + note));
  return {
    name: plan?.name ?? null,
    warmup: exercises.filter(r => r.section === 'warmup'),
    main: exercises.filter(r => r.section !== 'warmup' && r.section !== 'stretching'),
    stretching: exercises.filter(r => r.section === 'stretching'),
    warmupNotes: (plan?.warmup?.items ?? []).filter(item => item.executionRef === undefined).map(item => [item.activity, item.dosage].filter(Boolean).join(' – ')),
    stretchingNotes: (plan?.postWorkoutStretching?.items ?? []).filter(item => item.executionRef === undefined).map(item => [item.target, item.method, item.dosage].filter(Boolean).join(' – ')),
    ...(percentLoadNotes.length ? { percentLoadNotes } : {}),
    exerciseCount: exercises.length,
    instruction: 'Pokaż użytkownikowi tę tabelę w całości w kolejności wykonania: rozgrzewka, główne, rozciąganie. L/P to osobne wykonane strony z własną dawką i przerwą; nie skracaj 45 s L + 45 s P do 1×45 s.' + (percentLoadNotes.length ? ' Pod tabelą pokaż percentLoadNotes (uzasadnienie %1RM: cel, powtórzenia, RIR, źródło 1RM); kg są wyliczeniem z 1RM, nie pomiarem.' : '')
  };
}

