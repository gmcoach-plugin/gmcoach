// Speediance uses the "Timestamp" request header as a replay nonce: two requests from the same
// session with an identical (or non-increasing) Timestamp are rejected with API 1004
// "Invalid nonce string". Parallel catalog/variant reads used to share one Date.now() millisecond.
// Every request and every retry takes a fresh, strictly increasing millisecond value here.
let lastTimestamp = 0;
export function nextRequestTimestamp(now = Date.now()) {
  const candidate = Math.trunc(Number(now));
  lastTimestamp = Number.isSafeInteger(candidate) && candidate > lastTimestamp ? candidate : lastTimestamp + 1;
  return String(lastTimestamp);
}
export function isInvalidNonceEnvelope(envelope) {
  const message = [envelope?.message, envelope?.msg].find(value => typeof value === 'string');
  return Number(envelope?.code) === 1004 && /^invalid nonce string\.?$/i.test(String(message ?? '').trim());
}

