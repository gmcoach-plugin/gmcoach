/** Legacy community-client Customize compatibility adapter. Fixed canonical kg and
 * unchanged GET kg have separate paths and must not pass through imperial UI snapping. */
// Python f"{value:.1f}" rounds the exact binary64 value, ties to even.
export function formatWireDecimal(value) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid wire weight.');
  if (value === 0) return '0.0';
  const buffer = new ArrayBuffer(8), view = new DataView(buffer);
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 2047n);
  const mantissa = (bits & ((1n << 52n) - 1n)) + (exponent ? 1n << 52n : 0n);
  const shift = (exponent || 1) - 1023 - 52;
  let numerator = mantissa * 10n, denominator = 1n;
  if (shift >= 0) numerator <<= BigInt(shift); else denominator <<= BigInt(-shift);
  let rounded = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n > denominator || remainder * 2n === denominator && rounded % 2n === 1n) rounded++;
  return `${rounded / 10n}.${rounded % 10n}`;
}
export function formatAccountLoadForWire(displayLoad, displayUnit) {
  if (!['kg', 'lb'].includes(displayUnit)) throw new TypeError('Jednostka obciążenia konta musi być kg albo lb.');
  if (typeof displayLoad !== 'number' || !Number.isFinite(displayLoad) || displayLoad < 0 || displayLoad > 1000) {
    throw new RangeError('Obciążenie w jednostce konta musi wynosić od 0 do 1000.');
  }
  const kg = displayUnit === 'lb' ? Math.round((displayLoad / 2.2) * 2) / 2 : displayLoad;
  return formatWireDecimal(kg * 2.2);
}
