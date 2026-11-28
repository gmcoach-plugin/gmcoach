import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../plugin/'+p,import.meta.url),'utf8');
const readRouter=p=>p==='skills/speediance-coach/SKILL.md' ? read(p)+'\n'+read('skills/speediance-coach/instructions-router-exceptions.md') : read(p);
const hash=s=>createHash('sha256').update(s).digest('hex');
const savedExtension='\n## Nierozstrzygnięty zapis innego programu\n\npendingProgramWrite=true oznacza niepewny wynik wcześniejszego tworzenia programu. Sam znacznik nie blokuje autoryzowanego odczytu odrębnego zapisanego programu ani naukowego podglądu jego edycji. Nie ponawiaj pierwotnego POST i nie usuwaj znacznika tylko po to, by wykonać odczyt lub podgląd. Jeśli właściwe narzędzie zwróci konkretną blokadę, zatrzymaj tę operację i podaj jej błąd. Zapis edycji wymaga własnego aktualnego podglądu i zwykłych warunków zatwierdzenia. Nie przedstawiaj uzgodnienia znacznika QuickTest jako warunku odczytu lub podglądu innego szablonu.\n';

// Source contract only; model compliance requires an installed fresh-chat trial.
test('ordinary saved caller requires full enrichment and every stable bounded page',()=>{
 const saved=read('skills/speediance-coach/instructions-saved.md');
 for(const token of ['output_scope=exact-program-with-preset-metadata','metadataPage.nextOffset aż do null','metadataPage.next z poprzedniej strony','baseDigest, accountScope, groupListDigest, groupsTotal','actionIndex/set/actionLibraryId','resource-bound','zimny szeroki katalog','wcześniejszej wyraźnej zgody','metadata_group_limit=4','1–8 grup','K kolejnych dokładnych GET','resource-bound oznacza nierozstrzygnięte grupy mimo nextOffset=null'])assert.ok(saved.includes(token),token);
});
test('task routes preserve complete original core and exact projected atoms', {skip:'source-tree only: needs unsanitized core hash, AGENTS.md, dev atoms or tests in package manifest'},()=>{
 const m=JSON.parse(read('skills/speediance-coach/instructions-routing.json'));const source=read(m.sourcePath);
 assert.equal(hash(source),m.sourceSha256);const chars=source;assert.equal(chars.length,m.sourceDecodedChars);
 let end=0;for(const a of m.atoms){assert.equal(a.start,end);assert.ok(a.end>a.start);const value=chars.slice(a.start,a.end);assert.equal(hash(value),a.sha256Utf8);assert.equal(a.ordinary,'full-core');end=a.end;}
 assert.equal(end,chars.length);
 for(const route of ['common','saved','fiction','completed']){const module=m.modules[route];const actual=read(module.path);const expected=module.prefix+m.atoms.filter(a=>a[route]).map(a=>chars.slice(a.start,a.end)).join('');assert.equal(actual,expected+(route==='saved'?savedExtension:''));assert.equal(hash(expected),module.targetSha256);assert.ok(!m.atoms.some(a=>a.metadata&&a[route]));}
});
test('one-day plan module retains exact selected core atoms and full science route', {skip:'source-tree only: needs unsanitized core hash, AGENTS.md, dev atoms or tests in package manifest'},()=>{
 const spec=JSON.parse(read('scripts/plan-day-atoms.json'));
 const m=JSON.parse(read('skills/speediance-coach/instructions-routing.json'));
 const source=read(spec.source),target=read(spec.target);
 assert.ok(target.startsWith('# Zwykły nowy plan jednego dnia'));
 assert.deepEqual(spec.atomIds,[...new Set(spec.atomIds)]);
 for(const id of spec.atomIds){const atom=m.atoms[id];assert.equal(atom.id,id);assert.ok(target.includes(source.slice(atom.start,atom.end).trim()),`missing core atom ${id}`);}
 for(const id of [32,35,46,48,49,55,61,65,82,85,88,100,117,122])assert.ok(spec.atomIds.includes(id),`required one-day guard ${id}`);
 const root=read('SKILL.md');assert.match(root,/Zwykły nowy plan jednej lub kilku sesji.*instructions-plan-lean\.md/);
 const route=readRouter('skills/speediance-coach/SKILL.md');assert.match(route,/Dla zwykłego nowego dnia, nowego planu wielu sesji bez cyklu.*`instructions-plan-lean\.md`/);assert.match(route,/złożony deload.*`instructions-plan-cycle\.generated\.md`/);assert.match(route,/jednej prostej edycji.*`instructions-saved-edit-lean\.md`/);
 const science=read('skills/training-science/SKILL.md');assert.match(science,/zwykłego nowego dnia, planu wielu sesji bez cyklu i prostego deloadu/);
 const shipping=read('scripts/plugin-files.txt').split(/\r?\n/);for(const path of [spec.target,'skills/training-science/instructions-plan-day.md'])assert.ok(shipping.includes(path),path);
});
test('simple saved-edit route is the exact bounded core projection with full write gates', {skip:'source-tree only: needs unsanitized core hash, AGENTS.md, dev atoms or tests in package manifest'},()=>{
 const spec=JSON.parse(read('scripts/saved-edit-lean-atoms.json'));
 const routing=JSON.parse(read('skills/speediance-coach/instructions-routing.json'));
 const source=read(spec.source),target=read(spec.target);
 const projected=spec.prefix+spec.atomIds.map(id=>{
  const atom=routing.atoms.find(item=>item.id===id);
  assert.ok(atom,`missing core atom ${id}`);
  assert.equal(atom.ordinary,'full-core');
  return source.slice(atom.start,atom.end);
 }).join('');
 assert.equal(target,projected);
 assert.equal(target.length,projected.length);
 for(const token of ['jednego istniejącego, jednoznacznie wskazanego programu','baseDigest','świeży','pełnej naukowej oceny całego planu','kompletną wynikową tabelę','osobną, późniejszą zgodę','pełny odczyt zwrotny','pełnego zwykłego routingu'])assert.ok(target.includes(token),token);
 assert.ok(!target.includes('instructions-core.md'));
 for(const path of ['SKILL.md','skills/speediance-coach/SKILL.md','skills/training-science/SKILL.md'])assert.ok(read(path).includes('instructions-saved-edit-lean.md'),path);
});
test('named Smart RM routes never require an account strength-statistics read',()=>{
 const account=read('skills/speediance-coach/instructions-account.md');
 const design=read('skills/speediance-coach/instructions-design.md');
 const science=read('skills/training-science/instructions-science.md');
 const equipment=read('skills/speediance-coach/references/gym-monster-equipment-and-modes.md');
 for(const [name,value] of [['account',account],['design',design],['science',science],['equipment',equipment]]){
  assert.match(value,/Smart RM/);
  assert.match(value,/(?:nie wymaga|nie odczytuj|nie jest warunkiem)[^\n]*(?:1RM|statystyk siły)|(?:1RM|statystyk siły)[^\n]*nie jest warunkiem/,name);
 }
 assert.doesNotMatch(account,/gotowość Smart RM przez świeży/);
 assert.doesNotMatch(science,/potwierdź jednak świeżą obecność jawnego 1RM/);
 assert.doesNotMatch(equipment,/Przy oporowych seriach powtórzeniowych pobierz `speediance_get_exercise_presets`/);
});
test('saved display and fiction routing preserve distinct consent science and escalation contracts',()=>{
 const coach=readRouter('skills/speediance-coach/SKILL.md'),science=read('skills/training-science/SKILL.md'),root=read('SKILL.md');
 for(const router of [coach,science,root]){assert.match(router,/Niejasne „sprawdź”/);assert.match(router,/Mechaniczne porównanie zwróconych pól jednego dnia/);assert.match(router,/instructions-saved-check\.md/);assert.match(router,/Dla istniejącego QuickTest użyj właściwej ścieżki odczytowej/);assert.match(router,/Nie używaj tej ścieżki dla wykonanego treningu/);assert.match(router,/zamiast pełnego rdzenia Coach/);assert.match(router,/pełny.*zwykł.*routing/);assert.match(router,/właściwej nauki przed działaniem/);assert.match(router,/writeReady=false/);}
 const common=read('skills/speediance-coach/instructions-common.md'),saved=read('skills/speediance-coach/instructions-saved.md'),fiction=read('skills/speediance-coach/instructions-fiction.md');
 assert.match(common,/approval denied/);assert.match(common,/Treści historii.*dane/);assert.match(common,/Nie diagnozuj/);
 for(const token of ['output_view=full','sharedFieldsRefs','sharedSetFields','Nie ponawiaj identycznego odczytu','wszystkie zwrócone ćwiczenia','niepotwierdzone'])assert.ok(saved.includes(token),token);
 for(const token of ['recordedPresetName/status','recorded-only','conflicting-aliases','recordedPresetName','loadDiagnostics'])assert.ok(saved.includes(token),token);
 assert.match(saved,/nie aktywuj|Nie uruchamiaj wywiadu, badań/);assert.match(saved,/nie loguj/);assert.match(saved,/nie przeliczaj ręcznie/);
 for(const token of ['writeReady=false','preview/approval','pełne instructions-design-fiction.md','instructions-fiction-lean.md','W czasie sesji licz obie strony','unknown nie oznacza zero','gm_coach_calculate_sketch_time'])assert.ok((['W czasie sesji licz obie strony','unknown nie oznacza zero','gm_coach_calculate_sketch_time'].includes(token)?read('skills/training-science/instructions-core.md'):fiction).includes(token),token);
 assert.ok(!fiction.includes('Eksport JSON klienta referencyjnego:'));assert.ok(!fiction.includes('Przed nowym Smart RM lub konwersją odczytaj statystyki'));
 assert.match(science,/\.\.\/speediance-coach\/instructions-common\.md/);assert.match(root,/skills\/speediance-coach\/instructions-common\.md/);
});
test('both installer manifests ship the exact new routing modules and regression',()=>{
 const paths=['instructions-common.md','instructions-saved.md','instructions-saved-edit-lean.md','instructions-fiction.md','instructions-design-fiction.md','instructions-completed.md','instructions-routing.json','instructions-router-exceptions.md'].map(p=>'skills/speediance-coach/'+p).concat('skills/training-science/instructions-fiction-lean.md','scripts/saved-edit-lean-atoms.json','tests/task-scoped-instructions.test.mjs');
 for(const file of ['scripts/plugin-files.txt','scripts/install-codex-desktop.ps1','scripts/install-codex-desktop.sh'])for(const p of paths)assert.equal(read(file).split(p).length-1,1,file+'/'+p);
});


test('saved read rest roles distinguish confirmed pairs from explicit returned side rows',()=>{
 for(const path of ['skills/speediance-coach/instructions-core.md','skills/speediance-coach/instructions-saved.md','skills/training-science/instructions-science.md']){const value=read(path);assert.ok(value.includes('Tylko przy potwierdzonej reprezentacji paired-symmetric'));assert.ok(value.includes('zachowaj przerwę każdego zwróconego wiersza'));assert.ok(value.includes('sama etykieta strony nie potwierdza roli'));assert.ok(value.includes('rola niepotwierdzona'));assert.ok(!value.includes('Przerwa oznacza odpoczynek po pełnej parze.'));}
});


test('completed route retains exact source and previous module bytes with exhaustive classification',()=>{
 const m=JSON.parse(read('skills/speediance-coach/instructions-routing.json'));assert.equal(m.atoms.length,124);assert.equal(m.atoms.filter(a=>a.completed).length,42);
 for(const a of m.atoms){assert.equal(typeof a.completed,'boolean');assert.ok(['include-completed','include-via-common','exclude-whitespace','exclude-ordinary'].includes(a.completedDecision));assert.ok(a.completedReason);assert.equal(a.completed,a.completedDecision==='include-completed');}
 const expected={common:'a7bcebd312048ab3a7db539acbb3cc66d1cbabdb09463653f15bc50b6c6153b5',saved:'41810788df54c85d20c89e9da79fc558e7a29ce3e6664a46b56dba86ef97a279',fiction:'26d053368e6ad6988a15fb627beae178f3075b57e99ac8ff7f0423837bcc8f82'};for(const [route,pin]of Object.entries(expected)){const text=read(m.modules[route].path);assert.equal(hash(route==='saved'?text.slice(0,-savedExtension.length):text),pin);if(route==='saved')assert.equal(text.slice(-savedExtension.length),savedExtension);}
 assert.equal(m.sourceSha256,'78305b479b83f9328768a12f9cc55ecc69ff293c7a07b567ab3e12af736fb702');
 for(const path of ['SKILL.md','skills/speediance-coach/SKILL.md','skills/training-science/SKILL.md']){const text=readRouter(path);for(const token of ['instructions-completed.md','ONE existing completed session','BEFORE dependent action','Do not run intake, calculator','Reading instructions is not consent','Default ordinary full core and science gates remain unchanged'])assert.ok(text.includes(token),path+token);}
 const value=read(m.modules.completed.path);for(const token of ['DO NOT initiate','full ordinary core','Atom87','reportedActionRating','reportedCablePeakLoad','include_heart_rate=true','include_rowing_telemetry','gmCoachSessionSummary'])assert.ok(value.includes(token),token);
});


test('saved load uncertainty never erases confirmed dose or implies no external load',()=>{
 for(const path of ['instructions-core.md','skills/speediance-coach/instructions-core.md','skills/speediance-coach/instructions-saved.md','skills/speediance-coach/instructions-completed.md']){
  const source=read(path);
  for(const clause of ['loadType=unreported','Brak danych o obciążeniu','potwierdzony displayDose, np. 30 s','no-external-load','recorded-only'])assert.ok(source.includes(clause),path+': '+clause);
 }
 const server=read('initialize-instructions.mjs');assert.ok(server.includes('nieznane oznacz jako nieznane'));
 assert.ok(server.includes('Nie wnioskuj o fizycznym ciężarze'));
});


test('fiction final output explains choices and exposes exact ledger without redundant tools',()=>{
 const fiction=read('skills/speediance-coach/instructions-fiction.md');
 assert.ok(fiction.includes('Nie wywołuj `gm_coach_derive_evidence_bindings`'));
 assert.ok(fiction.includes('jeden zbiorczy odczyt'));
 assert.ok(read('skills/training-science/SKILL.md').includes('W tej trasie nie uruchamiaj `gm_coach_derive_evidence_bindings`'));
 assert.ok(read('skills/training-science/SKILL.md').includes('jednej paczce'));
 for(const token of ['rolę wzorca','populacją źródeł','praktyczny kompromis czasu, objętości i wysiłku','Wspólne przesłanki grupuj','nie wymagaj badania identycznego zestawu ani dowodu optymalności','bezstratnie pogrupowanym zestawieniu z dostępem do konkretnych pełnych wierszy','Same sumy i niewidoczne argumenty kalkulatora go nie zastępują','Nie ponawiaj kalkulatora ani badań wyłącznie dla tej prezentacji'])assert.ok(fiction.includes(token),token);
});


test('fiction six omitted duplicates remain in full science modules while lean science handles the exception', {skip:'source-tree only: needs unsanitized core hash, AGENTS.md, dev atoms or tests in package manifest'},()=>{
 const m=JSON.parse(read('skills/speediance-coach/instructions-routing.json')),source=read(m.sourcePath);
 const map=[[109,'instructions-core.md'],[110,'instructions-core.md'],[111,'instructions-core.md'],[113,'instructions-core.md'],[117,'instructions-core.md'],[122,'instructions-science.md']];
 assert.equal(m.atoms.length,124);
 for(const [id,file]of map){const a=m.atoms.find(x=>x.id===id);assert.equal(a.fiction,false);assert.equal(a.ordinary,'full-core');assert.equal(a.completed,[109,110,122].includes(id));assert.equal(a.saved,false);assert.equal(a.fictionDecision,'exclude-exact-duplicate-in-mandatory-science');const exact=source.slice(a.start,a.end).trim();assert.ok(read('skills/training-science/'+file).includes(exact),String(id));}
 const fiction=read(m.modules.fiction.path);for(const token of ['16-kategorialną kontrolę zakresu','instructions-fiction-lean.md','writeReady=false','W końcowej odpowiedzi fikcyjnego szkicu','Same sumy i niewidoczne argumenty kalkulatora go nie zastępują'])assert.ok(fiction.includes(token),token);
 const science=read('skills/training-science/instructions-fiction-lean.md');for(const token of ['populację, interwencję, porównanie, wynik','gm_coach_calculate_sketch_time','not used','not applicable','writeReady=false','Nie używaj `gm_coach_derive_evidence_bindings`'])assert.ok(science.includes(token),token);
});


test('all active skill routers preserve MCP error flag before parsing tool payloads',()=>{
 for(const rel of ['../plugin/SKILL.md','../plugin/skills/speediance-coach/SKILL.md','../plugin/skills/training-science/SKILL.md']){
  const text=readFileSync(new URL(rel,import.meta.url),'utf8');assert.ok(text.includes('Przed parsowaniem JSON lub użyciem content/structuredContent sprawdź isError wyniku MCP'));assert.ok(text.includes('isError=true oznacza błąd wywołania'));assert.ok(text.includes('sam błąd nie upoważnia do kolejnego API'));
 }
});


// Source-contract checks only; actual model quality requires an independent trial.
test('fiction quality contract exposes categories and reuses a complete guarded calculator result',()=>{
 const text=read('skills/speediance-coach/instructions-fiction.md');
 for(const category of ["weekly_volume","frequency","intensity_load","rest_intervals","exercise_order","warmup","progression_rotation","recovery_deload","supersets","resistance_modes","intensity_techniques","stretching_mobility","timed_exercise","post_workout_stretching","nutrition_context","recovery_context"])assert.ok(text.includes(category),category);
 for(const clause of ["Kategorie not used / not applicable wymień zbiorczo","nie prowadź dla nich badań","właściwymi sourceAssessments","populacji, interwencji i wyniku","same cytowania nie zastępują oceny","Zachowaj pełne wymagania naukowe i blokady","najpierw sprawdź isError i błąd JSON-RPC","Nie obcinaj surowego wyniku przez slice","nie usuwaj wierszy lub flag","Z tego samego zachowanego wyniku","po rzeczywistej zmianie danych wejściowych"])assert.ok(text.includes(clause),clause);
});

// Instruction contract only: model adoption and scientific judgment require a fresh installed trial.
test('mode preference considers supported alternatives without superiority quota or safety inference',()=>{
 for(const file of ['skills/training-science/instructions-science.md','skills/speediance-coach/instructions-design.md']){
  const value=read(file);
  for(const clause of ['dla każdego ćwiczenia oporowego','preferencję częstszego stosowania Chain/Eccentric','dowód przewagi nad Standard nie jest koniecznym warunkiem','Brak wykazanej szkody nie jest dowodem bezpieczeństwa','Nie narzucaj kwoty','potwierdzoną dostępność/działanie trybu','istniejącej bramce resistance_modes','Wierny odczyt zapisanego planu nie upoważnia do zmiany trybów'])assert.ok(value.includes(clause),file+': '+clause);
  assert.ok(!value.includes('Gdy brak przewagi nad Standard albo działanie jest niejasne, wybierz Standard.'));
 }
});
test('ordinary core distinguishes explicit unlimited session from unknown while preserving weekly limits',()=>{
 for(const p of ['instructions-core.md','skills/speediance-coach/instructions-core.md']){const s=read(p);assert.ok(s.includes('sessionMinutesStatus=unlimited'));assert.ok(s.includes('Zachowaj niezależny limit tygodniowy'));}
});

// Instruction contract only: MCP cannot prove actual UI presentation or human reading.
test('every write requires complete inline tables and a later exact user approval turn',()=>{
 const files=['instructions-core.md','skills/speediance-coach/instructions-core.md','instructions-write.md','skills/speediance-coach/instructions-write.md','instructions-cycle.md','skills/speediance-coach/instructions-cycle.md'];
 for(const file of files){const text=read(file);for(const token of ['rezerwacją istniejącego programu','kompletny wynikowy plan','wszystkie strony bez luk','ZAKOŃCZ turę i CZEKAJ','późniejszą, osobną wiadomość użytkownika','previewId/baseDigest','presentationDigest/researchReviewDigest','MCP nie ma technicznego dowodu','nie zapisuj'])assert.ok(text.includes(token),file+': '+token);assert.ok(/(?:Nigdy nie wykonuj preview i zapisu|W zwykłej ścieżce nigdy nie wykonuj preview i zapisu)/.test(text),file+': ordinary approval');}
 const server=read('initialize-instructions.mjs');assert.ok(server.includes('Nie wykonuj podglądu i zapisu w tej samej turze'));assert.ok(server.includes('MCP nie dowodzi prezentacji w czacie'));
});

// Source-contract only: actual plan completeness still requires a fresh model-output evaluation.
test('multiweek plan candidate is fully shown across days before selection or write approval',()=>{
 const cycle=read('skills/speediance-coach/instructions-cycle.md');
 for(const clause of ['Zanim poprosisz o wybór lub akceptację kandydata na plan albo o zgodę na jego zapis','pełny, czytelny szkic wszystkich dni/sesji','wszystkie ćwiczenia i sekcje, w tym rozgrzewkę i rozciąganie po treningu','chyba że użytkownik jawnie odmówił jednej z nich','konkretną nazwę albo jawny status niepotwierdzenia/propozycji','powtórzenia albo sekundy z jednostką','obciążenie lub preset','tryb oporu oraz przerwę','Każdy proponowany element rozgrzewki i rozciągania ma mieć konkretną dawkę','Nie używaj placeholderów (np. „G”), wielokropków','„tak samo jak poprzednio”, „jak wyżej”','każdej z nich na pełną sesję','nie nazywaj szkicu kompletnym','bez proszenia o akceptację niekompletnego planu'])assert.ok(cycle.includes(clause),clause);
 const projection=read('skills/speediance-coach/instructions-plan-cycle.generated.md');
 for(const clause of ['Ćwiczenie | Serie | Powtórzenia / czas | Obciążenie | Przerwa','Oddziel rozgrzewkę, część główną i rozciąganie'])assert.ok(projection.includes(clause),clause);
});
