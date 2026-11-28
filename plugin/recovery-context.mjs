import { createHash, randomBytes } from 'node:crypto';

const FEEDS = new Set(['fatigue','trainingLoad','strengthScore','recovery','sleep','bodyMeasurements','physicalCondition','healthCards','heartRateZones','importedActivities']);
const KEYS = new Set(`available status rows provenance caution date start_date end_date feeds coverage requestedFeeds availableFeeds errorFeeds incompleteFeeds biologicalReadinessCalculated trainingPartId2 fatigue muscleLoadStatus lastLoadedAtAvailable trainingLoadValue recommendMin recommendMax dateStr trainingLoadUnit strengthVolumeEquivalent totalScore scoreUpdateTime regionalScoresAvailable realData reason blocks interpreted muscleLoadInterpreted sleepSeconds targetSleepMinutes measurements weight height bmi bodyFatPercentage weightUnit heightUnit unitSource cards walking nutrition bodyAge wellnessMonitor value createTimestamp reportedUnit interpretedUnit unitInterpretationSource measurementUnitVerified timestampUnit timestampTimeZone measurementFreshnessVerified physicalConditionResp physicalConditionParam physicalConditionScore fitness physicalConditionValue trainingStatus trainingStatusScore trainingStatusScoreAvg measurementTimestampAvailable recoveryScoreResp nightHrvResp nightRestingHeartRateResp sleepResp muscleLoadResp timeLevel levelRateMin levelRateMax levelRateDisplay maxHeartRate minHeartRate totalSeconds durationUnit durationInterpretationSource period physiologicalZoneClassificationVerified watchPairingInterpreted partName partNameStatus partNamesResolved partNameNote unparsedFields measuredDate start_date end_date`.split(' '));
for(const key of 'reportedTitle reportedStartTime classificationSource trainingTimeSeconds reportedCalorie reportedMileage calorieUnit mileageUnit upstreamCompleteness paginationContract returnedRows unknownMarkerCount invalidImportedCount outOfRangeCount omittedCount rowLimit'.split(' '))KEYS.add(key);
for(const key of 'trainingCount upperLowerImbalance regions chest legs back shoulder score oneRepMax actionName oneRepMaxUnit circumferenceUnit waist hip upperArm forearm thigh calf extDataAge extDataDate nightRestHeartRate nightRestHeartRateAvg sleepScore sleepScoreAvg sleepScores sleepDurationScore sleepDurationScorePercent sleepQualityScore sleepQualityScorePercent sleepEfficiencyScore sleepEfficiencyScorePercent sleepRegularityScore sleepRegularityScorePercent sleepStartLocal sleepEndLocal sleepTimeZone stageSeconds awake rem light deep secondaryMetrics deepSleepDuration longestSleepStreak'.split(' '))KEYS.add(key);
KEYS.add('zoneListReported'); KEYS.add('durationsComplete');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function safeReport(value) {
  let nodes = 0;
  function copy(item, depth = 0) {
    if (++nodes > 20000 || depth > 12) throw new Error('Recovery report exceeds bounds.');
    if (item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) return item;
    if (typeof item === 'string' && item.length <= 1500) return item;
    if (!item || typeof item !== 'object' || ![Object.prototype,null,Array.prototype].includes(Object.getPrototypeOf(item))) throw new Error('Recovery report requires finite plain JSON.');
    if (Object.getOwnPropertySymbols(item).length) throw new Error('Recovery report rejects symbols.');
    if (Array.isArray(item)) {
      const own = Object.getOwnPropertyNames(item);
      if (item.length > 1500 || own.length !== item.length + 1 || own.some(key => key !== 'length' && !/^(0|[1-9]\d*)$/.test(key))) throw new Error('Recovery report requires bounded dense arrays.');
      return Array.from({length:item.length}, (_,index) => {
        const descriptor = Object.getOwnPropertyDescriptor(item,String(index));
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor,'value')) throw new Error('Recovery report rejects sparse arrays and accessors.');
        return copy(descriptor.value,depth + 1);
      });
    }
    const result = {};
    for (const key of Object.getOwnPropertyNames(item)) {
      if (!KEYS.has(key) && !FEEDS.has(key)) throw new Error('Recovery report contains unsupported fields.');
      const descriptor = Object.getOwnPropertyDescriptor(item,key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor,'value')) throw new Error('Recovery report rejects hidden fields and accessors.');
      result[key] = copy(descriptor.value,depth + 1);
    }
    return result;
  }
  const result = copy(value);
  if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.available !== 'boolean' || typeof result.status !== 'string') throw new Error('Invalid normalized recovery report.');
  if (Buffer.byteLength(JSON.stringify(result)) > 250000) throw new Error('Recovery report exceeds byte limit.');
  return freeze(result);
}
function identity(profile, accountFingerprint) {
  if (typeof profile !== 'string' || !profile || profile.length > 128 || typeof accountFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(accountFingerprint)) throw new Error('Recovery context requires bound profile and account fingerprint.');
}
function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new Error('Invalid recovery request date.');
  return value;
}
function limitations(value) {
  if (!Array.isArray(value) || !value.length || value.length > 10 || value.some(text => typeof text !== 'string' || !text.trim() || text.length > 500)) throw new Error('Recovery context requires explicit bounded limitations.');
  return value.map(text => text.trim());
}
export const recoveryContextDeclarationSchema = Object.freeze({ type:'object',required:['status','limitations'],additionalProperties:false,properties:{status:{type:'string',enum:['reported','declined','unavailable','not_requested']},reportId:{type:'string',pattern:'^[a-f0-9]{48}$'},limitations:{type:'array',minItems:1,maxItems:10,items:{type:'string',minLength:1,maxLength:500}}} });
export const DEFAULT_RECOVERY_CONTEXT_DECLARATION = Object.freeze({ status:'declined', limitations:Object.freeze(['Recovery context omitted: no reported health or recovery data used; missing data does not confirm recovery or readiness.']) });
export function normalizeRecoveryContextDeclaration(declaration) {
  if (declaration === undefined || declaration === null) return { ...DEFAULT_RECOVERY_CONTEXT_DECLARATION, limitations: [...DEFAULT_RECOVERY_CONTEXT_DECLARATION.limitations] };
  if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration) || Object.keys(declaration).some(key => !['status','reportId','limitations'].includes(key))) throw new Error('Explicit recovery context declaration required.');
  if (!['reported','declined','unavailable','not_requested'].includes(declaration.status)) throw new Error('Unknown recovery context status.');
  if (declaration.status === 'reported' ? !/^[a-f0-9]{48}$/.test(declaration.reportId ?? '') : declaration.reportId !== undefined) throw new Error('Recovery report ID must match declared status.');
  return freeze({status:declaration.status,...(declaration.status==='reported'?{reportId:declaration.reportId}:{}),limitations:limitations(declaration.limitations)});
}
/** Pure server-owned registry. Caller must supply already authorized normalized reader output. No transport or persistence. */
export function createRecoveryContextRegistry({ now = () => Date.now(), ttlMs = 90 * 60_000, maxEntries = 100 } = {}) {
  if (typeof now !== 'function' || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 24 * 60 * 60_000 || !Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 1000) throw new Error('Invalid recovery registry bounds.');
  const records = new Map();
  function clock() { const time = now(); if (!Number.isSafeInteger(time) || time < 0) throw new Error('Invalid recovery clock.'); return time; }
  function prune(time) { for (const [id,record] of records) if (record.expiresAt <= time) records.delete(id); }
  function register({ profile, accountFingerprint, report, feed = 'all', requested = {} }) {
    identity(profile,accountFingerprint);
    if (feed !== 'all' && !FEEDS.has(feed)) throw new Error('Unknown normalized health feed.');
    if (!requested || typeof requested !== 'object' || Array.isArray(requested) || Object.keys(requested).some(key => !['date','start_date','end_date'].includes(key))) throw new Error('Invalid recovery requested period.');
    const period = Object.fromEntries(Object.entries(requested).map(([key,value]) => [key,calendarDate(value)]));
    if ((period.start_date === undefined) !== (period.end_date === undefined) || (period.start_date && period.start_date > period.end_date) || (period.date && period.start_date && (period.date < period.start_date || period.date > period.end_date))) throw new Error('Invalid recovery requested period.');
    const normalized = safeReport(report), time = clock(); prune(time);
    const dated = ['recovery','sleep','physicalCondition'].includes(feed);
    if (feed === 'all' ? (!period.date || !period.start_date || !period.end_date) : dated ? (!period.date || period.start_date !== undefined) : ['trainingLoad','importedActivities'].includes(feed) ? (!period.start_date || period.date !== undefined) : Object.keys(period).length > 0) throw new Error('Requested dates do not match health feed.');
    if (period.start_date && (Date.parse(period.end_date)-Date.parse(period.start_date))/86400000 > 90) throw new Error('Recovery range exceeds reader bounds.');
    if(feed==='importedActivities'&&Date.parse(period.end_date)-Date.parse(period.start_date)>30*86400000)throw new Error('Imported activity range exceeds31 dates.');
    for (const key of ['date','start_date','end_date']) if (normalized[key] !== undefined && normalized[key] !== period[key]) throw new Error('Report period differs from requested period.');
    if (records.size >= maxEntries) throw new Error('Recovery context registry capacity reached.');
    const id = randomBytes(24).toString('hex');
    const context = freeze({ status:'reported', reportId:id, reportDigest:hash(normalized), observedAt:new Date(time).toISOString(), expiresAt:time + ttlMs,
      feed, requested:period, report:normalized, measurementTiming:{ observedAtMeaning:'retrieval-time-only', requestedDateMeaning:'requested-calendar-date-not-measurement-timestamp', undatedFeeds:['fatigue','strengthScore','bodyMeasurements','healthCards','heartRateZones'], measurementFreshnessVerified:false, ...(feed==='importedActivities'||normalized.feeds?.importedActivities?{importedActivityTiming:'reported-local-date-timezone-unknown; range filtering does not verify upstream boundary completeness'}:{}) }, biologicalReadinessCalculated:false });
    records.set(id,{ profile,accountFingerprint,expiresAt:context.expiresAt,context });
    return context;
  }
  function resolve({ profile, accountFingerprint, declaration }) {
    identity(profile,accountFingerprint);
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) throw new Error('Explicit recovery context declaration required.');
    if (declaration.status === 'reported') {
      if (Object.keys(declaration).some(key => !['status','reportId','limitations'].includes(key)) || !/^[a-f0-9]{48}$/.test(declaration.reportId ?? '')) throw new Error('Reported recovery context requires an opaque server ID.');
      const time = clock(); prune(time); const record = records.get(declaration.reportId);
      if (!record || record.profile !== profile || record.accountFingerprint !== accountFingerprint) throw new Error('Recovery context is expired, absent or belongs to another account.');
      return freeze({ ...record.context, limitations:limitations(declaration.limitations), contextDigest:hash({ accountFingerprint, context:record.context, limitations:limitations(declaration.limitations) }) });
    }
    if (!['declined','unavailable','not_requested'].includes(declaration.status) || Object.keys(declaration).some(key => !['status','limitations'].includes(key))) throw new Error('Unknown recovery context declaration.');
    const limited = limitations(declaration.limitations);
    return freeze({ status:declaration.status, limitations:limited, reportedHealthUsed:false, biologicalReadinessCalculated:false, contextDigest:hash({ accountFingerprint,status:declaration.status,limitations:limited }) });
  }
  return Object.freeze({ register,resolve });
}
/** Exact scientific-decision binding; observations do not establish physiological readiness. */
export function recoveryContextDecisionBinding(context) {
  if (!context || !['reported','declined','unavailable','not_requested'].includes(context.status) || !/^[a-f0-9]{64}$/.test(context.contextDigest ?? '')) throw new Error('Resolved recovery context required.');
  return freeze({ category:'recovery_context',target:'plan',requiredStatus:'applied',value:`status=${context.status};contextDigest=${context.contextDigest}` });
}
