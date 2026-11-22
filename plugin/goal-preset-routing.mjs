const SUPPORTED_PRESETS = new Set(['Gain Muscle', 'Strength', 'Stamina']);
function matchingTargets(goal) {
  return [
    { name: 'Strength', matches: /(?:^|[^\p{L}])sił|strength|powerlift/u.test(goal) },
    { name: 'Stamina', matches: /wytrzyma|endurance|stamina|kondycj|cardio|wydolnoś/.test(goal) },
    { name: 'Gain Muscle', matches: /(?:masa|masy)\s+mięśn|budow\p{L}{0,16}\s+(?:mas\p{L}{0,12}\s+)?mięśn|hipertrof|hypertroph|gain\s+muscle|muscle\s+(?:gain|growth|building)|build\w*\s+muscle|^muscle$/u.test(goal) }
  ].filter(({ matches }) => matches);
}

/**
 * Map a clearly stated training adaptation goal to reference client's three
 * documented preset names. Body-composition outcomes are not training stimuli:
 * fat loss, recomposition, and nonspecific weight gain stay unresolved until
 * the user states a training priority.
 */
export function inferSmartRmPresetName(primaryGoal) {
  const goal = typeof primaryGoal === 'string'
    ? primaryGoal.trim().toLocaleLowerCase('pl-PL')
    : '';
  if (!goal) return null;

  // Handle only clear, separated exclusions. Ambiguous negation scope requires
  // clarification; it must never turn a rejected goal into a machine preset.
  const selected = new Set();
  const excluded = new Set();
  for (const clause of goal.split(/[,;]|\bbut\b|\bale\b/u).map(value => value.trim()).filter(Boolean)) {
    const targets = matchingTargets(clause);
    const negation = /(?:^|\s)(?:nie|not|bez|without|no|never|żadnej|żadna|żadnego)\s+/u.exec(clause);
    if (negation && matchingTargets(clause.slice(negation.index + negation[0].length)).length) {
      const clearExclusion = /^(?:nie|not|bez|without)\s+(?:(?:chcę|chce|want)\s+)?(?:sił\p{L}*|strength|powerlifting|hipertrof\p{L}*|hypertroph\p{L}*|wytrzyma\p{L}*|endurance|stamina|cardio|kondycj\p{L}*|wydolnoś\p{L}*|muscle(?:\s+(?:gain|growth|building))?|gain\s+muscle|mas\p{L}*\s+mięśn\p{L}*)$/u.test(clause);
      if (!clearExclusion || targets.length !== 1) return null;
      excluded.add(targets[0].name);
      continue;
    }
    for (const target of targets) selected.add(target.name);
  }

  // Preset selection depends on the primary training adaptation. Mixed goals
  // need an explicit priority instead of whichever regex happens to run first.
  if (selected.size !== 1 || [...selected].some(name => excluded.has(name))) return null;
  return [...selected][0];
}

export function resolveGoalBoundSmartRmPresetName(primaryGoal, requestedPresetName) {
  const hasGoal = typeof primaryGoal === 'string' && primaryGoal.trim().length > 0;
  const inferredPresetName = inferSmartRmPresetName(primaryGoal);

  if (hasGoal && !inferredPresetName) {
    throw new Error(`Cel „${primaryGoal.trim()}” nie wskazuje jednego głównego bodźca treningowego klienta referencyjnego albo łączy kilka celów. Dopytaj, który priorytet ma decydować o presecie: hipertrofia/budowa mięśni (Gain Muscle), siła (Strength) czy wytrzymałość (Stamina). Redukcja, rekompozycja i ogólne przytycie same nie wybierają presetu. Nie zapisuj planu, dopóki użytkownik nie doprecyzuje priorytetu.`);
  }

  if (hasGoal && requestedPresetName !== undefined && requestedPresetName !== inferredPresetName) {
    throw new Error(`Cel treningowy „${primaryGoal.trim()}” wskazuje preset ${inferredPresetName}; nie nadpisuj go presetem ${requestedPresetName}. Zaktualizuj cel dopiero po potwierdzeniu priorytetu przez użytkownika.`);
  }

  if (inferredPresetName) return inferredPresetName;
  if (SUPPORTED_PRESETS.has(requestedPresetName)) return requestedPresetName;
  return null;
}
