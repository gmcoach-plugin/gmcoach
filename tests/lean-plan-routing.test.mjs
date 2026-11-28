import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';

const base=new URL('../plugin/skills/',import.meta.url);
const read=path=>readFileSync(new URL(path,base),'utf8');
const bytes=paths=>paths.reduce((n,p)=>n+statSync(new URL(p,base)).size,0);
const coach='speediance-coach/';
const science='training-science/';
const oldDay=[coach+'SKILL.md',coach+'instructions-plan-day.md',coach+'instructions-account.md',coach+'instructions-catalog.md',coach+'instructions-design.md',coach+'instructions-write.md',science+'SKILL.md',science+'instructions-plan-day.md',science+'instructions-science.md'];
const oldDeload=[coach+'SKILL.md',coach+'instructions-plan-cycle.generated.md',coach+'instructions-account.md',coach+'instructions-catalog.md',coach+'instructions-design.md',coach+'instructions-cycle.md',coach+'instructions-write.md',coach+'instructions-history.md',science+'SKILL.md',science+'instructions-plan-cycle.md',science+'instructions-science.md'];
const lean=[coach+'SKILL.md',coach+'instructions-plan-lean.md',science+'SKILL.md',science+'instructions-plan-lean.md'];

test('ordinary route reads fewer bytes and files, with history only for consented deload',()=>{
 const day=lean,deload=[...lean,coach+'instructions-history.md'];
 assert.ok(bytes(day)<bytes(oldDay)/2);
 assert.ok(bytes(deload)<bytes(oldDeload)/2);
 assert.ok(day.length<oldDay.length);
 assert.ok(deload.length<oldDeload.length);
 assert.ok(bytes([coach+'instructions-plan-lean.md',science+'instructions-plan-lean.md'])<15500,'default plan modules must stay concise');
});

test('lean route retains mandatory gates and conditional full modules',()=>{
 const c=read(coach+'instructions-plan-lean.md'),s=read(science+'instructions-plan-lean.md');
 for(const token of ['speediance_list_accounts','speediance_check_connection','gm_coach_get_training_profile','instructions-history.md','speediance_get_owned_equipment','groupId','actionLibraryId','gm_coach_calculate_sketch_time','gm_coach_prepare_science_scope','speediance_preview_program','ZAKOŃCZ turę i CZEKAJ','confirm:true','readback','instructions-account.md','instructions-catalog.md','instructions-design.md','instructions-cycle.md','instructions-write.md','instructions-saved.md','instructions-core.md'])assert.ok(c.includes(token),token);
 for(const token of ['gm_coach_prepare_science_scope','gm_coach_search_training_research','sourceAssessments','scienceGate=user_declined','16 kategorii','instructions-science.md','instruc­tions-core.md'.replace('­','')])assert.ok(s.includes(token),token);
 assert.match(read(coach+'SKILL.md'),/prosty deload.*instructions-plan-lean\.md/s);
 assert.match(read(science+'SKILL.md'),/prosty deload.*instructions-plan-lean\.md/s);
});

test('ordinary multi-session plan without a cycle stays on the lean route in both modules',()=>{
 const coachRouter=read(coach+'SKILL.md'),scienceRouter=read(science+'SKILL.md');
 const coachLean=read(coach+'instructions-plan-lean.md'),scienceLean=read(science+'instructions-plan-lean.md');
 for(const content of [coachRouter,scienceRouter,coachLean,scienceLean]) assert.match(content,/plan(u)? wielu sesji bez (nowego bloku lub )?cyklu/);
});

test('science router reuses complete prescription bindings instead of repeating scope preflight',()=>{
 const router=read(science+'SKILL.md');
 assert.match(router,/gm_coach_derive_evidence_bindings.*gm_coach_derive_multi_session_evidence_scope.*researchCategories.*queryBatches/s);
 assert.match(router,/gm_coach_prepare_science_scope` wywołaj tylko wtedy, gdy dawka jest jeszcze niekompletna/);
});

test('public research plus local version diagnostic uses a narrow route without personal-plan authority',()=>{
 const route=[coach+'SKILL.md',science+'SKILL.md',science+'instructions-public-research.md'];
 assert.ok(bytes(route)<bytes([coach+'instructions-core.md',science+'instructions-core.md'])/2);
 const c=read(coach+'SKILL.md'),s=read(science+'SKILL.md'),p=read(science+'instructions-public-research.md');
 for(const text of [c,s])assert.match(text,/instructions-public-research\.md/);
 for(const token of ['output_view="compact"','isError','batchId','gm_coach_read_selected_research_abstracts','naukowym zatwierdzeniem dawki'])assert.ok(p.includes(token),token);
 assert.match(p,/bez planu|nie projektuj/i);
});

test('lean route batches independent start reads, skips template list before new preview and uses the server review skeleton',()=>{
 const c=read(coach+'instructions-plan-lean.md'),s=read(science+'instructions-plan-lean.md');
 assert.match(c,/jednej równoległej partii/);
 assert.match(c,/gm_coach_get_training_profile.{0,80}speediance_get_owned_equipment/s);
 assert.match(c,/Nie wołaj `speediance_list_saved_programs` przed podglądem nowego planu/);
 assert.match(c,/preferenceReviewsSkeleton.{0,160}decision i rationale/s);
 assert.match(c+s,/gm_coach_prepare_evidence_pack.{0,120}zamiast ręcznego search\/read/s);
 assert.match(c,/ZAKOŃCZ turę i CZEKAJ/);
});
