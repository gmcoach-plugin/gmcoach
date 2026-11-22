import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../skills/' + p, import.meta.url), 'utf8');

// Source-contract checks only: fresh-chat behavior requires a separate model evaluation.
test('assistant completes presets loads and executable sections instead of delegating plan construction', () => {
  const text = read('speediance-coach/SKILL.md');
  for (const phrase of ['Asystent sam kończy plan', 'wybierz preset', 'ustaw ciężar', 'konkretne ćwiczenia i dawki', 'autoryzowaną historię', 'Preferencja wyświetlania suma/strona']) assert.ok(text.includes(phrase), phrase);
  assert.match(text, /pytaj dopiero o konkretny brak/);
});

test('same approved plan reuses science while preserving technical validation and expiry handling', () => {
  const text = read('speediance-coach/SKILL.md');
  for (const phrase of ['przed pokazaniem', 'niezmieniony, ważny podgląd', 'nie uruchamiaj ponownie', 'digesty', 'readback', 'Wygaśnięcie', 'importu']) assert.ok(text.includes(phrase), phrase);
});

test('multiweek cycle keeps completion and science-before-consent policy', () => {
  const text = read('speediance-coach/instructions-cycle.md');
  for (const phrase of ['Budowę całego cyklu kończy asystent', 'wszystkie sesje', 'późniejszą zgodę', 'Nie ponawiaj badań', 'nie fabrykuj kilogramów']) assert.ok(text.includes(phrase), phrase);
});
