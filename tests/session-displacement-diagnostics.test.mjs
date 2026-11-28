import {installSavedHeaderFixture} from './saved-header-fixture.mjs';
function savedHeaderVm(code,context={},options){return vm.runInNewContext(code,installSavedHeaderFixture(context),options);}
function savedHeaderContext(context={}){return vm.createContext(installSavedHeaderFixture(context));}
import { installAccessoryFixture } from './accessory-empty-store-fixture.mjs';
import { normalizeLoginClientType } from '../plugin/native-login.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySpeedianceSessionDisplacement } from '../plugin/auth-diagnostics.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('actual expiry recovery never replays an original request under a changed account', async () => {
  const source = await readFile(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  const requestProofHelpers = source.slice(source.indexOf('const requestNotSentErrors = new WeakMap();'), source.indexOf('const executeTemplateReservation'));
  const helpers = source.slice(source.indexOf('function apiAccountBinding('), source.indexOf('async function loginProfileNative('));
  const start = source.indexOf('async function speedianceApiRequest(');
  const request = source.slice(start, source.indexOf('\nasync function ', start + 1));
  for (const changeAt of ['response', 'recovery']) {
    let email = 'a@test', sends = 0, recoveries = 0;
    const context = savedHeaderContext({ normalizeLoginClientType, AbortController, setTimeout, clearTimeout,
      readProfileConfig: async () => ({ config: { email, region: 'EU' } }),
      readProfileSession: async () => JSON.stringify({ token: 'token-a', user_id: '123' }),
      credentialStore: {}, speedianceApiBase: () => 'https://fixture.invalid', classifySpeedianceSessionDisplacement,
      isSafeToRetryAfterSessionRefresh: () => true,
      fetch: async () => { sends++; if (changeAt === 'response') email = 'b@test'; return { ok: true, text: async () => JSON.stringify({ code: 91 }) }; },
      recoverExpiredSpeedianceSession: async (_, __, binding) => { recoveries++; assert.equal(binding.email, 'a@test'); assert.equal(Object.isFrozen(binding), true); email = 'b@test'; }
    });
    installAccessoryFixture(context);
    vm.runInContext(`${requestProofHelpers} ${helpers}\n${request}; globalThis.request = speedianceApiRequest; globalThis.requestNotSent = isRequestNotSent;`, context);
    await assert.rejects(context.request('fixture', '/app/original-account-resource'), error => {
      if (changeAt === 'recovery') assert.equal(error.message, 'Przygotowanie ponownego odczytu zatrzymano po wcześniejszym żądaniu API.');
      else assert.equal(error.message, 'Sesja Speediance wygasła. GM Coach próbował zalogować konto ponownie, ale nie udało się odświeżyć sesji. Sprawdź lokalny profil i spróbuj użyć speediance_connect_account.');
      assert.equal(context.requestNotSent(error,'fixture','/app/original-account-resource','GET'),false);
      return true;
    });
    assert.equal(sends, 1);
    assert.equal(recoveries, changeAt === 'response' ? 0 : 1);
  }
});

test('actual API request rejects account region or client changes during session await before fetch', async () => {
  const source = await readFile(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  const requestProofHelpers = source.slice(source.indexOf('const requestNotSentErrors = new WeakMap();'), source.indexOf('const executeTemplateReservation'));
  const start = source.indexOf('async function speedianceApiRequest(');
  const end = source.indexOf('\nasync function ', start + 1);
  for (const patch of [{ email: 'other@test' }, { region: 'Global' }, { login_client_type: 'bike' }]) {
    let calls = 0, sent = 0;
    const context = savedHeaderContext({ normalizeLoginClientType,
      readProfileConfig: async () => ({ config: { email: 'fixture@test', region: 'EU', ...(calls++ ? patch : {}) } }),
      readProfileSession: async () => JSON.stringify({ token: 'fixture-token', user_id: '123' }),
      credentialStore: {}, speedianceApiBase: () => 'https://fixture.invalid',
      AbortController, setTimeout, clearTimeout,
      fetch: async () => { sent++; throw new Error('must not send'); }
    });
    installAccessoryFixture(context);
    vm.runInContext(`${requestProofHelpers} ${source.slice(source.indexOf('function apiAccountBinding('), source.indexOf('async function loginProfileNative('))} ${source.slice(start, end)}; globalThis.request = speedianceApiRequest; globalThis.requestNotSent = isRequestNotSent`, context);
    await assert.rejects(context.request('fixture', '/app/userinfo'), error => {
      assert.equal(error.message,'Kontrola przed wysłaniem zatrzymała operację. Niczego nie wysłano; przygotuj nowy podgląd.');
      assert.equal(context.requestNotSent(error,'fixture','/app/userinfo','GET'),true);
      assert.equal(context.requestNotSent(error,'other','/app/userinfo','GET'),false);
      assert.equal(context.requestNotSent(error,'fixture','/app/other','GET'),false);
      assert.equal(context.requestNotSent(error,'fixture','/app/userinfo','POST'),false);
      return true;
    });
    assert.equal(sent, 0);
  }
});

test('session displacement has a separate bounded diagnostic allowing one automatic relogin', () => {
  for (const code of [90, '90']) {
    const result = classifySpeedianceSessionDisplacement({ code, message: 'private-token-and-email', data: { password: 'secret' } });
    assert.equal(result.apiCode, 90);
    assert.equal(result.kind, 'session-displaced');
    assert.equal(result.automaticReloginAllowed, true);
    assert.match(result.message, /błędnego hasła/);
    assert.doesNotMatch(JSON.stringify(result), /private-token-and-email|secret/);
    assert.equal(Object.isFrozen(result), true);
  }
});

test('expiry, transport failures and noncanonical codes are never classified as displacement', () => {
  for (const code of [91, 401, null, false, {}, [], '090', '90 ', 'offline']) {
    assert.equal(classifySpeedianceSessionDisplacement({ code }), null);
  }
  assert.equal(classifySpeedianceSessionDisplacement(null), null);
});

test('actual MCP request reports displacement when the single relogin fails for GET and POST', async () => {
  const source = await readFile(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  const requestProofHelpers = source.slice(source.indexOf('const requestNotSentErrors = new WeakMap();'), source.indexOf('const executeTemplateReservation'));
  const start = source.indexOf('async function speedianceApiRequest(');
  const end = source.indexOf('\nasync function ', start + 1);
  assert.ok(start >= 0 && end > start);
  for (const method of ['GET', 'POST']) {
    let fetchCalls = 0;
    let recoveryCalls = 0;
    const context = savedHeaderContext({ normalizeLoginClientType,
      readProfileConfig: async () => ({ config: { email: 'fixture@test', region: 'EU' } }),
      readProfileSession: async () => JSON.stringify({ token: 'synthetic-token', user_id: 'fixture-id' }),
      coachingMemoryContext: { getStore: () => new Map([['fixture', {digest:'fixture',nextExpiresAt:Infinity}]]) },
      observeCoachingMemory: async () => {}, assertCoachingMemoryUnchanged: () => {},
      credentialStore: {}, speedianceApiBase: () => 'https://fixture.invalid/api',
      AbortController, setTimeout, clearTimeout,
      fetch: async () => { fetchCalls++; return { ok: true, text: async () => JSON.stringify({ code: 90, message: 'private-server-token' }) }; },
      recoverExpiredSpeedianceSession: async () => { recoveryCalls++; throw new Error('must not login'); },
      isSafeToRetryAfterSessionRefresh: () => true,
      classifySpeedianceSessionDisplacement
    });
    installAccessoryFixture(context);
    vm.runInContext(`${requestProofHelpers} ${source.slice(source.indexOf('function apiAccountBinding('), source.indexOf('async function loginProfileNative('))} ${source.slice(start, end)}; globalThis.request = speedianceApiRequest;`, context);
    await assert.rejects(context.request('fixture', '/app/userinfo', { method }), error => {
      assert.equal(error.code, 'GM_COACH_SPEEDIANCE_SESSION_DISPLACED');
      assert.match(error.message, /^Sesja Speediance/);
      assert.match(error.message, /nie została wykonana/);
      assert.doesNotMatch(error.message, /private-server-token/);
      return true;
    });
    assert.equal(fetchCalls, 1);
    assert.equal(recoveryCalls, 1);
  }
});
