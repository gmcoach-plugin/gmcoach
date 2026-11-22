import { getReferenceClientRmPresetById, sameObservedRmPresetDose } from './preset-mapping.mjs';

// Readback can compress a shared marker to "3.5" for many sets. Readiness must
// follow the preset ID, not depend on expanded wire-marker arrays.
export function savedSmartRmRequiresAccountObservation(current, replacement) {
  const requestedPreset = Number(replacement?.templatePresetId);
  if (!getReferenceClientRmPresetById(requestedPreset)) return false;
  if (!current || Number(current.templatePresetId) !== requestedPreset) return true;
  if (sameObservedRmPresetDose(current, replacement)) return false;
  return ['setsAndReps', 'weights', 'counterweight', 'counterweight2'].some((field) =>
    JSON.stringify(current[field]) !== JSON.stringify(replacement[field]));
}

// Account observations are process-local, short-lived, and never supplied by
// tool callers. Local/user-entered anchors do not prove device account readiness.
export function createSmartRmReadinessRegistry({ now = Date.now, ttlMs = 10 * 60_000 } = {}) {
  const observations = new Map();
  const key = (profile, fingerprint, groupId) => JSON.stringify([profile, fingerprint, groupId]);
  return {
    observe(profile, fingerprint, groupId, candidates) {
      const reported = (Array.isArray(candidates) ? candidates : []).filter((candidate) =>
        candidate?.groupId === groupId && candidate.kind === 'reported' &&
        typeof candidate.value === 'number' && Number.isFinite(candidate.value) && candidate.value > 0 &&
        (candidate.actionLibraryId === undefined || (Number.isSafeInteger(candidate.actionLibraryId) && candidate.actionLibraryId > 0)));
      observations.set(key(profile, fingerprint, groupId), {
        expiresAt: now() + ttlMs,
        candidates: reported.map((candidate) => ({ actionLibraryId: candidate.actionLibraryId }))
      });
    },
    check(profile, fingerprint, groupId, selectedVariant, availableVariants) {
      const entry = observations.get(key(profile, fingerprint, groupId));
      if (!entry || entry.expiresAt <= now()) {
        observations.delete(key(profile, fingerprint, groupId));
        return { ready: false, reason: 'account-1rm-not-observed' };
      }
      const variants = [...new Set((availableVariants || []).filter((id) => Number.isSafeInteger(id) && id > 0))];
      if (!variants.includes(selectedVariant)) return { ready: false, reason: 'variant-not-confirmed' };
      // reference client’s strength anchors and the statistics endpoint are keyed by
      // exercise group. Select/confirm the variant separately. An explicitly
      // variant-scoped statistic must still match that variant exactly.
      const matched = entry.candidates.find((candidate) => candidate.actionLibraryId === selectedVariant) ||
        entry.candidates.find((candidate) => candidate.actionLibraryId === undefined);
      return matched
        ? { ready: true, source: 'speediance-explicit-account-1rm', evidence: 'account-statistic-presence', scope: matched.actionLibraryId === undefined ? 'exercise-group' : 'exercise-variant', deviceLoadVerified: false }
        : { ready: false, reason: 'account-1rm-missing-for-variant' };
    }
  };
}
