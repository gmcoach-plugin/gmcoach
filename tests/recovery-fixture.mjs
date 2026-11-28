import { runWithAccessoryFixture, installAccessoryFixture } from './accessory-empty-store-fixture.mjs';
import { normalizePreferenceReviews, assessPreferenceCompliance, assertPreferenceCompliance } from '../plugin/preference-compliance.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { createRecoveryContextRegistry, normalizeRecoveryContextDeclaration } from '../plugin/recovery-context.mjs';

const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function assertRecoveryContextCurrent(');
const end = source.indexOf('\nfunction apiAccountBinding(', start);
const notSentStart = source.indexOf('const requestNotSentErrors = new WeakMap();');
const notSentEnd = source.indexOf('\nconst executeTemplateReservation', notSentStart);
export const fixtureRecoveryDeclaration = Object.freeze({ status: 'not_requested', limitations: ['Synthetic fixture does not fetch health or infer biological readiness.'] });

// Legacy fixtures use short synthetic account labels. Hash those labels only at
// the real registry boundary; account-change comparisons retain the original
// labels and both dispatch guards below are extracted unchanged from production.
export function installRecoveryFixture(dependencies) {
  installAccessoryFixture(dependencies);
  const registry = createRecoveryContextRegistry();
  const account = value => createHash('sha256').update(String(value)).digest('hex');
  const recoveryContexts = { resolve: value => registry.resolve({ ...value, accountFingerprint: account(value.accountFingerprint) }) };
  const fingerprint = (...args) => dependencies.profileConfigFingerprint(...args);
  const review = (plan, profile, identity) => {
    plan.recoveryContext ??= structuredClone(fixtureRecoveryDeclaration);
    plan.resolvedRecoveryContext = recoveryContexts.resolve({ profile, accountFingerprint: identity, declaration: plan.recoveryContext });
    return plan;
  };
  Object.assign(dependencies, runWithAccessoryFixture(`${source.slice(start, end)}; ({ assertRecoveryContextCurrent, recoveryBeforeSend })`, { recoveryContexts, profileConfigFingerprint: fingerprint }));
  Object.assign(dependencies, runWithAccessoryFixture(`${source.slice(notSentStart, notSentEnd)}; ({ isRequestNotSent })`));
  dependencies.recoveryContexts = recoveryContexts;
  dependencies.normalizeRecoveryContextDeclaration = normalizeRecoveryContextDeclaration;
  Object.assign(dependencies, {normalizePreferenceReviews, assessPreferenceCompliance, assertPreferenceCompliance});
  dependencies.reviewRecoveryFixture = review;
  if (dependencies.validatePlanForProfile) {
    const validate = dependencies.validatePlanForProfile;
    dependencies.validatePlanForProfile = async (plan, profile, expected, ...args) => {
      const result = await validate(plan, profile, expected, ...args);
      const identity = await dependencies.readProfileConfig(profile);
      review(result.plan, profile, expected ?? fingerprint(identity.config, identity.password));
      return result;
    };
  }
  return dependencies;
}

export function runWithRecoveryFixture(code, dependencies, options) {
  if (dependencies.readProfileConfig && dependencies.profileConfigFingerprint) installRecoveryFixture(dependencies);
  return runWithAccessoryFixture(code, dependencies, options);
}
