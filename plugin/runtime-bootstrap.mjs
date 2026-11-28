/**
 * First-run runtime bootstrap for plugin installs that do not ship helper binaries
 * (for example a plugin added directly from the GitHub marketplace).
 *
 * Installer-based installs keep using bin/ and node_modules/ next to the plugin.
 * Only when those are missing does GM Coach download, verify and cache:
 *   - speediance-cli from its GitHub release, verified against checksums.txt (SHA-256);
 *   - the pinned @napi-rs/keyring packages, verified with pinned SHA-512 integrity.
 * Files are cached in a per-user directory outside the plugin cache, so app updates
 * and plugin cache replacement do not require another download.
 */
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);
const CLI_RELEASE_API = 'https://api.github.com/repos/stozo04/speediance-cli/releases/latest';
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;

export function runtimeDirectory({ env = process.env, platform = process.platform, homeDirectory = os.homedir() } = {}) {
  const override = typeof env.GM_COACH_RUNTIME_DIR === 'string' ? env.GM_COACH_RUNTIME_DIR.trim() : '';
  if (override) return path.resolve(override);
  if (platform === 'win32') {
    const base = env.LOCALAPPDATA && env.LOCALAPPDATA.trim() ? env.LOCALAPPDATA.trim() : path.join(homeDirectory, 'AppData', 'Local');
    return path.join(base, 'GMCoach', 'runtime');
  }
  if (platform === 'darwin') return path.join(homeDirectory, 'Library', 'Application Support', 'GMCoach', 'runtime');
  const base = env.XDG_DATA_HOME && env.XDG_DATA_HOME.trim() ? env.XDG_DATA_HOME.trim() : path.join(homeDirectory, '.local', 'share');
  return path.join(base, 'gm-coach', 'runtime');
}

export function runtimeTarget({ platform = process.platform, arch = process.arch, report = () => process.report?.getReport?.() } = {}) {
  if (!['win32', 'darwin', 'linux'].includes(platform)) throw new Error('GM Coach supports Windows, macOS and Linux.');
  if (!['x64', 'arm64'].includes(arch)) throw new Error('GM Coach supports x64 and ARM64 processors.');
  let libc;
  if (platform === 'linux') {
    let glibc = null;
    try { glibc = report()?.header?.glibcVersionRuntime ?? null; } catch { glibc = null; }
    libc = glibc ? 'gnu' : 'musl';
  }
  const releaseOs = { win32: 'Windows', darwin: 'Darwin', linux: 'Linux' }[platform];
  const releaseArch = arch === 'arm64' ? 'arm64' : 'x86_64';
  const archiveName = 'speediance-cli_' + releaseOs + '_' + releaseArch + (platform === 'win32' ? '.zip' : '.tar.gz');
  const binaryName = platform === 'win32' ? 'speediance-cli.exe' : 'speediance-cli';
  return { platform, arch, libc, archiveName, binaryName };
}

export function bundledCliPath(options = {}) {
  const target = runtimeTarget(options);
  return path.join(runtimeDirectory(options), 'bin', target.binaryName);
}

function checksumFor(checksumsText, fileName) {
  for (const line of String(checksumsText).split(/\r?\n/)) {
    const match = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (match && match[2].trim() === fileName) return match[1].toLowerCase();
  }
  throw new Error('The speediance-cli release checksums do not list ' + fileName + '.');
}

async function download(fetchImpl, url, accept) {
  let response;
  try {
    response = await fetchImpl(url, { headers: { 'User-Agent': 'gm-coach-runtime-bootstrap', Accept: accept }, signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new Error('Could not download ' + url + '. Check the internet connection.');
  }
  if (!response.ok) throw new Error('Download failed with HTTP ' + response.status + ': ' + url);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_DOWNLOAD_BYTES) throw new Error('The downloaded file is unexpectedly large: ' + url);
  return bytes;
}

async function findFile(directory, name, depth = 0) {
  if (depth > 4) return null;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory()) {
      const found = await findFile(full, name, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function exists(file) {
  try { return (await stat(file)).isFile(); } catch { return false; }
}

export async function installSpeedianceCli({
  fetchImpl = globalThis.fetch,
  extract = async (archive, destination) => { await execFile('tar', ['-xf', archive, '-C', destination], { windowsHide: true, timeout: 120_000 }); },
  ...options
} = {}) {
  const target = runtimeTarget(options);
  const destination = bundledCliPath(options);
  if (await exists(destination)) return destination;
  const release = JSON.parse((await download(fetchImpl, CLI_RELEASE_API, 'application/vnd.github+json')).toString('utf8'));
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const archiveAsset = assets.find(asset => asset?.name === target.archiveName);
  const checksumAsset = assets.find(asset => asset?.name === 'checksums.txt');
  if (!archiveAsset?.browser_download_url || !checksumAsset?.browser_download_url) {
    throw new Error('The latest speediance-cli release does not include ' + target.archiveName + ' and checksums.txt.');
  }
  const archive = await download(fetchImpl, archiveAsset.browser_download_url, 'application/octet-stream');
  const checksums = (await download(fetchImpl, checksumAsset.browser_download_url, 'text/plain')).toString('utf8');
  const expected = checksumFor(checksums, target.archiveName);
  const actual = createHash('sha256').update(archive).digest('hex');
  if (actual !== expected) throw new Error('SHA-256 verification of ' + target.archiveName + ' failed.');

  const binDirectory = path.dirname(destination);
  await mkdir(binDirectory, { recursive: true });
  const work = await mkdtemp(path.join(binDirectory, '.download-'));
  try {
    const archivePath = path.join(work, target.archiveName);
    await writeFile(archivePath, archive);
    const unpacked = path.join(work, 'unpacked');
    await mkdir(unpacked);
    await extract(archivePath, unpacked);
    const binary = await findFile(unpacked, target.binaryName);
    if (!binary) throw new Error('The verified speediance-cli archive does not contain ' + target.binaryName + '.');
    const staged = path.join(work, target.binaryName);
    await copyFile(binary, staged);
    if (target.platform !== 'win32') await chmod(staged, 0o755);
    try {
      await rename(staged, destination);
    } catch (error) {
      if (!(await exists(destination))) throw error;
    }
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
  return destination;
}

export async function installKeyring({ install, ...options } = {}) {
  const target = runtimeTarget(options);
  const root = runtimeDirectory(options);
  await mkdir(root, { recursive: true });
  const installer = install ?? (await import('./scripts/install-keyring-runtime.mjs')).installKeyringRuntime;
  await installer({ root, platform: target.platform, arch: target.arch, libc: target.libc });
  return root;
}

export async function importKeyringFrom(root) {
  const require = createRequire(path.join(root, 'package.json'));
  const resolved = require.resolve('@napi-rs/keyring');
  return import(pathToFileURL(resolved).href);
}

export function createKeyringLoader({
  importBundled = () => import('@napi-rs/keyring'),
  install = installKeyring,
  importFrom = importKeyringFrom,
  directory = () => runtimeDirectory()
} = {}) {
  let pending = null;
  return async function loadKeyring() {
    try {
      return await importBundled();
    } catch (bundledError) {
      if (bundledError?.code !== 'ERR_MODULE_NOT_FOUND' && bundledError?.code !== 'MODULE_NOT_FOUND') throw bundledError;
    }
    try {
      return await importFrom(directory());
    } catch {
      // Not cached yet; install it once below.
    }
    if (!pending) {
      pending = Promise.resolve().then(() => install()).finally(() => { pending = null; });
    }
    await pending;
    return importFrom(directory());
  };
}

export function createCliBootstrap({ install = installSpeedianceCli } = {}) {
  let pending = null;
  let lastError = null;
  async function ensure() {
    if (!pending) {
      pending = Promise.resolve().then(() => install()).then(result => { lastError = null; return result; }, error => { lastError = error; throw error; }).finally(() => { pending = null; });
    }
    return pending;
  }
  return { ensure, lastError: () => lastError };
}
