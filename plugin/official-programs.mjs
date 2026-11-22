import { readOfficialCourses } from './official-courses.mjs';
const SOURCE = 'https://github.com/labatt/speediance-mcp/blob/96efbb3da0fa9d903defecbd2f726ea1885ce12e/src/speediance_mcp/tools/calendar.py';
const SCHEDULE_SOURCE = 'https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/4e12bc6108f43c2705e935aa3d5db563cb8a3c06/templates/browse.html';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positiveId = value => (typeof value === 'number' || (typeof value === 'string' && value.length <= 16 && /^\d+$/.test(value))) &&
  Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const clean = (value, max) => typeof value === 'string' ? value.slice(0, max).replace(/[\u0000-\u001f\u007f]/g, '') : undefined;

function boundedKeys(value, limit, issue, reason) {
  const keys = [];
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    if (keys.length === limit) { issue(reason); break; }
    keys.push(key);
  }
  return keys;
}

function unwrap(value) {
  if (!object(value) || !Object.hasOwn(value, 'code')) return value;
  if (value.code !== 0) throw new Error('api-failure');
  return value.data;
}

function programFields(raw, issue) {
  if (!object(raw) || positiveId(raw.id) === null || typeof raw.name !== 'string' || !raw.name.slice(0, 160).trim()) {
    issue('invalid-program-record'); return null;
  }
  const out = { id: positiveId(raw.id), name: clean(raw.name, 160) };
  if (raw.name.length > 160) issue('program-name-truncated');
  if (raw.description !== undefined) {
    if (typeof raw.description === 'string') {
      out.description = clean(raw.description, 240);
      if (raw.description.length > 240) issue('program-description-truncated');
    } else issue('invalid-program-description');
  }
  for (const key of ['weekCount', 'weekTrainingFrequency', 'difficultyId']) {
    if (raw[key] === undefined) continue;
    const number = positiveId(raw[key]);
    if (number === null || number > 10_000) issue(`invalid-${key}`);
    else out[key] = number;
  }
  if (raw.isPermission !== undefined) {
    if (typeof raw.isPermission === 'boolean') out.isPermission = raw.isPermission;
    else issue('invalid-permission-flag');
  }
  return out;
}

/** Public reference client renderProgramDetail reads these exact schedule fields.
 * Preserve identities/order only: this is no inferred dose, unit or suitability. */
function exclusiveSchedule(raw, issue) {
  if (!Array.isArray(raw)) { issue('invalid-exclusive-week-list'); return []; }
  if (raw.length > 50) issue('exclusive-week-list-truncated');
  let nodes = 0;
  const seenWeeks = new Set();
  const consume = () => { if (++nodes <= 2000) return true; issue('exclusive-schedule-node-limit-reached'); return false; };
  const unsupported = (row, known, limit, reason) => {
    if (boundedKeys(row, limit, issue, `${reason}-field-limit-reached`).some(key => !known.includes(key) && row[key] !== null && typeof row[key] === 'object')) issue(`unsupported-${reason}-structure`);
  };
  const weeks = [];
  for (const row of raw.slice(0, 50)) {
    if (!consume()) break;
    const week = object(row) ? positiveId(row.week) : null;
    if (week === null || week > 10000) { issue('invalid-exclusive-week-record'); continue; }
    if (seenWeeks.has(week)) { issue('duplicate-exclusive-week'); continue; }
    seenWeeks.add(week);
    const out = { week };
    unsupported(row, ['exclusivePlanDayList'], 30, 'exclusive-week');
    if (!Array.isArray(row.exclusivePlanDayList)) issue('missing-or-invalid-exclusive-day-list');
    else {
      out.exclusivePlanDayList = [];
      if (row.exclusivePlanDayList.length > 14) issue('exclusive-day-list-truncated');
      const seenDays = new Set();
      for (const dayRow of row.exclusivePlanDayList.slice(0, 14)) {
        if (!consume()) break;
        const day = object(dayRow) ? positiveId(dayRow.day) : null;
        if (day === null || day > 10000) { issue('invalid-exclusive-day-record'); continue; }
        if (seenDays.has(day)) { issue('duplicate-exclusive-day'); continue; }
        seenDays.add(day);
        const dayOut = { day };
        unsupported(dayRow, ['courseList'], 30, 'exclusive-day');
        if (!Array.isArray(dayRow.courseList)) issue('missing-or-invalid-exclusive-course-list');
        else {
          dayOut.courseList = [];
          dayOut.restDay = dayRow.courseList.length === 0;
          dayOut.reportedCourseCount = dayRow.courseList.length;
          if (dayRow.courseList.length > 20) issue('exclusive-course-list-truncated');
          for (const course of dayRow.courseList.slice(0, 20)) {
            if (!consume()) break;
            if (!object(course) || positiveId(course.id) === null || typeof course.courseTitle !== 'string' || !course.courseTitle.slice(0, 160).trim()) { issue('invalid-exclusive-course-record'); continue; }
            const courseOut = { id: positiveId(course.id), courseTitle: clean(course.courseTitle, 160) };
            if (course.courseTitle.length > 160) issue('exclusive-course-title-truncated');
            if (course.durationMinute !== undefined) {
              if (typeof course.durationMinute !== 'number' || !Number.isFinite(course.durationMinute) || course.durationMinute < 0 || course.durationMinute > 10000) issue('invalid-exclusive-course-duration');
              else courseOut.durationMinute = course.durationMinute;
            }
            unsupported(course, [], 30, 'exclusive-course');
            dayOut.courseList.push(courseOut);
          }
          dayOut.returnedCourseCount = dayOut.courseList.length;
        }
        out.exclusivePlanDayList.push(dayOut);
      }
    }
    weeks.push(out);
  }
  return weeks;
}

/** Read-only bounded public-program discovery; apiRead(path) owns auth/profile and timeouts. */
export async function readOfficialPrograms({ query = '', programId, apiRead, page, pageSize, returnLimit } = {}) {
  if (typeof apiRead !== 'function') throw new TypeError('apiRead is required.');
  if (typeof query !== 'string' || query.length > 200) throw new TypeError('query must be a string of at most 200 characters.');
  const detail = programId !== undefined;
  if (detail && [page, pageSize, returnLimit].some(value => value !== undefined)) throw new TypeError('Detail reads do not accept pagination arguments.');
  for (const [label, value, maximum] of [['page', page, 10000], ['pageSize', pageSize, 200], ['returnLimit', returnLimit, 200]]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > maximum)) throw new TypeError(`${label} must be an integer 1–${maximum}.`);
  }
  page ??= 1; pageSize ??= 200; returnLimit ??= 50;
  const id = detail ? positiveId(programId) : null;
  if (detail && id === null) throw new TypeError('programId must be a positive safe integer.');
  const result = { source: SOURCE, readOnly: true, operationStatus: 'read-only', programCreatedByThisCall: false, partial: false, issues: [],
    ...(detail ? { requestedProgramId: id, program: null, structure: {} } : {
      requestedPage: page, requestedPageSize: pageSize, returnedLimit: returnLimit,
      query: clean(query, 200), programs: [], matchedCount: 0, scannedCount: 0,
      omittedCount: 0, paginationExhaustive: false
    }) };
  const issue = reason => { result.partial = true; if (!result.issues.includes(reason) && result.issues.length < 100) result.issues.push(reason); };
  let raw;
  try { raw = unwrap(await apiRead(detail ? `/app/exclusivePlan/${id}` : `/mobile/exclusivePlan/page?pageNo=${page}&pageSize=${pageSize}`)); }
  catch { issue('official-program-read-failed'); return result; }
  if (detail) {
    const parsed = programFields(raw, issue);
    if (!parsed) return result;
    if (parsed.id !== id) { issue('program-response-identity-mismatch'); return result; }
    result.program = parsed;
    const legacy = raw.weekList !== undefined;
    const exclusive = raw.exclusivePlanWeekList !== undefined;
    // Unlike numeric aliases these shapes carry different information. Do not
    // silently prefer either, merge, or manufacture correspondence.
    if (legacy && exclusive) issue('conflicting-program-week-structures');
    else if (exclusive) {
      result.structure.source = SCHEDULE_SOURCE;
      result.structure.exclusivePlanWeekList = exclusiveSchedule(raw.exclusivePlanWeekList, issue);
    } else if (legacy) {
      if (!Array.isArray(raw.weekList)) issue('invalid-week-list');
      else {
        if (raw.weekList.length > 50) issue('week-list-truncated');
        result.structure.weekList = raw.weekList.slice(0, 50).flatMap(week => {
          if (!object(week) || typeof week.name !== 'string' || !week.name.slice(0, 160).trim()) { issue('invalid-week-record'); return []; }
          if (week.name.length > 160) issue('week-name-truncated');
          if (boundedKeys(week, 30, issue, 'week-field-limit-reached').some(key => week[key] !== null && typeof week[key] === 'object')) issue('unsupported-week-structure');
          return [{ name: clean(week.name, 160), ...(positiveId(week.id) !== null ? { id: positiveId(week.id) } : {}) }];
        });
      }
    } else issue('missing-week-list');
    const returnedWeeks = result.structure.weekList?.length ?? result.structure.exclusivePlanWeekList?.length;
    if (parsed.weekCount !== undefined && parsed.weekCount !== returnedWeeks) issue('incomplete-week-coverage');
    if (boundedKeys(raw, 100, issue, 'program-field-limit-reached').some(key => !['weekList', 'exclusivePlanWeekList'].includes(key) && raw[key] !== null && typeof raw[key] === 'object')) issue('unsupported-program-structure');
    return result;
  }
  if (!Array.isArray(raw)) { issue('invalid-program-list-shape'); return result; }
  // One source-supported page only; a short page does not prove global exhaustion.
  if (raw.length >= pageSize) issue('program-page-may-have-more');
  if (raw.length > pageSize) { result.omittedCount += raw.length - pageSize; issue('program-scan-limit-reached'); }
  const needle = query.trim().toLowerCase();
  const seen = new Set();
  for (const row of raw.slice(0, pageSize)) {
    result.scannedCount++;
    const parsed = programFields(row, issue);
    if (!parsed) { result.omittedCount++; continue; }
    if (seen.has(parsed.id)) { result.omittedCount++; issue('duplicate-program-id'); continue; }
    seen.add(parsed.id);
    if (needle && !`${parsed.name}\n${typeof row.description === 'string' ? row.description.slice(0, 10_000) : ''}`.toLowerCase().includes(needle)) continue;
    result.matchedCount++;
    if (result.programs.length < returnLimit) result.programs.push(parsed);
    else { result.omittedCount++; issue('program-result-limit-reached'); }
  }
  result.note = 'One repository-observed page only; not a complete catalog guarantee. Permission is reported, never bypassed. Official programs do not replace the scientific review of a personalized plan.';
  return result;
}


/** Selected catalog day only. Resource cap is local policy, not an API limit. */
export async function readOfficialProgramDay({ programId, week, day, apiRead, assertCurrent } = {}) {
  for (const [name, value] of Object.entries({ programId, week, day })) {
    if (!Number.isSafeInteger(value) || value < 1 || value > (name === 'programId' ? Number.MAX_SAFE_INTEGER : 10000)) throw new TypeError(`Invalid ${name}.`);
  }
  if (typeof assertCurrent !== 'function') throw new TypeError('Account guard required.');
  await assertCurrent();
  const program = await readOfficialPrograms({ programId, apiRead });
  await assertCurrent();
  const selectedDay = { week, day, status: 'unavailable', partial: true, courses: [], issues: [], maxCourseDetails: 5,
    readOnly: true, scientificApproval: false, executablePrescriptionVerified: false };
  const finish = reason => { selectedDay.issues.push(reason); return { ...program, selectedDay }; };
  if (!program.program || program.partial) return finish('program-coverage-unqualified');
  if (program.program.isPermission === false) return finish('program-permission-denied');
  const weeks = program.structure.exclusivePlanWeekList;
  const selectedWeek = weeks?.filter(row => row.week === week);
  if (selectedWeek?.length !== 1) return finish('selected-week-unavailable');
  const days = selectedWeek[0].exclusivePlanDayList?.filter(row => row.day === day);
  if (days?.length !== 1) return finish('selected-day-unavailable');
  const courses = days[0].courseList;
  if (!Array.isArray(courses) || days[0].reportedCourseCount !== courses.length) return finish('selected-day-course-coverage-incomplete');
  if (courses.length > 5) return finish('selected-day-course-resource-limit');
  if (new Set(courses.map(row => row.id)).size !== courses.length) return finish('selected-day-course-id-duplicate');
  selectedDay.status = courses.length ? 'read' : 'rest-day'; selectedDay.partial = false;
  for (const course of courses) {
    await assertCurrent();
    const detail = await readOfficialCourses({ courseId: course.id, apiRead });
    await assertCurrent();
    selectedDay.courses.push({ selectedCourseId: course.id, detail });
    if (detail.partial || !detail.course || detail.course.isPermission === false) {
      selectedDay.partial = true; selectedDay.status = 'partial';
      selectedDay.issues.push(detail.course?.isPermission === false ? 'course-permission-denied' : 'course-detail-partial');
    }
  }
  return { ...program, selectedDay };
}
