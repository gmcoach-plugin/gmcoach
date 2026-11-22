import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { getScienceGuidance, getScienceGuidanceBatch, SCIENCE_GUIDANCE_TOPICS, SCIENCE_GUIDANCE_HEADINGS } from '../science-guidance-index.mjs';

const source = readFileSync(new URL('../skills/training-science/references/resistance-training-evidence.md', import.meta.url), 'utf8');

test('explicit enum maps every topic to exact, present headings', () => {
  assert.equal(SCIENCE_GUIDANCE_TOPICS.length, 15);
  assert.deepEqual(Object.keys(SCIENCE_GUIDANCE_HEADINGS), SCIENCE_GUIDANCE_TOPICS);
  for (const topic of SCIENCE_GUIDANCE_TOPICS) {
    const result = getScienceGuidance(topic);
    assert.deepEqual(result.sections.map(section => section.heading), SCIENCE_GUIDANCE_HEADINGS[topic]);
    assert.match(result.notice, /historical guidance/);
    assert.match(result.notice, /not a fresh PubMed check or scientific approval/);
    for (const section of result.sections) {
      assert.ok(source.includes(section.markdown));
      assert.ok(section.markdown.startsWith(section.heading + '\n'));
    }
  }
});

test('returns exact section text, ending at the next same-level heading', () => {
  const section = getScienceGuidance('order').sections[0].markdown;
  const expected = source.slice(source.indexOf('### Kolejność ćwiczeń — Nunes i wsp., 2021'), source.indexOf('### Periodyzacja i bloki')).trimEnd();
  assert.equal(section, expected);
  assert.match(section, /PMID 32077380/);
});

test('bounds coverage and never dumps the whole document for one topic', () => {
  for (const topic of SCIENCE_GUIDANCE_TOPICS) {
    const result = getScienceGuidance(topic);
    assert.ok(result.sections.length <= 2);
    assert.ok(JSON.stringify(result).length <= 18_000);
    assert.ok(result.sections.every(section => section.markdown.length <= 12_000));
    assert.ok(JSON.stringify(result).length < source.length / 2);
  }
  assert.throws(() => getScienceGuidance('everything'), RangeError);
  assert.throws(() => getScienceGuidance('order', { markdown: source + 'x'.repeat(100_000) }), RangeError);
});

test('missing and duplicate mapped headings fail closed', () => {
  const heading = SCIENCE_GUIDANCE_HEADINGS.order[0];
  assert.throws(() => getScienceGuidance('order', { markdown: source.replace(heading, '### Removed') }), /Missing or duplicate/);
  assert.throws(() => getScienceGuidance('order', { markdown: source + '\n' + heading + '\n' }), /Missing or duplicate/);
  assert.throws(() => getScienceGuidance('order', { markdown: heading + '\n' + 'x'.repeat(12_001) }), RangeError);
});

test('batch reads several exact topics once without claiming fresh science',()=>{
  const result=getScienceGuidanceBatch(['hypertrophy','deload','warmup']);
  assert.deepEqual(result.topics,['hypertrophy','deload','warmup']);
  assert.equal(result.items.length,3);
  assert.equal(result.topicCount,3);
  assert.equal(result.sectionCount,4);
  assert.equal(result.freshPubMedRequired,true);
  assert.equal(result.scientificApproval,false);
  assert.ok(JSON.stringify(result).length<24_000);
  assert.throws(()=>getScienceGuidanceBatch(['deload','deload']),/distinct/);
  assert.throws(()=>getScienceGuidanceBatch(['deload','recovery','warmup','strength','volume']),/1–4/);
});

test('actual MCP registration and dispatch remain local read only',async()=>{
  const server=readFileSync(new URL('../mcp_server.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const start=server.indexOf("  {\n    name: 'gm_coach_find_science_guidance',");
  const end=server.indexOf("  {\n    name: 'gm_coach_save_training_profile',",start);
  assert.ok(start>=0&&end>start);
  const entry=vm.runInNewContext(`(${server.slice(start,end).trim().replace(/,$/,'')})`,{SCIENCE_GUIDANCE_TOPICS});
  assert.equal(entry.name,'gm_coach_find_science_guidance');
  assert.equal(entry.inputSchema.properties.topics.maxItems,4);
  const branchStart=server.indexOf("    case 'gm_coach_find_science_guidance':");
  const branchEnd=server.indexOf("    case 'gm_coach_expand_training_schedule':",branchStart);
  const branch=server.slice(branchStart,branchEnd);
  assert.doesNotMatch(branch,/resolveProfile|speedianceApiRequest|readProfile|withProfileMutationLock/);
  const dispatch=vm.runInNewContext(`async args=>{switch('gm_coach_find_science_guidance'){${branch}}}`,{getScienceGuidanceBatch});
  const result=await dispatch({topics:['deload','recovery']});
  assert.deepEqual(result.topics,['deload','recovery']);
  assert.equal(result.scientificApproval,false);
});
