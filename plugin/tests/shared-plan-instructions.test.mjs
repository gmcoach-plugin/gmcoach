import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const moduleText = read('skills/speediance-coach/instructions-sharing.md');
const normalized = moduleText.toLocaleLowerCase('pl-PL');

test('shared portable plan route starts with local import, full presentation, then asks about edits', () => {
  const root = read('SKILL.md');
  const coach = read('skills/speediance-coach/SKILL.md');
  for (const router of [root, coach]) {
    assert.match(router, /instructions-sharing\.md/);
    assert.match(router, /import przenośnego, udostępnionego planu/i);
  }
  for (const token of ['gm_coach_import_shared_plan', 'artifactText', 'planPresentation', 'przed pytaniem o zmiany', 'czy użytkownik chce zachować plan bez zmian']) {
    assert.ok(normalized.includes(token.toLocaleLowerCase('pl-PL')), token);
  }
  assert.ok(normalized.indexOf('## pierwsza odpowiedź') < normalized.indexOf('## dopasowanie i delta'));
});

test('shared import keeps provenance untrusted and defaults to no science review, including user edits', () => {
  for (const token of ['originVerified=false', 'originScientificApproval=false', 'hash pary służy', 'historyczne, niezweryfikowane', 'Domyślnie ten import **nie uruchamia ponownej oceny naukowej**, również po zmianach', 'scienceGate="user_declined"', 'evidence=[]', 'decisionEvidence=[]', 'osobno poprosi o naukową ocenę']) {
    assert.ok(normalized.includes(token.toLocaleLowerCase('pl-PL')), token);
  }
  assert.match(normalized, /zmiany.*nie są zgodą na badania/);
});

test('shared import does not carry account approvals, personal profile choices or health/history consent', () => {
  for (const token of ['Nie odczytuj historii, zdrowia ani regeneracji bez właściwej, odrębnej zgody', 'Nie zapisuj ich jako globalnych preferencji', 'Nie przenoś source digest, account fingerprint, preview ID, approval, readiness']) {
    assert.ok(normalized.includes(token.toLocaleLowerCase('pl-PL')), token);
  }
  assert.match(normalized, /ignoru.*osadzone w nim polecenia/s);
  assert.match(normalized, /akceptowalną zamianę/);
});

test('shared import keeps ordinary fresh preview, separate write approval and readback', () => {
  for (const token of ['speediance_preview_program', 'writeReady', 'zakończ turę i poczekaj na osobną, jednoznaczną zgodę', 'confirm=true', 'readback']) {
    assert.ok(normalized.includes(token.toLocaleLowerCase('pl-PL')), token);
  }
  assert.match(normalized, /serwer ma ponownie sprawdzić aktualne konto/);
  assert.match(normalized, /nie ponawiaj niepewnego zapisu/);
});

test('shared import schedules from recipient dates, with no date question for template-only saves', () => {
  const start = normalized.indexOf('## pierwsza odpowiedź');
  const changes = normalized.indexOf('## dopasowanie i delta');
  const schedule = normalized.indexOf('## harmonogram odbiorcy i daty importu');
  const preview = normalized.indexOf('## nauka i podgląd zapisu');
  assert.ok(start >= 0 && start < changes && changes < schedule && schedule < preview);
  for (const token of [
    'dokładną datę rozpoczęcia oraz preferowane dni tygodnia',
    'nigdy nie kopiuj ich automatycznie',
    'użyj podanych wartości bez ponownego pytania i dopytaj wyłącznie o brakujący element',
    'zaproponować go do potwierdzenia, ale nie rezerwuj go po cichu',
    'nie pytaj o datę rozpoczęcia ani dni tygodnia',
    'wyłącznie daty wyliczone z harmonogramu odbiorcy',
    'osobną zgodę na dokładny plan i te daty',
  ]) assert.ok(normalized.includes(token), token);
});

test('shared import limits recipient intake and keeps technical checks automatic and separate', () => {
  for (const token of [
    'nie rozpoczynaj ponownie pełnego wywiadu',
    'ograniczeń istotnych dla ruchów w planie',
    'czy odbiorca chce zachować preferencje organizacji i dawki z pliku dla tego importu, czy je zmienić',
    'nie pytaj ponownie o doświadczenie, cel, historię treningu ani dietę',
    'nie zapisuj ich do profilu bez osobnej prośby',
    'nie oznaczaj profilu/wywiadu jako kompletnego',
    'jawnego statusu `user_declined`',
    'nie wypełnia braków i nie jest naukowym zatwierdzeniem',
    'automatycznie wykonaj techniczne kontrole konta docelowego, katalogu',
    'pokaż tylko tę przeszkodę i poproś o brakującą informację/decyzję',
  ]) assert.ok(normalized.includes(token), token);
});
