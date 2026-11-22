const textFields = {
  primaryGoal: 300,
  goalTimeline: 300,
  sexOrRelevantContext: 100,
  otherActivities: 500,
  currentProgram: 1000,
  trainingHistorySummary: 1500,
  trainingResponse: 500,
  equipmentConfirmation: 500,
  machineModel: 100,
  preferredTrainingStyle: 500,
  trainingStyleRationale: 500,
  exercisePreferences: 500,
  exerciseRestrictions: 500,
  supersetPreferences: 300,
  resistanceModePreferences: 250,
  warmupMobilityPreferences: 300,
  cardioContext: 300,
  injuryLimitations: 1000,
  nutritionContext: 500,
  weightTrend: 300,
  recoveryContext: 500,
  additionalTrainingContext: 3000
};

const trainingStyleStatusValues = ['specified', 'coach-choice', 'unknown', 'declined'];
const weekdayValues = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const experienceValues = ['beginner', 'intermediate', 'advanced', 'unknown'];
const optionalPreferenceValues = ['yes', 'no', 'ask', 'decline', 'not_applicable'];
const obliquesValues = optionalPreferenceValues;
const priorityAreasStatusValues = ['specific', 'none', 'unsure', 'decline'];
const trainingHistoryStatusValues = ['user_summary', 'reviewed_speediance', 'unknown', 'unavailable', 'declined'];
const energyBalanceValues = ['deficit', 'maintenance', 'surplus', 'unknown'];
const equipmentOwnershipValues = ['complete', 'partial', 'unknown'];
export const CONFIRMED_CUSTOMIZE_ANCHOR_SOURCES = Object.freeze(['speediance-assessment', 'speediance-statistics', 'saved-profile', 'user-confirmed']);
const strengthAnchorSourceValues = [...CONFIRMED_CUSTOMIZE_ANCHOR_SOURCES, 'recent-history'];

const numericFields = {
  ageYears: { minimum: 13, maximum: 120, integer: true },
  trainingAgeMonths: { minimum: 0, maximum: 900, integer: true },
  sessionsPerWeek: { minimum: 1, maximum: 7, integer: true },
  sessionMinutes: { minimum: 10, maximum: 240, integer: true },
  weeklyMinutes: { minimum: 0, maximum: 1680, integer: true },
  preferredBlockWeeks: { minimum: 1, maximum: 52, integer: true },
  bodyMassKg: { minimum: 20, maximum: 500 },
  heightCm: { minimum: 80, maximum: 250 },
  targetBodyMassKg: { minimum: 20, maximum: 500 },
  averageCaloriesKcal: { minimum: 500, maximum: 10000, integer: true },
  sleepHoursAverage: { minimum: 0, maximum: 24 }
};

export const trainingProfileDataSchema = Object.freeze({
  type: 'object',
  minProperties: 1,
  properties: {
    trainingStyleStatus: { type: 'string', enum: trainingStyleStatusValues, description: 'Osobna jawna odpowiedź o stylu treningu: specified wymaga preferredTrainingStyle; coach-choice wymaga trainingStyleRationale opisującego zgodę na dobór przez trenera; unknown/declined oznacza odpowiedź bez preferowanego stylu. Ograniczenia ruchowe nie zastępują tej odpowiedzi.' },
    preferredTrainingStyle: { type: 'string', minLength: 1, maxLength: 500, description: 'Dokładna preferencja użytkownika dotycząca organizacji lub charakteru treningu, bez narzuconego katalogu stylów.' },
    trainingStyleRationale: { type: 'string', minLength: 1, maxLength: 500, description: 'Zwięzłe uzasadnienie lub jawna zgoda na wybór stylu przez trenera; nie dopisuj zgody za użytkownika.' },
    primaryGoal: { type: 'string', minLength: 1, maxLength: 300 },
    finalRecoveryRequired: { type: 'boolean', description: 'Jawna preferencja osoby: true wymaga wykonywalnego deloadu lub uzasadnionego tygodnia odpoczynku na końcu planu. Dawka wymaga indywidualnych dowodów; nie jest to uniwersalny wymóg naukowy.' },
    goalTimeline: { type: 'string', maxLength: 300 },
    priorityAreas: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 60 } },
    priorityAreasStatus: { type: 'string', enum: priorityAreasStatusValues, description: 'Jawna odpowiedź o priorytetowej partii: specific wymaga nazw w priorityAreas; none oznacza brak dodatkowego fokusu; unsure/decline to odpowiedź nieokreślona albo odmowa.' },
    experienceLevel: { type: 'string', enum: experienceValues },
    ageYears: { type: 'integer', minimum: 13, maximum: 120 },
    ageDisclosure: { type: 'string', enum: ['decline'], description: 'Ustaw decline, jeśli użytkownik nie chce podać wieku; nie zapisuj dokładnej daty urodzenia.' },
    sexOrRelevantContext: { type: 'string', maxLength: 100 },
    trainingAgeMonths: { type: 'integer', minimum: 0, maximum: 900 },
    sessionsPerWeek: { type: 'integer', minimum: 1, maximum: 7 },
    preferredWeekdays: { type: 'array', maxItems: 7, uniqueItems: true, items: { type: 'string', enum: weekdayValues } },
    preferredWeekdaysStatus: { type: 'string', enum: ['specific', 'flexible', 'unknown', 'decline'], description: 'Odpowiedź o dniach treningu. specific wymaga preferredWeekdays; flexible oznacza brak stałych dni; unknown lub decline to jawna odpowiedź bez wskazanych dni.' },
    sessionMinutes: { type: 'integer', minimum: 10, maximum: 240 },
    sessionMinutesStatus: { type: 'string', enum: ['unknown', 'decline', 'unlimited'], description: 'Jawna odpowiedź zamiast limitu pojedynczej sesji: unknown = nieznany, decline = odmowa, unlimited = użytkownik wyraźnie nie ustala limitu czasu. Nadal oszacuj czas; unlimited nie oznacza zmieszczenia w limicie ani braku limitu tygodniowego. Nie łącz z sessionMinutes.' },
    weeklyMinutes: { type: 'integer', minimum: 0, maximum: 1680 },
    preferredBlockWeeks: { type: 'integer', minimum: 1, maximum: 52 },
    currentProgram: { type: 'string', maxLength: 1000 },
    trainingHistorySummary: { type: 'string', maxLength: 1500, description: 'Zwięzłe wnioski z treningu; nie kopia całej historii API.' },
    trainingHistoryStatus: { type: 'string', enum: trainingHistoryStatusValues, description: 'Jawny status historii: user_summary/reviewed_speediance wymaga podania trainingHistorySummary (krótki opis) albo currentProgram; unknown/unavailable/declined oznacza, że nie ma potwierdzonej historii. Sam trainingAgeMonths nie zastępuje historii.' },
    trainingResponse: { type: 'string', maxLength: 500 },
    otherActivities: { type: 'string', maxLength: 500 },
    equipmentConfirmation: { type: 'string', maxLength: 500, description: 'Sprzęt potwierdzony przez użytkownika; nie oznacza danych pobranych z chmury Speediance.' },
    ownedEquipmentNames: { type: 'array', maxItems: 100, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 100 }, description: 'Nazwy akcesoriów potwierdzonych przez użytkownika na podstawie katalogu Speediance.' },
    equipmentOwnershipStatus: { type: 'string', enum: equipmentOwnershipValues, description: 'complete: użytkownik potwierdził pełną listę; partial: potwierdził tylko wymienione elementy; unknown: brak potwierdzenia.' },
    strengthAnchors: {
      type: 'array', maxItems: 500,
      description: 'Kotwice siłowe zebrane dla dokładnego ćwiczenia i, gdy dostępne, wariantu actionLibraryId. Kotwica bez actionLibraryId odnosi się do grupy ćwiczenia; wariant potwierdza się oddzielnie w katalogu. Wspólny schemat pozwala importować raz dane z innego trenera, a później używać ich lokalnie; dane nie trafiają do kodu pluginu ani do innych profili.',
      items: {
        type: 'object', additionalProperties: false,
        required: ['groupId', 'exerciseName', 'unit', 'source'],
        properties: {
          groupId: { type: 'integer', minimum: 1 },
          actionLibraryId: { type: 'integer', minimum: 1, description: 'Opcjonalny dokładny wariant Speediance, jeśli źródło kotwicy jawnie go podaje. Bez tego pola kotwica dotyczy groupId; wariant ćwiczenia potwierdza się niezależnie w katalogu.' },
          exerciseName: { type: 'string', minLength: 1, maxLength: 120 },
          unit: { type: 'string', enum: ['kg', 'lb'] },
          // Keep the old value readable in local files, but prohibit new profile
          // writes from treating an unverified session record as an anchor.
          source: { type: 'string', enum: strengthAnchorSourceValues.filter((source) => source !== 'recent-history') },
          oneRepMax: { type: 'number', exclusiveMinimum: 0, maximum: 1000 },
          anchorKind: { type: 'string', enum: ['reported-oneRepMax', 'estimated-e1RM'] },
          workingWeight: { type: 'number', exclusiveMinimum: 0, maximum: 1000 },
          workingReps: { type: 'integer', minimum: 1, maximum: 20 },
          workingRir: { type: 'integer', minimum: 0, maximum: 5, description: 'Opcjonalny RIR z tej konkretnej serii roboczej.' },
          observedAt: { type: 'string', format: 'date-time' }
        },
        oneOf: [
          { required: ['oneRepMax'], not: { anyOf: [{ required: ['workingWeight'] }, { required: ['workingReps'] }] } },
          { required: ['workingWeight', 'workingReps'], not: { required: ['oneRepMax'] } }
        ]
      }
    },
    machineLimits: {
      type: 'object', additionalProperties: false, minProperties: 2,
      required: ['model', 'unit'],
      description: 'Potwierdzone limity konkretnej maszyny z profilu lub importu; używaj wyłącznie, gdy model i jednostka są znane.',
      properties: {
        model: { type: 'string', minLength: 1, maxLength: 80 },
        maxBarbell: { type: 'number', exclusiveMinimum: 0, maximum: 2000 },
        maxCable: { type: 'number', exclusiveMinimum: 0, maximum: 2000 },
        unit: { type: 'string', enum: ['kg', 'lb'] }
      }
    },
    machineModel: { type: 'string', maxLength: 100, description: 'Model tylko, jeśli użytkownik lub wiarygodne API go potwierdziło.' },
    exercisePreferences: { type: 'string', maxLength: 500 },
    exerciseRestrictions: { type: 'string', maxLength: 500 },
    supersetPreferences: { type: 'string', maxLength: 300 },
    resistanceModePreferences: { type: 'string', maxLength: 250 },
    warmupMobilityPreferences: { type: 'string', maxLength: 300 },
    bodyweightPreference: { type: 'string', enum: optionalPreferenceValues, description: 'Preferencja ćwiczeń z masą ciała: yes/no/ask, albo jawne decline/not_applicable.' },
    absPreference: { type: 'string', enum: optionalPreferenceValues, description: 'Preferencja ćwiczeń brzucha: yes/no/ask, albo jawne decline/not_applicable.' },
    obliquesPreference: { type: 'string', enum: obliquesValues },
    warmupPreference: { type: 'string', enum: optionalPreferenceValues, description: 'Rozgrzewka: yes/no/ask, albo jawne decline/not_applicable.' },
    stretchingPreference: { type: 'string', enum: optionalPreferenceValues, description: 'Rozciąganie po treningu: yes/no/ask, albo jawne decline/not_applicable.' },
    cardioPreference: { type: 'string', enum: optionalPreferenceValues, description: 'Cardio w planie: yes/no/ask, albo jawne decline/not_applicable.' },
    cardioContext: { type: 'string', maxLength: 300, description: 'Rodzaj, częstotliwość lub ograniczenia cardio podane przez użytkownika.' },
    blockLengthPreference: { type: 'string', enum: ['recommend', 'ask', 'custom'], description: 'Użytkownik może poprosić o rekomendowaną długość bloku; custom wymaga preferredBlockWeeks.' },
    bodyMassKg: { type: 'number', minimum: 20, maximum: 500 },
    heightCm: { type: 'number', minimum: 80, maximum: 250 },
    targetBodyMassKg: { type: 'number', minimum: 20, maximum: 500 },
    averageCaloriesKcal: { type: 'integer', minimum: 500, maximum: 10000 },
    energyBalance: { type: 'string', enum: energyBalanceValues },
    weightTrend: { type: 'string', maxLength: 300 },
    injuryLimitations: { type: 'string', maxLength: 1000, description: 'Tylko ruchy dozwolone/ograniczone i zgłoszone ograniczenia; nie zapisuj diagnoz ani dokumentacji medycznej.' },
    nutritionContext: { type: 'string', maxLength: 500, description: 'Opcjonalny kontekst podany przez użytkownika, np. orientacyjna kaloryczność lub trend masy; nie zapisuj dziennika posiłków.' },
    sleepHoursAverage: { type: 'number', minimum: 0, maximum: 24 },
    recoveryContext: { type: 'string', maxLength: 500 },
    additionalTrainingContext: { type: 'string', maxLength: 3000, description: 'Pozostałe ważne preferencje i fakty treningowe podane przez użytkownika, które nie pasują do pól powyżej; zwięzłe podsumowanie, bez surowego transcriptu i identyfikatorów.' },
    interviewComplete: { type: 'boolean' }
  },
  additionalProperties: false
});

export const trainingProfileFieldNames = Object.freeze(Object.keys(trainingProfileDataSchema.properties));

export function findStoredStrengthAnchor(strengthAnchors, groupId, exerciseName, actionLibraryId) {
  if (!Array.isArray(strengthAnchors) || !Number.isSafeInteger(groupId) || typeof exerciseName !== 'string') return null;
  const expected = exerciseName.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  if (actionLibraryId !== undefined && (!Number.isSafeInteger(actionLibraryId) || actionLibraryId < 1)) return null;
  const sameExercise = strengthAnchors.filter((anchor) => anchor?.groupId === groupId &&
    typeof anchor?.exerciseName === 'string' &&
    anchor.exerciseName.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') === expected);
  const exactVariantMatches = actionLibraryId === undefined
    ? []
    : sameExercise.filter((anchor) => anchor?.actionLibraryId === actionLibraryId);
  // An unbound legacy anchor can be considered only as a fallback. The final
  // template preparation checks that the API exposes exactly one variant.
  const matches = actionLibraryId === undefined
    ? sameExercise
    : exactVariantMatches.length > 0
      ? exactVariantMatches
      : sameExercise.filter((anchor) => anchor?.actionLibraryId === undefined);
  if (matches.length !== 1) return null;
  const anchor = matches[0];
  const storedName = typeof anchor.exerciseName === 'string'
    ? anchor.exerciseName.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
    : '';
  if (!storedName || storedName !== expected || !['kg', 'lb'].includes(anchor.unit) ||
      !strengthAnchorSourceValues.includes(anchor.source) || anchor.source === 'recent-history' ||
      (anchor.workingRir !== undefined && (!Number.isSafeInteger(anchor.workingRir) || anchor.workingRir < 0 || anchor.workingRir > 5))) return null;
  const oneRepMax = typeof anchor.oneRepMax === 'number' && Number.isFinite(anchor.oneRepMax) && anchor.oneRepMax > 0
    ? { oneRepMax: anchor.oneRepMax }
    : null;
  const workingSet = typeof anchor.workingWeight === 'number' && Number.isFinite(anchor.workingWeight) && anchor.workingWeight > 0 &&
    Number.isSafeInteger(anchor.workingReps) && anchor.workingReps >= 1 && anchor.workingReps <= 20
    ? { workingWeight: anchor.workingWeight, workingReps: anchor.workingReps, ...(anchor.workingRir === undefined ? {} : { workingRir: anchor.workingRir }) }
    : null;
  if (Boolean(oneRepMax) === Boolean(workingSet)) return null;
  if (anchor.anchorKind !== undefined && (!oneRepMax || !['reported-oneRepMax', 'estimated-e1RM'].includes(anchor.anchorKind))) return null;
  return {
    ...(oneRepMax || workingSet),
    ...(anchor.anchorKind === undefined ? {} : { anchorKind: anchor.anchorKind }),
    ...(anchor.actionLibraryId === undefined ? {} : { actionLibraryId: anchor.actionLibraryId }),
    ...(anchor.observedAt === undefined ? {} : { observedAt: anchor.observedAt }),
    unit: anchor.unit,
    source: anchor.source
  };
}

/** Resolve a static-load anchor only from the persisted local profile.
 * Tool input may repeat the value returned by the profile, but cannot create
 * or alter a trusted anchor by labeling an arbitrary value as saved-profile.
 */
export function resolveProfileStrengthAnchor({
  strengthAnchors,
  groupId,
  exerciseName,
  actionLibraryId,
  providedAnchor
}) {
  const stored = findStoredStrengthAnchor(strengthAnchors, groupId, exerciseName, actionLibraryId);
  if (providedAnchor === undefined) return stored;
  if (!providedAnchor || typeof providedAnchor !== 'object' || Array.isArray(providedAnchor)) {
    throw new Error('Kotwica z wywołania musi odpowiadać prawidłowej kotwicy zapisanej w lokalnym profilu.');
  }
  const trustedFields = [
    'oneRepMax', 'anchorKind', 'workingWeight', 'workingReps', 'workingRir', 'actionLibraryId', 'unit', 'source'
  ];
  if (!stored || trustedFields.some((field) => providedAnchor[field] !== stored[field])) {
    throw new Error('Nie można użyć kotwicy siłowej podanej wyłącznie w planie. Zapisz i potwierdź ją w profilu GM Coach, a potem ponów podgląd.');
  }
  return {
    ...stored,
    ...(providedAnchor.repMaxCurve === undefined ? {} : { repMaxCurve: providedAnchor.repMaxCurve })
  };
}

/** reference client preferences and the strength statistics endpoint key anchors by
 * exercise group; the catalog variant is selected independently. Preserve an
 * explicitly variant-scoped anchor, but do not invent a variant requirement
 * for a group-scoped one. This checks scope, not physical calibration.
 */
export function assertStrengthAnchorMatchesActionVariant(anchor, selectedActionLibraryId, availableActionLibraryIds) {
  const variants = [...new Set((Array.isArray(availableActionLibraryIds) ? availableActionLibraryIds : [])
    .filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!Number.isSafeInteger(selectedActionLibraryId) || selectedActionLibraryId < 1 || !variants.includes(selectedActionLibraryId)) {
    throw new Error('Nie można potwierdzić wariantu API wybranego dla kotwicy siłowej.');
  }
  if (anchor?.actionLibraryId !== undefined && anchor.actionLibraryId !== selectedActionLibraryId) {
    throw new Error(`Kotwica siłowa należy do wariantu ${anchor.actionLibraryId}, a plan wybrał wariant ${selectedActionLibraryId}. Wybierz kotwicę dla dokładnego wariantu.`);
  }
  return true;
}

// Reconcile mutually exclusive saved and ephemeral intake choices without persisting them.
export function reconcileTrainingStyleAnswers(existing = {}, answers = {}) {
  const merged = { ...existing, ...answers };
  if (Object.hasOwn(answers,'sessionMinutes')) delete merged.sessionMinutesStatus;
  if (Object.hasOwn(answers,'sessionMinutesStatus')) delete merged.sessionMinutes;
  if (Object.hasOwn(answers,'ageYears')) delete merged.ageDisclosure;
  if (Object.hasOwn(answers,'ageDisclosure')) delete merged.ageYears;
  if (Object.hasOwn(answers,'priorityAreasStatus') && answers.priorityAreasStatus !== 'specific' && !Object.hasOwn(answers,'priorityAreas')) delete merged.priorityAreas;
  if (Object.hasOwn(answers,'priorityAreas') && !Object.hasOwn(answers,'priorityAreasStatus') && ['none','unsure','decline'].includes(merged.priorityAreasStatus)) delete merged.priorityAreasStatus;
  if (Object.hasOwn(answers,'preferredWeekdays') && !Object.hasOwn(answers,'preferredWeekdaysStatus')) merged.preferredWeekdaysStatus='specific';
  if (['flexible','unknown','decline'].includes(answers.preferredWeekdaysStatus)) delete merged.preferredWeekdays;
  if (Object.hasOwn(answers, 'trainingStyleStatus')) {
    delete merged.preferredTrainingStyle;
    delete merged.trainingStyleRationale;
    if (answers.trainingStyleStatus === 'specified' && Object.hasOwn(answers, 'preferredTrainingStyle')) merged.preferredTrainingStyle = answers.preferredTrainingStyle;
    if (answers.trainingStyleStatus === 'coach-choice' && Object.hasOwn(answers, 'trainingStyleRationale')) merged.trainingStyleRationale = answers.trainingStyleRationale;
  }
  return merged;
}

export function normalizeTrainingProfileData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('profile_data musi być obiektem z odpowiedziami wywiadu.');
  }
  const keys = Object.keys(data);
  if (!keys.length) throw new Error('Podaj przynajmniej jedną informację do zapisania.');
  const allowed = new Set([
    'trainingStyleStatus', 'preferredTrainingStyle', 'trainingStyleRationale', 'primaryGoal', 'goalTimeline', 'priorityAreas', 'priorityAreasStatus', 'experienceLevel', 'ageYears', 'ageDisclosure', 'sexOrRelevantContext',
    'trainingAgeMonths', 'sessionsPerWeek', 'preferredWeekdays', 'preferredWeekdaysStatus', 'sessionMinutes', 'sessionMinutesStatus', 'weeklyMinutes',
    'preferredBlockWeeks', 'currentProgram', 'trainingHistorySummary', 'trainingHistoryStatus', 'trainingResponse', 'otherActivities',
    'equipmentConfirmation', 'ownedEquipmentNames', 'equipmentOwnershipStatus', 'strengthAnchors', 'machineLimits', 'machineModel', 'exercisePreferences', 'exerciseRestrictions', 'supersetPreferences',
    'resistanceModePreferences', 'warmupMobilityPreferences', 'bodyweightPreference', 'absPreference', 'obliquesPreference',
    'warmupPreference', 'stretchingPreference', 'cardioPreference', 'cardioContext', 'blockLengthPreference', 'bodyMassKg', 'heightCm',
    'targetBodyMassKg', 'averageCaloriesKcal', 'energyBalance', 'weightTrend', 'injuryLimitations',
    'nutritionContext', 'sleepHoursAverage', 'recoveryContext', 'additionalTrainingContext', 'interviewComplete', 'finalRecoveryRequired'
  ]);
  for (const key of keys) if (!allowed.has(key)) throw new Error(`Nie można zapisać nieobsługiwanego pola profilu: ${key}.`);

  const result = {};
  if (Object.hasOwn(data, 'trainingStyleStatus')) {
    if (!trainingStyleStatusValues.includes(data.trainingStyleStatus)) throw new Error('trainingStyleStatus ma nieobsługiwaną wartość.');
    result.trainingStyleStatus = data.trainingStyleStatus;
  }
  if (Object.hasOwn(data, 'finalRecoveryRequired')) {
    if (typeof data.finalRecoveryRequired !== 'boolean') throw new Error('finalRecoveryRequired musi być jawną wartością true albo false.');
    result.finalRecoveryRequired = data.finalRecoveryRequired;
  }
  for (const [key, maxLength] of Object.entries(textFields)) {
    if (!Object.hasOwn(data, key)) continue;
    if (typeof data[key] !== 'string' || data[key].length > maxLength) {
      throw new Error(`${key} musi być tekstem o długości do ${maxLength} znaków.`);
    }
    const value = data[key].trim();
    if (value) result[key] = value;
  }
  if (Object.hasOwn(data, 'trainingStyleStatus')) {
    if (data.trainingStyleStatus !== 'specified' && Object.hasOwn(data, 'preferredTrainingStyle')) throw new Error('preferredTrainingStyle wymaga trainingStyleStatus=specified.');
    if (data.trainingStyleStatus !== 'coach-choice' && Object.hasOwn(data, 'trainingStyleRationale')) throw new Error('trainingStyleRationale wymaga trainingStyleStatus=coach-choice.');
  }
  if (Object.hasOwn(data, 'primaryGoal')) {
    if (typeof data.primaryGoal !== 'string' || !data.primaryGoal.trim() || data.primaryGoal.trim().length > textFields.primaryGoal) {
      throw new Error(`primaryGoal musi być niepustym tekstem o długości do ${textFields.primaryGoal} znaków.`);
    }
    result.primaryGoal = data.primaryGoal.trim();
  }

  if (Object.hasOwn(data, 'priorityAreas')) {
    if (!Array.isArray(data.priorityAreas) || data.priorityAreas.length > 12 || data.priorityAreas.some((value) => typeof value !== 'string' || !value.trim() || value.trim().length > 60)) {
      throw new Error('priorityAreas może zawierać do 12 nazw partii, każda do 60 znaków.');
    }
    result.priorityAreas = [...new Set(data.priorityAreas.map((value) => value.trim()))];
  }
  if (Object.hasOwn(data, 'priorityAreasStatus')) {
    if (!priorityAreasStatusValues.includes(data.priorityAreasStatus)) {
      throw new Error('priorityAreasStatus musi mieć wartość specific, none, unsure albo decline.');
    }
    result.priorityAreasStatus = data.priorityAreasStatus;
  }
  if (result.priorityAreasStatus === 'specific' && !result.priorityAreas?.length) {
    throw new Error('priorityAreasStatus=specific wymaga co najmniej jednej partii w priorityAreas.');
  }
  if (result.priorityAreasStatus === 'none' && result.priorityAreas?.length) {
    throw new Error('priorityAreasStatus=none jest sprzeczne z podanymi priorityAreas.');
  }
  if (['unsure', 'decline'].includes(result.priorityAreasStatus) && result.priorityAreas?.length) {
    throw new Error('priorityAreasStatus=unsure/decline jest sprzeczne z podanymi priorityAreas.');
  }
  if (Object.hasOwn(data, 'preferredWeekdays')) {
    if (!Array.isArray(data.preferredWeekdays) || data.preferredWeekdays.length > 7 || data.preferredWeekdays.some((value) => !weekdayValues.includes(value))) {
      throw new Error('preferredWeekdays zawiera nieprawidłowy dzień tygodnia.');
    }
    result.preferredWeekdays = [...new Set(data.preferredWeekdays)];
  }
  if (Object.hasOwn(data, 'preferredWeekdaysStatus')) {
    if (!['specific', 'flexible', 'unknown', 'decline'].includes(data.preferredWeekdaysStatus)) {
      throw new Error('preferredWeekdaysStatus musi mieć wartość specific, flexible, unknown albo decline.');
    }
    result.preferredWeekdaysStatus = data.preferredWeekdaysStatus;
  }
  if (Object.hasOwn(data, 'preferredWeekdays') && !result.preferredWeekdays.length) {
    throw new Error('preferredWeekdays nie może być puste; ustaw preferredWeekdaysStatus na flexible, unknown albo decline.');
  }
  if (result.preferredWeekdaysStatus === 'specific' && !result.preferredWeekdays?.length) {
    throw new Error('preferredWeekdaysStatus=specific wymaga co najmniej jednego dnia w preferredWeekdays.');
  }
  if (result.preferredWeekdays?.length && ['flexible', 'unknown', 'decline'].includes(result.preferredWeekdaysStatus)) {
    throw new Error('Podane dni preferredWeekdays są sprzeczne ze statusem flexible, unknown albo decline.');
  }
  // A legacy profile that already lists days has explicitly answered with a
  // fixed schedule. Preserve its meaning while making the answer unambiguous.
  if (result.preferredWeekdays?.length && !result.preferredWeekdaysStatus) {
    result.preferredWeekdaysStatus = 'specific';
  }
  if (Object.hasOwn(data, 'sessionMinutesStatus')) {
    if (!['unknown', 'decline', 'unlimited'].includes(data.sessionMinutesStatus)) {
      throw new Error('sessionMinutesStatus musi mieć wartość unknown, decline albo unlimited.');
    }
    result.sessionMinutesStatus = data.sessionMinutesStatus;
  }
  if (Object.hasOwn(data, 'sessionMinutes') && Object.hasOwn(data, 'sessionMinutesStatus')) {
    throw new Error('Podaj sessionMinutes albo sessionMinutesStatus=unknown/decline/unlimited, nie oba pola naraz.');
  }
  if (Object.hasOwn(data, 'experienceLevel')) {
    if (!experienceValues.includes(data.experienceLevel)) throw new Error('experienceLevel musi mieć wartość beginner, intermediate, advanced albo unknown.');
    result.experienceLevel = data.experienceLevel;
  }
  if (Object.hasOwn(data, 'trainingHistoryStatus')) {
    if (!trainingHistoryStatusValues.includes(data.trainingHistoryStatus)) {
      throw new Error('trainingHistoryStatus musi mieć wartość user_summary, reviewed_speediance, unknown, unavailable albo declined.');
    }
    result.trainingHistoryStatus = data.trainingHistoryStatus;
    if (['user_summary', 'reviewed_speediance'].includes(data.trainingHistoryStatus)
        && ![result.trainingHistorySummary, result.currentProgram].some((value) => typeof value === 'string' && value.trim())) {
      throw new Error('trainingHistoryStatus=user_summary/reviewed_speediance wymaga krótkiego trainingHistorySummary albo currentProgram.');
    }
  }
  if (Object.hasOwn(data, 'ageDisclosure')) {
    if (data.ageDisclosure !== 'decline') throw new Error('ageDisclosure może mieć wyłącznie wartość decline.');
    result.ageDisclosure = data.ageDisclosure;
  }
  if (Object.hasOwn(data, 'ageYears') && Object.hasOwn(data, 'ageDisclosure')) {
    throw new Error('Podaj wiek albo ageDisclosure=decline, nie oba pola naraz.');
  }
  if (Object.hasOwn(data, 'obliquesPreference')) {
    if (!obliquesValues.includes(data.obliquesPreference)) throw new Error('obliquesPreference musi mieć wartość yes, no, ask, decline albo not_applicable.');
    result.obliquesPreference = data.obliquesPreference;
  }
  for (const key of ['bodyweightPreference', 'absPreference', 'warmupPreference', 'stretchingPreference', 'cardioPreference']) {
    if (!Object.hasOwn(data, key)) continue;
    if (!optionalPreferenceValues.includes(data[key])) {
      throw new Error(`${key} musi mieć wartość yes, no, ask, decline albo not_applicable.`);
    }
    result[key] = data[key];
  }
  if (Object.hasOwn(data, 'blockLengthPreference')) {
    if (!['recommend', 'ask', 'custom'].includes(data.blockLengthPreference)) {
      throw new Error('blockLengthPreference musi mieć wartość recommend, ask albo custom.');
    }
    result.blockLengthPreference = data.blockLengthPreference;
  }
  if (Object.hasOwn(data, 'energyBalance')) {
    if (!energyBalanceValues.includes(data.energyBalance)) throw new Error('energyBalance musi mieć wartość deficit, maintenance, surplus albo unknown.');
    result.energyBalance = data.energyBalance;
  }
  if (Object.hasOwn(data, 'ownedEquipmentNames')) {
    if (!Array.isArray(data.ownedEquipmentNames) || data.ownedEquipmentNames.length > 100 || data.ownedEquipmentNames.some((value) => typeof value !== 'string' || !value.trim() || value.trim().length > 100)) {
      throw new Error('ownedEquipmentNames może zawierać do 100 niepustych nazw akcesoriów (do 100 znaków każda).');
    }
    result.ownedEquipmentNames = [...new Set(data.ownedEquipmentNames.map((value) => value.trim()))];
  }
  if (Object.hasOwn(data, 'equipmentOwnershipStatus')) {
    if (!equipmentOwnershipValues.includes(data.equipmentOwnershipStatus)) throw new Error('equipmentOwnershipStatus musi mieć wartość complete, partial albo unknown.');
    result.equipmentOwnershipStatus = data.equipmentOwnershipStatus;
  }
  if (Object.hasOwn(data, 'ownedEquipmentNames') && !Object.hasOwn(data, 'equipmentOwnershipStatus')) {
    throw new Error('Zapis listy sprzętu wymaga jawnego equipmentOwnershipStatus: complete, partial albo unknown.');
  }
  if (data.equipmentOwnershipStatus === 'complete' && !Object.hasOwn(data, 'ownedEquipmentNames')) {
    throw new Error('Pełne potwierdzenie wyposażenia wymaga pola ownedEquipmentNames; użyj pustej listy, jeśli użytkownik nie ma dodatkowych akcesoriów.');
  }
  if (data.equipmentOwnershipStatus === 'partial' && (!Array.isArray(data.ownedEquipmentNames) || data.ownedEquipmentNames.length === 0)) {
    throw new Error('Częściowe potwierdzenie wyposażenia wymaga co najmniej jednej nazwy w ownedEquipmentNames.');
  }
  if (data.equipmentOwnershipStatus === 'unknown' && Array.isArray(data.ownedEquipmentNames) && data.ownedEquipmentNames.length > 0) {
    throw new Error('Przy potwierdzonych pozycjach ustaw equipmentOwnershipStatus na partial albo complete, nie unknown.');
  }
  if (Object.hasOwn(data, 'strengthAnchors')) {
    if (!Array.isArray(data.strengthAnchors) || data.strengthAnchors.length > 500) {
      throw new Error('strengthAnchors musi być listą do 500 kotwic ćwiczeń.');
    }
    const seenGroupIds = new Set();
    result.strengthAnchors = data.strengthAnchors.map((anchor, index) => {
      if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)) throw new Error(`strengthAnchors[${index}] musi być obiektem.`);
      const allowedAnchorKeys = new Set(['groupId', 'actionLibraryId', 'exerciseName', 'unit', 'source', 'oneRepMax', 'anchorKind', 'workingWeight', 'workingReps', 'workingRir', 'observedAt']);
      if (Object.keys(anchor).some((key) => !allowedAnchorKeys.has(key))) throw new Error(`strengthAnchors[${index}] zawiera nieobsługiwane pole.`);
      if (!Number.isSafeInteger(anchor.groupId) || anchor.groupId < 1 || typeof anchor.exerciseName !== 'string' || !anchor.exerciseName.trim() || anchor.exerciseName.trim().length > 120) {
        throw new Error(`strengthAnchors[${index}] wymaga prawidłowego groupId i dokładnej nazwy ćwiczenia.`);
      }
      if (anchor.actionLibraryId !== undefined && (!Number.isSafeInteger(anchor.actionLibraryId) || anchor.actionLibraryId < 1)) {
        throw new Error(`strengthAnchors[${index}].actionLibraryId musi być dodatnim ID wariantu Speediance.`);
      }
      const anchorKey = `${anchor.groupId}:${anchor.actionLibraryId ?? 'unbound'}`;
      if (seenGroupIds.has(anchorKey)) throw new Error(`strengthAnchors zawiera powtórzony groupId/wariant ${anchorKey}; usuń konflikt zamiast zgadywać.`);
      seenGroupIds.add(anchorKey);
      if (!['kg', 'lb'].includes(anchor.unit) || !strengthAnchorSourceValues.includes(anchor.source)) {
        throw new Error(`strengthAnchors[${index}] wymaga jednostki kg/lb i jawnego źródła.`);
      }
      const validOneRepMax = typeof anchor.oneRepMax === 'number' && Number.isFinite(anchor.oneRepMax) && anchor.oneRepMax > 0 && anchor.oneRepMax <= 1000;
      const validWorkingSet = typeof anchor.workingWeight === 'number' && Number.isFinite(anchor.workingWeight) && anchor.workingWeight > 0 && anchor.workingWeight <= 1000 && Number.isSafeInteger(anchor.workingReps) && anchor.workingReps >= 1 && anchor.workingReps <= 20 && (anchor.workingRir === undefined || (Number.isSafeInteger(anchor.workingRir) && anchor.workingRir >= 0 && anchor.workingRir <= 5));
      if (validOneRepMax === validWorkingSet) throw new Error(`strengthAnchors[${index}] podaj dokładnie 1RM albo workingWeight wraz z workingReps.`);
      if (anchor.anchorKind !== undefined && (!validOneRepMax || !['reported-oneRepMax', 'estimated-e1RM'].includes(anchor.anchorKind))) throw new Error('anchorKind wymaga liczbowego oneRepMax i potwierdzonego rodzaju kotwicy.');
      if (anchor.workingRir !== undefined && !validWorkingSet) throw new Error(`strengthAnchors[${index}].workingRir wymaga prawidłowego workingWeight i workingReps.`);
      if (anchor.observedAt !== undefined && (typeof anchor.observedAt !== 'string' || !Number.isFinite(Date.parse(anchor.observedAt)))) {
        throw new Error(`strengthAnchors[${index}].observedAt musi być datą ISO.`);
      }
      return {
        groupId: anchor.groupId,
        ...(anchor.actionLibraryId === undefined ? {} : { actionLibraryId: anchor.actionLibraryId }),
        exerciseName: anchor.exerciseName.trim(),
        unit: anchor.unit,
        source: anchor.source,
        ...(anchor.anchorKind === undefined ? {} : { anchorKind: anchor.anchorKind }),
        ...(validOneRepMax ? { oneRepMax: anchor.oneRepMax } : { workingWeight: anchor.workingWeight, workingReps: anchor.workingReps, ...(anchor.workingRir === undefined ? {} : { workingRir: anchor.workingRir }) }),
        ...(anchor.observedAt === undefined ? {} : { observedAt: new Date(anchor.observedAt).toISOString() })
      };
    });
  }
  if (Object.hasOwn(data, 'machineLimits')) {
    const limits = data.machineLimits;
    if (!limits || typeof limits !== 'object' || Array.isArray(limits)) throw new Error('machineLimits musi być obiektem.');
    const allowedLimitKeys = new Set(['model', 'maxBarbell', 'maxCable', 'unit']);
    if (Object.keys(limits).some((key) => !allowedLimitKeys.has(key))) throw new Error('machineLimits zawiera nieobsługiwane pole.');
    if (typeof limits.model !== 'string' || !limits.model.trim() || limits.model.length > 80 || !['kg', 'lb'].includes(limits.unit)) {
      throw new Error('machineLimits wymaga potwierdzonego modelu i jednostki kg/lb.');
    }
    const normalizedLimits = { model: limits.model.trim(), unit: limits.unit };
    for (const field of ['maxBarbell', 'maxCable']) {
      if (limits[field] === undefined) continue;
      if (typeof limits[field] !== 'number' || !Number.isFinite(limits[field]) || limits[field] <= 0 || limits[field] > 2000) {
        throw new Error(`machineLimits.${field} musi być liczbą większą od 0 i nie większą niż 2000.`);
      }
      normalizedLimits[field] = limits[field];
    }
    if (normalizedLimits.maxBarbell === undefined && normalizedLimits.maxCable === undefined) throw new Error('machineLimits wymaga maxBarbell albo maxCable.');
    result.machineLimits = normalizedLimits;
  }
  for (const [key, bounds] of Object.entries(numericFields)) {
    if (!Object.hasOwn(data, key)) continue;
    const value = data[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < bounds.minimum || value > bounds.maximum || (bounds.integer && !Number.isSafeInteger(value))) {
      throw new Error(`${key} musi być liczbą${bounds.integer ? ' całkowitą' : ''} od ${bounds.minimum} do ${bounds.maximum}.`);
    }
    result[key] = data[key];
  }
  if (Object.hasOwn(data, 'interviewComplete')) {
    if (typeof data.interviewComplete !== 'boolean') throw new Error('interviewComplete musi mieć wartość true albo false.');
    result.interviewComplete = data.interviewComplete;
  }
  return result;
}

const refusalPhrases = [
  'odmowa', 'odmawiam', 'nie chce podawac', 'nie chce odpowiadac', 'nie chce ujawniac',
  'nie podam', 'wole nie podawac', 'wole nie odpowiadac', 'nie dotyczy', 'n/a',
  'prefer not to say', 'rather not say', 'prefer not to answer', 'decline to answer', 'skip'
];
const noLimitationPhrases = [
  'brak', 'bez urazow', 'nie mam urazow', 'bez kontuzji', 'nie mam kontuzji',
  'bez ograniczen', 'nie mam ograniczen', 'no injuries', 'no limitations', 'none'
];
const uncertaintyPhrases = [
  'nie wiem', 'nie jestem pewien', 'nie jestem pewna', 'nie mam pewnosci', 'trudno powiedziec',
  'unknown', 'not sure', 'not certain', 'i do not know', "i don't know", 'unsure'
];

function normalizedPhraseText(value) {
  return typeof value === 'string'
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
    : '';
}

function hasPhrase(value, phrases) {
  const normalized = normalizedPhraseText(value);
  if (!normalized) return false;
  return phrases.some((phrase) => {
    const normalizedPhrase = normalizedPhraseText(phrase);
    const escaped = normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(normalized);
  });
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasNumeric(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Classifies reported prose without turning a nonempty missing-data marker into data. */
export function classifyCoachingContextText(value) {
  if (!hasText(value)) return 'unknown';
  // Structured status spellings sometimes reach these legacy free-text fields.
  // Recognize them using the same phrase boundaries as explicit prose answers.
  const statusText = value.replace(/[_-]+/g, ' ');
  if (hasPhrase(statusText, [...refusalPhrases, 'declined', 'decline', 'refused'])) return 'declined';
  if (hasPhrase(statusText, ['not requested', 'not collected', 'nie pytano', 'nie pobrano', 'nie odczytano'])) return 'not_requested';
  if (hasPhrase(statusText, ['unavailable', 'not provided', 'no data', 'brak danych', 'nie podano', 'nie uzyskano'])) return 'unavailable';
  if (hasPhrase(statusText, uncertaintyPhrases)) return 'unknown';
  return 'reported';
}

/** A genuine numerical sleep report remains data even when other details were declined. */
export function classifyRecoverySelfReport(profileData) {
  const profile = profileData && typeof profileData === 'object' && !Array.isArray(profileData) ? profileData : {};
  return hasNumeric(profile.sleepHoursAverage) ? 'reported' : classifyCoachingContextText(profile.recoveryContext);
}

function isAffirmativePreference(value) {
  return ['yes', 'no', 'ask', 'decline', 'not_applicable'].includes(value);
}

/**
 * Classifies whether calories, energy balance, and body-mass trend are all
 * known enough to influence a training plan. Unknown or refused details remain
 * optional in intake and produce an explicit non-applicable evidence decision.
 */
export function nutritionContextEvidenceRequirement(profileData) {
  const profile = profileData && typeof profileData === 'object' && !Array.isArray(profileData) ? profileData : {};
  const nutritionText = normalizedPhraseText(profile.nutritionContext);
  const trendText = normalizedPhraseText(profile.weightTrend);
  const declined = hasPhrase(profile.nutritionContext, refusalPhrases)
    || hasPhrase(profile.weightTrend, refusalPhrases);
  if (declined) {
    return {
      status: 'unknown',
      reason: 'Użytkownik odmówił podania kontekstu żywieniowego; nie wnioskuj o kaloriach ani bilansie.'
    };
  }

  const caloriesUnknown = hasPhrase(profile.nutritionContext, uncertaintyPhrases)
    || /\b(?:nie\s+(?:sledze|licze|znam)\s+(?:kalori\w*|kcal)|(?:do\s+not|dont|don't|not)\s+(?:track|count|know)\s+(?:my\s+)?calori\w*|not\s+tracked)\b/u.test(nutritionText);
  const caloriesKnown = !caloriesUnknown && (hasNumeric(profile.averageCaloriesKcal)
    || /\b\d{3,5}(?:[.,]\d+)?\s*(?:kcal|kilokalori\w*|kalori\w*|calori\w*)\b/u.test(nutritionText));
  const energyBalanceKnown = ['deficit', 'maintenance', 'surplus'].includes(profile.energyBalance)
    || (profile.energyBalance !== 'unknown'
      && !hasPhrase(profile.nutritionContext, uncertaintyPhrases)
      && /\b(?:deficyt\w*|deficit\w*|redukcj\w*|nadwyzk\w*|surplus\w*|utrzymani\w*|utrzymuj\w*|maintenance|bulk\w*|cut\w*|weight\s+(?:gain|loss)|przyty\w*|chud\w*)\b/u.test(nutritionText));
  const weightTrendUnknown = hasPhrase(profile.weightTrend, uncertaintyPhrases)
    || /\b(?:nie\s+(?:sledze|znam)|not\s+tracked|do\s+not\s+track)\b/u.test(trendText);
  const weightTrendKnown = hasText(profile.weightTrend) && !weightTrendUnknown;
  if (caloriesKnown && energyBalanceKnown && weightTrendKnown) return { status: 'known', reason: null };

  const unknownFields = [
    ...(!caloriesKnown ? ['kcal'] : []),
    ...(!energyBalanceKnown ? ['bilans energetyczny'] : []),
    ...(!weightTrendKnown ? ['trend masy'] : [])
  ];
  return {
    status: 'unknown',
    reason: `Nieznane lub niepodane: ${unknownFields.join(', ')}; nie wnioskuj o kontekście żywieniowym.`
  };
}

/**
 * Audits whether the one-time coaching intake has a recorded answer for each
 * planning section. This is deliberately derived from actual profile answers;
 * the legacy `interviewComplete` boolean is never trusted.
 *
 * `context` is ephemeral account data and is not stored by this helper. It can
 * include `{ machineModel, ownedEquipmentNames, equipmentOwnershipStatus,
 * trainingHistorySummary }` read from the connected Speediance account.
 */
export function auditTrainingInterview(profileData, context = {}) {
  const profile = profileData && typeof profileData === 'object' && !Array.isArray(profileData) ? profileData : {};
  const ctx = context && typeof context === 'object' && !Array.isArray(context) ? context : {};
  const sections = [];
  const refusedOptionalFields = [];

  const addSection = ({ id, label, requiredFields, satisfied, declinedFields = [], blocking = true }) => {
    const resolved = Boolean(satisfied);
    for (const field of declinedFields) refusedOptionalFields.push(field);
    sections.push({
      id,
      label,
      requiredFields,
      status: resolved ? (declinedFields.length ? 'declined' : 'complete') : 'missing',
      blocking: !resolved && blocking,
      missingFields: resolved ? [] : requiredFields,
      declinedFields: [...declinedFields]
    });
  };

  const ageDeclined = profile.ageDisclosure === 'decline';
  const sexDeclined = hasPhrase(profile.sexOrRelevantContext, refusalPhrases);
  const ageAnswered = hasNumeric(profile.ageYears) || ageDeclined;
  const sexAnswered = hasText(profile.sexOrRelevantContext);
  addSection({
    id: 'personal_context', label: 'Wiek i płeć/kontekst istotny dla treningu',
    requiredFields: [
      ...(!ageAnswered ? ['ageYears lub ageDisclosure=decline'] : []),
      ...(!sexAnswered ? ['sexOrRelevantContext'] : [])
    ],
    satisfied: ageAnswered && sexAnswered,
    declinedFields: [
      ...(ageDeclined ? ['ageYears'] : []),
      ...(sexDeclined ? ['sexOrRelevantContext'] : [])
    ]
  });

  const goalAnswered = hasText(profile.primaryGoal)
    && !hasPhrase(profile.primaryGoal, refusalPhrases)
    && !hasPhrase(profile.primaryGoal, uncertaintyPhrases);
  const priorityAreasAnswered = (Array.isArray(profile.priorityAreas) && profile.priorityAreas.length > 0)
    || ['none', 'unsure', 'decline'].includes(profile.priorityAreasStatus);
  addSection({
    id: 'goal_focus', label: 'Cel główny i priorytetowe partie',
    requiredFields: [
      ...(!goalAnswered ? ['primaryGoal'] : []),
      ...(!priorityAreasAnswered ? ['priorityAreas albo priorityAreasStatus=none/unsure/decline'] : [])
    ],
    satisfied: goalAnswered && priorityAreasAnswered,
    declinedFields: profile.priorityAreasStatus === 'decline' ? ['priorityAreas'] : []
  });

  const experienceAnswered = ['beginner', 'intermediate', 'advanced', 'unknown'].includes(profile.experienceLevel);
  const hasKnownText = (value) => classifyCoachingContextText(value) === 'reported';
  const hasHistorySummary = hasKnownText(profile.trainingHistorySummary) || hasKnownText(ctx.trainingHistorySummary)
    || hasKnownText(profile.currentProgram);
  const historyStatusAnswered = ['unknown', 'unavailable', 'declined'].includes(profile.trainingHistoryStatus);
  const historyAnswered = hasHistorySummary || historyStatusAnswered;
  addSection({
    id: 'experience_history', label: 'Poziom zaawansowania i historia treningów',
    requiredFields: [
      ...(!experienceAnswered ? ['experienceLevel'] : []),
      ...(!historyAnswered ? ['trainingHistorySummary/currentProgram z historii albo trainingHistoryStatus=unknown/unavailable/declined'] : [])
    ],
    satisfied: experienceAnswered && historyAnswered,
    declinedFields: profile.trainingHistoryStatus === 'declined' && !hasHistorySummary ? ['trainingHistorySummary'] : []
  });

  const sessionsPerWeekAnswered = Number.isSafeInteger(profile.sessionsPerWeek)
    && profile.sessionsPerWeek >= 1 && profile.sessionsPerWeek <= 7;
  const sessionDurationAnswered = Number.isSafeInteger(profile.sessionMinutes)
    || ['unknown', 'decline', 'unlimited'].includes(profile.sessionMinutesStatus);
  const weekdayScheduleAnswered = (Array.isArray(profile.preferredWeekdays) && profile.preferredWeekdays.length > 0)
    || ['flexible', 'unknown', 'decline'].includes(profile.preferredWeekdaysStatus);
  const availabilityAnswered = sessionsPerWeekAnswered && sessionDurationAnswered && weekdayScheduleAnswered;
  addSection({
    id: 'availability_sessions', label: 'Dostępność, liczba i czas sesji oraz dni treningowe',
    requiredFields: [
      ...(!sessionsPerWeekAnswered ? ['sessionsPerWeek'] : []),
      ...(!sessionDurationAnswered ? ['sessionMinutes albo sessionMinutesStatus=unknown/decline/unlimited'] : []),
      ...(!weekdayScheduleAnswered ? ['preferredWeekdays albo preferredWeekdaysStatus=flexible/unknown/decline'] : [])
    ],
    satisfied: availabilityAnswered,
    declinedFields: [
      ...(profile.sessionMinutesStatus === 'decline' ? ['sessionMinutes'] : []),
      ...(profile.preferredWeekdaysStatus === 'decline' ? ['preferredWeekdays'] : [])
    ]
  });

  const machineModel = hasText(profile.machineModel) ? profile.machineModel : ctx.machineModel;
  const equipmentStatus = profile.equipmentOwnershipStatus ?? ctx.equipmentOwnershipStatus;
  const equipmentNames = Array.isArray(profile.ownedEquipmentNames) ? profile.ownedEquipmentNames : ctx.ownedEquipmentNames;
  const machineAnswered = hasText(machineModel);
  const inventoryAnswered = hasText(profile.equipmentConfirmation)
    || ((equipmentStatus === 'complete' || equipmentStatus === 'partial') && Array.isArray(equipmentNames));
  addSection({
    id: 'device_equipment', label: 'Urządzenie i dostępny sprzęt',
    requiredFields: [
      ...(!machineAnswered ? ['machineModel'] : []),
      ...(!inventoryAnswered ? ['equipmentConfirmation', 'ownedEquipmentNames', 'equipmentOwnershipStatus'] : [])
    ],
    satisfied: machineAnswered && inventoryAnswered
  });

  const injuryRefused = hasPhrase(profile.injuryLimitations, refusalPhrases);
  const injuryAnswered = hasText(profile.injuryLimitations) && (injuryRefused
    || hasPhrase(profile.injuryLimitations, noLimitationPhrases)
    || !hasPhrase(profile.injuryLimitations, uncertaintyPhrases));
  addSection({
    id: 'injuries_limitations', label: 'Urazy i ograniczenia',
    requiredFields: ['injuryLimitations'], satisfied: injuryAnswered,
    declinedFields: injuryRefused ? ['injuryLimitations'] : []
  });

  const styleStatus = profile.trainingStyleStatus;
  const styleAnswered = (styleStatus === 'specified' && hasText(profile.preferredTrainingStyle)
      && !hasPhrase(profile.preferredTrainingStyle, refusalPhrases) && !hasPhrase(profile.preferredTrainingStyle, uncertaintyPhrases))
    || (styleStatus === 'coach-choice' && hasText(profile.trainingStyleRationale)
      && !hasPhrase(profile.trainingStyleRationale, refusalPhrases) && !hasPhrase(profile.trainingStyleRationale, uncertaintyPhrases))
    || styleStatus === 'declined';
  addSection({
    id: 'training_style', label: 'Preferowany styl treningu',
    requiredFields: ['trainingStyleStatus', ...(styleStatus === 'specified' ? ['preferredTrainingStyle'] : []), ...(styleStatus === 'coach-choice' ? ['trainingStyleRationale'] : [])],
    satisfied: styleAnswered,
    declinedFields: styleStatus === 'declined' ? ['trainingStyleStatus'] : []
  });

  const declinedGeneralPreferences = [
    ...(hasPhrase(profile.exercisePreferences, refusalPhrases) ? ['exercisePreferences'] : []),
    ...(hasPhrase(profile.exerciseRestrictions, refusalPhrases) ? ['exerciseRestrictions'] : [])
  ];
  const generalPreferenceRefused = declinedGeneralPreferences.length > 0;
  const generalPreferenceAnswered = hasText(profile.exercisePreferences) || hasText(profile.exerciseRestrictions);
  const bodyweightAnswered = isAffirmativePreference(profile.bodyweightPreference);
  const absAnswered = isAffirmativePreference(profile.absPreference);
  const obliquesAnswered = isAffirmativePreference(profile.obliquesPreference);
  const preferenceDeclines = [
    ...declinedGeneralPreferences,
    ...(profile.bodyweightPreference === 'decline' || profile.bodyweightPreference === 'not_applicable' ? ['bodyweightPreference'] : []),
    ...(profile.absPreference === 'decline' || profile.absPreference === 'not_applicable' ? ['absPreference'] : []),
    ...(profile.obliquesPreference === 'decline' || profile.obliquesPreference === 'not_applicable' ? ['obliquesPreference'] : [])
  ];
  addSection({
    id: 'exercise_preferences', label: 'Preferencje, masa ciała, brzuch i skosy',
    requiredFields: [
      ...(!generalPreferenceAnswered ? ['exercisePreferences', 'exerciseRestrictions'] : []),
      ...(!bodyweightAnswered ? ['bodyweightPreference'] : []),
      ...(!absAnswered ? ['absPreference'] : []),
      ...(!obliquesAnswered ? ['obliquesPreference'] : [])
    ],
    satisfied: generalPreferenceAnswered && bodyweightAnswered && absAnswered && obliquesAnswered,
    declinedFields: preferenceDeclines
  });

  const warmupAnswered = isAffirmativePreference(profile.warmupPreference);
  const stretchingAnswered = isAffirmativePreference(profile.stretchingPreference);
  addSection({
    id: 'warmup_stretching', label: 'Rozgrzewka i rozciąganie',
    requiredFields: [
      ...(!warmupAnswered ? ['warmupPreference'] : []),
      ...(!stretchingAnswered ? ['stretchingPreference'] : [])
    ],
    satisfied: warmupAnswered && stretchingAnswered,
    declinedFields: [
      ...(profile.warmupPreference === 'decline' || profile.warmupPreference === 'not_applicable' ? ['warmupPreference'] : []),
      ...(profile.stretchingPreference === 'decline' || profile.stretchingPreference === 'not_applicable' ? ['stretchingPreference'] : [])
    ]
  });

  const blockAnswered = (Number.isSafeInteger(profile.preferredBlockWeeks) && profile.preferredBlockWeeks >= 1 && profile.preferredBlockWeeks <= 52)
    || profile.blockLengthPreference === 'recommend' || profile.blockLengthPreference === 'ask';
  addSection({
    id: 'training_block', label: 'Długość planowanego bloku',
    requiredFields: blockAnswered ? [] : ['preferredBlockWeeks', 'blockLengthPreference'], satisfied: blockAnswered
  });

  // A calorie number alone does not tell us whether the user is in a deficit
  // or surplus, nor how their body mass is trending. Ask for each signal, but
  // let an explicit unknown answer stand as unknown instead of inventing it.
  // A blanket refusal in nutritionContext resolves the optional section.
  const nutritionContext = normalizedPhraseText(profile.nutritionContext);
  const nutritionContextRefused = hasPhrase(profile.nutritionContext, refusalPhrases);
  const calorieTextAnswered = /\b\d{3,5}(?:[.,]\d+)?\s*(?:kcal|kilokalori\w*|kalori\w*|calori\w*)\b/u.test(nutritionContext);
  const calorieUnknown = hasPhrase(profile.nutritionContext, uncertaintyPhrases)
    || /\b(?:nie\s+(?:sledze|licze|znam)\s+(?:kalori\w*|kcal)|(?:do\s+not|dont|don't|not)\s+(?:track|count|know)\s+(?:my\s+)?calori\w*|not\s+tracked)\b/u.test(nutritionContext);
  const calorieAnswered = hasNumeric(profile.averageCaloriesKcal) || calorieTextAnswered || calorieUnknown;
  const energyBalanceInContext = /\b(?:deficyt\w*|deficit\w*|redukcj\w*|nadwyzk\w*|surplus\w*|utrzymani\w*|utrzymuj\w*|maintenance|bulk\w*|cut\w*|weight\s+(?:gain|loss)|przyty\w*|chud\w*)\b/u.test(nutritionContext);
  const energyBalanceAnswered = ['deficit', 'maintenance', 'surplus', 'unknown'].includes(profile.energyBalance)
    || energyBalanceInContext;
  const weightTrendAnswered = hasText(profile.weightTrend);
  const nutritionAnswered = nutritionContextRefused
    || (calorieAnswered && energyBalanceAnswered && weightTrendAnswered);
  const recoveryRefused = classifyCoachingContextText(profile.recoveryContext) === 'declined';
  const recoveryAnswered = classifyRecoverySelfReport(profile) === 'reported';
  addSection({
    id: 'nutrition_recovery', label: 'Dieta, kalorie i regeneracja',
    blocking: false,
    requiredFields: [
      ...(!nutritionContextRefused && !calorieAnswered ? ['averageCaloriesKcal lub jawne „nie wiem/nie śledzę” w nutritionContext'] : []),
      ...(!nutritionContextRefused && !energyBalanceAnswered ? ['energyBalance (deficyt, utrzymanie, nadwyżka albo unknown)'] : []),
      ...(!nutritionContextRefused && !weightTrendAnswered ? ['weightTrend (trend masy lub jawne „nie wiem/nie śledzę”)'] : []),
      ...(!(recoveryAnswered || recoveryRefused) ? ['recoveryContext', 'sleepHoursAverage'] : [])
    ],
    satisfied: nutritionAnswered && (recoveryAnswered || recoveryRefused),
    declinedFields: [
      ...(nutritionContextRefused ? ['nutritionContext'] : []),
      ...(hasPhrase(profile.weightTrend, refusalPhrases) ? ['weightTrend'] : []),
      ...(recoveryRefused ? ['recoveryContext'] : [])
    ]
  });

  // Pełny wywiad startowy: staż i cardio są pytane razem z resztą, ale nie blokują planu.
  const trainingAgeAnswered = hasNumeric(profile.trainingAgeMonths) || hasText(profile.trainingHistorySummary) || ['unknown', 'unavailable', 'declined'].includes(profile.trainingHistoryStatus);
  const cardioAnswered = isAffirmativePreference(profile.cardioPreference);
  addSection({
    id: 'training_age_cardio', label: 'Staż treningowy i cardio', blocking: false,
    requiredFields: [...(!trainingAgeAnswered ? ['trainingAgeMonths'] : []), ...(!cardioAnswered ? ['cardioPreference'] : [])],
    satisfied: trainingAgeAnswered && cardioAnswered,
    declinedFields: profile.cardioPreference === 'decline' || profile.cardioPreference === 'not_applicable' ? ['cardioPreference'] : []
  });

  const missingSections = sections.filter((section) => section.status === 'missing' && section.blocking);
  const optionalMissingSections = sections.filter((section) => section.status === 'missing' && !section.blocking);
  const completedSections = sections.filter((section) => section.status === 'complete');
  const declinedSections = sections.filter((section) => section.status === 'declined');
  return {
    complete: missingSections.length === 0,
    canCreatePlan: missingSections.length === 0,
    sections,
    missingSections,
    missingRequiredSections: missingSections,
    optionalMissingSections,
    completedSections,
    declinedSections,
    refusedOptionalFields: [...new Set(refusedOptionalFields)],
    ...buildIntakeQuestion(sections)
  };
}

const INTAKE_PROMPTS = {
  personal_context: 'wiek i płeć lub inny istotny kontekst',
  goal_focus: 'cel główny i priorytetowe partie',
  experience_history: 'poziom zaawansowania i dotychczasowy trening',
  availability_sessions: 'ile dni w tygodniu, które dni i ile minut na sesję',
  device_equipment: 'model urządzenia i posiadane akcesoria (potwierdź listę odczytaną z konta)',
  injuries_limitations: 'kontuzje i ograniczenia ruchowe (albo „brak”)',
  training_style: 'preferowany styl treningu albo dobór przez trenera',
  exercise_preferences: 'ulubione i wykluczone ćwiczenia, ćwiczenia z masą ciała, brzuch i skosy',
  warmup_stretching: 'rozgrzewka i rozciąganie po treningu: tak/nie',
  training_block: 'długość bloku albo rekomendacja trenera',
  nutrition_recovery: 'regeneracja: sen, zmęczenie; opcjonalnie dieta i trend masy',
  training_age_cardio: 'staż treningowy oraz czy dodać cardio (jakie, ile)'
};

// Jedno zwięzłe pytanie zbiorcze w formie listy. Nowy profil: pełny wywiad; kompletny profil: tylko zmiany.
export function buildIntakeQuestion(sections) {
  const open = sections.filter((s) => s.status === 'missing');
  const answered = sections.filter((s) => s.status !== 'missing').length;
  const intakeMode = answered === 0 ? 'full-intake' : open.length ? 'missing-only' : 'changes-only';
  const intakeQuestion = intakeMode === 'changes-only'
    ? 'Czy od ostatniego planu coś się zmieniło: cel, priorytety partii, kontuzje, czas sesji, sprzęt? Jeśli nie, odpowiedz „bez zmian”.'
    : 'Zanim ułożę plan, odpowiedz krótko w punktach:\n' + open.map((s) => '- ' + (INTAKE_PROMPTS[s.id] ?? s.label)).join('\n') + '\nOdpowiedzi zapiszę w profilu, żeby przy kolejnych planach pytać tylko o zmiany.';
  return { intakeMode, intakeQuestion, saveAnswersToProfile: intakeMode !== 'changes-only', workOrder: WORK_ORDER, singleSessionOrEditAudit: SINGLE_SESSION_AUDIT };
}

// Kolejność pracy: najpierw audyt, potem plan. Zakres audytu zależy od profilu i rodzaju zadania.
export const WORK_ORDER = 'audyt (wywiad) → plan → kontrola naukowa → pokazanie → zgoda → zapis';
export const SINGLE_SESSION_AUDIT = 'Przy pojedynczym treningu albo edycji zapisanego planu zapytaj tylko o to, czego ten trening lub ta zmiana wymaga (np. cel sesji, czas, dolegliwości); nie przeprowadzaj pełnego wywiadu.';

export function compactInterviewAudit(audit) {
  return { complete: audit.complete, canCreatePlan: audit.canCreatePlan, missingFields: audit.missingSections.flatMap((s) => s.missingFields), optionalMissingFields: audit.optionalMissingSections.flatMap((s) => s.missingFields), intakeMode: audit.intakeMode, intakeQuestion: audit.intakeQuestion };
}

export function mergeTrainingProfileData(existingData, updates, clearFields = []) {
  const existing = existingData && Object.keys(existingData).length
    ? normalizeTrainingProfileData(existingData)
    : {};
  const emptyUpdates = updates === undefined || (updates && typeof updates === 'object' && !Array.isArray(updates) && Object.keys(updates).length === 0);
  const normalizedUpdates = emptyUpdates && clearFields.length
    ? {}
    : normalizeTrainingProfileData(updates);
  if (!Array.isArray(clearFields) || clearFields.some((field) => typeof field !== 'string' || !trainingProfileFieldNames.includes(field))) {
    throw new Error('clear_fields zawiera nieobsługiwane pole profilu trenerskiego.');
  }
  const uniqueClearFields = [...new Set(clearFields)];
  if (!Object.keys(normalizedUpdates).length && !uniqueClearFields.length) {
    throw new Error('Podaj nowe dane profilu albo pola do usunięcia.');
  }
  const overlap = uniqueClearFields.filter((field) => Object.hasOwn(normalizedUpdates, field));
  if (overlap.length) throw new Error(`Nie można jednocześnie aktualizować i usuwać tych pól: ${overlap.join(', ')}.`);
  const merged = reconcileTrainingStyleAnswers(existing, normalizedUpdates);
  if (Object.hasOwn(normalizedUpdates, 'ageYears')) delete merged.ageDisclosure;
  if (Object.hasOwn(normalizedUpdates, 'ageDisclosure')) delete merged.ageYears;
  if (Object.hasOwn(normalizedUpdates, 'priorityAreasStatus')
      && normalizedUpdates.priorityAreasStatus !== 'specific'
      && !Object.hasOwn(normalizedUpdates, 'priorityAreas')) {
    delete merged.priorityAreas;
  }
  if (Object.hasOwn(normalizedUpdates, 'priorityAreas')
      && !Object.hasOwn(normalizedUpdates, 'priorityAreasStatus')
      && ['none', 'unsure', 'decline'].includes(merged.priorityAreasStatus)) {
    delete merged.priorityAreasStatus;
  }
  if (uniqueClearFields.includes('priorityAreas')
      && !Object.hasOwn(normalizedUpdates, 'priorityAreasStatus')
      && merged.priorityAreasStatus === 'specific') {
    delete merged.priorityAreasStatus;
  }
  if (Object.hasOwn(normalizedUpdates, 'sessionMinutes')) delete merged.sessionMinutesStatus;
  if (Object.hasOwn(normalizedUpdates, 'sessionMinutesStatus')) delete merged.sessionMinutes;
  if (Object.hasOwn(normalizedUpdates, 'preferredWeekdays') && !Object.hasOwn(normalizedUpdates, 'preferredWeekdaysStatus')) {
    merged.preferredWeekdaysStatus = 'specific';
  }
  if (['flexible', 'unknown', 'decline'].includes(normalizedUpdates.preferredWeekdaysStatus)) delete merged.preferredWeekdays;
  if (normalizedUpdates.preferredWeekdaysStatus === 'specific' && Object.hasOwn(normalizedUpdates, 'preferredWeekdays')) {
    merged.preferredWeekdaysStatus = 'specific';
  }
  for (const field of uniqueClearFields) delete merged[field];
  if (uniqueClearFields.includes('trainingStyleStatus')) { delete merged.preferredTrainingStyle; delete merged.trainingStyleRationale; }
  if (!Object.keys(merged).length) throw new Error('Profil nie może być pusty; użyj gm_coach_delete_training_profile, aby usunąć cały profil.');
  return normalizeTrainingProfileData(merged);
}

export function parseTrainingProfileRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.schemaVersion !== 1 || typeof raw.updatedAt !== 'string' || !Number.isFinite(Date.parse(raw.updatedAt))) {
    throw new Error('Zapisany profil trenerski ma nieoczekiwany format; niczego nie zmieniono.');
  }
  if (raw.consentGrantedAt !== undefined && (typeof raw.consentGrantedAt !== 'string' || !Number.isFinite(Date.parse(raw.consentGrantedAt)))) {
    throw new Error('Zapisany profil ma nieprawidłowy znacznik zgody; niczego nie zmieniono.');
  }
  const updatedAt = new Date(raw.updatedAt).toISOString();
  const profileData = normalizeTrainingProfileData(raw.profileData);
  let fieldUpdatedAt;
  if (raw.fieldUpdatedAt === undefined) {
    fieldUpdatedAt = Object.fromEntries(Object.keys(profileData).map((field) => [field, updatedAt]));
  } else {
    if (!raw.fieldUpdatedAt || typeof raw.fieldUpdatedAt !== 'object' || Array.isArray(raw.fieldUpdatedAt)) {
      throw new Error('Zapisany profil ma nieprawidłowe daty aktualizacji pól; niczego nie zmieniono.');
    }
    fieldUpdatedAt = {};
    for (const [field, timestamp] of Object.entries(raw.fieldUpdatedAt)) {
      if (!trainingProfileFieldNames.includes(field) || !Object.hasOwn(profileData, field) || typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) {
        throw new Error('Zapisany profil ma nieprawidłowe daty aktualizacji pól; niczego nie zmieniono.');
      }
      fieldUpdatedAt[field] = new Date(timestamp).toISOString();
    }
    for (const field of Object.keys(profileData)) {
      if (!Object.hasOwn(fieldUpdatedAt, field)) throw new Error('Zapisany profil nie ma daty potwierdzenia każdego pola; niczego nie zmieniono.');
    }
  }
  return {
    schemaVersion: 1,
    updatedAt,
    // Records from the first local version were only written after explicit consent.
    consentGrantedAt: typeof raw.consentGrantedAt === 'string' && Number.isFinite(Date.parse(raw.consentGrantedAt))
      ? new Date(raw.consentGrantedAt).toISOString()
      : new Date(raw.updatedAt).toISOString(),
    fieldUpdatedAt,
    profileData
  };
}
