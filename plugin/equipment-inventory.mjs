function decodeEquipmentValue(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); }
    catch { return trimmed; }
  }
  if (/[;,]/.test(trimmed)) return trimmed.split(/[;,]/).map((entry) => entry.trim());
  return trimmed;
}

export function parseAccessoryIds(value) {
  if (typeof value === 'string' && /^\s*\d+(?:[\s,;]+\d+)*\s*$/.test(value)) {
    return [...new Set(value.trim().split(/[\s,;]+/).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  }
  const decoded = decodeEquipmentValue(value);
  const values = typeof decoded === 'string' && /^\d+(?:[\s,;]+\d+)*$/.test(decoded)
    ? decoded.split(/[\s,;]+/)
    : Array.isArray(decoded)
    ? decoded
    : typeof decoded === 'number'
      ? [decoded]
      : decoded && typeof decoded === 'object'
        ? [decoded]
        : typeof decoded === 'string'
          ? [decoded]
          : [];
  return [...new Set(values.map((item) => {
    const raw = item && typeof item === 'object'
      ? item.accessoryId ?? item.accessory_id ?? item.id ?? item.value
      : item;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }).filter((id) => id !== null))];
}

function normalizeEquipmentName(value) {
  return typeof value === 'string'
    ? value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
    : '';
}

export function mapEquipmentValues(value, catalog, { source } = {}) {
  const allowConfirmedNameGroups = source === 'user-confirmed-local';
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const byName = new Map();
  for (const item of catalog) {
    const key = normalizeEquipmentName(item.name);
    const matches = byName.get(key) || [];
    matches.push(item);
    byName.set(key, matches);
  }
  const ids = new Set();
  const unresolved = new Set();
  const nameGroups = [];
  let valid = true;
  const addValue = (entry) => {
    if (entry === null || entry === undefined || entry === '') {
      valid = false;
      return;
    }
    if (typeof entry === 'object' && !Array.isArray(entry)) {
      const identifiers = ['accessoryId', 'accessory_id', 'id', 'value'].filter(key => Object.hasOwn(entry, key)).map(key => entry[key]);
      const names = ['accessoryName', 'accessory_name', 'name', 'title', 'label'].filter(key => Object.hasOwn(entry, key)).map(key => entry[key]);
      const identifier = identifiers[0];
      const name = names[0];
      const validId = value => (typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value.trim())) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
      if (identifiers.some(value => !validId(value)) || new Set(identifiers.map(Number)).size > 1
          || names.some(value => typeof value !== 'string' || !value.trim())
          || new Set(names.map(normalizeEquipmentName)).size > 1) {
        valid = false;
        return;
      }
      const hasIdentifier = identifier !== undefined && identifier !== null && identifier !== '';
      const hasName = typeof name === 'string' && name.trim().length > 0;
      // A boolean ownership/selection flag does not identify which catalog item
      // the record describes. Treat it as malformed instead of returning a
      // valid-but-empty inventory that could be mistaken for a known selection.
      if (!hasIdentifier && !hasName) {
        valid = false;
        return;
      }
      const flags = ['owned', 'selected', 'enabled', 'checked']
        .filter(key => Object.hasOwn(entry, key)).map(key => entry[key]);
      // Remote ownership flag encodings other than booleans are unverified.
      // A contradictory declaration cannot establish possession either.
      if (flags.some(flag => typeof flag !== 'boolean') || flags.includes(true) && flags.includes(false)) {
        valid = false;
        return;
      }
      if (flags.includes(false)) return;
      if (hasIdentifier && hasName) {
        const exact = byId.get(Number(identifier));
        if (!exact || normalizeEquipmentName(exact.name) !== normalizeEquipmentName(name)) {
          valid = false;
          return;
        }
        // A remote exact ID is not a declaration of every duplicate-name item.
        addValue(identifier);
      } else {
        if (hasIdentifier) addValue(identifier);
        if (hasName) addValue(name);
      }
      return;
    }
    if (Array.isArray(entry)) {
      for (const nested of entry) addValue(nested);
      return;
    }
    if (typeof entry === 'number' || (typeof entry === 'string' && /^\d+$/.test(entry.trim()))) {
      const id = Number(entry);
      if (Number.isSafeInteger(id) && byId.has(id)) ids.add(id);
      else if (Number.isSafeInteger(id) && id > 0) unresolved.add(`ID ${id}`);
      else valid = false;
      return;
    }
    if (typeof entry === 'string') {
      const name = entry.trim();
      if (!name) {
        valid = false;
        return;
      }
      // Local explicit names may select all identical catalog names, matching
      // reference client accessory tiles. Remote numeric ownership never expands.
      const matches = allowConfirmedNameGroups
        ? catalog.filter((item) => typeof item.name === 'string' && item.name.trim().toLowerCase() === name.toLowerCase())
        : byName.get(normalizeEquipmentName(name)) || [];
      if (allowConfirmedNameGroups && matches.length > 0 && matches.every((item) => Number.isSafeInteger(item.id) && item.id > 0)) {
        const groupIds = [...new Set(matches.map((item) => item.id))].sort((a, b) => a - b);
        for (const id of groupIds) ids.add(id);
        if (!nameGroups.some((group) => group.name === matches[0].name)) nameGroups.push({ name: matches[0].name, ids: groupIds, source: 'user-confirmed-local', resolution: 'catalog-name-group' });
      }
      else if (matches.length === 1) ids.add(matches[0].id);
      else unresolved.add(name);
      return;
    }
    valid = false;
  };

  const decoded = decodeEquipmentValue(value);
  if (Array.isArray(decoded)) {
    for (const entry of decoded) addValue(entry);
  } else if (decoded && typeof decoded === 'object') {
    const listValue = decoded.items ?? decoded.list ?? decoded.ids ?? decoded.accessories;
    if (Array.isArray(listValue)) addValue(listValue);
    else addValue(decoded);
  } else {
    addValue(decoded);
  }
  return { ids: [...ids], unresolved: [...unresolved], valid, ...(allowConfirmedNameGroups ? { nameGroups } : {}) };
}

export function groupAccessoriesByName(accessories) {
  const groups = new Map();
  for (const item of accessories) {
    if (!item || typeof item.name !== 'string') continue;
    const key = normalizeEquipmentName(item.name);
    const group = groups.get(key) || { name: item.name, ids: [], deviceTypes: new Set() };
    if (Number.isSafeInteger(item.id) && !group.ids.includes(item.id)) group.ids.push(item.id);
    if (item.deviceTypes !== undefined) group.deviceTypes.add(String(item.deviceTypes));
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ name, ids, deviceTypes }) => ({ name, ids, deviceTypes: [...deviceTypes].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function findAccountAccessorySelection(profileData, catalog) {
  const acceptedFields = new Set([
    'ownedaccessory', 'ownedaccessories', 'ownedaccessoryid', 'ownedaccessoryids',
    'selectedaccessory', 'selectedaccessories', 'selectedaccessoryid', 'selectedaccessoryids',
    'myaccessory', 'myaccessories'
  ]);
  const declarations = [];
  const invalidPaths = [];
  let truncated = false;
  let visited = 0;
  const walk = (value, keyPath = 'data', depth = 0) => {
    if (!value || typeof value !== 'object') return;
    if (depth > 8 || visited >= 10_000) { truncated = true; return; }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (visited >= 10_000) { truncated = true; break; }
        visited++;
        walk(value[i], `${keyPath}[${i}]`, depth + 1);
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (visited >= 10_000) { truncated = true; break; }
      visited++;
      const normalizedKey = key.toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, '');
      if (acceptedFields.has(normalizedKey)) {
        const mapped = mapEquipmentValues(child, catalog);
        if (mapped.valid) {
          declarations.push({ fieldPath: `${keyPath}.${key}`, ...mapped });
        } else invalidPaths.push(`${keyPath}.${key}`);
        // The recognized declaration is data, not another profile container.
        continue;
      }
      walk(child, `${keyPath}.${key}`, depth + 1);
    }
  };
  walk(profileData);
  if (!declarations.length) return null;
  const canonical = declaration => JSON.stringify([
    [...declaration.ids].sort((a, b) => a - b), [...declaration.unresolved].sort()
  ]);
  const conflict = declarations.some(declaration => canonical(declaration) !== canonical(declarations[0]));
  const ids = conflict
    ? declarations[0].ids.filter(id => declarations.every(declaration => declaration.ids.includes(id)))
    : declarations[0].ids;
  const unresolved = [...new Set(declarations.flatMap(declaration => declaration.unresolved))];
  if (conflict) unresolved.push(`Conflicting account accessory declarations: ${declarations.map(declaration => declaration.fieldPath).join(', ')}`);
  if (invalidPaths.length) unresolved.push(`Incomplete account accessory declarations: ${invalidPaths.join(', ')}`);
  if (truncated) unresolved.push('Account accessory traversal limit reached; ownership evidence is incomplete.');
  return { ...declarations[0], ids, unresolved,
    ...(declarations.length > 1 ? { fieldPaths: declarations.map(declaration => declaration.fieldPath) } : {}) };
}
