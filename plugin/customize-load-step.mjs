/** Device Customize load step (owner-confirmed, kg accounts): <=10 kg step 0.5 kg, >10 kg whole kg only.
 * Real write 2026-11-11 (batch of 4 templates): 54.5->54, 57.5->57, 50.5->50, 25.5->25, while 5.5 stayed 5.5.
 * The device truncates downward, so an illegal requested value is normalized with 'floor' to what will be stored.
 * Server-computed suggestions use 'nearest' (tie -> up, e.g. 10.5 -> 11) or 'floor' for deload (10.5 -> 10).
 * lb accounts: the device stores kg, so lb is converted (1 lb = 0.45359237 kg), snapped with the same kg step and mode,
 * then converted back to lb rounded to 0.1 lb. Floor tolerates the 0.05 lb display rounding of a legal kg value. */
export const CUSTOMIZE_KG_HALF_STEP_MAX = 10;
export const KG_PER_LB = 0.45359237;
const EPS = 1e-9;
export function customizeKgStep(kg) { return kg <= CUSTOMIZE_KG_HALF_STEP_MAX + EPS ? 0.5 : 1; }
function snapKg(value, unit, mode) {
  const kg = unit === 'lb' ? value * KG_PER_LB : value, tol = unit === 'lb' && mode === 'floor' ? 0.05 * KG_PER_LB : 0;
  const snap = step => mode === 'floor' ? Math.floor((kg + tol) / step + EPS) * step : Math.floor(kg / step + 0.5 + EPS) * step;
  // Nearest/floor in the whole-kg zone can only reach 10 from above, which is also legal.
  return Number(snap(customizeKgStep(kg)).toFixed(1));
}
export function quantizeCustomizeLoad(value, unit = 'kg', mode = 'floor') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new RangeError('Invalid Customize load.');
  if (!['floor', 'nearest'].includes(mode)) throw new TypeError('mode must be floor or nearest.');
  if (unit !== 'kg' && unit !== 'lb') return null;
  const kg = snapKg(value, unit, mode);
  return unit === 'lb' ? Number((kg / KG_PER_LB).toFixed(1)) : kg;
}
/** Device-stored kg behind a Customize load given in kg or lb. */
export function customizeLoadDeviceKg(value, unit = 'kg', mode = 'floor') { return unit === 'kg' || unit === 'lb' ? snapKg(value, unit, mode) : null; }
export function normalizeRequestedCustomizeLoad(value, unit = 'kg') {
  const normalized = quantizeCustomizeLoad(value, unit, 'floor');
  if (normalized === null || Math.abs(normalized - value) < EPS) return { value, normalized: false };
  const rule = '(do 10 kg krok 0,5 kg, powyżej 10 kg pełne kg)';
  const note = unit === 'lb'
    ? value + ' lb (' + (value * KG_PER_LB).toFixed(2) + ' kg) nie jest dozwolone na urządzeniu ' + rule + '; urządzenie zapisze ' + customizeLoadDeviceKg(value, 'lb') + ' kg = ' + normalized + ' lb.'
    : value + ' kg nie jest dozwolone na urządzeniu ' + rule + '; urządzenie zapisze ' + normalized + ' kg.';
  return { value: normalized, normalized: true, requested: value, note };
}
