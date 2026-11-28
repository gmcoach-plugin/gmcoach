import test from 'node:test';
import assert from 'node:assert/strict';
import { readInstructionAwareSync as readFileSync } from './fixtures/skill-instructions.mjs';

const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');

test('reported health knowledge remains reachable through mandatory routers and packaged reference', () => {
  const referencePath = '../plugin/skills/speediance-coach/references/reported-health-workflow.md';
  const reference = readFileSync(new URL(referencePath, import.meta.url), 'utf8');
  const manifest = readFileSync(new URL('../plugin/scripts/plugin-files.txt', import.meta.url), 'utf8');
  assert.ok(manifest.split(/\r?\n/).includes('skills/speediance-coach/references/reported-health-workflow.md'));
  for (const [path, link] of [['../plugin/SKILL.md', 'skills/speediance-coach/references/reported-health-workflow.md'], ['../plugin/skills/speediance-coach/SKILL.md', 'references/reported-health-workflow.md']]) {
    const skill = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.ok(skill.includes(`](${link})`));
    assert.equal(readFileSync(new URL(link, new URL(path, import.meta.url)), 'utf8'), reference);
    assert.match(skill, /Przed odczytem raportów zdrowotnych albo interpretacją ich pól obowiązkowo przeczytaj/);
    assert.match(skill, /Czas pobrania i czas pomiaru są różne/);
    assert.match(skill, /Każdy podgląd sesji wymaga recoveryContext oraz dokładnego recoveryDecisionBinding/);
    assert.doesNotMatch(skill + reference, /Historia treningów korzysta z `speediance-cli`|Dla GM1 te trzy presety|Wartość `-1` oznacza brak presetu/);
    assert.doesNotMatch(skill, /dostępu CLI do historii|jednoznaczny komunikat CLI/);
  }
  for (const phrase of ['consent_to_read_health=true', 'start_date/end_date', 'scoreUpdateTime', 'body_measurements', 'physical_condition', 'health_cards', 'Nie porównuj surowej masy/wzrostu', 'bodyAge/extData', 'Dane raportu nie zapisują się automatycznie w profilu']) assert.ok(reference.includes(phrase), phrase);
});

test('equipment reference uses Monster family presets and native history without obsolete GM1-only routing', () => {
  const reference = readFileSync(new URL('../plugin/skills/speediance-coach/references/gym-monster-equipment-and-modes.md', import.meta.url), 'utf8');
  assert.doesNotMatch(reference, /Dla GM1 te trzy presety|Na GM1 takie żądanie|Historia treningów korzysta z `speediance-cli`|Wartość `-1` oznacza brak presetu/);
  assert.equal(source.includes('na GM1 wybierz globalny preset'), false);
  assert.match(reference, /Dla całej rodziny Gym Monster \(`device_type=1`\)/);
  assert.match(reference, /2=Gym Pal i 3=Velonix/);
  assert.match(reference, /własnego natywnego API GM Coach/);
  assert.match(reference, /\/mobile\/v2\/report\/userTrainingDataRecord/);
  assert.match(reference, /\/app\/trainingInfo\//);
  assert.match(reference, /wraz z poprawnymi statycznymi weights i pustymi counterweight oznacza Customize/);
  assert.match(reference, /nie uznawaj samego -1 za brak ciężaru/);
  assert.match(reference, /Dropset, rest-pause i pauzy\/tempo[^\n]*przybliżenie z wierszy serii[^\n]*pozostają not_used/);
});

test('preset skill keeps named global Smart RM separate from variant catalog evidence', () => {
  const skill = readFileSync(new URL('../plugin/skills/speediance-coach/SKILL.md', import.meta.url), 'utf8');
  const paragraph = skill.split('\n').find(line => line.includes('speediance_get_exercise_presets'));
  assert.ok(paragraph);
  assert.doesNotMatch(paragraph, /wymagaj.*wariant.*map|musi.*wariant.*map/i);
});

test('Smart RM model text does not require reported account 1RM or local anchors', () => {
  for (const obsolete of [
    'isolated by account and variant',
    'brakuje dopasowanego 1RM/e1RM',
    'Coach wymaga dokładnej kotwicy 1RM/e1RM i zachowuje maszynowy Smart RM',
    'GM Coach wymaga dokładnej kotwicy. API',
    'Jeśli cel, jednostka, wariant albo dopasowane 1RM/e1RM jest nieznane',
    'GM Coach weryfikuje obecność 1RM/e1RM dla dokładnego wariantu'
  ]) assert.equal(source.includes(obsolete), false, obsolete);
  // English sentences were removed from tool descriptions before 1.0.633; the Polish contract carries the same rule.
  assert.ok(source.includes('Zapis Smart RM wymaga potwierdzonego wariantu i presetu, bez odczytu statystyk siły'));
});

test('conversion model text preserves RIR and separates global Smart RM from variant mapping', () => {
  assert.equal(source.includes('klient referencyjny zaleca domyślnie 1 powtórzenie w zapasie'), false);
  assert.ok(source.includes('podczas samej konwersji nie dodawaj domyślnego RIR'));
  assert.equal(source.includes('Nowe/zmienione ID musi być jawnie potwierdzone przez mapę Speediance.'), false);
  assert.ok(source.includes('Dla nowych/zmienionych ID presetów innych niż nazwany Smart RM'));
  assert.ok(source.includes('bez wymagania wariantowej mapy presetów'));
});

test('model-facing science coverage includes recovery and all sixteen plan categories',async()=>{
  // The server no longer repeats the count in descriptions; the validator constant is the source of truth.
  const {TRAINING_EVIDENCE_PLAN_CATEGORIES}=await import('../plugin/training-evidence.mjs');
  assert.equal(TRAINING_EVIDENCE_PLAN_CATEGORIES.length,16);assert.ok(TRAINING_EVIDENCE_PLAN_CATEGORIES.includes('recovery_context'));
  assert.doesNotMatch(source,/15 decyzji planu/);
  for(const path of ['../plugin/SKILL.md','../plugin/skills/speediance-coach/SKILL.md','../plugin/skills/training-science/SKILL.md']) {
    const skill=readFileSync(new URL(path,import.meta.url),'utf8');
    assert.match(skill,/Walidator wymaga mapowania 16 kategorii planu, w tym recovery_context/);
    assert.match(skill,/Ten sam source i excerpt nie może być jedynym uzasadnieniem/);
    assert.match(skill,/showCalculatedLoads domyślnie pozostaje false/);
    assert.doesNotMatch(skill,/15 decyzji planu/);
  }
});
test('cycle model review distinguishes individual dose increases from whole-plan progression',()=>{
  for(const path of ['../plugin/SKILL.md','../plugin/skills/speediance-coach/SKILL.md','../plugin/skills/training-science/SKILL.md']) {
    const skill=readFileSync(new URL(path,import.meta.url),'utf8');
    assert.match(skill,/Pojedynczy wzrost dawki jest kandydatem progresji, nie dowodem progresji całego planu/);
    assert.match(skill,/Ujawnij także zmniejszenia i dawkę nieporównywalną/);
    assert.match(skill,/Nie wymagaj automatycznego wzrostu każdego ćwiczenia/);
    assert.match(skill,/nie przeliczaj selektorów Smart RM na kg lub tonaż/);
    assert.match(skill,/deload wymaga rzeczywistego zmniejszenia porównywalnej dawki/i);
  }
});

test('canonical public set examples match dose normalization and public schema field names', async () => {
  const { normalizeSetWork } = await import('../plugin/program-payload.mjs');
  const expected = [
    { unit: 'reps', reps: 8, rirTarget: 2, mode: 1, restSeconds: 120 },
    { unit: 'sec', durationSeconds: 30, mode: 1, restSeconds: 15 }
  ];
  for (const path of ['../plugin/SKILL.md', '../plugin/skills/speediance-coach/SKILL.md', '../plugin/skills/training-science/SKILL.md']) {
    const skill = readFileSync(new URL(path, import.meta.url), 'utf8');
    const section = skill.split('## Kanoniczne wejście podglądu')[1]?.split(/\n## /)[0];
    assert.ok(section);
    const examples = [...section.matchAll(/```json\s*([^`]+)```/g)].map(match => JSON.parse(match[1]));
    assert.deepEqual(examples, expected);
    for (const [index, example] of examples.entries()) {
      assert.deepEqual(normalizeSetWork(example, 0), index === 0 ? { unit: 'reps', amount: 8 } : { unit: 'seconds', amount: 30 });
      assert.ok([1, 2, 3].includes(example.mode));
      assert.ok(Number.isInteger(example.restSeconds) && example.restSeconds >= 0 && example.restSeconds <= 600);
      assert.ok(!('rest' in example) && !('resistanceMode' in example) && !('setNumber' in example));
    }
    assert.match(section, /limitations: \[\]/);
    assert.match(section, /priorityAreasStatus=none/);
    assert.match(section, /zachowaj unsure/);
    assert.match(section, /Jednorazowa sesja nie oznacza preferredBlockWeeks=1/);
  }
  assert.match(source, /required: \['unit', 'mode', 'restSeconds'\]/);
  assert.match(source, /const rest = set\.restSeconds;/);
  assert.match(source, /const mode = set\.mode;/);
  assert.match(source, /unit: \{ type: 'string', enum: \['reps', 'sec', 'seconds'\]/);
  assert.match(source, /additionalProperties: false/);
  for (const example of expected) assert.ok(source.includes(JSON.stringify(example)));
});
