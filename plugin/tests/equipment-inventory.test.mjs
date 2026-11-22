import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
  findAccountAccessorySelection,
  groupAccessoriesByName,
  mapEquipmentValues,
  parseAccessoryIds
} from '../equipment-inventory.mjs';

const catalog = [
  { id: 1, name: 'Barbell', deviceTypes: '1' },
  { id: 2, name: 'Handles', deviceTypes: '1' },
  { id: 3, name: 'Yoga Mat', deviceTypes: '1,2' }
];

test('ownership flag aliases require booleans and consistent declarations', () => {
  for (const flag of ['owned', 'selected', 'enabled', 'checked']) {
    assert.deepEqual(mapEquipmentValues([{ id: 1, [flag]: true }], catalog).ids, [1]);
    const excluded = findAccountAccessorySelection({ ownedAccessories: [{ id: 1, [flag]: false }] }, catalog);
    assert.deepEqual(excluded.ids, []);
    assert.deepEqual(excluded.unresolved, []);
    for (const malformed of ['false', 'true', 0, 1, null, undefined, {}, []]) {
      const item = { id: 1, [flag]: malformed };
      assert.equal(mapEquipmentValues([item], catalog).valid, false);
      assert.equal(findAccountAccessorySelection({ ownedAccessories: [item] }, catalog), null);
      const partial = findAccountAccessorySelection({ ownedAccessoryIds: [2], selectedAccessories: [item] }, catalog);
      assert.deepEqual(partial.ids, [2]);
      assert.ok(partial.unresolved.some(value => /Incomplete/.test(value)));
    }
    for (const other of ['owned', 'selected', 'enabled', 'checked'].filter(key => key !== flag)) {
      const item = { id: 1, [flag]: true, [other]: false };
      assert.equal(mapEquipmentValues([item], catalog).valid, false);
      assert.equal(findAccountAccessorySelection({ myAccessories: [item] }, catalog), null);
    }
  }
  assert.deepEqual(findAccountAccessorySelection({ ownedAccessories: [{ id: 999, owned: true }] }, catalog).ids, []);
});

test('actual inventory read never promotes malformed or conflicting account declarations to owned', async () => {
  const source = await readFile(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function readOwnedEquipment(');
  const end = source.indexOf('\nfunction exerciseKind(', start);
  for (const item of [{ id: 1, owned: 'false' }, { id: 1, selected: 0 }, { id: 1, owned: true, checked: false },
    { id: 1, name: 'Handles' }, { accessoryId: 1, id: 2 }, { accessoryId: 1, id: 'bad' }, { id: 1, accessoryName: 'Barbell', name: 'Handles' }]) {
    const context = vm.createContext({
      readProfileConfig: async () => ({ config: { deviceType: 1 } }),
      loadAccessoryCatalog: async () => catalog,
      speedianceApiRequest: async (_profile,endpoint) => { assert.equal(endpoint,'/app/userinfo/info');return { data: { ownedAccessories: [item] } }; },
      findAccountAccessorySelection, mapEquipmentValues,
      profilePaths: () => ({ coachingProfile: 'synthetic' }), assertSafeProfileStorage: async () => {},
      readFile: async () => { const error = new Error('absent'); error.code = 'ENOENT'; throw error; },
      parseTrainingProfileRecord: value => value
    });
    vm.runInContext(`${source.slice(start, end)}; globalThis.inventory = readOwnedEquipment`, context);
    const result = await context.inventory('fixture');
    assert.equal(result.ownershipKnown, false);
    assert.equal(result.source, 'unknown');
    assert.equal(result.ownedAccessories.length, 0);
  }
});

test('all identity aliases must agree before an account record can establish ownership', () => {
  const idAliases = ['accessoryId', 'accessory_id', 'id', 'value'];
  const nameAliases = ['accessoryName', 'accessory_name', 'name', 'title', 'label'];
  for (const idAlias of idAliases) {
    for (const other of idAliases.filter(key => key !== idAlias)) {
      for (const bad of [2, 'bad', null, false, {}, []]) {
        const item = { [idAlias]: 1, [other]: bad };
        assert.equal(mapEquipmentValues([item], catalog).valid, false);
        assert.equal(findAccountAccessorySelection({ ownedAccessories: [item] }, catalog), null);
      }
    }
    for (const nameAlias of nameAliases) {
      assert.equal(findAccountAccessorySelection({ ownedAccessories: [{ [idAlias]: 1, [nameAlias]: 'Handles' }] }, catalog), null);
      assert.deepEqual(mapEquipmentValues([{ [idAlias]: '1', [nameAlias]: 'Barbell' }], catalog).ids, [1]);
    }
  }
  for (const alias of nameAliases) for (const other of nameAliases.filter(key => key !== alias)) {
    assert.equal(mapEquipmentValues([{ [alias]: 'Barbell', [other]: 'Handles' }], catalog).valid, false);
    assert.equal(mapEquipmentValues([{ [alias]: 'Barbell', [other]: null }], catalog).valid, false);
  }
  const duplicates = [...catalog, { id: 8, name: 'Handles' }];
  assert.deepEqual(findAccountAccessorySelection({ ownedAccessories: [{ id: 2, name: 'Handles' }] }, duplicates).ids, [2]);
  assert.deepEqual(mapEquipmentValues(['Handles'], duplicates, { source: 'user-confirmed-local' }).ids, [2, 8]);
});

test('maps explicit account IDs and unique names without including the catalog', () => {
  const selection = findAccountAccessorySelection({
    user: { ownedAccessoryIds: [1, '2'] }
  }, catalog);

  assert.equal(selection?.fieldPath, 'data.user.ownedAccessoryIds');
  assert.deepEqual(selection?.ids, [1, 2]);
  assert.deepEqual(selection?.unresolved, []);
  assert.equal(selection?.valid, true);
});

test('treats an explicit empty array as a known empty selection', () => {
  const selection = findAccountAccessorySelection({ owned_accessories: [] }, catalog);
  assert.deepEqual(selection?.ids, []);
  assert.equal(selection?.valid, true);
});

test('competing account declarations never become complete by field ordering', () => {
  for (const profile of [
    { ownedAccessories: [], selectedAccessoryIds: [2] },
    { selectedAccessoryIds: [2], ownedAccessories: [] },
    { ownedAccessories: [1], selectedAccessoryIds: [2] }
  ]) {
    const selection = findAccountAccessorySelection(profile, catalog);
    assert.deepEqual(selection.ids, []);
    assert.ok(selection.unresolved.some(value => /Conflicting/.test(value)));
  }
  const common = findAccountAccessorySelection({ ownedAccessories: [1, 2], selectedAccessoryIds: [2, 3] }, catalog);
  assert.deepEqual(common.ids, [2]);
  assert.ok(common.unresolved.length > 0);
});

test('equivalent alias declarations compare IDs and unresolved values without order sensitivity', () => {
  const same = findAccountAccessorySelection({ ownedAccessories: [1, 2], selectedAccessoryIds: ['2', '1'] }, catalog);
  assert.deepEqual(same.ids, [1, 2]);
  assert.deepEqual(same.unresolved, []);
  const unknown = findAccountAccessorySelection({ ownedAccessories: [999, 'missing'], selectedAccessoryIds: ['missing', 999] }, catalog);
  assert.equal(unknown.unresolved.some(value => /Conflicting/.test(value)), false);
});

test('invalid recognized declarations and bounded traversal leave valid ownership partial', () => {
  for (const invalid of [null, '', {}, [null]]) {
    const selection = findAccountAccessorySelection({ ownedAccessories: [1], selectedAccessoryIds: invalid }, catalog);
    assert.deepEqual(selection.ids, [1]);
    assert.ok(selection.unresolved.some(value => /Incomplete/.test(value)));
  }
  let deep = { selectedAccessoryIds: [2] };
  for (let index = 0; index < 10; index++) deep = { child: deep };
  const depthLimited = findAccountAccessorySelection({ ownedAccessories: [1], deep }, catalog);
  assert.ok(depthLimited.unresolved.some(value => /limit/.test(value)));
  const nodeLimited = findAccountAccessorySelection({ ownedAccessories: [1], many: Array(10001).fill(null) }, catalog);
  assert.ok(nodeLimited.unresolved.some(value => /limit/.test(value)));
  assert.equal(findAccountAccessorySelection({ selectedAccessoryIds: null, deep }, catalog), null);
});

test('does not turn null, blank, or malformed inventory fields into a known empty selection', () => {
  for (const fieldValue of [null, '', [null], {}]) {
    assert.equal(findAccountAccessorySelection({ ownedAccessories: fieldValue }, catalog), null);
  }
  assert.equal(findAccountAccessorySelection({ user: { profile: { name: 'example-profile' } } }, catalog), null);
});

test('does not treat ownership flags without an accessory identity as an empty inventory', () => {
  for (const item of [{ owned: true }, { selected: false }, { enabled: true }, { checked: false }]) {
    assert.equal(findAccountAccessorySelection({ ownedAccessories: [item] }, catalog), null);
  }
});

test('keeps unknown accessory names and IDs unresolved instead of guessing', () => {
  const selection = findAccountAccessorySelection({ myAccessories: ['Unknown attachment', 999] }, catalog);
  assert.deepEqual(selection?.ids, []);
  assert.deepEqual(selection?.unresolved, ['Unknown attachment', 'ID 999']);
});

test('does not map a duplicated name to multiple IDs', () => {
  const result = mapEquipmentValues('Adapter', [
    { id: 10, name: 'Adapter' },
    { id: 11, name: 'Adapter' }
  ]);
  assert.deepEqual(result.ids, []);
  assert.deepEqual(result.unresolved, ['Adapter']);
});

test('parses common account encodings and groups visible equipment', () => {
  assert.deepEqual(parseAccessoryIds('[1, "2", {"id": 3}]'), [1, 2, 3]);
  assert.deepEqual(parseAccessoryIds('1 2;3'), [1, 2, 3]);
  assert.deepEqual(groupAccessoriesByName(catalog).map((item) => item.name), ['Barbell', 'Handles', 'Yoga Mat']);
});

test('explicit local names resolve every exact catalog-name ID with provenance only', () => {
  const duplicateCatalog = [{ id: 2, name: 'Handles' }, { id: 8, name: ' handles ' }, { id: 9, name: 'Hándles' }, { id: 10, name: 'Handles Pro' }];
  const result = mapEquipmentValues(['HANDLES', 'missing'], duplicateCatalog, { source: 'user-confirmed-local' });
  assert.deepEqual(result.ids, [2, 8]);
  assert.deepEqual(result.unresolved, ['missing']);
  assert.deepEqual(result.nameGroups, [{ name: 'Handles', ids: [2, 8], source: 'user-confirmed-local', resolution: 'catalog-name-group' }]);
  assert.deepEqual(mapEquipmentValues([2], duplicateCatalog, { source: 'user-confirmed-local' }).ids, [2]);
  assert.deepEqual(findAccountAccessorySelection({ ownedAccessoryIds: [2] }, duplicateCatalog).ids, [2]);
  assert.deepEqual(findAccountAccessorySelection({ ownedAccessories: ['Handles'] }, duplicateCatalog).ids, []);
});


test('actual inventory info GET success alone never establishes ownership and local confirmation remains distinct',async()=>{
 const source=await readFile(new URL('../mcp_server.mjs',import.meta.url),'utf8');const start=source.indexOf('async function readOwnedEquipment('),end=source.indexOf('\nfunction exerciseKind(',start);assert.ok(start>=0&&end>start);
 for(const scenario of [{data:{}},{data:{unit:0}},{data:{ownedAccessories:[{id:1,owned:true}]}},{data:{},local:true},{fail:true}]){
  const calls=[];const context=vm.createContext({
   readProfileConfig:async()=>({config:{deviceType:1}}),loadAccessoryCatalog:async()=>catalog,
   speedianceApiRequest:async(profile,endpoint)=>{calls.push(endpoint);assert.equal(profile,'fixture');if(endpoint==='/app/userinfo')throw Error('Synthetic unsupported bare GET code12');assert.equal(endpoint,'/app/userinfo/info');if(scenario.fail)throw Error('Synthetic info read failure');return {data:scenario.data};},
   findAccountAccessorySelection,mapEquipmentValues,profilePaths:()=>({coachingProfile:'synthetic'}),assertSafeProfileStorage:async()=>{},
   readFile:async()=>{if(scenario.local)return JSON.stringify({profileData:{equipmentOwnershipStatus:'complete',ownedEquipmentNames:['Barbell']}});const error=Error('absent');error.code='ENOENT';throw error;},parseTrainingProfileRecord:value=>value
  });
  vm.runInContext(`${source.slice(start,end)};globalThis.inventory=readOwnedEquipment`,context);const result=await context.inventory('fixture');assert.deepEqual(calls,['/app/userinfo/info']);
  if(scenario.local){assert.equal(result.source,'user-confirmed-local');assert.equal(result.ownershipKnown,true);assert.equal(result.ownedAccessories[0].id,1);assert.equal(result.accountProfile.status,'selection-field-not-found');}
  else if(scenario.data?.ownedAccessories){assert.equal(result.source,'speediance-account');assert.equal(result.ownershipKnown,true);assert.equal(result.ownedAccessories[0].id,1);}
  else{assert.equal(result.source,'unknown');assert.equal(result.ownershipKnown,false);assert.equal(result.ownedAccessories.length,0);assert.equal(result.accountProfile.status,scenario.fail?'profile-endpoint-unavailable':'selection-field-not-found');}
 }
});
