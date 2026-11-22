# GM Coach — instrukcja wszystkich narzędzi MCP

Przed pierwszym wywołaniem nieznanego narzędzia przeczytaj jego sekcję. Kolejność odpowiada przepływowi pracy: diagnostyka/konto → profil/historia → katalog → badania → podgląd → zapis/edycja/kalendarz → cykle → import/eksport. Linie „Wymagane” są sprawdzane testem tests/tools-reference.test.mjs względem schematów w mcp_server.mjs. Łącznie narzędzi: 92.

## Zasady wspólne

- profile: techniczny klucz profilu z speediance_list_accounts (np. "default"). Pomijaj go tylko w narzędziach bez tego pola.
- Schematy mają zwykle additionalProperties=false: nie dodawaj pól spoza listy (np. template_codes zamiast program_codes).
- Zgody: consent_to_read_history / consent_to_read_speediance / consent_to_read_health / consent_to_read_activities ustawiaj na true dopiero po zgodzie użytkownika na dany odczyt. confirm=true w narzędziach zapisu dopiero po pokazaniu dokładnego wyniku podglądu i wyraźnej zgodzie.
- Identyfikatory: draftId/challengeId/previewId/edit_preview_id/schedule_preview_id mają 48 znaków; base_digest i presentationDigest 64 znaki hex — zawsze kopiuj je ze świeżego wyniku, nie przepisuj ze starej rozmowy.
- Blokada GM Coach zwraca kod i podpowiedź; userOverride (kod albo ["*"]) przekazuj wyłącznie po wyraźnym poleceniu użytkownika.
- Daty: YYYY-MM-DD; miesiąc: YYYY-MM.
- decisionEvidence.target: dokładnie plan | exercise:<entryId> | set:<entryId>:<numer serii> | warmup:<n> | stretch:<n> (np. set:1001:2). Nie używaj stretching:N ani warmups:N. value kopiuj z gm_coach_derive_evidence_bindings.
- evidence: id e1–e12, researchSourceId pubmed:<PMID> z gm_coach_search_training_research (maxResultsPerQuery ≤ 5, do 16 zapytań).
- Szablony: program_codes 1–4 w gm_coach_get_saved_plan_baselines, 0–4 w gm_coach_prepare_plan_inputs.
- W przykładach "<48 hex>", "<64 hex>", "..." i {...} oznaczają wartości skopiowane z wcześniejszego wyniku; nie wysyłaj ich dosłownie.

## Reguły Customize z historii (gm_coach_suggest_load, load_method=history-channel-total)

- Przekaż serie robocze (bez rozgrzewek) z kanałami L/R z autoryzowanego odczytu historii w channel_history, a w channel_target sprzęt docelowego ćwiczenia (equipment wymagane).
- Sztanga i dwa uchwyty (barbell / dual-handle): Customize = ŁĄCZNY ciężar obu linek, kotwica = lewy + prawy kanał (np. 11,5 + 11,5 = 23 kg).
- Ćwiczenie jednostronne z jawną stroną (side 1 = lewa, 2 = prawa): ciężar tej strony. Jeden kabel (single-cable): wartość tego kanału.
- Brak historii dokładnego wariantu: serwer bierze najbliższy analog z tej samej grupy/wzorca ruchu (movement_pattern) i oznacza wynik jako przybliżenie z nazwą źródła — pokaż to użytkownikowi z niższą pewnością.
- Deload: deload=true i deload_load_fraction (0,4 < x ≤ 1). Kotwica jest przeliczana Epleyem do set_reps i mnożona przez ten ułamek; zaokrąglenie 0,5 kg. Wartość ułamka uzasadnij w bramce naukowej (kategoria recovery_deload lub intensity_load, z oceną źródeł) i podaj jawnie; serwerowe 0,85 to tylko techniczna wartość awaryjna.
- needsInput (brak historii i analogu) = zapytaj użytkownika o ciężar, nie zgaduj. Pokaż ciężary z pochodzeniem w tabeli planu; zapis dopiero po zgodzie.

## 1. Diagnostyka i konto

### gm_coach_get_local_diagnostics

- **Do czego / kiedy:** Sprawdź wersję załadowanego MCP i czy potrzebny jest restart (restartRequired). Pierwsze narzędzie przy dziwnych błędach lub po aktualizacji.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** brak
- **Minimalny przykład:**

```json
{}
```

- **Typowe błędy:** Brak argumentów — nie dodawaj profile (additionalProperties=false).
- **Następny krok:** Gdy restartRequired=true poproś o restart Codex; inaczej speediance_list_accounts.

### speediance_list_accounts

- **Do czego / kiedy:** Lista lokalnych profili (klucz profile, displayName) i serverDiagnostics. Użyj na start, aby poznać wartość profile.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** brak
- **Minimalny przykład:**

```json
{}
```

- **Typowe błędy:** Nie podawaj argumentów.
- **Następny krok:** speediance_check_connection z wybranym profile; brak profilu → speediance_setup_info.

### speediance_setup_info

- **Do czego / kiedy:** Utwórz profil i jednorazowy link do lokalnego formularza logowania. Hasła nigdy nie przyjmuj w czacie.
- **Dostęp i zgoda:** zapis lokalny na tym komputerze (nie konto) — po jawnej zgodzie użytkownika
- **Wymagane:** brak
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| display_name | string | nie | min. znaków 1; maks. znaków 64 |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"display_name":"Jan"}
```

- **Typowe błędy:** display_name 1–64 znaki. Nie wklejaj e-maila/hasła do argumentów.
- **Następny krok:** Po wypełnieniu formularza przez użytkownika: speediance_connect_account.

### speediance_connect_account

- **Do czego / kiedy:** Zaloguj skonfigurowany profil (region Auto sprawdza EU i Global).
- **Dostęp i zgoda:** logowanie do konta (sieć), zapisuje lokalny token; po zgodzie użytkownika na połączenie
- **Wymagane:** brak
- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default"}
```

- **Typowe błędy:** Odrzucony login → popraw dane w formularzu (speediance_setup_info), nie zgaduj.
- **Następny krok:** speediance_check_connection.

### speediance_check_connection

- **Do czego / kiedy:** Test uwierzytelnionego odczytu API i porównanie wersji MCP.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony
- **Wymagane:** brak
- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default"}
```

- **Typowe błędy:** Błąd tokenu → speediance_connect_account. Wynik nie testuje historii.
- **Następny krok:** gm_coach_get_training_profile / gm_coach_prepare_plan_inputs.

### speediance_set_profile_name

- **Do czego / kiedy:** Zmień lokalną etykietę profilu GM Coach (nie konto Speediance).
- **Dostęp i zgoda:** zapis lokalny na tym komputerze (nie konto) — po jawnej zgodzie użytkownika
- **Wymagane:** `profile`, `display_name`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| display_name | string | tak | min. znaków 1; maks. znaków 64 |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","display_name":"Jan – GM"}
```

- **Typowe błędy:** Wymaga profile i display_name (1–64).
- **Następny krok:** speediance_list_accounts.

### speediance_remove_account

- **Do czego / kiedy:** Usuń lokalny profil i token (nie unieważnia tokenu na serwerze).
- **Dostęp i zgoda:** usuwa dane lokalne — tylko na wyraźną prośbę użytkownika
- **Wymagane:** `profile`, `confirm`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| confirm | boolean | tak | — |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","confirm":true}
```

- **Typowe błędy:** Blokada przy niepewnym zapisie programu → najpierw rozlicz go (gm_coach_reconcile_pending_program_write).
- **Następny krok:** speediance_list_accounts.

## 2. Profil, pamięć i wywiad

### gm_coach_get_training_profile

- **Do czego / kiedy:** Odczyt lokalnego profilu trenerskiego (cele, poziom, preferencje).
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** brak
- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default"}
```

- **Typowe błędy:** Pusty profil → przeprowadź wywiad i gm_coach_audit_training_interview.
- **Następny krok:** gm_coach_audit_training_interview.

### gm_coach_save_training_profile

- **Do czego / kiedy:** Zapisz/uzupełnij profil trenerski; clear_fields usuwa nieaktualne pola.
- **Dostęp i zgoda:** zapis lokalny na tym komputerze (nie konto) — po jawnej zgodzie użytkownika; przy pierwszym zapisie pokaż zakres danych
- **Wymagane:** `consent_confirmed`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| consent_confirmed | boolean | tak | stała true |

- **Inne pola:** profile, profile_data, clear_fields
- **Minimalny przykład:**

```json
{"profile":"default","profile_data":{"goal":"hipertrofia"},"consent_confirmed":true}
```

- **Typowe błędy:** consent_confirmed musi być true. Klucze profile_data zgodne ze schematem (additionalProperties).
- **Następny krok:** gm_coach_get_training_profile.

### gm_coach_delete_training_profile

- **Do czego / kiedy:** Usuń zapisany profil trenerski.
- **Dostęp i zgoda:** zapis lokalny na tym komputerze (nie konto) — po jawnej zgodzie użytkownika — tylko na wyraźną prośbę
- **Wymagane:** `confirm`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| confirm | boolean | tak | stała true |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","confirm":true}
```

- **Typowe błędy:** confirm=true.
- **Następny krok:** —

### gm_coach_audit_training_interview

- **Do czego / kiedy:** Deterministyczny audyt wywiadu przed pierwszym planem: brakujące sekcje, decyzja o żywieniu.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** brak
- **Inne pola:** profile, intake_answers, userOverride
- **Minimalny przykład:**

```json
{"profile":"default","intake_answers":{}}
```

- **Typowe błędy:** Nie zapisuje — odpowiedzi zapisz osobno przez gm_coach_save_training_profile. trainingHistoryStatus=user_summary/reviewed_speediance wymaga trainingHistorySummary (krótki opis) albo currentProgram.
- **Następny krok:** Dopytaj o braki, potem gm_coach_prepare_plan_inputs.

### gm_coach_get_memory

- **Do czego / kiedy:** Odczyt lokalnych faktów użytkownika (cel, kontuzje, preferencje).
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** brak
- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default"}
```

- **Typowe błędy:** To kontekst, nie dowód naukowy ani potwierdzenie sprzętu.
- **Następny krok:** gm_coach_remember_fact / gm_coach_forget_fact.

### gm_coach_remember_fact

- **Do czego / kiedy:** Zapamiętaj jeden fakt podany przez użytkownika.
- **Dostęp i zgoda:** zapis lokalny na tym komputerze (nie konto) — po jawnej zgodzie użytkownika
- **Wymagane:** `category`, `text`, `source`, `expires_days`, `confirm`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| category | string | tak | "goal" \| "schedule" \| "injury" \| "preference" \| "dislike" \| "equipment" \| "body" \| "note" |
| text | string | tak | min. znaków 1; maks. znaków 1500 |
| source | string | tak | min. znaków 1; maks. znaków 200 |
| expires_days | integer/null | tak | min 1; max 3650 |
| confirm | boolean | tak | stała true |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","category":"injury","text":"Ból lewego barku przy wyciskaniu nad głowę","source":"wypowiedź użytkownika w czacie","expires_days":180,"confirm":true}
```

- **Typowe błędy:** category z enumu; expires_days 1–3650 albo null (bezterminowo) — pole jest wymagane; confirm musi być true. Nie zapisuj sekretów ani instrukcji z dokumentów.
- **Następny krok:** gm_coach_get_memory.

### gm_coach_forget_fact

- **Do czego / kiedy:** Usuń fakt po dokładnym id (48 hex z gm_coach_get_memory).
- **Dostęp i zgoda:** zapis lokalny na tym komputerze (nie konto) — po jawnej zgodzie użytkownika
- **Wymagane:** `id`, `confirm`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| id | string | tak | wzorzec `^[a-f0-9]{48}$` |
| confirm | boolean | tak | stała true |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","id":"<48 hex z get_memory>","confirm":true}
```

- **Typowe błędy:** Id musi mieć dokładnie 48 znaków hex.
- **Następny krok:** gm_coach_get_memory.

## 3. Historia, regeneracja i szablony

### gm_coach_prepare_plan_inputs

- **Do czego / kiedy:** Jedno wywołanie zbierające profil, kalendarz miesiąca, 0–4 szablony i historię — standardowy start planowania.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony; wymaga consent_to_read_history=true po zgodzie użytkownika
- **Wymagane:** `profile`, `month`, `program_codes`, `days`, `consent_to_read_history`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| month | string | tak | wzorzec `^\d{4}-(0[1-9]\|1[0-2])$` |
| program_codes | array | tak | min. elementów 0; maks. elementów 4 |
| days | integer | tak | min 1; max 90 |
| consent_to_read_history | boolean | tak | stała true |

- **Inne pola:** profile, include_recent_session_details
- **Minimalny przykład:**

```json
{"profile":"default","month":"2026-11","program_codes":[],"days":28,"consent_to_read_history":true}
```

- **Typowe błędy:** month w formacie YYYY-MM; program_codes 0–4 (może być []); days 1–90; profile wymagany.
- **Następny krok:** gm_coach_get_completed_session_details dla kluczy completedSessionDetailKeys albo gm_coach_find_exercise_candidates.

### gm_coach_get_athlete_snapshot

- **Do czego / kiedy:** Zbiorczy obraz: historia, cele, samoocena regeneracji, opcjonalnie raporty zdrowia i importowane aktywności.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony; consent_to_read_history=true; zdrowie/aktywności osobne zgody
- **Wymagane:** `consent_to_read_history`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| consent_to_read_activities | boolean | nie | stała true |
| consent_to_read_health | boolean | nie | stała true |
| health_date | string | nie | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| health_start_date | string | nie | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| health_end_date | string | nie | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| days | integer | nie | min 1; max 365 |
| consent_to_read_history | boolean | tak | stała true |

- **Inne pola:** profile, include_reported_health, include_imported_activities
- **Minimalny przykład:**

```json
{"profile":"default","days":28,"consent_to_read_history":true}
```

- **Typowe błędy:** include_imported_activities wymaga consent_to_read_activities=true i days≤31; include_reported_health wymaga consent_to_read_health=true.
- **Następny krok:** gm_coach_resolve_recovery_context.

### speediance_list_workouts

- **Do czego / kiedy:** Podsumowania historii: osobno mobileSessions i calendarCompletedSessions.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony
- **Wymagane:** brak
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| days | integer | nie | min 1; max 3650 |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","days":30}
```

- **Typowe błędy:** Nie łącz kolekcji po ID/nazwie/dacie i nie sumuj ich.
- **Następny krok:** speediance_get_session_detail dla wybranej sesji.

### speediance_get_today

- **Do czego / kiedy:** Sesje wykonane dziś/wczoraj/w danym dniu (nie rezerwacje).
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony
- **Wymagane:** brak
- **Inne pola:** profile, date
- **Minimalny przykład:**

```json
{"profile":"default","date":"2026-11-11"}
```

- **Typowe błędy:** date YYYY-MM-DD.
- **Następny krok:** speediance_get_session_detail.

### speediance_get_training_calendar

- **Do czego / kiedy:** Wpisy kalendarza w miesiącu — sprawdź zajęte dni przed planowaniem.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony
- **Wymagane:** `month`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| month | string | tak | wzorzec `^\d{4}-(0[1-9]\|1[0-2])$` |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","month":"2026-11"}
```

- **Typowe błędy:** month YYYY-MM.
- **Następny krok:** speediance_preview_saved_program_schedule.

### speediance_get_period_statistics

- **Do czego / kiedy:** Raportowane statystyki konta za okres (semantyka niepotwierdzona).
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony; consent_to_read_speediance=true
- **Wymagane:** `start_date`, `end_date`, `consent_to_read_speediance`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| start_date | string | tak | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| end_date | string | tak | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| consent_to_read_speediance | boolean | tak | stała true |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","start_date":"2026-10-01","end_date":"2026-10-31","consent_to_read_speediance":true}
```

- **Typowe błędy:** Nie traktuj jako tonażu/regeneracji.
- **Następny krok:** —

### speediance_get_reported_session_summary

- **Do czego / kiedy:** Raportowane podsumowanie (czas, kalorie) jednego training_id.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony; consent_to_read_speediance=true
- **Wymagane:** `training_id`, `consent_to_read_speediance`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| training_id | integer | tak | min 1 |
| consent_to_read_speediance | boolean | tak | stała true |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","training_id":"123456","consent_to_read_speediance":true}
```

- **Typowe błędy:** Nie zastępuje szczegółów serii.
- **Następny krok:** speediance_get_session_detail.

### speediance_get_session_detail

- **Do czego / kiedy:** Szczegóły ukończonej sesji (serie, ciężary; opcjonalnie tętno/wiosłowanie).
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony; tętno wymaga consent_to_read_health=true
- **Wymagane:** `training_id`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| training_id | string | tak | min. znaków 1; maks. znaków 128 |
| output_view | string | nie | "full" \| "planning" |
| date | string | nie | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| type | string | nie | "program" \| "free" \| "course" \| "ai" |

- **Inne pola:** profile, include_rowing_telemetry, include_heart_rate, consent_to_read_health
- **Minimalny przykład:**

```json
{"profile":"default","training_id":"123456","type":"program","output_view":"planning"}
```

- **Typowe błędy:** type=course/ai wymaga trainingId z kalendarza, nie id mobilnego.
- **Następny krok:** gm_coach_compare_completed_sessions / gm_coach_suggest_load.

### gm_coach_get_completed_session_details

- **Do czego / kiedy:** Szczegóły 1–4 sesji z completedSessionDetailKeys w jednej paczce.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony; consent_to_read_history=true
- **Wymagane:** `sessions`, `consent_to_read_history`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| sessions | array | tak | min. elementów 1; maks. elementów 4 |
| consent_to_read_history | boolean | tak | stała true |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","sessions":[{"training_id":"123456","type":"program","date":"2026-11-05"}],"consent_to_read_history":true}
```

- **Typowe błędy:** Każda pozycja wymaga training_id (cyfry), type i date; maks. 4.
- **Następny krok:** gm_coach_suggest_load z kanałami L/R.

### gm_coach_compare_completed_sessions

- **Do czego / kiedy:** Porównaj serie jednego wariantu w dwóch ukończonych sesjach.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony; consent_to_read_history=true
- **Wymagane:** `session_a`, `session_b`, `group_id`, `action_library_id`, `consent_to_read_history`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| group_id | integer | tak | min 1 |
| action_library_id | integer | tak | min 1 |
| session_a | object | tak | — |
| session_b | object | tak | — |
| consent_to_read_history | boolean | tak | stała true |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","group_id":11,"action_library_id":101,"session_a":{"namespace":"mobile","id":"1","date":"2026-10-01"},"session_b":{"namespace":"mobile","id":"2","date":"2026-11-01"},"consent_to_read_history":true}
```

- **Typowe błędy:** Sesje wymagają namespace, id i date; group_id/action_library_id z katalogu. Sprawdź schemat session_a.
- **Następny krok:** —

### gm_coach_get_exercise_history

- **Do czego / kiedy:** Historia jednego ruchu; include_sessions=true daje rzeczywiste serie.
- **To jest odczyt historii wykonania:** statystyki i (include_sessions=true) szczegóły ukończonych sesji; wymaga wyraźnej zgody użytkownika na odczyt historii (consent_to_read_history=true). Po użyciu nie twierdź, że historia nie była czytana.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony; consent_to_read_history=true
- **Wymagane:** `consent_to_read_history`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| exercise_id | integer | nie | min 1 |
| exercise | string | nie | min. znaków 1; maks. znaków 120 |
| limit | integer | nie | min 1; max 100 |
| page_size | integer | nie | min 1; max 50 |
| max_pages | integer | nie | min 1; max 20 |
| session_days | integer | nie | min 1; max 365 |
| session_limit | integer | nie | min 1; max 30 |
| consent_to_read_history | boolean | tak | stała true |

- **Inne pola:** profile, include_sessions
- **Minimalny przykład:**

```json
{"profile":"default","exercise_id":11,"include_sessions":true,"session_days":90,"consent_to_read_history":true}
```

- **Typowe błędy:** Podaj exercise_id lub exercise. Statystyki mogą być tygodniowe — to nie daty sesji.
- **Następny krok:** gm_coach_suggest_load load_method=history-channel-total.

### gm_coach_get_strength_profile

- **Do czego / kiedy:** Profil siły jak w kliencie referencyjnym: kotwice 1RM/e1RM, limity, jednostka konta.
- **Dostęp i zgoda:** odczyt lokalny; z refresh_speediance_data=true czyta konto (consent_to_read_speediance=true)
- **Wymagane:** brak
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| exercise_ids | array | nie | min. elementów 1; maks. elementów 30 |
| confirmed_display_unit | string | nie | "kg" \| "lb" |

- **Inne pola:** profile, refresh_speediance_data, consent_to_read_speediance
- **Minimalny przykład:**

```json
{"profile":"default","exercise_ids":[11]}
```

- **Typowe błędy:** Brak jednostki z API → zapytaj o kg/lb i podaj confirmed_display_unit.
- **Następny krok:** gm_coach_suggest_load.

### gm_coach_resolve_recovery_context

- **Do czego / kiedy:** Zamień deklarację regeneracji na dokładny binding recovery_context dla podglądu.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `recoveryContext`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| recoveryContext | object | tak | — |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","recoveryContext":{"status":"declared"}}
```

- **Typowe błędy:** Kształt recoveryContext według schematu; zadeklarowane raporty wymagają niewygasłego odczytu.
- **Następny krok:** Do planu skopiuj recoveryContext, do powiązań resolvedRecoveryContext.

### gm_coach_get_reported_health

- **Do czego / kiedy:** Raporty zdrowia Speediance (zmęczenie, sen, obciążenie...).
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony; consent_to_read_health=true
- **Wymagane:** `consent_to_read_health`, `feed`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| context_limitations | array | nie | min. elementów 1; maks. elementów 10 |
| consent_to_read_health | boolean | tak | stała true |
| feed | string | tak | "all" \| "fatigue" \| "training_load" \| "strength_score" \| "recovery" \| "sleep" \| "body_measurements" \| "physical_condition" \| "health_cards" \| "heart_rate_zones" |
| date | string | nie | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| start_date | string | nie | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| end_date | string | nie | wzorzec `^\d{4}-\d{2}-\d{2}$` |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","feed":"fatigue","consent_to_read_health":true}
```

- **Typowe błędy:** feed=all wymaga date albo start_date/end_date.
- **Następny krok:** gm_coach_resolve_recovery_context.

### speediance_list_saved_programs

- **Do czego / kiedy:** Lista szablonów konta i sloty.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony
- **Wymagane:** brak
- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default"}
```

- **Typowe błędy:** Limit slotów jest nieznany (quotaStatus=unknown).
- **Następny krok:** speediance_get_saved_program.

### speediance_get_saved_program

- **Do czego / kiedy:** Dokładny odczyt szablonu z digestem (base_digest do edycji/kalendarza).
- **Przepisanie do planu podglądu (1.0.680):** każda seria L/P ma `planFields` (`side` 1/2 i `exerciseUnilateralPrescription: "explicit-sides"`) — przepisz `side` do serii i `unilateralPrescription` do ćwiczenia; seria bez `planFields` jest obustronna (bez `side`). RIR nie jest zapisany w szablonie.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony
- **Wymagane:** `program_code`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| output_scope | string | nie | "exact-program-with-preset-metadata" |
| metadata_offset | integer | nie | min 0; max 10000 |
| metadata_group_limit | integer | nie | min 1; max 8 |
| expected_program_digest | string | nie | wzorzec `^[a-f0-9]{64}$` |
| expected_account_scope | string | nie | wzorzec `^[a-f0-9]{64}$` |
| program_code | string | tak | min. znaków 1; maks. znaków 128; wzorzec `^[A-Za-z0-9._-]+$` |
| output_view | string | nie | "full" \| "presentation" |
| unit_confirmations | array | nie | min. elementów 1; maks. elementów 100 |
| load_diagnostics_offset | integer | nie | min 0; max 10000 |
| load_diagnostics_limit | integer | nie | min 1; max 8 |
| confirmed_weight_unit | string | nie | "kg" \| "lb" |

- **Inne pola:** profile, include_action_library_list, include_coach_review, include_response_header_diagnostics, include_load_diagnostics
- **Minimalny przykład:**

```json
{"profile":"default","program_code":"ABC123","output_view":"presentation"}
```

- **Typowe błędy:** program_code [A-Za-z0-9._-] 1–128. Edycji nie rób tutaj — idź do preview_saved_program_update.
- **Następny krok:** speediance_preview_saved_program_update albo speediance_preview_saved_program_schedule.

### gm_coach_get_saved_plan_baselines

- **Do czego / kiedy:** Zwięzły rejestr ćwiczeń i serii 1–4 szablonów.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony
- **Wymagane:** `program_codes`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| program_codes | array | tak | min. elementów 1; maks. elementów 4 |
| output_view | string | nie | "full" \| "identity" |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","program_codes":["ABC123"]}
```

- **Typowe błędy:** Argument to program_codes (1–4); template_codes/codes nie działa.
- **Następny krok:** Plan edycji.

## 4. Katalog, sprzęt i obciążenia

### speediance_read_exercise_catalog

- **Do czego / kiedy:** Odczyt katalogu ćwiczeń (kategorie i grupy).
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony; consent_to_read_speediance=true
- **Wymagane:** `consent_to_read_speediance`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| consent_to_read_speediance | boolean | tak | stała true |
| group_ids | array | nie | min. elementów 1; maks. elementów 50 |
| return_limit | integer | nie | min 1; max 200 |
| offset | integer | nie | min 0 |

- **Inne pola:** profile, refresh
- **Minimalny przykład:**

```json
{"profile":"default","consent_to_read_speediance":true,"return_limit":50}
```

- **Typowe błędy:** group_ids maks. 50; return_limit 1–200.
- **Następny krok:** gm_coach_find_exercise_candidates.

### gm_coach_find_exercise_candidates

- **Do czego / kiedy:** Kandydaci ćwiczeń do części głównej/rozgrzewki/rozciągania w jednym odczycie.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony
- **Wymagane:** `requests`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| perRequestLimit | integer | nie | min 1; max 20 |
| requests | array | tak | min. elementów 1; maks. elementów 32 |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","requests":[{"section":"main","terms":"chest press"},{"section":"stretching","terms":"chest stretch"}]}
```

- **Typowe błędy:** Każde request wymaga terms (≥2 znaki) albo groupId; requests 1–32; perRequestLimit 1–20.
- **Następny krok:** speediance_get_exercise_presets dla wybranych.

### speediance_search_exercises

- **Do czego / kiedy:** Wyszukiwanie w katalogu z akcesoriami i mainMuscleGroupName.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony
- **Wymagane:** brak
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| query | string | nie | maks. znaków 120 |
| main_muscle_label | string | nie | min. znaków 1; maks. znaków 120 |
| required_accessory_id | integer | nie | min 1 |
| limit | integer | nie | min 1; max 200 |
| offset | integer | nie | min 0 |

- **Inne pola:** profile, owned_only
- **Minimalny przykład:**

```json
{"profile":"default","query":"squat","limit":20}
```

- **Typowe błędy:** query ≤120 znaków; limit 1–200.
- **Następny krok:** speediance_get_exercise_presets.

### speediance_get_owned_equipment

- **Do czego / kiedy:** Inwentarz akcesoriów (jeśli API go udostępnia).
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony
- **Wymagane:** brak
- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default"}
```

- **Typowe błędy:** ownershipKnown=false → zapytaj użytkownika, nie zgaduj.
- **Następny krok:** gm_coach_preflight_selected_accessories.

### speediance_get_exercise_presets

- **Do czego / kiedy:** Warianty (actionLibraryId) i presety ćwiczenia; Smart RM Gain Muscle=1, Stamina=3, Strength=5.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony
- **Wymagane:** `exercise_id`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| exercise_id | integer | tak | min 1 |
| action_library_id | integer | nie | min 1 |
| quickTestSession | boolean | nie | stała true |
| output_scope | string | nie | "group-api-only" |

- **Inne pola:** profile, include_saved_observations, customize_ui_preview
- **Minimalny przykład:**

```json
{"profile":"default","exercise_id":11}
```

- **Typowe błędy:** Gdy jest kilka wariantów, wybierz actionLibraryId jawnie.
- **Następny krok:** gm_coach_preflight_selected_accessories / gm_coach_suggest_load.

### speediance_get_exercise_statistics

- **Do czego / kiedy:** Własne statystyki ćwiczenia (userActionStatPage).
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony
- **Wymagane:** `exercise_id`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| exercise_id | integer | tak | min 1 |
| page | integer | nie | min 1; max 1000 |
| page_size | integer | nie | min 1; max 50 |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","exercise_id":11}
```

- **Typowe błędy:** page_size 1–50; schemat nieoficjalny.
- **Następny krok:** gm_coach_get_exercise_history.

### gm_coach_preflight_selected_accessories

- **Do czego / kiedy:** Szybka kontrola kompletności metadanych akcesoriów dla wybranych wariantów.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony
- **Wymagane:** `variants`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| variants | array | tak | min. elementów 1; maks. elementów 364 |

- **Inne pola:** profile, userOverride
- **Minimalny przykład:**

```json
{"profile":"default","variants":[{"groupId":11,"actionLibraryId":101}]}
```

- **Typowe błędy:** Nie zamieniaj groupId i actionLibraryId.
- **Następny krok:** gm_coach_prepare_accessory_requirement_confirmation dla braków.

### gm_coach_prepare_accessory_requirement_confirmation

- **Do czego / kiedy:** Przygotuj challenge potwierdzenia pełnej listy akcesoriów dla jednego wariantu (groupId + actionLibraryId).
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `groupId`, `actionLibraryId`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| groupId | integer | tak | min 1 |
| actionLibraryId | integer | tak | min 1 |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","groupId":11,"actionLibraryId":101}
```

- **Typowe błędy:** Nie zamieniaj groupId i actionLibraryId (oba ≥1, z katalogu/presetów).
- **Następny krok:** Pokaż listę, po zgodzie gm_coach_confirm_accessory_requirements z challengeId.

### gm_coach_confirm_accessory_requirements

- **Do czego / kiedy:** Zapisz deklarację użytkownika o kompletnej liście wymaganych akcesoriów.
- **Dostęp i zgoda:** zapis lokalny na tym komputerze (nie konto) — po jawnej zgodzie użytkownika
- **Wymagane:** `challengeId`, `requiredAccessoryIds`, `complete`, `confirm`, `rationale`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| challengeId | string | tak | wzorzec `^[a-f0-9]{48}$` |
| requiredAccessoryIds | array | tak | maks. elementów 128 |
| complete | boolean | tak | stała true |
| confirm | boolean | tak | stała true |
| rationale | string | tak | min. znaków 1; maks. znaków 500 |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","challengeId":"<48 hex>","requiredAccessoryIds":[3,7],"complete":true,"confirm":true,"rationale":"Użytkownik potwierdził listę."}
```

- **Typowe błędy:** challengeId z bieżącego prepare (wygasa); [] tylko jako świadoma deklaracja; complete i confirm = true; rationale 1–500.
- **Następny krok:** Ponów podgląd planu.

### gm_coach_get_accessory_requirement_confirmations

- **Do czego / kiedy:** Lista aktywnych deklaracji akcesoriów.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** brak
- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default"}
```

- **Typowe błędy:** —
- **Następny krok:** gm_coach_forget_accessory_requirement_confirmation gdy trzeba cofnąć.

### gm_coach_forget_accessory_requirement_confirmation

- **Do czego / kiedy:** Usuń deklarację; unieważnia zależne podglądy.
- **Dostęp i zgoda:** zapis lokalny na tym komputerze (nie konto) — po jawnej zgodzie użytkownika
- **Wymagane:** `confirmationId`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| confirmationId | string | tak | wzorzec `^[a-f0-9]{48}$` |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","confirmationId":"<48 hex>"}
```

- **Typowe błędy:** confirmationId 48 hex.
- **Następny krok:** Nowy podgląd.

### speediance_browse_official_courses

- **Do czego / kiedy:** Oficjalne pojedyncze treningi (strona po stronie).
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony; consent_to_read_speediance=true
- **Wymagane:** `consent_to_read_speediance`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| query | string | nie | maks. znaków 200 |
| course_id | integer | nie | min 1 |
| page | integer | nie | min 1; max 10000 |
| page_size | integer | nie | min 1; max 200 |
| return_limit | integer | nie | min 1; max 200 |
| consent_to_read_speediance | boolean | tak | stała true |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","consent_to_read_speediance":true,"page":1,"page_size":50}
```

- **Typowe błędy:** Brak automatycznej paginacji; z course_id nie podawaj page.
- **Następny krok:** —

### speediance_browse_official_programs

- **Do czego / kiedy:** Oficjalne programy wielotygodniowe.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony; consent_to_read_speediance=true
- **Wymagane:** `consent_to_read_speediance`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| query | string | nie | maks. znaków 200 |
| selected_week | integer | nie | min 1; max 10000 |
| selected_day | integer | nie | min 1; max 10000 |
| program_id | integer | nie | min 1 |
| page | integer | nie | min 1; max 10000 |
| page_size | integer | nie | min 1; max 200 |
| return_limit | integer | nie | min 1; max 200 |
| consent_to_read_speediance | boolean | tak | stała true |

- **Inne pola:** profile, include_course_details
- **Minimalny przykład:**

```json
{"profile":"default","consent_to_read_speediance":true,"page":1}
```

- **Typowe błędy:** Szczegóły przez program_id (+selected_week/day).
- **Następny krok:** —

### gm_coach_suggest_load

- **Do czego / kiedy:** Sugestia ciężaru: domyślnie reference-client-assessment; labatt-reference-epley z danych użytkownika; history-channel-total = Customize z kanałów L/R historii (patrz reguły na górze dokumentu).
- **Pola Labatt:** labatt_source, labatt_saved_anchor, labatt_history, target_rir — tylko z load_method=labatt-reference-epley (wtedy wymagane też profile, unit, set_reps); z domyślną metodą błąd. Przykład: {profile, exercise_id:235, load_method:"labatt-reference-epley", labatt_source:"working-set", target_rir:2, unit:"kg", set_reps:[5]}.
- **Dostęp i zgoda:** obliczenie lokalne; refresh_speediance_data=true czyta konto (consent_to_read_speediance=true)
- **Wymagane:** `exercise_id`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| exercise_id | integer | tak | min 1 |
| movement_kind | string | nie | "strength" \| "cardio" \| "pilates" \| "mat" \| "bodyweight" |
| exercise_name | string | nie | maks. znaków 120 |
| goal | string | nie | "strength" \| "muscle" \| "maintenance" \| "endurance" |
| set_reps | array | nie | min. elementów 1; maks. elementów 100 |
| duration_seconds | integer | nie | min 1; max 7200 |
| intensity | integer | nie | min 1; max 10 |
| band_colors | array | nie | min. elementów 1; maks. elementów 6 |
| rest_seconds | integer | nie | min 0; max 600 |
| one_rep_max | number | nie | max 1000 |
| unit | string | nie | "kg" \| "lb" |
| working_weight | number | nie | max 1000 |
| working_reps | integer | nie | min 1; max 30 |
| load_method | string | nie | "reference-client-assessment" \| "labatt-reference-epley" \| "history-channel-total" |
| channel_history | array | nie | maks. elementów 500 |
| deload_load_fraction | number | nie | max 1 |
| labatt_source | string | nie | "working-set" \| "history" \| "saved-anchor" |
| target_rir | integer | nie | min 0; max 5 |
| labatt_saved_anchor | number | nie | max 1000 |
| labatt_history | array | nie | maks. elementów 30 |
| working_rir | integer | nie | min 0; max 5 |

- **Inne pola:** profile, channel_target, deload, refresh_speediance_data, consent_to_read_speediance
- **Minimalny przykład:**

```json
{"exercise_id":10,"load_method":"history-channel-total","unit":"kg","set_reps":[8,8,8],"channel_target":{"equipment":"barbell"},"channel_history":[{"exerciseId":10,"observedAt":"2026-11-01T10:00:00Z","unit":"kg","equipment":"barbell","reps":8,"left":20,"right":20}]}
```

- **Typowe błędy:** channel_target/channel_history/deload/deload_load_fraction bez load_method=history-channel-total → błąd. channel_history: tylko serie robocze (warmup=false), maks. 500, reps 1–30. deload_load_fraction w (0,4; 1]. labatt-reference-epley wymaga labatt_source, target_rir, unit, set_reps. needsInput = zapytaj o ciężar.
- **Następny krok:** Wpisz ciężar z pochodzeniem do tabeli planu i do exercises (loadType customize-manual), potem podgląd.

### gm_coach_calculate_sketch_time

- **Do czego / kiedy:** Arytmetyka czasu rozwiniętego szkicu (wiersz = seria/strona).
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `rows`, `additionalSetupRange`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| rows | array | tak | min. elementów 1; maks. elementów 100 |
| additionalSetupRange | obiekt | tak | — |
| sessionLimitMinutes | number | nie | max 1440 |

- **Inne pola:** userOverride
- **Minimalny przykład:**

```json
{"rows":[{"label":"sq-1","section":"main","side":...,"work":{...},"restAfterRange":{"minSeconds":90,"maxSeconds":90},"transitionAfterRange":{"minSeconds":0,"maxSeconds":0},"overlapAfterSeconds":0}],"additionalSetupRange":{"minSeconds":0,"maxSeconds":120}}
```

- **Typowe błędy:** Każdy wiersz wymaga label, section, side, work, restAfterRange, transitionAfterRange, overlapAfterSeconds. label ASCII [A-Za-z0-9._-] 1–80 bez spacji. Zakresy to {minSeconds,maxSeconds}; additionalSetupRange może być null.
- **Następny krok:** gm_coach_calculate_compact_sketch_time jako szybsza wersja.

### gm_coach_calculate_compact_sketch_time

- **Do czego / kiedy:** Szybki kalkulator czasu z bloków ćwiczeń.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `blocks`, `additionalSetupRange`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| blocks | array | tak | min. elementów 1; maks. elementów 32 |
| additionalSetupRange | obiekt | tak | — |
| sessionLimitMinutes | number | nie | max 1440 |

- **Inne pola:** userOverride
- **Minimalny przykład:**

```json
{"blocks":[{"id":"sq","section":"main","setCount":2,"sides":["bilateral"],"loadMode":"smart-rm","smartRmPreset":"Gain Muscle","workBySet":[{"unit":"reps","reps":12,"secondsPerRepRange":{"minSeconds":3,"maxSeconds":3}},{"unit":"reps","reps":10,"secondsPerRepRange":{"minSeconds":3,"maxSeconds":3}}],"restWithinSetRange":{"minSeconds":0,"maxSeconds":0},"restBetweenSetsRange":{"minSeconds":90,"maxSeconds":90},"restAfterBlockRange":{"minSeconds":0,"maxSeconds":0},"transitionAfterBlockRange":{"minSeconds":0,"maxSeconds":0}}],"additionalSetupRange":{"minSeconds":0,"maxSeconds":120},"sessionLimitMinutes":60}
```

- **Typowe błędy:** Blok wymaga id, section, setCount, sides (tablica, np. ["bilateral"]), loadMode i czterech zakresów przerw (restWithinSetRange, restBetweenSetsRange, restAfterBlockRange, transitionAfterBlockRange — dwa ostatnie = 0 w ostatnim bloku). work dla identycznych serii albo workBySet z dokładnie setCount dawek — nie oba. Nie używaj smartRm, sides jako tekstu, restBetweenSidesRange ani transitionRange. Zakresy to {minSeconds,maxSeconds}.
- **Następny krok:** Dostosuj szkic do limitu czasu.

## 5. Badania naukowe

### gm_coach_prepare_science_scope

- **Do czego / kiedy:** Preflight: które kategorie badań są potrzebne dla planu.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `exercises`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| exercises | array | tak | min. elementów 1; maks. elementów 64 |
| supersetCount | integer | nie | min 0; max 32 |

- **Inne pola:** warmupIncluded, stretchingIncluded, nutritionContextKnown, specialResistanceMode, userOverride
- **Minimalny przykład:**

```json
{"exercises":[{...typ, jednostka, tryb wg schematu}],"warmupIncluded":true,"stretchingIncluded":true}
```

- **Typowe błędy:** exercises 1–64; pola pozycji sprawdź w schemacie.
- **Następny krok:** gm_coach_search_training_research dla zwróconych kategorii.

### gm_coach_derive_evidence_bindings

- **Do czego / kiedy:** Dokładne category/target/value dla szkicu sesji — z nich budujesz decisionEvidence.
- **Sekcja (1.0.680):** gdy ćwiczenie nie ma `section`, a wskazuje je `executionRef` rozgrzewki/rozciągania, derive liczy je jako warmup/stretching (tak jak podgląd); inaczej `main`. Niezgodna wartość w podglądzie daje kod science_decision_mismatch z oczekiwaną i otrzymaną wartością. Customize: `loadType: "customize-manual"`, `staticLoadRequested: true`, w seriach `weight` i `weightUnit`.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `exercises`, `warmup`, `postWorkoutStretching`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| exercises | array | tak | min. elementów 1; maks. elementów 64 |
| warmup | object | tak | — |
| postWorkoutStretching | object | tak | — |
| supersetBlocks | array | nie | maks. elementów 32 |
| detail | string | nie | "summary" \| "full" |
| offset | integer | nie | min 0 |
| limit | integer | nie | min 1; max 100 |

- **Inne pola:** primaryGoal, recoveryContext, nutritionContextKnown, groupByExactValue, userOverride
- **Minimalny przykład:**

```json
{"exercises":[...szkic jak w preview],"warmup":{...},"postWorkoutStretching":{...},"groupByExactValue":true}
```

- **Typowe błędy:** Smart RM: podaj cel/preset, reps, rirTarget, mode, restSeconds — bez rmLevel/1RM. limit 1–100, paginacja offset.
- **Następny krok:** Skopiuj value do decisionEvidence; target: plan | exercise:N | set:N:M | warmup:N | stretch:N.

### gm_coach_prepare_evidence_pack

- **Do czego / kiedy:** Pierwszy krok nauki w zwykłym planie jednej sesji: jednym wywołaniem powiązania, zbiorcze wyszukiwanie PubMed, źródła i dosłowne fragmenty w limitach walidatora oraz szkic decisionEvidence.
- **Zalecana droga (1.0.680):** to jest zalecany sposób przygotowania dowodów. Szkic wybiera fragmenty 5–10 słów, więc w limicie 25 słów na źródło mieszczą się co najmniej 2 kategorie (osobny fragment na kategorię, maks. 12 źródeł) — zamiast wielu ręcznych wyszukiwań. Powtórzone `coveredCategories` są deduplikowane.
- **Bez dodatkowych odczytów:** Abstrakty potrzebne do oceny są już w sourceHints — nie wywołuj read_training_research_batch, find_research_in_batches ani read_selected_research_abstracts dla tych źródeł; oceń pola REVIEW i od razu wyślij speediance_preview_program z evidence, researchBatchIds i decisionEvidence z paczki. Używaj researchBatchIds i coveredCategories dokładnie z wyniku; nie dopisuj batchy ręcznie. Pole `researchBatchIds` w speediance_preview_program: podawaj tylko batche, w których ten PMID wystąpił pod co najmniej jedną deklarowaną coveredCategory; nie dodawaj innych batchy.
- **Dostęp i zgoda:** odczyt PubMed, bez konta; zgoda niepotrzebna
- **Wymagane:** `exercises`, `warmup`, `postWorkoutStretching`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| exercises | array | tak | min. elementów 1; maks. elementów 64 |
| warmup | object | tak | — |
| postWorkoutStretching | object | tak | — |
| supersetBlocks | array | nie | maks. elementów 32 |
| context | string | nie | maks. 200 znaków; do 6 prostych słów (cel, poziom, populacja) |

- **Inne pola:** primaryGoal, recoveryContext, nutritionContextKnown
- **Minimalny przykład:**

```json
{"exercises":[...szkic jak w preview],"warmup":{...},"postWorkoutStretching":{...},"recoveryContext":{...},"context":"hypertrophy trained adults"}
```

- **Typowe błędy:** pola REVIEW (relationship, reasoning, sourceAssessments: direction/interventionMatch/outcomeMatch/populationMatch/limitations/rationale; evidence: finding/population/limitations) musisz ocenić sam na podstawie sourceHints[].abstract — narzędzie ich nie zgaduje. valueToFill=true: wpisz value i to samo reviewedValue. Nie zmieniaj fragmentów bez sprawdzenia limitu 25 słów/źródło i osobnego fragmentu na kategorię.
- **Następny krok:** needsModelAttention zwykle puste (5 wyników na kategorię, wybór źródeł wspólnych dla wielu kategorii, krótsze dosłowne fragmenty). Gdy niepuste: wykonaj DOKŁADNIE JEDNO gm_coach_search_training_research z gotowymi argumentami followUpSearch (wszystkie takie kategorie naraz), bez innych wyszukiwań; potem speediance_preview_program z evidence i decisionEvidence.

### gm_coach_derive_multi_session_evidence_scope

- **Do czego / kiedy:** Wspólny zakres badań dla 2–8 sesji przed PubMed.
- **customize-manual:** ćwiczenie wymaga staticLoadRequested=true, każda seria weight > 0 i weightUnit kg|lb (nie weightKg), np. {"loadType":"customize-manual","staticLoadRequested":true,"sets":[{"unit":"reps","reps":5,"mode":1,"weight":79,"weightUnit":"kg"}]}. To samo dotyczy gm_coach_derive_evidence_bindings.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `sessions`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| sessions | array | tak | min. elementów 2; maks. elementów 8 |
| sharedOffset | integer | nie | min 0 |
| sharedLimit | integer | nie | min 1; max 100 |

- **Inne pola:** includeSessionBindings
- **Minimalny przykład:**

```json
{"sessions":[{...sesja 1},{...sesja 2}]}
```

- **Typowe błędy:** sessions 2–8 pełnych szkiców.
- **Następny krok:** gm_coach_search_training_research.

### gm_coach_search_training_research

- **Do czego / kiedy:** Wyszukiwanie PubMed dla kategorii decyzji planu; zachowuje batchId, PMID, abstrakty.
- **Dostęp i zgoda:** sieć (NCBI), bez konta
- **Wymagane:** `queries`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| queries | array | tak | min. elementów 1; maks. elementów 16 |
| maxResultsPerQuery | integer | nie | min 1; max 5 |
| output_view | string | nie | "full" \| "compact" |

- **Minimalny przykład:**

```json
{"queries":[{"category":"weekly_volume","query":"resistance training weekly set volume hypertrophy"}],"maxResultsPerQuery":5,"output_view":"compact"}
```

- **Typowe błędy:** queries 1–16 obiektów {category, query} — wszystkie kategorie planu w jednym wywołaniu; maxResultsPerQuery ≤5. Zwykłe słowa, bez składni PubMed.
- **Następny krok:** gm_coach_find_research_in_batches / gm_coach_read_selected_research_abstracts.

### gm_coach_find_research_in_batches

- **Do czego / kiedy:** Filtr zachowanych wyników wg tematu/ćwiczenia.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `batchIds`, `topic`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| batchIds | array | tak | min. elementów 1; maks. elementów 8 |
| topic | string | tak | "hypertrophy" \| "recovery" \| "deload" \| "strength" \| "muscle_mass" \| "exercise" |
| terms | string | nie | maks. znaków 100 |
| termMatch | string | nie | "phrase" \| "all_words" |
| category | string | nie | "weekly_volume" \| "frequency" \| "intensity_load" \| "rest_intervals" \| "exercise_order" \| "warmup" \| "progression_rotation" \| "recovery_deload" \| "supersets" \| "resistance_modes" \| "intensity_techniques" \| "stretching_mobility" \| "timed_exercise" \| "post_workout_stretching" \| "nutrition_context" \| "recovery_context" \| "exercise_selection" \| "exercise_dose" \| "set_work_dose" \| "set_load" \| "set_effort_rir" \| "set_resistance_mode" \| "set_rest_interval" \| "warmup_element" \| "post_workout_stretching_item" \| "cardio_exercise_selection" \| "cardio_intensity" \| "cardio_work_rest" |
| limit | integer | nie | min 1; max 12 |

- **Minimalny przykład:**

```json
{"batchIds":["<uuid>"],"topic":"hypertrophy","limit":12}
```

- **Typowe błędy:** batchIds 1–8; topic z enumu; limit 1–12.
- **Następny krok:** gm_coach_read_selected_research_abstracts.

### gm_coach_read_training_research_batch

- **Do czego / kiedy:** Odczyt zachowanego batcha PubMed (index/bibliography/abstract).
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `batchId`, `mode`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| batchId | string | tak | min. znaków 1; maks. znaków 128 |
| mode | string | tak | "index" \| "bibliography" \| "abstract" |
| sourceId | string | nie | wzorzec `^pubmed:\d{1,12}$` |
| offset | integer | nie | min 0 |
| maxOutputBytes | integer | nie | min 1024; max 16000 |

- **Minimalny przykład:**

```json
{"batchId":"<uuid>","mode":"abstract","sourceId":"pubmed:12345678"}
```

- **Typowe błędy:** mode=index bez sourceId; bibliography/abstract wymagają sourceId pubmed:<PMID>; maxOutputBytes 1024–16000.
- **Następny krok:** gm_coach_read_selected_research_abstracts.

### gm_coach_read_selected_research_abstracts

- **Do czego / kiedy:** Pełne abstrakty do 8 wybranych źródeł jednym odczytem.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `sources`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| sources | array | tak | min. elementów 1; maks. elementów 8 |

- **Minimalny przykład:**

```json
{"sources":[{...batchId i sourceId pubmed:<PMID> wg schematu}]}
```

- **Typowe błędy:** sources 1–8; tylko z bieżących batchy.
- **Następny krok:** Oceń źródła i zbuduj evidence/decisionEvidence.

### gm_coach_find_science_guidance

- **Do czego / kiedy:** Lokalne notatki naukowe GM Coach wg 1–4 tematów (nie zastępują PubMed).
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `topics`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| topics | array | tak | min. elementów 1; maks. elementów 4 |

- **Minimalny przykład:**

```json
{"topics":["deload","recovery"]}
```

- **Typowe błędy:** topics z enumu, maks. 4.
- **Następny krok:** gm_coach_search_training_research.

## 6. Podgląd

### gm_coach_prepare_quick_test_preview

- **Do czego / kiedy:** Walidacja jednorazowego QuickTest i zakresów preferencji przed pierwszym podglądem.
- **Dostęp i zgoda:** podgląd: czyta katalog/konto i bramkę naukową, niczego nie zapisuje
- **Wymagane:** `name`, `exercises`, `rationale`, `evidence`, `decisionEvidence`, `warmup`, `postWorkoutStretching`, `quickTestSession`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| importedRmPolicyId | string | nie | wzorzec `^[a-f0-9]{48}$` |
| quickTestSession | boolean | tak | stała true |
| scienceGate | string | nie | "user_declined" |
| deloadLoadOverride | string | nie | "smart-rm" |
| confirmedDisplayUnit | string | nie | "kg" \| "lb" |
| name | string | tak | min. znaków 1; maks. znaków 80 |
| rationale | string | tak | min. znaków 1; maks. znaków 2000 |
| scheduleDate | string | nie | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| supersetBlocks | array | nie | maks. elementów 3 |
| preferenceReviews | array | nie | maks. elementów 94 |
| decisionEvidence | array | tak | min. elementów 0; maks. elementów 1575 |
| evidence | array | tak | min. elementów 0; maks. elementów 12 |
| exercises | array | tak | min. elementów 1; maks. elementów 30 |
| warmup | object | tak | — |
| postWorkoutStretching | object | tak | — |
| decisionEvidenceGroups | array | nie | maks. elementów 1575 |

- **Inne pola:** profile, recoveryContext, isDeload, cycleContext, intakeAnswers, referenceClientCustomizeRequestedForWholeWorkout, fixedKgRequestedForWholeWorkout, timeEstimation, showCalculatedLoads, userOverride
- **Minimalny przykład:**

```json
jak speediance_preview_program + "quickTestSession":true
```

- **Typowe błędy:** quickTestSession musi być true.
- **Następny krok:** speediance_preview_program.

### speediance_preview_program

- **rirTarget:** wymagane całkowite 0–5 dla każdej oporowej serii reps, także w rozgrzewce i rozciąganiu na powtórzenia; typowo rirTarget 4 dla rozgrzewki.
- **Do czego / kiedy:** Pełny podgląd nowego treningu z bramką naukową; zwraca previewId.
- **Dostęp i zgoda:** podgląd: czyta katalog/konto i bramkę naukową, niczego nie zapisuje
- **Wymagane:** `name`, `exercises`, `rationale`, `evidence`, `decisionEvidence`, `warmup`, `postWorkoutStretching`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| importedRmPolicyId | string | nie | wzorzec `^[a-f0-9]{48}$` |
| scienceGate | string | nie | "user_declined" |
| deloadLoadOverride | string | nie | "smart-rm" |
| confirmedDisplayUnit | string | nie | "kg" \| "lb" |
| name | string | tak | min. znaków 1; maks. znaków 80 |
| rationale | string | tak | min. znaków 1; maks. znaków 2000 |
| scheduleDate | string | nie | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| supersetBlocks | array | nie | maks. elementów 3 |
| preferenceReviews | array | nie | maks. elementów 94 |
| decisionEvidence | array | tak | min. elementów 0; maks. elementów 1575 |
| evidence | array | tak | min. elementów 0; maks. elementów 12 |
| exercises | array | tak | min. elementów 1; maks. elementów 30 |
| warmup | object | tak | — |
| postWorkoutStretching | object | tak | — |
| decisionEvidenceGroups | array | nie | maks. elementów 1575 |

- **Inne pola:** profile, recoveryContext, quickTestSession, isDeload, cycleContext, intakeAnswers, referenceClientCustomizeRequestedForWholeWorkout, fixedKgRequestedForWholeWorkout, timeEstimation, showCalculatedLoads, preparePreferenceReviews, userOverride
- **Minimalny przykład:**

```json
{"profile":"default","name":"Push A","rationale":"...","exercises":[...],"warmup":{...},"postWorkoutStretching":{...},"evidence":[{"id":"e1","researchSourceId":"pubmed:...",...}],"decisionEvidence":[{"category":"weekly_volume","target":"plan","value":"<z derive_evidence_bindings>","status":"applied",...}]}
```

- **Typowe błędy:** target tylko: plan | exercise:<entryId> | set:<entryId>:<seria> | warmup:<n> | stretch:<n> (nie stretching:N/warmups:N). value dokładnie z gm_coach_derive_evidence_bindings. evidence id e1–e12; researchBatchIds z wyszukiwania. Cytaty ≥5 słów. exercises 1–30; supersetBlocks ≤3. Customize/fixed-kg poza deloadem wymagają ciężaru i jednostki.
- **Następny krok:** Pokaż pełny plan, po zgodzie speediance_create_program z previewId. Wynik ma approvalExpiresAt (ISO, 30 min od podglądu) i zdanie w note: zgoda użytkownika musi nastąpić przed tym terminem; po nim odnów podgląd bez zmian planu.

### speediance_preview_saved_program_update

- **Do czego / kiedy:** Podgląd edycji istniejącego szablonu: pełny wynikowy plan + program_code + base_digest; zwraca edit_preview_id.
- **Dostęp i zgoda:** podgląd: czyta katalog/konto i bramkę naukową, niczego nie zapisuje
- **Wymagane:** `name`, `exercises`, `rationale`, `evidence`, `decisionEvidence`, `warmup`, `postWorkoutStretching`, `program_code`, `base_digest`, `allowed_changes`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| importedRmPolicyId | string | nie | wzorzec `^[a-f0-9]{48}$` |
| scienceGate | string | nie | "user_declined" |
| deloadLoadOverride | string | nie | "smart-rm" |
| confirmedDisplayUnit | string | nie | "kg" \| "lb" |
| name | string | tak | min. znaków 1; maks. znaków 80 |
| rationale | string | tak | min. znaków 1; maks. znaków 2000 |
| scheduleDate | string | nie | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| supersetBlocks | array | nie | maks. elementów 3 |
| preferenceReviews | array | nie | maks. elementów 94 |
| decisionEvidence | array | tak | min. elementów 0; maks. elementów 1575 |
| evidence | array | tak | min. elementów 0; maks. elementów 12 |
| exercises | array | tak | min. elementów 1; maks. elementów 30 |
| warmup | object | tak | — |
| postWorkoutStretching | object | tak | — |
| decisionEvidenceGroups | array | nie | maks. elementów 1575 |
| program_code | string | tak | min. znaków 1; maks. znaków 128 |
| base_digest | string | tak | wzorzec `^[a-f0-9]{64}$` |
| batch_items | array | nie | min. elementów 1; maks. elementów 29 |
| allowed_changes | array | tak | min. elementów 1; maks. elementów 8 |
| smart_rm_conversion | array | nie | min. elementów 1; maks. elementów 100 |
| resistance_mode_updates | array | nie | min. elementów 1; maks. elementów 100 |
| primary_goal | string | nie | min. znaków 1; maks. znaków 300 |

- **Inne pola:** profile, recoveryContext, isDeload, cycleContext, intakeAnswers, referenceClientCustomizeRequestedForWholeWorkout, fixedKgRequestedForWholeWorkout, timeEstimation, showCalculatedLoads, userOverride
- **Minimalny przykład:**

```json
jak speediance_preview_program + "program_code":"ABC123","base_digest":"<64 hex>","allowed_changes":[...wartości z enumu]
```

- **Typowe błędy:** base_digest ze świeżego speediance_get_saved_program; allowed_changes 1–8; smart_rm_conversion/resistance_mode_updates podawaj tutaj, nie w update.
- **Następny krok:** speediance_update_saved_program z edit_preview_id przed approvalExpiresAt (ten sam termin 30 min co w speediance_preview_program).

### speediance_preview_saved_program_schedule

- **Do czego / kiedy:** Ocena naukowa istniejącego treningu przed dodaniem do kalendarza; zwraca schedule_preview_id.
- **Uwagi (1.0.680):** datę podaj tylko w `date`; `scheduleDate` pomiń (równe `date` jest akceptowane, różne → GM_COACH_SCHEDULE_DATE_CONFLICT). Plan przepisz dokładnie z speediance_get_saved_program: serie z `planFields.side` 1/2 → w ćwiczeniu `unilateralPrescription: "explicit-sides"`, a w każdej serii `side` z `planFields.side`; przerwy → `restSeconds`; odczytany Customize z ręcznymi ciężarami → `loadType: "customize-manual"`, `staticLoadRequested: true`, w seriach `weight`/`weightUnit`, bez `userRequestedReferenceClientCustomize` (inaczej GM_COACH_CUSTOMIZE_FLAG_CONFLICT). Odczyt nie zawiera RIR — podaj `rirTarget` zgodny z celem (np. 2; rozgrzewka typowo 4), bo RIR jest decyzją naukową set_effort_rir. Różnica planu i szablonu daje nieomijalny kod saved_plan_mismatch z pierwszymi różnicami (ścieżka, oczekiwane vs odczytane).
- **Dostęp i zgoda:** podgląd: czyta katalog/konto i bramkę naukową, niczego nie zapisuje
- **Wymagane:** `name`, `exercises`, `rationale`, `evidence`, `decisionEvidence`, `warmup`, `postWorkoutStretching`, `program_code`, `base_digest`, `date`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| importedRmPolicyId | string | nie | wzorzec `^[a-f0-9]{48}$` |
| scienceGate | string | nie | "user_declined" |
| deloadLoadOverride | string | nie | "smart-rm" |
| confirmedDisplayUnit | string | nie | "kg" \| "lb" |
| name | string | tak | min. znaków 1; maks. znaków 80 |
| rationale | string | tak | min. znaków 1; maks. znaków 2000 |
| scheduleDate | string | nie | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| supersetBlocks | array | nie | maks. elementów 3 |
| preferenceReviews | array | nie | maks. elementów 94 |
| decisionEvidence | array | tak | min. elementów 0; maks. elementów 1575 |
| evidence | array | tak | min. elementów 0; maks. elementów 12 |
| exercises | array | tak | min. elementów 1; maks. elementów 30 |
| warmup | object | tak | — |
| postWorkoutStretching | object | tak | — |
| decisionEvidenceGroups | array | nie | maks. elementów 1575 |
| program_code | string | tak | wzorzec `^[A-Za-z0-9._-]{1,128}$` |
| base_digest | string | tak | wzorzec `^[a-f0-9]{64}$` |
| date | string | tak | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| quickTestLegacyMarkerMigration | boolean | nie | stała true |

- **Inne pola:** profile, recoveryContext, quickTestSession, isDeload, cycleContext, intakeAnswers, referenceClientCustomizeRequestedForWholeWorkout, fixedKgRequestedForWholeWorkout, timeEstimation, showCalculatedLoads, userOverride
- **Minimalny przykład:**

```json
jak speediance_preview_program + "program_code":"ABC123","base_digest":"<64 hex>","date":"2026-11-14"
```

- **Typowe błędy:** date YYYY-MM-DD; plan kompletny ze świeżymi źródłami.
- **Następny krok:** speediance_schedule_saved_program przed approvalExpiresAt (30 min).

## 7. Zapis, edycja i kalendarz

### speediance_create_program

- **Do czego / kiedy:** Zapis nowego szablonu dokładnie z podglądu.
- **Dostęp i zgoda:** ZAPIS do konta Speediance — tylko po pokazaniu dokładnego wyniku i wyraźnej zgodzie użytkownika (confirm=true)
- **Wymagane:** `name`, `exercises`, `rationale`, `evidence`, `decisionEvidence`, `warmup`, `postWorkoutStretching`, `previewId`, `confirm`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| importedRmPolicyId | string | nie | wzorzec `^[a-f0-9]{48}$` |
| scienceGate | string | nie | "user_declined" |
| deloadLoadOverride | string | nie | "smart-rm" |
| confirmedDisplayUnit | string | nie | "kg" \| "lb" |
| name | string | tak | min. znaków 1; maks. znaków 80 |
| rationale | string | tak | min. znaków 1; maks. znaków 2000 |
| scheduleDate | string | nie | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| supersetBlocks | array | nie | maks. elementów 3 |
| preferenceReviews | array | nie | maks. elementów 94 |
| decisionEvidence | array | tak | min. elementów 0; maks. elementów 1575 |
| evidence | array | tak | min. elementów 0; maks. elementów 12 |
| exercises | array | tak | min. elementów 1; maks. elementów 30 |
| warmup | object | tak | — |
| postWorkoutStretching | object | tak | — |
| decisionEvidenceGroups | array | nie | maks. elementów 1575 |
| previewId | string | tak | min. znaków 48; maks. znaków 48 |
| confirm | boolean | tak | stała true |

- **Inne pola:** profile, recoveryContext, quickTestSession, isDeload, cycleContext, intakeAnswers, referenceClientCustomizeRequestedForWholeWorkout, fixedKgRequestedForWholeWorkout, timeEstimation, showCalculatedLoads, userOverride
- **Minimalny przykład:**

```json
te same pola co speediance_preview_program + "previewId":"<48 znaków>","confirm":true
```

- **Typowe błędy:** Plan musi być identyczny jak w podglądzie (te same intakeAnswers, confirmedDisplayUnit); świeży previewId.
- **Następny krok:** speediance_get_saved_program (weryfikacja), potem planowanie w kalendarzu. Błąd „Podgląd wygasł…” ma kod preview_expired (nie do pominięcia): odnów podgląd tego samego planu i pokaż go ponownie; nie zmieniaj dawek.

### speediance_update_saved_program

- **Do czego / kiedy:** Zapis edycji szablonu.
- **Dostęp i zgoda:** ZAPIS do konta Speediance — tylko po pokazaniu dokładnego wyniku i wyraźnej zgodzie użytkownika (confirm=true)
- **Wymagane:** `program_code`, `base_digest`, `confirm`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| program_code | string | tak | min. znaków 1; maks. znaków 128; wzorzec `^[A-Za-z0-9._-]+$` |
| batch_items | array | nie | min. elementów 1; maks. elementów 29 |
| base_digest | string | tak | wzorzec `^[a-f0-9]{64}$` |
| edit_preview_id | string | nie | min. znaków 48; maks. znaków 48 |
| static_load_authorization | string | nie | "customize" \| "fixed-load" |
| confirmed_weight_unit | string | nie | "kg" \| "lb" |
| name | string | nie | min. znaków 1; maks. znaków 80 |
| primary_goal | string | nie | min. znaków 1; maks. znaków 300 |
| smart_rm_conversion | array | nie | min. elementów 1; maks. elementów 100 |
| resistance_mode_updates | array | nie | min. elementów 1; maks. elementów 100 |
| action_library_list | array | nie | min. elementów 1; maks. elementów 100 |
| confirm | boolean | tak | stała true |

- **Inne pola:** profile, userOverride
- **Minimalny przykład:**

```json
{"profile":"default","program_code":"ABC123","base_digest":"<64 hex>","edit_preview_id":"<48 znaków>","confirm":true}
```

- **Typowe błędy:** Używaj edit_preview_id bez ponownego dołączania poprawek; nieaktualny digest → odczytaj szablon ponownie.
- **Następny krok:** speediance_get_saved_program.

### speediance_delete_saved_program

- **Do czego / kiedy:** Usuń jeden szablon (nieodwracalne, może usunąć historię wykonań).
- **Znacznik pending (1.0.680):** po zweryfikowanym usunięciu lokalny znacznik pending o tej samej nazwie programu jest przenoszony do `resolved-pending-writes-<RRRRMMDD>`; wynik podaje `pendingMarkerResolved`.
- **Dostęp i zgoda:** ZAPIS do konta Speediance — tylko po pokazaniu dokładnego wyniku i wyraźnej zgodzie użytkownika (confirm=true); operacja nieodwracalna
- **Wymagane:** `program_code`, `program_name`, `base_digest`, `confirm`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| program_code | string | tak | min. znaków 1; maks. znaków 128; wzorzec `^[A-Za-z0-9._-]+$` |
| program_name | string | tak | min. znaków 1; maks. znaków 80 |
| base_digest | string | tak | wzorzec `^[a-f0-9]{64}$` |
| confirm | boolean | tak | stała true |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","program_code":"ABC123","program_name":"Push A","base_digest":"<64 hex>","confirm":true}
```

- **Typowe błędy:** Najpierw speediance_get_saved_program po digest i nazwę.
- **Następny krok:** speediance_list_saved_programs.

### speediance_schedule_saved_program

- **Do czego / kiedy:** Dodaj (lub add=false usuń) rezerwację w kalendarzu.
- **Dostęp i zgoda:** ZAPIS do konta Speediance — tylko po pokazaniu dokładnego wyniku i wyraźnej zgodzie użytkownika (confirm=true)
- **Wymagane:** `program_name`, `date`, `confirm`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| schedule_preview_id | string | nie | min. znaków 48; maks. znaków 48 |
| program_name | string | tak | min. znaków 1; maks. znaków 80 |
| program_code | string | nie | min. znaków 1; maks. znaków 128; wzorzec `^[A-Za-z0-9._-]+$` |
| date | string | tak | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| quickTestSession | boolean | nie | stała true |
| confirm | boolean | tak | stała true |

- **Inne pola:** profile, add, userOverride
- **Minimalny przykład:**

```json
{"profile":"default","schedule_preview_id":"<48 znaków>","program_name":"Push A","program_code":"ABC123","date":"2026-11-14","confirm":true}
```

- **Typowe błędy:** Dodanie wymaga świeżego schedule_preview_id; quickTestSession tylko do odzyskania testowej rezerwacji.
- **Następny krok:** speediance_get_training_calendar.

### gm_coach_reconcile_pending_program_write

- **Do czego / kiedy:** Rozlicz lokalny znacznik niepewnego tworzenia. QuickTest (nazwa `Test … [GM-…]`): podaj `schedule_preview_id` świeżego podglądu QuickTest. Zwykły program: pomiń `schedule_preview_id`, podaj `program_name` i `program_code` — znacznik jest rozstrzygany tylko, gdy odczyt po kodzie ma dokładnie tę nazwę i jest jedynym szablonem o tej nazwie na kompletnej liście; znacznik trafia do `resolved-pending-writes-<data>` z kodem. Nic nie zapisuje na koncie.
- **Dostęp i zgoda:** ZAPIS do konta Speediance — tylko po pokazaniu dokładnego wyniku i wyraźnej zgodzie użytkownika (confirm=true)
- **Wymagane:** `program_code`, `confirm`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| program_code | string | tak | wzorzec `^[A-Za-z0-9._-]{1,128}$` |
| program_name | string | nie | min. znaków 1; maks. znaków 80; tylko zwykły program |
| schedule_preview_id | string | nie | min. znaków 48; maks. znaków 48; tylko QuickTest |
| confirm | boolean | tak | stała true |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","program_code":"ABC123","schedule_preview_id":"<48 znaków>","confirm":true}
```

- **Typowe błędy:** Wymaga planu zgodnego z digestem dla pierwotnej daty.
- **Następny krok:** —

### gm_coach_reconcile_legacy_quicktest_marker

- **Do czego / kiedy:** Rozlicz stary znacznik QuickTest, gdy planu nie da się odtworzyć.
- **Dostęp i zgoda:** ZAPIS do konta Speediance — tylko po pokazaniu dokładnego wyniku i wyraźnej zgodzie użytkownika (confirm=true)
- **Wymagane:** `program_code`, `base_digest`, `confirm`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| program_code | string | tak | wzorzec `^[A-Za-z0-9._-]{1,128}$` |
| base_digest | string | tak | wzorzec `^[a-f0-9]{64}$` |
| confirm | boolean | tak | stała true |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","program_code":"ABC123","base_digest":"<64 hex>","confirm":true}
```

- **Typowe błędy:** Świeży digest i unikalna nazwa GM.
- **Następny krok:** —

## 8. Cykle wielotygodniowe

### gm_coach_audit_training_cycle

- **Do czego / kiedy:** Lokalna kontrola całego wielotygodniowego planu (tygodnie, bloki, czas, deload).
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `totalWeeks`, `sessionsPerWeek`, `blocks`, `sessions`, `weeks`, `deload`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| totalWeeks | integer | tak | min 1; max 52 |
| restWeeks | array | nie | maks. elementów 52 |
| sessionsPerWeek | integer | tak | min 1; max 7 |
| sessionMinutes | integer | nie | min 10; max 240 |
| structurePreference | string | nie | "default" \| "user-custom" |
| customStructureReason | string | nie | maks. znaków 500 |
| blocks | array | tak | min. elementów 1; maks. elementów 52 |
| sessions | array | tak | min. elementów 1; maks. elementów 364 |
| weeks | array | tak | min. elementów 1; maks. elementów 52 |
| deload | object | tak | — |

- **Inne pola:** userOverride
- **Minimalny przykład:**

```json
{"totalWeeks":8,"sessionsPerWeek":3,"blocks":[...],"sessions":[...],"weeks":[...],"deload":{...}}
```

- **Typowe błędy:** totalWeeks 1–52; sessionsPerWeek 1–7; sessionMinutes 10–240.
- **Następny krok:** gm_coach_derive_training_cycle_prescription.

### gm_coach_expand_training_schedule

- **Do czego / kiedy:** Rozwiń tygodniowy/rotacyjny wzorzec na listę dat.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `schedule`, `startDate`, `endDate`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| startDate | string | tak | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| endDate | string | tak | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| protectBefore | string | nie | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| schedule | obiekt | tak | — |

- **Minimalny przykład:**

```json
{"startDate":"2026-11-16","endDate":"2027-01-10","schedule":{...}}
```

- **Typowe błędy:** Daty YYYY-MM-DD.
- **Następny krok:** gm_coach_derive_training_cycle_prescription.

### gm_coach_derive_training_cycle_prescription

- **Do czego / kiedy:** Wylicz daty, częstotliwość i dawki cyklu.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `startDate`, `totalWeeks`, `occurrences`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| startDate | string | tak | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| totalWeeks | integer | tak | min 1; max 52 |
| claimedWeeklySessionCounts | array | nie | maks. elementów 52 |
| occurrences | array | tak | min. elementów 1; maks. elementów 364 |

- **Inne pola:** deload, userOverride
- **Minimalny przykład:**

```json
{"startDate":"2026-11-16","totalWeeks":8,"occurrences":[...]}
```

- **Typowe błędy:** occurrences 1–364.
- **Następny krok:** speediance_preview_training_cycle.

### speediance_preview_training_cycle

- **Do czego / kiedy:** Podgląd całego cyklu (normalizacja, nauka każdej sesji); zwraca cyclePreviewId.
- **Dostęp i zgoda:** podgląd: czyta katalog/konto i bramkę naukową, niczego nie zapisuje
- **Wymagane:** `startDate`, `totalWeeks`, `sessions`, `occurrences`, `organization`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| organization | object | tak | — |
| cyclePreferenceReviews | array | nie | maks. elementów 7 |
| startDate | string | tak | wzorzec `^\d{4}-\d{2}-\d{2}$` |
| totalWeeks | integer | tak | min 1; max 52 |
| claimedWeeklySessionCounts | array | nie | maks. elementów 52 |
| sessions | array | tak | min. elementów 1; maks. elementów 364 |
| sharedDecisionEvidence | array | nie | maks. elementów 1575 |
| occurrences | array | tak | min. elementów 1; maks. elementów 364 |

- **Inne pola:** profile, intakeAnswers, deload, userOverride
- **Minimalny przykład:**

```json
{"profile":"default","organization":{...},"startDate":"2026-11-16","totalWeeks":8,"sessions":[...],"occurrences":[...]}
```

- **Typowe błędy:** sessions/occurrences 1–364; duże cykle → ścieżka szkicu (speediance_begin_training_cycle_draft).
- **Następny krok:** gm_coach_review_training_cycle.

### gm_coach_review_training_cycle

- **Do czego / kiedy:** Ocena 4 decyzji cyklu (weekly_volume, frequency, progression_rotation, recovery_deload).
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `cyclePreviewId`, `rationale`, `evidence`, `decisionEvidence`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| cyclePreviewId | string | tak | wzorzec `^[a-f0-9]{48}$` |
| rationale | string | tak | min. znaków 1; maks. znaków 2000 |
| evidence | array | tak | min. elementów 0; maks. elementów 12 |
| decisionEvidence | array | tak | min. elementów 4; maks. elementów 4 |

- **Inne pola:** prepareStyleReview, styleCompatibilityReview, userOverride
- **Minimalny przykład:**

```json
{"cyclePreviewId":"<48 hex>","rationale":"...","evidence":[...],"decisionEvidence":[4 pozycje]}
```

- **Typowe błędy:** decisionEvidence dokładnie 4, bindingValues z podglądu.
- **Następny krok:** speediance_execute_training_cycle po zgodzie.

### speediance_execute_training_cycle

- **Do czego / kiedy:** Zapis ocenionego cyklu.
- **Dostęp i zgoda:** ZAPIS do konta Speediance — tylko po pokazaniu dokładnego wyniku i wyraźnej zgodzie użytkownika (confirm=true)
- **Wymagane:** `profile`, `cyclePreviewId`, `confirm`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| cyclePreviewId | string | tak | wzorzec `^[a-f0-9]{48}$` |
| confirm | boolean | tak | stała true |
| approve_template_deletions | array | nie | maks. elementów 100 |

- **Inne pola:** profile, userOverride
- **Minimalny przykład:**

```json
{"profile":"default","cyclePreviewId":"<48 hex>","confirm":true}
```

- **Typowe błędy:** Świeży cyclePreviewId z kompletną oceną.
- **Następny krok:** speediance_get_training_calendar.

### speediance_begin_training_cycle_draft

- **Do czego / kiedy:** Start trwałego szkicu dużego cyklu.
- **Dostęp i zgoda:** zapis lokalny na tym komputerze (nie konto) — po jawnej zgodzie użytkownika
- **Wymagane:** `header`, `expectedSessions`, `expectedOccurrences`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| header | object | tak | — |
| expectedSessions | integer | tak | min 1; max 364 |
| expectedOccurrences | integer | tak | min 1; max 364 |

- **Inne pola:** profile, userOverride
- **Minimalny przykład:**

```json
{"profile":"default","header":{...},"expectedSessions":24,"expectedOccurrences":24}
```

- **Typowe błędy:** expectedSessions/Occurrences 1–364; limit 64 MB łącznie.
- **Następny krok:** speediance_upload_training_cycle_batch.

### speediance_upload_training_cycle_batch

- **Do czego / kiedy:** Dodaj partię sesji lub dat do szkicu.
- **Dostęp i zgoda:** zapis lokalny na tym komputerze (nie konto) — po jawnej zgodzie użytkownika
- **Wymagane:** `draftId`, `batchId`, `kind`, `items`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| draftId | string | tak | wzorzec `^[a-f0-9]{48}$` |
| batchId | string | tak | wzorzec `^[A-Za-z0-9._-]{1,128}$` |
| kind | enum | tak | "sessions" \| "occurrences" |
| items | array | tak | min. elementów 1; maks. elementów 364 |

- **Inne pola:** profile, userOverride
- **Minimalny przykład:**

```json
{"draftId":"<48 hex>","batchId":"s1","kind":"sessions","items":[...]}
```

- **Typowe błędy:** Ponowienie batchId tylko z identycznymi danymi; kind sessions|occurrences.
- **Następny krok:** speediance_finalize_training_cycle_draft.

### speediance_finalize_training_cycle_draft

- **Do czego / kiedy:** Zamknij szkic po kontroli kompletności.
- **Dostęp i zgoda:** zapis lokalny na tym komputerze (nie konto) — po jawnej zgodzie użytkownika
- **Wymagane:** `draftId`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| draftId | string | tak | wzorzec `^[a-f0-9]{48}$` |

- **Inne pola:** profile, userOverride
- **Minimalny przykład:**

```json
{"draftId":"<48 hex>"}
```

- **Typowe błędy:** —
- **Następny krok:** speediance_set_training_cycle_preference_reviews / speediance_prepare_training_cycle_draft.

### speediance_set_training_cycle_preference_reviews

- **Do czego / kiedy:** Potwierdzenia preferencji na poziomie cyklu.
- **Dostęp i zgoda:** zapis lokalny na tym komputerze (nie konto) — po jawnej zgodzie użytkownika
- **Wymagane:** `draftId`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| draftId | string | tak | wzorzec `^[a-f0-9]{48}$` |
| cyclePreferenceReviews | array | nie | maks. elementów 7 |
| blockProgressionOverrides | array | nie | min. elementów 1; maks. elementów 52 |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"draftId":"<48 hex>","cyclePreferenceReviews":[]}
```

- **Typowe błędy:** cyclePreferenceReviews ≤7.
- **Następny krok:** speediance_prepare_training_cycle_draft.

### speediance_prepare_training_cycle_draft

- **Do czego / kiedy:** Przygotuj sesje szkicu bramką naukową i serializacją.
- **Dostęp i zgoda:** podgląd: czyta katalog/konto i bramkę naukową, niczego nie zapisuje
- **Wymagane:** `draftId`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| draftId | string | tak | wzorzec `^[a-f0-9]{48}$` |
| cyclePreferenceReviews | array | nie | maks. elementów 7 |
| blockProgressionOverrides | array | nie | min. elementów 1; maks. elementów 52 |

- **Inne pola:** profile, userOverride
- **Minimalny przykład:**

```json
{"draftId":"<48 hex>"}
```

- **Typowe błędy:** Limit 64 MB.
- **Następny krok:** speediance_read_training_cycle_pages (wszystkie strony).

### speediance_bind_training_cycle_continuation

- **Do czego / kiedy:** Wznowienie oryginalnego cyklu po restarcie.
- **Dostęp i zgoda:** zapis lokalny na tym komputerze (nie konto) — po jawnej zgodzie użytkownika
- **Wymagane:** `draftId`, `originalDraftId`, `resumeIntent`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| draftId | string | tak | wzorzec `^[a-f0-9]{48}$` |
| originalDraftId | string | tak | wzorzec `^[a-f0-9]{48}$` |
| resumeIntent | string | tak | stała "resume-original-exact-cycle" |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"draftId":"<48 hex>","originalDraftId":"<48 hex>","resumeIntent":"resume-original-exact-cycle"}
```

- **Typowe błędy:** Dawki i daty muszą być identyczne.
- **Następny krok:** Ponownie odczytaj strony i oceń.

### speediance_read_training_cycle_page

- **Do czego / kiedy:** Odczyt jednej strony podglądu cyklu.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `draftId`, `index`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| draftId | string | tak | wzorzec `^[a-f0-9]{48}$` |
| index | integer | tak | min 0; max 999 |
| detail | string | nie | "compact" \| "full" |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"draftId":"<48 hex>","index":0,"detail":"compact"}
```

- **Typowe błędy:** index 0–999.
- **Następny krok:** gm_coach_review_training_cycle_draft.

### speediance_read_training_cycle_pages

- **Do czego / kiedy:** Bez draftId: lista szkiców; z draftId: 1–16 stron naraz.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** brak
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| draftId | string | nie | wzorzec `^([a-f0-9]{48}\|latest)$` |
| indexes | array | nie | min. elementów 1; maks. elementów 16 |
| maxOutputBytes | integer | nie | min 1024; max 1000000 |
| detail | string | nie | "compact" \| "full" |

- **Inne pola:** profile, includeStoredReview
- **Minimalny przykład:**

```json
{"draftId":"latest"}
```

- **Typowe błędy:** indexes 1–16; maxOutputBytes 1024–1000000.
- **Następny krok:** gm_coach_review_training_cycle_draft.

### gm_coach_review_training_cycle_draft

- **Do czego / kiedy:** Ocena naukowa pełnego szkicu cyklu.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `draftId`, `presentationDigest`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| draftId | string | tak | wzorzec `^[a-f0-9]{48}$` |
| presentationDigest | string | tak | wzorzec `^[a-f0-9]{64}$` |
| rationale | string | nie | min. znaków 1; maks. znaków 2000 |
| evidence | array | nie | min. elementów 0; maks. elementów 12 |
| decisionEvidence | array | nie | min. elementów 4; maks. elementów 4 |

- **Inne pola:** profile, prepareStyleReview, styleCompatibilityReview, reuseStoredReview, userOverride
- **Minimalny przykład:**

```json
{"draftId":"<48 hex>","presentationDigest":"<64 hex>","rationale":"...","evidence":[...],"decisionEvidence":[4 pozycje]}
```

- **Typowe błędy:** Najpierw pobierz wszystkie strony; decisionEvidence dokładnie 4.
- **Następny krok:** speediance_execute_training_cycle_draft.

### speediance_execute_training_cycle_draft

- **Do czego / kiedy:** Zapis szkicu cyklu (w tle, z dziennikiem).
- **Dostęp i zgoda:** ZAPIS do konta Speediance — tylko po pokazaniu dokładnego wyniku i wyraźnej zgodzie użytkownika (confirm=true)
- **Wymagane:** `draftId`, `presentationDigest`, `confirm`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| draftId | string | tak | wzorzec `^[a-f0-9]{48}$` |
| presentationDigest | string | tak | wzorzec `^[a-f0-9]{64}$` |
| researchReviewDigest | string | nie | wzorzec `^[a-f0-9]{64}$` |
| confirm | boolean | tak | stała true |
| approve_template_deletions | array | nie | maks. elementów 100 |

- **Inne pola:** profile, finishFromStoredReview, userOverride
- **Minimalny przykład:**

```json
{"profile":"default","draftId":"<48 hex>","presentationDigest":"<64 hex>","confirm":true}
```

- **Typowe błędy:** executionStatus=in-progress → sprawdzaj speediance_status_training_cycle_draft, nie ponawiaj zapisu.
- **Następny krok:** speediance_status_training_cycle_draft.

### speediance_status_training_cycle_draft

- **Do czego / kiedy:** Stan szkicu/zapisu.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `draftId`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| draftId | string | tak | wzorzec `^[a-f0-9]{48}$` |

- **Inne pola:** profile, userOverride
- **Minimalny przykład:**

```json
{"draftId":"<48 hex>"}
```

- **Typowe błędy:** —
- **Następny krok:** —

### speediance_cancel_training_cycle_draft

- **Do czego / kiedy:** Anuluj szkic (nie usuwa zapisanych treningów).
- **Dostęp i zgoda:** zapis lokalny na tym komputerze (nie konto) — po jawnej zgodzie użytkownika
- **Wymagane:** `draftId`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| draftId | string | tak | wzorzec `^[a-f0-9]{48}$` |

- **Inne pola:** profile, userOverride
- **Minimalny przykład:**

```json
{"draftId":"<48 hex>"}
```

- **Typowe błędy:** —
- **Następny krok:** —

## 9. Import i eksport

### gm_coach_inspect_reference_client_workout_json

- **Do czego / kiedy:** Sprawdź JSON eksportu klienta referencyjnego.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `workoutJson`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| workoutJson | object | tak | — |
| staticWeightUnit | string | nie | "kg" \| "lb" |

- **Minimalny przykład:**

```json
{"workoutJson":{}}
```

- **Typowe błędy:** weight -1 wymaga staticWeightUnit.
- **Następny krok:** gm_coach_complete_reference_client_candidate.

### gm_coach_complete_reference_client_candidate

- **Do czego / kiedy:** Uzupełnij kandydata klient referencyjny JSON faktami użytkownika.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony (katalog)
- **Wymagane:** `profile`, `workoutJson`, `sourceDigest`, `facts`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| workoutJson | object | tak | — |
| sourceDigest | string | tak | wzorzec `^[a-f0-9]{64}$` |
| staticWeightUnit | enum | nie | "kg" \| "lb" |
| facts | object | tak | — |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","workoutJson":{},"sourceDigest":"<64 hex>","facts":{"goal":"hipertrofia","warmup":{},"postWorkoutStretching":{},"supersetBlocks":[],"exercises":[]}}
```

- **Typowe błędy:** Bez domyślnych jednostek/RIR/stron — wszystko jawnie.
- **Następny krok:** speediance_preview_program.

### gm_coach_prepare_imported_rm_policy

- **Do czego / kiedy:** Polityka zachowania selektorów RM z importu.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `referenceClientJson`, `sidecar`, `migrationIntent`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| referenceClientJson | object | tak | — |
| sidecar | object | tak | — |
| migrationIntent | string | tak | stała "preserve-imported-rm-selectors" |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","referenceClientJson":{},"sidecar":{},"migrationIntent":"preserve-imported-rm-selectors"}
```

- **Typowe błędy:** migrationIntent stały.
- **Następny krok:** importedRmPolicyId w podglądzie.

### gm_coach_export_reference_client_workout_json

- **Do czego / kiedy:** Eksport planu do JSON klienta referencyjnego.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `normalizedPlan`, `staticWeightUnit`, `staticLoadProtocol`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| normalizedPlan | object | tak | — |
| staticWeightUnit | string | tak | "kg" \| "lb" |
| staticLoadProtocol | string | tak | "legacy-reference-client-wire-lb-get-kg" \| "account-unit-verbatim" |

- **Minimalny przykład:**

```json
{"normalizedPlan":{},"staticWeightUnit":"kg","staticLoadProtocol":"account-unit-verbatim"}
```

- **Typowe błędy:** exportIsUnilateral jawnie dla każdego ćwiczenia.
- **Następny krok:** —

### gm_coach_export_portable_source

- **Do czego / kiedy:** Eksport pary reference client JSON + sidecar.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `source`, `staticWeightUnit`, `staticLoadProtocol`, `exerciseMetadata`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| source | object | tak | — |
| staticWeightUnit | string | tak | "kg" \| "lb" |
| staticLoadProtocol | string | tak | "legacy-reference-client-wire-lb-get-kg" \| "account-unit-verbatim" |
| exerciseMetadata | array | tak | maks. elementów 30 |

- **Minimalny przykład:**

```json
{"source":{},"staticWeightUnit":"kg","staticLoadProtocol":"account-unit-verbatim","exerciseMetadata":[{"entryId":1001,"exportIsUnilateral":false}]}
```

- **Typowe błędy:** exerciseMetadata ≤30.
- **Następny krok:** —

### gm_coach_import_portable_source

- **Do czego / kiedy:** Sprawdź parę klient referencyjny JSON i sidecar.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** `referenceClientJson`, `sidecar`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| referenceClientJson | object | tak | — |
| sidecar | object | tak | — |

- **Minimalny przykład:**

```json
{"referenceClientJson":{},"sidecar":{}}
```

- **Typowe błędy:** writeReady=false — wymagany świeży podgląd naukowy.
- **Następny krok:** speediance_preview_program.

### gm_coach_export_shared_plan

- **Do czego / kiedy:** Plik udostępniania planu. **Udostępnij zapisany plan:** `speediance_get_saved_program` → `gm_coach_export_saved_portable_source` → tu `{"savedArtifact": <cały niezmieniony wynik>}` → wynik zawiera `artifactUri` i `importInstruction`. **Import w tym samym czacie:** `gm_coach_import_shared_plan` z `{"artifactUri": <artifactUri>}` (model w ChatGPT nie widzi treści zasobu; serwer trzyma plik 2 h, maks. 20). Innemu odbiorcy przekaż plik `gm-coach-plan.json` → `gm_coach_import_shared_plan` z `artifactText`. Hash pary jest weryfikowany; jednostka (np. kg), protokół i metadane ćwiczeń (`exportIsUnilateral`, `exportIsBarbell`) są wyliczane z artefaktu i katalogu.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** brak pól zawsze wymaganych — podaj savedArtifact albo komplet: source, staticWeightUnit, staticLoadProtocol, exerciseMetadata
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| savedArtifact | object | albo | wynik `gm_coach_export_saved_portable_source`; wyklucza pozostałe pola |
| source | object | albo | — |
| staticWeightUnit | string | z source | "kg" \| "lb" |
| staticLoadProtocol | string | z source | "legacy-reference-client-wire-lb-get-kg" \| "account-unit-verbatim" |
| exerciseMetadata | array | z source | maks. elementów 30 |

- **Minimalny przykład:**

```json
{"savedArtifact":{"status":"exported-retained-source","referenceClientJson":{},"sidecar":{}}}
{"source":{},"staticWeightUnit":"kg","staticLoadProtocol":"account-unit-verbatim","exerciseMetadata":[{"entryId":1001,"exportIsUnilateral":false}]}
```

- **Typowe błędy:** Bez danych konta. Nie rozbijaj artefaktu zapisanego planu na `source` (Additional property not allowed) — przekaż go jako `savedArtifact`. Artefakt `status:"unavailable"` → brak źródła do udostępnienia.
- **Następny krok:** —

### gm_coach_import_shared_plan

- **Do czego / kiedy:** Zweryfikuj udostępniony plik i zwróć plan. W czacie po `gm_coach_export_shared_plan` podaj `artifactUri` z jego wyniku; plik od innej osoby podaj jako `artifactText`.
- **Dostęp i zgoda:** odczyt lokalny, bez konta; zgoda niepotrzebna
- **Wymagane:** brak pól zawsze wymaganych — podaj dokładnie jedno: artifactText albo artifactUri
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| artifactText | string | albo | min. znaków 1; maks. znaków 1000000; treść pliku |
| artifactUri | string | albo | `gm-coach://shared-plans/...` z wyniku eksportu; ważne 2 h |

- **Inne pola:** candidate, reassessScience
- **Minimalny przykład:**

```json
{"artifactText":"<treść pliku>"}
{"artifactUri":"gm-coach://shared-plans/<sourceDigest>/gm-coach-plan.json"}
```

- **Typowe błędy:** artifactText ≤1 000 000 znaków; artifactUri wygasł/nieznany (2 h, restart serwera) → wygeneruj plik ponownie eksportem; historyczne badania nie są bieżącą akceptacją.
- **Następny krok:** speediance_preview_program z planForPreview.

### gm_coach_export_saved_portable_source

- **Do czego / kiedy:** Eksport zachowanego źródła zapisanego szablonu.
- **Dostęp i zgoda:** odczyt konta Speediance (sieć); profil musi być połączony (tylko odczyt)
- **Wymagane:** `profile`, `program_code`, `base_digest`
- **Argumenty, limity i wartości:**

| Pole | Typ | Wymagane | Limity / wartości |
|---|---|---|---|
| program_code | string | tak | wzorzec `^[A-Za-z0-9._-]{1,128}$` |
| base_digest | string | tak | wzorzec `^[a-f0-9]{64}$` |

- **Inne pola:** profile
- **Minimalny przykład:**

```json
{"profile":"default","program_code":"ABC123","base_digest":"<64 hex>"}
```

- **Typowe błędy:** Stare rekordy bez źródła → unavailable (nie rekonstruuj).
- **Następny krok:** gm_coach_export_shared_plan.

