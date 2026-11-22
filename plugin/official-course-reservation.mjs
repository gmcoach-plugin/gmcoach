import { normalizeScheduleDate } from './program-calendar.mjs';
import { assertWritableDeviceType } from './program-payload.mjs';

export const OFFICIAL_COURSE_RESERVATION_SOURCE = 'https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/4e12bc6108f43c2705e935aa3d5db563cb8a3c06/api_client.py';

/** A reservation is not creation or scientific approval of a personal plan. */
export function buildOfficialCourseReservationPayload({ courseId, selectedDetail, date, deviceType, add = true, today } = {}) {
  if (!Number.isSafeInteger(courseId) || courseId < 1) throw new TypeError('courseId must be a positive safe integer.');
  if (typeof add !== 'boolean') throw new TypeError('add must be boolean.');
  assertWritableDeviceType(deviceType);
  normalizeScheduleDate(date, today, !add);
  if (!selectedDetail || selectedDetail.requestedCourseId !== courseId || selectedDetail.course?.id !== courseId ||
      selectedDetail.partial !== false || selectedDetail.operationStatus !== 'read-only') {
    throw new Error('An exact complete selected official-course detail is required.');
  }
  // Permission is an upstream access decision, not a scientific suitability decision.
  if (selectedDetail.course.isPermission !== true) throw new Error('Official-course permission must be explicitly confirmed.');
  return { status: add ? 1 : 0, deviceType, thatDay: date, courseId };
}

/** No documented course calendar readback shape has been established. Never
 * reuse templateCode/calendar-template semantics for a courseId reservation. */
export function inspectOfficialCourseReservationReadback() {
  return { verified: false, status: 'unsupported_shape', reason: 'Official-course calendar identity/status fields are not yet source-confirmed.' };
}

/** Caller must bind approval to this exact payload in its scientific preview
 * registry, serialize writes, and honor retryBlocked after every attempted write. */
export async function executeOfficialCourseReservation(options = {}) {
  const { confirm, apiWrite, calendarRead, validateApprovedPreview } = options;
  const payload = buildOfficialCourseReservationPayload(options);
  if (confirm !== true) throw new Error('Explicit reservation confirmation is required.');
  if (typeof apiWrite !== 'function' || typeof calendarRead !== 'function' || typeof validateApprovedPreview !== 'function') {
    throw new TypeError('apiWrite, calendarRead and scientific preview approval validator are required.');
  }
  if (await validateApprovedPreview(structuredClone(payload)) !== true) throw new Error('Exact scientifically reviewed reservation preview was not approved.');
  const result = { source: OFFICIAL_COURSE_RESERVATION_SOURCE, payload, mutationSent: true,
    programCreatedByThisCall: false, programModifiedByThisCall: false,
    calendarReadbackVerified: false, scheduled: false, retryBlocked: true };
  let response;
  try { response = await apiWrite('/app/courseReservation', structuredClone(payload)); }
  catch { return { ...result, operationStatus: 'write-outcome-unknown', reason: 'Reservation request outcome is unknown; inspect account state before any new attempt.' }; }
  if (response !== true && !(response && response.code === 0 && response.data === true)) {
    return { ...result, operationStatus: 'write-outcome-unverified', reason: 'Reservation response does not establish success.' };
  }
  try { await calendarRead({ date: payload.thatDay, deviceType: payload.deviceType }); }
  catch { return { ...result, operationStatus: 'submitted-unverified', reason: 'Reservation submitted; calendar read failed.' }; }
  return { ...result, operationStatus: 'submitted-unverified', readback: inspectOfficialCourseReservationReadback() };
}
