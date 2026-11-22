import { readFileSync } from 'node:fs';

const evidenceUrl = new URL('./skills/training-science/references/resistance-training-evidence.md', import.meta.url);
export const SCIENCE_GUIDANCE_TOPICS = Object.freeze([
  'hypertrophy', 'strength', 'volume', 'frequency', 'order', 'progression',
  'deload', 'recovery', 'warmup', 'stretching', 'rest', 'supersets',
  'modes', 'cardio', 'core',
]);

export const SCIENCE_GUIDANCE_HEADINGS = Object.freeze({
  hypertrophy: ['### Recepta na trening — Currier i wsp., 2023', '### Bliskość upadku — Robinson i wsp., 2024'],
  strength: ['### ACSM Position Stand, 2026', '### Recepta na trening — Currier i wsp., 2023'],
  volume: ['### Objętość — Schoenfeld i wsp., 2017', '### Objętość i częstotliwość — Pelland i wsp., 2026'],
  frequency: ['### Częstotliwość — Schoenfeld i wsp., 2019', '### Objętość i częstotliwość — Pelland i wsp., 2026'],
  order: ['### Kolejność ćwiczeń — Nunes i wsp., 2021'],
  progression: ['## Uzupełnienie źródeł: progresja i wysiłek — sprawdzone 2026-10-08'],
  deload: ['### Deload'],
  recovery: ['### Sen i monitorowanie regeneracji'],
  warmup: ['### Rozgrzewka i serie wprowadzające'],
  stretching: ['### Rozciąganie i zakres ruchu'],
  rest: ['### Odpoczynek między seriami — Singer i wsp., 2024'],
  supersets: ['### Superserie — Zhang i wsp., 2025'],
  modes: ['### Metody zaawansowane i tryby'],
  cardio: ['### Trening siłowy i cardio'],
  core: ['### Mięśnie skośne brzucha'],
});

const MAX_SOURCE_BYTES = 100_000;
const MAX_SECTION_CHARS = 12_000;
const MAX_RESULT_CHARS = 18_000;
export const SCIENCE_GUIDANCE_NOTICE = 'Navigational historical guidance from the public GM Coach evidence document; not a fresh PubMed check or scientific approval.';

/** Return exact markdown sections for one explicit topic. No account or network access. */
export function getScienceGuidance(topic, { markdown } = {}) {
  if (typeof topic !== 'string' || !Object.hasOwn(SCIENCE_GUIDANCE_HEADINGS, topic)) {
    throw new RangeError('Unknown science guidance topic.');
  }
  const source = markdown === undefined ? readFileSync(evidenceUrl, 'utf8') : markdown;
  if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
    throw new RangeError('Science guidance source exceeds bound or is invalid.');
  }
  const headings = SCIENCE_GUIDANCE_HEADINGS[topic];
  const lines = source.split(/(?<=\n)/);
  const starts = [];
  let offset = 0;
  for (const line of lines) {
    const match = /^(#{1,6}) [^\r\n]+/.exec(line);
    if (match) starts.push({ heading: match[0], level: match[1].length, offset });
    offset += line.length;
  }
  const sections = headings.map(heading => {
    const matches = starts.filter(entry => entry.heading === heading);
    if (matches.length !== 1) throw new Error(`Missing or duplicate science guidance heading: ${heading}`);
    const start = matches[0];
    const next = starts.find(entry => entry.offset > start.offset && entry.level <= start.level);
    const content = source.slice(start.offset, next?.offset ?? source.length).trimEnd();
    if (content.length > MAX_SECTION_CHARS) throw new RangeError(`Science guidance section exceeds bound: ${heading}`);
    return { heading, markdown: content };
  });
  const result = { topic, source: 'skills/training-science/references/resistance-training-evidence.md', notice: SCIENCE_GUIDANCE_NOTICE, sections };
  if (JSON.stringify(result).length > MAX_RESULT_CHARS) throw new RangeError('Science guidance result exceeds bound.');
  return result;
}

/** Batch related public guidance topics without requiring one model call per topic. */
export function getScienceGuidanceBatch(topics) {
  if (!Array.isArray(topics) || topics.length < 1 || topics.length > 4 || new Set(topics).size !== topics.length) throw new RangeError('Choose 1–4 distinct science topics.');
  const items = topics.map(topic => getScienceGuidance(topic));
  const result = { topics, topicCount: topics.length, sectionCount: items.reduce((sum,item)=>sum+item.sections.length,0), items, notice: SCIENCE_GUIDANCE_NOTICE, freshPubMedRequired: true, scientificApproval: false, readOnly: true };
  if (JSON.stringify(result).length > 24_000) throw new RangeError('Science guidance batch exceeds 24,000 characters; request fewer topics.');
  return result;
}
