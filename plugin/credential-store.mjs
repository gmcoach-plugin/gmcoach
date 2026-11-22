import { createHash } from 'node:crypto';
import path from 'node:path';
import { resolvePluginDataDirectory } from './plugin-data-directory.mjs';

/**
 * Local OS credential store for GM Coach's Speediance password and CLI session.
 *
 * This module deliberately has no file-store or environment-variable fallback.
 * Linux is pinned to Secret Service so the Rust keyring binding cannot silently
 * use its non-persistent kernel-keyring fallback.
 *
 * Runtime dependency: @napi-rs/keyring. It maps to Windows Credential Manager,
 * macOS Keychain, and (on Linux) Secret Service when explicitly selected below.
 * Keep secrets as opaque strings here; callers own CLI/token-cache adaptation.
 */

const SERVICE = 'com.gmcoach.speediance';
const PROFILE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const CREDENTIAL_SLOTS = new Set(['password', 'session']);
const SUPPORTED_PLATFORMS = new Set(['win32', 'darwin', 'linux']);

const PLATFORM_NAMES = Object.freeze({
  win32: 'Windows Credential Manager',
  darwin: 'macOS Keychain',
  linux: 'Linux Secret Service'
});

export class CredentialStoreError extends Error {
  constructor(code, platform, operation) {
    const name = PLATFORM_NAMES[platform] || 'systemowy magazyn poświadczeń';
    const linuxHint = platform === 'linux'
      ? ' Wymagany jest aktywny Secret Service (np. GNOME Keyring lub KWallet).'
      : '';
    const message = code === 'GM_COACH_CREDENTIAL_NAMESPACE_UNAVAILABLE'
      ? 'GM Coach nie może bezpiecznie ustalić lokalnego katalogu danych profilu. Sprawdź konfigurację PLUGIN_DATA i uruchom ponownie serwer MCP; nie użyto niezabezpieczonego zapisu zastępczego.'
      : `GM Coach nie może użyć ${name}.${linuxHint} Odblokuj magazyn lub napraw jego konfigurację; nie użyto niezabezpieczonego zapisu zastępczego.`;
    super(message);
    this.name = 'CredentialStoreError';
    this.code = code;
    this.platform = platform;
    this.operation = operation;
  }
}

function validateProfile(profile) {
  if (typeof profile !== 'string' || !PROFILE_PATTERN.test(profile)) {
    throw new TypeError('Nieprawidłowy techniczny klucz profilu GM Coach.');
  }
  return profile;
}

function validateSlot(slot) {
  if (typeof slot !== 'string' || !CREDENTIAL_SLOTS.has(slot)) {
    throw new TypeError('Nieprawidłowy typ poświadczenia GM Coach.');
  }
  return slot;
}

function validateSecret(secret) {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new TypeError('Poświadczenie musi być niepustym tekstem.');
  }
  return secret;
}

function normalizeDataDirectory(directory, platform) {
  if (typeof directory !== 'string' || directory.trim().length === 0) {
    throw new TypeError('Credential store requires the GM Coach data directory.');
  }
  let normalized = path.normalize(path.resolve(directory));
  // Windows paths are case-insensitive. Canonicalize case before hashing so
  // equivalent spellings of the same configured directory share a namespace.
  if (platform === 'win32') normalized = normalized.toLowerCase();
  return normalized;
}

function accountKey(dataDirectory, profile, slot) {
  // Never persist the local filesystem path in the OS vault's account label.
  // The digest binds a credential to this exact plugin data root, profile, and
  // slot, isolating separate CODEX_HOME/PLUGIN_DATA installations.
  const digest = createHash('sha256')
    .update(JSON.stringify([dataDirectory, profile, slot]), 'utf8')
    .digest('hex');
  return `profile:v2:${digest}`;
}

/**
 * Create the store lazily so importing the MCP server does not touch the OS
 * vault. Tests can inject a compatible AsyncEntry implementation without any
 * real OS credential access.
 *
 * Store slots are intentionally constrained:
 *   - `password`: Speediance password, supplied to speediance-cli only at use.
 *   - `session`: opaque JSON text containing the CLI token and user ID.
 *
 * @param {{ platform?: string, dataDirectory?: string, loadKeyring?: () => Promise<object> }} options
 */
export function createCredentialStore({
  platform = process.platform,
  dataDirectory,
  loadKeyring = () => import('@napi-rs/keyring')
} = {}) {
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw new CredentialStoreError('GM_COACH_CREDENTIAL_STORE_UNSUPPORTED', platform, 'initialize');
  }
  if (typeof loadKeyring !== 'function') {
    throw new TypeError('Credential store requires a keyring loader.');
  }

  let keyringPromise = null;
  let namespacePromise = null;

  async function getDataDirectoryNamespace() {
    if (!namespacePromise) {
      namespacePromise = Promise.resolve().then(async () => {
        const directory = dataDirectory === undefined
          ? await resolvePluginDataDirectory()
          : dataDirectory;
        return normalizeDataDirectory(directory, platform);
      }).catch((error) => {
        namespacePromise = null;
        // Do not surface path or environment details from resolver failures.
        throw new CredentialStoreError('GM_COACH_CREDENTIAL_NAMESPACE_UNAVAILABLE', platform, 'initialize');
      });
    }
    return namespacePromise;
  }

  async function getAsyncEntry(profile, slot, operation) {
    let namespace;
    try {
      namespace = await getDataDirectoryNamespace();
    } catch (error) {
      if (error instanceof CredentialStoreError) throw error;
      throw new CredentialStoreError('GM_COACH_CREDENTIAL_NAMESPACE_UNAVAILABLE', platform, operation);
    }

    let keyring;
    try {
      if (!keyringPromise) {
        keyringPromise = Promise.resolve().then(loadKeyring);
      }
      keyring = await keyringPromise;
    } catch {
      // Do not propagate loader diagnostics: some native loaders include paths
      // and environment details. Most importantly, do not fall back to a file.
      keyringPromise = null;
      throw new CredentialStoreError('GM_COACH_CREDENTIAL_STORE_UNAVAILABLE', platform, operation);
    }

    if (typeof keyring?.AsyncEntry !== 'function') {
      throw new CredentialStoreError('GM_COACH_CREDENTIAL_STORE_UNAVAILABLE', platform, operation);
    }

    try {
      const options = platform === 'linux'
        ? { linux: { store: 'secret-service' } }
        : undefined;
      return new keyring.AsyncEntry(SERVICE, accountKey(namespace, profile, slot), options);
    } catch {
      throw new CredentialStoreError('GM_COACH_CREDENTIAL_STORE_UNAVAILABLE', platform, operation);
    }
  }

  async function getSecret(profile, slot) {
    const safeProfile = validateProfile(profile);
    const safeSlot = validateSlot(slot);
    const entry = await getAsyncEntry(safeProfile, safeSlot, 'read');
    try {
      const value = await entry.getPassword();
      if (value === undefined || value === null) return null;
      if (typeof value !== 'string') {
        throw new CredentialStoreError('GM_COACH_CREDENTIAL_STORE_CORRUPT', platform, 'read');
      }
      return value;
    } catch (error) {
      if (error instanceof CredentialStoreError) throw error;
      throw new CredentialStoreError('GM_COACH_CREDENTIAL_STORE_UNAVAILABLE', platform, 'read');
    }
  }

  async function setSecret(profile, slot, secret) {
    const safeProfile = validateProfile(profile);
    const safeSlot = validateSlot(slot);
    const safeSecret = validateSecret(secret);
    const entry = await getAsyncEntry(safeProfile, safeSlot, 'write');
    try {
      await entry.setPassword(safeSecret);
    } catch {
      throw new CredentialStoreError('GM_COACH_CREDENTIAL_STORE_UNAVAILABLE', platform, 'write');
    }
  }

  async function deleteSecret(profile, slot) {
    const safeProfile = validateProfile(profile);
    const safeSlot = validateSlot(slot);
    const entry = await getAsyncEntry(safeProfile, safeSlot, 'delete');
    try {
      return Boolean(await entry.deletePassword());
    } catch {
      throw new CredentialStoreError('GM_COACH_CREDENTIAL_STORE_UNAVAILABLE', platform, 'delete');
    }
  }

  return Object.freeze({
    getSecret,
    setSecret,
    deleteSecret,
    async hasSecret(profile, slot) {
      return (await getSecret(profile, slot)) !== null;
    }
  });
}
