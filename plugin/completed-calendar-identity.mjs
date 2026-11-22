// Unofficial public observation: https://github.com/pookey/gm-summary/blob/57f42f0e510a2199ceeb135f2ef59f6d7ca019a4/speediance.py
// Exact immutable bytes fetched through public GitHub connector 2026-10-14; community routing observation only.
// Calendar identities are separate from mobile report ids and reservation codes.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validatedIdentities = new WeakSet();
function id(value) {
  const raw = typeof value === 'string' ? value : Number.isSafeInteger(value) ? String(value) : '';
  if (!/^[1-9]\d{0,18}$/.test(raw) || BigInt(raw) > 9223372036854775807n) throw new TypeError('Invalid completed calendar trainingId.');
  return raw;
}
export function inspectCompletedCalendarIdentities(data, { month, deviceType } = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '') || deviceType !== 1 || !Array.isArray(data) || data.length > 31) throw new TypeError('Invalid completed calendar context.');
  const dates = new Set(), result = [];
  let entries = 0;
  for (const day of data) {
    if (!object(day) || typeof day.date !== 'string' || !day.date.startsWith(`${month}-`) || !/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !Array.isArray(day.trainingPlanList)) throw new TypeError('Invalid completed calendar day.');
    const parsed = new Date(`${day.date}T12:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== day.date || dates.has(day.date)) throw new TypeError('Invalid or duplicate completed calendar date.');
    dates.add(day.date);
    entries += day.trainingPlanList.length;
    if (entries > 1000) throw new TypeError('Completed calendar entry limit exceeded.');
    for (const entry of day.trainingPlanList) {
      if (!object(entry)) throw new TypeError('Invalid calendar entry.');
      if (entry.deviceType !== undefined && entry.deviceType !== deviceType) throw new TypeError('Completed calendar device mismatch.');
      if (entry.isFinish !== 1) continue;
      if (entry.trainingId === undefined || entry.trainingId === null) {
        if ([2,4].includes(entry.type)) throw new TypeError('Missing completed calendar trainingId.');
        continue;
      }
      const identity = { training_id: id(entry.trainingId), kind: entry.type === 2 ? 'course' : entry.type === 4 ? 'ai' : 'unsupported', date: day.date,
        summary: entry, identityProvenance: { sourceEndpoint: '/app/v5/trainingCalendar/monthNew',
          selectedIdentifierField: 'trainingId', rawCalendarType: entry.type, completed: true,
          selectedDeviceType: deviceType, calendarIdentityVerified: true,
          mobileIdentityLinkageVerified: false, namespaceEvidence: 'unofficial-calendar-type-route-observation' } };
      // Freeze the routing evidence, while leaving the untouched API summary separate.
      Object.freeze(identity.identityProvenance);
      Object.freeze(identity);
      validatedIdentities.add(identity);
      result.push(identity);
    }
  }
  const count = new Date(`${month}-01T12:00:00Z`); count.setUTCMonth(count.getUTCMonth()+1,0);
  if (dates.size !== count.getUTCDate()) throw new TypeError('Incomplete completed calendar month.');
  return result;
}
export function resolveCompletedCalendarIdentity(entries, { trainingId, type, date } = {}) {
  const requested = id(trainingId);
  if (!Array.isArray(entries) || entries.length > 3000 || (type !== undefined && !['course','ai'].includes(type))) throw new TypeError('Invalid completed identity request.');
  if (entries.some(x => !validatedIdentities.has(x))) throw new TypeError('Unvalidated calendar identity.');
  const matches = entries.filter(x => x.training_id === requested && (date === undefined || x.date === date));
  // Type must not hide a collision in another namespace.
  if (matches.length !== 1 || !['course','ai'].includes(matches[0].kind) || (type !== undefined && matches[0].kind !== type)) throw new Error('Completed calendar identity missing or ambiguous.');
  return matches[0];
}
