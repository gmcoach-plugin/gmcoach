import { readFile as readRawFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { readInstructionAware as readFile } from './fixtures/skill-instructions.mjs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin');

async function readProjectFile(relativePath) {
  return readFile(relativePath.startsWith('tests/') ? new URL('./' + relativePath.slice(6), import.meta.url) : path.join(projectRoot, relativePath), 'utf8');
}

test('plugin MCP manifests use accepted executable and contained server paths', async () => {
  for (const file of ['.mcp.json', 'mcp.json']) {
    const config = JSON.parse(await readProjectFile(file));
    const server = config.mcpServers['gm-coach'];
    assert.match(server.command, /^(node|\.\/[^\\/]+(?:\/[^\\/]+)*)$/);
    assert.deepEqual(server.args, ['./mcp_server.mjs']);
    assert.equal(server.cwd, '${PLUGIN_ROOT}');
    assert.equal(server.env?.PLUGIN_DATA, undefined, 'Codex supplies this reserved plugin variable itself');
  }
});

test('preview schema requires one assessment for every cited source, including not_used decisions', async () => {
  const server = await readProjectFile('mcp_server.mjs');
  assert.match(server, /Dla applied\/not_used jedna osobna ocena na evidenceId/);
  // not_used decisions without sources need no assessment (no research for not_used categories); applied always does.
  assert.match(server, /if: \{ properties: \{ status: \{ enum: \['applied'\] \} \}, required: \['status'\] \},\s*then: \{ required: \['sourceAssessments'\] \}/);
});

test('platform installers keep bundled Node and MCP server paths relative to the plugin', async () => {
  const windows = await readProjectFile('scripts/install-codex-desktop.ps1');
  const unix = await readProjectFile('scripts/install-codex-desktop.sh');

  assert.match(windows, /\$server\.command\s*=\s*'\.\/runtime\/node\.exe'/);
  assert.match(windows, /\$server\.args\s*=\s*@\('\.\/mcp_server\.mjs'\)/);
  assert.match(windows, /\$server\.cwd\s*=\s*'\$\{PLUGIN_ROOT\}'/);
  assert.match(windows, /PSObject\.Properties\.Remove\('PLUGIN_DATA'\)/);
  assert.doesNotMatch(windows, /\$server\.env\.PLUGIN_DATA\s*=/);
  assert.doesNotMatch(windows, /\$server\.command\s*=\s*\$NodeCommand/);

  assert.match(unix, /server\.command\s*=\s*'\.\/runtime\/bin\/node'/);
  assert.match(unix, /server\.args\s*=\s*\['\.\/mcp_server\.mjs'\]/);
  assert.match(unix, /server\.cwd\s*=\s*'\$\{PLUGIN_ROOT\}'/);
  assert.match(unix, /delete server\.env\.PLUGIN_DATA/);
  assert.doesNotMatch(unix, /server\.env\.PLUGIN_DATA\s*=/);
  assert.doesNotMatch(unix, /server\.command\s*=\s*path\.join\(installPath/);
});

test('package and installers include every local module imported by the MCP server', async () => {
  const manifest = (await readProjectFile('scripts/plugin-files.txt')).split(/\r?\n/);
  const packager = await readProjectFile('scripts/package.ps1');
  const windows = await readProjectFile('scripts/install-codex-desktop.ps1');
  const unix = await readProjectFile('scripts/install-codex-desktop.sh');
  for (const [name,script] of [['packager',packager],['Windows installer',windows],['Unix installer',unix]]) {
    assert.match(script,/plugin-files\.txt/,`${name} reads canonical manifest`);
  }
  const pending = ['mcp_server.mjs'];
  const visited = new Set();

  while (pending.length) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);

    const source = await readProjectFile(current);
    const imports = source.matchAll(/(?:from\s*|import\()\s*['"](\.\/[^'"]+\.mjs)['"]/g);
    for (const match of imports) {
      const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(current), match[1]));
      assert.ok(!dependency.startsWith('../plugin/'), `${current} import stays within the plugin`);
      assert.ok(manifest.includes(dependency), `canonical package includes ${dependency}`);
      pending.push(dependency);
    }
  }
});

test('packages a pinned native credential-store runtime for all supported desktop targets', async () => {
  const runtime = JSON.parse(await readProjectFile('scripts/keyring-runtime.json'));
  const manifest = await readProjectFile('scripts/plugin-files.txt');
  const windows = await readProjectFile('scripts/install-codex-desktop.ps1');
  const unix = await readProjectFile('scripts/install-codex-desktop.sh');

  assert.equal(runtime.version, '1.3.0');
  assert.match(runtime.root.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
  assert.deepEqual(Object.keys(runtime.targets).sort(), [
    'darwin-arm64', 'darwin-x64', 'linux-arm64-gnu', 'linux-arm64-musl',
    'linux-x64-gnu', 'linux-x64-musl', 'win32-arm64', 'win32-x64'
  ]);
  for (const target of Object.values(runtime.targets)) {
    assert.match(target.name, /^@napi-rs\/keyring-/);
    assert.match(target.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
  }
  for (const required of [
    'credential-store.mjs', 'profile-secret-storage.mjs', 'plugin-data-directory.mjs',
    'scripts/keyring-runtime.json', 'scripts/install-keyring-runtime.mjs'
  ]) assert.ok(manifest.split(/\r?\n/).includes(required), `allowlist contains ${required}`);
  assert.doesNotMatch(manifest, /node_modules|accounts\/|token\.json/);
  assert.match(windows, /install-keyring-runtime\.mjs/);
  assert.match(unix, /install-keyring-runtime\.mjs/);
  assert.match(unix, /keyring_libc=gnu/);
});

test('plugin default prompts stay within the host limit', async () => {
  const portable = JSON.parse(await readProjectFile('plugin.json'));
  const codex = JSON.parse(await readProjectFile('.codex-plugin/plugin.json'));
  assert.equal(portable.version, codex.version, 'the portable and Codex manifests must share the cache-busted version');
  assert.ok(portable.extensions['com.openai'].interface.defaultPrompt.length <= 128);
  assert.ok(codex.interface.defaultPrompt.length <= 128);
});

test('saved-program reads omit the bulky raw action list unless a full manual edit needs it', async () => {
  const server = await readProjectFile('mcp_server.mjs');
  const start = server.indexOf("name: 'speediance_get_saved_program'");
  const end = server.indexOf("name: 'speediance_update_saved_program'", start);
  const tool = server.slice(start, end);
  assert.ok(start >= 0 && end > start, 'the saved-program read tool exists');
  assert.match(tool, /include_action_library_list:\s*\{ type: 'boolean', default: false/);
  assert.match(tool, /serwer stosuje te precyzyjne poprawki do aktualnych danych/);
  assert.match(server, /includeActionLibraryList: readArgs\.include_action_library_list === true/);
});

test('the initialize contract defaults resisted sets to machine RM and gates static reference client Customize', async () => {
  const server = await readProjectFile('mcp_server.mjs');
  const payload = await readProjectFile('program-payload.mjs');
  const evidence = await readProjectFile('training-evidence.mjs');
  const updateStart = server.indexOf("name: 'speediance_update_saved_program'");
  const updateEnd = server.indexOf("name: '", updateStart + 1);
  const updateTool = server.slice(updateStart, updateEnd);
  const initialize = await readProjectFile('initialize-instructions.mjs');
  assert.match(initialize, /Brak kg przy poprawnie rozpoznanym Smart RM nie jest błędem: ciężar ustala maszyna/);
  assert.match(server, /const defaultLoadType = catalogConfirmsVita \? 'vita' : inferDefaultLoadType\(exercise\.sets, exercise\.title, movementKind\)/);
  assert.match(server, /referenceClientCustomizeRequestedForWholeWorkout/);
  assert.match(server, /userRequestedReferenceClientCustomize/);
  assert.doesNotMatch(server, /userRequestedProfileAuto/);
  assert.doesNotMatch(payload, /profileAutoAuthorized/);
  const doseValidationStart=server.indexOf('const validWorkAmount = isTimed');
  const doseValidationEnd=server.indexOf('let rmLevel;',doseValidationStart);
  const doseValidation=server.slice(doseValidationStart,doseValidationEnd);
  assert.ok(doseValidationStart>=0&&doseValidationEnd>doseValidationStart,'set dose validation remains a distinct production block');
  assert.match(doseValidation,/const validWorkAmount = isTimed[\s\S]*unit === 'reps' && Number\.isSafeInteger\(set\.reps\)/);
  assert.match(doseValidation,/const needsResearchBackedRir = \['profile-auto', 'customize-manual', 'smart-rm', 'fixed-kg', 'bodyweight', 'vita'\]\.includes\(loadType\) && !isTimed && set\.rirTarget === undefined;/);
  assert.match(server,/invalidFields\.push\(isTimed \? 'durationSeconds: całkowite 1–86400, bez reps' : 'reps: całkowite 1–100, bez durationSeconds'\);/);
  assert.match(server,/if \(!validRirTarget \|\| needsResearchBackedRir\) invalidFields\.push\('rirTarget: wymagane całkowite 0–5 dla oporowej serii powtórzeniowej[^']*'\);/);
  assert.match(updateTool, /smart_rm_conversion wymaga jawnego docelowego presetu z celu użytkownika/);
  assert.match(updateTool, /hipertrofia\/masa = Gain Muscle \(preset ID 1/);
  assert.match(server, /targetPercent1RM/);
  assert.match(server, /templatePresetId/);
  assert.match(server, /weights=3\.5/);
  assert.match(server, /counterweight2/);
  assert.match(server, /Serwer stosuje publiczną wartość startową RM wybranego presetu wyłącznie jako wewnętrzne pole adaptera serializacji/);
  assert.match(evidence, /loadType=reference-client-rm-preset/);
  assert.match(evidence, /loadType=reference-client-customize/);
  assert.doesNotMatch(server, /smart-rm jest zgodnym wstecz aliasem tej samej ścieżki/);
  assert.match(server, /Oporowe serie powtórzeniowe domyślnie zapisuj jako maszynowy Smart RM/);
  assert.match(payload, /REFERENCE_CLIENT_REPORTED_REP_MAX_REFERENCE_PERCENT/);
  assert.match(server, /Pilates z taśmami można omówić, ale GM Coach nie ma potwierdzonego pola, by taki opór zapisać/);
  assert.match(evidence, /loadType=reference-client-rm-preset;unit=reps;reps=\$\{set\.reps\};rirTarget=\$\{set\.rirTarget\};presetId=.*rmCounterSource=public-reference-client-preset-default/);
  assert.match(evidence, /loadType=reference-client-customize;prescribedReps=/);
  assert.match(payload, /effectiveLoadType === 'smart-rm'\s*\?\s*'3\.5'/);
  assert.doesNotMatch(server, /rmLevelMethod|reps-plus-rir-coach-estimate/);
  assert.match(payload, /counterweight: counters\.join\(','\)/);
  assert.match(payload, /counterweight2: counters\.join\(','\)/);
  assert.ok(updateStart >= 0 && updateEnd > updateStart, 'the saved-template update tool exists');
  assert.doesNotMatch(updateTool, /confirmed_display_unit/,
    'saved-template Smart RM conversion must not ask for or accept the account display unit');
});

test('preview rejects raw recent-history anchors during normalization before payload preparation', async () => {
  const server = await readProjectFile('mcp_server.mjs');
  const normalizerStart = server.indexOf('function normalizePlan(');
  const normalizerEnd = server.indexOf('const recoverExpiredSpeedianceSession', normalizerStart);
  const normalizer = server.slice(normalizerStart, normalizerEnd);
  const previewStart = server.indexOf("case 'speediance_preview_program':");
  const previewEnd = server.indexOf("case 'speediance_create_program':", previewStart);
  const previewCase = server.slice(previewStart, previewEnd);

  assert.ok(normalizerStart >= 0 && normalizerEnd > normalizerStart, 'the plan normalizer exists');
  assert.match(normalizer, /isSupportedCustomizeAnchorSource\(anchor\.source\)/);
  assert.match(normalizer, /recent-history nie jest obecnie akceptowaną kotwicą|Surowa historia nie jest obecnie akceptowaną kotwicą/);
  assert.match(server, /source: \{ type: 'string', enum: \['speediance-assessment', 'speediance-statistics', 'saved-profile', 'user-confirmed'\]/);
  assert.doesNotMatch(server, /source: \{ type: 'string', enum: \[[^\]]*'recent-history'/);
  assert.ok(previewStart >= 0 && previewEnd > previewStart, 'the preview route exists');
  assert.match(previewCase, /const normalizedPlan = normalizePlan\(args, savedTrainingProfile\?\.profileData, exerciseCatalog,importedPolicy,\{ allowQuickTest: args\.quickTestSession === true/,
    'preview must normalize with the confirmed catalog before payload creation');
  assert.ok(previewCase.indexOf('normalizedPlan = normalizePlan(') < previewCase.indexOf('prepareProgramPayload('),
    'the unsupported history source must fail before the preview payload is prepared');
});

test('suggest_load uses the captured reference client table and withholds incomplete loads', async () => {
  const server = await readProjectFile('mcp_server.mjs');
  const suggestionStart = server.indexOf("case 'gm_coach_suggest_load':");
  const suggestionEnd = server.indexOf("case 'gm_coach_get_exercise_history':", suggestionStart);
  const suggestionCase = server.slice(suggestionStart, suggestionEnd);

  assert.ok(suggestionStart >= 0 && suggestionEnd > suggestionStart, 'suggest_load route exists');
  assert.match(suggestionCase, /estimateStaticLoadsWithCoverage\(\{ strengthAnchor: anchor, reps \}\)/);
  assert.match(suggestionCase, /if \(loadCoverage\.needsInput\)/);
  assert.match(suggestionCase, /unsupportedRepCounts: loadCoverage\.unsupportedRepCounts/);
  assert.match(suggestionCase, /suggestions: loadCoverage\.suggestions/);
  assert.doesNotMatch(suggestionCase, /estimateStaticLoads\(\{ strengthAnchor: anchor, reps \}\)/,
    'the route must not throw on unverified rep counts by calling the strict estimator directly');
  assert.match(server, /fallback do historii klienta referencyjnego nie jest jeszcze odtworzony/);
  assert.match(server, /pełną uniwersalną tabelę 1–20 RM odczytaną z get_strength_profile, bez interpolacji/);
  assert.match(suggestionCase, /dodatkowego kroku RM i zaokrąglenia zgodnego z porównanymi odpowiedziami suggest_load dla assessment/);
  assert.match(suggestionCase, /adapter oprogramowania, nie dowód faktycznego RIR/);
  assert.doesNotMatch(server, /tylko przybliżone punkty referencyjne podane w opisie klienta referencyjnego: 5≈87%, 8≈80%, 12≈67%/);
});

test('both coaching skill copies reject obsolete local-anchor requirements for machine Smart RM', async () => {
  for (const relative of ['SKILL.md', 'skills/speediance-coach/SKILL.md']) {
    const instructions = await readProjectFile(relative);
    assert.doesNotMatch(instructions, /Smart RM wymaga potwierdzonego 1RM\/e1RM/, relative);
    assert.doesNotMatch(instructions, /Coach wymaga dopasowanej kotwicy 1RM\/e1RM/, relative);
    assert.doesNotMatch(instructions, /dopasowane 1RM\/e1RM jest niepewne/, relative);
    assert.doesNotMatch(instructions, /Kotwica bez actionLibraryId jest dopuszczalna tylko przy jednym wariancie/, relative);
    assert.match(instructions, /reported|jawnego.*1RM|jawne.*1RM/s, relative);
  }
});

test('exercise history bounds its opt-in session scan and uses the same reader as session detail', async () => {
  const server = await readProjectFile('mcp_server.mjs');
  const historyStart = server.indexOf("case 'gm_coach_get_exercise_history':");
  const historyEnd = server.indexOf("case 'gm_coach_get_athlete_snapshot':", historyStart);
  const history = server.slice(historyStart, historyEnd);
  assert.match(history, /args\.consent_to_read_history !== true/);
  assert.match(history, /const includeSessions = args\.include_sessions \?\? false/);
  assert.match(history, /sessionDays < 1 \|\| sessionDays > 365/);
  assert.match(history, /sessionLimit < 1 \|\| sessionLimit > 30/);
  assert.match(history, /scanCompletedExerciseHistory\(\{/);
  assert.match(history, /groupId: exercise\.id/);
  assert.match(history, /fetchSession: \(\{ trainingId, type \}\) => readSessionForProfile\(profile, trainingId, type\)/);
  assert.ok(server.includes('const session = await readSessionForProfile(profile, id, sessionType, includeTelemetry ? {apiRead:boundTelemetryRead} : undefined);'));
  const readerStart = server.indexOf('async function readSessionForProfile(');
  const readerEnd = server.indexOf('async function readHistoryForProfile(', readerStart);
  assert.ok(readerStart >= 0 && readerEnd > readerStart, 'inspect exact shared reader boundary');
  const sharedReader = server.slice(readerStart, readerEnd);
  assert.ok(sharedReader.includes('async function readSessionForProfile(profile, trainingId, type, { apiRead } = {})'));
  assert.ok(sharedReader.includes("if (apiRead !== undefined && typeof apiRead !== 'function') throw new TypeError('Bound session reader must be a function.');"));
  assert.ok(sharedReader.includes('const boundReader = apiRead === undefined ? null : createNativeWorkoutReader({ apiRead });'));
  assert.ok(sharedReader.includes("runCli: boundReader ? async () => JSON.stringify(await boundReader.session(trainingId, type)) : () => readHistoryForProfile(['session', trainingId, `--${type}`, '--json'], profile),"));
  assert.ok(sharedReader.includes('apiRead: apiRead ?? ((apiPath) => speedianceApiRequest(profile, apiPath))'));
  assert.match(server, /gmCoachSessionReadback/);
  assert.doesNotMatch(history, /remember|writeFile|storeProfileSession|estimateReferenceClientStylePercent1RM/);
  for (const file of ['scripts/plugin-files.txt', 'scripts/package.ps1', 'scripts/install-codex-desktop.ps1', 'scripts/install-codex-desktop.sh']) {
    const source = await readProjectFile(file);
    assert.match(source, /completed-session-reader\.mjs/);
    assert.match(source, /completed-exercise-history\.mjs/);
  }
});

test('calendar mutations read the month afterward and do not equate API acknowledgement with verified state', async () => {
  const server = await readProjectFile('mcp_server.mjs');
  const calendar = await readProjectFile('program-calendar.mjs');
  const scheduleStart = server.indexOf('async function scheduleTemplate(');
  const scheduleEnd = server.indexOf('function extractActionLibraryList', scheduleStart);
  const scheduleImplementation = server.slice(scheduleStart, scheduleEnd);

  assert.ok(scheduleStart >= 0 && scheduleEnd > scheduleStart, 'scheduleTemplate implementation exists');
  assert.match(scheduleImplementation, /\/app\/templateReservation/);
  assert.match(scheduleImplementation, /\/app\/v5\/trainingCalendar\/monthNew\?date=/);
  assert.match(scheduleImplementation, /executeTemplateReservation\(/);
  assert.match(server, /journalPath: path\.join\(PLUGIN_DATA, 'calendar-reservations\.json'\)/);
  assert.ok(calendar.indexOf('journal.operations[key] = pendingRecord') < calendar.indexOf('const response = await send(payload)'),
    'the durable pending entry must be written before the calendar POST');
  assert.match(calendar, /calendarReadbackVerified: readbackStatus\.verified && pendingRecord\.state === 'readback_verified'/);
  assert.match(calendar, /blockedByJournal: duplicateMutationBlocked/);
  assert.match(scheduleImplementation, /trwały dziennik PLUGIN_DATA[\s\S]*Sprawdź dokładny wpis w kalendarzu Speediance ręcznie/);
});

test('Pilates band levels are explicit diagnostic input and fail closed before serialization', async () => {
  const server = await readProjectFile('mcp_server.mjs');
  const payload = await readProjectFile('program-payload.mjs');
  const serialization = await readProjectFile('program-serialization.mjs');
  assert.match(server, /bands: \{ type: 'array'.*minimum: 1, maximum: 6/s);
  assert.match(server, /poziomy taśm 1–6.*nie jest ono serializowane/s);
  const planNormalizer = server.indexOf('function normalizePlan');
  const explicitBandsGate = server.indexOf('bands: exercise.bands', planNormalizer);
  const defaultLoadResolution = server.indexOf('normalizeExerciseLoadType(', planNormalizer);
  assert.ok(explicitBandsGate >= 0 && explicitBandsGate < defaultLoadResolution,
    'explicit bands must fail before a missing loadType can default to Customize');
  assert.match(server, /category: exerciseRecord\?\.category[\s\S]{0,180}loadType: exercise\.loadType/);
  assert.match(payload, /Nie zamienię taśm na profile-auto, Smart RM ani stałe kg/);
  const wireAction = serialization.slice(serialization.indexOf('actionLibraryList.push({'), serialization.indexOf('});', serialization.indexOf('actionLibraryList.push({')));
  assert.ok(wireAction.length > 0, 'the serialized action payload is present');
  assert.doesNotMatch(wireAction, /\bbands\s*:/, 'the unverified field must not be emitted in Speediance payload objects');
});

test('the plan validator requires RIR for every rep-based resistance load, excluding timed sets and cardio', async () => {
  const server = await readProjectFile('mcp_server.mjs');
  assert.match(server, /const needsResearchBackedRir = \['profile-auto', 'customize-manual', 'smart-rm', 'fixed-kg', 'bodyweight', 'vita'\]\.includes\(loadType\) && !isTimed && set\.rirTarget === undefined;/);
  assert.doesNotMatch(server, /const needsResearchBackedRir = \['profile-auto', 'smart-rm'\]\.includes\(loadType\)/);
  assert.match(server, /const needsResearchBackedRir = \['profile-auto', 'customize-manual', 'smart-rm', 'fixed-kg', 'bodyweight', 'vita'\]\.includes\(loadType\) && !isTimed && set\.rirTarget === undefined;/);
});

test('actual session invalidation clears composite catalog keys for exact profile after successful secret invalidation', async () => {
  const source = await readProjectFile('mcp_server.mjs');
  const start = source.indexOf('async function invalidateLocalSession(paths) {');
  const end = source.indexOf('async function writeTrainingProfileAtomically', start);
  assert.ok(start > 0 && end > start);
  const construct = new Function('credentialStore', 'unlink', 'writeApprovals', 'exerciseLibraryCache', 'accessoryCatalogCache', source.slice(start, end) + '; return invalidateLocalSession;');
  for (const fail of [false, true]) {
    const exercise = new Map([['alice:EU:1', 'old1'], ['alice:Global:2', 'old2'], ['alice2:EU:1', 'other'], ['alice-extra:EU:1', 'other2']]);
    const accessory = new Map([['alice:EU', 'old'], ['alice2:EU', 'other']]);
    const approvals = new Map([['old', {profile:'alice'}], ['other', {profile:'alice2'}]]);
    let secret = 'old-session'; let unlinks = 0;
    const invalidate = construct({getSecret:async()=>secret, deleteSecret:async()=>{if(!fail)secret=null;}}, async()=>{unlinks++;}, approvals, exercise, accessory);
    if (fail) {
      await assert.rejects(invalidate({profile:'alice',token:'synthetic-token'}), /unieważnić starej sesji/);
      assert.equal(exercise.size, 4); assert.equal(accessory.size, 2); assert.equal(unlinks, 0);
    } else {
      await invalidate({profile:'alice',token:'synthetic-token'});
      assert.equal(exercise.has('alice:EU:1'), false); assert.equal(exercise.has('alice:Global:2'), false);
      assert.equal(accessory.has('alice:EU'), false);
      assert.equal(exercise.get('alice2:EU:1'), 'other'); assert.equal(exercise.get('alice-extra:EU:1'), 'other2'); assert.equal(accessory.get('alice2:EU'), 'other');
      assert.equal(approvals.has('old'), false); assert.equal(approvals.has('other'), true); assert.equal(unlinks, 1);
      exercise.set('alice:EU:1', 'fresh-after-drift'); assert.equal(exercise.get('alice:EU:1'), 'fresh-after-drift');
    }
  }
});


test('bounded extracted saved-edit fixture inventory declares imported policy dependency before compilation', async () => {
  const production=await readProjectFile('mcp_server.mjs');
  const fixture=await readProjectFile('tests/scientific-saved-edit.test.mjs');
  const start=production.indexOf('        const baseline = buildSavedTemplateUpdatePayload(current, staticLoadContext);',production.indexOf("case 'speediance_update_saved_program':"));
  const end=production.indexOf('        let result;',start);
  assert.ok(start>0&&end>start,'actual gate boundary');
  assert.match(production.slice(start,end),/resolveImportedRmPolicy\(/,'actual caller still needs resolver');
  for(const [name,next] of [['harness','function vitaGate('],['vitaGate',"test('actual scientific saved-edit gate"]]) {
    const begin=fixture.indexOf('function '+name+'('),finish=fixture.indexOf(next,begin+1);
    assert.ok(begin>=0&&finish>begin,`inventory boundary ${name}`);
    const closure=fixture.slice(begin,finish);
    assert.match(closure,/resolveImportedRmPolicy\s*[:,]/,`${name}: explicitly bind required resolver before extraction evaluation`);
  }
  // This source contract covers two declared gates, not all free identifiers or runtime selector behavior.
});


test('shared extracted fixture binds actual imported resolver before compilation and rejects every unminted token', async () => {
 const {accessoryFixtureGlobals,installAccessoryFixture}=await import('./accessory-empty-store-fixture.mjs');
 const globals=accessoryFixtureGlobals();
 assert.equal(globals.resolveImportedRmPolicy({},'synthetic','a'.repeat(64)),null);
 assert.throws(()=>globals.resolveImportedRmPolicy({importedRmPolicyId:'d'.repeat(48)},'synthetic','a'.repeat(64)),/Fresh account-bound imported RM policy required/);
 const supplied=()=>({binding:'owned-by-feature-harness'}),context={resolveImportedRmPolicy:supplied};
 installAccessoryFixture(context);assert.equal(context.resolveImportedRmPolicy,supplied,'preserve harness minted-token registry and expiry/drift coverage');
});


test('every shipped Unix installer has raw LF and first-byte shell hashbang', async () => {
  const scripts = path.join(projectRoot, 'scripts');
  const unix = (await readdir(scripts)).filter(name => /\.(?:sh|command)$/.test(name));
  assert.deepEqual(unix.sort(), ['install-codex-desktop.command', 'install-codex-desktop.sh']);
  for (const name of unix) {
    const bytes = await readRawFile(path.join(scripts, name));
    assert.ok(bytes.subarray(0, 2).equals(Buffer.from('#!')), name);
    assert.ok(!bytes.includes(13), `${name}: carriage-return byte in Unix executable`);
    assert.match(bytes.toString('utf8').split('\n')[0], /^#!(?:\/usr\/bin\/env (?:bash|sh)|\/bin\/(?:bash|sh))$/);
  }
});
