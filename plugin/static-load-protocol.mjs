import { formatWireDecimal } from './static-load-wire-units.mjs';

// Explicit alternative contracts; neither source establishes automatic account detection.
// https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/4e12bc6108f43c2705e935aa3d5db563cb8a3c06/api_client.py
// https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/api_client.py
export const STATIC_LOAD_PROTOCOLS = Object.freeze([
  'legacy-reference-client-wire-lb-get-kg',
  'account-unit-verbatim',
]);

function protocol(value) {
  if (!STATIC_LOAD_PROTOCOLS.includes(value)) throw new TypeError('Wymagany jawny protokół obciążenia statycznego.');
}
function unit(value) {
  if (!['kg', 'lb'].includes(value)) throw new TypeError('Wymagana jednostka kg albo lb.');
}
function finite(value, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new RangeError(`Obciążenie musi być skończoną liczbą od 0 do ${maximum}.`);
  }
}
function staticOnly(options) {
  // RM markers/counters are software selectors, never static load values.
  if (options.namedRM !== undefined || options.rmLevel !== undefined ||
      (options.presetId !== undefined && options.presetId !== -1)) {
    throw new TypeError('Named Smart RM nie przechodzi przez protokół obciążenia statycznego.');
  }
}
function convert(value, from, to) {
  return from === to ? value : from === 'kg' ? value * 2.2 : value / 2.2;
}
function format(value) { return formatWireDecimal(value); }

/** Community-client compatibility capacity before wire formatting; not measured tonnage or hosted its author wire proof. */
export function staticLoadBeforeWireRounding(options) {
  const { protocol: selected, load, loadUnit, accountUnit, loadIntent } = options;
  protocol(selected); unit(loadUnit); unit(accountUnit); staticOnly(options); finite(load, 1000);
  if (!['canonical-kg', 'account-customize'].includes(loadIntent)) throw new TypeError('Wymagany jawny zamiar obciążenia statycznego.');
  if (loadIntent === 'canonical-kg' && loadUnit !== 'kg') throw new TypeError('Canonical kg wymaga kg.');
  if (loadIntent === 'account-customize' && loadUnit !== accountUnit) throw new TypeError('Customize wymaga jednostki konta.');
  if (selected === 'legacy-reference-client-wire-lb-get-kg') {
    const kg = loadIntent === 'account-customize' && accountUnit === 'lb'
      ? Math.round((load / 2.2) * 2) / 2 : load;
    return kg * 2.2;
  }
  return convert(load, loadUnit, accountUnit);
}

export function encodeStaticLoad(options) {
  return format(staticLoadBeforeWireRounding(options));
}

/** Numeric conversion only. Parsing CSV, preset selection and evidence remain caller responsibilities. */
export function decodeStaticLoad(options) {
  const { protocol: selected, wireOrReadback, phase, accountUnit, outputUnit } = options;
  protocol(selected); unit(accountUnit); unit(outputUnit); staticOnly(options);
  if (!['readback', 'wire'].includes(phase)) throw new TypeError('Wymagana faza wire albo readback.');
  const sourceUnit = selected === 'account-unit-verbatim' ? accountUnit : phase === 'wire' ? 'lb' : 'kg';
  finite(wireOrReadback, sourceUnit === 'lb' ? 2200 : 1000);
  const result = convert(wireOrReadback, sourceUnit, outputUnit);
  finite(result, outputUnit === 'lb' ? 2200 : 1000);
  return result;
}
