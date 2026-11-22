// Read-only quick-strength fallback observed in Labatt's pinned public client:
// https://github.com/labatt/speediance-mcp/blob/96efbb3da0fa9d903defecbd2f726ea1885ce12e/src/speediance_mcp/tools/_common.py
// session_exercises calls free_intervals only for empty, non-cardio Free Lift.
// api.py/free_intervals + routes.py/detail_path use GET
// /api/app/trainingInfo/freeTrainingDetail/{integer trainingId}, no parameters.
// apiRead uses GM Coach's existing /api base, hence the /app path below.
// No mutation, persistence, namespace probing or cardio telemetry request.

const objectRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasRows = (value) => Array.isArray(value) && value.length > 0;

function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }
  return null;
}

function isCardio(info) {
  // Labatt parsing.py/is_cardio signals. Treat stringified codes/flags
  // conservatively as cardio too, rather than send a strength fallback.
  return (number(info.totalDistance) ?? 0) > 0 ||
    info.existBoatingSkiDataGraph === true || info.existBoatingSkiDataGraph === 1 ||
    info.existBoatingSkiDataGraph === 'true' || info.existBoatingSkiDataGraph === '1' ||
    number(info.courseType) === 2;
}

function safeFailure(code, message) {
  // Never echo exception messages, rejected API bodies, stderr or tokens.
  return { code, message };
}

function fallbackId(trainingId) {
  if (!/^[0-9]{1,19}$/.test(trainingId)) return null;
  const id = BigInt(trainingId);
  return id > 0n && id <= 9223372036854775807n ? String(id) : null;
}

/**
 * Dependencies are bound to one profile by the caller. runCli accepts argv;
 * apiRead accepts one GET path relative to the established /api base.
 * Returns {payload, rawOutput, source, partial, fallback}. rawOutput always
 * preserves the untouched CLI string; payload retains info and other fields,
 * with only an empty detail replaced when the exact fallback succeeds.
 * partial is a data-availability flag, not a login-status claim.
 */
export async function readCompletedSession({ trainingId, type, runCli, apiRead, nativeSource = false } = {}) {
  if (typeof trainingId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(trainingId)) {
    throw new TypeError('training_id ma nieprawidłowy format.');
  }
  if (!['program', 'free'].includes(type)) throw new TypeError('type musi mieć wartość program albo free.');
  if (typeof runCli !== 'function') throw new TypeError('Odczyt sesji wymaga wykonawcy CLI.');
  let rawOutput;
  try { rawOutput = await runCli(['session', trainingId, `--${type}`, '--json']); }
  catch {
    const error = new Error(nativeSource ? 'Nie udało się odczytać szczegółów sesji przez API Speediance; nie potwierdza to pustej historii ani wylogowania.' : 'Nie udało się odczytać szczegółów sesji przez Speediance CLI; nie potwierdza to pustej historii ani wylogowania.');
    error.code = nativeSource ? 'GM_COACH_SESSION_API_READ_FAILED' : 'GM_COACH_SESSION_CLI_READ_FAILED';
    throw error;
  }
  let payload;
  try {
    if (typeof rawOutput !== 'string') throw new Error();
    payload = JSON.parse(rawOutput);
    if (!objectRecord(payload)) throw new Error();
  } catch {
    const error = new Error('Szczegóły sesji z CLI nie mają oczekiwanego formatu JSON; nie pokazano surowego błędu.');
    error.code = 'GM_COACH_SESSION_INVALID_JSON';
    throw error;
  }
  const result = { payload, rawOutput, source: nativeSource ? 'speediance-api' : 'speediance-cli', partial: false, fallback: { attempted: false, status: 'not-needed' } };
  const partial = (reason) => ({ ...result, partial: true, fallback: { attempted: false, status: 'skipped', reason } });
  if (payload.training_id !== undefined && String(payload.training_id) !== trainingId) return partial('cli-session-id-mismatch');
  if (payload.kind !== type) return partial('cli-namespace-unconfirmed');

  // Do not overwrite any already-returned exercise payload, regardless of
  // whether the later normalizer understands all of its records.
  if (hasRows(payload.detail) || (objectRecord(payload.info) && hasRows(payload.info.actionList))) return result;
  if (type === 'program') return partial('program-detail-empty');
  if (!objectRecord(payload.info)) return partial('free-info-unavailable');
  const info = payload.info;
  if (isCardio(info)) return { ...result, fallback: { attempted: false, status: 'skipped', reason: 'cardio-session' } };
  if ((payload.detail !== undefined && payload.detail !== null && !Array.isArray(payload.detail)) ||
      (info.actionList !== undefined && info.actionList !== null && !Array.isArray(info.actionList))) {
    return partial('exercise-payload-format-unrecognized');
  }
  // An empty object or actionLibraryId does not prove non-cardio (rowing has
  // exercise IDs too). Require the positive capacity of the source's quick
  // strength fixture; otherwise report the unresolved classification.
  if (!((number(info.totalCapacity) ?? 0) > 0)) {
    return partial('non-cardio-strength-unconfirmed');
  }
  if (nativeSource) return partial('native-detail-already-read-empty');
  const id = fallbackId(trainingId);
  if (!id) return partial('fallback-requires-positive-int64-id');
  if (typeof apiRead !== 'function') return partial('fallback-reader-unavailable');

  const path = `/app/trainingInfo/freeTrainingDetail/${id}`;
  let response;
  try { response = await apiRead(path); }
  catch {
    return { ...result, partial: true, fallback: { attempted: true, status: 'failed', path,
      error: safeFailure('GM_COACH_SESSION_API_READ_FAILED', 'Nie udało się odczytać serii Free Lift przez API; szczegóły pozostają niepełne.') } };
  }
  if (objectRecord(response) && Object.hasOwn(response, 'code') && number(response.code) !== 0) {
    return { ...result, partial: true, fallback: { attempted: true, status: 'failed', path,
      error: safeFailure('GM_COACH_SESSION_API_REJECTED', 'API nie potwierdziło odczytu serii Free Lift; szczegóły pozostają niepełne.') } };
  }
  const rows = Array.isArray(response) ? response : objectRecord(response) ? response.data : undefined;
  if (!Array.isArray(rows)) {
    return { ...result, partial: true, fallback: { attempted: true, status: 'invalid-response', path,
      error: safeFailure('GM_COACH_SESSION_API_INVALID_DETAIL', 'API nie zwróciło oczekiwanej listy serii Free Lift.') } };
  }
  if (!rows.length) return { ...result, partial: true, fallback: { attempted: true, status: 'empty', path } };
  const hasSetData = rows.some((row) => objectRecord(row) && hasRows(row.finishedReps));
  if (!hasSetData) return { ...result, partial: true, fallback: { attempted: true, status: 'detail-without-sets', path } };
  const malformedRows = rows.some((row) => !objectRecord(row) || !Array.isArray(row.finishedReps));
  return {
    ...result, payload: { ...payload, detail: rows }, source: 'speediance-cli+free-training-detail',
    partial: malformedRows,
    fallback: { attempted: true, status: malformedRows ? 'partial' : 'read', path }
  };
}
