import { AsyncLocalStorage } from 'node:async_hooks';

// One user override for every plugin-side guard. The account owner has the final say:
// an overridable guard turns into a recorded warning when userOverride authorizes its code.
export const USER_OVERRIDE_TOOLS = new Set([
  'speediance_preview_program', 'speediance_create_program', 'gm_coach_prepare_quick_test_preview',
  'speediance_preview_training_cycle', 'speediance_execute_training_cycle', 'gm_coach_review_training_cycle',
  'gm_coach_audit_training_cycle', 'gm_coach_derive_training_cycle_prescription',
  'speediance_begin_training_cycle_draft', 'speediance_upload_training_cycle_batch', 'speediance_finalize_training_cycle_draft',
  'speediance_prepare_training_cycle_draft', 'gm_coach_review_training_cycle_draft', 'speediance_execute_training_cycle_draft',
  'speediance_preview_saved_program_update', 'speediance_update_saved_program',
  'speediance_preview_saved_program_schedule', 'speediance_schedule_saved_program',
  'gm_coach_preflight_selected_accessories', 'gm_coach_audit_training_interview',
  'gm_coach_prepare_science_scope', 'gm_coach_derive_evidence_bindings', 'gm_coach_calculate_sketch_time', 'gm_coach_calculate_compact_sketch_time'
]);

export const OVERRIDABLE_GUARDS = {
  science_gate: 'bramka naukowa (badania, evidence, decisionEvidence)',
  interview_incomplete: 'niedokończony audyt trenerski',
  nutrition_context_evidence: 'brak dowodu dla kontekstu żywieniowego',
  section_preferences: 'zgodność rozgrzewki/rozciągania z preferencjami',
  evidence_anchor: 'cytaty decyzji nie pasują do źródeł',
  preference_compliance: 'przegląd zgodności z preferencjami',
  time_budget: 'budżet czasu treningu',
  training_profile_changed: 'profil treningowy zmienił się od przeglądu',
  accessory_confirmation_stale: 'potwierdzenie akcesoriów wygasło lub się zmieniło',
  equipment_accessory: 'kontrola wymaganego wyposażenia',
  catalog_title_mismatch: 'tytuł ćwiczenia różni się od katalogu (użyty zostanie tytuł z katalogu)',
  cycle_intake_conflict: 'tydzień cyklu sprzeczny z wywiadem',
  deload_policy: 'wymagania dotyczące deloadu',
  pending_write_unknown: 'niepewny wynik wcześniejszego zapisu (wymaga confirmPendingWriteDidNotHappen)'
};

export const NON_OVERRIDABLE_GUARDS = {
  speediance_api_rejected: 'To odpowiedź serwera Speediance, GM Coach nie może jej obejść. Sprawdź komunikat API, popraw dane albo spróbuj później.',
  account_not_connected: 'Brak zalogowanego konta. Połącz konto przez speediance_connect_account i powtórz.',
  account_binding_mismatch: 'Dane dotyczą innego konta lub konto zmieniło się w trakcie. Wybierz właściwy profil, odśwież podgląd i powtórz.',
  catalog_id_unknown: 'Takiego ID ćwiczenia, wariantu lub akcesorium nie ma w katalogu Speediance. Wyszukaj ćwiczenie przez speediance_search_exercises i użyj istniejącego ID.',
  saved_plan_mismatch: 'Plan podglądu planowania różni się od zapisanego szablonu. Przepisz plan dokładnie z speediance_get_saved_program (pola różnic podane w komunikacie) albo użyj podglądu edycji.',
  science_decision_mismatch: 'Decyzja naukowa nie pasuje do aktualnego planu. Wywołaj ponownie gm_coach_derive_evidence_bindings dla aktualnego planu i skopiuj value/target (oraz reviewedValue) bez zmian, potem powtórz podgląd.',
  preference_review_loop: 'Ten sam zakres preferencji (scopeDigest) wrócił bez ocen. Skopiuj preferenceReviewsExample z pola guard do preferenceReviews, wpisz własne rationale; dla userAnswerRequired najpierw zapytaj użytkownika. Nie powtarzaj wywołania bez preferenceReviews.',
  plan_input_invalid: 'Dane wejściowe planu są niepoprawne. Popraw dokładnie pole wskazane w komunikacie (zwykle z przykładem) i powtórz to samo wywołanie; jeśli poprawka jest jednoznaczna, nie pytaj użytkownika.',
  preview_expired: 'Zgoda na podgląd jest ważna 30 min (approvalExpiresAt). Odnów podgląd tego samego planu i pokaż go ponownie; nie zmieniaj dawek. Potem uzyskaj zgodę użytkownika i zapisz z nowym previewId.'
};

export const PENDING_WRITE_HINT = 'Najpierw uruchom gm_coach_reconcile_pending_program_write albo sprawdź aplikację Speediance. Jeśli wcześniejszy zapis na pewno się nie odbył, podaj userOverride z kodem pending_write_unknown i polem confirmPendingWriteDidNotHappen (słowa użytkownika).';

export const userOverrideSchema = {
  type: 'object', additionalProperties: false, required: ['authorized', 'reason', 'codes'],
  description: 'Użytkownik ma ostatnie słowo: podaj tylko po jego wyraźnym poleceniu zignorowania blokady. codes = kody blokad z komunikatu albo ["*"]. Plan zostaje oznaczony userOverridden:true i scientificApproval:false.',
  properties: {
    authorized: { type: 'boolean', const: true },
    reason: { type: 'string', minLength: 1, maxLength: 500, description: 'Słowa użytkownika.' },
    codes: { type: 'array', minItems: 1, maxItems: 40, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 60 } },
    confirmPendingWriteDidNotHappen: { type: 'string', minLength: 10, maxLength: 500, description: 'Tylko dla pending_write_unknown: słowa użytkownika potwierdzające, że wcześniejszy zapis się nie odbył.' }
  }
};

export class GuardBlockedError extends Error {
  constructor(code, message) { super(message); this.guardCode = code; }
}

export function parseUserOverride(value) {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('userOverride musi być obiektem.');
  for (const key of Object.keys(value)) if (!Object.hasOwn(userOverrideSchema.properties, key)) throw new Error('userOverride: nieznane pole ' + key + '.');
  if (value.authorized !== true) throw new Error('userOverride wymaga authorized=true.');
  const reason = typeof value.reason === 'string' ? value.reason.trim() : '';
  if (!reason || reason.length > 500) throw new Error('userOverride.reason: 1–500 znaków, słowami użytkownika.');
  if (!Array.isArray(value.codes) || !value.codes.length || value.codes.length > 40 || value.codes.some(code => typeof code !== 'string' || !code.trim())) throw new Error('userOverride.codes: lista kodów blokad albo ["*"].');
  const confirm = value.confirmPendingWriteDidNotHappen;
  if (confirm !== undefined && (typeof confirm !== 'string' || confirm.trim().length < 10 || confirm.length > 500)) throw new Error('userOverride.confirmPendingWriteDidNotHappen: 10–500 znaków.');
  return { reason, codes: new Set(value.codes.map(code => code.trim())), confirmPendingWriteDidNotHappen: confirm?.trim() };
}

export const userOverrideContext = new AsyncLocalStorage();

export function overrideAuthorizes(code) {
  const state = userOverrideContext.getStore();
  if (!state?.override || !Object.hasOwn(OVERRIDABLE_GUARDS, code)) return false;
  const { codes, confirmPendingWriteDidNotHappen } = state.override;
  if (code === 'pending_write_unknown') return codes.has(code) && Boolean(confirmPendingWriteDidNotHappen);
  return codes.has('*') || codes.has(code);
}

export function recordOverride(code, message) {
  const state = userOverrideContext.getStore();
  if (!state.overridden.some(row => row.code === code)) state.overridden.push({ code, reason: state.override.reason, blockedMessage: String(message).slice(0, 600), ...(code === 'pending_write_unknown' ? { userConfirmation: state.override.confirmPendingWriteDidNotHappen } : {}) });
}

// Throws a coded block, or records a warning and returns false when the user overrode it.
export function guardBlock(code, message, guardDetails) {
  if (overrideAuthorizes(code)) { recordOverride(code, message); return false; }
  throw Object.assign(new GuardBlockedError(code, message), guardDetails ? { guardDetails } : {});
}

// Runs a strict assertion; an authorized override turns its failure into a warning.
export function softGuard(code, run, fallback = undefined) {
  try { return run(); }
  catch (error) {
    if (error instanceof GuardBlockedError) throw error;
    guardBlock(code, error instanceof Error ? error.message : String(error), error?.guardDetails);
    return fallback;
  }
}

const SCIENCE_PATTERN = /bramk[ia] naukow|evidence|decisionEvidence|PubMed|badani|naukow|excerpt|cytat|źródł/i;
export function classifyGuardError(error) {
  if (error?.guardCode) return error.guardCode;
  // Odrzucone zapytanie PubMed to błąd danych wejściowych wyszukiwania, nie niedokończona bramka naukowa.
  if (error?.code === 'INVALID_QUERY') return null;
  const message = error instanceof Error ? error.message : String(error ?? '');
  // Wygasły podgląd: odnowienie tego samego planu, bez obchodzenia. Kalendarz po utworzeniu programu ma osobną ścieżkę.
  if (/Podgląd(?: \p{L}+)? wygasł/u.test(message) && !/przed dodaniem do kalendarza/u.test(message)) return 'preview_expired';
  if (/wartość nie odpowiada znormalizowanej wartości/.test(message)) return 'science_decision_mismatch';
  if (/API Speediance|Speediance API|połączyć z API/i.test(message)) return 'speediance_api_rejected';
  if (/Najpierw połącz konto|nie jest połączon|Brak zapisanego konta|No connected account/i.test(message)) return 'account_not_connected';
  if (/account changed|belongs to another profile|innego profilu|innego konta|konto zmieniło|Konto zmieniło/i.test(message)) return 'account_binding_mismatch';
  if (/Unique catalogue group required|Exact unique API variant|nie istnieje w katalogu|not found in (the )?catalog|Nieznane ID/i.test(message)) return 'catalog_id_unknown';
  if (/niepewny status zapisu|nierozstrzygnięty stary zapis|blokuje duplikat/i.test(message)) return 'pending_write_unknown';
  if (/fragment musi zawierać|unikalnych cytowanych słów|Brak oceny naukowej/u.test(message)) return 'science_gate';
  if (/podany tytuł nie pasuje/u.test(message)) return 'catalog_title_mismatch';
  if (SCIENCE_PATTERN.test(message)) return 'science_gate';
  // 687: kontrole danych planu z audytu logu 686 (loadType, preset, RIR, superserie, rozgrzewka, harmonogram) dostają kod.
  if (/\[GM_COACH_[A-Z_]+\]/.test(message) || /^GM_COACH_/.test(String(error?.cause?.code ?? error?.code ?? ''))) return null;
  if (/seria wymaga wartości zgodnej z loadType|Preset .+ obsługuje|\bRIR\b|superseri|rozgrzewk|harmonogram|^Ćwiczenie \d+|Napraw:/iu.test(message)) return 'plan_input_invalid';
  return null;
}

export function describeGuard(code, { overrideGiven = false } = {}) {
  if (!code) return '\n[GM Coach] Ta kontrola nie ma jeszcze kodu blokady. Popraw wskazane dane wejściowe albo opisz ją użytkownikowi; nie odmawiaj bez wyjaśnienia.';
  if (Object.hasOwn(NON_OVERRIDABLE_GUARDS, code)) return '\n[GM Coach blokada] kod: ' + code + ' (nie do pominięcia). Co możesz zrobić: ' + NON_OVERRIDABLE_GUARDS[code];
  if (code === 'pending_write_unknown') return '\n[GM Coach blokada] kod: pending_write_unknown. ' + PENDING_WRITE_HINT + ' Możesz to pominąć: powiedz, że świadomie ignorujesz tę blokadę (kod pending_write_unknown).';
  if (code === 'science_gate') return '\n[GM Coach blokada] kod: science_gate. Najpierw dokończ kontrolę naukową: wystarczy jedna decyzja na kategorię (gm_coach_derive_evidence_bindings podaje kategorie), a mapowania wszystkich serii i wartości planu (np. recovery_context) serwer uzupełnia sam. Nie przypisuj badań do każdej serii i nie proponuj pominięcia bramki. Pominięcie (scienceGate=user_declined lub userOverride science_gate) tylko wtedy, gdy użytkownik sam wyraźnie o to poprosi.' + (overrideGiven ? ' Podany userOverride nie obejmuje tego kodu.' : '');
  return '\n[GM Coach blokada] kod: ' + code + '. Możesz to pominąć: powiedz, że świadomie ignorujesz tę blokadę (kod ' + code + ').' + (overrideGiven ? ' Podany userOverride nie obejmuje tego kodu.' : '');
}

export function guardErrorPayload(code) {
  return { code, overridable: Boolean(code) && Object.hasOwn(OVERRIDABLE_GUARDS, code) };
}

export function annotateOverriddenResult(value, overridden) {
  if (!overridden.length) return value;
  const marker = { overriddenGuards: overridden, userOverridden: true, scientificApproval: false, userOverrideNote: 'Użytkownik świadomie pominął blokady GM Coach. Pominięte kontrole nie zostały spełnione ani zweryfikowane.' };
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...value, ...marker };
  if (typeof value === 'string') return value + '\n' + JSON.stringify(marker);
  return { result: value, ...marker };
}
