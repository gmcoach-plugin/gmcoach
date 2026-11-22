const SOURCE = 'https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/4e12bc6108f43c2705e935aa3d5db563cb8a3c06/templates/browse.html';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => (typeof value === 'number' || (typeof value === 'string' && value.length <= 16 && /^\d+$/.test(value))) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit).replace(/[\u0000-\u001f\u007f]/g, '') : undefined;
function keys(value, limit, issue) {
  const out = [];
  for (const key in value) if (Object.hasOwn(value, key)) {
    if (out.length >= limit) { issue('object-field-limit-reached'); break; }
    out.push(key);
  }
  return out;
}
function fieldText(out, raw, field, limit, issue) {
  if (raw[field] === undefined) return;
  if (typeof raw[field] !== 'string') { issue('invalid-text-field'); return; }
  out[field] = text(raw[field], limit);
  if (raw[field].length > limit) issue('text-field-truncated');
}
function numeric(out, raw, field, issue) {
  if (raw[field] === undefined) return;
  if (typeof raw[field] !== 'number' || !Number.isFinite(raw[field]) || raw[field] < 0) { issue('invalid-numeric-field'); return; }
  out[field] = raw[field];
}
function course(raw, issue) {
  if (!object(raw) || id(raw.id) === null) { issue('invalid-course-record'); return null; }
  const out = { id: id(raw.id) };
  fieldText(out, raw, 'courseTitle', 160, issue);
  if (!out.courseTitle?.trim()) issue('missing-course-title');
  for (const field of ['durationMinute', 'difficultyId', 'trainedUserCount', 'estimatedCalorie', 'estimatedCapacity']) numeric(out, raw, field, issue);
  if (raw.isPermission !== undefined) {
    if (typeof raw.isPermission === 'boolean') out.isPermission = raw.isPermission;
    else issue('invalid-permission-flag');
  }
  if (raw.categoryList !== undefined) {
    if (!Array.isArray(raw.categoryList)) issue('invalid-category-list');
    else {
      if (raw.categoryList.length > 30) issue('category-list-truncated');
      out.categoryList = raw.categoryList.slice(0, 30).flatMap(cat => {
        if (!object(cat) || typeof cat.categoryName !== 'string') { issue('invalid-category-record'); return []; }
        if (cat.categoryName.length > 160) issue('category-name-truncated');
        if (keys(cat, 30, issue).some(key => cat[key] !== null && typeof cat[key] === 'object')) issue('unsupported-category-structure');
        return [{ categoryName: text(cat.categoryName, 160) }];
      });
    }
  }
  if (keys(raw, 100, issue).some(key => !['categoryList', 'actionLibraryList'].includes(key) && raw[key] !== null && typeof raw[key] === 'object')) issue('unsupported-course-structure');
  return out;
}


/** Catalog read completeness is independent of executable/scientific coverage.
 * These are contract gaps, not assertions that undocumented raw fields are absent. */
function officialPrescriptionCoverage(raw, requestedCourseId, rootPath = '$') {
  const responseCourseId = object(raw) ? id(raw.id) : null;
  const identityStatus = responseCourseId === null ? 'unknown' : responseCourseId === requestedCourseId ? 'matched' : 'mismatched';
  const rows = object(raw) && Array.isArray(raw.actionLibraryList) ? raw.actionLibraryList : null;
  const observedFieldPaths = [];
  let observedFieldCount = 0;
  for (const [index, row] of (rows || []).slice(0, 200).entries()) {
    if (!object(row)) continue;
    for (const field of ['title', 'mainMuscleGroupName', 'setsAndReps', 'completionMethod', 'burningTimes', 'recommendedWeight']) {
      if (!Object.hasOwn(row, field)) continue;
      observedFieldCount++;
      if (observedFieldPaths.length < 100) observedFieldPaths.push(`${rootPath}.actionLibraryList[${index}].${field}`);
    }
  }
  return {
    status: 'source-contract-unverified', scienceExecutability: 'unknown', scientificApproval: false,
    requestedCourseId, responseCourseId, identityStatus,
    observedPathsScope: identityStatus === 'matched' ? 'requested-course-response' : 'unaccepted-response',
    catalogCompletenessIsScientificApproval: false,
    sourcePath: `${rootPath}.actionLibraryList`,
    reportedExerciseCount: rows ? rows.length : null,
    inspectedExerciseCount: rows ? Math.min(rows.length, 200) : 0,
    observedFieldPaths, observedFieldCount,
    observedPathsTruncated: observedFieldCount > observedFieldPaths.length || Boolean(rows && rows.length > 200),
    requiredSourceContracts: [
      'exact-catalog-and-action-variant-identity', 'per-set-work-dose-and-unit',
      'per-set-load-unit-and-preset-semantics', 'per-set-resistance-mode',
      'per-set-rest-and-side-transition', 'executable-section-order-and-references'
    ],
    diagnostics: [{ code: 'official-course-execution-contract-unverified', path: `${rootPath}.actionLibraryList` }],
    note: 'Reported catalog fields remain raw. Their presence and partial=false do not establish an executable prescription or scientific approval. Do not infer repetitions, seconds, load units, variants, resistance, rest or section mappings.'
  };
}

/** Public reference-client-observed catalog read. No interpretation of course dose or load units. */
export async function readOfficialCourses({ apiRead, query = '', courseId, page, pageSize, returnLimit } = {}) {
  if (typeof apiRead !== 'function') throw new TypeError('apiRead is required.');
  if (typeof query !== 'string' || query.length > 200) throw new TypeError('query must have at most 200 characters.');
  const detail = courseId !== undefined;
  if (detail && [page, pageSize, returnLimit].some(value => value !== undefined)) throw new TypeError('Detail reads do not accept pagination arguments.');
  for (const [label, value, maximum] of [['page', page, 10000], ['pageSize', pageSize, 200], ['returnLimit', returnLimit, 200]]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > maximum)) throw new TypeError(`${label} must be an integer 1–${maximum}.`);
  }
  page ??= 1; pageSize ??= 200; returnLimit ??= 50;
  const requested = detail ? id(courseId) : null;
  if (detail && requested === null) throw new TypeError('courseId must be a positive safe integer.');
  const result = { source: SOURCE, operationStatus: 'read-only', programCreatedByThisCall: false,
    partial: false, issues: [], doseSemantics: 'Raw course fields only; weights, capacity and dose units are not interpreted.',
    ...(detail ? { requestedCourseId: requested, course: null, exercises: [], prescriptionCoverage: officialPrescriptionCoverage(null, requested) } : {
      requestedPage: page, requestedPageSize: pageSize, returnedLimit: returnLimit, paginationExhaustive: false,
      courses: [], scannedCount: 0, matchedCount: 0, omittedCount: 0, query: text(query, 200)
    }) };
  const issue = reason => { result.partial = true; if (result.issues.length < 100) result.issues.push(reason); };
  let raw;
  let rawRootPath = '$';
  try {
    raw = await apiRead(detail ? `/app/v2/course/info/${requested}?weightConfig=1` : `/app/v2/course/page?pageNo=${page}&pageSize=${pageSize}`);
    if (object(raw) && Object.hasOwn(raw, 'code')) {
      if (raw.code !== 0) throw new Error('api-failure');
      rawRootPath = '$.data';
      raw = raw.data;
    }
  } catch { issue('official-course-read-failed'); return result; }
  if (!detail) {
    if (!Array.isArray(raw)) { issue('invalid-course-list-shape'); return result; }
    if (raw.length >= pageSize) issue('course-page-may-have-more');
    if (raw.length > pageSize) { result.omittedCount += raw.length - pageSize; issue('course-scan-limit-reached'); }
    const seen = new Set();
    const needle = query.trim().toLowerCase();
    for (const row of raw.slice(0, pageSize)) {
      result.scannedCount++;
      const parsed = course(row, issue);
      if (!parsed) { result.omittedCount++; continue; }
      if (seen.has(parsed.id)) { result.omittedCount++; issue('duplicate-course-id'); continue; }
      seen.add(parsed.id);
      if (needle && ![parsed.courseTitle || '', ...(parsed.categoryList || []).map(cat => cat.categoryName)].join('\n').toLowerCase().includes(needle)) continue;
      result.matchedCount++;
      if (result.courses.length < returnLimit) result.courses.push(parsed);
      else { result.omittedCount++; issue('course-result-limit-reached'); }
    }
    return result;
  }
  result.prescriptionCoverage = officialPrescriptionCoverage(raw, requested, rawRootPath);
  const parsed = course(raw, issue);
  if (!parsed) return result;
  if (parsed.id !== requested) { issue('course-response-identity-mismatch'); return result; }
  result.course = parsed;
  if (!Array.isArray(raw.actionLibraryList)) issue('missing-or-invalid-action-library-list');
  else {
    if (!raw.actionLibraryList.length) issue('empty-course-exercise-list');
    if (raw.actionLibraryList.length > 200) issue('course-exercise-list-truncated');
    result.exercises = raw.actionLibraryList.slice(0, 200).flatMap(ex => {
      if (!object(ex)) { issue('invalid-course-exercise'); return []; }
      const out = {};
      for (const field of ['title', 'mainMuscleGroupName', 'setsAndReps']) fieldText(out, ex, field, field === 'setsAndReps' ? 1000 : 160, issue);
      for (const field of ['completionMethod', 'burningTimes', 'recommendedWeight']) numeric(out, ex, field, issue);
      if (!out.title?.trim()) issue('missing-course-exercise-title');
      if (keys(ex, 30, issue).some(key => ex[key] !== null && typeof ex[key] === 'object')) issue('unsupported-course-exercise-structure');
      return [out];
    });
  }
  return result;
}
