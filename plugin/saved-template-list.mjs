import { isDeepStrictEqual } from 'node:util';

const TEMPLATE_ARRAY_KEYS = new Set([
  'list', 'records', 'rows', 'workouts', 'templatelist', 'customtrainingtemplatelist'
]);
const RESPONSE_WRAPPER_KEYS = new Set(['data', 'result', 'page']);
const PAGINATION_WRAPPER_KEYS = new Set(['pagination', 'pageinfo', 'page_info', 'paging', 'meta', 'metadata']);
const HAS_MORE_KEYS = new Set(['hasnext', 'hasmore', 'hasnextpage', 'has_next', 'has_more']);
const TOTAL_KEYS = new Set(['total', 'totalcount', 'totalrecords', 'totalelements']);
const PAGE_COUNT_KEYS = new Set(['pagecount', 'totalpages', 'totalpage']);
const MAX_WRAPPER_NODES = 256;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function explicitBoolean(value, name) {
  if (typeof value !== 'boolean') throw new Error(`Metadane stronicowania „${name}” mają nieznany format; listy nie uznano za kompletną.`);
  return value;
}

function explicitCount(value, name) {
  const number = typeof value === 'string' && /^\d{1,16}$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`Metadane stronicowania „${name}” mają nieznany format; listy nie uznano za kompletną.`);
  return number;
}

/**
 * Parse only the known template-list envelope shapes. An unwrapped array is
 * accepted to preserve the public reference client response shape. This does not infer
 * completeness from a short or empty page; explicit partial evidence and
 * competing list arrays fail closed.
 */
function parseTemplateList(envelope, { allowPartial = false, pageObservation = false } = {}) {
  const issues = [];
  let strictMessage = null;
  function incomplete(code, message, counts = {}) {
    if (!allowPartial) { const error = new Error(message); error.code = 'saved_template_list_incomplete'; error.issue = { code, ...counts }; throw error; }
    strictMessage ??= message;
    issues.push({ code, ...counts });
  }
  const candidates = [];
  const hasMoreSignals = [];
  const declaredTotals = [];
  const declaredPageCounts = [];
  const queue = [{ value: envelope, path: '$', metadataOnly: false }];
  let visited = 0;

  while (queue.length) {
    if (++visited > MAX_WRAPPER_NODES) throw new Error('Odpowiedź listy szablonów jest zbyt złożona, aby potwierdzić jej kompletność.');
    const { value, path, metadataOnly } = queue.shift();
    if (Array.isArray(value)) {
      if (!metadataOnly) candidates.push({ values: value, path });
      continue;
    }
    if (!isRecord(value)) continue;

    for (const [rawKey, child] of Object.entries(value)) {
      const key = rawKey.toLowerCase();
      if (HAS_MORE_KEYS.has(key)) {
        hasMoreSignals.push({ value: explicitBoolean(child, rawKey), path: `${path}.${rawKey}` });
      } else if (key === 'paginationexhaustive') {
        hasMoreSignals.push({ value: !explicitBoolean(child, rawKey), path: `${path}.${rawKey}` });
      } else if (TOTAL_KEYS.has(key)) {
        declaredTotals.push({ value: explicitCount(child, rawKey), path: `${path}.${rawKey}` });
      } else if (PAGE_COUNT_KEYS.has(key)) {
        declaredPageCounts.push({ value: explicitCount(child, rawKey), path: `${path}.${rawKey}` });
      }

      if (!metadataOnly && TEMPLATE_ARRAY_KEYS.has(key) && Array.isArray(child)) {
        candidates.push({ values: child, path: `${path}.${rawKey}` });
      } else if (metadataOnly && PAGINATION_WRAPPER_KEYS.has(key) && isRecord(child)) {
        queue.push({ value: child, path: `${path}.${rawKey}`, metadataOnly: true });
      } else if (!metadataOnly && (RESPONSE_WRAPPER_KEYS.has(key) || PAGINATION_WRAPPER_KEYS.has(key)) && isRecord(child)) {
        queue.push({ value: child, path: `${path}.${rawKey}`, metadataOnly: PAGINATION_WRAPPER_KEYS.has(key) });
      } else if (!metadataOnly && RESPONSE_WRAPPER_KEYS.has(key) && Array.isArray(child)) {
        candidates.push({ values: child, path: `${path}.${rawKey}` });
      }
    }
  }

  if (!candidates.length) return null;
  const selected = candidates[0];
  if (candidates.some(candidate => !isDeepStrictEqual(candidate.values, selected.values))) {
    throw new Error('Odpowiedź listy szablonów zawiera sprzeczne tablice; odczyt zablokowano.');
  }
  const seenCodes = new Set();
  for (const row of selected.values) {
    if (!isRecord(row)) throw new Error('Lista szablonów zawiera nieprawidłowy rekord; odczyt zablokowano.');
    const aliases = [row.code, row.templateCode].filter(value => value !== undefined && value !== null);
    if (aliases.some(value => typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(value)) || new Set(aliases).size > 1) throw new Error('Rekord szablonu ma nieprawidłowe lub sprzeczne kody; odczyt zablokowano.');
    const code = aliases[0];
    if (!code) incomplete('missing_template_code', 'Lista zawiera szablon bez stabilnego kodu; nie można potwierdzić kompletności.');
    else if (seenCodes.has(code)) incomplete('duplicate_template_code', 'Lista zawiera powtórzony kod szablonu; nie można potwierdzić kompletności.');
    else seenCodes.add(code);
  }

  if (pageObservation) return { templates: selected.values, issues, metadata: { hasMoreSignals, declaredTotals, declaredPageCounts }, rowsPath: selected.path };
  const distinctSignals = new Set(hasMoreSignals.map(signal => signal.value));
  if (distinctSignals.size > 1) incomplete('conflicting_pagination_flags', 'Metadane stronicowania listy szablonów są sprzeczne; odczyt zablokowano.');
  if (distinctSignals.has(true)) incomplete('has_more', 'API oznaczyło listę szablonów jako niekompletną; nie używaj jej do zapisu ani weryfikacji.');

  const distinctPageCounts = new Set(declaredPageCounts.map(item => item.value));
  if (distinctPageCounts.size > 1) incomplete('conflicting_page_counts', 'Metadane liczby stron szablonów są sprzeczne; odczyt zablokowano.');
  if ([...distinctPageCounts].some(count => count > 1)) incomplete('multiple_pages', 'API zgłosiło wiele stron szablonów mimo żądania pełnej listy; odczyt jest niekompletny.');
  if (distinctPageCounts.has(0) && selected.values.length) incomplete('zero_pages_with_rows', 'Metadane zerowej liczby stron nie zgadzają się z listą szablonów.', { returnedCount: selected.values.length });

  const distinctTotals = new Set(declaredTotals.map(item => item.value));
  if (distinctTotals.size > 1) incomplete('conflicting_total_counts', 'Metadane liczby szablonów są sprzeczne; odczyt zablokowano.');
  if (declaredTotals.length) {
    const total = declaredTotals[0].value;
    if (total > selected.values.length) incomplete('total_exceeds_rows', `API zgłosiło więcej szablonów niż zwrócona lista; odczyt jest niekompletny. Zgłoszona liczba: ${total}; zwrócone pozycje: ${selected.values.length}.`, { declaredCount: total, returnedCount: selected.values.length });
    if (total < selected.values.length) incomplete('total_below_rows', `Metadane liczby szablonów nie zgadzają się z listą; odczyt zablokowano. Zgłoszona liczba: ${total}; zwrócone pozycje: ${selected.values.length}.`, { declaredCount: total, returnedCount: selected.values.length });
  }

  return { templates: selected.values, completeness: { status: issues.length ? 'partial' : 'complete', issues }, strictMessage, metadataSignals: {
    hasMore: hasMoreSignals, totals: declaredTotals, pageCounts: declaredPageCounts, rowsPath: selected.path
  } };
}
export function extractTemplateList(envelope) {
  return parseTemplateList(envelope)?.templates ?? null;
}

export async function getSavedCustomTemplates(profile, deviceType, apiRequest) {
  if (typeof profile !== 'string' || !profile || !Number.isSafeInteger(Number(deviceType)) || Number(deviceType) < 1 || typeof apiRequest !== 'function') {
    throw new TypeError('A valid profile, device type, and API request function are required.');
  }
  const observed = await getVerifiedSavedCustomTemplates(profile, deviceType, apiRequest);
  if (observed.completeness.status !== 'complete') {
    const issue = observed.completeness.issues[0];
    throw new Error(observed.strictMessage ?? `Lista szablonów jest niekompletna (${issue?.code ?? 'unknown'}).`);
  }
  return observed.templates;
}

/** Observed rows are usable for display only; absence and write integrity require the strict reader. */
export async function getSavedCustomTemplatesForRead(profile, deviceType, apiRequest) {
  if (typeof profile !== 'string' || !profile || !Number.isSafeInteger(Number(deviceType)) || Number(deviceType) < 1 || typeof apiRequest !== 'function') throw new TypeError('A valid profile, device type, and API request function are required.');
  const response = await apiRequest(profile, `/app/v4/customTrainingTemplate/appPage?pageNo=1&pageSize=-1&deviceTypes=${encodeURIComponent(deviceType)}`);
  const parsed = parseTemplateList(response, { allowPartial: true });
  if (!parsed) throw new Error('Nie udało się odczytać listy zapisanych programów Speediance w oczekiwanym formacie.');
  return { ...parsed, usableForMutation: false };
}

/** Reconcile the observed Speediance pageSize=-1 total=0 anomaly with bounded pages of 50.
 * Reads pages 1..N until an empty page (completeness = the next page is empty); any number of templates (51 observed
 * on a real account 2026-11-08, so 50 is not the account limit). Every unbounded row must appear in the pages, codes must
 * be unique, and page totals may only be 0 (the anomaly) or the paged row count. Otherwise the list stays partial.
 * This never infers the account quota.
 */
export async function getVerifiedSavedCustomTemplates(profile, deviceType, apiRequest) {
  const observed = await getSavedCustomTemplatesForRead(profile, deviceType, apiRequest);
  if (observed.completeness.status === 'complete') return observed;
  const issue = observed.completeness.issues[0], signals = observed.metadataSignals;
  if (observed.completeness.issues.length !== 1 || issue?.code !== 'total_below_rows' || issue.declaredCount !== 0 ||
      issue.returnedCount !== observed.templates.length || signals?.rowsPath !== '$.data' ||
      signals.totals.length !== 1 || signals.totals[0].path !== '$.total' || signals.hasMore.length || signals.pageCounts.length ||
      observed.templates.length === 0) return observed;
  const pageSize = 50, maxPages = 40;
  const readPage = async pageNo => {
    const response = await apiRequest(profile, `/app/v4/customTrainingTemplate/appPage?pageNo=${pageNo}&pageSize=${pageSize}&deviceTypes=${encodeURIComponent(deviceType)}`);
    return parseTemplateList(response, { allowPartial: true, pageObservation: true });
  };
  const templates = [], codes = new Set(), totals = [];
  let pages = 0, endedEmpty = false, problem = null;
  for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
    const page = await readPage(pageNo); pages++;
    if (!page || page.rowsPath !== '$.data' || page.issues.length || page.metadata.hasMoreSignals.length || page.metadata.declaredPageCounts.length || page.metadata.declaredTotals.length > 1) { problem = 'page_shape'; break; }
    if (page.metadata.declaredTotals.length) totals.push(page.metadata.declaredTotals[0].value);
    if (!page.templates.length) { endedEmpty = true; break; }
    if (page.templates.length > pageSize) { problem = 'page_size'; break; }
    for (const row of page.templates) { const code = row.code ?? row.templateCode; if (!code || codes.has(code)) { problem = 'duplicate_or_missing_code'; break; } codes.add(code); templates.push(row); }
    if (problem) break;
  }
  if (!problem && !endedEmpty) problem = 'page_limit';
  if (!problem && totals.some(total => total !== 0 && total !== templates.length)) problem = 'page_total_mismatch';
  if (!problem && observed.templates.some(row => !codes.has(row.code ?? row.templateCode))) problem = 'unbounded_row_missing_from_pages';
  // Real account 2026-11-08: 52 templates existed while both the unbounded list and the pages returned exactly 50 and the
  // next page was empty. Exactly one full page followed by an empty page therefore does not prove completeness;
  // rows actually delivered on later pages (51+) do.
  if (!problem && templates.length === pageSize) problem = 'api_list_cap_50';
  if (problem) return { ...observed, verificationDiagnostics: { problem, pagesRead: pages, pagedRows: templates.length, unboundedRows: observed.templates.length, pageTotals: totals } };
  return { ...observed, templates, completeness: { status: 'complete', issues: [], verification: 'bounded-pages-until-empty', verifiedPages: pages, pagedRows: templates.length, unboundedRows: observed.templates.length }, usableForMutation: true };
}


/** Explicit diagnostic only. Never called automatically by strict readers or writes.
 * request must retain the full envelope and enforce authenticated account binding.
 * Positive pages and short-page termination follow pinned pookey client.py468–484;
 * deviceTypes is retained from reference client, whose combination is not independently proven.
 */
export async function observeSavedCustomTemplatePages(profile, deviceType, request) {
  if (typeof profile !== 'string' || !profile || !Number.isSafeInteger(Number(deviceType)) || Number(deviceType) < 1 || typeof request !== 'function') throw new TypeError('A valid profile, device type, and authenticated request function are required.');
  const pageSize = 50, maxPages = 20, maxRows = 1000, maxBytes = 4 * 1024 * 1024;
  const templates = [], pages = [], issues = [], seen = new Set(), pageHashes = new Set();
  let bytes = 0, total, pageCount, termination = 'page_limit';
  for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
    const path = `/app/v4/customTrainingTemplate/appPage?pageNo=${pageNo}&pageSize=${pageSize}&deviceTypes=${encodeURIComponent(deviceType)}`;
    // Preserve bounded full JSON envelopes, without invoking accessors or retaining aliases.
    const envelope = snapshotObservedEnvelope(await request(profile, path));
    if (isRecord(envelope) && Object.hasOwn(envelope, 'code') && envelope.code !== 0) throw new Error('Template diagnostic received a non-success API envelope.');
    bytes += Buffer.byteLength(JSON.stringify(envelope), 'utf8');
    if (bytes > maxBytes) { issues.push({ code: 'byte_limit' }); termination = 'blocked'; break; }
    const parsed = parseTemplateList(envelope, { allowPartial: true, pageObservation: true });
    if (!parsed) throw new Error('Unsupported template page envelope.');
    const rows = parsed.templates;
    pages.push({ pageNo, path, envelope, rowsPath: parsed.rowsPath, returnedCount: rows.length, metadata: parsed.metadata });
    const fail = code => { issues.push({ code, pageNo }); termination = 'blocked'; };
    if (parsed.issues.length) { issues.push(...parsed.issues.map(issue => ({ ...issue, pageNo }))); termination = 'blocked'; break; }
    if (rows.length > pageSize || templates.length + rows.length > maxRows) { fail('row_limit'); break; }
    const totals = new Set(parsed.metadata.declaredTotals.map(row => row.value));
    const counts = new Set(parsed.metadata.declaredPageCounts.map(row => row.value));
    const flags = new Set(parsed.metadata.hasMoreSignals.map(row => row.value));
    if (totals.size > 1 || counts.size > 1 || flags.size > 1) { fail('conflicting_page_metadata'); break; }
    const currentTotal = [...totals][0], currentPageCount = [...counts][0];
    if ((total !== undefined && currentTotal !== undefined && total !== currentTotal) || (pageCount !== undefined && currentPageCount !== undefined && pageCount !== currentPageCount)) { fail('count_drift'); break; }
    total ??= currentTotal; pageCount ??= currentPageCount;
    if ((total !== undefined && total < templates.length + rows.length) || (pageCount === 0 && rows.length)) { fail('count_contradiction'); break; }
    const codes = rows.map(row => row.code ?? row.templateCode);
    const signature = JSON.stringify(codes);
    if (rows.length && pageHashes.has(signature)) { fail('repeated_page'); break; }
    if (codes.some(code => seen.has(code))) { fail('overlapping_page'); break; }
    pageHashes.add(signature); codes.forEach(code => seen.add(code)); templates.push(...rows);
    if (rows.length < pageSize) {
      if (flags.has(true) || (total !== undefined && total !== templates.length) || (pageCount !== undefined && pageCount !== pageNo)) { fail('terminal_count_conflict'); break; }
      termination = 'consumer_short_page'; break;
    }
    if (flags.has(false) || (pageCount !== undefined && pageNo >= pageCount) || (total !== undefined && templates.length >= total)) { fail('full_page_terminal_requires_next_page'); break; }
  }
  if (termination === 'page_limit') issues.push({ code: 'page_limit' });
  return { templates, pages, completeness: { status: 'unknown', issues }, usableForMutation: false,
    coverage: { method: 'bounded_positive_page_observation', termination, observedCount: templates.length, declaredCount: total ?? null, pageSize, maxPages, maxRows, maxBytes,
      deviceFilter: Number(deviceType), filteredPaginationContract: 'unverified', authenticatedBinding: 'injected_request_responsibility' } };
}

function snapshotObservedEnvelope(value) {
  let nodes = 0, characters = 0;
  function copy(item, depth) {
    if (++nodes > 30000 || depth > 16) throw new Error('Template diagnostic envelope exceeds bounds.');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'string') { characters += item.length; if (item.length > 65536 || characters > 1024 * 1024) throw new Error('Template diagnostic string exceeds bounds.'); return item; }
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (!item || typeof item !== 'object' || (!Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item)))) throw new Error('Template diagnostic requires plain JSON data.');
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (Object.getOwnPropertySymbols(item).length || Object.values(descriptors).some(row => !Object.hasOwn(row, 'value'))) throw new Error('Template diagnostic rejects accessors.');
    if (Array.isArray(item)) {
      if (item.length > 1000 || Object.keys(descriptors).length !== item.length + 1) throw new Error('Template diagnostic rejects sparse or oversized arrays.');
      return Array.from({ length: item.length }, (_, index) => { if (!Object.hasOwn(descriptors, index)) throw new Error('Sparse template diagnostic array.'); return copy(descriptors[index].value, depth + 1); });
    }
    if (Object.keys(descriptors).length > 256) throw new Error('Template diagnostic object exceeds bounds.');
    const result = Object.create(null);
    for (const [key, descriptor] of Object.entries(descriptors)) { characters += key.length; if (key.length > 1024 || characters > 1024 * 1024) throw new Error('Template diagnostic keys exceed bounds.'); result[key] = copy(descriptor.value, depth + 1); }
    return result;
  }
  return copy(value, 0);
}
