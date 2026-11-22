import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconstructSavedPortableSource} from '../saved-source-reconstruction.mjs';
import {exportSharedPlan,importSharedPlan} from '../portable-shared-plan.mjs';
import {rememberSharedPlanArtifact,resolveSharedPlanImportArgs,clearSharedPlanArtifacts} from '../shared-plan-artifact-store.mjs';

const src=readFileSync(new URL('./saved-export-roundtrip.test.mjs',import.meta.url),'utf8');
const w6=new Function(src.slice(src.indexOf('const ev='),src.indexOf("test('W6"))+'return w6;')();
const saved=()=>reconstructSavedPortableSource({record:{plan:w6(),retainedPortableSource:{version:1,status:'unavailable',reason:'x'}},identityStatus:'matched',templateCode:'T1'});

test('W6 export -> import by artifactUri gives identical planForPreview',()=>{
  clearSharedPlanArtifacts();
  const shared=exportSharedPlan({savedArtifact:saved()});
  const uri=rememberSharedPlanArtifact({digest:shared.provenance.sourceDigest,fileName:shared.fileName,artifactText:shared.artifactText});
  assert.match(uri,/^gm-coach:\/\/shared-plans\/.+\/gm-coach-plan\.json$/);
  const byUri=importSharedPlan(resolveSharedPlanImportArgs({artifactUri:uri}));
  const byText=importSharedPlan({artifactText:shared.artifactText});
  assert.deepEqual(byUri.planForPreview,byText.planForPreview);
  assert.equal(byUri.planForPreview.exercises.length,13);
});

test('unknown, expired or ambiguous artifactUri gives readable Polish error',()=>{
  clearSharedPlanArtifacts();
  assert.throws(()=>resolveSharedPlanImportArgs({artifactUri:'gm-coach://shared-plans/deadbeefdead/gm-coach-plan.json'}),/wygasł.*Wygeneruj plik ponownie/);
  const shared=exportSharedPlan({savedArtifact:saved()});
  const uri=rememberSharedPlanArtifact({digest:shared.provenance.sourceDigest,fileName:shared.fileName,artifactText:shared.artifactText},0);
  assert.throws(()=>resolveSharedPlanImportArgs({artifactUri:uri},3*60*60*1000),/wygasł/);
  assert.throws(()=>resolveSharedPlanImportArgs({artifactUri:uri,artifactText:'x'}),/dokładnie jedno/);
});
