import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
for (const file of ['../plugin/skills/speediance-coach/instructions-design.md', '../plugin/instructions-design.md']) {
  test('health-data question is asked once, inside the interview, with explicit yes/no semantics (' + file + ')', () => {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const part of ['RAZ na rozmowę jedno krótkie pytanie', 'bez osobnej rundy', '„Tak” = zgoda (consent_to_read_health=true) na gm_coach_get_reported_health feed=all',
      'brak odpowiedzi = recoveryContext bez danych zdrowotnych i bez dodatkowych odczytów', 'Nie pytaj przy samym odczycie zapisanego planu','Techniki dodatkowe (rozgrzewka z ciężarem, superserie, dropsety) tylko gdy realnie poprawiają postęp','nigdy domyślnie','Dropset zapisz jako 1–2 kolejne serie tego samego ćwiczenia z dropSet=true','jedno zdanie uzasadnienia w podglądzie']) assert.ok(text.includes(part), part);
  });
}
