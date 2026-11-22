/** Expand only explicitly named scientific targets against the current dose. */
export function expandExplicitDecisionGroups(decisions, groups, bindings) {
  if (!Array.isArray(decisions) || !Array.isArray(groups) || !Array.isArray(bindings)) {
    throw new Error('Scientific decisions, groups and expected bindings must be arrays.');
  }
  const expected = new Map(bindings.map(binding => [`${binding.category}:${binding.target}`, binding]));
  const expanded = new Map();
  const add = decision => {
    if (!decision || typeof decision !== 'object' || Array.isArray(decision)) throw new Error('Scientific decision must be an object.');
    const key = `${decision.category}:${decision.target}`;
    if (!expected.has(key)) throw new Error(`Unexpected scientific target ${key}.`);
    if (expanded.has(key)) throw new Error(`Duplicate scientific target ${key}.`);
    const binding = expected.get(key);
    if (binding.value !== undefined && decision.value !== binding.value) throw Object.assign(new Error(`[science_decision_mismatch] Stale scientific value for ${key}: oczekiwano value=${JSON.stringify(binding.value)}, otrzymano ${JSON.stringify(decision.value)}. Napraw: podaj dokładnie oczekiwaną wartość (skopiuj ją z gm_coach_derive_evidence_bindings wywołanego z tymi samymi section/actionLibraryId co w podglądzie).`), { guardCode: 'science_decision_mismatch', code: 'science_decision_mismatch', guardDetails: { expectedDecision: { category: binding.category, target: binding.target, value: binding.value } } });
    expanded.set(key, structuredClone(decision));
  };
  for (const decision of decisions) add(decision);
  for (const group of groups) {
    if (!group || typeof group !== 'object' || Array.isArray(group) || Object.hasOwn(group, 'target')) throw new Error('Grouped scientific decision must use targets, not target.');
    if (!Array.isArray(group.targets) || group.targets.length < 1 || group.targets.length > 1575 || new Set(group.targets).size !== group.targets.length) {
      throw new Error('Grouped scientific targets must be a nonempty unique list.');
    }
    const { targets, ...shared } = group;
    for (const target of targets) add({ ...shared, target });
  }
  return bindings.filter(binding => expanded.has(`${binding.category}:${binding.target}`)).map(binding => expanded.get(`${binding.category}:${binding.target}`));
}

/** Expand explicitly addressed, identical decisions across cycle session definitions. */
export function expandSharedCycleDecisionEvidence(sessions, shared) {
  if (!Array.isArray(sessions) || !Array.isArray(shared) || shared.length > 1575) throw new Error('Invalid sharedDecisionEvidence list.');
  const byId = new Map(sessions.map(session => [session.sessionId, session]));
  if (byId.size !== sessions.length) throw new Error('Duplicate cycle sessionId.');
  const expanded = sessions.map(session => ({ ...session, plan: { ...session.plan, decisionEvidence: [...(session.plan.decisionEvidence ?? [])] } }));
  const targetSessions = new Map(expanded.map(session => [session.sessionId, session]));
  const occupied = new Set();
  for (const session of expanded) for (const decision of session.plan.decisionEvidence) {
    const key = `${session.sessionId}:${decision.category}:${decision.target}`;
    if (occupied.has(key)) throw new Error(`Duplicate scientific target ${key}.`);
    occupied.add(key);
  }
  for (const group of shared) {
    if (!group || typeof group !== 'object' || Array.isArray(group) || Object.hasOwn(group, 'target') || Object.hasOwn(group, 'sessionId')) throw new Error('Shared decision requires explicit session and target pairs.');
    if (!Array.isArray(group.targets) || group.targets.length < 2 || group.targets.length > 364) throw new Error('Shared decision requires 2–364 explicit targets.');
    const { targets, ...decision } = group;
    for (const address of targets) {
      if (!address || typeof address !== 'object' || Array.isArray(address) || Object.keys(address).length !== 2 || !Object.hasOwn(address, 'sessionId') || !Object.hasOwn(address, 'target') || typeof address.sessionId !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(address.sessionId) || typeof address.target !== 'string' || !/^(plan|exercise:[1-9][0-9]*|set:[1-9][0-9]*:[1-9][0-9]*|warmup:[1-9][0-9]*|stretch:[1-9][0-9]*)$/.test(address.target)) throw new Error('Invalid shared decision address.');
      const session = targetSessions.get(address.sessionId);
      if (!session) throw new Error(`Unknown shared decision session ${address.sessionId}.`);
      const key = `${address.sessionId}:${decision.category}:${address.target}`;
      if (occupied.has(key)) throw new Error(`Duplicate scientific target ${key}.`);
      occupied.add(key);
      session.plan.decisionEvidence.push(structuredClone({ ...decision, target: address.target }));
      if (session.plan.decisionEvidence.length > 1575) throw new Error('Expanded session decisionEvidence exceeds limit.');
    }
  }
  return expanded;
}
