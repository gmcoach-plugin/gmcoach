const PROFILE_READINESS_ERROR_CODES = new Set([
  'GM_COACH_PROFILE_CONFIG_MISSING',
  'GM_COACH_PROFILE_CONFIG_INVALID',
  'GM_COACH_PROFILE_EMAIL_MISSING',
  'GM_COACH_PROFILE_PASSWORD_MISSING'
]);

export function createProfileReadinessError(message, code) {
  if (!PROFILE_READINESS_ERROR_CODES.has(code)) {
    throw new TypeError('Unknown GM Coach profile readiness error code.');
  }
  const error = new Error(message);
  error.code = code;
  return error;
}

export function classifyProfileReadinessError(error, CredentialStoreError) {
  if (typeof CredentialStoreError === 'function' && error instanceof CredentialStoreError) {
    return 'vault-unavailable';
  }
  if (error?.code === 'GM_COACH_PROFILE_PASSWORD_MISSING') return 'missing-password';
  if (error?.code === 'GM_COACH_PROFILE_EMAIL_MISSING') return 'missing-email';
  return 'setup-required';
}
