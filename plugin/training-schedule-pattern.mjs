import { classifyCalendarTemplateEntry, normalizeScheduleDate } from './program-calendar.mjs';

// Parity reference: labatt/speediance-smartgym-workout-manager,
// fdd62c8fcecbb22f195ca9d86020026173d6cb78/schedule_planner.py.
// This is finite local organization, never scientific or write approval.
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const CODE = /^[A-Za-z0-9._-]{1,128}$/;
const DAY_MS = 86_400_000;
const codeSchema = { anyOf: [{ type: 'string', pattern: CODE.source }, { type: 'null' }] };
export const trainingSchedulePatternSchema = {
  type: 'object', additionalProperties: false, required: ['schedule', 'startDate', 'endDate'],
  properties: {
    startDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    protectBefore: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    schedule: { oneOf: [
      { type: 'object', additionalProperties: false, required: ['mode', 'days'], properties: {
        mode: { const: 'weekly' }, days: { type: 'object', additionalProperties: false, properties: Object.fromEntries(DAYS.map(day => [day, codeSchema])) }
      } },
      { type: 'object', additionalProperties: false, required: ['mode', 'anchor', 'sequence'], properties: {
        mode: { const: 'cycle' }, anchor: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        sequence: { type: 'array', minItems: 1, maxItems: 366, items: codeSchema }
      } }
    ] }
  }
};
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error('Nieprawidłowe pola harmonogramu.');
}
function date(value) { return normalizeScheduleDate(value, undefined, true); }
function code(value) {
  if (value !== null && (typeof value !== 'string' || !CODE.test(value))) throw new Error('Nieprawidłowy kod szablonu.');
  return value;
}
const stamp = value => Date.parse(`${value}T00:00:00.000Z`);
export function expandTrainingSchedule(input) {
  object(input, ['schedule', 'startDate', 'endDate', 'protectBefore']);
  const startDate = date(input.startDate), endDate = date(input.endDate);
  const length = (stamp(endDate) - stamp(startDate)) / DAY_MS + 1;
  if (!Number.isSafeInteger(length) || length < 1 || length > 366) throw new Error('Zakres harmonogramu musi obejmować od 1 do 366 dni.');
  const protectBefore = input.protectBefore === undefined ? undefined : date(input.protectBefore);
  const schedule = input.schedule;
  if (schedule?.mode === 'weekly') {
    object(schedule, ['mode', 'days']); object(schedule.days, DAYS);
    for (const value of Object.values(schedule.days)) code(value);
  } else if (schedule?.mode === 'cycle') {
    object(schedule, ['mode', 'anchor', 'sequence']); date(schedule.anchor);
    if (!Array.isArray(schedule.sequence) || schedule.sequence.length < 1 || schedule.sequence.length > 366) throw new Error('Cykl musi obejmować od 1 do 366 pozycji.');
    for (let index = 0; index < schedule.sequence.length; index++) code(schedule.sequence[index]);
  } else throw new Error('Nieznany tryb harmonogramu.');
  const dates = Array.from({ length }, (_, index) => {
    const time = stamp(startDate) + index * DAY_MS;
    const thatDay = new Date(time).toISOString().slice(0, 10);
    let templateCode;
    if (schedule.mode === 'weekly') templateCode = schedule.days[DAYS[(new Date(time).getUTCDay() + 6) % 7]] ?? null;
    else {
      const offset = (time - stamp(schedule.anchor)) / DAY_MS;
      templateCode = schedule.sequence[((offset % schedule.sequence.length) + schedule.sequence.length) % schedule.sequence.length];
    }
    return { date: thatDay, templateCode, rest: templateCode === null, protected: protectBefore !== undefined && thatDay <= protectBefore };
  });
  return { startDate, endDate, ...(protectBefore === undefined ? {} : { protectBefore }), dates,
    expectedSessions: dates.filter(day => !day.rest && !day.protected).length,
    scientificApproval: false, mutationSent: false, operationStatus: 'local-organization-only' };
}

/** Input reservations are raw calendar entries grouped by exact date; foreign,
 * completed and unknown entries are preserved, never treated as deletable. */
export function diffTrainingSchedule(input, reservationsByDate) {
  const expansion = expandTrainingSchedule(input);
  object(reservationsByDate, Object.keys(reservationsByDate ?? {}));
  for (const [day, entries] of Object.entries(reservationsByDate)) {
    date(day); if (!Array.isArray(entries)) throw new Error('Rezerwacje dnia muszą być tablicą.');
  }
  const changes = expansion.dates.filter(day => !day.protected).map(day => {
    const entries = reservationsByDate[day.date] ?? [];
    const current = entries.filter(entry => classifyCalendarTemplateEntry(entry)?.isReservation === true);
    const currentCodes = current.map(entry => classifyCalendarTemplateEntry(entry).code);
    const preservedEntries = entries.filter(entry => !current.includes(entry));
    const action = day.rest ? (current.length ? 'clear' : 'noop')
      : current.length === 1 && currentCodes[0] === day.templateCode ? 'noop'
        : current.length ? 'replace' : 'write';
    return { ...day, action, removeCodes: ['clear', 'replace'].includes(action) ? [...new Set(currentCodes)] : [], preservedEntries };
  });
  return { ...expansion, changes };
}
