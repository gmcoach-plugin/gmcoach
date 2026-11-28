#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--force') { result.force = true; continue; }
    if (!['--root', '--platform', '--arch', '--libc'].includes(flag)) {
      throw new Error(`Unknown option: ${flag}`);
    }
    const value = args[++index];
    if (!value) throw new Error(`Missing value for ${flag}`);
    result[flag.slice(2)] = value;
  }
  if (!result.root || !result.platform || !result.arch) {
    throw new Error('Usage: install-keyring-runtime.mjs --root <plugin staging dir> --platform <win32|darwin|linux> --arch <x64|arm64> [--libc <gnu|musl>] [--force]');
  }
  return result;
}

function targetKey({ platform, arch, libc }) {
  if (!['win32', 'darwin', 'linux'].includes(platform) || !['x64', 'arm64'].includes(arch)) {
    throw new Error('The OS credential store runtime is supported only on Windows, macOS, and Linux x64/ARM64.');
  }
  if (platform === 'linux') {
    if (!['gnu', 'musl'].includes(libc)) throw new Error('Linux keyring runtime requires an explicit gnu or musl target.');
    return `linux-${arch}-${libc}`;
  }
  return `${platform}-${arch}`;
}

function safeTarPath(entryName) {
  if (!entryName.startsWith('package/')) throw new Error('The pinned keyring archive contains an unexpected path.');
  const relative = entryName.slice('package/'.length);
  const normalized = path.posix.normalize(relative);
  if (!relative || normalized === '.' || normalized.startsWith('../') || normalized === '..'
      || normalized.startsWith('/') || normalized.includes('\\') || normalized.includes('\0')) {
    throw new Error('The pinned keyring archive contains an unsafe path.');
  }
  return normalized;
}

function octalSize(field) {
  const text = field.toString('ascii').replace(/\0.*$/, '').trim();
  if (!text) return 0;
  if (!/^[0-7]+$/.test(text)) throw new Error('The pinned keyring archive has an invalid tar header.');
  return Number.parseInt(text, 8);
}

async function extractNpmArchive(gzipBytes, destination) {
  if (gzipBytes.length > MAX_ARCHIVE_BYTES) throw new Error('The pinned keyring package archive is too large.');
  let tarBytes;
  try { tarBytes = gunzipSync(gzipBytes, { maxOutputLength: MAX_UNCOMPRESSED_BYTES }); }
  catch { throw new Error('Could not safely unpack the pinned keyring package.'); }
  if (tarBytes.length > MAX_UNCOMPRESSED_BYTES) throw new Error('The pinned keyring package expands beyond the permitted size.');

  let offset = 0;
  let writtenBytes = 0;
  let entryCount = 0;
  while (offset + 512 <= tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    offset += 512;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const fullName = prefix ? `${prefix}/${name}` : name;
    const type = String.fromCharCode(header[156] || 0);
    const size = octalSize(header.subarray(124, 136));
    const target = path.join(destination, safeTarPath(fullName));
    entryCount++;
    if (entryCount > 200) throw new Error('The pinned keyring package contains too many files.');

    if (type === '5') {
      await mkdir(target, { recursive: true });
    } else if (type === '0' || type === '\0') {
      if (offset + size > tarBytes.length) throw new Error('The pinned keyring archive is truncated.');
      writtenBytes += size;
      if (writtenBytes > MAX_UNCOMPRESSED_BYTES) throw new Error('The pinned keyring package expands beyond the permitted size.');
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, tarBytes.subarray(offset, offset + size), { mode: 0o600, flag: 'wx' });
    } else {
      // Do not extract links, PAX overrides, devices, or other tar entry types.
      throw new Error('The pinned keyring package contains an unsupported tar entry.');
    }
    offset += Math.ceil(size / 512) * 512;
  }
  const packageJsonPath = path.join(destination, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  if (!packageJson.name || !packageJson.version) throw new Error('The extracted keyring package has invalid metadata.');
  return packageJson;
}

async function fetchAndVerify(name, integrity) {
  const expectedPrefix = 'sha512-';
  if (typeof integrity !== 'string' || !integrity.startsWith(expectedPrefix)) {
    throw new Error(`The pinned integrity value is invalid for ${name}.`);
  }
  const version = JSON.parse(await readFile(path.join(SCRIPT_DIR, 'keyring-runtime.json'), 'utf8')).version;
  const tarballName = name.slice('@napi-rs/'.length);
  const url = `https://registry.npmjs.org/${name}/-/${tarballName}-${version}.tgz`;
  let response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(45_000) }); }
  catch { throw new Error(`Could not download the pinned OS credential-store package ${name}.`); }
  if (!response.ok) throw new Error(`The pinned OS credential-store package ${name} returned HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error(`The pinned OS credential-store package ${name} is too large.`);
  const actual = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  if (actual !== integrity) throw new Error(`Integrity verification failed for the pinned OS credential-store package ${name}.`);
  return bytes;
}

async function packageIsInstalled(directory, name, version, nativePattern = null) {
  try {
    const packageJson = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    if (packageJson.name !== name || packageJson.version !== version) return false;
    if (nativePattern) {
      const files = await readdir(directory);
      if (!files.some((file) => nativePattern.test(file))) return false;
    }
    return true;
  } catch { return false; }
}

async function installPackage({ root, name, integrity, version, force, nativePattern }) {
  const destination = path.join(root, 'node_modules', ...name.split('/'));
  if (!force && await packageIsInstalled(destination, name, version, nativePattern)) return;
  const bytes = await fetchAndVerify(name, integrity);
  const parent = path.dirname(destination);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(path.join(parent, `.gm-coach-keyring-${process.pid}-`));
  const backup = `${destination}.previous-${randomBytes(8).toString('hex')}`;
  let movedOld = false;
  try {
    const packageJson = await extractNpmArchive(bytes, staging);
    if (packageJson.name !== name || packageJson.version !== version) {
      throw new Error(`The downloaded keyring archive metadata does not match the pinned package ${name}@${version}.`);
    }
    const nativeFiles = await readdir(staging);
    if (nativePattern && !nativeFiles.some((file) => nativePattern.test(file))) {
      throw new Error(`The pinned package ${name} did not include the expected native binding.`);
    }
    try {
      const existing = await lstat(destination);
      if (!existing.isDirectory() || existing.isSymbolicLink()) {
        throw new Error(`Refusing to replace an unexpected keyring runtime path: ${name}.`);
      }
      await rename(destination, backup);
      movedOld = true;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    try {
      await rename(staging, destination);
    } catch (error) {
      if (movedOld) {
        await rename(backup, destination).catch(() => {});
        movedOld = false;
      }
      throw error;
    }
    if (movedOld) {
      movedOld = false;
      await rm(backup, { recursive: true, force: true }).catch(() => {});
    }
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    if (movedOld) await rename(backup, destination).catch(() => {});
  }
}

export async function installKeyringRuntime({ root, platform, arch, libc, force = false }) {
  const runtime = JSON.parse(await readFile(path.join(SCRIPT_DIR, 'keyring-runtime.json'), 'utf8'));
  const target = targetKey({ platform, arch, libc });
  const platformPackage = runtime.targets[target];
  if (!platformPackage) throw new Error(`No pinned keyring binding is published for ${target}.`);
  const resolvedRoot = path.resolve(root);
  await installPackage({ root: resolvedRoot, name: runtime.root.name, integrity: runtime.root.integrity, version: runtime.version, force: Boolean(force) });
  const nativeTarget = platform === 'win32'
    ? `win32-${arch}-msvc`
    : target;
  const nativePattern = new RegExp(`^keyring\\.${nativeTarget}\\.node$`);
  await installPackage({ root: resolvedRoot, name: platformPackage.name, integrity: platformPackage.integrity, version: runtime.version, force: Boolean(force), nativePattern });
  return { name: runtime.root.name, version: runtime.version, target };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const installed = await installKeyringRuntime(args);
  process.stdout.write(`Installed pinned ${installed.name}@${installed.version} for ${installed.target}.\n`);
}

function invokedDirectly() {
  if (!process.argv[1]) return false;
  const self = fileURLToPath(import.meta.url);
  const invoked = path.resolve(process.argv[1]);
  return process.platform === 'win32' ? self.toLowerCase() === invoked.toLowerCase() : self === invoked;
}

if (invokedDirectly()) {
  main().catch((error) => {
    process.stderr.write(`${error?.message || 'Failed to install the pinned OS credential-store runtime.'}\n`);
    process.exitCode = 1;
  });
}
