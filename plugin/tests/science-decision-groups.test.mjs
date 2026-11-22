import test from 'node:test';
import assert from 'node:assert/strict';
import { expandExplicitDecisionGroups } from '../science-decision-groups.mjs';

const bindings = [
  { category: 'set_work_dose', target: 'set:1:1', value: 'unit=reps;reps=8', requiredStatus: 'applied' },
  { category: 'set_work_dose', target: 'set:1:2', value: 'unit=reps;reps=8', requiredStatus: 'applied' },
  { category: 'set_work_dose', target: 'set:1:3', value: 'unit=reps;reps=10', requiredStatus: 'applied' }
];

test('explicit repeated targets expand to canonical individual decisions without inference', () => {
  const shared = { category: 'set_work_dose', value: 'unit=reps;reps=8', status: 'applied', relationship: 'indirect', evidenceIds: ['e1'], sourceAssessments: [{ evidenceId: 'e1', reviewedValue: 'unit=reps;reps=8' }], supportingExcerpts: [], reasoning: 'Reviewed exact dose.' };
  const result = expandExplicitDecisionGroups([{ ...shared, target: 'set:1:3', value: 'unit=reps;reps=10', sourceAssessments: [{ evidenceId: 'e1', reviewedValue: 'unit=reps;reps=10' }] }], [{ ...shared, targets: ['set:1:2', 'set:1:1'] }], bindings);
  assert.deepEqual(result.map(row => row.target), ['set:1:1', 'set:1:2', 'set:1:3']);
  assert.notEqual(result[0].sourceAssessments, result[1].sourceAssessments);
  assert.equal(result[0].sourceAssessments[0].reviewedValue, 'unit=reps;reps=8');
  assert.throws(() => expandExplicitDecisionGroups([], [{ ...shared, targets: ['set:1:3'] }], bindings), /Stale scientific value/);
  assert.throws(() => expandExplicitDecisionGroups([{ ...shared, target: 'set:1:1' }], [{ ...shared, targets: ['set:1:1'] }], bindings), /Duplicate scientific target/);
  assert.throws(() => expandExplicitDecisionGroups([], [{ ...shared, targets: ['set:1:1', 'set:1:1'] }], bindings), /nonempty unique/);
});
