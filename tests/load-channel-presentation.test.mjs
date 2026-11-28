import test from 'node:test';
import assert from 'node:assert/strict';
import { presentLoadChannels } from '../plugin/load-channel-presentation.mjs';
import { annotateTimedWorkoutOutput } from '../plugin/workout-data.mjs';
import { projectSessionPlanningView } from '../plugin/session-planning-view.mjs';
import { scanCompletedExerciseHistory } from '../plugin/completed-exercise-history.mjs';
const channel = (side, samples, extra = {}) => ({ channel: `${side}-cable`, samples, unit: 'kg', status: 'reported', complete: true, phase: 'concentric', sourcePath: `detail.${side}Weights`, ...extra });

test('combined display requires simultaneous complete constant channels of the same phase and unit', () => {
  const rows = [channel('left', [10, 10]), channel('right', [10, 10])];
  assert.equal(presentLoadChannels(rows, { preference: 'combined', execution: 'simultaneous' }).combined.value, 20);
  assert.equal(presentLoadChannels(rows).combined.status, 'unavailable');
  for (const extra of [{ phase: 'eccentric' }, { phase: 'unknown' }, { unit: 'lb' }, { complete: false }])
    assert.equal(presentLoadChannels([rows[0], channel('right', [10], extra)], { execution: 'simultaneous' }).combined.status, 'unavailable');
  assert.equal(presentLoadChannels([channel('left', [5, 10]), channel('right', [10, 5])], { execution: 'simultaneous' }).combined.status, 'unavailable');
});

test('actual MCP planning and exercise-history projections preserve channel presentation without raw samples', async () => {
  const source = { training_id: 42, kind: 'program', weightUnit: 'kg', detail: [{ actionLibraryGroupId: 116, title: 'Cable movement', completionMethod: 1, finishedReps: [{ finishedCount: 2, targetCount: 2, trainingInfoDetail: { leftWeights: [10, 12], rightWeights: [11, 13] } }] }] };
  const full = JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(source)));
  const planning = projectSessionPlanningView(full);
  assert.match(planning.exercises[0].sets[0].loadChannelPresentation.text, /lewa linka: 10–12 kg/);
  assert.doesNotMatch(JSON.stringify(planning), /"samples"/);
  const history = await scanCompletedExerciseHistory({ groupId: 116, summaries: [{ training_id: 42, date: '2026-09-29', kind: 'program' }], displayUnit: 'kg', now: new Date('2026-10-02T12:00:00Z'), fetchSession: async () => ({ payload: source, source: 'cli-session-detail' }) });
  assert.match(history.matches[0].sets[0].loadChannelPresentation.text, /prawa linka: 11–13 kg/);
  assert.equal(history.matches[0].sets[0].loadChannelPresentation.combined.status, 'unavailable');
  assert.deepEqual(full.detail, source.detail);
});

test('one cable, asymmetric channels, missing data and phases retain their actual meaning', () => {
  const one = presentLoadChannels([channel('right', [0, 12])]);
  assert.match(one.text, /prawa linka: 0–12 kg/);
  assert.equal(one.channels[0].status, 'not-reported');
  assert.equal(one.combined.status, 'unavailable');
  const asym = presentLoadChannels([channel('left', [9]), channel('right', [11])], { preference: 'combined', execution: 'simultaneous' });
  assert.equal(asym.combined.value, 20);
  assert.match(asym.text, /lewa linka: 9 kg/);
  assert.match(asym.text, /prawa linka: 11 kg/);
  const unknownUnit = presentLoadChannels([channel('left', [10], { unit: 'unknown' })]);
  assert.equal(unknownUnit.status, 'reported-channels');
  assert.match(unknownUnit.text, /10 \(jednostka nieznana\)/);
  assert.doesNotMatch(unknownUnit.text, /kg|lb/);
  assert.equal(presentLoadChannels([{ channel: 'aggregate-weights', status: 'reported', samples: [20], unit: 'kg' }]).status, 'scalar-only');
});

test('actual bounded history makes truncation visible in text while retaining unknown-unit values', () => {
  const source = { detail: [{ title: 'Cable', completionMethod: 1, finishedReps: [{ finishedCount: 2, trainingInfoDetail: { leftWeights: Array(201).fill(10), rightWeights: [12] } }] }] };
  const output = JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(source)));
  const display = output.gmCoachSessionSummary.exercises[0].sets[0].loadChannelPresentation;
  assert.match(display.text, /10 \(jednostka nieznana\).*częściowy odczyt \(próbki obcięte\)/);
  assert.equal(display.channels[0].truncated, true);
  assert.equal(display.combined.status, 'unavailable');
  const missingCompleteness = presentLoadChannels([channel('left', [10], { complete: undefined })]);
  assert.match(missingCompleteness.text, /kompletność niepotwierdzona/);
  assert.doesNotMatch(missingCompleteness.text, /próbki obcięte/);
});

test('distinct phases on one cable remain separate readings and never sum across phases', () => {
  const rows = [channel('left', [10]), channel('left', [12], { phase: 'eccentric' }), channel('right', [10]), channel('right', [14], { phase: 'eccentric' })];
  const before = JSON.stringify(rows);
  const output = presentLoadChannels(rows, { execution: 'simultaneous', preference: 'combined' });
  assert.equal(output.channels[0].status, 'reported-phases');
  assert.match(output.text, /10 kg \(faza koncentryczna\)/);
  assert.match(output.text, /12 kg \(faza ekscentryczna\)/);
  assert.deepEqual(output.combined.phaseReadings.map(row => [row.phase, row.value]), [['concentric', 20], ['eccentric', 26]]);
  assert.equal(JSON.stringify(rows), before);
  const conflicting = presentLoadChannels([channel('left', [10]), channel('left', [12])]);
  assert.equal(conflicting.channels[0].status, 'unknown');
  assert.match(conflicting.text, /sprzeczne odczyty: 10 kg.*12 kg/);
});

test('actual public history transform exposes cable display and preferences never change original data', () => {
  for (const unit of ['kg', 'lb']) {
    const source = { weightUnit: unit, detail: [{ groupId: 42, title: 'Cable movement', unit: 'reps', finishedReps: [{ finishedCount: 10, targetCount: 10, trainingInfoDetail: { leftWeights: [10, 12], rightWeights: [11, 13], weights: [999] } }] }] };
    const raw = JSON.stringify(source);
    const left = JSON.parse(annotateTimedWorkoutOutput(raw, { loadDisplayPreferences: { 42: 'per-side' } }));
    const combined = JSON.parse(annotateTimedWorkoutOutput(raw, { loadDisplayPreferences: { 42: 'combined' } }));
    const a = left.gmCoachSessionSummary.exercises[0].sets[0];
    const b = combined.gmCoachSessionSummary.exercises[0].sets[0];
    assert.equal(a.loadChannelPresentation.channels[0].unit, unit);
    assert.match(a.loadChannelPresentation.text, /lewa linka: 10–12/);
    assert.match(a.loadChannelPresentation.text, /prawa linka: 11–13/);
    assert.equal(b.loadChannelPresentation.combined.status, 'unavailable');
    delete a.loadChannelPresentation; delete b.loadChannelPresentation;
    assert.deepEqual(a, b);
    assert.deepEqual(left.detail, source.detail);
    assert.deepEqual(combined.detail, source.detail);
    assert.equal(JSON.stringify(source), raw);
  }
});
