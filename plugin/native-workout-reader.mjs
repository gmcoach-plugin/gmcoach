import { normalizeNativeWorkoutSummaries } from './native-workout-summary.mjs';
import { inspectCompletedCalendarIdentities, resolveCompletedCalendarIdentity } from './completed-calendar-identity.mjs';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const formatDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function midnight(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function addDays(date, days) { const result = new Date(date); result.setDate(result.getDate() + days); return result; }
function sessionId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw new TypeError('Invalid positive int64 session identity.');
  return value;
}

/** Native GET-only replacement for pinned CLI workouts/today/explicit session.
 * apiRead is profile-bound by the caller. Never probe another namespace or log in.
 */
export function createNativeWorkoutReader({ apiRead, now = () => new Date(), deviceType = 1 } = {}) {
  const todayCoverage = new WeakMap();
  if (typeof apiRead !== 'function' || typeof now !== 'function') throw new TypeError('Native history requires a reader and clock.');
  function clockDay() {
    const date = now();
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new TypeError('Invalid history clock.');
    return midnight(date);
  }
  async function data(path) {
    const envelope = await apiRead(path);
    if (!record(envelope) || envelope.code !== 0 || !Object.hasOwn(envelope, 'data')) throw new Error('Speediance did not confirm history data.');
    return envelope.data;
  }
  function activityReport(raw,start,end) {
    const start_date=formatDate(start),end_date=formatDate(addDays(end,-1));
    const rows=[];let unknownMarkerCount=0,invalidImportedCount=0,outOfRangeCount=0,omittedCount=0;
    if(!Array.isArray(raw)||raw.length>100000)throw new Error('Invalid bounded activity list.');
    for(const row of raw){
      if(!record(row)||![1,true].includes(row.belongUserHealth)){if(!record(row)||![0,false].includes(row.belongUserHealth))unknownMarkerCount++;continue;}
      const dateStr=typeof row.startTime==='string'?row.startTime.slice(0,10):null;
      if(!dateStr||!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)||!Number.isFinite(Date.parse(dateStr))||new Date(dateStr).toISOString().slice(0,10)!==dateStr){invalidImportedCount++;continue;}
      if(dateStr<start_date||dateStr>end_date){outOfRangeCount++;continue;}
      const item={dateStr,reportedStartTime:row.startTime.slice(0,100),timestampTimeZone:'unknown',classificationSource:'belongUserHealth=1'};
      if(row.title!==undefined&&row.title!==null){if(typeof row.title!=='string'||row.title.length>500){invalidImportedCount++;continue;}item.reportedTitle=row.title;}
      let invalid=false;
      for(const [input,output] of [['trainingTime','trainingTimeSeconds'],['calorie','reportedCalorie'],['mileage','reportedMileage']])if(row[input]!==undefined&&row[input]!==null){if(typeof row[input]!=='number'||!Number.isFinite(row[input])||row[input]<0){invalid=true;break;}item[output]=row[input];}
      if(invalid){invalidImportedCount++;continue;}
      item.calorieUnit='unknown';item.mileageUnit='unknown';
      if(rows.length<100)rows.push(item);else omittedCount++;
    }
    return {available:true,status:'partial',start_date,end_date,rows,provenance:'speediance-reported-health-import',biologicalReadinessCalculated:false,
      coverage:{upstreamCompleteness:'unknown',paginationContract:'unverified-single-response',returnedRows:raw.length,unknownMarkerCount,invalidImportedCount,outOfRangeCount,omittedCount,rowLimit:100},
      caution:'Partial reported imports only; dates have unknown timezone, distance/calorie units and platform unknown; empty does not mean no activity. No machine session identity or biological readiness inferred.'};
  }
  async function recordBundle(start,end,includeImportedActivities=false){
    const raw=await data(`/mobile/v2/report/userTrainingDataRecord?startDate=${formatDate(start)}&endDate=${formatDate(end)}`);
    if(!Array.isArray(raw)||raw.length>100000)throw new Error('Invalid bounded history list.');
    const importedActivities=includeImportedActivities?activityReport(raw,start,end):null;
    const excludedImportedCount=raw.filter(row=>record(row)&&(row.belongUserHealth===1||row.belongUserHealth===true)).length;
    try{return {summaries:normalizeNativeWorkoutSummaries(raw),importedActivities,excludedImportedCount,rejectedRecordCount:0,rejectedRecordReasons:{},missingIdentityShapes:{}};}
    catch(error){
      const summaries=[];let rejectedRecordCount=0;const rejectedRecordReasons={},missingIdentityShapes={};
      for(const row of raw){
        try{summaries.push(...normalizeNativeWorkoutSummaries([row]));}
        catch(reason){
          rejectedRecordCount++;
          const kind=reason?.message==='Invalid history identity.'?'missing-identity':reason?.message==='Unsafe history identity.'?'unsafe-identity':reason?.message==='Invalid history row.'?'invalid-row':reason?.message==='Invalid history timestamp.'?'invalid-timestamp':reason?.message==='Invalid history text.'?'invalid-text':reason?.message==='Invalid history number.'?'invalid-number':reason?.message==='Invalid reported capacity.'?'invalid-capacity':'other';
          rejectedRecordReasons[kind]=(rejectedRecordReasons[kind]||0)+1;
          if(kind==='missing-identity'&&record(row)){
            const marker=Object.hasOwn(row,'belongUserHealth')?(row.belongUserHealth===null?'null':typeof row.belongUserHealth==='boolean'?`boolean-${row.belongUserHealth}`:String(row.belongUserHealth)):'absent';
            const type=Object.hasOwn(row,'type')?String(row.type):'absent';
            const shape=`marker:${/^[0-9]{1,2}$/.test(marker)?marker:['absent','null','boolean-true','boolean-false'].includes(marker)?marker:'other'}|type:${/^\d{1,2}$/.test(type)?type:type==='absent'?'absent':'other'}|keys:${['trainingId','id','startTimestamp','startTime','title','courseId','courseTrainingId','trainingRecordId'].filter(key=>Object.hasOwn(row,key)).join(',')}`;
            if(Object.hasOwn(missingIdentityShapes,shape)||Object.keys(missingIdentityShapes).length<20)missingIdentityShapes[shape]=(missingIdentityShapes[shape]||0)+1;
          }
        }
      }
      return summaries.length?{summaries,importedActivities,excludedImportedCount,rejectedRecordCount,rejectedRecordReasons,missingIdentityShapes}:{summaries:null,error,importedActivities,excludedImportedCount,rejectedRecordCount,rejectedRecordReasons,missingIdentityShapes};
    }
  }
  async function records(start, end) {
    const bundle=await recordBundle(start,end);if(bundle.error)throw bundle.error;return bundle.summaries;
  }
  async function summariesForDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Invalid exact session date.');
    const [year,month,day] = value.split('-').map(Number);
    const date = new Date(0); date.setFullYear(year,month-1,day); date.setHours(0,0,0,0);
    if (!Number.isFinite(date.getTime()) || formatDate(date) !== value) throw new TypeError('Invalid exact session calendar date.');
    return (await records(date,addDays(date,1))).filter(row => row.date === value);
  }
  async function workouts(days) {
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new TypeError('History days must be an integer between 1 and 3650.');
    const end = addDays(clockDay(), 1);
    return records(addDays(end, -days), end);
  }
  async function workoutsReport(days, {includeImportedActivities=false} = {}) {
    if(typeof includeImportedActivities!=='boolean'||(includeImportedActivities&&days>31))throw new Error('Imported activity snapshot is bounded to31 days.');
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new TypeError('History days must be an integer between 1 and 3650.');
    const end = addDays(clockDay(), 1), start = addDays(end, -days);
    const startDate = formatDate(start), endDateExclusive = formatDate(end);
    const months = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = addDays(end, -1);
    while (cursor <= last) { months.push(formatDate(cursor).slice(0,7)); cursor.setMonth(cursor.getMonth()+1); }
    const readMonths = months.slice(-12), unreadMonths = months.slice(0,-12), failedMonths = [];
    let importedActivities=null,excludedImportedCount=0,rejectedRecordCount=0,rejectedRecordReasons={},missingIdentityShapes={};
    let mobileSessions = [], unscopedMobileSessions = [], mobileAvailable = false, mobileExcludedOutOfRange = 0, mobileUndatedCount = 0, mobileFailureKind = null;
    try {
      const bundle=await recordBundle(start,end,includeImportedActivities);importedActivities=bundle.importedActivities;excludedImportedCount=bundle.excludedImportedCount;rejectedRecordCount=bundle.rejectedRecordCount;rejectedRecordReasons=bundle.rejectedRecordReasons;missingIdentityShapes=bundle.missingIdentityShapes;if(bundle.error)throw bundle.error;const reported=bundle.summaries;
      unscopedMobileSessions = reported.filter(row => row.date === null).map(summary => ({ summary, scopeStatus: 'date-unresolved-outside-scoped-count' }));
      mobileUndatedCount = unscopedMobileSessions.length;
      mobileExcludedOutOfRange = reported.filter(row => row.date !== null && (row.date < startDate || row.date >= endDateExclusive)).length;
      mobileSessions = reported.filter(row => row.date !== null && row.date >= startDate && row.date < endDateExclusive);
      mobileAvailable = true;
    } catch (error) {
      // Expose the failure stage, never the API response, account data or error text.
      mobileFailureKind = error instanceof TypeError ? 'invalid-mobile-records' : 'mobile-read-failed';
    }
    const calendarCompletedSessions = [], unsupportedCalendarSessions = [];
    for (const month of readMonths) {
      try {
        const entries = await calendarIdentities(month);
        for (const entry of entries) {
          if (entry.date < startDate || entry.date >= endDateExclusive) continue;
          const item = { ...entry, detailAvailable: false, detailStatus: ['course','ai'].includes(entry.kind) ? 'not-read-summary-only' : 'calendar-namespace-unsupported' };
          (['course','ai'].includes(entry.kind) ? calendarCompletedSessions : unsupportedCalendarSessions).push(item);
        }
      } catch { failedMonths.push(month); }
    }
    const calendarComplete = failedMonths.length === 0 && unreadMonths.length === 0;
    return { ...(includeImportedActivities?{importedActivities:importedActivities??{available:false,status:'error',start_date:startDate,end_date:formatDate(last),rows:[],provenance:'speediance-reported-health-import',biologicalReadinessCalculated:false,caution:'Activity source unavailable; no inference of no activity.'}}:{}), dataKind: 'recorded-session-history', calendarReservationsChecked: false,
      requestedRange: { startDate, endDateExclusive, days },
      dateInterpretation: { basis: 'runtime-local-calendar-date', accountTimezoneVerified: false,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, utcOffsetMinutes: -start.getTimezoneOffset(),
        note: 'Window and mobile dates use runtime local calendar arithmetic, including DST. Calendar dates remain API-reported; account timezone equivalence is unverified. Offset refers to range start, not every date.' },
      mobileSessions, unscopedMobileSessions, calendarCompletedSessions, unsupportedCalendarSessions,
      mobileHistoryCoverage: { status: mobileAvailable ? (mobileUndatedCount||rejectedRecordCount ? 'partial' : 'read') : 'unavailable', complete: mobileAvailable && mobileUndatedCount === 0 && rejectedRecordCount === 0, rejectedRecordCount, rejectedRecordReasons, missingIdentityShapes, ...(mobileFailureKind?{failureKind:mobileFailureKind}:{}),
        sourceEndpoint: '/mobile/v2/report/userTrainingDataRecord', scope: excludedImportedCount?'returned-filtered-summary-subset':'returned-mobile-summary-feed-only', ...(includeImportedActivities?{excludedImportedCount}:{}), upstreamCompleteness:excludedImportedCount?'unknown':'not-assessed', detailsRead: false,
        selectedRange: { startDate, endDateExclusive }, excludedOutOfRangeCount: mobileExcludedOutOfRange, undatedExcludedCount: mobileUndatedCount,
        observedDates: [...new Set(mobileSessions.map(row => row.date))].sort() },
      calendarCompletedHistoryCoverage: { status: calendarComplete ? 'read' : (readMonths.length === failedMonths.length ? 'unavailable' : 'partial'), complete: calendarComplete,
        sourceEndpoint: '/app/v5/trainingCalendar/monthNew', scope: 'completed-calendar-course-and-ai-identities-only',
        requestedMonths: months, attemptedMonths: readMonths, validatedMonths: readMonths.filter(month => !failedMonths.includes(month)), failedMonths, unreadMonths, monthReadLimit: 12, detailsRead: false },
      mobileIdentityLinkageVerified: false, uniqueSessionCount: null,
      note: 'Separate source collections may overlap. Do not join or count unique sessions by shared ID, title or date. Empty recorded history does not prove no reservation. Calendar coverage is limited to course/AI identities; detail units and per-rep volume have not been verified.' };
  }
  async function session(id, type) {
    const trainingId = sessionId(id);
    if (!['program', 'free'].includes(type)) throw new TypeError('Session namespace must be program or free.');
    const infoName = type === 'program' ? 'cttTrainingInfo' : 'freeTraining';
    const detailName = type === 'program' ? 'cttTrainingInfoDetail' : 'freeTrainingDetail';
    const info = await data(`/app/trainingInfo/${infoName}/${trainingId}`);
    const detail = await data(`/app/trainingInfo/${detailName}/${trainingId}`);
    return { training_id: trainingId, kind: type, info, detail };
  }
  async function calendarIdentities(month) {
    return inspectCompletedCalendarIdentities(await data(`/app/v5/trainingCalendar/monthNew?date=${encodeURIComponent(month)}&selectedDeviceType=${deviceType}`), { month, deviceType });
  }
  async function calendarSession(trainingId, type, date) {
    sessionId(trainingId);
    if (type !== undefined && !['course','ai'].includes(type)) throw new TypeError('Invalid calendar namespace.');
    if (date !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00Z`).toISOString().slice(0,10) !== date)) throw new TypeError('Invalid completed calendar date.');
    const months = date ? [date.slice(0,7)] : [...new Set([formatDate(clockDay()).slice(0,7), formatDate(addDays(clockDay(),-30)).slice(0,7)])];
    const entries = [];
    for (const month of months) entries.push(...await calendarIdentities(month));
    const identity = resolveCompletedCalendarIdentity(entries, { trainingId, type, date });
    const endpoint = identity.kind === 'course' ? 'courseTrainingInfoDetail' : 'aiCourseTrainingInfoDetail';
    const detail = await data(`/app/trainingInfo/${endpoint}/${trainingId}`);
    return { ...identity, info: null, detail, detailSourceEndpoint: `/app/trainingInfo/${endpoint}` };
  }
  async function resolveAutomaticSession(trainingId, mobileSummaries, date) {
    sessionId(trainingId);
    if (!Array.isArray(mobileSummaries)) throw new TypeError('Invalid mobile summary list.');
    if (date !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00Z`).toISOString().slice(0,10) !== date)) throw new TypeError('Invalid completed session date.');
    const months = date ? [date.slice(0,7)] : [...new Set([formatDate(clockDay()).slice(0,7), formatDate(addDays(clockDay(),-30)).slice(0,7)])];
    const entries = [];
    for (const month of months) entries.push(...await calendarIdentities(month));
    const calendarMatches = entries.filter(item => item.training_id === trainingId && (date === undefined || item.date === date));
    const mobileMatches = mobileSummaries.filter(item => String(item.training_id) === trainingId && (date === undefined || item.date === date));
    if (calendarMatches.length > 1 || mobileMatches.length > 1) throw new Error('Automatic session identity ambiguous.');
    const mobile = mobileMatches[0];
    if (mobile && ['program','free'].includes(mobile.kind)) {
      if (calendarMatches.length) throw new Error('Automatic session identity collides across calendar and mobile namespaces.');
      return { type: mobile.kind, identitySource: 'mobile-report-exact-id-and-date' };
    }
    const calendar = resolveCompletedCalendarIdentity(entries, { trainingId, date });
    // An unsupported mobile hint is not a verified join or an alternate namespace.
    return { type: calendar.kind, identitySource: 'completed-calendar', calendarIdentity: calendar };
  }
  async function today(value = 'today') {
    let calendarCompletedHistoryCoverage = { status: 'not-read', complete: false };
    if (typeof value !== 'string') throw new TypeError('Invalid history date.');
    let date;
    if (value === 'today' || value === 'yesterday') date = addDays(clockDay(), value === 'yesterday' ? -1 : 0);
    else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Invalid history date.');
      const [year, month, day] = value.split('-').map(Number);
      date = new Date(0);
      date.setFullYear(year, month - 1, day);
      date.setHours(0, 0, 0, 0);
      if (!Number.isFinite(date.getTime()) || formatDate(date) !== value) throw new TypeError('Invalid history calendar date.');
    }
    const target = formatDate(date), endDateExclusive = formatDate(addDays(date, 1));
    const dateInterpretation = { basis: 'runtime-local-calendar-date', accountTimezoneVerified: false,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, utcOffsetMinutes: -date.getTimezoneOffset(),
      note: 'Mobile timestamps and requested windows use this runtime local timezone. Calendar date strings remain API-reported dates; account timezone equivalence has not been verified.' };
    let selected = [], unscopedMobileSessions = [], mobileAvailable = false, excludedOutOfRangeCount = 0, filteredSource = false, rejectedRecordCount=0;
    try {
      const bundle=await recordBundle(date,addDays(date,1));filteredSource=bundle.excludedImportedCount>0;rejectedRecordCount=bundle.rejectedRecordCount;if(bundle.error)throw bundle.error;const reported=bundle.summaries;
      selected = reported.filter(row => row.date === target);
      unscopedMobileSessions = reported.filter(row => row.date === null).map(summary => ({ summary, scopeStatus: 'date-unresolved-outside-scoped-count' }));
      excludedOutOfRangeCount = reported.filter(row => row.date !== null && row.date !== target).length;
      mobileAvailable = true;
    } catch { /* One unavailable source must not discard independently valid calendar sessions. */ }
    const result = [];
    for (const row of selected) {
      if (!['program','free','manual','course','ai'].includes(row.kind)) {
        result.push({ training_id: String(row.training_id), kind: row.kind, summary: row,
          detailAvailable: false, detailStatus: 'mobile-report-namespace-unsupported' });
      } else if (['manual','course','ai'].includes(row.kind)) {
        result.push({ training_id: String(row.training_id), kind: row.kind, summary: row, detailAvailable: false,
          detailStatus: row.kind === 'manual' ? 'not-stored-by-speediance' : 'namespace-not-supported-by-reader' });
      } else {
        try { result.push({ ...await session(String(row.training_id), row.kind), summary: row,
          identityProvenance: row.identityProvenance }); }
        catch { result.push({ training_id: String(row.training_id), kind: row.kind, summary: row,
          identityProvenance: row.identityProvenance, detailAvailable: false, detailStatus: 'mobile-session-detail-unavailable' }); }
      }
    }
    let completed = [], calendarAvailable = false;
    try { completed = (await calendarIdentities(target.slice(0,7))).filter(entry => entry.date === target); calendarAvailable = true; }
    catch { /* Preserve mobile summaries and successful details independently. */ }
    calendarCompletedHistoryCoverage = calendarAvailable
      ? { status: 'read', complete: true, sourceEndpoint: '/app/v5/trainingCalendar/monthNew',
          scope: 'completed-calendar-course-and-ai-identities-only', mobileIdentityLinkageVerified: false }
      : { status: 'unavailable', complete: false, reason: 'calendar-identity-read-unavailable-or-invalid',
          sourceEndpoint: '/app/v5/trainingCalendar/monthNew', scope: 'completed-calendar-course-and-ai-identities-only' };
    const unsupportedCalendarSessions = [];
    for (const entry of completed) {
      if (!['course','ai'].includes(entry.kind)) {
        const item = { ...entry, detailAvailable: false, detailStatus: 'calendar-namespace-unsupported' };
        unsupportedCalendarSessions.push(item); result.push(item); continue;
      }
      try {
        resolveCompletedCalendarIdentity(completed, { trainingId: entry.training_id, date: target });
        const endpoint = entry.kind === 'course' ? 'courseTrainingInfoDetail' : 'aiCourseTrainingInfoDetail';
        result.push({ ...entry, info: null, detail: await data(`/app/trainingInfo/${endpoint}/${entry.training_id}`),
          detailSourceEndpoint: `/app/trainingInfo/${endpoint}` });
      } catch {
        calendarCompletedHistoryCoverage = { ...calendarCompletedHistoryCoverage, complete: false, status: 'partial' };
        result.push({ ...entry, detailAvailable: false, detailStatus: 'calendar-identity-or-detail-unavailable',
          calendarCompletedHistoryCoverage: { complete: false, status: 'partial' } });
      }
    }
    if (!calendarAvailable) for (const item of result) item.calendarCompletedHistoryCoverage = calendarCompletedHistoryCoverage;
    const unresolvedMobile = result.filter(item => item.summary?.identityProvenance?.sourceEndpoint === '/mobile/v2/report/userTrainingDataRecord' && item.detailAvailable === false);
    todayCoverage.set(result, { calendarCompletedHistoryCoverage,
      mobileHistoryCoverage: { status: mobileAvailable ? (unscopedMobileSessions.length||rejectedRecordCount ? 'partial' : 'read') : 'unavailable',
        complete: mobileAvailable && unscopedMobileSessions.length === 0 && rejectedRecordCount===0, rejectedRecordCount, sourceEndpoint: '/mobile/v2/report/userTrainingDataRecord',
        scope: filteredSource?'returned-filtered-summary-subset':'returned-mobile-summary-feed-only', selectedRange: { startDate: target, endDateExclusive },
        excludedOutOfRangeCount, undatedExcludedCount: unscopedMobileSessions.length },
      mobileHistoryDetailCoverage: { complete: mobileAvailable && unresolvedMobile.length === 0 && unscopedMobileSessions.length === 0 && rejectedRecordCount===0,
        status: !mobileAvailable ? 'unavailable' : (unresolvedMobile.length || unscopedMobileSessions.length || rejectedRecordCount ? 'partial' : 'available-for-returned-mobile-sessions'),
        unresolvedSessionCount: unresolvedMobile.length, unscopedSessionCount: unscopedMobileSessions.length, calendarLinkageVerified: false },
      unscopedMobileSessions, unsupportedCalendarSessions, dateInterpretation,
      mobileIdentityLinkageVerified: false, uniqueSessionCount: null });
    return result;
  }
  async function todayReport(value = 'today') {
    const sessions = await today(value);
    return { sessions, ...todayCoverage.get(sessions) };
  }
  return { summariesForDate, workouts, workoutsReport, session, today, todayReport, calendarSession, calendarIdentities, resolveAutomaticSession };
}
