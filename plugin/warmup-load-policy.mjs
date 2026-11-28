// Serie rozgrzewkowe z ciężarem: zawsze Customize ze stałym, lekkim ciężarem (40–50% roboczego).
// Nigdy Smart RM ani brak ciężaru. Gdy ciężaru brak, wyliczamy go z historii, a potem z analogii
// (ćwiczenie główne tej samej partii w planie).
const UNLOADED = new Set(['bodyweight', 'vita', 'cardio', 'none', 'band', 'stretch']);
export const WARMUP_LOAD_FRACTION = 0.45;
/** Warmup Smart RM is allowed only as an explicit, justified percent of at least 50% (preset floor); lighter warmups stay Customize kg. */
export const isPercentSmartRmWarmup = (e) => e?.loadType === 'smart-rm' && Array.isArray(e.sets) && e.sets.length > 0 &&
  e.sets.every((s) => Number.isInteger(s?.percent1RM) && s.percent1RM >= 50 && typeof s.percentReason === 'string' && s.percentReason.trim().length > 0);
const round = (v) => Math.max(1, Math.round(v * 2) / 2);
const working = (e) => { const w = (e.sets ?? []).map((s) => s.weight ?? s.weightKg ?? s.calculatedLoad).filter((v) => Number.isFinite(v) && v > 0); return w.length ? Math.max(...w) : null; };
const explicitSideLoads = (exercise) => {
  const sets = exercise?.sets;
  if (exercise?.unilateralPrescription !== 'explicit-sides' || !Array.isArray(sets) || sets.length < 2 || sets.length % 2 !== 0) return null;
  const bySide = new Map([[1, []], [2, []]]);
  for (let i = 0; i < sets.length; i++) {
    const set = sets[i], expectedSide = i % 2 === 0 ? 1 : 2;
    const weight = set?.weight ?? set?.weightKg ?? set?.calculatedLoad;
    if (set?.side !== expectedSide || !Number.isFinite(weight) || weight <= 0) return null;
    bySide.get(expectedSide).push(weight);
  }
  return new Map([...bySide].map(([side, weights]) => [side, Math.max(...weights)]));
};
const validManualWarmup = (exercise) => {
  const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
  if (exercise?.loadType !== 'customize-manual' || !sets.length ||
      !sets.every(set => Number.isFinite(set?.weight) && set.weight > 0 && ['kg', 'lb'].includes(set.weightUnit)) ||
      new Set(sets.map(set => set.weightUnit)).size !== 1) return false;
  return exercise.unilateralPrescription !== 'explicit-sides' ||
    sets.length >= 2 && sets.length % 2 === 0 && sets.every((set, i) => set.side === (i % 2 === 0 ? 1 : 2));
};
const unitOf = (e) => {
  const units = [...new Set((e.sets ?? []).map(s => s.weightUnit).filter(Boolean))];
  return units.length === 1 && ['kg', 'lb'].includes(units[0]) ? units[0] : null;
};
const modesOf = (e) => [...new Set((e.sets ?? []).map(s => s.mode ?? 1))].sort().join(',');
const compatibleAnalogy = (a, b) => Boolean(a.movementPattern && a.movementPattern === b.movementPattern &&
  a.weightBasis && a.weightBasis === b.weightBasis &&
  a.unilateralPrescription && a.unilateralPrescription === b.unilateralPrescription &&
  unitOf(a) && unitOf(a) === unitOf(b) && modesOf(a) === modesOf(b));
const sameVariant = (a, b) => String(a.groupId ?? a.id) === String(b.groupId ?? b.id) &&
  (a.actionLibraryId === undefined && b.actionLibraryId === undefined || a.actionLibraryId === b.actionLibraryId) &&
  (a.unilateralPrescription ?? null) === (b.unilateralPrescription ?? null) &&
  (a.weightBasis ?? null) === (b.weightBasis ?? null) && modesOf(a) === modesOf(b);

/** plan.exercises z section; history: Map(groupId -> {workingWeight, unit}) lub obiekt. Zwraca poprawiony plan i listę zmian. */
export function enforceWarmupLoads(plan, { history = new Map() } = {}) {
  const hist = history instanceof Map ? history : new Map(Object.entries(history ?? {}).map(([k, v]) => [Number(k), v]));
  const main = (plan?.exercises ?? []).filter((e) => (e.section ?? 'main') === 'main');
  const changes = [], unresolved = [];
  const exercises = (plan?.exercises ?? []).map((e) => {
    const isWarmup = e.section === 'warmup';
    const loaded = isWarmup && !UNLOADED.has(e.loadType) && (e.loadType === 'smart-rm' || e.loadType === 'customize-manual' || e.loadType === 'fixed-kg' || e.loadType === 'profile-auto');
    if (!loaded) return e;
    if (isPercentSmartRmWarmup(e)) return e;
    const okCustomize = validManualWarmup(e);
    if (okCustomize) return e;
    const id = e.groupId ?? e.id;
    const historyEntry = hist.get(id) ?? hist.get(String(id)) ?? hist.get(Number(id));
    const historyCompatible = ['kg', 'lb'].includes(historyEntry?.unit) &&
      (e.actionLibraryId === undefined || historyEntry?.actionLibraryId === e.actionLibraryId) &&
      (e.unilateralPrescription === undefined || historyEntry?.unilateralPrescription === e.unilateralPrescription) &&
      (e.weightBasis === undefined || historyEntry?.weightBasis === e.weightBasis) &&
      (historyEntry?.mode ?? 1) === Number((e.sets ?? [])[0]?.mode ?? 1);
    // Scalar history anchors cannot safely supply a deliberately asymmetric pair.
    const fromHistory = historyCompatible && e.unilateralPrescription !== 'explicit-sides' ? historyEntry?.workingWeight : null;
    const hasCompatibleLoads = (candidate) => e.unilateralPrescription === 'explicit-sides'
      ? candidate?.unilateralPrescription === 'explicit-sides' && explicitSideLoads(candidate) !== null
      : working(candidate) !== null;
    const sameExercise = main.find((m) => sameVariant(e, m) && unitOf(m) && hasCompatibleLoads(m));
    const analog = sameExercise ?? main.find((m) => compatibleAnalogy(e, m) && hasCompatibleLoads(m));
    const base = Number.isFinite(fromHistory) ? fromHistory : analog ? working(analog) : null;
    const unit = Number.isFinite(fromHistory) ? historyEntry.unit : unitOf(analog ?? {});
    const sideLoads = e.unilateralPrescription === 'explicit-sides' && analog ? explicitSideLoads(analog) : null;
    const warmupSideSetInvalid = e.unilateralPrescription === 'explicit-sides' &&
      (!(e.sets ?? []).length || (e.sets ?? []).length % 2 !== 0 || (e.sets ?? []).some((set, i) => set?.side !== (i % 2 === 0 ? 1 : 2)));
    if (!(base > 0) || !unit || e.unilateralPrescription === 'explicit-sides' && (!sideLoads || warmupSideSetInvalid)) {
      unresolved.push({ code: 'warmup_weight_required', entryId: e.entryId ?? id,
        requiredFields: ['weight', 'weightUnit'], reason: e.unilateralPrescription === 'explicit-sides'
          ? 'Brak zgodnego źródła z poprawnymi ciężarami osobno dla lewej i prawej strony albo rozgrzewka nie zawiera pełnych par Left/Right. Podaj ciężar i jednostkę dla każdej strony.'
          : 'Brak zgodnej historii lub analogii (wariant, jednostka, strony, wzorzec i tryb oporu). Podaj lekki ciężar rozgrzewki i jednostkę.' });
      return e;
    }
    const weight = round(base * WARMUP_LOAD_FRACTION);
    const source = Number.isFinite(fromHistory) ? 'history' : 'analogy';
    const convertedSets = (e.sets ?? []).map((s) => {
      const { rmLevel, rirTarget, ...rest } = s;
      const sideWeight = e.unilateralPrescription === 'explicit-sides' ? round(sideLoads.get(s.side) * WARMUP_LOAD_FRACTION) : weight;
      return { ...rest, weight: sideWeight, weightUnit: unit };
    });
    changes.push({ entryId: e.entryId ?? id, from: e.loadType, to: 'customize-manual', ...(e.unilateralPrescription === 'explicit-sides' ? { weightsBySide: { left: convertedSets.find(s => s.side === 1).weight, right: convertedSets.find(s => s.side === 2).weight } } : { weight }), unit, source, fraction: WARMUP_LOAD_FRACTION });
    const clean = Object.fromEntries(Object.entries(e).filter(([k]) => !/^smartRm|^userRequestedReferenceClientCustomize$/.test(k)));
    return { ...clean, loadType: 'customize-manual', staticLoadRequested: true, sets: convertedSets };
  });
  return { plan: { ...plan, exercises }, changes, unresolved, status: unresolved.length ? 'needs-user-weight' : changes.length ? 'auto-corrected' : 'ok' };
}

export function auditWarmupLoads(plan) {
  const issues = (plan?.exercises ?? []).filter((e) => e.section === 'warmup' && !isPercentSmartRmWarmup(e) && (e.loadType === 'smart-rm' || ((e.loadType === 'customize-manual') && (e.sets ?? []).some((s) => !(s.weight > 0)))))
    .map((e) => ({ code: 'warmup_load_not_customize', entryId: e.entryId ?? e.id, loadType: e.loadType, fix: 'Rozgrzewka z ciężarem: Customize, stały lekki ciężar 40–50% roboczego.' }));
  return { status: issues.length ? 'warning' : 'ok', issues };
}
