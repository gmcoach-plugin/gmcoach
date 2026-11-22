/** Compact, always-present session table for previews (first key of the response, so truncation never hides it). */
const MODE = { 1: 'Standard', 2: 'Chain', 3: 'Eccentric' };
const dose = set => set.unit === 'sec' || set.unit === 'seconds' ? (set.durationSeconds ?? set.amount) + ' s' : (set.reps ?? set.amount) + ' powt.';
function groupSets(sets) {
  const out = [];
  for (const set of sets ?? []) {
    const key = JSON.stringify([dose(set), ...['rirTarget','mode','side','weight','weightUnit','weightKg','level','intensity','serializedDisplayWeight','serializedDisplayUnit','calculatedLoad','loadUnit'].map(key => set[key] ?? null), set.rest ?? set.restSeconds ?? null]);
    const last = out.at(-1);
    if (last && last.key === key) last.count++; else out.push({ key, count: 1, set });
  }
  return out.map(({ count, set }) => (count + '×' + dose(set)) + (set.side === 1 ? ' (L)' : set.side === 2 ? ' (P)' : '') + (set.rirTarget !== undefined ? ', RIR ' + set.rirTarget : '') + (set.weight !== undefined ? ', ' + set.weight + ' ' + (set.weightUnit ?? '') : set.weightKg !== undefined ? ', ' + set.weightKg + ' kg' : '') + (set.level !== undefined ? ', Vita level ' + set.level : '') + (set.intensity !== undefined ? ', intens. ' + set.intensity + '/10' : '') + ', przerwa ' + (set.rest ?? set.restSeconds ?? 0) + ' s' + (set.mode && set.mode !== 1 ? ', ' + (MODE[set.mode] ?? 'tryb ' + set.mode) : ''));
}
export function buildSessionTable(plan) {
  const load = exercise => exercise.loadType === 'smart-rm' ? 'Smart RM ' + (exercise.smartRmPresetName ?? '') : exercise.loadType === 'customize-manual' ? 'Customize' : exercise.loadType === 'bodyweight' ? 'masa ciała' : exercise.loadType ?? '';
  const row = exercise => ({ section: exercise.section ?? 'main', entryId: exercise.entryId ?? exercise.id, catalogId: exercise.id, actionLibraryId: exercise.actionLibraryId, ...(exercise.executionOccurrence === undefined ? {} : { executionOccurrence: exercise.executionOccurrence }), title: exercise.title ?? String(exercise.id), load: load(exercise).trim(), sets: groupSets(exercise.sets).join('; ') });
  const exercises = (plan?.exercises ?? []).map(row);
  return {
    name: plan?.name ?? null,
    warmup: exercises.filter(r => r.section === 'warmup'),
    main: exercises.filter(r => r.section !== 'warmup' && r.section !== 'stretching'),
    stretching: exercises.filter(r => r.section === 'stretching'),
    warmupNotes: (plan?.warmup?.items ?? []).filter(item => item.executionRef === undefined).map(item => [item.activity, item.dosage].filter(Boolean).join(' – ')),
    stretchingNotes: (plan?.postWorkoutStretching?.items ?? []).filter(item => item.executionRef === undefined).map(item => [item.target, item.method, item.dosage].filter(Boolean).join(' – ')),
    exerciseCount: exercises.length,
    instruction: 'Pokaż użytkownikowi tę tabelę w całości w kolejności wykonania: rozgrzewka, główne, rozciąganie. L/P to osobne wykonane strony z własną dawką i przerwą; nie skracaj 45 s L + 45 s P do 1×45 s.'
  };
}

