import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const read = path => readFileSync(new URL('../plugin/' + path, import.meta.url), 'utf8');
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');

test('cycle projection has exact, ordered atom coverage and fixed source/target hashes', {skip:'source-tree only: needs unsanitized core hash, AGENTS.md, dev atoms or tests in package manifest'}, () => {
  const spec = JSON.parse(read('scripts/plan-cycle-atoms.json'));
  const routing = JSON.parse(read(spec.routing));
  const source = read(spec.source), target = read(spec.target);
  assert.equal(spec.source, routing.sourcePath);
  assert.equal(sha(source), routing.sourceSha256);
  assert.equal(sha(source), spec.sourceSha256);
  assert.equal(source.length, routing.sourceDecodedChars);
  assert.equal(sha(target), spec.targetSha256);
  assert.ok(target.length < source.length, 'projection is bounded below full core');
  assert.deepEqual(spec.atomIds, [...new Set(spec.atomIds)].sort((a,b) => a-b));
  const selected = spec.atomIds.map(id => {
    const atom = routing.atoms[id];
    assert.equal(atom?.id, id);
    assert.equal(atom.metadata, false);
    const chunk = source.slice(atom.start, atom.end);
    assert.equal(sha(chunk), atom.sha256Utf8);
    return chunk;
  });
  assert.ok(target.endsWith(selected.join('')), 'no atom changed, omitted, or reordered');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../plugin/scripts/generate-plan-cycle.mjs', import.meta.url)), '--check'], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
});

test('multi-day and deload projection retains shared account, science, write and readback guards', () => {
  const spec = JSON.parse(read('scripts/plan-cycle-atoms.json'));
  for (const id of [0, 28, 32, 35, 37, 41, 46, 48, 49, 55, 56, 61, 82, 85, 92, 95, 97, 98, 112, 117, 119, 120]) assert.ok(spec.atomIds.includes(id), `required guard atom ${id}`);
  const text = read(spec.target);
  for (const phrase of ['gm_coach_get_training_profile', 'canCreatePlan=false', 'speediance_get_owned_equipment', 'speediance_preview_program', 'finalRecoveryRequired', 'styleCompatibilityReview.scientificReviewDigest']) assert.ok(text.includes(phrase), phrase);
  for (const module of ['account', 'catalog', 'design', 'cycle', 'write']) assert.ok(text.includes(module), module);
  for (const module of ['instructions-core.md', 'instructions-science.md']) assert.ok(text.includes(module), module);
  assert.match(text, /History or health reads require their own authorization/);
  assert.match(text, /Approval, fresh checks and readback remain required/);
  assert.match(text, /exact, ordered projection/);
  assert.match(read('SKILL.md'), /nowy wielotygodniowy cykl albo złożony deload.*`instructions-plan-cycle\.generated\.md`/);
  assert.match(read('skills/speediance-coach/SKILL.md'), /złożony deload, wybierz `instructions-plan-cycle\.generated\.md`/);
  assert.match(read('skills/training-science/SKILL.md'), /Złożony cykl lub deload: `instructions-plan-cycle\.md` i `instructions-science\.md`/);
  assert.equal(read('skills/training-science/instructions-plan-cycle.md'), read('skills/training-science/instructions-core.md'));
});

test('packaged plan modules retain history, goal coverage, selective science and read-only list meaning', () => {
  const cycle = read('skills/speediance-coach/instructions-cycle.md');
  const write = read('skills/speediance-coach/instructions-write.md');
  const science = read('skills/training-science/SKILL.md');
  for (const phrase of ['rzeczywiście wykonanych sesji', 'wszystkie dotąd trenowane partie', 'pokrycie każdego określonego celu', 'gm_coach_prepare_science_scope', 'gm_coach_get_athlete_snapshot']) assert.ok(cycle.includes(phrase), phrase);
  assert.match(write, /canUseListForMutation=false.*nie jest oceną gotowości nowego programu/);
  assert.match(science, /każdej konkretnej decyzji i dokładnej wartości dawki/);
});
