// reference client's reference limit. NOT the account limit: a real account held 51 templates on 2026-11-08.
// Without a limit detected from an API rejection the limit is unknown and never blocks proactively.
export const REFERENCE_CLIENT_TEMPLATE_LIMIT = 50;

export function summarizeTemplateDemand(used, requiredNewTemplates = 0) {
  if (!Number.isSafeInteger(requiredNewTemplates) || requiredNewTemplates < 0 || requiredNewTemplates > 364) throw new TypeError('Invalid required template count.');
  const capacity = summarizeTemplateCapacity(used);
  return { used, limit: null, left: null, shortage: 0, limitSource: 'unknown', accountLimitVerified: false, requiredNewTemplates,
    referenceClientReferenceLimit: capacity.limit, referenceLeft: capacity.left, referenceShortage: Math.max(0, requiredNewTemplates - capacity.left),
    quotaStatus: 'unknown-limit', note: 'API nie podaje limitu, a konto miało już więcej niż 50 szablonów (limit klienta referencyjnego 50 nie dotyczy konta). Zapis nie jest blokowany z wyprzedzeniem; gdy API odrzuci zapis z powodu limitu, GM Coach wykryje limit i zwróci propozycję najstarszych szablonów nieużywanych w kalendarzu (usunięcie wymaga approve_template_deletions).',
    alternatives: ['Edytuj wybrany istniejący szablon przez naukowy podgląd zmiany.', 'Ponownie wykorzystaj tylko istniejący szablon z niezmienioną, zweryfikowaną dawką; różne bloki progresji mogą wymagać osobnych szablonów.', 'Wybierz konkretne zbędne szablony do usunięcia i potwierdź ich nazwy, kody oraz skutki.'], automaticDeletion: false };
}

export function assertTemplateDemandAvailable(used, requiredNewTemplates = 1) {
  const demand = summarizeTemplateDemand(used, requiredNewTemplates);
  return demand;
}

export function summarizeTemplateCapacity(used, limit = REFERENCE_CLIENT_TEMPLATE_LIMIT) {
  if (!Number.isSafeInteger(used) || used < 0) {
    throw new TypeError('Liczba zapisanych szablonów musi być nieujemną liczbą całkowitą.');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) {
    throw new TypeError('Limit szablonów musi być dodatnią, ograniczoną liczbą całkowitą.');
  }
  return { used, limit, left: Math.max(0, limit - used) };
}

export function assertTemplateSlotAvailable(used, limit) {
  if (limit === undefined) return assertTemplateDemandAvailable(used, 1);
  const capacity = summarizeTemplateCapacity(used, limit);
  if (capacity.left === 0) {
    throw new Error(
      `Osiągnięto limit ${capacity.limit} kontraktu klienta referencyjnego (limit konta API niepotwierdzony). ` +
      'GM Coach nie skasuje żadnego planu, żeby zrobić miejsce. Edytuj istniejący szablon ' +
      'albo usuń niepotrzebny w aplikacji Speediance i ponów podgląd.'
    );
  }
  return capacity;
}
const TEMPLATE_TIME_KEYS = ['createTime', 'createdTime', 'createDate', 'createdAt', 'gmtCreate', 'updateTime', 'updatedAt'];
function templateAge(template) {
  for (const key of TEMPLATE_TIME_KEYS) {
    const value = template?.[key];
    const ms = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(String(value ?? '').replace(' ', 'T'));
    if (Number.isFinite(ms) && ms > 0) return { ms, source: key };
  }
  const id = Number(template?.id);
  return Number.isSafeInteger(id) ? { ms: null, id, source: 'id-order' } : { ms: null, id: null, source: 'unknown' };
}

// Plans free slots for new templates. Only a limit detected from an API rejection constrains; otherwise the limit is unknown.
export function planTemplateCapacity({ templates, requiredNewTemplates, calendarCodes = [], limit, limitSource, getCode = row => row?.code }) {
  if (!Array.isArray(templates)) throw new TypeError('Template list required.');
  const known = Number.isSafeInteger(limit) && limit > 0;
  const effectiveLimit = known ? limit : null;
  const source = limitSource ?? (known ? 'api-error-detected' : 'unknown');
  const capacity = known ? summarizeTemplateCapacity(templates.length, effectiveLimit) : { used: templates.length, left: null };
  if (!Number.isSafeInteger(requiredNewTemplates) || requiredNewTemplates < 0) throw new TypeError('Invalid required template count.');
  const shortage = known ? Math.max(0, requiredNewTemplates - capacity.left) : 0;
  const used = new Set(calendarCodes.map(String));
  const candidates = templates.filter(row => getCode(row) && !used.has(String(getCode(row))))
    .map(row => ({ code: String(getCode(row)), name: row.name ?? null, id: row.id ?? null, age: templateAge(row) }))
    .sort((a, b) => (a.age.ms ?? Infinity) - (b.age.ms ?? Infinity) || (a.age.id ?? Infinity) - (b.age.id ?? Infinity));
  const proposal = candidates.slice(0, shortage).map(({ code, name, id, age }) => ({ code, name, id, createdAt: age.ms ? new Date(age.ms).toISOString() : null, ageSource: age.source }));
  return { used: capacity.used, limit: effectiveLimit, limitSource: source, left: capacity.left, requiredNewTemplates, shortage,
    fits: shortage === 0, calendarReferencedTemplates: used.size, deletionProposal: proposal,
    proposalCoversShortage: proposal.length >= shortage, consentParameter: 'approve_template_deletions', automaticDeletion: false };
}

// Chooses approved codes (oldest first) that are still unused proposal candidates; never more than the shortage.
export function selectApprovedTemplateDeletions(plan, approvedCodes = []) {
  if (plan.shortage === 0) return [];
  const approved = new Set((approvedCodes ?? []).map(String));
  const all = planCandidatesInOrder(plan);
  const chosen = all.filter(row => approved.has(row.code)).slice(0, plan.shortage);
  if (chosen.length < plan.shortage) {
    const error = new Error(`Brak miejsca na szablony: zajęte ${plan.used}/${plan.limit} (${plan.limitSource}), potrzeba ${plan.requiredNewTemplates}, brakuje ${plan.shortage}. Propozycja do usunięcia (najstarsze, nieużywane w kalendarzu): ${JSON.stringify(plan.deletionProposal)}. Po zgodzie użytkownika ponów z approve_template_deletions=[kody]; GM Coach usunie je i zapisze plan w jednym kroku.`);
    error.code = 'GM_COACH_TEMPLATE_CAPACITY_SHORTAGE';
    error.templateCapacity = plan;
    throw error;
  }
  return chosen;
}
function planCandidatesInOrder(plan) { return plan.allCandidates ?? plan.deletionProposal; }

// Detects a template-count limit from an API rejection message, e.g. "max 50 templates" / "上限50".
export function detectTemplateLimitFromError(error) {
  if (!/^SPEEDIANCE_API_/.test(String(error?.code ?? ''))) return null;
  const message = String(error?.message ?? '');
  if (!/templat|szablon|模板|limit|上限|最多|maximum|max/i.test(message)) return null;
  const match = message.match(/(?:limit|上限|最多|maximum|max(?:imum)?|up to|at most)\D{0,20}(\d{1,4})|(\d{1,4})\D{0,20}(?:templates|szablon|模板)/i);
  const value = Number(match?.[1] ?? match?.[2]);
  return Number.isSafeInteger(value) && value >= 1 && value <= 10_000 ? value : (/template|szablon|模板/i.test(message) && /limit|上限|最多|max|full|exceed/i.test(message) ? -1 : null);
}
