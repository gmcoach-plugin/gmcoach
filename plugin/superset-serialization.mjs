export const MAX_SERIALIZED_LOGICAL_STEPS = 100;
import { resolveEvidenceEntryId } from './training-evidence.mjs';

function assertUniqueEntries(exercises) {
  const ids = exercises.map(resolveEvidenceEntryId);
  if (new Set(ids).size !== ids.length) throw new Error('Plan musi mieć unikalne rozwiązane entryId.');
}
const DEFAULT_ROUNDS = 3;
const DEFAULT_TRANSITION_REST_SECONDS = 1;
const DEFAULT_RECOVERY_REST_SECONDS = 90;
const MIN_MACHINE_REST_SECONDS = 1;
const MAX_MACHINE_REST_SECONDS = 600;
const MAX_ROUNDS = 12;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRest(value, fallback, label) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MACHINE_REST_SECONDS) {
    throw new RangeError(`${label} musi być całkowitą liczbą sekund od 0 do ${MAX_MACHINE_REST_SECONDS}.`);
  }
  // The machine does not persist a zero-second break. Treat zero as its 1 s floor.
  return Math.max(MIN_MACHINE_REST_SECONDS, value);
}

function normalizeRounds(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_ROUNDS) {
    throw new RangeError(`Liczba rund musi być całkowitą liczbą od 1 do ${MAX_ROUNDS}.`);
  }
  return value;
}

function normalizeMembers(members) {
  if (!Array.isArray(members) || members.length < 2 || members.length > 3) {
    throw new TypeError('Superseria musi zawierać 2 albo 3 ćwiczenia.');
  }

  const normalized = members.map((member, index) => {
    if (!isRecord(member) || !isRecord(member.exercise)) {
      throw new TypeError(`Ćwiczenie ${index + 1}: wymagany jest obiekt exercise.`);
    }

    const exerciseId = member.exercise.groupId ?? member.exercise.id;
    if (!Number.isSafeInteger(exerciseId) || exerciseId < 1) {
      throw new TypeError(`Ćwiczenie ${index + 1}: exercise musi zawierać dodatni groupId albo id.`);
    }

    if (typeof member.setupKey !== 'string' || !member.setupKey.trim()) {
      throw new TypeError(`Ćwiczenie ${index + 1}: wymagany jest potwierdzony, niepusty setupKey.`);
    }
    const setupKey = member.setupKey.trim();

    const hasSet = Object.hasOwn(member, 'set');
    const hasSets = Object.hasOwn(member, 'sets');
    if (hasSet === hasSets) {
      throw new TypeError(`Ćwiczenie ${index + 1}: podaj dokładnie jedno z set albo sets.`);
    }

    if (hasSet) {
      if (!isRecord(member.set)) throw new TypeError(`Ćwiczenie ${index + 1}: set musi być obiektem.`);
      return { exercise: { ...member.exercise }, setupKey, repeatedSet: { ...member.set }, progressiveSets: null };
    }

    if (!Array.isArray(member.sets) || member.sets.length < 1 || member.sets.some((set) => !isRecord(set))) {
      throw new TypeError(`Ćwiczenie ${index + 1}: sets musi być niepustą listą obiektów serii.`);
    }
    return {
      exercise: { ...member.exercise },
      setupKey,
      repeatedSet: null,
      progressiveSets: member.sets.map((set) => ({ ...set }))
    };
  });

  const setupKey = normalized[0].setupKey;
  if (normalized.some((member) => member.setupKey !== setupKey)) {
    throw new Error('Superseria zablokowana: ćwiczenia mają różne setupKey i wymagają zmiany ustawień maszyny.');
  }

  const progressiveLengths = normalized
    .filter((member) => member.progressiveSets !== null)
    .map((member) => member.progressiveSets.length);
  if (progressiveLengths.some((length) => length !== progressiveLengths[0])) {
    throw new Error('Superseria zablokowana: liczby serii ćwiczeń są różne, a kontrakt nie określa bezpiecznego sposobu pominięcia rundy.');
  }

  return { members: normalized, setupKey, progressiveRounds: progressiveLengths[0] ?? null };
}

/**
 * Expands a confirmed same-setup superset into the ordered single-set steps
 * understood by the reference client emulation contract.
 *
 * Each member is `{ exercise, setupKey, set }` for a repeated prescription, or
 * `{ exercise, setupKey, sets }` for per-round progressive prescriptions.
 * Uneven progressive set counts are rejected because the contract does not say
 * whether to skip or pad a member in a round. Scalar `set` prescriptions repeat
 * for every round. With no explicit rounds, progressive sets determine the round
 * count; all-scalar blocks default to three rounds.
 *
 * The returned `steps` list interleaves members in order, one set per step.
 * `restAfterSeconds` is 1 s (or the supplied transition floor) after each
 * non-final member, and recovery rest after the final member of every round.
 * The final round also carries recovery rest, matching the reference client contract's
 * documented `[transition, recovery]` pattern for each round.
 */
export function serializeSupersetBlock({
  members,
  rounds,
  transitionRestSeconds,
  recoveryRestSeconds
} = {}) {
  const normalized = normalizeMembers(members);
  const resolvedRounds = normalizeRounds(
    rounds ?? normalized.progressiveRounds ?? DEFAULT_ROUNDS
  );

  if (normalized.progressiveRounds !== null && normalized.progressiveRounds !== resolvedRounds) {
    throw new Error(`Superseria ma ${normalized.progressiveRounds} progresywnych serii na ćwiczenie, ale podano ${resolvedRounds} rund.`);
  }

  const transition = normalizeRest(
    transitionRestSeconds,
    DEFAULT_TRANSITION_REST_SECONDS,
    'transitionRestSeconds'
  );
  const recovery = normalizeRest(
    recoveryRestSeconds,
    DEFAULT_RECOVERY_REST_SECONDS,
    'recoveryRestSeconds'
  );

  const steps = [];
  for (let roundIndex = 0; roundIndex < resolvedRounds; roundIndex += 1) {
    normalized.members.forEach((member, memberIndex) => {
      const sourceSet = member.progressiveSets
        ? member.progressiveSets[roundIndex]
        : member.repeatedSet;
      // A block owns its rest pattern; discard any member-level rest to prevent
      // accidental long pauses inside a superset or contradictory instructions.
      const { rest: _rest, restSeconds: _restSeconds, ...set } = sourceSet;
      const isLastMemberInRound = memberIndex === normalized.members.length - 1;
      steps.push({
        round: roundIndex + 1,
        memberIndex,
        exercise: { ...member.exercise },
        set,
        restAfterSeconds: isLastMemberInRound ? recovery : transition
      });
    });
  }

  return {
    setupKey: normalized.setupKey,
    rounds: resolvedRounds,
    transitionRestSeconds: transition,
    recoveryRestSeconds: recovery,
    steps
  };
}

/**
 * Places ordinary exercise rows and expanded superset steps in the order the
 * saved-program serializer should send them to Speediance.
 */
export function expandPlanForSerialization(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.exercises)) {
    throw new TypeError('Plan do serializacji musi zawierać listę exercises.');
  }
  assertUniqueEntries(plan.exercises);
  const exerciseById = new Map(plan.exercises.map((exercise) => [resolveEvidenceEntryId(exercise), exercise]));
  const blockByMemberId = new Map();
  for (const block of plan.supersetBlocks || []) {
    if (!Array.isArray(block?.members) || !Array.isArray(block.steps)) {
      throw new TypeError('Superset block musi zawierać members i steps.');
    }
    for (const [memberIndex, member] of block.members.entries()) {
      const selected = exerciseById.get(member.exerciseId);
      if (!selected || (selected.section ?? 'main') !== 'main') throw new Error('Superserie wymagają istniejących wpisów sekcji main.');
      if (blockByMemberId.has(member.exerciseId)) throw new Error(`Ćwiczenie ${member.exerciseId} występuje w kilku blokach superserii.`);
      blockByMemberId.set(member.exerciseId, { block, memberIndex });
    }
  }
  const entries = [];
  for (const exercise of plan.exercises) {
    const membership = blockByMemberId.get(resolveEvidenceEntryId(exercise));
    if (!membership) {
      entries.push({ exercise, sets: exercise.sets, superset: false });
      continue;
    }
    if (membership.memberIndex !== 0) continue;
    for (const step of membership.block.steps) {
      const stepExercise = exerciseById.get(step.exercise?.entryId ?? step.exercise?.groupId);
      if (!stepExercise) throw new Error(`Superseria wskazuje nieznane ćwiczenie ${step.exercise?.groupId}.`);
      if ((stepExercise.section ?? 'main') !== 'main' || !membership.block.members.some(member => member.exerciseId === resolveEvidenceEntryId(stepExercise))) throw new Error('Krok superserii musi wskazywać członka bloku sekcji main.');
      if (!step.set || typeof step.set !== 'object' || !Number.isSafeInteger(step.restAfterSeconds)) {
        throw new Error('Krok superserii nie zawiera serii ani przerwy po serii.');
      }
      entries.push({ exercise: stepExercise, sets: [{ ...step.set, rest: step.restAfterSeconds }], superset: true });
    }
  }
  if (entries.reduce((total, entry) => total + entry.sets.length, 0) > MAX_SERIALIZED_LOGICAL_STEPS) {
    throw new Error('Plan rozwija się do ponad 100 kroków/serii API po zapisaniu superserii. Zmniejsz liczbę rund.');
  }
  return entries;
}

/** Validates typed superset groups against the normalized exercise plan. */
export function normalizeSupersetBlocks(rawBlocks, exercises) {
  if (rawBlocks === undefined) return [];
  if (!Array.isArray(rawBlocks) || rawBlocks.length > 3) {
    throw new Error('supersetBlocks musi zawierać od 0 do 3 bezpiecznie opisanych bloków.');
  }
  assertUniqueEntries(exercises);
  const exerciseById = new Map(exercises.map((exercise) => [resolveEvidenceEntryId(exercise), exercise]));
  const positionById = new Map(exercises.map((exercise, index) => [resolveEvidenceEntryId(exercise), index]));
  const assignedExerciseIds = new Set();
  return rawBlocks.map((rawBlock, blockIndex) => {
    if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock) || !Array.isArray(rawBlock.members) ||
        rawBlock.members.length < 2 || rawBlock.members.length > 3) {
      throw new Error(`Superseria ${blockIndex + 1}: wymagane są 2 albo 3 ćwiczenia.`);
    }
    const members = rawBlock.members.map((member, memberIndex) => {
      if (!member || typeof member !== 'object' || Array.isArray(member) ||
          !Number.isSafeInteger(member.exerciseId) || member.exerciseId < 1 ||
          typeof member.setupKey !== 'string' || !/^[A-Za-z0-9._:-]{1,80}$/.test(member.setupKey)) {
        throw new Error(`Superseria ${blockIndex + 1}, ćwiczenie ${memberIndex + 1}: wymagane jest prawidłowe exerciseId i potwierdzony setupKey.`);
      }
      const exercise = exerciseById.get(member.exerciseId);
      if (exercise && (exercise.section ?? 'main') !== 'main') throw new Error('Superserie są dostępne wyłącznie w sekcji main.');
      if (!exercise) throw new Error(`Superseria ${blockIndex + 1}: ID ćwiczenia ${member.exerciseId} nie występuje w planie.`);
      if (assignedExerciseIds.has(member.exerciseId)) throw new Error(`Superseria ${blockIndex + 1}: ćwiczenie ${member.exerciseId} występuje w więcej niż jednym bloku.`);
      assignedExerciseIds.add(member.exerciseId);
      return { exerciseId: member.exerciseId, setupKey: member.setupKey, exercise };
    });
    const orderedPositions = members.map(({ exerciseId }) => positionById.get(exerciseId));
    if (orderedPositions.some((position, index) => position !== orderedPositions[0] + index)) {
      throw new Error(`Superseria ${blockIndex + 1}: ćwiczenia muszą występować obok siebie i w tej samej kolejności co w exercises.`);
    }
    const matMembers = members.filter(({ setupKey }) => setupKey === 'mat-only');
    if (matMembers.some(({ exercise }) => exercise.loadType !== 'bodyweight')) {
      throw new Error(`Superseria ${blockIndex + 1}: setupKey=mat-only wymaga ćwiczenia bodyweight bez obciążenia.`);
    }
    const equipmentSetupKeys = [...new Set(members.filter(({ setupKey }) => setupKey !== 'mat-only').map(({ setupKey }) => setupKey))];
    if (equipmentSetupKeys.length > 1) {
      throw new Error(`Superseria ${blockIndex + 1}: zmienia wysokość, akcesorium albo setup sprzętu. Można połączyć ćwiczenia sprzętowe z matą, ale nie różne ustawienia urządzenia.`);
    }
    const effectiveSetupKey = equipmentSetupKeys[0] ?? 'mat-only';
    const serialized = serializeSupersetBlock({
      members: members.map(({ exercise }) => ({
        exercise: { groupId: exercise.id, entryId: resolveEvidenceEntryId(exercise), title: exercise.title },
        setupKey: effectiveSetupKey,
        sets: exercise.sets
      })),
      ...(rawBlock.rounds === undefined ? {} : { rounds: rawBlock.rounds }),
      ...(rawBlock.transitionRestSeconds === undefined ? {} : { transitionRestSeconds: rawBlock.transitionRestSeconds }),
      ...(rawBlock.recoveryRestSeconds === undefined ? {} : { recoveryRestSeconds: rawBlock.recoveryRestSeconds })
    });
    for (const step of serialized.steps) {
      const exercise = exerciseById.get(step.exercise.entryId ?? step.exercise.groupId);
      const setIndex = step.round - 1;
      if (!exercise?.sets[setIndex]) throw new Error(`Superseria ${blockIndex + 1}: nie można dopasować serii do rundy ${step.round}.`);
      exercise.sets[setIndex] = { ...exercise.sets[setIndex], rest: step.restAfterSeconds };
    }
    return {
      setupKey: effectiveSetupKey,
      setupDeclarationVersion: 1,
      setupDeclarationStatus: 'caller-declared-unverified',
      rounds: serialized.rounds,
      transitionRestSeconds: serialized.transitionRestSeconds,
      recoveryRestSeconds: serialized.recoveryRestSeconds,
      members: members.map(({ exerciseId, setupKey }) => ({ exerciseId, setupKey })),
      steps: serialized.steps
    };
  });
}
