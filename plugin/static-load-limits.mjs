/** Public reference client UI limits. These validate static account-display loads,
 * never Smart RM markers or completed-session telemetry. No silent clamping. */
export function resolveStaticLoadMetadata(metadata) {
  const sources = [metadata?.detail, metadata?.batch].filter(source => source && typeof source === 'object');
  const flag = field => {
    const values = sources.filter(source => Object.hasOwn(source, field)).map(source => source[field]);
    if (!values.length || values.some(value => ![0, 1, false, true].includes(value))) return undefined;
    const resolved = new Set(values.map(value => value === 1 || value === true));
    return resolved.size === 1 ? [...resolved][0] : undefined;
  };
  return { isUnilateral: flag('isLeftRight'), isBarbell: flag('isBarbell') };
}

export function getStaticLoadRules({ displayUnit, isUnilateral, isBarbell }) {
  if (displayUnit !== 'kg' && displayUnit !== 'lb') throw new Error('Static load requires a confirmed kg/lb unit.');
  if (typeof isUnilateral !== 'boolean') throw new Error('Static load requires confirmed unilateral metadata.');
  // lb Customize loads are device kg steps shown in lb (0.1 lb), same rule as kg accounts;
  // minimums are the legal device kg values just below 8/15 lb (3.5 kg = 7.7 lb, 6.5 kg = 14.3 lb).
  if (displayUnit === 'lb') return { min: isUnilateral ? 7.7 : 14.3, max: isUnilateral ? 110 : 220, step: 0.1 };
  if (!isUnilateral && typeof isBarbell !== 'boolean') throw new Error('Static load requires confirmed barbell metadata.');
  return { min: isUnilateral ? 3.5 : isBarbell ? 7 : 3.5, max: isUnilateral ? 50 : 100, step: 0.5 };
}

export function validateStaticLoad(displayLoad, context) {
  const rules = getStaticLoadRules(context);
  if (typeof displayLoad !== 'number' || !Number.isFinite(displayLoad)
      || displayLoad < rules.min || displayLoad > rules.max
      || Math.abs(displayLoad / rules.step - Math.round(displayLoad / rules.step)) > 1e-8) {
    throw new RangeError(`Static load must be ${rules.min}–${rules.max} ${context.displayUnit}, step ${rules.step}.`);
  }
  return displayLoad;
}

/** Reference-only initial editor value; never an account-unit or load authorization. */
export function buildCustomizeUiDefaultPreview(metadata, exerciseId, options) {
  const base = { source: 'reference client initial Customize UI', sourceCommit: '4e12bc6108f43c2705e935aa3d5db563cb8a3c06', selectedPresetId: -1,
    executableAllowed: false, automaticApplication: false, scientificApproval: false,
    isOneRepMax: false, isSmartRmSelector: false, accountUnitVerified: false };
  if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some(key => !['recommendation_unit', 'display_unit'].includes(key))
      || options.recommendation_unit !== 'kg' || !['kg', 'lb'].includes(options.display_unit))
    return { ...base, status: 'needs-explicit-unit-declaration' };
  const detail = metadata?.detail;
  if (!detail || detail.id !== exerciseId || metadata?.groupIdentity?.executableAllowed === false)
    return { ...base, status: 'unconfirmed-group-identity' };
  const raw = detail.recommendedWeight;
  if (raw !== undefined && (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0))
    return { ...base, status: 'invalid-recommendation' };
  let rules;
  try { rules = getStaticLoadRules({ displayUnit: options.display_unit, ...resolveStaticLoadMetadata(metadata) }); }
  catch { return { ...base, status: 'unconfirmed-load-geometry' }; }
  const fallback = raw === undefined || raw === 0;
  const converted = fallback ? 10 : options.display_unit === 'lb' ? Math.round(raw * 2.2) : raw;
  const clamped = fallback ? converted : Math.max(rules.min, Math.min(rules.max, converted));
  const value = fallback ? clamped : Number((Math.round(clamped / rules.step) * rules.step).toFixed(options.display_unit === 'kg' ? 1 : 0));
  const withinUiRules = value >= rules.min && value <= rules.max;
  return { ...base, status: 'reference-preview', value, displayUnit: options.display_unit,
    recommendationUnit: 'kg', unitAuthority: 'explicit-caller-declaration-not-API-verification',
    rawRecommendation: raw, recommendationScope: 'group-not-variant', rules,
    usedFallback: fallback, conversionFactor: options.display_unit === 'lb' && !fallback ? 2.2 : null,
    clamped: !fallback && clamped !== converted, snapped: !fallback && value !== clamped, withinUiRules,
    note: fallback ? 'reference client UI uses its default 10 directly for zero/missing recommendation, without clamp. Bilateral imperial minimum is 15 lb: this reference default can be below that UI minimum and is not a valid executable load.'
      : 'Positive group recommendation is converted with reference client round(kg*2.2), clamped, then snapped. This is an editor default, not 1RM, a Smart RM preset, an assessment, or a training prescription.' };
}
