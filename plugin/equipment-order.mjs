/** U1: equipment setup cost between consecutive exercises and a priority-preserving order proposal.
 * Equipment fields come from real saved-template readbacks: outPositionShow (cable arm position), accessories (ids),
 * foldingStoolAngle (bench angle), isUseDevice (uses GM cables). Never reorders automatically; it proposes. */
const accessorySet = value => new Set(String(value ?? '').split(',').map(cell => cell.trim()).filter(Boolean));
export function equipmentOf(meta) {
  if (!meta) return null;
  const position = Number(meta.outPositionShow);
  return { device: Number(meta.isUseDevice) === 1, position: Number.isFinite(position) && position > 0 ? position : null, accessories: accessorySet(meta.accessories), angle: meta.foldingStoolAngle ? String(meta.foldingStoolAngle) : null };
}
/** Number of setting changes between two exercises: cable arm position, accessory set, bench angle. Same exercise repeated (ramp-up -> work) costs 0. */
export function transitionCost(from, to) {
  if (!from || !to) return 0;
  let cost = 0;
  if (from.device && to.device && from.position !== null && to.position !== null && from.position !== to.position) cost++;
  const a = from.accessories, b = to.accessories;
  if (a.size !== b.size || [...a].some(id => !b.has(id))) cost++;
  if (from.angle !== null && to.angle !== null && from.angle !== to.angle) cost++;
  return cost;
}
export function countSetupChanges(exercises, lookup) {
  let changes = 0, previous = null;
  for (const exercise of exercises) {
    if (exercise.loadType === 'bodyweight' || exercise.unloaded === true) continue;
    const current = equipmentOf(lookup(exercise));
    if (previous && current) changes += transitionCost(previous, current);
    if (current) previous = current;
  }
  return changes;
}
const ISOLATION = /\b(curl|fly|flye|raise|extension|push ?down|pushdown|kickback|crunch|plank|pullover|shrug|abduction|adduction|calf|face pull|rotation|woodchop|twist)\b/i;
const COMPOUND = /\b(squat|deadlift|thrust|press|row|pulldown|pull-?down|pull-?up|chin-?up|lunge|step-?up|push-?up|dip|clean|snatch|good morning|bridge)\b/i;
/** Reviewed classes for every exercise in the real fixtures (tests/fixtures/real). */
export const EXERCISE_JOINT_CLASS = Object.freeze({
  'Belt Squat': 'compound', 'Barbell Hip Thrust': 'compound', 'Barbell Romanian Deadlift': 'compound', 'Dual-Handle Romanian Deadlift': 'compound',
  'Barbell Squat': 'compound', 'Bodyweight Bulgarian Split Squat': 'compound', 'Incline Dual-Handle Chest Press': 'compound', 'Incline Barbell Bench Press': 'compound',
  'Seated Barbell Row': 'compound', 'Floor Seated Dual-Handle Row': 'compound', 'Kneeling Dual-Handle Lat Pulldown': 'compound', 'Seated Barbell Shoulder Press': 'compound',
  'Standing Leg Curl': 'isolation', 'Dual-Handle Calf Raise': 'isolation', 'Standing Barbell Calf Raise': 'isolation', 'Alternating Oblique Crunch': 'isolation',
  'Bodyweight Plank': 'isolation', 'Side Plank': 'isolation', 'Straight Arm Barbell Crunch (Floor)': 'isolation', 'Incline Dual-Handle Low-to-High Chest Fly': 'isolation',
  'Standing Dual-Handle Low-to-High Chest Fly': 'isolation', 'Standing Single-Arm Rear Delt Fly': 'isolation', 'Standing Dual-Handle Lateral Raise': 'isolation',
  'Kneeling Tricep Rope Hammer Curl': 'isolation', 'Standing Barbell Triceps Push Down': 'isolation', 'Standing Barbell Biceps Curl': 'isolation'
});
/** 'compound' (multi-joint) or 'isolation'. Explicit movementClass/jointClass wins, then the reviewed map, then the movement name. */
export function classifyJoint(exercise, known = EXERCISE_JOINT_CLASS) {
  const explicit = exercise?.movementClass ?? exercise?.jointClass;
  if (explicit === 'compound' || explicit === 'isolation') return explicit;
  const title = String(exercise?.title ?? exercise?.name ?? '');
  if (known?.[title]) return known[title];
  if (ISOLATION.test(title)) return 'isolation';
  return COMPOUND.test(title) ? 'compound' : 'isolation';
}
/** Warmup first, stretching last; all multi-joint exercises before isolation exercises. The first main exercise (session
 * priority) and any exercise ramped up in the warmup lead the compound group; supersets stay together (a block is compound
 * if any member is). Setup changes are minimised only inside the compound group and inside the isolation group. */
export function proposeEquipmentOrder(exercises, lookup, { supersetBlocks = [], known = EXERCISE_JOINT_CLASS } = {}) {
  const warmup = exercises.filter(exercise => exercise.section === 'warmup');
  const stretching = exercises.filter(exercise => exercise.section === 'stretching');
  // Unloaded items (bodyweight, mobility, plank, activation) may be woven between main exercises on purpose;
  // they keep their place next to the same preceding loaded exercise and never count as setup changes or class violations.
  const unloaded = exercise => exercise.loadType === 'bodyweight' || exercise.unloaded === true;
  const allMain = exercises.filter(exercise => exercise.section !== 'warmup' && exercise.section !== 'stretching');
  const blockOf = new Map();
  for (const [index, block] of (supersetBlocks ?? []).entries()) {
    const members = block.exerciseIds ?? block.exercises ?? block.entryIds ??
      (Array.isArray(block.members) ? block.members.map(member => member?.exerciseId ?? member?.entryId ?? member?.id) : []);
    for (const id of members) blockOf.set(String(id), index);
  }
  const keyOf = exercise => String(exercise.entryId ?? exercise.id);
  const woven = allMain.map((exercise, index) => unloaded(exercise) && !blockOf.has(keyOf(exercise)) ?
    { exercise, after: allMain.slice(0, index).reverse().find(item => !unloaded(item)) ?? null } : null).filter(Boolean);
  const units = [];
  for (const exercise of allMain) {
    const block = blockOf.get(keyOf(exercise));
    if (unloaded(exercise) && block === undefined) continue;
    const last = units.at(-1);
    if (block !== undefined && last?.block === block) last.items.push(exercise);
    else units.push({ block, items: [exercise] });
  }
  const cls = unit => unit.items.some(item => classifyJoint(item, known) === 'compound') ? 'compound' : 'isolation';
  const key = item => String(item.actionLibraryId ?? item.id ?? item.groupId ?? item.catalogId ?? ('entry:' + (item.entryId ?? '')));
  const rampIds = new Set(warmup.filter(item => item.movementKind === 'strength' || ['smart-rm', 'customize-manual', 'profile-auto', 'fixed-kg'].includes(item.loadType)).map(key));
  const pinned = units.filter((unit, index) => index === 0 || unit.items.some(item => rampIds.has(key(item))));
  const compounds = units.filter(unit => !pinned.includes(unit) && cls(unit) === 'compound');
  const isolations = units.filter(unit => !pinned.includes(unit) && cls(unit) === 'isolation');
  const setups = unit => unit.items.filter(item => !unloaded(item)).map(item => equipmentOf(lookup(item))).filter(Boolean);
  const tail = unit => setups(unit).at(-1) ?? null, head = unit => setups(unit)[0] ?? null;
  const firstStretchExercise = stretching.find(exercise => !unloaded(exercise) && equipmentOf(lookup(exercise)));
  const firstStretch = firstStretchExercise ? equipmentOf(lookup(firstStretchExercise)) : null;
  const optimise = (rest, start, end) => {
    const pathCost = sequence => {
      let cost = 0, previous = start;
      for (const unit of sequence) for (const current of setups(unit)) {
        if (previous) cost += transitionCost(previous, current);
        previous = current;
      }
      if (previous && end) cost += transitionCost(previous, end);
      return cost;
    };
    if (rest.length <= 8) {
      // Exact search; ties keep the plan's original order (stable priority).
      let best = rest.slice(), bestCost = pathCost(rest);
      const permute = (prefix, remaining) => { if (!remaining.length) { const cost = pathCost(prefix); if (cost < bestCost) { bestCost = cost; best = prefix.slice(); } return; } for (let i = 0; i < remaining.length; i++) permute([...prefix, remaining[i]], [...remaining.slice(0, i), ...remaining.slice(i + 1)]); };
      permute([], rest); return best;
    }
    const out = [], pool = rest.slice(); let previous = start;
    while (pool.length) { let bestIndex = 0, bestCost = Infinity; pool.forEach((unit, index) => { const cost = previous ? transitionCost(previous, head(unit)) : 0; if (cost < bestCost) { bestCost = cost; bestIndex = index; } }); const [unit] = pool.splice(bestIndex, 1); out.push(unit); previous = tail(unit) ?? previous; }
    return out;
  };
  const lastLoadedWarmup = warmup.slice().reverse().find(exercise => !unloaded(exercise) && equipmentOf(lookup(exercise)));
  const startAfter = list => list.length ? tail(list.at(-1)) : lastLoadedWarmup ? equipmentOf(lookup(lastLoadedWarmup)) : null;
  const isolationProbe = isolations.length ? optimise(isolations, null, firstStretch) : [];
  const compoundOrder = [...pinned, ...optimise(compounds, startAfter(pinned), isolationProbe.length ? head(isolationProbe[0]) : firstStretch)];
  const isolationOrder = optimise(isolations, startAfter(compoundOrder), firstStretch);
  const loadedOrder = [...compoundOrder, ...isolationOrder].flatMap(unit => unit.items);
  const mainOrder = [...woven.filter(w => w.after === null).map(w => w.exercise)];
  for (const item of loadedOrder) { mainOrder.push(item); for (const w of woven) if (w.after === item) mainOrder.push(w.exercise); }
  const proposed = [...warmup, ...mainOrder, ...stretching];
  return { proposed, currentChanges: countSetupChanges(exercises, lookup), proposedChanges: countSetupChanges(proposed, lookup),
    groups: { compound: compoundOrder.flatMap(unit => unit.items).map(item => item.title), isolation: isolationOrder.flatMap(unit => unit.items).map(item => item.title), woven: woven.map(w => w.exercise.title) } };
}



