const SOURCE = 'https://github.com/labatt/speediance-mcp/blob/96efbb3da0fa9d903defecbd2f726ea1885ce12e/src/speediance_mcp/speediance/parsing.py';
const MAX_SAMPLES = 10_000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function samples(raw) {
  if (raw === undefined || raw === null || raw === '') return { status: 'absent', values: [] };
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : null;
  if (!values || values.length > MAX_SAMPLES) return { status: 'invalid', values: [] };
  if (!values.length) return { status: 'absent', values: [] };
  const numbers = values.map(value => {
    if (typeof value !== 'number' && !(typeof value === 'string' && value.trim() !== '')) return NaN;
    return Number(value);
  });
  if (numbers.some(value => !Number.isFinite(value) || value < 0)) return { status: 'invalid', values: [] };
  return { status: 'valid', values: numbers };
}

function resolveSide(set, detail) {
  const values = [set.leftRight, detail.leftRight].filter(value => value !== null && value !== undefined && value !== '');
  if (!values.length) return { status: 'unpinned' };
  const numeric = values.map(value => typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)) ? Number(value) : NaN);
  if (numeric.some(value => ![0, 1, 2].includes(value)) || new Set(numeric).size !== 1) return { status: 'invalid' };
  return numeric[0] === 0 ? { status: 'unpinned' } : { status: 'pinned', side: numeric[0] };
}

/** Community-observed independent cable peaks; never per-repetition load or tonnage. */
export function resolveReportedCablePeakLoad(set, { weightUnit = 'unknown' } = {}) {
  if (!['kg', 'lb', 'unknown'].includes(weightUnit)) throw new TypeError('weightUnit must be kg, lb or unknown.');
  if (!object(set)) return null;
  const detailAliasesConflict = Object.hasOwn(set, 'trainingInfoDetail') && Object.hasOwn(set, 'training_info_detail') && JSON.stringify(set.trainingInfoDetail) !== JSON.stringify(set.training_info_detail);
  // A malformed canonical container must not hide a supplied alias: inspect
  // only to retain an explicit conflict diagnostic, never to infer a load.
  const hasTelemetry = value => object(value) && ['leftWeights', 'rightWeights', 'left_weights', 'right_weights', 'weights'].some(key => Object.hasOwn(value, key));
  const detail = hasTelemetry(set.trainingInfoDetail) ? set.trainingInfoDetail : set.training_info_detail;
  if (!hasTelemetry(detail)) return null;
  const aliasSamples = (canonical, alias) => {
    const a = samples(detail[canonical]), b = samples(detail[alias]);
    if (a.status === 'invalid' || b.status === 'invalid') return { status: 'invalid', values: [] };
    if (a.status === 'valid' && b.status === 'valid' && JSON.stringify(a.values) !== JSON.stringify(b.values)) return { status: 'invalid', values: [] };
    return a.status === 'valid' ? a : b;
  };
  const left = aliasSamples('leftWeights', 'left_weights');
  const right = aliasSamples('rightWeights', 'right_weights');
  const side = resolveSide(set, detail);
  const detailPrefix = object(set.trainingInfoDetail) ? 'trainingInfoDetail' : 'training_info_detail';
  const channelPath = sideName => `${detailPrefix}.${detail[sideName + 'Weights'] !== undefined && samples(detail[sideName + 'Weights']).status === 'valid' ? sideName + 'Weights' : sideName + '_weights'}`;
  const evidence = {
    source: SOURCE, interpretation: 'community-observed-independent-telemetry-peaks',
    perRepTelemetry: false, assessedOneRepMax: false,
    leftSampleCount: left.values.length, rightSampleCount: right.values.length,
    ...(side.side ? { side: side.side } : {})
  };
  const unknown = reason => ({ reportedCablePeakLoadStatus: 'unknown', reportedCablePeakLoadReason: reason,
    reportedCablePeakLoadUnit: weightUnit, reportedCablePeakLoadEvidence: evidence });
  if (detailAliasesConflict) return unknown('conflicting-detail-aliases');
  if (side.status === 'invalid') return unknown('invalid-or-conflicting-side');
  if ([left.status, right.status].includes('invalid')) return unknown('invalid-cable-telemetry');
  const peak = values => Math.max(...values);
  let load;
  let algorithm;
  let sourceFields;
  if (side.status === 'pinned') {
    const selected = side.side === 1 ? left : right;
    if (selected.status !== 'valid') return unknown('missing-pinned-side-telemetry');
    load = peak(selected.values);
    algorithm = 'pinned-side-maximum';
    sourceFields = [channelPath(side.side === 1 ? 'left' : 'right')];
  } else if (left.status === 'valid' && right.status === 'valid') {
    load = peak(left.values) + peak(right.values);
    algorithm = 'sum-of-independent-side-maxima';
    sourceFields = [channelPath('left'), channelPath('right')];
  } else if (left.status === 'valid' || right.status === 'valid') {
    load = peak(left.status === 'valid' ? left.values : right.values);
    algorithm = 'single-populated-side-maximum';
    sourceFields = [channelPath(left.status === 'valid' ? 'left' : 'right')];
  } else {
    const weights = samples(detail.weights);
    evidence.weightsSampleCount = weights.values.length;
    if (weights.status !== 'valid') return unknown(weights.status === 'invalid' ? 'invalid-fallback-telemetry' : 'missing-load-telemetry');
    load = peak(weights.values);
    algorithm = 'weights-maximum-fallback';
    sourceFields = [`${detailPrefix}.weights`];
  }
  if (!Number.isFinite(load)) return unknown('nonfinite-combined-peak');
  return {
    reportedCablePeakLoad: load, reportedCablePeakLoadStatus: 'reported-telemetry-peak',
    reportedCablePeakLoadUnit: weightUnit,
    reportedCablePeakLoadEvidence: { ...evidence, algorithm, sourceFields,
      ...(left.values.length ? { leftPeak: peak(left.values) } : {}),
      ...(right.values.length ? { rightPeak: peak(right.values) } : {})
    }
  };
}
