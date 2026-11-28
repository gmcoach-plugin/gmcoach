import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../plugin/'+p,import.meta.url),'utf8');
// Wording contract only. Actual scientific guard fixtures remain mandatory;
// this file cannot establish model compliance or a successful account save.
test('ordinary science route states observed excerpt, match and category provenance contracts',()=>{
 const lean=read('skills/training-science/instructions-plan-lean.md');
 const detail=read('skills/training-science/instructions-plan-lean-detail.md');
 for(const text of [lean,detail]){
  for(const literal of ['5–25','25','direction=qualifies','relationship=indirect','guideline','coveredCategor','set_load','intensity_load','cardio_intensity','researchCategories','queryBatches'])assert.ok(text.includes(literal),literal);
  assert.match(text,/znormalizowanych fragmentów/);
  assert.match(text,/nakładają/);
  assert.match(text,/innej kategorii/);
 }
 const coach=read('skills/speediance-coach/instructions-plan-lean.md');
 for(const token of ['preparePreferenceReviews:true','requiredPreferenceReviews','scopeDigest','decision=reviewed-compatible','userAnswerRequired=true','czekaj na odpowiedź użytkownika','userConfirmed=true','writeReady=false','approvalIssued=false','bez flagi'])assert.ok(coach.includes(token),token);
 assert.match(lean,/Nauka nie zastępuje preferenceReviews/);
 assert.ok(Buffer.byteLength(coach)+Buffer.byteLength(lean)<15500);
});

test('preference preparation flag belongs only to the registered ordinary preview schema',()=>{
 const source=read('mcp_server.mjs');
 const start=source.indexOf("name: 'speediance_preview_program'");
 const end=source.indexOf("name: 'speediance_preview_saved_program_schedule'",start);
 assert.ok(start>=0&&end>start);
 const registered=source.slice(start,end);
 assert.match(registered,/preparePreferenceReviews: \{ type: 'boolean'/);
 const commonStart=source.indexOf('function programSchema(');
 const commonEnd=source.indexOf('\nfunction ',commonStart+1);
 assert.ok(commonStart>=0&&commonEnd>commonStart);
 assert.doesNotMatch(source.slice(commonStart,commonEnd),/preparePreferenceReviews/);
 assert.match(source,/Object\.hasOwn\(args, 'preparePreferenceReviews'\) && name !== 'speediance_preview_program'/);
 const branch=source.indexOf("case 'speediance_preview_program':");
 const returning=source.indexOf("operationStatus: 'preference-review-preparation'",branch);
 const payload=source.indexOf('await prepareProgramPayload(plan, profile, fingerprint)',branch);
 assert.ok(returning>branch&&payload>returning);
 for(const token of ['readOnly: true','mutationSent: false','writeReady: false','approvalIssued: false','scientificApproval: false'])assert.ok(source.slice(returning,payload).includes(token),token);
});
