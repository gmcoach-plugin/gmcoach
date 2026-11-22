const AUTH_FAILURE_CODE = 'GM_COACH_SPEEDIANCE_AUTH_FAILURE';
const CLI_STDERR_PREFIX = 'speediance-cli: ';

/** Code90 displacement (usually a phone login) is rejected before the request
 * runs. GM Coach re-logs in once with saved credentials and replays the request
 * once. No raw response/message/credentials are included in this diagnostic. */
export function classifySpeedianceSessionDisplacement(envelope) {
  if (envelope?.code !== 90 && envelope?.code !== '90') return null;
  return Object.freeze({
    code: 'GM_COACH_SPEEDIANCE_SESSION_DISPLACED',
    kind: 'session-displaced',
    apiCode: 90,
    automaticReloginAllowed: true,
    message: 'Sesja Speediance została odrzucona jako offline (kod 90). Publiczny upstream opisuje ten kod jako zajęcie tej samej sesji przez inne logowanie. GM Coach automatycznie loguje się ponownie zapisanymi danymi i jednokrotnie powtarza żądanie; ten komunikat oznacza, że ponowienie też zostało odrzucone. Nie oznacza to błędnego hasła. Spróbuj ponownie albo połącz konto przez speediance_connect_account.'
  });
}

export const SOCIAL_LOGIN_HELP_TEXT = 'Do GM Coach wpisz e-mail i hasło Speediance, nie hasło Google, Apple ani Facebooka. Obecne speediance-cli loguje przez e-mail i hasło Speediance; nie obsługuje bezpośredniego logowania OAuth ani tokenów dostawców społecznościowych. Upstream dokumentuje dla kont Google/SSO ustawienie hasła Speediance w aplikacji. Bezpośrednie OAuth przez Apple/Facebook nie jest obsługiwane przez obecne CLI, a użycie hasła Speediance dla takich kont nie jest potwierdzone.';

const AUTH_FAILURE_MESSAGES = Object.freeze({
  accountNotFound: 'Nie znaleziono konta Speediance dla podanego adresu e-mail. Sprawdź adres używany do logowania w aplikacji Speediance.',
  passwordMissing: 'Konto Speediance nie ma ustawionego hasła. Dla Google/SSO upstream speediance-cli zaleca ustawienie hasła Speediance w aplikacji. Nie używaj hasła Google. Obecne CLI nie obsługuje bezpośredniego OAuth Apple/Facebook, a ścieżka hasłowa dla tych kont nie jest potwierdzona.',
  wrongCredentials: 'Speediance odrzucił dane logowania. Sprawdź lokalnie e-mail i hasło Speediance; nie używaj haseł dostawców społecznościowych ani nie wklejaj danych logowania do rozmowy.',
  unknown: 'Logowanie do Speediance nie powiodło się. CLI zwróciło nierozpoznany błąd autoryzacji; sprawdź lokalnie e-mail i hasło Speediance, region oraz dostępność API. Szczegółów odpowiedzi nie pokazano.'
});

const TOOL_CATALOGUE_RECOVERY = 'Jeśli narzędzia speediance_* nie są widoczne, sprawdź dostępność w katalogu narzędzi czatu dla tej konkretnej rozmowy i obsługiwane funkcje używanej aplikacji. Restart proponuj tylko, gdy aplikacja udostępnia potwierdzoną kontrolę restartu dokładnie zaobserwowanego serwera: gm-coach dla MCP dołączonego do pluginu albo gm_coach_local dla globalnego serwera. Dopiero wtedy uruchom ponownie wyłącznie ten serwer i otwórz nowy czat; nie restartuj Codex Desktop. Działająca lokalna instalacja ani inny czat nie potwierdzają dostępności narzędzi tutaj.';

function getSingleCliStderrLine(stderr) {
  if (typeof stderr !== 'string' && !Buffer.isBuffer(stderr)) return null;
  const text = (Buffer.isBuffer(stderr) ? stderr.toString('utf8') : stderr)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .trim();
  if (!text || /[\r\n]/.test(text)) return null;
  if (!text.startsWith(CLI_STDERR_PREFIX)) return null;
  return text.slice(CLI_STDERR_PREFIX.length);
}

/**
 * Classify only stable, allowlisted error lines emitted by the public CLI.
 * Unknown CLI/API text is never returned and remains a generic auth failure.
 */
export function classifySpeedianceCliAuthFailure(error) {
  if (Number(error?.code) !== 2) return null;

  const line = getSingleCliStderrLine(error?.stderr);
  let kind = 'unknown';
  if (line === 'Account does not exist. Register in the Speediance app first.') {
    kind = 'account-not-found';
  } else if (line === 'Account has no password set. Set one in the Speediance app.') {
    kind = 'password-not-set';
  } else if (line === 'Login failed: bad pw') {
    // This exact rejected-password wording is present in the upstream CLI's
    // TestLoginAuthErrors fixture. Other server messages remain unclassified.
    kind = 'wrong-credentials';
  }

  return {
    code: AUTH_FAILURE_CODE,
    kind,
    message: AUTH_FAILURE_MESSAGES[
      kind === 'account-not-found' ? 'accountNotFound'
        : kind === 'password-not-set' ? 'passwordMissing'
          : kind === 'wrong-credentials' ? 'wrongCredentials'
            : 'unknown'
    ]
  };
}

/**
 * Return user-facing CLI availability guidance without suggesting an app restart.
 * MCP restart advice is conditional on the tool catalogue actually being stale.
 */
export function formatCliAvailabilityError(code) {
  if (code === 'GM_COACH_CLI_NOT_FOUND') {
    return 'GM Coach nie wykrył działającego speediance-cli. Sprawdź instalację pluginu GM Coach oraz lokalny plik speediance-cli w katalogach bin. Serwer ponowi wyszukiwanie przy następnej operacji. '
      + TOOL_CATALOGUE_RECOVERY;
  }
  if (code === 'ENOENT') {
    return 'Nie można uruchomić wykrytego speediance-cli. Sprawdź lokalną ścieżkę instalacji, obecność pliku binarnego i uprawnienia. GM Coach ponowił wykrywanie dostępnych lokalizacji. '
      + TOOL_CATALOGUE_RECOVERY;
  }
  return null;
}
