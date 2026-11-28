import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { reconcileTrainingStyleAnswers } from '../plugin/coaching-profile.mjs';
import { assertPlanMovementRestrictionsAllowed, validateMovementRestrictions, validatePlanMovementRestrictions } from '../plugin/injury-safety.mjs';

const serverSource = await readFile(fileURLToPath(new URL('../plugin/mcp_server.mjs', import.meta.url)), 'utf8');

test('exact neutral declaration suffix permits no restrictions without removing medical notes', () => {
  for (const text of ['Brak urazów (deklaracja użytkownika).', 'Brak urazów (deklaracja użytkownika)', 'Brak urazów ani ograniczeń (deklaracja użytkownika).']) {
    const result = validateMovementRestrictions(text, ['Barbell Squat', 'Overhead Press']);
    assert.equal(result.canProceed, true, text);
    assert.deepEqual(result.warnings, [], text);
  }
  for (const text of ['Brak urazów (ból barku).', 'Brak urazów (deklaracja użytkownika, ból barku).', 'Brak urazów (deklaracja użytkownika). Ale boli bark przy overhead press.', 'Brak urazów (ból barku) (deklaracja użytkownika).']) {
    const result = validateMovementRestrictions(text, ['Overhead Press']);
    assert.equal(result.canProceed, false, text);
  }
});

test('missing or explicitly empty limitations never block a plan', () => {
  for (const limitations of [undefined, null, '', '   ', 'Brak urazów ani ograniczeń', 'No injuries or restrictions']) {
    const result = validateMovementRestrictions(limitations, ['Barbell Squat']);
    assert.equal(result.status, 'allowed', String(limitations));
    assert.equal(result.canProceed, true, String(limitations));
    assert.deepEqual(result.blocks, []);
    assert.deepEqual(result.warnings, []);
  }
});

test('Polish broad pressing restriction blocks named upper-body presses but not leg press', () => {
  const result = validateMovementRestrictions('Ograniczyć bolesne wyciskanie', [
    { id: 'bench', exerciseName: 'Barbell Bench Press' },
    { id: 'shoulder', name: 'Overhead Press' },
    { id: 'legs', title: 'Leg Press' }
  ]);

  assert.equal(result.status, 'blocked');
  assert.equal(result.canProceed, false);
  assert.deepEqual(result.blocks.map((block) => block.exerciseId), ['bench', 'shoulder']);
  assert.deepEqual(result.warnings, []);
});

test('an overhead-press restriction does not spread to horizontal presses', () => {
  const result = validateMovementRestrictions('Bez wyciskania nad głowę', [
    'Shoulder Press',
    'Bench Press',
    'Barbell Squat'
  ]);

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blocks.map((block) => block.exerciseName), ['Shoulder Press']);
  assert.deepEqual(result.warnings, []);
});

test('known squat and deadlift restrictions block exact named movements', () => {
  const result = validateMovementRestrictions('Bez przysiadów i martwego ciągu', [
    'Barbell Squat',
    'Romanian Deadlift',
    'Chest Supported Row'
  ]);

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blocks.map((block) => block.matchedMovement), ['squat', 'deadlift']);
});

test('English prohibition wording is recognized without stemming across words', () => {
  const result = validateMovementRestrictions("Don't deadlift", ['Romanian Deadlift', 'Lat Pulldown']);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blocks.map((block) => block.exerciseName), ['Romanian Deadlift']);
});

test('pain reported during a named movement blocks that movement', () => {
  const result = validateMovementRestrictions('Boli mnie kolano przy bieganiu', [
    'Running',
    'Leg Extension'
  ]);

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blocks.map((block) => block.exerciseName), ['Running']);
});

test('a named restriction with a separate body-region limitation also requires review', () => {
  const result = validateMovementRestrictions('Unikać martwego ciągu z powodu bólu pleców', [
    'Romanian Deadlift',
    'Chest Supported Row'
  ]);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blocks.map((block) => block.exerciseName), ['Romanian Deadlift']);
  assert.ok(result.warnings.some((warning) => warning.code === 'broad_region_requires_review'));
});

test('affirmative no-injury and pain-free statements do not become restrictions', () => {
  const noInjuries = validateMovementRestrictions('No injuries but avoid squats', ['Barbell Squat']);
  assert.equal(noInjuries.status, 'blocked');
  assert.deepEqual(noInjuries.blocks.map((block) => block.exerciseName), ['Barbell Squat']);
  assert.deepEqual(noInjuries.warnings, []);

  const painFree = validateMovementRestrictions('No pain during squatting', ['Barbell Squat']);
  assert.equal(painFree.status, 'allowed');
  assert.deepEqual(painFree.blocks, []);
  assert.deepEqual(painFree.warnings, []);
});

test('broad body-region restrictions block a directly named exercise and require review', () => {
  const result = validateMovementRestrictions('Nie obciążać barku', [
    'Shoulder Press',
    'Chest Press'
  ]);

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blocks.map((block) => block.exerciseName), ['Shoulder Press']);
  assert.equal(result.warnings[0]?.code, 'broad_region_requires_review');
  assert.equal(result.canProceed, false);
});

test('ambiguous restriction wording does not silently pass', () => {
  for (const limitations of ['Bark', 'Poprzedni uraz', 'Avoid twisting']) {
    const result = validateMovementRestrictions(limitations, ['Cable Fly']);
    assert.equal(result.status, 'review-required', limitations);
    assert.equal(result.canProceed, false, limitations);
    assert.deepEqual(result.blocks, []);
    assert.ok(result.warnings.length > 0);
  }
});

test('a recognized restriction unrelated to planned exercises permits the plan', () => {
  const result = validateMovementRestrictions('Unikać przysiadów', [
    'Lat Pulldown',
    'Chest Supported Row'
  ]);

  assert.equal(result.status, 'allowed');
  assert.equal(result.canProceed, true);
  assert.deepEqual(result.blocks, []);
  assert.deepEqual(result.warnings, []);
});

test('a press variant outside the explicit name map requires review', () => {
  const result = validateMovementRestrictions('Unikać wyciskania', ['Cable Press']);
  assert.equal(result.status, 'review-required');
  assert.deepEqual(result.blocks, []);
  assert.equal(result.warnings[0]?.code, 'exercise_movement_name_ambiguous');
});

test('restriction text cannot be validated without a non-empty plan and exercise names', () => {
  const noPlan = validateMovementRestrictions('Unikać przysiadów', []);
  assert.equal(noPlan.status, 'review-required');
  assert.equal(noPlan.warnings[0]?.code, 'planned_exercises_missing');

  const unnamed = validateMovementRestrictions('Unikać przysiadów', [{ id: 'unknown' }]);
  assert.equal(unnamed.status, 'review-required');
  assert.equal(unnamed.warnings[0]?.code, 'exercise_name_missing');
});

test('malformed restriction input fails closed for planning', () => {
  const result = validateMovementRestrictions({ limitation: 'none' }, ['Squat']);
  assert.equal(result.status, 'review-required');
  assert.equal(result.canProceed, false);
  assert.equal(result.warnings[0]?.code, 'invalid_restriction_text');
});

test('plan gate checks main exercises and included warmup/stretch movements', () => {
  const plan = {
    exercises: [{ id: 11, title: 'Chest Press' }],
    warmup: { status: 'included', items: [{ kind: 'dynamic_mobility', activity: 'Bodyweight Squat' }] },
    postWorkoutStretching: { status: 'included', items: [{ method: 'static', target: 'knee flexion' }] }
  };
  const result = validatePlanMovementRestrictions('Unikać przysiadów i zgięcia kolana', plan);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blocks.map((block) => block.exerciseName), ['Bodyweight Squat', 'static knee flexion']);
});

test('plan gate throws on both matched conflicts and unresolved limitations', () => {
  const plan = { exercises: [{ title: 'Barbell Squat' }] };
  assert.throws(() => assertPlanMovementRestrictionsAllowed('Avoid squats', plan), /Plan zablokowany.*Barbell Squat/);
  assert.throws(() => assertPlanMovementRestrictionsAllowed('Not sure', plan), /wymagany jest przegląd/);
  assert.doesNotThrow(() => assertPlanMovementRestrictionsAllowed('Brak urazów ani ograniczeń', plan));
});

test('preview and create share the effective saved-or-ephemeral limitation gate', () => {
  assert.match(serverSource, /import \{ assertPlanMovementRestrictionsAllowed \} from '\.\/injury-safety\.mjs';/);
  assert.match(serverSource, /const profileData = reconcileTrainingStyleAnswers\(storedRecord\?\.profileData \|\| \{\}, ephemeralAnswers\);[\s\S]{0,2000}injuryLimitations: profileData\.injuryLimitations,/);
  const auditStart = serverSource.indexOf('async function auditTrainingProfileForPlan(');
  const mergeStart = serverSource.indexOf('  const profileData = ', auditStart);
  const mergeEnd = serverSource.indexOf('\n  const audit = ', mergeStart);
  assert.ok(auditStart >= 0 && mergeStart > auditStart && mergeEnd > mergeStart);
  const merge = new Function('storedRecord', 'ephemeralAnswers', 'reconcileTrainingStyleAnswers', `${serverSource.slice(mergeStart, mergeEnd)}; return profileData;`);
  const stored = { profileData: { injuryLimitations: 'Avoid squats', trainingStyleStatus: 'specified', preferredTrainingStyle: 'Full body' } };
  const retained = merge(stored, { trainingStyleStatus: 'declined' }, reconcileTrainingStyleAnswers);
  assert.equal(retained.injuryLimitations, 'Avoid squats');
  assert.equal(retained.preferredTrainingStyle, undefined);
  assert.throws(() => assertPlanMovementRestrictionsAllowed(retained.injuryLimitations, { exercises: [{ title: 'Barbell Squat' }] }), /Plan zablokowany.*Barbell Squat/);
  const replaced = merge(stored, { injuryLimitations: 'Avoid bench press', trainingStyleStatus: 'unknown' }, reconcileTrainingStyleAnswers);
  assert.equal(replaced.injuryLimitations, 'Avoid bench press');
  assert.throws(() => assertPlanMovementRestrictionsAllowed(replaced.injuryLimitations, { exercises: [{ title: 'Barbell Bench Press' }] }), /Plan zablokowany.*Barbell Bench Press/);

  assert.match(serverSource, /const resolvedPlan = \{ \.\.\.plan, evidence, exercises: resolvedExercises, decisionEvidence, resolvedRecoveryContext \};\s*assertPlanMovementRestrictionsAllowed\(interview\.injuryLimitations, resolvedPlan\);/);
  assert.match(serverSource, /case 'speediance_preview_program'/);
  assert.match(serverSource, /case 'speediance_create_program'/);
  const previewStart = serverSource.indexOf("case 'speediance_preview_program':");
  const createStart = serverSource.indexOf("case 'speediance_create_program':");
  const createEnd = serverSource.indexOf('\n    default:', createStart + 10);
  assert.ok(previewStart >= 0 && createStart > previewStart && createEnd > createStart);
  const previewFlow = serverSource.slice(previewStart, createStart);
  const createFlow = serverSource.slice(createStart, createEnd);
  const assertSharedValidationOrder = (flow, intakeExpression) => {
    const catalogRead = flow.indexOf('const exerciseCatalog = await currentExerciseCatalog(profile, fingerprint);');
    const normalized = flow.indexOf('const normalizedPlan = normalizePlan(', catalogRead);
    const validated = flow.indexOf('const validated = await validatePlanForProfile(', normalized);
    assert.ok(catalogRead >= 0 && normalized > catalogRead && validated > normalized, 'each flow reads catalog, normalizes, then validates in order');
    assert.match(flow.slice(validated), new RegExp(`^const validated = await validatePlanForProfile\\(normalizedPlan, profile, fingerprint, ${intakeExpression}, exerciseCatalog`));
  };
  assertSharedValidationOrder(previewFlow, 'args\\.intakeAnswers');
  assertSharedValidationOrder(createFlow, 'createArgs\\.intakeAnswers');
});

test('installer and package manifests include the runtime gate and its offline regression test', async () => {
  const filesManifest = await readFile(new URL('../plugin/scripts/plugin-files.txt', import.meta.url), 'utf8');
  const packager = await readFile(new URL('../plugin/scripts/package.ps1', import.meta.url), 'utf8');
  const windowsInstaller = await readFile(new URL('../plugin/scripts/install-codex-desktop.ps1', import.meta.url), 'utf8');
  const unixInstaller = await readFile(new URL('../plugin/scripts/install-codex-desktop.sh', import.meta.url), 'utf8');
  for (const path of ['injury-safety.mjs', 'tests/injury-safety.test.mjs']) {
    assert.ok(filesManifest.split(/\r?\n/).includes(path), `canonical allowlist includes ${path}`);
    for (const [file, contents] of [
      ['scripts/package.ps1', packager],
      ['scripts/install-codex-desktop.ps1', windowsInstaller],
      ['scripts/install-codex-desktop.sh', unixInstaller]
    ]) assert.ok(contents.includes(`'${path}'`), `${file} includes ${path}`);
  }
});
