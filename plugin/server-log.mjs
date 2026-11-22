import fs from 'node:fs';
import path from 'node:path';

/** Rotating JSONL server log in the plugin data folder. Never records secrets or plan/account payloads. */
const SECRET_KEYS = /^(token|password|passwd|secret|authorization|cookie|email|app_user_id|user_id|credential|apikey|api_key)$/i;
const SECRET_TEXT = [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, /(token|password|authorization|bearer)\s*[:=]\s*\S+/gi, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g];
export function redactForLog(value, depth = 0) {
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') { let text = value.length > 500 ? value.slice(0, 500) + '…' : value; for (const pattern of SECRET_TEXT) text = text.replace(pattern, '[redacted]'); return text; }
  if (depth > 3) return '[depth]';
  if (Array.isArray(value)) return value.slice(0, 20).map(item => redactForLog(item, depth + 1));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [key, SECRET_KEYS.test(key) ? '[redacted]' : redactForLog(item, depth + 1)]));
  return String(value);
}
/** Full-depth redaction for captured fixtures: removes secrets by key and pattern, never truncates data. */
export function redactDeep(value) {
  if (typeof value === 'string') { let text = value; for (const pattern of SECRET_TEXT) text = text.replace(pattern, '[redacted]'); return text; }
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEYS.test(key) ? '[redacted]' : redactDeep(item)]));
  return value;
}
export function createServerLog({ directory, maxBytes = 1_000_000, keep = 3, now = () => new Date() } = {}) {
  const file = directory ? path.join(directory, 'gm-coach-server.log') : null;
  function rotate() {
    try {
      if (!file || !fs.existsSync(file) || fs.statSync(file).size < maxBytes) return;
      for (let index = keep - 1; index >= 1; index--) { const from = file + '.' + index, to = file + '.' + (index + 1); if (fs.existsSync(from)) fs.renameSync(from, to); }
      fs.renameSync(file, file + '.1');
      const oldest = file + '.' + (keep + 1); if (fs.existsSync(oldest)) fs.unlinkSync(oldest);
    } catch { /* logging never breaks the server */ }
  }
  function write(level, event, details = {}) {
    if (!file) return;
    try { fs.mkdirSync(directory, { recursive: true }); rotate(); fs.appendFileSync(file, JSON.stringify({ at: now().toISOString(), level, event, ...redactForLog(details) }) + '\n'); } catch { /* ignore */ }
  }
  return Object.freeze({ file, info: (event, details) => write('info', event, details), error: (event, details) => write('error', event, details) });
}

