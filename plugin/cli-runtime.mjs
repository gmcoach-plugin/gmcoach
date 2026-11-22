const CLI_NOT_FOUND_CODE = 'GM_COACH_CLI_NOT_FOUND';

function isUnavailableExecutable(error) {
  return error?.code === 'ENOENT' || error?.code === 'EACCES';
}

export function createCliRuntime({ candidates, probe }) {
  if (typeof candidates !== 'function' || typeof probe !== 'function') {
    throw new TypeError('CLI runtime requires candidate and probe functions.');
  }

  let resolvedPath = null;
  let resolving = null;

  async function resolve() {
    if (resolvedPath) return resolvedPath;
    if (resolving) return resolving;

    const attempt = (async () => {
      const options = [...new Set(candidates().filter((candidate) => typeof candidate === 'string' && candidate.trim()))];
      for (const candidate of options) {
        try {
          if (await probe(candidate)) {
            resolvedPath = candidate;
            return candidate;
          }
        } catch {
          // A bad or stale candidate must not hide a later working install.
        }
      }
      // A miss is deliberately not cached. The CLI may be restored or its
      // install location may become visible while this MCP process is alive.
      return null;
    })();

    resolving = attempt;
    try {
      return await attempt;
    } finally {
      if (resolving === attempt) resolving = null;
    }
  }

  function invalidate(candidate = null) {
    if (candidate === null || resolvedPath === candidate) resolvedPath = null;
  }

  return { resolve, invalidate };
}

export async function runCliWithRecovery(runtime, args, options, execute) {
  if (!runtime || typeof runtime.resolve !== 'function' || typeof runtime.invalidate !== 'function' || typeof execute !== 'function') {
    throw new TypeError('CLI recovery requires a runtime resolver and executor.');
  }

  const command = await runtime.resolve();
  if (!command) {
    const error = new Error('No runnable Speediance CLI was found in the configured or bundled locations.');
    error.code = CLI_NOT_FOUND_CODE;
    throw error;
  }

  try {
    return await execute(command, args, options);
  } catch (error) {
    if (!isUnavailableExecutable(error)) throw error;
    runtime.invalidate(command);

    // ENOENT/EACCES means the executable never started, so retrying once with
    // a newly resolved candidate cannot duplicate a remote operation.
    const replacement = await runtime.resolve();
    if (!replacement) throw error;
    try {
      return await execute(replacement, args, options);
    } catch (retryError) {
      if (isUnavailableExecutable(retryError)) runtime.invalidate(replacement);
      throw retryError;
    }
  }
}
// The stock CLI may replay POST after code91. Keep all workout mutations on
// Coach's native request path, whose write-replay policy is independently gated.
export function assertCoachCliCommand(args) {
  const strings = Array.isArray(args) && args.every(value => typeof value === 'string');
  const integer = value => /^\d{1,20}$/.test(value) && Number(value) > 0;
  const allowed = strings && (
    args.length === 1 && args[0] === 'login' ||
    args.length === 4 && args[0] === 'workouts' && args[1] === '--days' && integer(args[2]) && args[3] === '--json' ||
    args.length === 2 && args[0] === 'today' && args[1] === '--json' ||
    args.length === 4 && args[0] === 'today' && args[1] === '--date' && (args[2] === 'yesterday' || /^\d{4}-\d{2}-\d{2}$/.test(args[2])) && args[3] === '--json' ||
    args.length === 4 && args[0] === 'session' && integer(args[1]) && ['--free', '--program'].includes(args[2]) && args[3] === '--json'
  );
  if (!allowed) throw new Error('GM Coach CLI permits only explicit login and bounded read commands; workout mutations must use the native verified write path.');
}
