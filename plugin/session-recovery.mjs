/**
 * Coordinate one login after Speediance reports its explicit expired-token
 * code. Parallel requests for the same profile share the same refresh, while
 * a request that observes a newer token skips an unnecessary login.
 */
/**
 * Return whether a request may be replayed after refreshing an expired
 * Speediance session. Only GET and HEAD are safe to replay: a write request
 * may have reached the service before the expired-token response was returned.
 */
export function isSafeToRetryAfterSessionRefresh(method) {
  if (typeof method !== 'string') return false;
  const normalizedMethod = method.trim().toUpperCase();
  return normalizedMethod === 'GET' || normalizedMethod === 'HEAD';
}

export function createSessionRecovery({ readToken, login }) {
  if (typeof readToken !== 'function' || typeof login !== 'function') {
    throw new TypeError('Session recovery requires token reader and login functions.');
  }

  const pendingByProfile = new Map();

  return async function recoverExpiredSession(profile, rejectedToken, binding = null) {
    if (typeof profile !== 'string' || !profile.trim() || typeof rejectedToken !== 'string' || !rejectedToken) {
      throw new TypeError('Session recovery requires a profile and the rejected token.');
    }

    const key = JSON.stringify([profile, binding]);
    const pending = pendingByProfile.get(key);
    if (pending) return pending;

    const recovery = (async () => {
      const currentToken = await readToken(profile, binding);
      if (typeof currentToken === 'string' && currentToken && currentToken !== rejectedToken) {
        return { refreshed: false, reusedConcurrentRefresh: true };
      }

      await login(profile, binding);
      return { refreshed: true, reusedConcurrentRefresh: false };
    })();

    pendingByProfile.set(key, recovery);
    try {
      return await recovery;
    } finally {
      if (pendingByProfile.get(key) === recovery) pendingByProfile.delete(key);
    }
  };
}
