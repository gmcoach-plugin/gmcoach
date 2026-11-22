import { createHash } from 'node:crypto';

export const DEFAULT_STATIC_LOAD_PROTOCOL = 'legacy-reference-client-wire-lb-get-kg';
const ALTERNATIVE = 'account-unit-verbatim';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Approval invalidation must bind even malformed static settings without blocking RM reads.
export function staticProtocolConfigurationDigest(config) {
  return digest({ accountIdentityFingerprint: staticProtocolAccountIdentity(config), protocol: config.static_load_protocol ?? DEFAULT_STATIC_LOAD_PROTOCOL, reference: config.static_load_protocol_reference ?? null });
}

export function resolveStaticProtocolReadContext(config, currentAccountUnit, options) {
  try { return resolveStaticProtocolContext(config, currentAccountUnit, options); }
  catch (error) {
    return Object.freeze({ staticLoadProtocol: DEFAULT_STATIC_LOAD_PROTOCOL, evidenceStatus: 'invalid-reference', contextDigest: staticProtocolConfigurationDigest(config), diagnostic: error.message });
  }
}

// A local reference record is not OAuth, scientific evidence or authorization to probe.
export function staticProtocolAccountIdentity(config) {
  const region = config?.region ?? 'Auto';
  if (typeof config?.email !== 'string' || !config.email.trim() || !['Auto', 'Global', 'EU'].includes(region)) throw new Error('Brak kanonicznej tożsamości konta dla protokołu obciążenia.');
  return digest({ email: config.email.trim().toLowerCase(), region });
}

export function resolveStaticProtocolContext(config, currentAccountUnit, { now = Date.now() } = {}) {
  const accountIdentityFingerprint = staticProtocolAccountIdentity(config);
  const selected = config.static_load_protocol ?? DEFAULT_STATIC_LOAD_PROTOCOL;
  if (![DEFAULT_STATIC_LOAD_PROTOCOL, ALTERNATIVE].includes(selected)) throw new Error('Nieznany lokalny protokół obciążenia statycznego.');
  if (selected === DEFAULT_STATIC_LOAD_PROTOCOL) return Object.freeze({ staticLoadProtocol: selected, accountUnit: currentAccountUnit, evidenceStatus: 'legacy-public-default', contextDigest: digest({ selected, accountIdentityFingerprint, accountUnit: currentAccountUnit ?? null }), accountIdentityFingerprint });
  const reference = config.static_load_protocol_reference;
  if (!Number.isFinite(now)) throw new Error('Nieprawidłowy zegar walidacji referencji.');
  if (!reference || reference.schemaVersion !== 1 || reference.provenance !== 'recorded-speediance-write-readback' || reference.accountIdentityFingerprint !== accountIdentityFingerprint || !['kg', 'lb'].includes(reference.accountUnit)) throw new Error('Alternatywny protokół wymaga rzeczywistego odczytu zwrotnego powiązanego z tym kontem.');
  if (currentAccountUnit !== undefined && currentAccountUnit !== reference.accountUnit) throw new Error('Jednostka konta nie zgadza się z referencją protokołu obciążenia.');
  const { write, readback, unitObservation } = reference;
  if (!unitObservation || unitObservation.method !== 'GET' || unitObservation.path !== '/app/userinfo' || unitObservation.source !== 'speediance-account-userinfo' || unitObservation.unit !== reference.accountUnit || unitObservation.accountIdentityFingerprint !== accountIdentityFingerprint) throw new Error('Referencja jednostki musi pochodzić z userinfo tego samego konta Speediance.');
  const validId = n => Number.isSafeInteger(n) && n > 0;
  if (!write || !readback || write.method !== 'POST' || write.path !== '/app/v2/customTrainingTemplate' || readback.method !== 'GET' || readback.path !== '/app/v3/customTrainingTemplate/detailByCode' || typeof readback.templateCode !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(readback.templateCode) || write.templateCode !== readback.templateCode || !validId(write.groupId) || !validId(write.actionLibraryId) || write.groupId !== readback.groupId || write.actionLibraryId !== readback.actionLibraryId || write.presetId !== -1 || readback.presetId !== -1) throw new Error('Referencja musi porównywać tę samą statyczną pozycję zapisu i odczytu Speediance.');
  const times = [write.observedAt, readback.observedAt, unitObservation.observedAt];
  if (times.some(value => typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || Date.parse(value) > now) || Date.parse(times[1]) < Date.parse(times[0]) || Math.max(...times.map(Date.parse)) - Math.min(...times.map(Date.parse)) > 15 * 60_000) throw new Error('Referencja wymaga nieprzyszłych skorelowanych dat userinfo, zapisu i bezpośredniego odczytu zwrotnego.');
  const maximum = reference.accountUnit === 'lb' ? 2200 : 1000;
  if (typeof write.weight !== 'number' || typeof readback.weight !== 'number' || !Number.isFinite(write.weight) || !Number.isFinite(readback.weight) || write.weight <= 0 || write.weight > maximum || readback.weight <= 0 || readback.weight > maximum || Math.abs(write.weight - readback.weight) > 0.05 || Math.abs(write.weight / 2.2 - readback.weight) <= 0.05) throw new Error('Referencja nie rozróżnia protokołu jednostki konta od publicznego protokołu legacy.');
  const contextDigest = digest({ selected, accountIdentityFingerprint, reference });
  return Object.freeze({ staticLoadProtocol: selected, accountUnit: reference.accountUnit, evidenceStatus: 'verified-reference', contextDigest, accountIdentityFingerprint });
}
