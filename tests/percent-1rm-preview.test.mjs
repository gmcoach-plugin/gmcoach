import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { buildSessionTable } from '../plugin/session-table.mjs';
import { resolvePercent1RMSet } from '../plugin/percent-1rm.mjs';
import { resolveSavedTemplateLoadPresentation } from '../plugin/saved-templates.mjs';

const oneRepMax = { value: 43.5, unit: 'kg', source: 'user-confirmed-one-rep-max' };
const set = (reps, rirTarget, percent1RM, withRm = true) => ({ unit: 'reps', reps, rirTarget, mode: 1, rest: 60, percentResolved: resolvePercent1RMSet({ reps, rirTarget, percent1RM, percentReason: percent1RM ? 'test' : undefined, presetName: 'Gain Muscle', oneRepMax: withRm ? oneRepMax : undefined, goalLabel: 'hypertrophy' }) });
const exercises = [{ id: 1, title: 'Kneeling Dual-Handle Chest Press', loadType: 'smart-rm', smartRmPresetName: 'Gain Muscle', sets: [set(10, 2), set(10, 2)] }];

test('session table row shows preset, percent and kg plus rationale under the table', () => {
  const table = buildSessionTable({ name: 'x', exercises });
  assert.match(table.main[0].sets, /2×10 powt\., RIR 2, Gain Muscle · 70% 1RM ≈ 30 kg, przerwa 60 s/);
  assert.equal(table.percentLoadNotes.length, 1);
  assert.match(table.percentLoadNotes[0], /1RM 43\.5 kg.*hypertrophy: 10 powt\. \+ RIR 2/);
  assert.match(table.instruction, /percentLoadNotes/);
});
test('sets with different percents are never grouped: 50/70/80 give three separate entries', () => {
  const table = buildSessionTable({ exercises: [{ ...exercises[0], sets: [set(10, 2, 50), set(10, 2, 70), set(10, 2, 80)] }] });
  const parts = table.main[0].sets.split('; ');
  assert.equal(parts.length, 3);
  assert.match(parts[0], /^1×10 powt\..*50% 1RM ≈ 22 kg/);
  assert.match(parts[1], /^1×10 powt\..*70% 1RM ≈ 30 kg/);
  assert.match(parts[2], /^1×10 powt\..*80% 1RM ≈ 35 kg/);
  assert.equal(table.percentLoadNotes.length, 3);
});
test('percent-only sets show the percent and that Speediance computes kg', () => {
  const table = buildSessionTable({ exercises: [{ ...exercises[0], sets: [set(10, 2, undefined, false)] }] });
  assert.match(table.main[0].sets, /Gain Muscle · 70% 1RM · kg dobierze Speediance/);
});
test('approval page shows the percent cell per set and the rationale', () => {
  const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('function approvalPage(');
  const end = source.indexOf('\nasync function handleApprovalRequest', start);
  const render = vm.runInNewContext('(' + source.slice(start, end).trim() + ')', {
    escapeHtml: value => String(value ?? ''), RESISTANCE_MODES: { 1: 'Standard' }, setupPage: (_title, _message, form) => form
  });
  const plan = { name: 'x', rationale: 'r', evidence: [], decisionEvidence: [], warmup: { items: [] }, postWorkoutStretching: { items: [] }, supersetBlocks: [], exercises: [{ ...exercises[0], sets: [set(10, 2, 50), set(10, 2, 70, false)] }] };
  const html = render({ plan, preview: {}, profile: 'synthetic', payload: { name: 'x' } });
  assert.match(html, /Gain Muscle · 50% 1RM ≈ 22 kg/);
  assert.match(html, /Gain Muscle · 70% 1RM · kg dobierze Speediance/);
  assert.match(html, /Obciążenie %1RM: uzasadnienie/);
  assert.match(html, /ręcznie 50%1RM: test/);
});
test('saved template readback shows the percent per set from percent1rmStr', () => {
  const action = { templatePresetId: 1, level: '0,0,0', weights: '22,30,35', counterweight2: '20,12,8', percent1rmStr: '50,70,80', setsAndReps: '10,10,10' };
  const shown = [0, 1, 2].map((index) => resolveSavedTemplateLoadPresentation(action, index, 3, 'kg', 'reps'));
  assert.deepEqual(shown.map((item) => item.displayLoad), ['Gain Muscle · 50% 1RM · 22 kg', 'Gain Muscle · 70% 1RM · 30 kg', 'Gain Muscle · 80% 1RM · 35 kg']);
  assert.deepEqual(shown.map((item) => item.percent1RM), [50, 70, 80]);
  const noKg = resolveSavedTemplateLoadPresentation({ ...action, weights: '3.5,3.5,3.5' }, 1, 3, 'kg', 'reps');
  assert.equal(noKg.displayLoad, 'Gain Muscle · 70% 1RM · kg dobierze Speediance');
});
