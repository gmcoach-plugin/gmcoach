import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runtimeDirectory, runtimeTarget, bundledCliPath, installSpeedianceCli, installKeyring, createKeyringLoader, createCliBootstrap } from '../plugin/runtime-bootstrap.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fakeFetch(archiveName, archiveBytes, checksum) {
  const calls = [];
  const impl = async url => {
    calls.push(url);
    const body = url.includes('api.github.com') ? Buffer.from(JSON.stringify({ assets: [
      { name: archiveName, browser_download_url: 'https://dl.test/archive' },
      { name: 'checksums.txt', browser_download_url: 'https://dl.test/checksums.txt' }] }))
      : url.endsWith('archive') ? archiveBytes : Buffer.from(checksum + '  ' + archiveName + '\n');
    return { ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
  };
  return { impl, calls };
}

test('runtimeDirectory is per platform and honours GM_COACH_RUNTIME_DIR', () => {
  assert.equal(runtimeDirectory({ env: { LOCALAPPDATA: 'C:\\L' }, platform: 'win32', homeDirectory: 'h' }), path.join('C:\\L', 'GMCoach', 'runtime'));
  assert.equal(runtimeDirectory({ env: {}, platform: 'darwin', homeDirectory: '/h' }), path.join('/h', 'Library', 'Application Support', 'GMCoach', 'runtime'));
  assert.equal(runtimeDirectory({ env: {}, platform: 'linux', homeDirectory: '/h' }), path.join('/h', '.local', 'share', 'gm-coach', 'runtime'));
  assert.equal(runtimeDirectory({ env: { XDG_DATA_HOME: '/x' }, platform: 'linux', homeDirectory: '/h' }), path.join('/x', 'gm-coach', 'runtime'));
  assert.equal(runtimeDirectory({ env: { GM_COACH_RUNTIME_DIR: '/over' }, platform: 'win32' }), path.resolve('/over'));
});

test('runtimeTarget maps platform and arch to release archive', () => {
  assert.equal(runtimeTarget({ platform: 'win32', arch: 'x64' }).archiveName, 'speediance-cli_Windows_x86_64.zip');
  assert.equal(runtimeTarget({ platform: 'darwin', arch: 'arm64' }).archiveName, 'speediance-cli_Darwin_arm64.tar.gz');
  assert.equal(runtimeTarget({ platform: 'linux', arch: 'x64', report: () => ({ header: {} }) }).libc, 'musl');
  assert.equal(runtimeTarget({ platform: 'linux', arch: 'x64', report: () => ({ header: { glibcVersionRuntime: '2.39' } }) }).libc, 'gnu');
  assert.throws(() => runtimeTarget({ platform: 'freebsd', arch: 'x64' }));
  assert.throws(() => runtimeTarget({ platform: 'linux', arch: 'ia32' }));
});

async function withTemp(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gmc-rt-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
const extractStub = async (archive, destination) => { await writeFile(path.join(destination, 'speediance-cli.exe'), 'BIN'); };

test('installSpeedianceCli downloads, verifies SHA-256 and installs once', async () => withTemp(async dir => {
  const options = { env: { GM_COACH_RUNTIME_DIR: dir }, platform: 'win32', arch: 'x64' };
  const archive = Buffer.from('zip-bytes');
  const { impl, calls } = fakeFetch('speediance-cli_Windows_x86_64.zip', archive, sha(archive));
  const out = await installSpeedianceCli({ ...options, fetchImpl: impl, extract: extractStub });
  assert.equal(out, bundledCliPath(options));
  assert.equal(await readFile(out, 'utf8'), 'BIN');
  const count = calls.length;
  await installSpeedianceCli({ ...options, fetchImpl: impl, extract: extractStub });
  assert.equal(calls.length, count, 'second call must not download');
}));

test('installSpeedianceCli rejects a wrong SHA-256 and leaves nothing installed', async () => withTemp(async dir => {
  const options = { env: { GM_COACH_RUNTIME_DIR: dir }, platform: 'win32', arch: 'x64' };
  const { impl } = fakeFetch('speediance-cli_Windows_x86_64.zip', Buffer.from('tampered'), sha(Buffer.from('other')));
  await assert.rejects(installSpeedianceCli({ ...options, fetchImpl: impl, extract: extractStub }), /SHA-256/);
  await assert.rejects(readFile(bundledCliPath(options)));
}));

test('installKeyring passes cache root and target to the installer', async () => withTemp(async dir => {
  let seen;
  const root = await installKeyring({ env: { GM_COACH_RUNTIME_DIR: dir }, platform: 'win32', arch: 'x64', install: async args => { seen = args; } });
  assert.equal(root, dir);
  assert.deepEqual(seen, { root: dir, platform: 'win32', arch: 'x64', libc: undefined });
}));

test('keyring loader: bundled, then cache, then installs exactly once', async () => {
  const missing = Object.assign(new Error('x'), { code: 'ERR_MODULE_NOT_FOUND' });
  const bundled = { name: 'bundled' };
  assert.equal(await createKeyringLoader({ importBundled: async () => bundled, install: async () => assert.fail() })(), bundled);
  const cached = { name: 'cached' };
  assert.equal(await createKeyringLoader({ importBundled: async () => { throw missing; }, importFrom: async () => cached, install: async () => assert.fail() })(), cached);
  let installed = 0;
  const loader = createKeyringLoader({
    importBundled: async () => { throw missing; },
    importFrom: async () => { if (!installed) throw missing; return cached; },
    install: async () => { await new Promise(r => setTimeout(r, 10)); installed++; },
    directory: () => 'd'
  });
  const [a, b] = await Promise.all([loader(), loader()]);
  assert.equal(a, cached); assert.equal(b, cached); assert.equal(installed, 1);
  await assert.rejects(createKeyringLoader({ importBundled: async () => { throw new Error('boom'); } })(), /boom/);
});

test('createCliBootstrap shares one pending install and records errors', async () => {
  let n = 0;
  const ok = createCliBootstrap({ install: async () => { n++; return 'p'; } });
  assert.deepEqual(await Promise.all([ok.ensure(), ok.ensure()]), ['p', 'p']);
  assert.equal(n, 1);
  const bad = createCliBootstrap({ install: async () => { throw new Error('no'); } });
  await assert.rejects(bad.ensure(), /no/);
  assert.equal(bad.lastError().message, 'no');
});
