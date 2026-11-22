import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExerciseEntry, normalizePlanEntryIdentity, validateExecutablePlanSections as validate } from '../executable-plan-sections.mjs';

const plan = () => ({ exercises: [
  { id: 116, entryId: 1, section: 'warmup' }, { id: 116, entryId: 2 }, { id: 117, entryId: 3, section: 'stretching' }
], warmup: { status: 'included', items: [{ executionRef: 1 }] }, postWorkoutStretching: { status: 'included', items: [{ executionRef: 3 }] } });

test('repeated catalog groups use distinct entry IDs and explicit executable sections', () => {
  const input = plan();
  const original = JSON.stringify(input);
  const result = validate(input);
  assert.equal(result.executableSectionsValidated, true);
  assert.deepEqual(result.mainEntryIds, [2]);
  assert.deepEqual(result.warmup.entryIds, [1]);
  assert.equal(JSON.stringify(input), original);
  assert.deepEqual(normalizeExerciseEntry({ id: 116 }), { entryId: 116, section: 'main' });
});

test('entry identity is unique and strict without conflating catalog IDs', () => {
  assert.throws(() => normalizePlanEntryIdentity([{ id: 116 }, { id: 116 }]), /unique/);
  for (const entryId of [0, -1, 1.5, '1', true, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => normalizeExerciseEntry({ id: 116, entryId }));
  assert.throws(() => normalizeExerciseEntry({ id: 1, section: 'cooldown' }));
  assert.throws(() => normalizePlanEntryIdentity(Array.from({ length: 201 }, (_, i) => ({ id: i + 1 }))));
});

test('wrong execution order is rejected instead of silently reordered', () => {
  const input = plan();
  [input.exercises[0], input.exercises[1]] = [input.exercises[1], input.exercises[0]];
  assert.throws(() => validate(input), /ordered/);
});

test('included notes-only, wrong-section, nonexistent and duplicate references fail', () => {
  for (const ref of [2, 99, '1', 0]) {
    const input = plan(); input.warmup.items[0].executionRef = ref;
    assert.throws(() => validate(input));
  }
  const notes = plan(); delete notes.warmup.items[0].executionRef;
  assert.throws(() => validate(notes), /executionRef/);
  const duplicate = plan(); duplicate.warmup.items.push({ executionRef: 1 });
  assert.throws(() => validate(duplicate), /unique/);
  const uncovered = plan(); uncovered.exercises.unshift({ id: 118, entryId: 4, section: 'warmup' });
  assert.throws(() => validate(uncovered), /without a matching/);
});

test('independent opt-outs require absent executable entries and empty notes', () => {
  const input = plan(); input.exercises.shift(); input.warmup = { status: 'omitted_user_preference', items: [] };
  assert.equal(validate(input).warmup.status, 'omitted_user_preference');
  input.postWorkoutStretching = { status: 'omitted_user_preference', items: [] };
  assert.throws(() => validate(input), /opt-out/);
  input.exercises.pop();
  assert.equal(validate(input).entryCount, 1);
});

test('main work remains required and missing section status never implies opt-out', () => {
  const input = plan(); input.exercises.splice(1, 1);
  assert.throws(() => validate(input), /main/);
  const missing = plan(); delete missing.warmup;
  assert.throws(() => validate(missing), /explicit status/);
});
