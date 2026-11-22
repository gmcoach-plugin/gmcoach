import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const UNRESOLVED_TEMPLATE = /\$\{[^}]+\}/;

/**
 * Resolve persistent GM Coach data independently of the chat's working directory.
 * MCP hosts may provide PLUGIN_DATA; standalone/manual launches fall back to the
 * user's Codex data directory instead of silently creating an empty profile in CWD.
 */
async function hasLegacyProfile(directory) {
  const accountsDirectory = path.join(directory, 'accounts');
  let accountEntries;
  try {
    const info = await lstat(accountsDirectory);
    if (info.isSymbolicLink()) throw new Error('Katalog danych GM Coach zawiera dowiązanie symboliczne.');
    if (!info.isDirectory()) return false;
    accountEntries = await readdir(accountsDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }

  const markers = new Set(['speediance-config.json', 'training-profile.json']);
  for (const entry of accountEntries) {
    if (entry.isSymbolicLink()) throw new Error('Katalog kont GM Coach zawiera dowiązanie symboliczne.');
    if (!entry.isDirectory()) continue;
    const profileDirectory = path.join(accountsDirectory, entry.name);
    const profileEntries = await readdir(profileDirectory, { withFileTypes: true });
    for (const profileEntry of profileEntries) {
      if (!markers.has(profileEntry.name)) continue;
      if (profileEntry.isSymbolicLink()) throw new Error('Plik profilu GM Coach jest dowiązaniem symbolicznym.');
      if (profileEntry.isFile()) return true;
    }
  }
  return false;
}

async function findUniqueLegacyDataDirectory(codexHome) {
  const legacyRoot = path.join(codexHome, 'plugins', 'data', 'agent-plugins');
  let entries;
  try {
    const info = await lstat(legacyRoot);
    if (info.isSymbolicLink()) throw new Error('Starszy katalog danych GM Coach jest dowiązaniem symbolicznym.');
    if (!info.isDirectory()) return null;
    entries = await readdir(legacyRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }

  const candidates = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error('Starszy katalog danych GM Coach zawiera dowiązanie symboliczne.');
    if (!entry.isDirectory()) continue;
    const candidate = path.join(legacyRoot, entry.name);
    if (await hasLegacyProfile(candidate)) candidates.push(candidate);
  }
  if (candidates.length > 1) {
    throw new Error('Znaleziono kilka starszych katalogów danych GM Coach. Podaj PLUGIN_DATA z aktywnej konfiguracji MCP; nie wybrano profilu automatycznie.');
  }
  return candidates[0] ? path.resolve(candidates[0]) : null;
}

export async function resolvePluginDataDirectory({
  pluginData = process.env.PLUGIN_DATA,
  codexHome = process.env.CODEX_HOME,
  homeDirectory = os.homedir()
} = {}) {
  const configuredPluginData = typeof pluginData === 'string' ? pluginData.trim() : '';
  if (configuredPluginData && !UNRESOLVED_TEMPLATE.test(configuredPluginData)) {
    return path.resolve(configuredPluginData);
  }

  const configuredCodexHome = typeof codexHome === 'string' ? codexHome.trim() : '';
  const resolvedCodexHome = configuredCodexHome && !UNRESOLVED_TEMPLATE.test(configuredCodexHome)
    ? path.resolve(configuredCodexHome)
    : path.join(homeDirectory, '.codex');

  const legacyDirectory = await findUniqueLegacyDataDirectory(resolvedCodexHome);
  if (legacyDirectory) return legacyDirectory;
  return path.resolve(resolvedCodexHome, 'plugins', 'data', 'gm-coach');
}
