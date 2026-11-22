import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
const start = source.lastIndexOf("case 'speediance_preview_program': {");
const end = source.indexOf('      const profile = await resolveProfile(args.profile);', start);
assert.ok(start >= 0 && end > start);
const guard = source.slice(start + "case 'speediance_preview_program': {".length, end);
const check = vm.runInNewContext(`(function(args){${guard}})`);
const complete = () => ({
  warmup: { status: 'included', items: [] },
  postWorkoutStretching: { status: 'included', items: [] },
  recoveryContext: { status: 'not_requested', limitations: [] },
  exercises: [{ loadType: 'customize-manual', staticLoadRequested: true }]
});

test('preview rejects each absent required section with its name', () => {
  for (const section of ['warmup', 'postWorkoutStretching']) {
    const input = complete();
    delete input[section];
    assert.throws(() => check(input), new RegExp(section));
  }
});

test('preview identifies both reference client flags conflicting with manual Customize', () => {
  for (const location of ['whole', 'exercise']) {
    const input = complete();
    if (location === 'whole') input.referenceClientCustomizeRequestedForWholeWorkout = true;
    else input.exercises[0].userRequestedReferenceClientCustomize = true;
    assert.throws(() => check(input), /Ćwiczenie 1: manual Customize.*referenceClientCustomizeRequestedForWholeWorkout\/userRequestedReferenceClientCustomize/);
  }
  assert.doesNotThrow(() => check(complete()));
});

test('public preview validates its input shape before account and catalog reads', () => {
  const preview = source.slice(start);
  assert.match(preview, /^case 'speediance_preview_program': \{/);
  const profileRead = preview.indexOf('const profile = await resolveProfile');
  assert.ok(profileRead > 0);
  const preflight = preview.slice(0, profileRead);
  assert.match(preflight, /if \(args\.preparePreferenceReviews !== undefined && typeof args\.preparePreferenceReviews !== 'boolean'\)/);
  assert.match(preflight, /if \(args\?\.recoveryContext !== undefined &&/);
  assert.match(preflight, /for \(const section of \['warmup', 'postWorkoutStretching'\]\)/);
  assert.match(preflight, /for \(const \[index, exercise\] of \(Array\.isArray\(args\.exercises\)/);
});
