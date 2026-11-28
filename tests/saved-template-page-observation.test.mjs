import test from 'node:test';
import assert from 'node:assert/strict';
import { observeSavedCustomTemplatePages, getSavedCustomTemplates } from '../plugin/saved-template-list.mjs';
const rows = (start, count) => Array.from({ length: count }, (_, i) => ({ code: `code-${start + i}`, id: start + i }));
test('explicit observation retains full envelopes and source-supported requests without write readiness', async () => {
  const calls = [], responses = [{ code: 0, total: 52, data: rows(1, 50) }, { code: 0, total: 52, data: rows(51, 2) }];
  const result = await observeSavedCustomTemplatePages('synthetic', 1, async (profile, path) => { calls.push({ profile, path }); return responses[calls.length - 1]; });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].path, '/app/v4/customTrainingTemplate/appPage?pageNo=2&pageSize=50&deviceTypes=1');
  assert.equal(result.templates.length, 52);
  assert.equal(result.pages[0].envelope.total, 52);
  assert.equal(result.pages[0].metadata.declaredTotals[0].path, '$.total');
  assert.equal(result.coverage.termination, 'consumer_short_page');
  assert.equal(result.completeness.status, 'unknown');
  assert.equal(result.usableForMutation, false);
  responses[0].data[0].code = 'changed';
  assert.equal(result.pages[0].envelope.data[0].code, 'code-1');
});
test('strict reader rejects a repeated page instead of treating total=0 as complete', async () => {
  let calls = 0;
  await assert.rejects(getSavedCustomTemplates('synthetic', 1, async (_, path) => { calls++; assert.match(path, /pageSize=(-1|50)/); return { total: 0, data: rows(1, 40) }; }), /Metadane liczby szablonów/);
  assert.equal(calls, 3);
});
for (const [name, responses, issue] of [
  ['zero conflict', [{ total: 0, data: rows(1, 40) }], 'count_contradiction'],
  ['repeat', [{ data: rows(1, 50) }, { data: rows(1, 50) }], 'repeated_page'],
  ['overlap', [{ data: rows(1, 50) }, { data: rows(50, 2) }], 'overlapping_page'],
  ['count drift', [{ total: 52, data: rows(1, 50) }, { total: 53, data: rows(51, 2) }], 'count_drift'],
  ['short contradiction', [{ total: 80, data: rows(1, 2) }], 'terminal_count_conflict'],
]) test(name, async () => {
  let calls = 0;
  const result = await observeSavedCustomTemplatePages('synthetic', 1, async () => responses[calls++]);
  assert.ok(result.completeness.issues.some(row => row.code === issue));
  assert.equal(result.usableForMutation, false);
});
test('unreported empty termination and page bound never claim completeness', async () => {
  const empty = await observeSavedCustomTemplatePages('synthetic', 1, async () => ({ data: [] }));
  assert.equal(empty.completeness.status, 'unknown');
  let page = 0;
  const bounded = await observeSavedCustomTemplatePages('synthetic', 1, async () => ({ data: rows(++page * 50, 50) }));
  assert.equal(page, 20); assert.equal(bounded.coverage.termination, 'page_limit');
  assert.equal(bounded.templates.length, 1000); assert.equal(bounded.usableForMutation, false);
});
test('request failures propagate without retry; accessors and sparse pages rejected', async () => {
  let calls = 0;
  await assert.rejects(observeSavedCustomTemplatePages('synthetic', 1, async () => { calls++; throw new Error('account changed'); }), /account changed/);
  assert.equal(calls, 1);
  let invoked = false; const value = { get data() { invoked = true; return []; } };
  await assert.rejects(observeSavedCustomTemplatePages('synthetic', 1, async () => value), /accessors/);
  assert.equal(invoked, false);
  await assert.rejects(observeSavedCustomTemplatePages('synthetic', 1, async () => ({ data: new Array(2) })), /sparse/);
});
