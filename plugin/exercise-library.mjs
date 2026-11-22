import { createHash } from 'node:crypto';
import { inferAccessoryRequirement } from './accessory-name-map.mjs';

// Strict bounded JSON fingerprint: never invoke toJSON or erase non-JSON data.
export function rawAccessoryDigest(action) {
  const hash = createHash('sha256'), ancestors = new Set();
  let bytes = 0, nodes = 0;
  function emit(token) {
    bytes += Buffer.byteLength(token, 'utf8');
    if (bytes > 65_536) throw new Error('limit');
    hash.update(token);
  }
  function visit(value, depth) {
    if (++nodes > 4096 || depth > 32) throw new Error('limit');
    if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number' && Number.isFinite(value)) {
      emit(JSON.stringify(value)); return;
    }
    if (!value || typeof value !== 'object' || ancestors.has(value)) throw new Error('unsupported');
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('unsupported');
    if (Reflect.ownKeys(value).some(key => typeof key !== 'string')) throw new Error('unsupported');
    ancestors.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.values(descriptors).some(item => item.get || item.set)) throw new Error('unsupported');
    if (Object.entries(descriptors).some(([key, item]) => !item.enumerable && !(Array.isArray(value) && key === 'length'))) throw new Error('unsupported');
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length || value.length > 4096) throw new Error('unsupported');
      emit('[');
      for (let i = 0; i < value.length; i++) { if (i) emit(','); visit(descriptors[i].value, depth + 1); }
      emit(']');
    } else {
      emit('{'); let first = true;
      for (const key of Object.keys(value).sort()) {
        if (!first) emit(','); first = false; emit(JSON.stringify(key)); emit(':'); visit(descriptors[key].value, depth + 1);
      }
      emit('}');
    }
    ancestors.delete(value);
  }
  try {
    emit(Object.hasOwn(action, 'accessories') ? 'present:' : 'missing:');
    if (Object.hasOwn(action, 'accessories')) {
      const descriptor = Object.getOwnPropertyDescriptor(action, 'accessories');
      if (!descriptor.enumerable || descriptor.get || descriptor.set) throw new Error('unsupported');
      visit(descriptor.value, 0);
    }
    return { status: 'available', digest: hash.digest('hex') };
  } catch (error) { return { status: error.message === 'limit' ? 'limit-exceeded' : 'unsupported', digest: null }; }
}

// Catalog titles may carry invisible characters (e.g. "\u200bStanding Cat-Cow"); return them clean (NFC, no zero-width/soft hyphen).
export function cleanCatalogTitle(value) { return String(value).normalize('NFC').replace(/[\u200b-\u200d\ufeff\u00ad]/gu, '').trim(); }
function categoryFailure(tab, reason, error) {
  const tabId = Number(tab?.id);
  const apiCode = Number(String(error?.message || '').match(/\(kod (\d+)\)/)?.[1]);
  return {
    category: typeof tab?.name === 'string' && tab.name.trim() ? tab.name.trim().slice(0, 100) : 'Nieznana kategoria',
    ...(Number.isSafeInteger(tabId) && tabId > 0 ? { tabId } : {}),
    reason,
    ...(Number.isSafeInteger(apiCode) ? { apiCode } : {})
  };
}

export function formatIncompleteExerciseCatalogWarning(incompleteCategories) {
  if (!Array.isArray(incompleteCategories) || incompleteCategories.length === 0) return undefined;
  const categories = incompleteCategories.map((item) => {
    const id = item.tabId === undefined ? '' : ` (tabId ${item.tabId})`;
    const code = item.apiCode === undefined ? '' : `, kod API ${item.apiCode}`;
    const reasons = {
      invalid_category_metadata: 'nieprawidłowe metadane kategorii',
      request_failed: 'nie udało się pobrać kategorii',
      unexpected_response: 'nieoczekiwany format odpowiedzi',
      empty_category_response: 'pusta odpowiedź kategorii',
      invalid_group_structure: 'nieprawidłowa struktura grupy ćwiczeń',
      missing_exercise_list: 'brak listy ćwiczeń w grupie',
      invalid_exercise_metadata: 'nieprawidłowe ID lub nazwa ćwiczenia',
      response_truncated: 'odpowiedź wskazuje dalsze wyniki',
      pagination_metadata_invalid: 'nieprawidłowe lub sprzeczne metadane kompletności'
    };
    const reason = reasons[item.reason] || 'niepełna struktura odpowiedzi';
    const count = item.issueCount > 1 ? ` (${item.issueCount} przypadki)` : '';
    return `„${item.category}”${id}${code}: ${reason}${count}`;
  });
  return `Katalog ćwiczeń jest niekompletny: ${categories.join(', ')}. Wyniki mogą pomijać ćwiczenia; nie zakładaj, że ich nie ma.`;
}

function observeDataStatType(observations, id, action) {
  if (!action || !Object.hasOwn(action, 'dataStatType') || action.dataStatType === null || action.dataStatType === '') return;
  const current = observations.get(id) || { values: new Set(), invalid: false };
  if (typeof action.dataStatType === 'number' && Number.isSafeInteger(action.dataStatType)) {
    current.values.add(action.dataStatType);
  } else {
    current.invalid = true;
  }
  observations.set(id, current);
}

function applyDataStatTypeObservations(exercises, observations) {
  for (const exercise of exercises) {
    const observed = observations.get(exercise.id);
    const values = observed ? [...observed.values].sort((a, b) => a - b) : [];
    if (observed?.invalid) {
      exercise.dataStatTypeStatus = 'invalid';
    } else if (values.length > 1) {
      exercise.dataStatTypeStatus = 'conflict';
      exercise.dataStatTypeConflictValues = values;
    } else if (values.length === 1) {
      exercise.dataStatType = values[0];
      exercise.dataStatTypeStatus = 'available';
    } else {
      exercise.dataStatTypeStatus = 'missing';
    }
  }
}

function strictAccessoryRequirement(action) {
  if (!Object.hasOwn(action, 'accessories')) return { status: 'missing', ids: [] };
  let value = action.accessories;
  if (typeof value === 'string') {
    const token = value.trim();
    // Speediance sends a blank string for exercises without accessories.
    if (!token) return { status: 'valid-empty', ids: [] };
    if (token.startsWith('[') || token.startsWith('{')) {
      try { value = JSON.parse(token); } catch { return { status: 'invalid', ids: [] }; }
    } else if (/^\d+(?:[\s,;]+\d+)*$/.test(token)) value = token.split(/[\s,;]+/);
    else return { status: 'invalid', ids: [] };
  }
  const values = Array.isArray(value) ? value : [value];
  const ids = [];
  for (const item of values) {
    let aliases = [item];
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      aliases = ['accessoryId', 'accessory_id', 'id', 'value'].filter(key => Object.hasOwn(item, key)).map(key => item[key]);
    }
    const valid = raw => (typeof raw === 'number' || typeof raw === 'string' && /^\d+$/.test(raw.trim())) && Number.isSafeInteger(Number(raw)) && Number(raw) > 0;
    if (!aliases.length || aliases.some(raw => !valid(raw)) || new Set(aliases.map(Number)).size !== 1) return { status: 'invalid', ids: [] };
    ids.push(Number(aliases[0]));
  }
  return { status: ids.length ? 'valid-ids' : 'valid-empty', ids: [...new Set(ids)].sort((a,b) => a-b) };
}

// A selected group-detail response may fill a partial category catalog. This
// never proves variant identity; callers must verify the exact variant first.
export function freshGroupAccessoryRequirements(metadata) {
  if (metadata?.groupIdentity?.executableAllowed === false) return {complete:false,status:'group-scope-invalid'};
  const observations = ['detail','batch'].flatMap(source => {
    const group = metadata?.[source];
    return group && typeof group === 'object' && !Array.isArray(group) && Object.hasOwn(group,'accessories')
      ? [{source,...strictAccessoryRequirement(group)}] : [];
  });
  if (!observations.length) return {complete:false,status:'missing'};
  if (observations.some(row => !row.status.startsWith('valid-') || row.ids.length > 128))
    return {complete:false,status:'invalid'};
  const distinct = new Set(observations.map(row => JSON.stringify(row.ids)));
  if (distinct.size !== 1) return {complete:false,status:'conflict'};
  return {complete:true,status:observations[0].status,ids:observations[0].ids,
    sources:observations.map(row => row.source)};
}

function accessoryShapeDiagnostics(action) {
  if (!Object.hasOwn(action, 'accessories')) return { fieldType: 'absent', shape: 'missing' };
  const raw = action.accessories;
  const fieldType = raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw;
  if (typeof raw === 'string') {
    const token = raw.trim();
    return { fieldType, shape: !token ? 'blank-string' : token.startsWith('[') || token.startsWith('{') ? 'json-string' : 'token-string', characterCount: Math.min(raw.length, 1_000_000) };
  }
  return { fieldType, shape: fieldType, ...(Array.isArray(raw) ? { itemCount: Math.min(raw.length, 1_000_000) } : {}) };
}

function applyAccessoryObservations(exercises, observations) {
  for (const exercise of exercises) {
    const rows = observations.get(exercise.id);
    const valid = rows.filter(row => row.status.startsWith('valid-'));
    const conflict = new Set(valid.map(row => JSON.stringify(row.ids))).size > 1;
    const observedStatus = conflict ? 'conflict' : rows.some(row => row.status === 'invalid') ? 'invalid' : rows.some(row => row.status === 'missing') ? 'missing' : valid[0].status;
    let status = observedStatus, requiredIds = observedStatus.startsWith('valid-') ? valid[0].ids : [];
    if (conflict) {
      requiredIds = [...new Set(valid.flatMap(row => row.ids))].sort((a,b) => a-b);
      status = requiredIds.length ? 'valid-ids' : 'valid-empty';
      exercise.equipmentMetadataInference = { source: 'union-of-reported-sets', observedStatus };
    } else if (!observedStatus.startsWith('valid-')) {
      const inferred = valid.length ? { status: valid[0].status, ids: valid[0].ids, source: 'other-valid-observation' } : inferAccessoryRequirement(exercise);
      status = inferred.status; requiredIds = inferred.ids;
      exercise.equipmentMetadataInference = { source: inferred.source, observedStatus };
    }
    exercise.equipmentMetadataStatus = status;
    exercise.equipmentMetadataAvailable = status === 'valid-ids' || status === 'valid-empty';
    exercise.requiredAccessoryIds = exercise.equipmentMetadataAvailable ? requiredIds : [];
    exercise.equipmentMetadataProvenance = rows.map(({ status, deviceType, tabId, sourcePath }) => ({ status, deviceType, tabId, sourcePath }));
    exercise.equipmentMetadataDiagnostics = {
      catalogGroupId: exercise.id, groupIdentitySource: 'catalog-row', observationCount: rows.length,
      validSetConflict: conflict, hasInvalidObservation: rows.some(row => row.status === 'invalid'),
      hasMissingObservation: rows.some(row => row.status === 'missing'),
      observations: rows.slice(0, 32).map(({ status, deviceType, tabId, sourcePath, diagnostic }) => ({ status, deviceType, tabId, sourcePath, ...diagnostic })),
      truncated: rows.length > 32, rawValuesIncluded: false
    };
    const digestAvailable = rows.length <= 256 && rows.every(row => row.rawDigest.status === 'available');
    const digestRows = digestAvailable ? rows.map(row => ({ deviceType: row.deviceType, tabId: row.tabId, digest: row.rawDigest.digest })) : [];
    exercise.rawRequirementDigest = digestAvailable ? createHash('sha256').update(JSON.stringify({ catalogGroupId: exercise.id, observations: digestRows.sort((a,b) => { const x = JSON.stringify(a), y = JSON.stringify(b); return x < y ? -1 : x > y ? 1 : 0; }) })).digest('hex') : null;
    exercise.rawRequirementDigestStatus = digestAvailable ? 'available' : rows.length > 256 || rows.some(row => row.rawDigest.status === 'limit-exceeded') ? 'limit-exceeded' : 'unsupported';
    exercise.rawRequirementDigestBindable = digestAvailable;
    const validSetsComplete = rows.length <= 256 && valid.every(row => Array.isArray(row.ids) && row.ids.length <= 128 && row.ids.every(id => Number.isSafeInteger(id) && id > 0));
    exercise.reportedValidRequirementSetsComplete = validSetsComplete;
    exercise.reportedValidRequirementSets = validSetsComplete ? [...new Map(valid.map(row => { const ids = [...new Set(row.ids)].sort((a,b) => a-b); return [JSON.stringify(ids), ids]; })).values()].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : [];
  }
}

function exerciseCatalogResponseCoverage(response) {
  const moreKeys = new Set(['hasmore', 'hasnext', 'hasnextpage']);
  const cursorKeys = new Set(['nextcursor', 'nextoffset', 'nextpage']);
  const totalKeys = new Set(['total', 'totalcount', 'totalsize']);
  let truncated = false, malformed = false;
  const totals = new Set();
  const flags = new Set();
  const containers = [response];
  if (response && typeof response === 'object') {
    for (const key of ['pagination', 'pageInfo']) {
      const descriptor = Object.getOwnPropertyDescriptor(response, key);
      if (descriptor && Object.hasOwn(descriptor, 'value') && descriptor.value && typeof descriptor.value === 'object' && !Array.isArray(descriptor.value)) containers.push(descriptor.value);
      else if (descriptor) malformed = true;
    }
  }
  for (const container of containers) {
    if (!container || typeof container !== 'object' || Array.isArray(container)) continue;
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(container))) {
      const normalized = key.toLowerCase();
      if (!moreKeys.has(normalized) && !cursorKeys.has(normalized) && !totalKeys.has(normalized)) continue;
      if (!Object.hasOwn(descriptor, 'value')) { malformed = true; continue; }
      const value = descriptor.value;
      if (moreKeys.has(normalized)) {
        if (typeof value !== 'boolean') malformed = true;
        else { flags.add(value); if (value) truncated = true; }
      } else if (cursorKeys.has(normalized)) {
        if (value === null || value === '') continue;
        if ((typeof value === 'string' && value.length <= 256 && value.trim()) || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)) truncated = true;
        else malformed = true;
      } else {
        if (!Number.isSafeInteger(value) || value < 0) malformed = true;
        else totals.add(value);
      }
    }
  }
  if (totals.size > 1 || flags.size > 1) malformed = true;
  return { truncated, malformed };
}

// Fetch independent API resources in parallel, then consume them in input order.
// A small fixed limit avoids turning a catalog refresh into an API burst.
async function fetchBoundedSettled(items, fetchItem, limit = 3) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await fetchItem(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }));
  return results;
}

export async function loadExerciseLibraryFromTabs(tabs, { deviceType, fetchCategory, fetchExerciseDetails, exerciseKind, parseAccessoryIds, categoryListResponse }) {
  if (!Array.isArray(tabs)) throw new TypeError('tabs musi być listą kategorii.');
  if (typeof fetchCategory !== 'function' || typeof exerciseKind !== 'function' || typeof parseAccessoryIds !== 'function') {
    throw new TypeError('Brakuje funkcji potrzebnych do pobrania katalogu ćwiczeń.');
  }

  const byId = new Map();
  const nameObservations = new Map();
  const dataStatTypeObservations = new Map();
  const accessoryObservations = new Map();
  const incompleteCategories = [];
  const issueIndexes = new Map();
  const markIncomplete = (tab, reason, error, tabIndex) => {
    const key = `${tabIndex}:${reason}`;
    const existingIndex = issueIndexes.get(key);
    if (existingIndex !== undefined) {
      const existing = incompleteCategories[existingIndex];
      existing.issueCount = (existing.issueCount || 1) + 1;
      return;
    }
    issueIndexes.set(key, incompleteCategories.length);
    incompleteCategories.push(categoryFailure(tab, reason, error));
  };

  if (categoryListResponse !== undefined) {
    const coverage = exerciseCatalogResponseCoverage(categoryListResponse);
    if (coverage.truncated) markIncomplete({name:'Category list'},'response_truncated',undefined,-1);
    if (coverage.malformed) markIncomplete({name:'Category list'},'pagination_metadata_invalid',undefined,-1);
  }

  const categoryResults = await fetchBoundedSettled(tabs, async (tab) => {
    const tabId = Number(tab?.id);
    if (!Number.isSafeInteger(tabId) || tabId < 1 || typeof tab?.name !== 'string' || !tab.name.trim()) return undefined;
    return fetchCategory(tabId);
  });
  for (const [tabIndex, tab] of tabs.entries()) {
    const tabId = Number(tab?.id);
    if (!Number.isSafeInteger(tabId) || tabId < 1 || typeof tab?.name !== 'string' || !tab.name.trim()) {
      markIncomplete(tab, 'invalid_category_metadata', undefined, tabIndex);
      continue;
    }

    const categoryResult = categoryResults[tabIndex];
    if (categoryResult.status === 'rejected') {
      markIncomplete(tab, 'request_failed', categoryResult.reason, tabIndex);
      continue;
    }
    const groupedResponse = categoryResult.value;
    if (!Array.isArray(groupedResponse?.data)) {
      markIncomplete(tab, 'unexpected_response', undefined, tabIndex);
      continue;
    }
    if (groupedResponse.data.length === 0) {
      markIncomplete(tab, 'empty_category_response', undefined, tabIndex);
      continue;
    }

    const responseCoverage = exerciseCatalogResponseCoverage(groupedResponse);
    if (responseCoverage.truncated) markIncomplete(tab, 'response_truncated', undefined, tabIndex);
    if (responseCoverage.malformed) markIncomplete(tab, 'pagination_metadata_invalid', undefined, tabIndex);

    for (const [groupIndex, group] of groupedResponse.data.entries()) {
      if (!group || typeof group !== 'object' || Array.isArray(group)) {
        markIncomplete(tab, 'invalid_group_structure', undefined, tabIndex);
        continue;
      }
      if (!Array.isArray(group.actionLibraryGroupList)) {
        markIncomplete(tab, 'missing_exercise_list', undefined, tabIndex);
        continue;
      }
      for (const [actionIndex, action] of group.actionLibraryGroupList.entries()) {
        if (!action || typeof action !== 'object' || Array.isArray(action)) {
          markIncomplete(tab, 'invalid_exercise_metadata', undefined, tabIndex);
          continue;
        }
        const id = Number(action?.groupId ?? action?.id);
        const title = (typeof action?.title === 'string' ? cleanCatalogTitle(action.title) : '') || (typeof action?.name === 'string' ? cleanCatalogTitle(action.name) : '');
        if (Number.isSafeInteger(id) && id > 0) {
          const observation = nameObservations.get(id) || { names: new Set(), sources: [], sourceCount: 0, overlongCount: 0, conflict: false, overflow: false };
          observation.sourceCount++;
          if (title.length > 4096) observation.overlongCount++;
          else if (title && !observation.names.has(title)) {
            if (observation.names.size) observation.conflict = true;
            observation.names.add(title);
            if (observation.names.size > 8) {
              observation.overflow = true;
              const ordered = [...observation.names].sort((a,b)=>a<b?-1:a>b?1:0);
              observation.names = new Set(ordered.slice(0,8));
            }
          }
          const source = [tabId, groupIndex, actionIndex];
          observation.sources.push(source);
          observation.sources.sort((a,b) => a[0]-b[0] || a[1]-b[1] || a[2]-b[2]);
          observation.sources.length = Math.min(observation.sources.length, 8);
          nameObservations.set(id, observation);
        }
        if (!Number.isSafeInteger(id) || id < 1) {
          markIncomplete(tab, 'invalid_exercise_metadata', undefined, tabIndex);
          continue;
        }
        if (!title || title.length > 4096) markIncomplete(tab, 'invalid_exercise_metadata', undefined, tabIndex);
        const requirement = strictAccessoryRequirement(action);
        const observed = accessoryObservations.get(id) || [];
        observed.push({ ...requirement, rawDigest: rawAccessoryDigest(action), diagnostic: accessoryShapeDiagnostics(action), deviceType: Number(deviceType), tabId, sourcePath: `data[${groupIndex}].actionLibraryGroupList[${actionIndex}].accessories` });
        accessoryObservations.set(id, observed);
        const requiredAccessoryIds = requirement.ids;
        observeDataStatType(dataStatTypeObservations, id, action);
        const current = byId.get(id) || {
          id,
          title,
          category: tab.name.trim(),
          kind: exerciseKind(tab.name),
          requiredAccessoryIds,
          equipmentMetadataAvailable: Object.hasOwn(action, 'accessories'),
          deviceTypes: []
        };
        if (Object.hasOwn(action, 'countType') && action.countType !== null && action.countType !== '') {
          if (current.countTypeConflict) {
            // Keep the conflict flag; never let another duplicate row overwrite it.
          } else if (current.countType === undefined) {
            current.countType = action.countType;
          } else if (String(current.countType).trim() !== String(action.countType).trim()) {
            delete current.countType;
            current.countTypeConflict = true;
          }
        }
        if (!current.deviceTypes.includes(Number(deviceType))) current.deviceTypes.push(Number(deviceType));
        byId.set(id, current);
      }
    }
  }

  for (const [id,row] of byId) {
    const observation=nameObservations.get(id);
    if (observation?.names.size===1 && !observation.conflict && !observation.overflow && !observation.overlongCount) row.title=[...observation.names][0];
  }
  const exercises = [...byId.values()].filter(row => nameObservations.get(row.id)?.names.size > 0).sort((a, b) => a.title.localeCompare(b.title));
  await enrichMainMuscleMetadata(exercises, fetchExerciseDetails, dataStatTypeObservations);
  applyDataStatTypeObservations([...byId.values()], dataStatTypeObservations);
  applyAccessoryObservations([...byId.values()], accessoryObservations);
  const diagnosticExercises = [];
  const compareName = (a,b) => a < b ? -1 : a > b ? 1 : 0;
  const diagnostic = (id, observation, status, detailName) => {
    const names = [...observation.names].sort(compareName);
    return { ...(byId.get(id) || {}), id, title: `Exercise ID ${id}`, nameEvidenceStatus: status, executableNameQualified: false,
      observedNameAliases: names.slice(0,8).map(name => name.slice(0,100)),
      observedNameAliasCount: observation.overflow ? null : names.length, observedNameAliasesOmittedCount: observation.overflow ? null : 0,
      observedNameAliasCountStatus: observation.overflow ? 'lower-bound-only' : 'exact', observedNameAliasCountLowerBound: observation.overflow ? 9 : names.length, nameAliasOverflow: observation.overflow,
      nameSourceObservations: observation.sources, nameSourceObservationCount: observation.sourceCount,
      nameSourceObservationsOmittedCount: observation.sourceCount-observation.sources.length,
      overlongNameObservationCount: observation.overlongCount,
      ...(detailName ? { detailName, detailNameSource: 'unique-exact-group-detail' } : {}),
      variantCatalogStatus: byId.get(id)?.variantCatalogStatus || 'unqualified-diagnostic-only' };
  };
  for (let index=exercises.length-1;index>=0;index--) {
    const row=exercises[index], observation=nameObservations.get(row.id);
    if (observation && (observation.conflict || observation.overlongCount)) {
      diagnosticExercises.push(diagnostic(row.id,observation,'conflicting-category-names'));
      exercises.splice(index,1);markIncomplete({name:'Name identity'},'conflicting_exercise_names',undefined,-2);
    }
  }
  const missing=[...nameObservations.entries()].filter(([id,observation]) => observation.names.size === 0).sort((a,b)=>a[0]-b[0]);
  const selected=missing.slice(0,50);
  if(missing.length>50)markIncomplete({name:'Name recovery'},'name_recovery_candidate_cap',undefined,-3);
  let details=[];
  if(selected.length && typeof fetchExerciseDetails === 'function') {
    try { const response=await fetchExerciseDetails(selected.map(([id])=>id));if(Array.isArray(response?.data))details=response.data; } catch { /* Diagnostic recovery only. */ }
  }
  for(const [index,[id,observation]] of missing.entries()) {
    const matches=index<50 ? details.filter(row=>row && typeof row==='object' && !Array.isArray(row) && [Object.prototype,null].includes(Object.getPrototypeOf(row)) && Number.isSafeInteger(row.id) && row.id===id) : [];
    const detail=matches.length===1 ? matches[0] : null;
    const name=detail && ((typeof detail.title==='string' && cleanCatalogTitle(detail.title)) || (typeof detail.name==='string' && cleanCatalogTitle(detail.name)));
    const record=byId.get(id);
    if(detail && record) {
      observeCatalogVariants([record],{data:[detail]});
      observeDataStatType(dataStatTypeObservations,id,detail);
      applyDataStatTypeObservations([record],dataStatTypeObservations);
    }
    diagnosticExercises.push(diagnostic(id,observation,index>=50?'recovery-cap-unresolved':name && name.length<=4096?'unique-detail-read-only':'missing-name-unresolved',name && name.length<=4096?name:undefined));
  }
  diagnosticExercises.sort((a,b)=>a.id-b.id);
  const catalogWarning = formatIncompleteExerciseCatalogWarning(incompleteCategories);
  if (!exercises.length && !diagnosticExercises.length) {
    const error = new Error(catalogWarning
      ? `Nie udało się pobrać żadnych ćwiczeń. ${catalogWarning}`
      : 'Speediance zwróciło pusty katalog ćwiczeń dla wybranego typu urządzenia.');
    error.code = 'SPEEDIANCE_EXERCISE_LIBRARY_EMPTY';
    throw error;
  }

  return {
    exercises,
    diagnosticExercises,
    nameRecoveryCoverage: {candidateCount:missing.length,requestedCount:selected.length,omittedCandidateCount:Math.max(0,missing.length-50),diagnosticGroupCount:diagnosticExercises.length},
    catalogStatus: incompleteCategories.length ? 'partial' : 'complete',
    incompleteCategories,
    catalogCoverage: {
      scope: 'selected-api-product-family-returned-categories',
      deviceType: Number(deviceType),
      categoryProcessingStatus: incompleteCategories.length ? 'partial' : 'complete',
      upstreamUniverseStatus: 'unknown',
      uniqueGroupCount: exercises.length,
      uniqueVariantCount: new Set(exercises.flatMap(row => (row.actionLibraryVariants || []).map(variant => variant.id))).size,
      uniqueGroupVariantPairCount: exercises.reduce((count,row) => count + (row.actionLibraryVariants || []).length,0),
      variantCoverageStatus: exercises.every(row => row.variantCatalogStatus === 'observed-list') ? 'observed-lists' : 'partial-or-unavailable',
      variantDetailQualifiedGroupCount: exercises.filter(row => row.variantCatalogStatus === 'observed-list').length,
      variantDetailUnqualifiedGroupCount: exercises.filter(row => row.variantCatalogStatus !== 'observed-list').length,
      detailUnavailableGroupCount: exercises.filter(row => row.mainMuscleGroupStatus === 'unavailable').length,
      detailMissingGroupCount: exercises.filter(row => row.mainMuscleGroupStatus === 'missing').length,
      physicalGenerationCoverage: 'unverified'
    },
    ...(catalogWarning ? { catalogWarning } : {})
  };
}

// Speediance's /app/actionLibraryGroup/list endpoint exposes
// mainMuscleGroupName. Keep this enrichment separate from catalog identity and
// fail open: a missing details response must never make up a muscle from the
// exercise title or make an otherwise valid catalog unusable.
function observeCatalogVariants(exercises, response) {
  const requested = new Map(exercises.map(row => [row.id, row]));
  for (const exercise of exercises) exercise.variantCatalogStatus = 'missing-detail';
  const matches = new Map();
  for (const row of Array.isArray(response?.data) ? response.data : []) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || !Number.isSafeInteger(row.id) || !requested.has(row.id)) continue;
    const list = matches.get(row.id) || []; list.push(row); matches.set(row.id,list);
  }
  for (const [id, rows] of matches) {
    const exercise = requested.get(id);
    if (rows.length !== 1) { exercise.variantCatalogStatus = 'conflicting-detail'; continue; }
    const row = rows[0];
    if (!Array.isArray(row.actionLibraryList)) { exercise.variantCatalogStatus = 'variant-list-unavailable'; continue; }
    const variants = new Map(); let invalid = false;
    for (const variant of row.actionLibraryList) {
      if (!variant || typeof variant !== 'object' || Array.isArray(variant) || !Number.isSafeInteger(variant.id) || variant.id < 1) { invalid = true; continue; }
      const name = (typeof variant.title === 'string' ? cleanCatalogTitle(variant.title) : '') || (typeof variant.name === 'string' ? cleanCatalogTitle(variant.name) : '');
      if (variants.has(variant.id)) { invalid = true; continue; }
      variants.set(variant.id, {id:variant.id,...(name ? {name:name.slice(0,100)} : {})});
    }
    exercise.actionLibraryVariants = [...variants.values()];
    exercise.variantCatalogStatus = invalid ? 'partial' : 'observed-list';
  }
}

async function enrichMainMuscleMetadata(exercises, fetchExerciseDetails, dataStatTypeObservations) {
  if (typeof fetchExerciseDetails !== 'function') {
    for (const exercise of exercises) { exercise.mainMuscleGroupStatus = 'not-requested'; exercise.variantCatalogStatus = 'not-requested'; }
    return;
  }

  const chunks = [];
  for (let start = 0; start < exercises.length; start += 50) chunks.push(exercises.slice(start, start + 50));
  const detailResults = await fetchBoundedSettled(chunks, chunk => fetchExerciseDetails(chunk.map(({ id }) => id)));
  for (const [index, chunk] of chunks.entries()) {
    const detailResult = detailResults[index];
    if (detailResult.status === 'rejected') {
      for (const exercise of chunk) { exercise.mainMuscleGroupStatus = 'unavailable'; exercise.variantCatalogStatus = 'unavailable'; }
      continue;
    }
    const response = detailResult.value;
    if (!Array.isArray(response?.data)) {
      for (const exercise of chunk) { exercise.mainMuscleGroupStatus = 'unavailable'; exercise.variantCatalogStatus = 'unavailable'; }
      continue;
    }

    observeCatalogVariants(chunk,response);
    const byId = new Map();
    const conflicts = new Set();
    for (const detail of response.data) {
      if (!detail || typeof detail !== 'object' || Array.isArray(detail)) continue;
      const id = Number(detail.id);
      if (!Number.isSafeInteger(id) || id < 1) continue;
      observeDataStatType(dataStatTypeObservations, id, detail);
      const name = typeof detail.mainMuscleGroupName === 'string' ? detail.mainMuscleGroupName.trim() : '';
      if (!name) continue;
      const existing = byId.get(id);
      if (existing && existing !== name) {
        byId.delete(id);
        conflicts.add(id);
      } else if (!conflicts.has(id)) {
        byId.set(id, name);
      }
    }

    for (const exercise of chunk) {
      if (conflicts.has(exercise.id)) {
        exercise.mainMuscleGroupStatus = 'conflict';
        continue;
      }
      const name = byId.get(exercise.id);
      if (!name) {
        exercise.mainMuscleGroupStatus = 'missing';
        continue;
      }
      exercise.mainMuscleGroupName = name;
      exercise.mainMuscleGroupStatus = 'available';
    }
  }
}

export function getConfirmedExerciseName(catalog, exerciseId) {
  const name = catalog.exercisesById.get(exerciseId);
  if (name) return name;
  if (catalog.catalogStatus === 'partial') {
    const failedNames = catalog.incompleteCategories.map((item) => item.category).join(', ');
    throw new Error(`ID ${exerciseId} nie występuje w otrzymanych wynikach, ale katalog jest niekompletny (${failedNames}). Nie można potwierdzić, czy to ćwiczenie znajduje się w pominiętej kategorii. Ponów pobieranie katalogu przed podglądem lub zapisem.`);
  }
  throw new Error(`ID ${exerciseId} nie występuje w aktualnym katalogu tego profilu i urządzenia. Ponownie wyszukaj ćwiczenie.`);
}


// Presentation-only recovery for groups absent from returned categories.
export async function recoverSavedPresentationNames(ids, fetchDetails, assertCurrent) {
  if (!Array.isArray(ids) || ids.length > 50 || ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) throw Error('Invalid bounded saved-name identities.');
  const names = new Map();
  if (!ids.length) return names;
  await assertCurrent();
  let response;
  try { response = await fetchDetails([...ids]); } catch { await assertCurrent(); return names; }
  await assertCurrent();
  const own=(o,k)=>{const d=Object.getOwnPropertyDescriptor(o,k);return d && d.enumerable && Object.hasOwn(d,'value') ? {value:d.value} : d ? {invalid:true} : null;};
  if (!response || typeof response !== 'object') return names;
  const data=own(response,'data');
  if (!data || data.invalid || !Array.isArray(data.value) || data.value.length > 1000) return names;
  const rows=data.value;
  if(Reflect.ownKeys(rows).length!==rows.length+1)return names;
  const observed=new Map(),tainted=new Set(),wanted=new Set(ids);
  for(let i=0;i<rows.length;i++){
    const cell=own(rows,String(i));if(!cell||cell.invalid)return new Map();
    const row=cell.value;if(!row||typeof row!=='object'||Array.isArray(row)||![Object.prototype,null].includes(Object.getPrototypeOf(row)))continue;
    const aliases=['id','groupId','actionLibraryGroupId'].map(k=>own(row,k)).filter(Boolean);
    const positive=aliases.filter(x=>!x.invalid&&Number.isSafeInteger(x.value)&&x.value>0).map(x=>x.value);
    if(!positive.length)continue;
    if(aliases.some(x=>x.invalid||!Number.isSafeInteger(x.value)||x.value<=0)||new Set(positive).size!==1){for(const id of positive)tainted.add(id);continue;}
    const id=positive[0];if(!wanted.has(id))continue;
    if(observed.has(id)){tainted.add(id);continue;}
    observed.set(id,null);
    const fields=['title','name'].map(k=>own(row,k)).filter(Boolean);
    if(!fields.length||fields.some(x=>x.invalid||typeof x.value!=='string'||!x.value.trim()||x.value.length>4096||/[\u0000-\u001f\u007f]/.test(x.value)))continue;
    const labels=fields.map(x=>x.value.trim());if(new Set(labels).size!==1)continue;
    const type=own(row,'dataStatType');
    const metadata=type ? type.invalid||!Number.isSafeInteger(type.value) ? {dataStatTypeStatus:'invalid'} : {dataStatType:type.value,dataStatTypeStatus:'available'} : {};
    observed.set(id,{name:labels[0],...metadata});
  }
  for(const [id,value]of observed)if(value&&!tainted.has(id))names.set(id,{...value,source:'unique-exact-saved-group-detail',status:'confirmed-detail-read-only',executableAllowed:false});
  return names;
}

export function collectSavedPresentationNameIds(actions, catalog) {
  if(!Array.isArray(actions)||actions.length>1000)return [];
  const own=(o,k)=>{const d=Object.getOwnPropertyDescriptor(o,k);return d&&Object.hasOwn(d,'value')?d.value:undefined;};
  const ids=new Set();
  for(let i=0;i<actions.length;i++){
    const a=own(actions,String(i));if(!a||typeof a!=='object'||Array.isArray(a))continue;
    const values=[];let invalid=false;
    for(const k of ['groupId','actionLibraryGroupId']){const d=Object.getOwnPropertyDescriptor(a,k);if(!d)continue;if(!Object.hasOwn(d,'value')){invalid=true;continue;}const raw=d.value;const id=typeof raw==='number'?raw:typeof raw==='string'&&/^\d+$/.test(raw)?Number(raw):NaN;if(!Number.isSafeInteger(id)||id<=0)invalid=true;else values.push(id);}
    if(invalid||!values.length||new Set(values).size!==1)continue;
    const id=values[0];if(catalog?.exercisesById?.get(id)||catalog?.exerciseRecordsById?.get(id)?.title||catalog?.diagnosticRecordsById?.has(id))continue;
    ids.add(id);if(ids.size===50)break;
  }
  return [...ids];
}

function createPresetDisplayInspection() {
 const resourceBound=Symbol('preset-display-resource-bound'),cache=new WeakMap(),prototypes=new WeakMap();let cells=0,nodes=0,exhausted=false;
 const fail=()=>{exhausted=true;throw resourceBound;};
 const prototype=x=>{if(prototypes.has(x))return prototypes.get(x);if(++nodes>512)fail();const value=Object.getPrototypeOf(x);prototypes.set(x,value);return value;};
 const own=(x,k)=>{let fields=cache.get(x);if(fields?.has(k))return fields.get(k);if(++cells>1024)fail();const d=Object.getOwnPropertyDescriptor(x,k),cell=!d?{status:'absent'}:!Object.hasOwn(d,'value')?{status:'accessor'}:{status:'present',value:d.value};if(!fields){fields=new Map();cache.set(x,fields);}fields.set(k,cell);return cell;};
 return {resourceBound,own,plain:x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(prototype(x)),array:x=>Array.isArray(x)&&prototype(x)===Array.prototype,get exhausted(){return exhausted;}};
}
const unknownPresetDisplay=reason=>({status:'unknown',reason,readOnly:true,displayOnly:true,executableAllowed:false,nativeLoadSemantics:'unknown',selectedPresetBinding:'not-provided',offers:[]});
export function normalizeLiteralTemplatePresetDisplayOffers(detailEnvelope,batchEnvelope,scope) {
 return inspectLiteralTemplatePresetDisplayOffers(detailEnvelope,batchEnvelope,scope,createPresetDisplayInspection());
}
// Bounded multi-variant display inspection shares the SAME envelope descriptor/node budget.
export function normalizeLiteralTemplatePresetDisplayVariants(detailEnvelope,batchEnvelope,{exerciseId,variantIds}={}) {
 if(!Array.isArray(variantIds)||variantIds.length>100||variantIds.some(id=>typeof id!=='number'||!Number.isSafeInteger(id)||id<1)||new Set(variantIds).size!==variantIds.length)throw new TypeError('Bounded unique display variants required.');
 const inspection=createPresetDisplayInspection();
 return variantIds.map(variantId=>({variantId,result:inspection.exhausted?unknownPresetDisplay('resource-bound'):inspectLiteralTemplatePresetDisplayOffers(detailEnvelope,batchEnvelope,{exerciseId,variantId},inspection)}));
}
// Display-only literal templatePresetList namespace; never an executable preset candidate.
function inspectLiteralTemplatePresetDisplayOffers(detailEnvelope, batchEnvelope, scope, inspection) {
 const unknown=unknownPresetDisplay;
 const plain=inspection.plain;
 const positive=x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
 const invalidInput=Symbol('invalid-display-input');const fail=()=>{throw invalidInput;};
 const own=(object,key)=>{const cell=inspection.own(object,key);if(cell.status!=='present')fail('missing-or-accessor-field');return cell.value;};
 const array=x=>{if(!inspection.array(x))fail('invalid-array');return x;};
 const bounded=(x,max)=>{array(x);if(x.length>max)throw inspection.resourceBound;return x;};
 const label=x=>{if(typeof x!=='string'||x.length>128||!x.trim()||/[\u0000-\u001f\u007f-\u009f]/.test(x))fail('invalid-name');return x.trim();};
 try {
  if(!plain(scope))return unknown('invalid-scope');
  const exerciseId=own(scope,'exerciseId'),variantId=own(scope,'variantId');if(!positive(exerciseId)||!positive(variantId))return unknown('invalid-scope');
  const data=envelope=>{if(!plain(envelope)||own(envelope,'code')!==0)fail('invalid-envelope');return own(envelope,'data');};
  const detail=data(detailEnvelope),batch=bounded(data(batchEnvelope),128);if(!plain(detail)||own(detail,'id')!==exerciseId)return unknown('group-scope-mismatch');
  const matches=[];for(let i=0;i<batch.length;i++){const row=own(batch,String(i));if(!plain(row))return unknown('invalid-batch-row');if(own(row,'id')===exerciseId)matches.push(row);}if(matches.length!==1)return unknown('batch-scope-ambiguous-or-missing');
  const read=(group,source)=>{
   const variants=bounded(own(group,'actionLibraryList'),128);let found=0;
   for(let i=0;i<variants.length;i++){const row=own(variants,String(i));if(!plain(row))fail('invalid-variant');const id=own(row,'id');if(!positive(id))fail('invalid-variant');if(id===variantId)found++;}if(found!==1)fail('variant-scope-ambiguous-or-missing');
   const list=bounded(own(group,'templatePresetList'),32),ids=new Set(),names=new Set(),offers=[];if(!list.length)fail('empty-list');
   for(let i=0;i<list.length;i++){
    const row=own(list,String(i));if(!plain(row))fail('invalid-item');const id=own(row,'id'),name=label(own(row,'name'));if(!positive(id))fail('invalid-selector-id');
    const canonical=name.toLocaleLowerCase('en-US').replace(/\s+/g,' ');if(ids.has(id)||names.has(canonical))fail('duplicate-or-colliding-item');ids.add(id);names.add(canonical);
    for(const key of ['templatePresetId','preset_id'])if(inspection.own(row,key).status!=='absent')fail('unsupported-item-alias');
    const auxiliary=inspection.own(row,'presetId');let auxiliaryPresetId={status:'absent',semantics:'unknown'};
    if(auxiliary.status!=='absent'){if(auxiliary.status!=='present'||!positive(auxiliary.value))fail('invalid-auxiliary');auxiliaryPresetId={status:'reported',rawValue:auxiliary.value,semantics:'unknown'};}
    offers.push({reportedItemId:id,reportedName:name,auxiliaryPresetId,sourcePath:source+'.templatePresetList['+i+']'});
   }
   return offers;
  };
  const left=read(detail,'detail'),right=read(matches[0],'batch');if(left.length!==right.length)return unknown('cross-source-disagreement');
  const byId=new Map(right.map(x=>[x.reportedItemId,x]));const offers=[];
  for(const row of left){const other=byId.get(row.reportedItemId);if(!other||row.reportedName!==other.reportedName||JSON.stringify(row.auxiliaryPresetId)!==JSON.stringify(other.auxiliaryPresetId))return unknown('cross-source-disagreement');offers.push({reportedItemId:row.reportedItemId,reportedName:row.reportedName,auxiliaryPresetId:row.auxiliaryPresetId,sourcePaths:[row.sourcePath,other.sourcePath]});}
  const result={status:'concordant-contextual-display-only',readOnly:true,displayOnly:true,executableAllowed:false,nativeLoadSemantics:'unknown',selectedPresetBinding:'not-provided',exerciseId,variantId,offers};return Buffer.byteLength(JSON.stringify(result),'utf8')<=16384?result:unknown('resource-bound');
 } catch(error) {return unknown(error===inspection.resourceBound?'resource-bound':'invalid-input');}
}

// Diagnostic only: explicit preset aliases are reported, never promoted to native-load evidence.
export function projectGroupPresetApiDiagnostic(detailEnvelope,batchEnvelope,{exerciseId,variantId}={}) {
 const inspection=createPresetDisplayInspection(),plain=inspection.plain,own=inspection.own,resourceBound=inspection.resourceBound;
 const id=x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0?x:typeof x==='string'&&/^[1-9]\d{0,15}$/.test(x)&&Number.isSafeInteger(Number(x))?Number(x):null;
 const rejectedAliases=[],contextualRecords=[];let rejectionOverflow=false,contextualOverflow=false;
 const reject=(path,field,cell,reason)=>{if(rejectedAliases.length>=32){rejectionOverflow=true;return;}const valueType=cell.status!=='present'?cell.status:cell.value===null?'null':Array.isArray(cell.value)?'array':typeof cell.value;rejectedAliases.push({sourcePath:path,field,valueType,reason});};
 const base={schemaVersion:1,outputScope:'group-api-only',readOnly:true,executableAllowed:false,nativeLoadSemantics:'unknown',recordedNameQualification:'unqualified-schema',exerciseId:Number.isSafeInteger(exerciseId)&&exerciseId>0?exerciseId:null,...(variantId!==undefined?{variantId:Number.isSafeInteger(variantId)&&variantId>0?variantId:null}:{}),savedObservations:{status:'not-requested',programsScanned:0},rejectedAliases,contextualRecords,candidates:[]};
 const finish=value=>{if(Buffer.byteLength(JSON.stringify(value),'utf8')>16384&&value.contextualDisplayOffers){value.contextualDisplayOffers=unknownPresetDisplay('resource-bound');value.partial=true;value.status='resource-bound';}while(Buffer.byteLength(JSON.stringify(value),'utf8')>16384&&(value.contextualRecords.length||value.rejectedAliases.length||value.candidates.length)){if(value.contextualRecords.length)value.contextualRecords.pop();else if(value.rejectedAliases.length)value.rejectedAliases.pop();else value.candidates.pop();value.partial=true;value.status='resource-bound';}if(value.status==='resource-bound'&&value.contextualDisplayOffers)value.contextualDisplayOffers=unknownPresetDisplay('resource-bound');return value;};
 try{
  if(id(exerciseId)!==exerciseId||variantId!==undefined&&id(variantId)!==variantId)throw Error('Invalid scope');
  const data=envelope=>plain(envelope)&&own(envelope,'code').value===0?own(envelope,'data').value:undefined;
  const detail=data(detailEnvelope),batch=data(batchEnvelope);
  const detailMatched=plain(detail)&&id(own(detail,'id').value)===exerciseId;
  if(!inspection.array(batch)||batch.length>128)return finish({...base,status:'group-scope-unqualified',groupScope:'invalid-batch',partial:true});
  const matches=[];for(let i=0;i<batch.length;i++){const d=own(batch,String(i));if(d.status!=='present'||!plain(d.value))return finish({...base,status:'group-scope-unqualified',groupScope:'invalid-batch-row',partial:true});if(id(own(d.value,'id').value)===exerciseId)matches.push(d.value);}
  if(!detailMatched||matches.length!==1)return finish({...base,status:'group-scope-unqualified',groupScope:!detailMatched?'detail-unreported-invalid-or-mismatched':matches.length?'batch-ambiguous':'batch-unreported-or-mismatched',partial:true});
  const roots=[{value:detail,path:'detail',source:'detail',variant:null},{value:matches[0],path:'batch',source:'batch',variant:null}],queue=roots.map(x=>({...x,depth:0})),seen=new Set(),candidates=[];
  let visited=0,partial=false,invalid=false,variantMatches={detail:0,batch:0},candidateBytes=0;
  const ids=['templatePresetId','presetId','preset_id'],names=['templatePresetName','presetName','presetLabel','presetTitle','preset_name'];
  while(queue.length){
   if(visited++>=512){partial=true;break;}const {value,path,source,variant,depth,contextualPresetItem}=queue.shift();if(!plain(value)||seen.has(value)){invalid=true;continue;}seen.add(value);
   const idCells=ids.map(field=>({field,...own(value,field)})),iv=idCells.filter(x=>x.status!=='absent'),nv=names.map(field=>({field,...own(value,field)})).filter(x=>x.status!=='absent');
   if(iv.length||nv.length){
    const parsed=iv.map(x=>x.status==='present'?id(x.value):null),labels=nv.map(x=>x.status==='present'&&typeof x.value==='string'&&x.value.length<=128?x.value.trim()||null:null);
    const valid=parsed.length&&labels.length&&parsed.every(x=>x!==null)&&labels.every(x=>x!==null)&&new Set(parsed).size===1&&new Set(labels.map(x=>x.toLocaleLowerCase('en-US').replace(/\s+/g,' '))).size===1;
    if(!valid){invalid=true;
      if(!iv.length)reject(path,'presetId',{status:'absent'},'missing-id-alias');
      if(!nv.length)reject(path,'presetName',{status:'absent'},'missing-name-alias');
      for(let i=0;i<iv.length;i++)if(parsed[i]===null)reject(path,iv[i].field,iv[i],'invalid-positive-id');
      for(let i=0;i<nv.length;i++)if(labels[i]===null)reject(path,nv[i].field,nv[i],'invalid-nonempty-bounded-name');
      if(parsed.every(x=>x!==null)&&new Set(parsed).size>1)for(const cell of iv)reject(path,cell.field,cell,'conflicting-id-aliases');
      if(labels.every(x=>x!==null)&&new Set(labels.map(x=>x.toLocaleLowerCase('en-US').replace(/\s+/g,' '))).size>1)for(const cell of nv)reject(path,cell.field,cell,'conflicting-name-aliases');
     }else{const candidate={presetId:parsed[0],reportedName:labels[0],sourcePath:path,scope:variant===variantId&&variantId!==undefined?'matching-variant-reported-only':'group-or-variant-unconfirmed',readOnly:true,executableAllowed:false,qualification:'unqualified-schema'};const bytes=Buffer.byteLength(JSON.stringify(candidate),'utf8')+1;if(candidates.length<32&&candidateBytes+bytes<=14336){candidates.push(candidate);candidateBytes+=bytes;}else partial=true;}
   }
   if(contextualPresetItem){
    if(contextualRecords.length>=16)contextualOverflow=true;
    else{
     const association=iv.map(cell=>cell.status==='present'?id(cell.value):null);
     const qualifiedAssociation=association.length>0&&association.every(value=>value!==null)&&new Set(association).size===1;
     const fields=['name','title','displayName','label','text'].map(field=>{
      const cell=own(value,field),valueType=cell.status!=='present'?cell.status:cell.value===null?'null':Array.isArray(cell.value)?'array':typeof cell.value;
      const status=cell.status!=='present'?cell.status:typeof cell.value!=='string'?'invalid-type':cell.value.length>128?'oversized':/[\u0000-\u001f\u007f-\u009f]/.test(cell.value)?'control-characters':!cell.value.trim()?'empty':'reported';
      return {field,valueType,status,...(status==='reported'?{reportedLabel:cell.value}:{})};
     });
     const rawIdFields=[...idCells,{field:'id',...own(value,'id')}].map(cell=>{
      const valueType=cell.status!=='present'?cell.status:cell.value===null?'null':Array.isArray(cell.value)?'array':typeof cell.value;
      const status=cell.status!=='present'?cell.status:cell.value===null||typeof cell.value==='boolean'?'reported':typeof cell.value==='number'?(Number.isSafeInteger(cell.value)?'reported':'invalid-number'):typeof cell.value==='string'?(cell.value.length>128?'oversized':/[\u0000-\u001f\u007f-\u009f]/.test(cell.value)?'control-characters':'reported'):'invalid-type';
      return {field:cell.field,sourcePath:`${path}.${cell.field}`,ownStatus:cell.status,valueType,status,...(status==='reported'?{rawValue:cell.value}:{})};
     });
     contextualRecords.push({source,sourcePath:path,qualification:'unqualified-schema',executableAllowed:false,idAssociation:qualifiedAssociation?{status:'explicit-alias-reported-only',presetId:association[0]}:{status:iv.length?'invalid-or-conflicting-explicit-alias':'unreported-explicit-alias'},fields,rawIdFields});
    }
   }
   for(const key of ['presets','presetList','templatePresets','templatePresetList','actionLibraryList']){
    const d=own(value,key);if(d.status==='absent')continue;if(d.status!=='present'){invalid=true;reject(path,key,d,'invalid-child-array');continue;}const children=d.value;
    if(!inspection.array(children)||children.length>128){invalid=true;reject(path,key,d,'invalid-child-array');continue;}
    if(depth>=6){partial=true;continue;}
    for(let i=0;i<children.length;i++){
     const cell=own(children,String(i));if(cell.status!=='present'||!plain(cell.value)){invalid=true;reject(`${path}.${key}[${i}]`,key,cell,'invalid-child-row');continue;}let nextVariant=variant;
     if(key==='actionLibraryList'){const variantCell=own(cell.value,'id');nextVariant=id(variantCell.value);if(nextVariant===null){invalid=true;reject(`${path}.${key}[${i}]`,'id',variantCell,'invalid-positive-variant-id');continue;}if(variantId!==undefined&&nextVariant!==variantId)continue;if(nextVariant===variantId)variantMatches[source]++;}
     if(queue.length>=512){partial=true;break;}queue.push({value:cell.value,path:`${path}.${key}[${i}]`,source,variant:nextVariant,depth:depth+1,contextualPresetItem:key==='templatePresetList'});
    }
   }
  }
  const normalize=name=>name.toLocaleLowerCase('en-US').replace(/\s+/g,' ');
  let reportedAliasConflict=false;
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){const a=candidates[i],b=candidates[j],sameName=normalize(a.reportedName)===normalize(b.reportedName);if(a.presetId===b.presetId&&!sameName||a.presetId!==b.presetId&&sameName)reportedAliasConflict=true;}
  const totalVariantReferences=variantMatches.detail+variantMatches.batch;
   const variantScope=variantId===undefined?'not-requested':variantMatches.detail>1||variantMatches.batch>1?'multiple-reported-matches':totalVariantReferences===2?'matching-references-across-sources':totalVariantReferences===1?'one-reported-match':'unreported-or-mismatched';
   if(rejectionOverflow||contextualOverflow)partial=true;
  return finish({...base,contextualDisplayOffers:partial||rejectionOverflow||contextualOverflow||inspection.exhausted?unknownPresetDisplay('resource-bound'):inspectLiteralTemplatePresetDisplayOffers(detailEnvelope,batchEnvelope,{exerciseId,variantId},inspection),status:partial?'resource-bound':reportedAliasConflict?'reported-alias-conflict':invalid?'reported-with-invalid-aliases':'reported-only-unqualified-schema',groupScope:'exact-detail-and-single-batch-match',variantScope,variantReferences:{...variantMatches,total:totalVariantReferences,duplicateWithinSource:variantMatches.detail>1||variantMatches.batch>1},reportedAliasConflict,partial:partial||invalid||reportedAliasConflict,candidates});
 }catch(error){return finish({...base,status:error===resourceBound?'resource-bound':'invalid-diagnostic-input',groupScope:'unqualified',partial:true});}
}
