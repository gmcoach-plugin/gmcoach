import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const PLACEHOLDERS = new Set([
  'YOUR_SPEEDIANCE_PASSWORD',
  'WPROWADZ_HASLO',
  'TU_WPISZ_HASLO'
]);

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function hasConfiguredEmail(value) {
  return typeof value === 'string'
    && value.trim().length >= 3
    && value.trim().length <= 254
    && !/[\r\n]/.test(value)
    && value.trim() !== 'YOUR_SPEEDIANCE_EMAIL'
    && value.trim() !== 'WPROWADZ_EMAIL'
    && value.trim() !== 'TU_WPISZ_EMAIL';
}

function isLegacyPassword(value) {
  return typeof value === 'string' && value.length > 0 && !PLACEHOLDERS.has(value);
}

function parseSessionCache(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let value;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.token !== 'string' || !value.token
      || typeof value.user_id !== 'string' || !value.user_id) return null;
  return value;
}

function normalizeSessionContext(context) {
  if (context === undefined) return null;
  if (!context || !['EU', 'Global'].includes(context.region)
      || !['phone', 'gym-monster', 'nano', 'bike'].includes(context.loginClientType)) {
    throw new TypeError('Invalid session identity context.');
  }
  return { region: context.region, loginClientType: context.loginClientType };
}

function sessionEnvelope(rawCache, email, context) {
  const identity = normalizeSessionContext(context);
  return JSON.stringify({ schemaVersion: identity ? 2 : 1, email: normalizeEmail(email), tokenCache: rawCache, ...(identity || {}) });
}

function unpackSession(value) {
  if (typeof value !== 'string' || !value) return null;
  let parsed;
  try { parsed = JSON.parse(value); } catch { return null; }
  if (parsed && [1, 2].includes(parsed.schemaVersion) && typeof parsed.email === 'string'
      && typeof parsed.tokenCache === 'string' && parseSessionCache(parsed.tokenCache)) {
    let context = null;
    if (parsed.schemaVersion === 2) {
      try { context = normalizeSessionContext(parsed); } catch { return null; }
    }
    return {
      context,
      email: normalizeEmail(parsed.email),
      rawCache: parsed.tokenCache,
      envelope: value
    };
  }
  return null;
}

async function readOptionalText(filePath) {
  try { return await readFile(filePath, 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJsonAtomically(filePath, value) {
  const temporaryPath = `${filePath}.${randomBytes(8).toString('hex')}.vault-migration.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8', mode: 0o600, flag: 'wx'
    });
    await rename(temporaryPath, filePath);
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
}

function exactReadbackError(slot) {
  return new Error(`GM Coach nie potwierdził dokładnego zapisu poświadczenia profilu (${slot}); zachowano istniejące pliki.`);
}

export function isUsableProfilePassword(value) {
  return isLegacyPassword(value);
}

/**
 * Migrate legacy plaintext credentials and CLI token cache into the OS vault.
 * The original file is removed only after the vault returns the exact string
 * written. This function is idempotent and never falls back to plaintext when
 * vault access fails.
 */
export async function migrateLegacyProfileSecrets({ profile, configPath, tokenPath, credentialStore }) {
  if (!credentialStore || typeof credentialStore.getSecret !== 'function'
      || typeof credentialStore.setSecret !== 'function') {
    throw new TypeError('Profile secret migration requires an OS credential store.');
  }

  let config;
  try { config = JSON.parse(await readFile(configPath, 'utf8')); }
  catch (error) {
    if (error?.code === 'ENOENT') return { config: null, password: null, session: null };
    if (error instanceof SyntaxError) throw new Error('Plik konfiguracji profilu nie zawiera poprawnego JSON.');
    throw new Error('Nie można odczytać lokalnego pliku konfiguracji profilu.');
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Plik konfiguracji profilu musi zawierać obiekt JSON.');
  }

  const legacyPassword = isLegacyPassword(config.password) ? config.password : null;
  const legacyTokenRaw = await readOptionalText(tokenPath);
  const email = normalizeEmail(config.email);
  let legacyTokenEnvelope = null;
  if (legacyTokenRaw !== null) {
    if (!hasConfiguredEmail(email) || !parseSessionCache(legacyTokenRaw)) {
      throw new Error('Lokalny token ma nieprawidłowy format lub nie można przypisać go do konta. Plik zachowano; połącz profil ponownie.');
    }
    legacyTokenEnvelope = sessionEnvelope(legacyTokenRaw, email);
  }

  // Read both slots before any mutation. If the vault is unavailable, leave
  // every legacy file untouched and fail closed.
  let password = await credentialStore.getSecret(profile, 'password');
  let sessionValue = await credentialStore.getSecret(profile, 'session');

  // A raw session in the vault has no account binding. Upgrade it only when it
  // exactly matches this profile's still-present legacy cache. Otherwise drop
  // that unbound session after readback so it cannot be used for another email.
  let dropUnboundSession = false;
  if (sessionValue !== null && parseSessionCache(sessionValue) && !unpackSession(sessionValue)) {
    if (legacyTokenRaw !== null && sessionValue === legacyTokenRaw && legacyTokenEnvelope) {
      // The exact on-disk legacy token below supplies the email binding.
    } else if (legacyTokenRaw === null) {
      dropUnboundSession = true;
    } else {
      throw new Error('Niezwiązana sesja w magazynie nie odpowiada lokalnemu tokenowi. Dane zachowano; połącz profil ponownie.');
    }
  }

  if (legacyPassword && password !== null && password !== legacyPassword) {
    throw new Error('Hasło z lokalnego pliku różni się od zapisanego w systemowym magazynie GM Coach. Dane zachowano; otwórz formularz profilu i zapisz hasło ponownie.');
  }
  if (legacyTokenEnvelope && sessionValue !== null) {
    const existingSession = unpackSession(sessionValue)
      || (sessionValue === legacyTokenRaw ? { email, rawCache: sessionValue, envelope: legacyTokenEnvelope } : null);
    if (!existingSession || existingSession.email !== email || existingSession.rawCache !== legacyTokenRaw) {
      throw new Error('Token w lokalnym pliku różni się od sesji w systemowym magazynie GM Coach. Dane zachowano; połącz profil ponownie.');
    }
  }

  if (dropUnboundSession) {
    await credentialStore.deleteSecret(profile, 'session');
    if (await credentialStore.getSecret(profile, 'session') !== null) throw exactReadbackError('sesja');
    sessionValue = null;
  }

  if (legacyPassword && password === null) {
    await credentialStore.setSecret(profile, 'password', legacyPassword);
    password = await credentialStore.getSecret(profile, 'password');
    if (password !== legacyPassword) throw exactReadbackError('hasło');
  }

  if (legacyTokenEnvelope && sessionValue === null) {
    await credentialStore.setSecret(profile, 'session', legacyTokenEnvelope);
    sessionValue = await credentialStore.getSecret(profile, 'session');
    if (sessionValue !== legacyTokenEnvelope) throw exactReadbackError('sesja');
  } else if (sessionValue !== null) {
    const storedSession = unpackSession(sessionValue)
      || (sessionValue === legacyTokenRaw && legacyTokenEnvelope
        ? { email, rawCache: sessionValue, envelope: legacyTokenEnvelope }
        : null);
    if (storedSession && storedSession.envelope !== sessionValue) {
      await credentialStore.setSecret(profile, 'session', storedSession.envelope);
      sessionValue = await credentialStore.getSecret(profile, 'session');
      if (sessionValue !== storedSession.envelope) throw exactReadbackError('sesja');
    }
  }

  const safeConfig = { ...config };
  delete safeConfig.password;
  if (Object.hasOwn(config, 'password')) await writeJsonAtomically(configPath, safeConfig);

  if (legacyTokenRaw !== null) {
    // unlink is atomic at the directory-entry level. Do this only after the
    // encrypted vault entry has been read back byte-for-byte.
    try { await unlink(tokenPath); }
    catch (error) {
      if (error?.code !== 'ENOENT') throw new Error('Sesję zapisano w systemowym magazynie, ale nie udało się usunąć jej starego pliku. Plik zachowano do ponownej migracji.');
    }
  }

  const unpacked = unpackSession(sessionValue);
  return {
    config: safeConfig,
    password: password || null,
    session: unpacked?.email === email ? unpacked.rawCache : null
  };
}

/** Store a new password first, verify exact readback, then atomically publish its non-secret profile config. */
export async function saveProfileCredentials({ profile, password, config, credentialStore, beforeConfigWrite, rollbackBeforeConfigWrite, writeConfig }) {
  if (typeof password !== 'string' || !password || typeof writeConfig !== 'function') {
    throw new TypeError('Saving a protected profile requires a password and config writer.');
  }
  if (rollbackBeforeConfigWrite !== undefined && typeof rollbackBeforeConfigWrite !== 'function') {
    throw new TypeError('Profile transaction rollback must be a function.');
  }
  const previousPassword = await credentialStore.getSecret(profile, 'password');
  await credentialStore.setSecret(profile, 'password', password);
  const readback = await credentialStore.getSecret(profile, 'password');
  if (readback !== password) {
    const restored = await restorePassword(profile, previousPassword, credentialStore);
    throw restored
      ? exactReadbackError('hasło')
      : new Error('Magazyn nie potwierdził zapisu hasła ani przywrócenia poprzedniej wartości. Konfiguracji pliku nie zmieniono; sprawdź magazyn systemowy przed ponownym połączeniem.');
  }
  let preCommitStarted = false;
  try {
    if (typeof beforeConfigWrite === 'function') {
      preCommitStarted = true;
      await beforeConfigWrite();
    }
    const safeConfig = { ...config };
    delete safeConfig.password;
    await writeConfig(safeConfig);
  } catch {
    const restored = await restorePassword(profile, previousPassword, credentialStore);
    if (!restored) {
      throw new Error('Nie zapisano konfiguracji profilu, a magazyn nie potwierdził przywrócenia poprzedniego hasła. Nie usuwaj plików profilu; ponownie zapisz poprawne hasło w formularzu.');
    }
    if (preCommitStarted && rollbackBeforeConfigWrite) {
      try {
        await rollbackBeforeConfigWrite();
      } catch {
        throw new Error('Nie udało się zapisać konfiguracji profilu. Przywrócono poprzednie hasło, ale nie udało się potwierdzić przywrócenia wcześniejszej sesji. Użyj speediance_connect_account, aby bezpiecznie połączyć profil ponownie.');
      }
    }
    throw new Error('Nie udało się atomowo zapisać konfiguracji profilu. Zachowano dotychczasową konfigurację i przywrócono poprzednie hasło.');
  }
  const safeConfig = { ...config };
  delete safeConfig.password;
  return { config: safeConfig };
}

async function restorePassword(profile, previousPassword, credentialStore) {
  try {
    if (previousPassword === null) {
      await credentialStore.deleteSecret(profile, 'password');
      return (await credentialStore.getSecret(profile, 'password')) === null;
    }
    await credentialStore.setSecret(profile, 'password', previousPassword);
    return (await credentialStore.getSecret(profile, 'password')) === previousPassword;
  } catch {
    return false;
  }
}

export async function readProfileSession({ profile, email, credentialStore, sessionContext }) {
  const requested = normalizeSessionContext(sessionContext);
  const value = await credentialStore.getSecret(profile, 'session');
  if (value === null) return null;
  const parsed = unpackSession(value);
  if (!parsed) throw new Error('Lokalna sesja Speediance ma nieprawidłowy format; uruchom ponowne łączenie profilu.');
  if (parsed.email !== normalizeEmail(email)) return null;
  if (parsed.context) {
    if (!requested || requested.region !== parsed.context.region || requested.loginClientType !== parsed.context.loginClientType) return null;
  } else if (requested) {
    if (requested.loginClientType !== 'phone') return null;
    const upgraded = sessionEnvelope(parsed.rawCache, email, requested);
    await credentialStore.setSecret(profile, 'session', upgraded);
    if (await credentialStore.getSecret(profile, 'session') !== upgraded) throw exactReadbackError('sesja');
    return parsed.rawCache;
  }
  if (parsed.envelope !== value) {
    await credentialStore.setSecret(profile, 'session', parsed.envelope);
    if (await credentialStore.getSecret(profile, 'session') !== parsed.envelope) throw exactReadbackError('sesja');
  }
  return parsed.rawCache;
}

export async function storeProfileSession({ profile, email, rawCache, credentialStore, sessionContext }) {
  if (!parseSessionCache(rawCache) || !hasConfiguredEmail(email)) {
    throw new Error('Speediance CLI nie zwrócił poprawnego tokenu sesji; sesji nie zapisano.');
  }
  const envelope = sessionEnvelope(rawCache, email, sessionContext);
  await credentialStore.setSecret(profile, 'session', envelope);
  if (await credentialStore.getSecret(profile, 'session') !== envelope) throw exactReadbackError('sesja');
}

/** Run a CLI command with a short-lived private token-cache file, then vault any valid refreshed session. */
export async function runWithProfileSessionCache({ profile, email, credentialStore, run, tempDirectory = os.tmpdir(), sessionContext }) {
  const identity = normalizeSessionContext(sessionContext);
  if (identity && identity.loginClientType !== 'phone') throw new Error('Stock CLI cannot preserve this login client identity.');
  if (typeof run !== 'function') throw new TypeError('A CLI operation is required.');
  const privateDir = await mkdtemp(path.join(tempDirectory, 'gm-coach-session-'));
  const cachePath = path.join(privateDir, 'token-cache.json');
  let result;
  let commandError = null;
  let persistenceError = null;
  try {
    const current = await readProfileSession({ profile, email, credentialStore, sessionContext });
    if (current !== null) {
      await writeFile(cachePath, current, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    }
    try { result = await run(cachePath); }
    catch (error) { commandError = error; }

    try {
      const refreshed = await readOptionalText(cachePath);
      if (refreshed !== null && parseSessionCache(refreshed) && refreshed !== current) {
        await storeProfileSession({ profile, email, rawCache: refreshed, credentialStore, sessionContext });
      }
    } catch {
      persistenceError = new Error('Nie udało się bezpiecznie zapisać lub zweryfikować sesji Speediance w systemowym magazynie. Plik profilu pozostawiono bez zmian.');
    }
    if (persistenceError) throw persistenceError;
    if (commandError) throw commandError;
    return result;
  } finally {
    try { await rm(privateDir, { recursive: true, force: true }); }
    catch { throw new Error('Nie udało się usunąć tymczasowego pliku sesji. Sprawdź i usuń katalog GM Coach z folderu systemowych plików tymczasowych.'); }
  }
}

/** Delete vault entries before profile files, restoring already-deleted entries on failure. */
export async function deleteProfileSecrets({ profile, credentialStore }) {
  const snapshot = {
    password: await credentialStore.getSecret(profile, 'password'),
    session: await credentialStore.getSecret(profile, 'session')
  };
  const removed = [];
  try {
    for (const slot of ['password', 'session']) {
      if (snapshot[slot] === null) continue;
      await credentialStore.deleteSecret(profile, slot);
      if (await credentialStore.getSecret(profile, slot) !== null) {
        throw new Error('Vault deletion readback did not confirm removal.');
      }
      removed.push(slot);
    }
  } catch {
    let restored = true;
    for (const slot of removed.reverse()) {
      try {
        await credentialStore.setSecret(profile, slot, snapshot[slot]);
        if (await credentialStore.getSecret(profile, slot) !== snapshot[slot]) restored = false;
      } catch { restored = false; }
    }
    throw new Error(restored
      ? 'Nie udało się usunąć poświadczeń z magazynu systemowego; dane profilu zachowano.'
      : 'Nie udało się usunąć poświadczeń ani potwierdzić ich pełnego przywrócenia. Zachowano katalog profilu; po odblokowaniu magazynu ponów operację.');
  }
  return snapshot;
}

export async function restoreProfileSecrets({ profile, snapshot, credentialStore }) {
  if (!snapshot || typeof snapshot !== 'object') throw new TypeError('A credential snapshot is required.');
  for (const slot of ['password', 'session']) {
    const value = snapshot[slot];
    if (value === null || value === undefined) continue;
    await credentialStore.setSecret(profile, slot, value);
    if (await credentialStore.getSecret(profile, slot) !== value) throw exactReadbackError(slot);
  }
}
