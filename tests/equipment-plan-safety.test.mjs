import { deriveCycleAccessoryRotation } from '../plugin/training-cycle-prescription.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { resolvePlanEquipmentInventory, validatePlanRequiredAccessories } from '../plugin/equipment-plan-safety.mjs';

const catalog = [
  { id: 11, title: 'Cable Press', equipmentMetadataAvailable: true, requiredAccessoryIds: [2] },
  { id: 22, title: 'Barbell Squat', equipmentMetadataAvailable: true, requiredAccessoryIds: [1] },
  { id: 33, title: 'Bodyweight Squat', equipmentMetadataAvailable: true, requiredAccessoryIds: [] }
];
const inventoryCatalog = [
  { id: 1, name: 'Barbell' },
  { id: 2, name: 'Handles' }
];

test('actual public owned-equipment output preserves local name-group provenance', async () => {
  const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf("case 'speediance_get_owned_equipment': {");
  const end = source.indexOf("case 'speediance_get_exercise_presets':", start);
  const body = source.slice(start + "case 'speediance_get_owned_equipment': {".length, end).trim().replace(/}\s*$/, '');
  const groups = [{ name: 'Handles', ids: [2, 8], source: 'user-confirmed-local', resolution: 'catalog-name-group' }];
  const run = vm.runInNewContext(`(async () => { ${body} })`, {
    args: {}, resolveProfile: async () => 'synthetic', withProfileMutationLock: async (_profile, fn) => fn(),
    readOwnedEquipment: async () => ({ source: 'user-confirmed-local', ownershipKnown: true,
      ownedAccessories: [{ id: 2, name: 'Handles' }, { id: 8, name: 'Handles' }], accessoryNameGroups: groups }),
    groupAccessoriesByName: () => [{ name: 'Handles', ids: [2, 8] }]
  });
  assert.deepEqual((await run()).accessoryNameGroups, groups);
});

test('actual MCP approval intake fingerprint binds local catalog-name group IDs', () => {
  const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  const expression = source.match(/intakeFingerprint: (inventory\.source[\s\S]*?)\r?\n\s*: interview\.fingerprint,/);
  assert.ok(expression, 'actual validation fingerprint expression must be covered');
  const fingerprint = inventory => vm.runInNewContext(`${expression[1]}: interview.fingerprint`, { inventory, interview: { fingerprint: 'intake' }, createHash, JSON });
  const first = { source: 'user-confirmed-local', accessoryNameGroups: [{ name: 'Handles', ids: [2, 8], source: 'user-confirmed-local', resolution: 'catalog-name-group' }] };
  const changed = { ...first, accessoryNameGroups: [{ ...first.accessoryNameGroups[0], ids: [2, 9] }] };
  assert.notEqual(fingerprint(first), fingerprint(changed));
  assert.equal(fingerprint({ source: 'speediance-account' }), 'intake');
  assert.equal(fingerprint({ source: 'user-confirmed-local', accessoryNameGroups: [] }), 'intake');
});

test('local duplicate-name inventory passes required accessory IDs and exposes changed grouping', () => {
  const original = { source: 'unknown', ownershipKnown: false, ownedAccessories: [], catalog: [{ id: 2, name: 'Handles' }, { id: 8, name: 'Handles' }] };
  const answers = { equipmentOwnershipStatus: 'complete', ownedEquipmentNames: ['Handles'] };
  const resolved = resolvePlanEquipmentInventory(original, answers);
  assert.deepEqual(resolved.ownedAccessories.map((item) => item.id), [2, 8]);
  assert.equal(resolved.accessoryNameGroups[0].resolution, 'catalog-name-group');
  assert.equal(validatePlanRequiredAccessories({ plan: { exercises: [{ id: 11 }] }, catalog: [{ id: 11, equipmentMetadataAvailable: true, requiredAccessoryIds: [8] }], inventory: resolved }).canProceed, true);
  const changed = resolvePlanEquipmentInventory({ ...original, catalog: [{ id: 2, name: 'Handles' }, { id: 8, name: 'Handles Pro' }] }, answers);
  assert.notDeepEqual(changed.accessoryNameGroups, resolved.accessoryNameGroups);
  assert.equal(validatePlanRequiredAccessories({ plan: { exercises: [{ id: 11 }] }, catalog: [{ id: 11, equipmentMetadataAvailable: true, requiredAccessoryIds: [8] }], inventory: changed }).canProceed, false);
  assert.deepEqual(original.ownedAccessories, []);
});

test('uses ephemeral user equipment answers when account ownership is unavailable without mutating inventory', () => {
  const inventory = {
    source: 'unknown',
    ownershipKnown: false,
    ownershipStatus: 'unknown',
    ownedAccessories: [],
    catalog: inventoryCatalog
  };
  const resolved = resolvePlanEquipmentInventory(inventory, {
    equipmentOwnershipStatus: 'partial',
    ownedEquipmentNames: ['Handles']
  });

  assert.equal(resolved.ownershipKnown, false);
  assert.equal(resolved.ownershipStatus, 'partial');
  assert.deepEqual(resolved.ownedAccessories.map(({ id }) => id), [2]);
  assert.deepEqual(inventory.ownedAccessories, []);
  assert.equal(inventory.ownershipStatus, 'unknown');
});

test('does not let an incomplete user confirmation replace a complete account inventory', () => {
  const inventory = {
    source: 'speediance-account',
    ownershipKnown: true,
    ownershipStatus: 'complete',
    ownedAccessories: [{ id: 1 }, { id: 2 }],
    catalog: inventoryCatalog
  };
  const resolved = resolvePlanEquipmentInventory(inventory, {
    equipmentOwnershipStatus: 'partial',
    ownedEquipmentNames: ['Handles']
  });

  assert.equal(resolved, inventory);
  assert.deepEqual(resolved.ownedAccessories.map(({ id }) => id), [1, 2]);
});

test('allows a plan when every required accessory is positively confirmed', () => {
  const result = validatePlanRequiredAccessories({
    plan: { exercises: [{ id: 11, title: 'Cable Press' }, { id: 22, title: 'Barbell Squat' }] },
    catalog,
    inventory: {
      ownershipKnown: true,
      ownershipStatus: 'complete',
      ownedAccessories: [{ id: 1 }, { accessoryId: 2 }],
      catalog: inventoryCatalog
    }
  });

  assert.equal(result.status, 'allowed');
  assert.equal(result.canProceed, true);
  assert.deepEqual(result.blocks, []);
  assert.deepEqual(result.warnings, []);
});

test('blocks an exercise when a complete confirmed inventory omits a required accessory', () => {
  const result = validatePlanRequiredAccessories({
    plan: { exercises: [{ id: 11, title: 'Cable Press' }] },
    catalog,
    inventory: {
      ownershipKnown: true,
      ownershipStatus: 'complete',
      ownedAccessories: [{ id: 1 }],
      catalog: inventoryCatalog
    }
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.canProceed, false);
  assert.deepEqual(result.blocks.map(({ exerciseId, accessoryId, accessoryName }) => [exerciseId, accessoryId, accessoryName]), [
    [11, 2, 'Handles']
  ]);
  assert.deepEqual(result.warnings, []);
});

test('requires review instead of claiming absence for partial inventory', () => {
  const result = validatePlanRequiredAccessories({
    plan: { exercises: [{ id: 11, title: 'Cable Press' }] },
    catalog,
    inventory: {
      ownershipKnown: false,
      ownershipStatus: 'partial',
      ownedAccessories: [{ id: 1 }],
      catalog: inventoryCatalog
    }
  });

  assert.equal(result.status, 'review-required');
  assert.equal(result.canProceed, false);
  assert.deepEqual(result.blocks, []);
  assert.equal(result.warnings[0].code, 'required_accessory_ownership_unknown');
});

test('requires review when inventory is unknown, while retaining positive confirmations', () => {
  const result = validatePlanRequiredAccessories({
    plan: { exercises: [{ id: 11, title: 'Cable Press' }, { id: 22, title: 'Barbell Squat' }] },
    catalog,
    inventory: {
      ownershipKnown: false,
      ownershipStatus: 'unknown',
      ownedAccessories: [{ id: 2 }],
      catalog: inventoryCatalog
    }
  });

  assert.equal(result.status, 'review-required');
  assert.deepEqual(result.blocks, []);
  assert.deepEqual(result.warnings.map(({ exerciseId, accessoryId }) => [exerciseId, accessoryId]), [[22, 1]]);
});

test('does not require a user inventory for an exercise whose catalog explicitly lists no accessories', () => {
  const result = validatePlanRequiredAccessories({
    plan: { exercises: [{ id: 33, title: 'Bodyweight Squat' }] },
    catalog,
    inventory: { ownershipKnown: false, ownershipStatus: 'unknown', ownedAccessories: [] }
  });

  assert.equal(result.status, 'allowed');
  assert.equal(result.canProceed, true);
});

test('infers missing catalog matches and incomplete accessory metadata without blocking', () => {
  const result = validatePlanRequiredAccessories({
    plan: { exercises: [{ id: 44, title: 'Unknown Exercise' }, { id: 55, title: 'Partial Metadata' }] },
    catalog: [
      { id: 55, title: 'Partial Metadata', equipmentMetadataAvailable: false, requiredAccessoryIds: [] }
    ],
    inventory: { ownershipKnown: true, ownershipStatus: 'complete', ownedAccessories: [{ id: 5 }] }
  });

  assert.equal(result.status, 'allowed');
  assert.deepEqual(result.notices.map(({ code, exerciseId }) => [code, exerciseId]), [
    ['exercise_accessory_metadata_inferred', 44],
    ['exercise_accessory_metadata_inferred', 55]
  ]);
});

test('blocks known missing accessories even if a different plan item is inferred', () => {
  const result = validatePlanRequiredAccessories({
    plan: { exercises: [{ id: 11, title: 'Cable Press' }, { id: 44, title: 'Unmatched Stretch', section: 'stretching' }] },
    catalog,
    inventory: { ownershipKnown: true, ownershipStatus: 'complete', ownedAccessories: [], catalog: inventoryCatalog }
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.canProceed, false);
  assert.equal(result.blocks.length, 1);
  assert.equal(result.notices[0].code, 'exercise_accessory_metadata_inferred');
});

test('invalid or absent plan/catalog inputs fail to review without mutating caller data', () => {
  const exercises = [{ id: 11, title: 'Cable Press' }];
  const plan = { exercises };
  const result = validatePlanRequiredAccessories({ plan, inventory: { ownershipStatus: 'unknown' } });

  assert.equal(result.status, 'review-required');
  assert.equal(result.canProceed, false);
  assert.deepEqual(exercises, [{ id: 11, title: 'Cable Press' }]);
  assert.equal(result.warnings[0].code, 'exercise_catalog_unavailable');
});

test('cycle accessory projection derives requirements and unknown setup independently from stable block prescriptions', () => {
 const safety = validatePlanRequiredAccessories({plan:{exercises:[{id:11}]},catalog,inventory:{ownershipKnown:true,ownershipStatus:'complete',ownedAccessoryIds:[2]}});
 const sessions=[{sessionId:'A',equipmentSafety:safety}];
 const facts={occurrences:[{date:'2026-10-12',occurrenceId:'a',sessionId:'A',week:1,executionDigest:'a'.repeat(64)},{date:'2026-10-26',occurrenceId:'b',sessionId:'A',week:3,executionDigest:'a'.repeat(64)}],organization:{blocks:[{id:'one',startWeek:1,endWeek:2},{id:'two',startWeek:3,endWeek:4}]}};
 const projection=deriveCycleAccessoryRotation(facts,sessions);
 assert.deepEqual(projection.blocks.map(row=>row.knownRequiredAccessoryIds),[[2],[2]]);
 assert.deepEqual(projection.comparisons[0].observedRetainedIds,[2]);
 assert.equal(projection.comparisons[0].absenceConfirmed,true);
 assert.equal(projection.comparisons[0].actualSetupChangesConfirmed,false);
 assert.equal(projection.scientificBenefitVerified,false);
 const changed=structuredClone(facts); changed.occurrences[1].date='2026-10-27';
 assert.notEqual(deriveCycleAccessoryRotation(changed,sessions).scopeDigest,projection.scopeDigest);
 const inventoryChanged=structuredClone(sessions); inventoryChanged[0].equipmentSafety.accessoryRequirements.inventoryDigest='b'.repeat(64);
 assert.notEqual(deriveCycleAccessoryRotation(facts,inventoryChanged).scopeDigest,projection.scopeDigest);
});
test('unknown accessory requirements retain partial deltas and do not establish removals or setup',()=>{
 const safety=validatePlanRequiredAccessories({plan:{exercises:[{id:11}]},catalog,inventory:{ownershipKnown:true,ownershipStatus:'complete',ownedAccessoryIds:[2]}});
 const facts={occurrences:[{date:'2026-10-12',occurrenceId:'a',sessionId:'A',week:1,executionDigest:'a'.repeat(64)},{date:'2026-10-26',occurrenceId:'b',sessionId:'B',week:3,executionDigest:'b'.repeat(64)}],organization:{blocks:[{id:'one',startWeek:1,endWeek:2},{id:'two',startWeek:3,endWeek:4},{id:'rest',startWeek:5,endWeek:5}]}};
 const projection=deriveCycleAccessoryRotation(facts,[{sessionId:'A',equipmentSafety:safety},{sessionId:'B'}]);
 assert.equal(projection.blocks[1].status,'partial-observation');
 assert.equal(projection.blocks[2].status,'zero-prescribed-occurrences');
 assert.deepEqual(projection.comparisons[0].observedRemovedIds,[2]);
 assert.equal(projection.comparisons[0].absenceConfirmed,false);
 assert.equal(projection.blocks[1].setupStatus,'unknown');
});
