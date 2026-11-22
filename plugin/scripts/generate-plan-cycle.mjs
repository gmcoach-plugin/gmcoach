import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex');
const specPath = 'scripts/plan-cycle-atoms.json';
const spec = JSON.parse(read(specPath));
const routing = JSON.parse(read(spec.routing));
const source = read(spec.source);
if (spec.source !== routing.sourcePath || sha(source) !== routing.sourceSha256 || sha(source) !== spec.sourceSha256 || source.length !== routing.sourceDecodedChars) throw Error('Source drift');
if (new Set(spec.atomIds).size !== spec.atomIds.length || spec.atomIds.some((id, index) => !Number.isInteger(id) || (index && id <= spec.atomIds[index - 1]))) throw Error('Atom IDs must be unique and ascending');
const chunks = spec.atomIds.map(id => {
  const atom = routing.atoms[id];
  if (!atom || atom.id !== id || atom.metadata) throw Error(`Invalid atom ${id}`);
  const chunk = source.slice(atom.start, atom.end);
  if (sha(chunk) !== atom.sha256Utf8) throw Error(`Atom drift ${id}`);
  return chunk;
});
const header = '# Ordinary multi-day plan and deload — generated projection\n\nThis file is an exact, ordered projection of the Coach core for a new multi-day plan or deload, including one that compares authorized completed history or replaces calendar reservations without editing old templates. For a real plan also read the complete instructions-account.md, instructions-catalog.md, instructions-design.md, instructions-cycle.md and instructions-write.md modules, plus ../training-science/instructions-core.md and ../training-science/instructions-science.md. Add instructions-history.md for completed results and instructions-saved.md when changing existing reservations. History or health reads require their own authorization. Editing an existing template, reconciling uncertain writes, and unrelated mixed tasks use the full core. Approval, fresh checks and readback remain required for writes.\n\n';
const target = header + chunks.join('');
if (process.argv.includes('--check')) {
  if (sha(target) !== spec.targetSha256 || read(spec.target) !== target) throw Error('Target drift');
} else {
  writeFileSync(resolve(root, spec.target), target, 'utf8');
  spec.targetSha256 = sha(target);
  writeFileSync(resolve(root, specPath), JSON.stringify(spec, null, 2) + '\n', 'utf8');
}
