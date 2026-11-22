import { activeAccessoryConfirmations } from './accessory-requirement-confirmation.mjs';
import { boundedCycleDigest } from './bounded-cycle-json.mjs';
import { mapEquipmentValues } from './equipment-inventory.mjs';
import { accessoryByName, inferAccessoryRequirement } from './accessory-name-map.mjs';

function positiveId(value) {
  const raw = value && typeof value === 'object'
    ? value.accessoryId ?? value.accessory_id ?? value.id ?? value.value ?? accessoryByName(value.name)?.ids[0]
    : value;
  const id = typeof raw === 'string' ? (/^\d+$/.test(raw.trim()) ? Number(raw.trim()) : accessoryByName(raw)?.ids[0]) : raw;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// When the catalogue row is missing or its accessory list is unreadable, fill
// it from the local accessory map (name and ID) or a safe default so the plan
// check reports an assumption instead of stopping.
function withInferredRequirements(record, exercise) {
  const usable = record?.equipmentMetadataAvailable === true && Array.isArray(record.requiredAccessoryIds)
    && record.requiredAccessoryIds.every(value => positiveId(value) !== null);
  if (usable) return record;
  const source = record ?? { title: exercise?.title ?? exercise?.name, category: exercise?.category, kind: exercise?.kind,
    ...(exercise?.section === 'stretching' || exercise?.section === 'warmup' ? { category: exercise.section === 'stretching' ? 'Stretch' : 'Warmup' } : {}) };
  const inferred = inferAccessoryRequirement(source);
  return { ...(record ?? {}), title: record?.title ?? source.title, equipmentMetadataAvailable: true, requiredAccessoryIds: inferred.ids,
    equipmentMetadataStatus: inferred.status, equipmentMetadataInference: { source: inferred.source, observedStatus: record?.equipmentMetadataStatus ?? 'catalog-row-missing' } };
}

/**
 * Prefer a complete account-provided inventory. When the account does not
 * expose one, use the user's explicit complete/partial confirmation for this
 * plan. The caller may pass ephemeral intake answers; this function never
 * persists them.
 */
export function resolvePlanEquipmentInventory(inventory, profileData = {}) {
  if (inventory?.source === 'speediance-account' && inventory.ownershipKnown === true) return inventory;

  const status = profileData?.equipmentOwnershipStatus;
  const names = profileData?.ownedEquipmentNames;
  if (!['complete', 'partial'].includes(status) || !Array.isArray(names)) return inventory;

  const catalog = Array.isArray(inventory?.catalog) ? inventory.catalog : [];
  const mapped = mapEquipmentValues(names, catalog, { source: 'user-confirmed-local' });
  const complete = status === 'complete' && mapped.valid && mapped.unresolved.length === 0;
  const byId = new Map(catalog.map((item) => [item.id, item]));
  return {
    ...inventory,
    source: 'user-confirmed-local',
    ownershipKnown: complete,
    ownershipStatus: complete ? 'complete' : status === 'complete' ? 'partial' : status,
    ownedAccessories: mapped.ids.map((id) => byId.get(id)).filter(Boolean),
    unresolved: mapped.unresolved,
    accessoryNameGroups: mapped.nameGroups,
    ...(complete ? {} : { confirmationNote: 'Wykorzystano potwierdzenie użytkownika. Nierozpoznane nazwy pozostają niepotwierdzone.' })
  };
}

function exerciseRecords(catalog) {
  if (Array.isArray(catalog)) return catalog;
  if (catalog && Array.isArray(catalog.exercises)) return catalog.exercises;
  return null;
}

function accessoryName(id, inventory) {
  const catalog = Array.isArray(inventory?.catalog) ? inventory.catalog : [];
  const item = catalog.find((candidate) => positiveId(candidate) === id);
  return typeof item?.name === 'string' && item.name.trim()
    ? item.name.trim()
    : `Akcesorium ID ${id}`;
}

/**
 * Check each planned catalog exercise against its declared accessory needs and
 * a confirmed account or user inventory. A complete inventory can prove an
 * accessory is missing; partial/unknown inventory can only require review.
 * This helper is deterministic and has no account or filesystem access.
 */
function denseRequirementArray(value, limit) {
  if (!Array.isArray(value) || value.length > limit || Object.keys(value).length !== value.length) return false;
  for (let i=0;i<value.length;i++) if (!Object.hasOwn(value,i)) return false;
  return true;
}
export function resolveOccurrenceAccessoryRequirements(record, exercise, trustedContext) {
  if (!record || !trustedContext) return record;
  const { profile, accountFingerprint, deviceType, store, now, verifiedVariantScopes } = trustedContext;
  if (deviceType !== 1 || !Number.isSafeInteger(now) || now < 0 || typeof profile !== 'string' || !/^[a-f0-9]{64}$/.test(accountFingerprint ?? '')) throw new Error('Invalid trusted accessory requirement context.');
  const active = activeAccessoryConfirmations(store, now);
  const groupId = exercise?.id ?? exercise?.groupId, actionLibraryId = exercise?.actionLibraryId;
  const matches = active.records.filter(row => row.scope.profile === profile && row.scope.accountFingerprint === accountFingerprint && row.scope.deviceType === deviceType && row.scope.groupId === groupId && row.scope.actionLibraryId === actionLibraryId && row.scope.rawRequirementDigest === record.rawRequirementDigest);
  if (!matches.length) return record;
  if (matches.length !== 1 || record.rawRequirementDigestBindable !== true || record.reportedValidRequirementSetsComplete !== true || !denseRequirementArray(record.reportedValidRequirementSets, 256) || !denseRequirementArray(verifiedVariantScopes, 364) || !verifiedVariantScopes.some(row => row.groupId === groupId && row.actionLibraryId === actionLibraryId && row.rawRequirementDigest === record.rawRequirementDigest && row.executableAllowed === true)) throw new Error('Exact accessory requirement confirmation lacks complete fresh scope evidence.');
  const confirmation = matches[0], required = confirmation.requiredAccessoryIds;
  for (const reported of record.reportedValidRequirementSets) {
    if (!denseRequirementArray(reported, 128) || new Set(reported).size !== reported.length || reported.some(id => !Number.isSafeInteger(id) || id <= 0) || reported.some(id => !required.includes(id))) throw new Error('Accessory confirmation contradicts independently valid reported requirements.');
  }
  if (record.equipmentMetadataAvailable === true) {
    const reported = [...new Set(record.requiredAccessoryIds)].sort((a,b) => a-b);
    if (JSON.stringify(reported) !== JSON.stringify(required)) throw new Error('Accessory confirmation contradicts authoritative catalogue requirements.');
    return record;
  }
  return { ...record, equipmentMetadataAvailable: true, requiredAccessoryIds: [...required], equipmentMetadataStatus: required.length ? 'valid-ids' : 'valid-empty', requirementConfirmation: { source: 'user-confirmed-complete', id: confirmation.id, groupId, actionLibraryId, rawRequirementDigest: record.rawRequirementDigest, createdAt: confirmation.createdAt, expiresAt: confirmation.expiresAt, activeStoreDigest: active.digest } };
}
export function validatePlanRequiredAccessories({ plan, catalog, inventory, requirementConfirmationContext } = {}) {
  const blocks = [];
  const warnings = [];
  const notices = [];
  const exercises = Array.isArray(plan?.exercises) ? plan.exercises : null;
  const records = exerciseRecords(catalog);

  if (!exercises?.length) {
    warnings.push({
      code: 'planned_exercises_missing',
      reason: 'Nie można sprawdzić akcesoriów bez niepustej listy planowanych ćwiczeń.'
    });
  }
  if (!records) {
    warnings.push({
      code: 'exercise_catalog_unavailable',
      reason: 'Brak bieżącego katalogu ćwiczeń do sprawdzenia wymaganych akcesoriów.'
    });
  }

  const byExerciseId = new Map();
  for (const record of records || []) {
    const id = record?.id ?? record?.groupId;
    if (Number.isSafeInteger(id) && id > 0 && !byExerciseId.has(id)) byExerciseId.set(id, record);
  }

  const ownedIds = new Set();
  let malformedOwnedItem = false;
  const ownedItems = Array.isArray(inventory?.ownedAccessories)
    ? inventory.ownedAccessories
    : Array.isArray(inventory?.ownedAccessoryIds)
      ? inventory.ownedAccessoryIds
      : [];
  for (const item of ownedItems) {
    const id = positiveId(item);
    if (id === null) malformedOwnedItem = true;
    else ownedIds.add(id);
  }
  if (malformedOwnedItem) {
    warnings.push({
      code: 'inventory_entry_unresolved',
      reason: 'Co najmniej jedna pozycja inwentarza nie ma prawidłowego identyfikatora; nie użyto jej do potwierdzenia własności.'
    });
  }

  const completeInventory = inventory?.ownershipKnown === true
    && inventory?.ownershipStatus === 'complete'
    && (!Array.isArray(inventory?.unresolved) || inventory.unresolved.length === 0);

  for (const exercise of exercises || []) {
    const exerciseId = exercise?.id ?? exercise?.groupId;
    const exerciseName = typeof exercise?.title === 'string'
      ? exercise.title
      : typeof exercise?.name === 'string'
        ? exercise.name
        : null;
    const resolved = resolveOccurrenceAccessoryRequirements(Number.isSafeInteger(exerciseId) ? byExerciseId.get(exerciseId) : null, exercise, requirementConfirmationContext);
    const record = withInferredRequirements(resolved, exercise);

    if (record.equipmentMetadataInference) {
      notices.push({
        code: 'exercise_accessory_metadata_inferred',
        exerciseId: Number.isSafeInteger(exerciseId) ? exerciseId : null,
        exerciseName: record.title || exerciseName || `Ćwiczenie ID ${exerciseId}`,
        requiredAccessoryIds: record.requiredAccessoryIds,
        inferenceSource: record.equipmentMetadataInference.source,
        reason: 'Katalog nie podał pełnej listy akcesoriów; uzupełniono ją z lokalnej mapy akcesoriów albo bezpiecznym założeniem. To informacja, nie blokada.'
      });
    }

    const parsedRequiredIds = record.requiredAccessoryIds.map(positiveId);
    const requiredIds = [...new Set(parsedRequiredIds.filter((id) => id !== null))];
    if (parsedRequiredIds.some((id) => id === null)) {
      warnings.push({
        code: 'required_accessory_id_unresolved',
        exerciseId,
        exerciseName: record.title || exerciseName || `Ćwiczenie ID ${exerciseId}`,
        reason: 'Co najmniej jedno wymagane akcesorium nie ma prawidłowego ID; nie można potwierdzić dostępności.'
      });
    }

    for (const accessoryId of requiredIds) {
      if (ownedIds.has(accessoryId)) continue;
      const details = {
        exerciseId,
        exerciseName: record.title || exerciseName || `Ćwiczenie ID ${exerciseId}`,
        accessoryId,
        accessoryName: accessoryName(accessoryId, inventory)
      };
      if (completeInventory) {
        blocks.push({
          ...details,
          code: 'required_accessory_missing',
          reason: 'Pełny, potwierdzony inwentarz nie zawiera akcesorium wymaganego przez ćwiczenie.'
        });
      } else {
        warnings.push({
          ...details,
          code: 'required_accessory_ownership_unknown',
          reason: 'Nie można potwierdzić, czy użytkownik ma wymagane akcesorium; zapytaj albo wybierz potwierdzoną alternatywę.'
        });
      }
    }
  }

  const requirements = (exercises || []).map((exercise, occurrenceIndex) => {
    const catalogId = exercise?.id ?? exercise?.groupId;
    const record = withInferredRequirements(resolveOccurrenceAccessoryRequirements(byExerciseId.get(catalogId), exercise, requirementConfirmationContext), exercise);
    const complete = record?.equipmentMetadataAvailable === true && Array.isArray(record.requiredAccessoryIds)
      && record.requiredAccessoryIds.length <= 128 && record.requiredAccessoryIds.every(value => positiveId(value) !== null);
    const requiredAccessoryIds = complete ? [...new Set(record.requiredAccessoryIds.map(positiveId))].sort((a,b) => a-b) : [];
    return { occurrenceIndex, catalogId: Number.isSafeInteger(catalogId) ? catalogId : null,
      entryId: exercise?.entryId ?? catalogId ?? null, actionLibraryId: exercise?.actionLibraryId ?? null, section: exercise?.section ?? 'main',
      metadataStatus: complete ? requiredAccessoryIds.length ? 'valid-ids' : 'valid-empty' : ['missing','invalid','conflict'].includes(record?.equipmentMetadataStatus) ? record.equipmentMetadataStatus : 'unknown',
      requiredAccessoryIds, setupStatus: 'unknown', ...(record?.requirementConfirmation ? { requirementConfirmation: record.requirementConfirmation } : {}),
      catalogMetadataDigest: boundedCycleDigest({ catalogId, status: record?.equipmentMetadataStatus ?? (complete ? 'legacy-validated' : 'unknown'), ids: requiredAccessoryIds, provenance: record?.equipmentMetadataProvenance ?? [] }, 1_000_000) };
  });
  const accessoryRequirements = { version: 1, inventoryStatus: completeInventory ? 'complete' : inventory?.ownershipStatus || 'unknown',
    inventorySource: ['speediance-account','user-confirmed-local'].includes(inventory?.source) ? inventory.source : 'unknown',
    inventoryDigest: boundedCycleDigest({ ownedIds: [...ownedIds].sort((a,b) => a-b), completeInventory,
      unresolved: inventory?.unresolved ?? [], source: inventory?.source ?? 'unknown', nameGroups: inventory?.accessoryNameGroups ?? [] }, 1_000_000), requirements };
  boundedCycleDigest(accessoryRequirements, 1_000_000);
  const status = blocks.length ? 'blocked' : warnings.length ? 'review-required' : 'allowed';
  return {
    status,
    canProceed: status === 'allowed',
    blocks,
    warnings,
    notices,
    checkedExerciseCount: exercises?.length ?? 0,
    accessoryRequirements,
    inventoryStatus: completeInventory ? 'complete' : inventory?.ownershipStatus || 'unknown'
  };
}
