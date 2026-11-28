import {installSavedHeaderFixture} from './saved-header-fixture.mjs';
import {captureRetainedPortableSource,exportRetainedPortableSource} from '../plugin/retained-portable-source.mjs';
import vm from 'node:vm';
import { readFileSync, mkdtempSync, mkdirSync, lstatSync, openSync, fstatSync, readSync, closeSync, constants as fsConstants, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after } from 'node:test';
import { activeAccessoryConfirmations } from '../plugin/accessory-requirement-confirmation.mjs';
const source=readFileSync(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');
const root=mkdtempSync(path.join(tmpdir(),'coach-accessory-empty-fixture-'));
const accounts=path.join(root,'accounts');mkdirSync(accounts);
after(()=>rmSync(root,{recursive:true,force:true}));
function declaration(name){const start=source.indexOf(`function ${name}(`);if(start<0)throw new Error(`Missing actual accessory fixture declaration ${name}`);const first=source.slice(start-6,start)==='async '?start-6:start;const end=source.indexOf('\n}',start);if(end<0)throw new Error('Missing actual accessory fixture boundary');return source.slice(first,end+2);}
export function accessoryFixtureGlobals() {
 const observed=new Map();
 // Actual declaration plus call-local empty registry; never a permissive token stub.
 const resolverStart=source.indexOf('function resolveImportedRmPolicy('),resolverEnd=source.indexOf('\n',resolverStart);
 if(resolverStart<0||resolverEnd<=resolverStart)throw new Error('Missing imported RM resolver declaration boundary');
 const resolveImportedRmPolicy=vm.runInNewContext('('+source.slice(resolverStart,resolverEnd)+')',{importedRmPolicyTokens:new Map(),Date});

 const profilePaths=profile=>{if(typeof profile!=='string'||!/^[a-zA-Z0-9_-]+$/.test(profile))throw new Error('Invalid synthetic accessory profile');const dir=path.join(accounts,profile);mkdirSync(dir,{recursive:true});return{dir,accessoryConfirmations:path.join(dir,'requirements.json')};};
 const context={Date,Buffer,JSON,activeAccessoryConfirmations,accessoryConfirmationStorage:{read:async()=>null},accessoryConfirmationContext:{getStore:()=>observed,run:(_map,fn)=>fn()},profilePaths,ACCOUNTS_DIR:accounts,lstatSync,openSync,fstatSync,readSync,closeSync,fsConstants};
 const adapterHelpers=new Function(declaration('preserveExerciseFixedKgAuthorization')+'\n'+declaration('cloneCycleAdapterPlan')+'\nreturn {preserveExerciseFixedKgAuthorization,cloneCycleAdapterPlan};')();
 return {structuredClone,...installSavedHeaderFixture(),...adapterHelpers,captureRetainedPortableSource,exportRetainedPortableSource,resolveImportedRmPolicy,...vm.runInNewContext(['assertAccessoryConfirmationsUnchanged','observeAccessoryConfirmations','assertAccessoryConfirmationsCurrentSync'].map(declaration).join('\n')+'\n({assertAccessoryConfirmationsUnchanged,observeAccessoryConfirmations,assertAccessoryConfirmationsCurrentSync})',context),accessoryConfirmationContext:context.accessoryConfirmationContext,activeAccessoryConfirmations};
}
export function installAccessoryFixture(dependencies) { const globals=accessoryFixtureGlobals();for(const [key,value] of Object.entries(globals))if(!Object.hasOwn(dependencies,key))dependencies[key]=value;return dependencies; }
export function runWithAccessoryFixture(code,dependencies={},options) {return vm.runInNewContext(code,installAccessoryFixture(dependencies),options);}export function functionWithAccessoryFixture(...declarations) {
 const globals=accessoryFixtureGlobals();
 const fn=new Function(...Object.keys(globals),...declarations);
 return (...values)=>fn(...Object.values(globals),...values);
}