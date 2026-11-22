import test from 'node:test';
import assert from 'node:assert/strict';
import { inferSmartRmPresetName, resolveGoalBoundSmartRmPresetName } from '../goal-preset-routing.mjs';

test('maps only a clearly stated training adaptation to the matching reference client preset', () => {
  assert.equal(inferSmartRmPresetName('Budowa masy mięśniowej z naciskiem na klatkę'), 'Gain Muscle');
  assert.equal(inferSmartRmPresetName('hipertrofia'), 'Gain Muscle');
  assert.equal(inferSmartRmPresetName('Siła'), 'Strength');
  assert.equal(inferSmartRmPresetName('wytrzymałość'), 'Stamina');
  assert.equal(inferSmartRmPresetName('cardio'), 'Stamina');
});

test('Polish accented growth wording selects muscle only for an affirmative unambiguous goal', () => {
  for (const goal of ['chcę budować mięśnie', 'budować masę mięśniową']) {
    assert.equal(inferSmartRmPresetName(goal), 'Gain Muscle');
    assert.equal(resolveGoalBoundSmartRmPresetName(goal, undefined), 'Gain Muscle');
  }
  assert.equal(inferSmartRmPresetName('nie chcę budować mięśni'), null);
  assert.equal(inferSmartRmPresetName('budować mięśnie i siłę'), null);
});

test('does not equate body-composition outcomes with a machine training preset', () => {
  for (const goal of [
    'Redukcja',
    'redukcja tkanki tłuszczowej',
    'weight loss',
    'fat loss',
    'rekompozycja',
    'rekompozycja i utrzymanie mięśni',
    'przytyć'
  ]) {
    assert.equal(inferSmartRmPresetName(goal), null, goal);
    assert.throws(() => resolveGoalBoundSmartRmPresetName(goal, undefined), /dopytaj.*priorytet/i);
    assert.throws(() => resolveGoalBoundSmartRmPresetName(goal, 'Gain Muscle'), /dopytaj.*priorytet/i);
  }
});

test('requires an explicit primary adaptation when the goal combines multiple presets', () => {
  for (const goal of [
    'hipertrofia i siła',
    'siła oraz wytrzymałość',
    'masa mięśniowa z naciskiem na siłę',
    'strength and endurance'
  ]) {
    assert.equal(inferSmartRmPresetName(goal), null, goal);
    assert.throws(() => resolveGoalBoundSmartRmPresetName(goal, undefined), /łączy kilka celów|jednego głównego bodźca/i, goal);
  }
});

test('keeps preset selection bound to the stated goal and requires a goal or user-selected preset', () => {
  assert.equal(resolveGoalBoundSmartRmPresetName('siła', 'Strength'), 'Strength');
  assert.equal(resolveGoalBoundSmartRmPresetName('budowa masy mięśniowej', undefined), 'Gain Muscle');
  assert.throws(() => resolveGoalBoundSmartRmPresetName('siła', 'Gain Muscle'), /wskazuje preset Strength/);
  assert.equal(resolveGoalBoundSmartRmPresetName(undefined, 'Stamina'), 'Stamina');
  assert.equal(resolveGoalBoundSmartRmPresetName(undefined, undefined), null);
});

test('Polish effort words do not imply a strength goal', () => {
  assert.equal(inferSmartRmPresetName('wydolność wysiłkowa'), 'Stamina');
  assert.equal(inferSmartRmPresetName('wytrzymałość wysiłkowa'), 'Stamina');
  assert.equal(inferSmartRmPresetName('hipertrofia przy umiarkowanym wysiłku'), 'Gain Muscle');
  assert.equal(inferSmartRmPresetName('ogólna tolerancja wysiłku'), null);
  assert.equal(inferSmartRmPresetName('trening siłowy'), 'Strength');
});

test('accepts reference client muscle goal and explicit English hypertrophy phrases', () => {
  for (const goal of ['muscle', 'muscle growth', 'muscle building', 'building muscle']) {
    assert.equal(inferSmartRmPresetName(goal), 'Gain Muscle', goal);
    assert.equal(resolveGoalBoundSmartRmPresetName(goal, undefined), 'Gain Muscle');
  }
  assert.equal(inferSmartRmPresetName('muscle maintenance'), null);
  assert.equal(inferSmartRmPresetName('muscle growth and strength'), null);
});
test('negated adaptation alone cannot select or authorize a preset', () => {
  for (const goal of ['nie siła', 'nie chcę siły', 'not strength', 'without hypertrophy', 'bez wytrzymałości', 'not muscle growth', 'no strength', 'never strength', 'żadnej siły', 'żadna hipertrofia']) {
    assert.equal(inferSmartRmPresetName(goal), null, goal);
    assert.throws(() => resolveGoalBoundSmartRmPresetName(goal, 'Strength'), /dopytaj.*priorytet/i, goal);
  }
});
test('clear separated exclusions preserve the affirmative adaptation', () => {
  for (const goal of ['hipertrofia, nie siła', 'not strength but hypertrophy', 'nie siła; hipertrofia']) {
    assert.equal(inferSmartRmPresetName(goal), 'Gain Muscle', goal);
  }
  assert.equal(inferSmartRmPresetName('siła bez bólu'), 'Strength');
  for (const goal of ['nie tylko siła', 'not only strength but hypertrophy', 'I do not want strength', 'hipertrofia nie siła', 'siła, nie chcę siły', 'not strength but strength']) {
    assert.equal(inferSmartRmPresetName(goal), null, goal);
  }
});
test('power is unresolved without concrete strength wording; powerlifting remains strength', () => {
  for (const goal of ['power', 'maksymalna moc', 'explosive power', 'power endurance']) {
    assert.equal(inferSmartRmPresetName(goal), goal === 'power endurance' ? 'Stamina' : null, goal);
  }
  assert.equal(inferSmartRmPresetName('powerlifting'), 'Strength');
  assert.equal(inferSmartRmPresetName('strength and power'), 'Strength');
});
