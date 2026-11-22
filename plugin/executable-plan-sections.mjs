const SECTIONS = ['warmup', 'main', 'stretching'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Entry identity is local plan metadata, distinct from the catalog group ID. */
export function normalizeExerciseEntry(exercise) {
  if (!object(exercise)) throw new TypeError('Exercise entry must be an object.');
  const entryId = exercise.entryId ?? exercise.id;
  const section = exercise.section ?? 'main';
  if (!Number.isSafeInteger(entryId) || entryId < 1) throw new TypeError('entryId must be a positive safe integer.');
  if (!SECTIONS.includes(section)) throw new TypeError('section must be warmup, main or stretching.');
  return { entryId, section };
}

export function normalizePlanEntryIdentity(exercises) {
  if (!Array.isArray(exercises) || exercises.length < 1 || exercises.length > 200) throw new TypeError('Exercises must contain between 1 and 200 entries.');
  const normalized = exercises.map(normalizeExerciseEntry);
  if (new Set(normalized.map(entry => entry.entryId)).size !== normalized.length) throw new Error('Plan entryId values must be unique, including repeated catalog exercises.');
  return normalized;
}

/** Validate executable section membership/order; never reorder or infer IDs from notes. */
export function validateExecutablePlanSections(plan) {
  if (!object(plan)) throw new TypeError('Plan must be an object.');
  const identities = normalizePlanEntryIdentity(plan.exercises);
  const entries = new Map(identities.map(entry => [entry.entryId, entry]));
  let previous = -1;
  for (const entry of identities) {
    const rank = SECTIONS.indexOf(entry.section);
    if (rank < previous) throw new Error('Executable entries must be ordered warmup, main, stretching.');
    previous = rank;
  }
  if (!identities.some(entry => entry.section === 'main')) throw new Error('Plan requires at least one main exercise entry.');
  const coverage = {};
  for (const [field, section] of [['warmup', 'warmup'], ['postWorkoutStretching', 'stretching']]) {
    const block = plan[field];
    if (!object(block) || !['included', 'omitted_user_preference'].includes(block.status) || !Array.isArray(block.items) || block.items.length > 30) {
      throw new Error(`${field} requires explicit status and a bounded item list.`);
    }
    const sectionEntries = identities.filter(entry => entry.section === section);
    if (block.status === 'omitted_user_preference') {
      if (block.items.length || sectionEntries.length) throw new Error(`${field} opt-out cannot retain instructions or executable entries.`);
      coverage[field] = { status: block.status, entryIds: [] };
      continue;
    }
    if (!block.items.length || !sectionEntries.length) throw new Error(`${field} included requires executable catalog entries, not notes alone.`);
    const refs = block.items.map(item => {
      if (!object(item) || !Number.isSafeInteger(item.executionRef) || item.executionRef < 1) throw new Error(`${field} item requires a positive executionRef.`);
      const entry = entries.get(item.executionRef);
      if (!entry || entry.section !== section) throw new Error(`${field} executionRef must identify an entry in the same section.`);
      return item.executionRef;
    });
    if (new Set(refs).size !== refs.length) throw new Error(`${field} executionRef values must be unique.`);
    if (sectionEntries.some(entry => !refs.includes(entry.entryId))) throw new Error(`${field} has executable entries without a matching section item.`);
    coverage[field] = { status: block.status, entryIds: refs };
  }
  return { executableSectionsValidated: true, entryCount: identities.length, mainEntryIds: identities.filter(entry => entry.section === 'main').map(entry => entry.entryId), ...coverage };
}
