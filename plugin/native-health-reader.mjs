const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Health date must be YYYY-MM-DD.');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new TypeError('Invalid health calendar date.');
  return value;
}
function number(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid reported ${field}.`);
  return value;
}
function lenientNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) return Number(value);
  return undefined;
}
const warsaw = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function localParts(d) {
  const p = Object.fromEntries(warsaw.formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
function epochSecondsLocal(value) {
  const n = lenientNumber(value);
  if (n === undefined || n <= 0) return null;
  const d = new Date((n >= 1e11 ? n : n * 1000));
  if (!Number.isFinite(d.getTime()) || d.getUTCFullYear() < 2015 || d.getUTCFullYear() > 2100) return null;
  const l = localParts(d);
  return `${l.date} ${l.time}`;
}
function timestampDate(stamp) {
  const n = typeof stamp === 'string' && /^\d+(\.\d+)?$/.test(stamp.trim()) ? Number(stamp) : stamp;
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
    const unit = n >= 1e11 ? 'milliseconds' : 'seconds';
    const d = new Date(unit === 'milliseconds' ? n : n * 1000);
    if (Number.isFinite(d.getTime()) && d.getUTCFullYear() >= 2015 && d.getUTCFullYear() <= 2100) return { measuredDate: localParts(d).date, timestampUnit: unit };
  }
  return null;
}
function fields(value, keys) {
  if (!object(value)) throw new Error('Invalid reported health object.');
  const result = {};
  for (const key of keys) if (Object.hasOwn(value, key) && value[key] !== null) result[key] = number(value[key], key);
  return result;
}
const caution = 'Reported Speediance indicators are contextual data, not independently verified biological readiness or a prescription.';
function schemaStatus(raw, knownKeys, available) {
  const unsupported = Object.keys(raw).some(key => !knownKeys.includes(key));
  return unsupported ? (available ? 'partial-schema' : 'unsupported-schema') : (available ? 'reported' : 'empty');
}

/** Profile-bound GET reader. apiRead validates transport; this module validates envelopes.
 * No login, retries, date probing, heuristic recovery windows or fabricated zero values.
 */
export function createNativeHealthReader({ apiRead, runReadBatch = null } = {}) {
  if (typeof apiRead !== 'function') throw new TypeError('Health reader requires profile-bound apiRead.');
  async function read(path) {
    const response = await apiRead(path);
    if (!object(response) || response.code !== 0 || !Object.hasOwn(response, 'data')) throw new Error('Speediance did not confirm reported health data.');
    return response.data;
  }
  async function fatigue() {
    const data = await read('/app/userDataStat/trainingPartFatigueInfo');
    if (!Array.isArray(data) || data.length > 1000) throw new Error('Invalid reported fatigue rows.');
    const rows = data.map(row => {
      const result = fields(row, ['trainingPartId2', 'fatigue', 'muscleLoadStatus']);
      if (!Number.isSafeInteger(result.trainingPartId2) || result.trainingPartId2 < 1) throw new Error('Invalid reported training-part identity.');
      return { ...result, partName: null, partNameStatus: 'nazwa partii nieznana' };
    });
    const available = rows.some(row => Object.hasOwn(row, 'fatigue') || Object.hasOwn(row, 'muscleLoadStatus'));
    const incomplete = rows.some(row => !Object.hasOwn(row, 'fatigue') && !Object.hasOwn(row, 'muscleLoadStatus'));
    const unsupported = data.some(row => schemaStatus(row, ['trainingPartId2', 'fatigue', 'muscleLoadStatus'], false) === 'unsupported-schema');
    return { available, status: available ? (unsupported || incomplete ? 'partial-schema' : 'reported') : (unsupported ? 'unsupported-schema' : 'empty'), rows, partNamesResolved: false, partNameNote: 'trainingPartId2 grupuje kilka kategorii mięśniowych (np. ID 15 obejmuje czworogłowe, dwugłowe, łydki, przywodziciele), więc nazwa partii jest nieznana; nie zgadywano.', provenance: 'speediance-reported', caution, lastLoadedAtAvailable: false };
  }
  async function trainingLoad(startDate, endDate) {
    const start = date(startDate), end = date(endDate);
    if (start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 90) throw new TypeError('Invalid or excessive health date range.');
    const data = await read(`/mobile/userHealth/trainingLoad/dateRange?startDate=${start}&endDate=${end}`);
    if (!Array.isArray(data) || data.length > 366) throw new Error('Invalid reported training-load rows.');
    const rows = data.map(row => {
      const result = fields(row, ['trainingLoadValue', 'recommendMin', 'recommendMax', 'trainingCount']);
      const day = date(row.dateStr);
      if (day < start || day > end || typeof row.trainingLoadUnit !== 'string' || !row.trainingLoadUnit.trim() || row.trainingLoadUnit.length > 40) throw new Error('Invalid reported training-load date or unit.');
      return { dateStr: day, ...result, trainingLoadUnit: row.trainingLoadUnit };
    });
    const available = rows.some(row => Object.hasOwn(row, 'trainingLoadValue'));
    const incomplete = rows.some(row => !Object.hasOwn(row, 'trainingLoadValue'));
    const unsupported = data.some(row => schemaStatus(row, ['dateStr', 'trainingLoadUnit', 'trainingLoadValue', 'recommendMin', 'recommendMax', 'trainingCount'], false) === 'unsupported-schema');
    return { available, status: available ? (unsupported || incomplete ? 'partial-schema' : 'reported') : (unsupported ? 'unsupported-schema' : 'empty'), rows, provenance: 'speediance-reported', caution, strengthVolumeEquivalent: false };
  }
  async function strengthScore() {
    const data = await read('/app/strengthScore/summary');
    const result = fields(data, ['totalScore']);
    if (Object.hasOwn(data, 'scoreUpdateTime') && data.scoreUpdateTime !== null) {
      const value = data.scoreUpdateTime;
      if (!(typeof value === 'string' && value.length <= 100) && !(typeof value === 'number' && Number.isFinite(value))) throw new Error('Invalid reported score update time.');
      result.scoreUpdateTime = value;
    }
    if (Object.hasOwn(data, 'upperLowerImbalance') && data.upperLowerImbalance !== null) {
      if (typeof data.upperLowerImbalance !== 'boolean') throw new Error('Invalid reported strength imbalance flag.');
      result.upperLowerImbalance = data.upperLowerImbalance;
    }
    // Regions are named by the API itself; a region without a numeric score is never turned into a zero.
    const regionNames = ['chest', 'legs', 'back', 'shoulder'], regions = {};
    let regionUnsupported = false;
    for (const name of regionNames) {
      if (data[name] === undefined || data[name] === null) continue;
      if (!object(data[name])) throw new Error('Invalid reported strength region.');
      const region = fields(data[name], ['score', 'oneRepMax']);
      const a = data[name].actionName;
      if (a !== undefined && a !== null) { if (typeof a !== 'string' || !a.trim() || a.length > 150) throw new Error('Invalid reported strength action name.'); region.actionName = a; }
      regionUnsupported ||= Object.keys(data[name]).some(key => !['score', 'oneRepMax', 'actionName'].includes(key));
      if (Object.hasOwn(region, 'score')) { if (Object.hasOwn(region, 'oneRepMax')) region.oneRepMaxUnit = 'unknown'; regions[name] = region; }
      else regionUnsupported = true;
    }
    const available = Object.hasOwn(result, 'totalScore');
    const known = ['totalScore', 'scoreUpdateTime', 'upperLowerImbalance', ...regionNames];
    const status = regionUnsupported ? (available ? 'partial-schema' : 'unsupported-schema') : schemaStatus(data, known, available);
    return { available, status, ...result, regions, provenance: 'speediance-reported', caution, regionalScoresAvailable: Object.keys(regions).length > 0 };
  }
  async function real(kind) {
    const value = await read(`/mobile/userHealth/mockReport/hasReal${kind}Data`);
    if (typeof value !== 'boolean') throw new Error('Speediance did not confirm real-data status.');
    return value;
  }
  async function bodyMeasurements() {
    const raw = await read('/app/userBody/current');
    if (!object(raw)) throw new Error('Invalid reported health object.');
    const measurements = {}, unparsedFields = [];
    const bodyKeys = ['weight', 'height', 'bmi', 'bodyFatPercentage', 'chest', 'waist', 'hip', 'upperArm', 'forearm', 'thigh', 'calf'];
    for (const key of bodyKeys) {
      if (!Object.hasOwn(raw, key) || raw[key] === null || raw[key] === '') continue;
      const v = lenientNumber(raw[key]);
      if (v === undefined) unparsedFields.push(key); else measurements[key] = v;
    }
    const available = Object.keys(measurements).length > 0;
    let status = schemaStatus(raw, ['appUserId', ...bodyKeys], available);
    if (unparsedFields.length) status = available ? 'partial-schema' : 'unsupported-schema';
    return { available, status, ...(unparsedFields.length ? { unparsedFields } : {}),
      measurements, weightUnit: 'unknown', heightUnit: 'unknown', circumferenceUnit: 'unknown', unitSource: 'account-display-unit-not-returned',
      provenance: 'speediance-reported', caution };
  }
  async function healthCards() {
    const raw = await read('/mobile/userHealth/newIndex/healthScore');
    if (!object(raw)) throw new Error('Invalid reported health-card object.');
    const cards = {};
    let unsupported = Object.keys(raw).some(key => !['walking', 'nutrition', 'bodyAge', 'wellnessMonitor'].includes(key));
    for (const [name, interpretedUnit] of [['walking', 'steps'], ['nutrition', 'kcal']]) {
      if (raw[name] === undefined || raw[name] === null) continue;
      const result = fields(raw[name], ['value']);
      if (Object.hasOwn(raw[name], 'createTimestamp') && raw[name].createTimestamp !== null) {
        const stamp = raw[name].createTimestamp;
        if (!(typeof stamp === 'number' && Number.isFinite(stamp)) && !(typeof stamp === 'string' && stamp.trim() && stamp.length <= 100)) throw new Error('Invalid reported health-card timestamp.');
        result.createTimestamp = stamp;
        const derived = timestampDate(stamp);
        if (derived) { result.measuredDate = derived.measuredDate; result.timestampUnit = derived.timestampUnit; }
      }
      const available = Object.hasOwn(result, 'value');
      const status = schemaStatus(raw[name], ['value', 'createTimestamp'], available);
      unsupported ||= status === 'unsupported-schema' || status === 'partial-schema';
      cards[name] = { available, status, ...result, reportedUnit: 'unknown', interpretedUnit,
        unitInterpretationSource: 'reference-client-renderer', measurementUnitVerified: false,
        timestampUnit: 'unknown', timestampTimeZone: 'unknown', ...(result.timestampUnit ? { timestampUnit: result.timestampUnit, timestampTimeZone: 'Europe/Warsaw-date-derived' } : {}) };
    }
    if (raw.bodyAge !== undefined && raw.bodyAge !== null && !object(raw.bodyAge)) throw new Error('Invalid reported health-card object.');
    if (object(raw.bodyAge)) {
      const src = raw.bodyAge, card = { available: false, status: Object.keys(raw.bodyAge).length ? 'unsupported-schema' : 'empty', interpreted: false };
      try {
        const value = lenientNumber(src.value);
        let ext = null;
        if (typeof src.extData === 'string' && src.extData.length <= 500) { try { ext = JSON.parse(src.extData); } catch { ext = null; } }
        if (value !== undefined && value > 0 && value < 150) {
          const extOk = object(ext) && Object.keys(ext).every(k => ['date', 'age'].includes(k));
          const extAge = extOk ? lenientNumber(ext.age) : undefined;
          const extDate = extOk && typeof ext.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ext.date) ? ext.date : undefined;
          const derived = timestampDate(src.createTimestamp);
          const clean = Object.keys(src).every(k => ['value', 'createTimestamp', 'extData'].includes(k)) && extOk && extAge !== undefined;
          Object.assign(card, { available: true, status: clean ? 'reported' : 'partial-schema', interpreted: true, value, interpretedUnit: 'years', reportedUnit: 'unknown',
            ...(extAge !== undefined ? { extDataAge: extAge } : {}), ...(extDate ? { extDataDate: extDate } : {}),
            ...(derived ? { createTimestamp: lenientNumber(src.createTimestamp), measuredDate: derived.measuredDate, timestampUnit: derived.timestampUnit, timestampTimeZone: 'Europe/Warsaw-date-derived' } : {}) });
        }
      } catch { /* leave unsupported */ }
      unsupported ||= card.status !== 'reported' && card.status !== 'empty';
      cards.bodyAge = card;
    }
    for (const name of ['wellnessMonitor']) {
      if (raw[name] === undefined || raw[name] === null) continue;
      if (!object(raw[name])) throw new Error('Invalid reported health-card object.');
      const present = Object.keys(raw[name]).length > 0;
      unsupported ||= present;
      cards[name] = { available: false, status: present ? 'unsupported-schema' : 'empty', interpreted: false };
    }
    const available = Object.values(cards).some(card => card.available);
    return { available, status: available ? (unsupported ? 'partial-schema' : 'reported') : (unsupported ? 'unsupported-schema' : 'empty'),
      cards, measurementFreshnessVerified: false, provenance: 'speediance-reported', caution };
  }
  async function heartRateZones() {
    const raw = await read('/app/userDataStat/heartRateStatIndex');
    if (!object(raw)) throw new Error('Invalid reported heart-rate-zone object.');
    const metrics = fields(raw, ['maxHeartRate', 'minHeartRate']);
    if (Object.values(metrics).some(value => value < 0)) throw new Error('Invalid reported heart rate.');
    if (metrics.minHeartRate !== undefined && metrics.maxHeartRate !== undefined && metrics.minHeartRate > metrics.maxHeartRate) throw new Error('Invalid reported heart-rate bounds.');
    let unsupported = Object.keys(raw).some(key => !['timeLevelList', 'maxHeartRate', 'minHeartRate', 'watchType', 'dateStr', 'startDate', 'endDate', 'date', 'timeLevel1', 'timeLevel2', 'timeLevel3', 'timeLevel4', 'timeLevel5'].includes(key));
    const supplied = raw.timeLevelList;
    if (supplied !== undefined && supplied !== null && (!Array.isArray(supplied) || supplied.length > 100)) throw new Error('Invalid reported heart-rate-zone rows.');
    const rows = (supplied ?? []).map(row => {
      const result = fields(row, ['timeLevel', 'levelRateMin', 'levelRateMax']);
      if (Object.values(result).some(value => value < 0)) throw new Error('Invalid negative heart-rate-zone value.');
      if (result.levelRateMin !== undefined && result.levelRateMax !== undefined && result.levelRateMin > result.levelRateMax) throw new Error('Invalid heart-rate-zone bounds.');
      if (row.levelRateDisplay !== undefined && row.levelRateDisplay !== null) {
        if (typeof row.levelRateDisplay !== 'string' || row.levelRateDisplay.length > 100) throw new Error('Invalid heart-rate-zone display label.');
        result.levelRateDisplay = row.levelRateDisplay;
      }
      unsupported ||= Object.keys(row).some(key => !['timeLevel', 'levelRateMin', 'levelRateMax', 'levelRateDisplay'].includes(key));
      return result;
    });
    const periodInfo = ['dateStr', 'date', 'startDate', 'endDate'].some(k => typeof raw[k] === 'string')
      ? { date: raw.dateStr ?? raw.date ?? null, start_date: raw.startDate ?? null, end_date: raw.endDate ?? null } : 'unknown';
    // Zero is a measurement. Labels/bounds alone do not establish measured duration.
    const available = Object.keys(metrics).length > 0 || rows.some(row => Object.hasOwn(row, 'timeLevel'));
    const incomplete = !Array.isArray(supplied) || rows.some(row => !Object.hasOwn(row, 'timeLevel'));
    const durationsComplete = Array.isArray(supplied) && rows.length > 0 && !incomplete;
    const totalSeconds = durationsComplete ? rows.reduce((sum, row) => sum + row.timeLevel, 0) : null;
    if (totalSeconds !== null && !Number.isFinite(totalSeconds)) throw new Error('Invalid heart-rate-zone total.');
    return { available, status: available ? (unsupported || incomplete ? 'partial-schema' : 'reported') : (unsupported ? 'unsupported-schema' : 'empty'),
      rows, ...metrics, totalSeconds, zoneListReported: Array.isArray(supplied), durationsComplete,
      durationUnit: 'seconds', durationInterpretationSource: 'reference-client-renderer',
      period: periodInfo, measurementFreshnessVerified: false, physiologicalZoneClassificationVerified: false,
      watchPairingInterpreted: false, provenance: 'speediance-reported', caution };
  }
  async function physicalCondition(dateStr) {
    const day = date(dateStr);
    const raw = await read(`/mobile/userHealth/physicalCondition/detailByDate?dateStr=${day}`);
    if (!object(raw)) throw new Error('Invalid reported physical-condition object.');
    const blocks = {};
    let unsupported = Object.keys(raw).some(key => !['physicalConditionResp', 'physicalConditionParam'].includes(key));
    const metadataKeys = ['id', 'userId', 'dateStr', 'createTimestamp', 'dataOrigin']; // identifiers/provenance only, never output
    for (const [name, numericKeys, scalarKeys] of [
      ['physicalConditionResp', ['physicalConditionScore', 'fitness', 'fatigue'], ['physicalConditionValue', 'trainingStatus']],
      ['physicalConditionParam', ['trainingStatusScore', 'trainingStatusScoreAvg', 'sleepScore', 'sleepScoreAvg'], []]
    ]) {
      if (raw[name] === undefined || raw[name] === null) continue;
      const block = fields(raw[name], numericKeys);
      for (const key of scalarKeys) if (Object.hasOwn(raw[name], key) && raw[name][key] !== null) {
        const value = raw[name][key];
        if (!(typeof value === 'number' && Number.isFinite(value)) && !(typeof value === 'string' && value.trim() && value.length <= 100)) throw new Error('Invalid reported physical-condition scalar.');
        block[key] = value;
      }
      if (Object.hasOwn(block, 'physicalConditionScore') && (block.physicalConditionScore < 0 || block.physicalConditionScore > 100)) throw new Error('Invalid reported physical-condition score.');
      unsupported ||= Object.keys(raw[name]).some(key => !numericKeys.includes(key) && !scalarKeys.includes(key) && !(name === 'physicalConditionResp' && metadataKeys.includes(key)));
      blocks[name] = block;
    }
    const available = Object.values(blocks).some(block => Object.keys(block).length > 0);
    return { available, status: available ? (unsupported ? 'partial-schema' : 'reported') : (unsupported ? 'unsupported-schema' : 'empty'),
      date: day, blocks, measurementTimestampAvailable: false, biologicalReadinessCalculated: false,
      provenance: 'speediance-reported', caution };
  }
  async function recovery(dateStr) {
    const day = date(dateStr);
    if (!await real('Recovery')) return { available: false, status: 'real-data-not-confirmed', realData: false, date: day, reason: 'Real recovery data is not confirmed; sample data was not read.' };
    const data = await read(`/mobile/userHealth/recovery/detailByDate?dateStr=${day}`);
    if (!object(data)) throw new Error('Invalid reported recovery object.');
    const blocks = {};
    // verified.md confirms only block names. reference client’s fallback aliases are not
    // independently observed field/unit contracts, so no HRV/score scalar is interpreted.
    const names = ['recoveryScoreResp', 'nightHrvResp', 'nightRestingHeartRateResp', 'sleepResp', 'muscleLoadResp'];
    // Only blocks whose field names state their meaning are interpreted (observed on a real account).
    const known = { nightRestingHeartRateResp: { keys: ['nightRestHeartRate', 'nightRestHeartRateAvg'], unit: 'bpm' }, sleepResp: { keys: ['sleepScore', 'sleepScoreAvg'], unit: null } };
    let unsupported = Object.keys(data).some(key => !names.includes(key)), anyAvailable = false, anyUnsupported = unsupported;
    for (const key of names) if (data[key] !== undefined && data[key] !== null) {
      if (!object(data[key])) throw new Error('Invalid reported recovery block.');
      const present = Object.keys(data[key]).length > 0;
      const spec = known[key];
      if (spec && present) {
        const values = {};
        for (const k of spec.keys) { const v = lenientNumber(data[key][k]); if (v !== undefined && v >= 0) values[k] = v; }
        const extra = Object.keys(data[key]).some(k => !spec.keys.includes(k) || values[k] === undefined);
        if (Object.keys(values).length) {
          blocks[key] = { status: extra ? 'partial-schema' : 'reported', interpreted: true, ...values, ...(spec.unit ? { interpretedUnit: spec.unit } : {}) };
          anyAvailable = true; anyUnsupported ||= extra; continue;
        }
      }
      blocks[key] = { status: present ? 'unsupported-schema' : 'empty', interpreted: false };
      anyUnsupported ||= present;
    }
    return { available: anyAvailable, status: anyAvailable ? (anyUnsupported ? 'partial-schema' : 'reported') : (anyUnsupported ? 'unsupported-schema' : 'empty'), realData: true, date: day, blocks, provenance: 'speediance-reported', caution, muscleLoadInterpreted: false };
  }
  async function sleep(dateStr) {
    const day = date(dateStr);
    if (!await real('Sleep')) return { available: false, status: 'real-data-not-confirmed', realData: false, date: day, reason: 'Real sleep data is not confirmed; sample data was not read.' };
    const raw = await read(`/mobile/userHealth/sleep?dateStr=${day}`);
    const data = fields(raw, ['sleep', 'targetSleepMin']);
    const scoreKeys = ['sleepScore', 'sleepDurationScore', 'sleepDurationScorePercent', 'sleepQualityScore', 'sleepQualityScorePercent', 'sleepEfficiencyScore', 'sleepEfficiencyScorePercent', 'sleepRegularityScore', 'sleepRegularityScorePercent'];
    const scores = {};
    for (const k of scoreKeys) { const v = lenientNumber(raw[k]); if (v !== undefined && v >= 0) scores[k] = v; }
    const detail = {};
    if (Object.keys(scores).length) detail.sleepScores = scores;
    const startLocal = epochSecondsLocal(raw.startTimeStamp), endLocal = epochSecondsLocal(raw.endTimeStamp);
    if (startLocal && endLocal) Object.assign(detail, { sleepStartLocal: startLocal, sleepEndLocal: endLocal, sleepTimeZone: 'Europe/Warsaw' });
    // Stage seconds: dtos sleepType 2=awake 3=REM 4=light 5=deep, matched by duration against the provider stage list; 1=total sleep.
    const stageNames = { 2: 'awake', 3: 'rem', 4: 'light', 5: 'deep' };
    let sleepUnsupported = Object.keys(raw).some(k => !['sleep', 'targetSleepMin', 'startTimeStamp', 'endTimeStamp', 'dtos', 'dataExt', 'secondaryMetric', ...scoreKeys].includes(k));
    if (Array.isArray(raw.dtos) && raw.dtos.length <= 20) {
      const stages = {};
      for (const row of raw.dtos) {
        const type = object(row) ? row.sleepType : undefined, v = object(row) ? lenientNumber(row.sleep) : undefined;
        if (v === undefined || v < 0 || !Number.isInteger(type)) { sleepUnsupported = true; continue; }
        if (stageNames[type]) stages[stageNames[type]] = v;
        else if (type !== 1 && v !== 0) sleepUnsupported = true;
      }
      if (Object.keys(stages).length) detail.stageSeconds = stages;
    } else if (raw.dtos !== undefined && raw.dtos !== null) sleepUnsupported = true;
    if (object(raw.secondaryMetric)) {
      const sm = {};
      for (const k of ['deepSleepDuration', 'longestSleepStreak']) { const v = lenientNumber(raw.secondaryMetric[k]); if (v !== undefined && v >= 0) sm[k] = v; }
      if (Object.keys(sm).length) detail.secondaryMetrics = sm; // seconds, matches stage list
      sleepUnsupported ||= Object.keys(raw.secondaryMetric).some(k => !(k in sm));
    } else if (raw.secondaryMetric !== undefined && raw.secondaryMetric !== null) sleepUnsupported = true;
    if (Object.values(data).some(value => value < 0)) throw new Error('Invalid negative sleep duration.');
    if (data.sleep === 0) return { available: false, status: 'no-sleep-recorded', realData: true, date: day, provenance: 'speediance-reported',
      sleepSeconds: null, targetSleepMinutes: data.targetSleepMin ?? null, reason: 'Speediance returned sleep=0, which means no sleep recorded, not a 0-second measurement.', caution };
    const available = Object.hasOwn(data, 'sleep');
    return { available, status: available && sleepUnsupported ? 'partial-schema' : (sleepUnsupported ? 'unsupported-schema' : (available ? 'reported' : 'empty')), realData: true, date: day, provenance: 'speediance-reported',
      sleepSeconds: data.sleep ?? null, targetSleepMinutes: data.targetSleepMin ?? null, ...(available ? detail : {}), caution };
  }
  async function snapshot({ date: dateStr, start_date: startDate, end_date: endDate } = {}) {
    // Validate the complete caller-selected period before launching any account reads.
    const day = date(dateStr), start = date(startDate), end = date(endDate);
    if (start > end || day < start || day > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 90) throw new TypeError('Invalid or excessive health date range.');
    const selected = { fatigue: () => fatigue(), trainingLoad: () => trainingLoad(start, end),
      strengthScore: () => strengthScore(), recovery: () => recovery(day), sleep: () => sleep(day),
      bodyMeasurements: () => bodyMeasurements(), physicalCondition: () => physicalCondition(day), healthCards: () => healthCards(), heartRateZones: () => heartRateZones() };
    const entries=Object.entries(selected);
    let results;
    if(runReadBatch!==null){
      if(typeof runReadBatch!=='function')throw new TypeError('Invalid health read batch capability.');
      const settled=await runReadBatch(entries.map(([,operation])=>operation));
      results=settled.map((result,index)=>[entries[index][0],result.status==='fulfilled'?result.value:{available:false,status:'error',reason:'Reported Speediance feed could not be read or validated.'}]);
    }else{
      results=[];
      for(const [feed,operation] of entries){try{results.push([feed,await operation()]);}catch{results.push([feed,{available:false,status:'error',reason:'Reported Speediance feed could not be read or validated.'}]);}}
    }
    const feeds = Object.fromEntries(results);
    const availableFeeds = results.filter(([, result]) => result.available).map(([feed]) => feed);
    const errorFeeds = results.filter(([, result]) => result.status === 'error').map(([feed]) => feed);
    const incompleteFeeds = results.filter(([, result]) => !result.available || result.status !== 'reported').map(([feed]) => feed);
    return { available: availableFeeds.length > 0,
      status: errorFeeds.length || incompleteFeeds.length ? 'partial' : 'reported',
      date: day, start_date: start, end_date: end, feeds,
      coverage: { requestedFeeds: Object.keys(selected), availableFeeds, errorFeeds, incompleteFeeds },
      provenance: 'speediance-reported', caution, biologicalReadinessCalculated: false };
  }
  return { fatigue, trainingLoad, strengthScore, recovery, sleep, bodyMeasurements, physicalCondition, healthCards, heartRateZones, snapshot };
}
