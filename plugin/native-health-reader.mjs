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
      return result;
    });
    const available = rows.some(row => Object.hasOwn(row, 'fatigue') || Object.hasOwn(row, 'muscleLoadStatus'));
    const incomplete = rows.some(row => !Object.hasOwn(row, 'fatigue') && !Object.hasOwn(row, 'muscleLoadStatus'));
    const unsupported = data.some(row => schemaStatus(row, ['trainingPartId2', 'fatigue', 'muscleLoadStatus'], false) === 'unsupported-schema');
    return { available, status: available ? (unsupported || incomplete ? 'partial-schema' : 'reported') : (unsupported ? 'unsupported-schema' : 'empty'), rows, provenance: 'speediance-reported', caution, lastLoadedAtAvailable: false };
  }
  async function trainingLoad(startDate, endDate) {
    const start = date(startDate), end = date(endDate);
    if (start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 90) throw new TypeError('Invalid or excessive health date range.');
    const data = await read(`/mobile/userHealth/trainingLoad/dateRange?startDate=${start}&endDate=${end}`);
    if (!Array.isArray(data) || data.length > 366) throw new Error('Invalid reported training-load rows.');
    const rows = data.map(row => {
      const result = fields(row, ['trainingLoadValue', 'recommendMin', 'recommendMax']);
      const day = date(row.dateStr);
      if (day < start || day > end || typeof row.trainingLoadUnit !== 'string' || !row.trainingLoadUnit.trim() || row.trainingLoadUnit.length > 40) throw new Error('Invalid reported training-load date or unit.');
      return { dateStr: day, ...result, trainingLoadUnit: row.trainingLoadUnit };
    });
    const available = rows.some(row => Object.hasOwn(row, 'trainingLoadValue'));
    const incomplete = rows.some(row => !Object.hasOwn(row, 'trainingLoadValue'));
    const unsupported = data.some(row => schemaStatus(row, ['dateStr', 'trainingLoadUnit', 'trainingLoadValue', 'recommendMin', 'recommendMax'], false) === 'unsupported-schema');
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
    // Regional object contents have no verified scalar schema; never turn empty regions into zero scores.
    const available = Object.hasOwn(result, 'totalScore');
    return { available, status: schemaStatus(data, ['totalScore', 'scoreUpdateTime'], available), ...result, provenance: 'speediance-reported', caution, regionalScoresAvailable: false };
  }
  async function real(kind) {
    const value = await read(`/mobile/userHealth/mockReport/hasReal${kind}Data`);
    if (typeof value !== 'boolean') throw new Error('Speediance did not confirm real-data status.');
    return value;
  }
  async function bodyMeasurements() {
    const raw = await read('/app/userBody/current');
    const measurements = fields(raw, ['weight', 'height', 'bmi', 'bodyFatPercentage']);
    const available = Object.keys(measurements).length > 0;
    return { available, status: schemaStatus(raw, ['appUserId', 'weight', 'height', 'bmi', 'bodyFatPercentage'], available),
      measurements, weightUnit: 'unknown', heightUnit: 'unknown', unitSource: 'account-display-unit-not-returned',
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
      }
      const available = Object.hasOwn(result, 'value');
      const status = schemaStatus(raw[name], ['value', 'createTimestamp'], available);
      unsupported ||= status === 'unsupported-schema' || status === 'partial-schema';
      cards[name] = { available, status, ...result, reportedUnit: 'unknown', interpretedUnit,
        unitInterpretationSource: 'reference-client-renderer', measurementUnitVerified: false,
        timestampUnit: 'unknown', timestampTimeZone: 'unknown' };
    }
    for (const name of ['bodyAge', 'wellnessMonitor']) {
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
    let unsupported = Object.keys(raw).some(key => !['timeLevelList', 'maxHeartRate', 'minHeartRate', 'watchType'].includes(key));
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
    // Zero is a measurement. Labels/bounds alone do not establish measured duration.
    const available = Object.keys(metrics).length > 0 || rows.some(row => Object.hasOwn(row, 'timeLevel'));
    const incomplete = !Array.isArray(supplied) || rows.some(row => !Object.hasOwn(row, 'timeLevel'));
    const durationsComplete = Array.isArray(supplied) && rows.length > 0 && !incomplete;
    const totalSeconds = durationsComplete ? rows.reduce((sum, row) => sum + row.timeLevel, 0) : null;
    if (totalSeconds !== null && !Number.isFinite(totalSeconds)) throw new Error('Invalid heart-rate-zone total.');
    return { available, status: available ? (unsupported || incomplete ? 'partial-schema' : 'reported') : (unsupported ? 'unsupported-schema' : 'empty'),
      rows, ...metrics, totalSeconds, zoneListReported: Array.isArray(supplied), durationsComplete,
      durationUnit: 'seconds', durationInterpretationSource: 'reference-client-renderer',
      period: 'unknown', measurementFreshnessVerified: false, physiologicalZoneClassificationVerified: false,
      watchPairingInterpreted: false, provenance: 'speediance-reported', caution };
  }
  async function physicalCondition(dateStr) {
    const day = date(dateStr);
    const raw = await read(`/mobile/userHealth/physicalCondition/detailByDate?dateStr=${day}`);
    if (!object(raw)) throw new Error('Invalid reported physical-condition object.');
    const blocks = {};
    let unsupported = Object.keys(raw).some(key => !['physicalConditionResp', 'physicalConditionParam'].includes(key));
    for (const [name, numericKeys, scalarKeys] of [
      ['physicalConditionResp', ['physicalConditionScore', 'fitness', 'fatigue'], ['physicalConditionValue', 'trainingStatus']],
      ['physicalConditionParam', ['trainingStatusScore', 'trainingStatusScoreAvg'], []]
    ]) {
      if (raw[name] === undefined || raw[name] === null) continue;
      const block = fields(raw[name], numericKeys);
      for (const key of scalarKeys) if (Object.hasOwn(raw[name], key) && raw[name][key] !== null) {
        const value = raw[name][key];
        if (!(typeof value === 'number' && Number.isFinite(value)) && !(typeof value === 'string' && value.trim() && value.length <= 100)) throw new Error('Invalid reported physical-condition scalar.');
        block[key] = value;
      }
      if (Object.hasOwn(block, 'physicalConditionScore') && (block.physicalConditionScore < 0 || block.physicalConditionScore > 100)) throw new Error('Invalid reported physical-condition score.');
      unsupported ||= Object.keys(raw[name]).some(key => !numericKeys.includes(key) && !scalarKeys.includes(key));
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
    let unsupported = Object.keys(data).some(key => !names.includes(key));
    for (const key of names) if (data[key] !== undefined && data[key] !== null) {
      if (!object(data[key])) throw new Error('Invalid reported recovery block.');
      const present = Object.keys(data[key]).length > 0;
      blocks[key] = { status: present ? 'unsupported-schema' : 'empty', interpreted: false };
      unsupported ||= present;
    }
    return { available: false, status: unsupported ? 'unsupported-schema' : 'empty', realData: true, date: day, blocks, provenance: 'speediance-reported', caution, muscleLoadInterpreted: false };
  }
  async function sleep(dateStr) {
    const day = date(dateStr);
    if (!await real('Sleep')) return { available: false, status: 'real-data-not-confirmed', realData: false, date: day, reason: 'Real sleep data is not confirmed; sample data was not read.' };
    const raw = await read(`/mobile/userHealth/sleep?dateStr=${day}`);
    const data = fields(raw, ['sleep', 'targetSleepMin']);
    if (Object.values(data).some(value => value < 0)) throw new Error('Invalid negative sleep duration.');
    const available = Object.hasOwn(data, 'sleep');
    return { available, status: schemaStatus(raw, ['sleep', 'targetSleepMin'], available), realData: true, date: day, provenance: 'speediance-reported',
      sleepSeconds: data.sleep ?? null, targetSleepMinutes: data.targetSleepMin ?? null, caution };
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
