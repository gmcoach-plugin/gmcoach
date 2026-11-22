// Pinned reference: stozo04/speediance-cli f8157ef94171125c252b02e598e7534838fd407b
// internal/workout/model.go. Capacity remains a reported scalar, never tonnage.
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function integer(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value !== 'number' && typeof value !== 'string') throw new TypeError('Invalid history number.');
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isSafeInteger(Math.trunc(number))) throw new TypeError('Unsafe history number.');
  return Math.trunc(number);
}
function text(value, fallback = '') {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') throw new TypeError('Invalid history text.');
  return value;
}
function localDate(timestamp) {
  if (!timestamp) return null;
  const date = new Date(timestamp > 1e12 ? Math.trunc(timestamp / 1000) * 1000 : timestamp * 1000);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid history timestamp.');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function historyId(value) {
  if (value === undefined || value === null || value === 0 || value === '0') return null;
  const raw = typeof value === 'string' ? value : Number.isSafeInteger(value) ? String(value) : '';
  if (!/^[1-9]\d{0,18}$/.test(raw) || BigInt(raw) > 9223372036854775807n) throw new TypeError('Unsafe history identity.');
  return BigInt(raw) <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(raw) : raw;
}
const HISTORY_KINDS = new Map([[1,'free'],[6,'free'],[7,'free'],[2,'course'],[3,'program'],[5,'program'],[4,'ai'],[9,'ai'],[10,'manual']]);
export function normalizeNativeWorkoutSummaries(records) {
  if (!Array.isArray(records) || records.length > 100000) throw new TypeError('Incomplete or invalid history list.');
  // https://github.com/labatt/speediance-mcp/blob/96efbb3da0fa9d903defecbd2f726ea1885ce12e/src/speediance_mcp/tools/_common.py35-37: exact numeric marker; missing identity alone is not imported.
  return records.filter(row => !(record(row) && (row.belongUserHealth === 1 || row.belongUserHealth === true))).map(row => {
    if (!record(row)) throw new TypeError('Invalid history row.');
    // Validate both reported identities independently, including an unused record id.
    const reportedTrainingId = historyId(row.trainingId);
    const reportedRecordId = historyId(row.id);
    const id = reportedTrainingId ?? reportedRecordId;
    if (id === null) throw new TypeError('Invalid history identity.');
    const type = integer(row.type);
    if (row.type !== undefined && row.type !== null && !((typeof row.type === 'number' && Number.isSafeInteger(row.type)) || (typeof row.type === 'string' && /^\d+$/.test(row.type)))) throw new TypeError('Invalid history session type.');
    const volume = row.totalCapacity ?? 0;
    if (typeof volume !== 'number' || !Number.isFinite(volume)) throw new TypeError('Invalid reported capacity.');
    const kind = HISTORY_KINDS.get(type) ?? '';
    const base = { training_id: id, title: text(row.title, 'Workout'), date: localDate(integer(row.startTimestamp) || integer(row.endTimestamp)), duration_secs: integer(row.trainingTime), calories: integer(row.calorie), volume, type: text(row.courseTypeStr, text(row.courseCategoryName)), kind };
    base.identityProvenance = {
      sourceEndpoint: '/mobile/v2/report/userTrainingDataRecord',
      selectedIdentifierField: reportedTrainingId !== null ? 'trainingId' : 'id',
      reportedTrainingId, reportedRecordId,
      rawReportType: row.type ?? null,
      normalizedReportType: type,
      namespaceHint: kind || null,
      namespaceHintSource: 'mobile-report-type-mapping',
      calendarIdentityVerified: false,
      detailNamespaceVerified: false
    };
    if (kind !== 'manual') return base;
    if (reportedTrainingId !== null && reportedRecordId !== null && String(reportedTrainingId) !== String(reportedRecordId)) throw new TypeError('Conflicting manual history identities.');
    const reportedMetrics = {};
    for (const key of ['trainingTime','calorie']) if (row[key] !== undefined && row[key] !== null) {
      if (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || row[key] < 0) throw new TypeError('Invalid manual history metric.');
      reportedMetrics[key] = row[key];
    }
    return { ...base, duration_secs: null, calories: null, volume: null, reportedMetrics,
      metricUnitsVerified: false, exerciseDetailAvailable: false, dataKind: 'manual-recorded-session-summary' };
  });
}
