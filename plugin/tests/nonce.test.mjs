import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nextRequestTimestamp, isInvalidNonceEnvelope } from '../speediance-nonce.mjs';

test('parallel requests in one millisecond get distinct, increasing Timestamp nonces', () => {
  const values = Array.from({ length: 50 }, () => nextRequestTimestamp(1_800_000_000_000));
  assert.equal(new Set(values).size, 50);
  for (let i = 1; i < values.length; i++) assert.ok(Number(values[i]) > Number(values[i - 1]));
  assert.match(values[0], /^\d{13}$/);
});

test('a clock moving backwards never repeats a nonce', () => {
  const a = Number(nextRequestTimestamp(1_900_000_000_000));
  const b = Number(nextRequestTimestamp(1_899_999_999_000));
  assert.ok(b > a);
});

test('invalid nonce envelope detection', () => {
  assert.equal(isInvalidNonceEnvelope({ code: 1004, message: 'Invalid nonce string.' }), true);
  assert.equal(isInvalidNonceEnvelope({ code: 1004, msg: 'invalid nonce string' }), true);
  assert.equal(isInvalidNonceEnvelope({ code: 1004, message: 'other' }), false);
  assert.equal(isInvalidNonceEnvelope({ code: 0 }), false);
});

test('server and login use the shared nonce source and replay once with a fresh nonce', () => {
  const server = fs.readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
  const login = fs.readFileSync(new URL('../native-login.mjs', import.meta.url), 'utf8');
  assert.match(server, /const nextNonce = typeof gmNextRequestTimestamp === 'function'/);
  assert.match(server, /'Timestamp': nextNonce\(\)/);
  assert.match(server, /nonceAttempt === 0 && invalidNonce\(envelope\)\) \{ headers\.Timestamp = nextNonce\(\); continue; \}/);
  assert.doesNotMatch(login, /Timestamp: String\(Date\.now\(\)\)|headers\.Timestamp = String\(Date\.now/);
});

