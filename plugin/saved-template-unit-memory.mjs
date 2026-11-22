import { createHash } from 'node:crypto';

const UNIT_FIELDS = Object.freeze([
  'unit', 'repUnit', 'rep_unit', 'durationUnit', 'duration_unit',
  'durationSeconds', 'duration_seconds', 'timeSeconds', 'time_seconds', 'seconds',
  'completionMethod', 'countType'
]);
const PROGRAM_CODE = /^[A-Za-z0-9._-]{1,128}$/;
const HASH = /^[a-f0-9]{64}$/;

function workValues(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return [String(value)];
  if (typeof value !== 'string' || !value.trim()) return [];
  return value.split(',').map((part) => part.trim());
}

function setValue(value, setIndex, setCount) {
  if (value === undefined || value === null || value === '') return null;
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.includes(',')
      ? value.split(',').map((part) => part.trim())
      : [value];
  if (values.length === 1) return values[0];
  if (values.length !== setCount) return { invalidLength: values.length, expected: setCount };
  return values[setIndex];
}

export function savedTemplateUnitSignalFingerprint(action, setIndex, setCount) {
  if (!action || typeof action !== 'object' || !Number.isSafeInteger(setIndex) || setIndex < 0 || !Number.isSafeInteger(setCount) || setCount < 1 || setIndex >= setCount) {
    throw new Error('Nie można utworzyć odcisku jednostki dla nieprawidłowej serii szablonu.');
  }
  const values = workValues(action.setsAndReps);
  if (values.length !== setCount) throw new Error('Nie można zapamiętać jednostki, gdy setsAndReps nie zgadza się z liczbą serii.');
  const signals = Object.fromEntries(UNIT_FIELDS.map((field) => [field, setValue(action[field], setIndex, setCount)]));
  return createHash('sha256').update(JSON.stringify({
    rawWorkValue: values[setIndex],
    setIndex,
    setCount,
    signals
  })).digest('hex');
}

export function normalizeSavedTemplateUnitMemory(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1 || !Array.isArray(raw.confirmations) || raw.confirmations.length > 2000) {
    throw new Error('Lokalna pamięć jednostek szablonów ma nieobsługiwany format. Zachowano plik bez zmian.');
  }
  const normalized = { version: 1, updatedAt: raw.updatedAt, confirmations: [] };
  if (typeof raw.updatedAt !== 'string' || !Number.isFinite(Date.parse(raw.updatedAt))) {
    throw new Error('Lokalna pamięć jednostek szablonów nie ma prawidłowej daty. Zachowano plik bez zmian.');
  }
  if (raw.confirmedWeightUnit !== undefined) {
    if (!['kg', 'lb'].includes(raw.confirmedWeightUnit) || typeof raw.confirmedWeightUnitAt !== 'string' || !Number.isFinite(Date.parse(raw.confirmedWeightUnitAt))) {
      throw new Error('Zapamiętana jednostka obciążenia jest nieprawidłowa. Zachowano plik bez zmian.');
    }
    normalized.confirmedWeightUnit = raw.confirmedWeightUnit;
    normalized.confirmedWeightUnitAt = raw.confirmedWeightUnitAt;
  }
  const seen = new Set();
  for (const [index, item] of raw.confirmations.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        !PROGRAM_CODE.test(item.programCode) || !Number.isSafeInteger(item.groupId) || item.groupId < 1 ||
        !Number.isSafeInteger(item.actionLibraryId) || item.actionLibraryId < 1 ||
        !Number.isSafeInteger(item.set) || item.set < 1 ||
        typeof item.rawWorkValue !== 'string' || !/^\d+(?:\.\d+)?$/.test(item.rawWorkValue) ||
        !['reps', 'seconds'].includes(item.unit) || !HASH.test(item.signalFingerprint) ||
        typeof item.confirmedAt !== 'string' || !Number.isFinite(Date.parse(item.confirmedAt))) {
      throw new Error(`Lokalna pamięć jednostek zawiera nieprawidłowe potwierdzenie ${index + 1}. Zachowano plik bez zmian.`);
    }
    const key = `${item.programCode}:${item.groupId}:${item.actionLibraryId}:${item.set}`;
    if (seen.has(key)) throw new Error('Lokalna pamięć jednostek zawiera powtórzone potwierdzenie. Zachowano plik bez zmian.');
    seen.add(key);
    normalized.confirmations.push({
      programCode: item.programCode,
      groupId: item.groupId,
      actionLibraryId: item.actionLibraryId,
      set: item.set,
      rawWorkValue: item.rawWorkValue,
      unit: item.unit,
      signalFingerprint: item.signalFingerprint,
      confirmedAt: item.confirmedAt
    });
  }
  return normalized;
}

export function indexRememberedSavedTemplateUnits(actionLibraryList, programCode, memory) {
  const result = new Map();
  if (!Array.isArray(actionLibraryList) || !PROGRAM_CODE.test(programCode)) return result;
  const normalized = normalizeSavedTemplateUnitMemory(memory);
  for (const confirmation of normalized.confirmations) {
    if (confirmation.programCode !== programCode) continue;
    const matches = actionLibraryList.filter((action) =>
      Number(action?.groupId) === confirmation.groupId && Number(action?.actionLibraryId) === confirmation.actionLibraryId
    );
    if (matches.length !== 1) continue;
    const action = matches[0];
    const values = workValues(action.setsAndReps);
    const setIndex = confirmation.set - 1;
    if (values.length < 1 || setIndex >= values.length ||
        values[setIndex] !== confirmation.rawWorkValue) continue;
    let currentFingerprint;
    try { currentFingerprint = savedTemplateUnitSignalFingerprint(action, setIndex, values.length); }
    catch { continue; }
    if (currentFingerprint !== confirmation.signalFingerprint) continue;
    const rowKey = `${confirmation.groupId}:${confirmation.actionLibraryId}`;
    if (!result.has(rowKey)) result.set(rowKey, new Map());
    result.get(rowKey).set(setIndex, confirmation.unit);
  }
  return result;
}

export function mergeRememberedSavedTemplateUnits(memory, additions, confirmedWeightUnit, now = new Date().toISOString()) {
  const current = memory ? normalizeSavedTemplateUnitMemory(memory) : { version: 1, updatedAt: now, confirmations: [] };
  if (!Array.isArray(additions) || additions.length > 500) throw new Error('Podano nieprawidłową liczbę potwierdzeń jednostek.');
  if (confirmedWeightUnit !== undefined && !['kg', 'lb'].includes(confirmedWeightUnit)) throw new Error('Jednostka obciążenia musi być kg albo lb.');
  const byKey = new Map(current.confirmations.map((item) => [`${item.programCode}:${item.groupId}:${item.actionLibraryId}:${item.set}`, item]));
  const additionKeys = new Set();
  for (const item of additions) {
    const normalized = normalizeSavedTemplateUnitMemory({ version: 1, updatedAt: now, confirmations: [item] }).confirmations[0];
    const key = `${normalized.programCode}:${normalized.groupId}:${normalized.actionLibraryId}:${normalized.set}`;
    if (additionKeys.has(key)) throw new Error('Podano powtórzone potwierdzenie jednostki w jednym zapisie.');
    additionKeys.add(key);
    byKey.set(key, normalized);
  }
  const next = {
    version: 1,
    updatedAt: now,
    confirmations: [...byKey.values()],
    ...(confirmedWeightUnit ?? current.confirmedWeightUnit
      ? { confirmedWeightUnit: confirmedWeightUnit ?? current.confirmedWeightUnit, confirmedWeightUnitAt: confirmedWeightUnit ? now : current.confirmedWeightUnitAt }
      : {})
  };
  return normalizeSavedTemplateUnitMemory(next);
}


export function normalizeAccountSavedTemplateUnitMemory(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 2 ||
      typeof raw.accountFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(raw.accountFingerprint)) {
    throw new Error('Invalid account-scoped unit memory; preserved.');
  }
  return { version: 2, accountFingerprint: raw.accountFingerprint, memory: normalizeSavedTemplateUnitMemory(raw.memory) };
}
