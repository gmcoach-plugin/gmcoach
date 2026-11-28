import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOfficialCourseReservationPayload, executeOfficialCourseReservation } from '../plugin/official-course-reservation.mjs';

const input = () => ({ courseId: 12, selectedDetail: { requestedCourseId: 12, course: { id: 12, isPermission: true }, partial: false, operationStatus: 'read-only' }, date: '2026-10-03', today: '2026-10-03', deviceType: 1 });
test('official reservation builds exact public body and validates identity/date/device/permission', () => {
  assert.deepEqual(buildOfficialCourseReservationPayload(input()), { status: 1, deviceType: 1, thatDay: '2026-10-03', courseId: 12 });
  for (const patch of [{ courseId: '12' }, { deviceType: 2 }, { date: '2026-02-30' }, { add: 1 }, { selectedDetail: { ...input().selectedDetail, partial: true } }, { selectedDetail: { ...input().selectedDetail, course: { id: 13, isPermission: true } } }]) {
    assert.throws(() => buildOfficialCourseReservationPayload({ ...input(), ...patch }));
  }
  assert.throws(() => buildOfficialCourseReservationPayload({ ...input(), selectedDetail: { ...input().selectedDetail, course: { id: 12 } } }), /permission/);
  assert.equal(buildOfficialCourseReservationPayload({ ...input(), add: false, date: '2026-01-01' }).status, 0);
});
test('no writes without explicit confirmation and approved exact scientific preview', async () => {
  let writes = 0;
  const options = { ...input(), apiWrite: async () => { writes++; return true; }, calendarRead: async () => [], validateApprovedPreview: async () => false };
  await assert.rejects(executeOfficialCourseReservation(options), /confirmation/);
  await assert.rejects(executeOfficialCourseReservation({ ...options, confirm: true }), /scientifically/);
  assert.equal(writes, 0);
});
test('single successful submission remains unverified without documented course calendar shape', async () => {
  let writes = 0, reads = 0;
  const result = await executeOfficialCourseReservation({ ...input(), confirm: true,
    validateApprovedPreview: async payload => { assert.equal(payload.courseId, 12); return true; },
    apiWrite: async (route, payload) => { writes++; assert.equal(route, '/app/courseReservation'); assert.equal(payload.status, 1); return { code: 0, data: true }; },
    calendarRead: async () => { reads++; return [{ date: '2026-10-03', courseId: 12, status: 1, deviceType: 1 }]; }
  });
  assert.equal(writes, 1); assert.equal(reads, 1);
  assert.equal(result.operationStatus, 'submitted-unverified'); assert.equal(result.retryBlocked, true);
  assert.equal(result.scheduled, false); assert.equal(result.calendarReadbackVerified, false);
});
test('uncertain writes are never retried and errors are sanitized', async () => {
  let writes = 0, reads = 0;
  const result = await executeOfficialCourseReservation({ ...input(), confirm: true,
    validateApprovedPreview: async () => true,
    apiWrite: async () => { writes++; throw new Error('secret-token'); },
    calendarRead: async () => { reads++; }
  });
  assert.equal(writes, 1); assert.equal(reads, 0); assert.equal(result.retryBlocked, true);
  assert.equal(result.operationStatus, 'write-outcome-unknown'); assert.ok(!JSON.stringify(result).includes('secret-token'));
});
