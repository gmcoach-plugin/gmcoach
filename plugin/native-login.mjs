// Public reference client login contract: api_client.py, inspected 2026-10-04.
// Login identity is independent of the owned device. Login is never replayed, with one bounded exception: API 98
// and API 1004 are version gates that reject the request before it is processed. The phone login then repeats the
// same POST with the code chosen by the shared client version policy (at most four times).
import { nextRequestTimestamp } from './speediance-nonce.mjs';
import { speedianceAppVersionUpdater, MAX_CLIENT_VERSION_RETRIES } from './speediance-app-version.mjs';
const CLIENTS = Object.freeze({ phone: ['SOFTWARE'], 'gym-monster': ['HARDWARE', '1'], nano: ['NANO', '1'], bike: ['BIKE', '1'] });
export function normalizeLoginClientType(value = 'phone') {
  if (typeof value !== 'string' || !Object.hasOwn(CLIENTS, value)) throw new TypeError('Unsupported login client identity.');
  return value;
}
export class NativeLoginError extends Error {
  constructor(code, message = `Speediance login failed (${code}).`) { super(message); this.name = 'NativeLoginError'; this.code = code; }
}
const fail = code => { throw new NativeLoginError(code); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const VERSION_GATE_CODES = Object.freeze(['SPEEDIANCE_APP_VERSION_REQUIRED', 'SPEEDIANCE_NONCE_REJECTED']);

async function readBoundedJson(response) {
  const limit = 65536;
  if (!response || response.status !== 200) fail('http');
  if (!response.body || typeof response.body.getReader !== 'function') fail('response');
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); fail('response-too-large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('response'); }
  if (!record(body)) fail('api');
  if (Number(body.code) === 98) {
    throw new NativeLoginError('SPEEDIANCE_APP_VERSION_REQUIRED', 'Speediance odrzuciło logowanie kodem API 98, który oznacza wymóg nowszej wersji klienta. Żądanie logowania nie będzie ponawiane.');
  }
  if (Number(body.code) === 1004 && /^invalid nonce string\.?$/i.test(String(body.message ?? body.msg ?? '').trim())) {
    throw new NativeLoginError('SPEEDIANCE_NONCE_REJECTED', 'Speediance odrzuciło format nonce tego klienta (API 1004). Żądania logowania nie będą ponawiane.');
  }
  if (body.code !== 0 || !record(body.data)) fail('api');
  return body.data;
}

export async function nativeLogin({ email, password, region, loginClientType = 'phone', fetchImpl = globalThis.fetch, timeoutMs = 15000, versionPolicy = speedianceAppVersionUpdater } = {}) {
  const client = normalizeLoginClientType(loginClientType);
  if (!['EU', 'Global'].includes(region)) throw new TypeError('Login requires an explicit supported region.');
  if (typeof email !== 'string' || !email.trim() || email.length > 254 || /[\r\n\0]/.test(email) || typeof password !== 'string' || !password || password.length > 512) throw new TypeError('Invalid login credentials.');
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('Invalid login transport.');
  const host = region === 'EU' ? 'euapi.speediance.com' : 'api2.speediance.com';
  const [appType, fixedVersion] = CLIENTS[client];
  // Only the phone login declares the shared negotiated code; the other client types always send "1".
  const negotiated = fixedVersion === undefined;
  let version = fixedVersion ?? String(versionPolicy.requestVersion({ region }).versionCode);
  const headers = { Host: host, Timestamp: nextRequestTimestamp(), Versioncode: version, App_type: appType, Timezone: 'GMT', Utc_offset: '+0000', 'Content-Type': 'application/json', 'Accept-Language': 'en', 'User-Agent': 'Dart/3.9 (dart:io)', Mobiledevices: '{"brand":"google","device":"emulator64_x86_64_arm64","deviceType":"sdk_gphone64_x86_64","os":"","os_version":"31","manufacturer":"Google"}' };
  async function attempt(endpoint, payload) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new NativeLoginError('timeout')); }, timeoutMs); });
    try {
      return await Promise.race([Promise.resolve().then(async () => readBoundedJson(await fetchImpl(`https://${host}/api/app/v2/login/${endpoint}`, { method: 'POST', headers: { ...headers }, body: JSON.stringify(payload), signal: controller.signal, redirect: 'error' }))), timeout]);
    } catch (error) {
      if (error instanceof NativeLoginError) throw error;
      fail('transport');
    } finally { clearTimeout(timer); controller.abort(); }
  }
  async function post(endpoint, payload) {
    for (let retriesLeft = negotiated ? MAX_CLIENT_VERSION_RETRIES : 0; ; retriesLeft--) {
      headers.Timestamp = nextRequestTimestamp();
      try {
        const data = await attempt(endpoint, payload);
        if (negotiated) versionPolicy.recordAccepted(region, Number(version));
        return data;
      } catch (error) {
        if (!negotiated || !(error instanceof NativeLoginError) || !VERSION_GATE_CODES.includes(error.code)) throw error;
        const apiCode = error.code === 'SPEEDIANCE_APP_VERSION_REQUIRED' ? 98 : 1004;
        const declared = Number(version);
        const change = apiCode === 98
          ? versionPolicy.recordTooLow(region, declared) ?? (retriesLeft > 0 ? await versionPolicy.proposeStoreCandidate(region, declared) : null)
          : versionPolicy.recordRejectedHigh(region, declared);
        if (change && change.versionCode !== declared && retriesLeft > 0) {
          version = String(change.versionCode);
          headers.Versioncode = version;
          continue;
        }
        error.message = versionPolicy.describeRejection({ apiCode, declared, change, operation: 'login', limits: versionPolicy.summary(region) }).message;
        throw error;
      }
    }
  }
  const identity = await post('verifyIdentity', { type: 2, userIdentity: email.trim() });
  if (identity.isExist === false) fail('account-not-found');
  if (identity.hasPwd === false) fail('password-not-set');
  if (identity.isExist !== true || identity.hasPwd !== true) fail('identity');
  const session = await post('byPass', { userIdentity: email.trim(), password, type: 2 });
  if (typeof session.token !== 'string' || !session.token.trim() || session.token.length > 16384 || /[\s\x00-\x1f\x7f]/.test(session.token)) fail('session');
  const userId = session.appUserId;
  if (!((typeof userId === 'string' && /^[1-9]\d{0,39}$/.test(userId)) || (Number.isSafeInteger(userId) && userId > 0))) fail('session');
  return { token: session.token, user_id: String(userId) };
}
