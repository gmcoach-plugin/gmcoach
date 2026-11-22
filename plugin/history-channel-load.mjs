/** Customize load suggestion from completed-set cable channels (user-confirmed rules).
 * Rule 1: barbell and dual-handle movements -> Customize is the TOTAL of both cables (left + right).
 *         Evidence: saved warm-ups 23 kg = 11.5 + 11.5 and 36 kg = 18 + 18; dual handles confirmed by the user.
 * Rule 2: explicit side (leftRight 1/2) -> load of that side only.
 * Rule 3: single cable with only one reported channel -> that channel as the whole value.
 * Rule 4: no history for the exact exercise -> nearest analog (same movement pattern), approximate, lower confidence.
 * Rule 5: deload -> Epley conversion of the anchor to target reps x deload fraction, rounded to 0.5.
 * Native trainingInfoDetail.weights are not a Customize setting; fixedCustomizeSettingVerified stays false.
 * Nothing is written; the plan still needs the full table and user approval before saving.
 */
import { quantizeCustomizeLoad } from './customize-load-step.mjs';
export const HISTORY_CHANNEL_TOTAL_METHOD = 'history-channel-total';
// Deload practice in the strength-sport literature (Bell et al. 2022/2023 consensus and surveys) commonly
// reduces load ~10–20% together with fewer sets; default 0.85 is a planning parameter, overridable by deload policy.
export const DEFAULT_DELOAD_LOAD_FRACTION = 0.85;
const EQUIPMENT = new Set(['barbell', 'dual-handle', 'single-cable']);
const pos = x => Number.isFinite(x) && x > 0 && x <= 500;
const round05 = x => Math.round(x * 2) / 2;
// kg i lb: krok Customize urządzenia w kg (<=10 kg co 0,5; >10 kg pełne kg); lb przeliczane na kg i z powrotem co 0,1 lb. Deload w dół, poza deloadem najbliższa (remis w górę).
const stepLoad = (x, unit, deload) => quantizeCustomizeLoad(x, unit, deload ? 'floor' : 'nearest') ?? round05(x);
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function channelAnchor(set, equipment) {
  const L = pos(set.left) ? set.left : null, R = pos(set.right) ? set.right : null, A = pos(set.aggregate) ? set.aggregate : null;
  if (set.side === 1 || set.side === 2) {
    const v = set.side === 1 ? L : R;
    return v === null ? null : { value: v, rule: 'explicit-side', channels: { [set.side === 1 ? 'left' : 'right']: v } };
  }
  if (equipment === 'barbell' || equipment === 'dual-handle') {
    if (L !== null && R !== null) return { value: L + R, rule: 'two-cable-total', channels: { left: L, right: R } };
    return null;
  }
  const only = [L, R].filter(v => v !== null);
  if (only.length === 1) return { value: only[0], rule: 'single-cable-channel', channels: L !== null ? { left: L } : { right: R } };
  if (only.length === 0 && A !== null) return { value: A, rule: 'single-cable-channel', channels: { aggregate: A } };
  return null;
}

function similarity(target, rec) {
  if (!target.movementPattern || norm(rec.movementPattern) !== norm(target.movementPattern)) return 0;
  const a = new Set(norm(target.exerciseName).split(' ')), b = norm(rec.exerciseName).split(' ');
  const shared = b.filter(t => a.has(t)).length;
  return 1 + shared / Math.max(a.size, b.length, 1) + (rec.equipment === target.equipment ? 0.5 : 0);
}

// Anchor sets without logged RIR are assumed near failure (RIR 0–1 -> 0.5); targets without RIR keep the legacy 0.
export const DEFAULT_ANCHOR_RIR = 0.5;
export function suggestHistoryChannelTotal({ target, setReps, unit, history, deload = false, deloadLoadFraction = DEFAULT_DELOAD_LOAD_FRACTION, rirTarget, anchorRir = DEFAULT_ANCHOR_RIR } = {}) {
  if (rirTarget !== undefined && rirTarget !== null && !(Number.isFinite(rirTarget) && rirTarget >= 0 && rirTarget <= 10)) throw new TypeError('Invalid history-channel-total request.');
  if (!(Number.isFinite(anchorRir) && anchorRir >= 0 && anchorRir <= 10)) throw new TypeError('Invalid history-channel-total request.');
  const useRir = rirTarget !== undefined && rirTarget !== null;
  if (!target || !Number.isSafeInteger(target.exerciseId) || !EQUIPMENT.has(target.equipment) || ![0, 1, 2].includes(target.side ?? 0) ||
    !['kg', 'lb'].includes(unit) || !Array.isArray(setReps) || !setReps.length || !setReps.every(r => Number.isSafeInteger(r) && r >= 1 && r <= 30) ||
    !Array.isArray(history) || history.length > 500 || !(deloadLoadFraction > 0.4 && deloadLoadFraction <= 1)) throw new TypeError('Invalid history-channel-total request.');
  const side = target.side ?? 0;
  const usable = history.filter(r => r && Number.isSafeInteger(r.exerciseId) && r.unit === unit && r.warmup !== true &&
    Number.isSafeInteger(r.reps) && r.reps >= 1 && r.reps <= 30 && typeof r.observedAt === 'string' && EQUIPMENT.has(r.equipment));
  const pick = rows => rows.map(r => ({ r, a: channelAnchor({ ...r, side: r.side ?? 0 }, r.equipment) })).filter(x => x.a)
    .sort((x, y) => y.r.observedAt.localeCompare(x.r.observedAt) || y.a.value - x.a.value)[0];
  let best = pick(usable.filter(r => r.exerciseId === target.exerciseId && (r.side ?? 0) === side));
  let approximate = false, analogSource = null;
  if (!best) {
    const scored = usable.filter(r => r.exerciseId !== target.exerciseId && (r.side ?? 0) === side).map(r => ({ r, s: similarity(target, r) })).filter(x => x.s > 0);
    const top = Math.max(0, ...scored.map(x => x.s));
    best = pick(scored.filter(x => x.s === top).map(x => x.r));
    if (best) { approximate = true; analogSource = { exerciseId: best.r.exerciseId, exerciseName: best.r.exerciseName ?? null }; }
  }
  const base = { method: HISTORY_CHANNEL_TOTAL_METHOD, unit, exerciseId: target.exerciseId, side, fixedCustomizeSettingVerified: false, writesToSpeediance: false, requiresPlanApprovalBeforeSave: true };
  if (!best) return { ...base, status: 'needsInput', suggestedLoad: null, reason: 'no-channel-history-for-exercise-or-analog' };
  const { r, a } = best;
  const e1rm = a.value * (1 + (r.reps + (useRir ? anchorRir : 0)) / 30);
  const factor = deload ? deloadLoadFraction : 1;
  const perSet = setReps.map(reps => {
    const raw = useRir ? e1rm / (1 + (reps + rirTarget) / 30) : reps === r.reps ? a.value : e1rm / (1 + reps / 30);
    return stepLoad(Math.min(raw, reps >= r.reps ? a.value : Infinity) * factor, unit, deload);
  });
  return { ...base, status: 'suggested', suggestedLoad: Math.min(...perSet), perSetLoads: perSet, deload, deloadLoadFraction: deload ? deloadLoadFraction : null,
    approximate, analogSource, confidence: approximate ? 'low' : 'moderate',
    rirTarget: useRir ? rirTarget : null, anchorRir: useRir ? anchorRir : null,
    provenance: { sessionId: r.sessionId ?? null, observedAt: r.observedAt, set: r.set ?? null, reps: r.reps, channels: a.channels, rule: a.rule, anchorLoad: a.value, conversion: useRir ? 'epley-rir' : 'epley' } };
}

