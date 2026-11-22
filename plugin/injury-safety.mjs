const movementRules = Object.freeze([
  {
    id: 'overhead_press',
    label: 'wyciskanie nad głowę / overhead press',
    aliases: ['overhead press', 'military press', 'shoulder press', 'wyciskanie nad glowe', 'wyciskania nad glowe', 'wyciskac nad glowe']
  },
  {
    id: 'leg_press',
    label: 'leg press / wyciskanie nogami',
    aliases: ['leg press', 'prasa do nog', 'wyciskanie nogami', 'wyciskania nogami']
  },
  {
    id: 'upper_press',
    label: 'wyciskanie / upper-body press',
    aliases: [
      'bench press', 'chest press', 'floor press', 'incline press', 'decline press', 'dumbbell press',
      'barbell press', 'machine press', 'seated press', 'shoulder press', 'overhead press', 'military press', 'push up', 'push-up', 'pushup',
      'wyciska*'
    ]
  },
  {
    id: 'squat',
    label: 'przysiad / squat',
    aliases: ['squat*', 'przysiad*']
  },
  {
    id: 'deadlift',
    label: 'martwy ciąg / deadlift',
    aliases: ['deadlift*', 'dead lift*', 'martwy ciag', 'martwego ciagu', 'martwe ciagi', 'rdl', 'romanian deadlift']
  },
  {
    id: 'lunge',
    label: 'wykrok / lunge',
    aliases: ['lunge*', 'wykrok*']
  },
  {
    id: 'running',
    label: 'bieganie / running',
    aliases: ['running', 'run', 'jogging', 'biegan*']
  },
  {
    id: 'jumping',
    label: 'skoki / jumping',
    aliases: ['jump*', 'skok*', 'plyometric*', 'plyo']
  },
  {
    id: 'knee_extension',
    label: 'wyprost kolana / knee extension',
    aliases: ['knee extension', 'leg extension', 'wyprost kolana', 'prostowanie kolana']
  },
  {
    id: 'knee_flexion',
    label: 'zgięcie kolana / knee flexion',
    aliases: ['knee flexion', 'leg curl', 'hamstring curl', 'zgiecie kolana', 'zgiecia kolana', 'uginanie nog']
  }
]);

const bodyRegionRules = Object.freeze([
  { id: 'shoulder', aliases: ['shoulder*', 'bark*'] },
  { id: 'knee', aliases: ['knee*', 'kolan*'] },
  { id: 'back', aliases: ['back', 'lower back', 'lumbar', 'plec*', 'kregoslup', 'ledzw*'] },
  { id: 'elbow', aliases: ['elbow*', 'lokiec*'] },
  { id: 'wrist', aliases: ['wrist*', 'nadgarstek*'] },
  { id: 'hip', aliases: ['hip*', 'biodr*'] },
  { id: 'ankle', aliases: ['ankle*', 'kostk*'] },
  { id: 'neck', aliases: ['neck', 'szyj*'] }
]);

const restrictionCueAliases = Object.freeze([
  'bez', 'no', 'avoid*', 'dont', 'don t', 'do not', 'zakaz*', 'unik*', 'wyklucz*', 'ogranicz*', 'przeciwwskazan*',
  'nie robic', 'nie robie', 'nie wykonywac', 'nie wykonuje', 'nie cwiczyc', 'nie cwicze', 'nie moge', 'nie wolno', 'nie jestem w stanie', 'nie obciaz*',
  'pain', 'painful', 'hurts', 'hurt', 'boli', 'bolacy*', 'bolesn*', 'nasil*'
]);

const likelyIssueAliases = Object.freeze([
  'uraz*', 'kontuzj*', 'injur*', 'operacj*', 'rehabilitacj*', 'bol*', 'pain', 'ból', 'symptom*',
  ...bodyRegionRules.flatMap((region) => region.aliases)
]);

function normalize(text) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[łŁ]/g, 'l')
    .toLocaleLowerCase('pl-PL')
    .replace(/[^\p{L}\p{N}*]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenMatches(token, aliasToken) {
  if (aliasToken.endsWith('*')) return token.startsWith(aliasToken.slice(0, -1));
  return token === aliasToken;
}

function containsAlias(text, alias) {
  const tokens = text.split(' ').filter(Boolean);
  const aliasTokens = normalize(alias).split(' ').filter(Boolean);
  if (!tokens.length || !aliasTokens.length) return false;
  for (let start = 0; start <= tokens.length - aliasTokens.length; start += 1) {
    if (aliasTokens.every((part, offset) => tokenMatches(tokens[start + offset], part))) return true;
  }
  return false;
}

function aliasesFound(text, aliases) {
  return aliases.filter((alias) => containsAlias(text, alias));
}

function removeAliases(text, aliases) {
  let tokens = text.split(' ').filter(Boolean);
  for (const alias of aliases) {
    const aliasTokens = normalize(alias).split(' ').filter(Boolean);
    if (!aliasTokens.length) continue;
    for (let start = 0; start <= tokens.length - aliasTokens.length;) {
      const matches = aliasTokens.every((part, offset) => tokenMatches(tokens[start + offset], part));
      if (matches) {
        tokens.splice(start, aliasTokens.length);
        continue;
      }
      start += 1;
    }
  }
  return tokens.join(' ');
}

function isExplicitlyNoRestriction(text) {
  // Remove only this exact neutral provenance suffix; medical notes remain visible.
  const declaration = text.replace(/\s*\(deklaracja użytkownika\)\s*\.?\s*$/iu, '');
  const normalized = normalize(declaration).replace(/[.!?;]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(?:brak|nie mam|nie zglaszam|no|none)(?: (?:uraz\w*|kontuzj\w*|ograniczen\w*|przeciwwskazan\w*|bol\w*|injur\w*|restriction\w*|limitation\w*|contraindication\w*|pain))(?: (?:ani|i|or|and) (?:uraz\w*|kontuzj\w*|ograniczen\w*|przeciwwskazan\w*|bol\w*|injur\w*|restriction\w*|limitation\w*|contraindication\w*|pain))*$/.test(normalized)) return true;
  return /^(?:brak|nie mam|nie zglaszam|no|none|n\/a)(?: (?:uraz\w*|kontuzj\w*|ograniczen\w*|przeciwwskazan\w*|bol\w*|injur\w*|restriction\w*|limitation\w*|contraindication\w*|pain))*$/.test(normalized) ||
    /^(?:nie mam|brak) (?:zadnych |żadnych )?(?:uraz\w*|kontuzj\w*|ograniczen\w*|przeciwwskazan\w*|bol\w*)$/.test(normalized) ||
    /^(?:no|none) (?:known )?(?:injur\w*|restriction\w*|limitation\w*|contraindication\w*|pain)$/.test(normalized);
}

function isExplicitlyPainFree(text) {
  const normalized = normalize(text);
  const painFreePattern = /\b(?:no pain|pain free|without pain|nie boli|nie mam bolu|bez bolu)\b/g;
  if (!painFreePattern.test(normalized)) return false;
  const remainder = normalized.replace(painFreePattern, ' ').trim();
  return !restrictionCueAliases.some((alias) => alias !== 'no' && containsAlias(remainder, alias));
}

function splitClauses(text) {
  return text
    .split(/(?:[.!?;\n]+|\b(?:but|however|ale|jednak|natomiast)\b)/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function hasRestrictionCue(clause) {
  const normalized = normalize(clause)
    .replace(/\bno (?:known )?(?:injur\w*|restriction\w*|limitation\w*|contraindication\w*|pain)\b/g, ' ')
    .replace(/\b(?:no pain|pain free|without pain|nie boli|nie mam bolu|bez bolu)\b/g, ' ')
    .trim();
  return restrictionCueAliases.some((alias) => containsAlias(normalized, alias));
}

function getExerciseName(exercise) {
  if (typeof exercise === 'string') return exercise.trim();
  if (!exercise || typeof exercise !== 'object') return '';
  for (const field of ['exerciseName', 'name', 'title', 'exercise', 'displayName']) {
    if (typeof exercise[field] === 'string' && exercise[field].trim()) return exercise[field].trim();
  }
  return '';
}

function exerciseMatchesRule(name, rule) {
  const normalized = normalize(name);
  if (!normalized) return false;
  if (rule.id === 'upper_press' && containsAlias(normalized, 'leg press')) return false;
  return rule.aliases.some((alias) => containsAlias(normalized, alias));
}

function hasAmbiguousPressName(name, rule) {
  if (!['overhead_press', 'upper_press'].includes(rule.id)) return false;
  const normalized = normalize(name);
  if (!containsAlias(normalized, 'press')) return false;
  if (containsAlias(normalized, 'leg press')) return false;
  if (rule.id === 'overhead_press') {
    const knownHorizontal = ['bench press', 'chest press', 'floor press', 'incline press', 'decline press', 'push up', 'push-up', 'pushup'];
    if (knownHorizontal.some((alias) => containsAlias(normalized, alias))) return false;
  }
  return !exerciseMatchesRule(name, rule);
}

function findMovementRules(clause) {
  const normalized = normalize(clause);
  const overheadAliases = movementRules.find((rule) => rule.id === 'overhead_press').aliases;
  const overheadFound = aliasesFound(normalized, overheadAliases).length > 0;
  const withoutOverhead = overheadFound ? removeAliases(normalized, overheadAliases) : normalized;
  return movementRules.filter((rule) => {
    if (rule.id === 'overhead_press') return overheadFound;
    const source = rule.id === 'upper_press' ? withoutOverhead : normalized;
    return aliasesFound(source, rule.aliases).length > 0;
  });
}

function makeWarning(code, message, restrictionText) {
  return { code, message, ...(restrictionText ? { restrictionText } : {}) };
}

/**
 * Conservatively checks user-provided movement limitations against planned exercise names.
 * This is a lexical safety gate, not a diagnosis or a substitute for clinician review.
 * `injuryLimitations` is the current profile's free-text field; `plannedExercises` accepts
 * exercise-name strings or objects with an exerciseName/name/title/exercise/displayName.
 */
export function validateMovementRestrictions(injuryLimitations, plannedExercises) {
  if (injuryLimitations === undefined || injuryLimitations === null || injuryLimitations === '') {
    return { status: 'allowed', canProceed: true, blocks: [], warnings: [] };
  }
  if (typeof injuryLimitations !== 'string') {
    return {
      status: 'review-required', canProceed: false, blocks: [],
      warnings: [makeWarning('invalid_restriction_text', 'Ograniczenia nie są tekstem; wymagany jest przegląd przed planowaniem.')]
    };
  }

  const rawText = injuryLimitations.trim();
  if (!rawText || isExplicitlyNoRestriction(rawText)) {
    return { status: 'allowed', canProceed: true, blocks: [], warnings: [] };
  }

  const warnings = [];
  const blocks = [];
  if (!Array.isArray(plannedExercises)) {
    return {
      status: 'review-required', canProceed: false, blocks,
      warnings: [makeWarning('planned_exercises_missing', 'Podaj ćwiczenia planu, aby porównać je z ograniczeniami.', rawText)]
    };
  }
  if (plannedExercises.length === 0) {
    return {
      status: 'review-required', canProceed: false, blocks,
      warnings: [makeWarning('planned_exercises_missing', 'Lista planowanych ćwiczeń jest pusta; nie można sprawdzić ograniczeń.', rawText)]
    };
  }

  const exercises = plannedExercises.map((exercise, index) => ({ exercise, index, name: getExerciseName(exercise) }));
  const missingNames = exercises.filter(({ name }) => !name);
  if (missingNames.length) {
    warnings.push(makeWarning('exercise_name_missing', 'Co najmniej jedno ćwiczenie nie ma czytelnej nazwy; wymagany jest przegląd.', rawText));
  }

  const clauses = splitClauses(rawText);
  let understoodRestriction = false;
  let sawAffirmativeSafetyStatement = false;
  for (const clause of clauses) {
    const withoutAffirmativeStatements = normalize(clause)
      .replace(/\bno (?:known )?(?:injur\w*|restriction\w*|limitation\w*|contraindication\w*|pain)\b/g, ' ')
      .trim();
    if (!withoutAffirmativeStatements) continue;
    if (isExplicitlyPainFree(clause)) {
      sawAffirmativeSafetyStatement = true;
      continue;
    }
    const normalizedClause = normalize(clause);
    const movementMatches = findMovementRules(clause);
    const regionMatches = bodyRegionRules.filter((region) => region.aliases.some((alias) => containsAlias(normalizedClause, alias)));
    const issueMentioned = likelyIssueAliases.some((alias) => containsAlias(normalizedClause, alias));
    const cuePresent = hasRestrictionCue(clause);

    if (cuePresent && movementMatches.length) {
      understoodRestriction = true;
      for (const { exercise, index, name } of exercises) {
        if (!name) continue;
        const matchedRules = movementMatches.filter((rule) => exerciseMatchesRule(name, rule));
        for (const rule of matchedRules) {
          blocks.push({
            exerciseIndex: index,
            ...(exercise && typeof exercise === 'object' && exercise.id !== undefined ? { exerciseId: exercise.id } : {}),
            exerciseName: name,
            restrictionText: clause,
            matchedMovement: rule.id,
            matchedLabel: rule.label
          });
        }
        if (movementMatches.some((rule) => hasAmbiguousPressName(name, rule))) {
          warnings.push({
            ...makeWarning(
              'exercise_movement_name_ambiguous',
              'Nazwa ćwiczenia zawiera „press”, ale nie pozwala jednoznacznie określić jego wariantu; wymagany jest przegląd.',
              clause
            ),
            exerciseIndex: index,
            ...(exercise && typeof exercise === 'object' && exercise.id !== undefined ? { exerciseId: exercise.id } : {}),
            exerciseName: name
          });
        }
      }
      const movementTerms = movementMatches.flatMap((rule) => rule.aliases);
      const remainingText = removeAliases(normalizedClause, movementTerms);
      const remainingRegions = bodyRegionRules.filter((region) => region.aliases.some((alias) => containsAlias(remainingText, alias)));
      if (remainingRegions.length) {
        warnings.push(makeWarning(
          'broad_region_requires_review',
          'Ograniczenie wymienia także obszar ciała (' + remainingRegions.map((region) => region.id).join(', ') + '); inne ruchy obciążające ten obszar wymagają ręcznego przeglądu.',
          clause
        ));
      }
      continue;
    }

    if (cuePresent && regionMatches.length) {
      understoodRestriction = true;
      for (const { exercise, index, name } of exercises) {
        if (!name) continue;
        const normalizedName = normalize(name);
        for (const region of regionMatches) {
          if (region.aliases.some((alias) => containsAlias(normalizedName, alias))) {
            blocks.push({
              exerciseIndex: index,
              ...(exercise && typeof exercise === 'object' && exercise.id !== undefined ? { exerciseId: exercise.id } : {}),
              exerciseName: name,
              restrictionText: clause,
              matchedMovement: `named_region:${region.id}`,
              matchedLabel: `nazwa ćwiczenia zawiera obszar ${region.id}`
            });
          }
        }
      }
      warnings.push(makeWarning(
        'broad_region_requires_review',
        `Ograniczenie dotyczy obszaru ciała (${regionMatches.map((region) => region.id).join(', ')}), ale sama nazwa nie pozwala bezpiecznie sklasyfikować wszystkich ćwiczeń; wymagany jest przegląd.`,
        clause
      ));
      continue;
    }

    if (cuePresent || issueMentioned || movementMatches.length || regionMatches.length) {
      warnings.push(makeWarning(
        movementMatches.length ? 'restriction_direction_ambiguous' : 'restriction_mapping_ambiguous',
        'Nie da się jednoznacznie dopasować tego ograniczenia do zaplanowanego ruchu; wymagany jest przegląd przed planowaniem.',
        clause
      ));
      continue;
    }

    warnings.push(makeWarning(
      'restriction_text_unclassified',
      'Tekst ograniczeń nie pasuje do jawnego słownika; wymagany jest przegląd przed planowaniem.',
      clause
    ));
  }

  const uniqueBlocks = [];
  const seenBlocks = new Set();
  for (const block of blocks) {
    const key = `${block.exerciseIndex}|${block.matchedMovement}|${normalize(block.restrictionText)}`;
    if (seenBlocks.has(key)) continue;
    seenBlocks.add(key);
    uniqueBlocks.push(block);
  }
  const uniqueWarnings = [];
  const seenWarnings = new Set();
  for (const warning of warnings) {
    const key = `${warning.code}|${warning.exerciseIndex ?? ''}|${warning.exerciseName ?? ''}|${normalize(warning.restrictionText || '')}`;
    if (seenWarnings.has(key)) continue;
    seenWarnings.add(key);
    uniqueWarnings.push(warning);
  }

  if (!understoodRestriction && !sawAffirmativeSafetyStatement && !uniqueWarnings.length) {
    uniqueWarnings.push(makeWarning('restriction_mapping_ambiguous', 'Ograniczenia wymagają przeglądu przed planowaniem.', rawText));
  }
  const status = uniqueBlocks.length ? 'blocked' : uniqueWarnings.length ? 'review-required' : 'allowed';
  return {
    status,
    canProceed: status === 'allowed',
    blocks: uniqueBlocks,
    warnings: uniqueWarnings
  };
}

/**
 * Checks the complete movement-bearing plan sections that GM Coach previews and writes.
 * Warmup activity and stretch target/method are included because they are prescribed actions too.
 */
export function validatePlanMovementRestrictions(injuryLimitations, plan) {
  const plannedExercises = [
    ...(Array.isArray(plan?.exercises) ? plan.exercises : []),
    ...(plan?.warmup?.status === 'included' && Array.isArray(plan.warmup.items)
      ? plan.warmup.items.map((item) => ({ name: item?.activity }))
      : []),
    ...(plan?.postWorkoutStretching?.status === 'included' && Array.isArray(plan.postWorkoutStretching.items)
      ? plan.postWorkoutStretching.items.map((item) => ({ name: `${item?.method || ''} ${item?.target || ''}`.trim() }))
      : [])
  ];
  return validateMovementRestrictions(injuryLimitations, plannedExercises);
}

/** Fails closed for both matched conflicts and any unresolved movement limitation. */
export function assertPlanMovementRestrictionsAllowed(injuryLimitations, plan) {
  const result = validatePlanMovementRestrictions(injuryLimitations, plan);
  if (result.status === 'allowed') return result;

  const conflictingNames = [...new Set(result.blocks.map((block) => block.exerciseName))];
  const message = result.status === 'blocked'
    ? `Plan zablokowany: ograniczenia ruchowe pasują do ćwiczeń: ${conflictingNames.join(', ') || 'wskazanych elementów planu'}.`
    : 'Plan zablokowany: ograniczenia ruchowe nie dają się jednoznacznie porównać z planem; wymagany jest przegląd przed podglądem lub zapisem.';
  const reviewMessages = [...new Set(result.warnings.map((warning) => warning.message))];
  throw new Error(`${message}${reviewMessages.length ? ` ${reviewMessages.join(' ')}` : ''}`);
}
