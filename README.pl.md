<p align="center">
  <img src="docs/logo.png" alt="Logo GM Coach" width="160">
</p>

<h1 align="center">GM Coach</h1>

<p align="center">
  Lokalny plugin trenera dla Codex, ChatGPT i Claude. Planuje trening siłowy na Gym Monster na podstawie historii Twoich treningów i aktualnych badań.
</p>

<p align="center">
  <a href="README.md">English</a> · <b>Polski</b>
</p>

<p align="center">
  <a href="https://github.com/gmcoach-plugin/gmcoach/releases/latest"><img src="https://img.shields.io/github/v/release/gmcoach-plugin/gmcoach?label=wydanie" alt="Najnowsze wydanie"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/gmcoach-plugin/gmcoach?label=licencja" alt="Licencja MIT"></a>
  <a href="https://ko-fi.com/gmcoach"><img src="https://img.shields.io/badge/Ko--fi-wesprzyj-FF5E5B?logo=kofi&logoColor=white" alt="Wesprzyj na Ko-fi"></a>
</p>

<p align="center">
  <img src="docs/gm-coach-claude-workout.png" alt="GM Coach w Claude pokazuje jutrzejszy trening na Gym Monster" width="640">
</p>

## Funkcje

### Planowanie

- **Plany treningowe:** tworzy programy Gym Monster: siłowe, czasowe i cardio, wyłącznie z ćwiczeń i akcesoriów, które potwierdzisz, razem z dopasowaną rozgrzewką i rozciąganiem.
- **Cykle wielotygodniowe:** planuje progresję i deload tydzień po tygodniu, z datami, i zapisuje cały cykl po jednym zatwierdzeniu. Przerwany zapis można bezpiecznie dokończyć.
- **Smart RM i tryby oporu:** korzysta z presetów Gain Muscle, Stamina i Strength oraz trybów Standard, Chain i Eccentric albo ze stałego ciężaru dobranego na podstawie Twojego 1RM.
- **Edycja zapisanych treningów:** zmienia przerwy, tryb oporu, ciężar lub kolejność ćwiczeń i przed zapisem pokazuje różnice.
- **Kalendarz:** odczytuje kalendarz Speediance i dodaje zapisane treningi do wybranych dni.
- **Czas sesji:** szacuje długość treningu i dopasowuje plan do czasu, którym dysponujesz.

### Analiza i regeneracja

- **Historia treningów:** odczytuje ukończone sesje z seriami, obciążeniami, tętnem, danymi z wioślarza i statystykami okresu.
- **Porównanie sesji:** porównuje dwie ukończone sesje seria po serii.
- **Dane o regeneracji:** odczytuje raporty zdrowotne Speediance, takie jak sen, HRV, zmęczenie i obciążenie mięśni, za Twoją zgodą.

### Indywidualne prowadzenie

- **Profil treningowy:** krótki wywiad zapisuje lokalnie Twoje cele, preferencje i ograniczenia.
- **Plany z uwzględnieniem kontuzji:** bierze pod uwagę zgłoszone ograniczenia ruchowe.
- **Sprzęt:** sprawdza Twoje akcesoria i wymagania każdego ćwiczenia oraz przeszukuje katalog ćwiczeń Gym Monster.
- **Decyzje oparte na badaniach:** przeszukuje PubMed i łączy decyzje w planie z prawdziwymi źródłami.

### Więcej

- **Oficjalne treści:** przegląda oficjalne treningi i programy Speediance.
- **Udostępnianie i import planów:** eksportuje plan lub zapisany trening do pliku oraz importuje udostępnione plany i treningi z plików JSON. Przed zapisem sprawdza każde ćwiczenie i dawkę.
- **Szybki trening testowy:** tworzy jednorazową sesję testową, żeby wypróbować ćwiczenie lub ustawienie.
- **Kilka kont:** obsługuje kilka profili Speediance na jednym komputerze.
- **Limit szablonów:** wykrywa pełną listę szablonów i proponuje usunięcie nieużywanych, wyłącznie za Twoją zgodą.
- **Diagnostyka:** sprawdza wersję pluginu i połączenie z kontem Speediance.

### Bezpieczeństwo i prywatność

- **Bezpieczny zapis:** pokazuje pełny podgląd planu i zapisuje go na koncie dopiero po Twoim wyraźnym potwierdzeniu.
- **Przerwany zapis:** jeśli zapis zostanie przerwany, GM Coach przed ponowną próbą sprawdza konto, więc trening nigdy nie zapisze się dwa razy. Cykl wielotygodniowy jest kontynuowany od miejsca przerwania.
- **Pamięć lokalna:** zapamiętuje fakty, które każesz mu zachować, na przykład sprzęt albo preferencje, i usuwa je na Twoją prośbę.
- **Lokalnie i prywatnie:** działa na Twoim komputerze, a hasło Speediance zostaje w systemowym magazynie haseł.

### Jak powstaje nowy plan

GM Coach przechodzi przez kolejne kroki i pokazuje postęp podczas przygotowywania planu:

<p align="center">
  <img src="docs/gm-coach-plan-steps.png" alt="Kroki przygotowania planu w GM Coach: profil i audyt wywiadu, historia i kalendarz, ćwiczenia i dawki, ocena naukowa i podgląd, plan do akceptacji" width="330">
</p>

## Obsługiwane aplikacje

| Aplikacja | System | Instrukcja instalacji |
|---|---|---|
| Codex (opcjonalnie ChatGPT przez bezpieczny tunel) | Windows; macOS i Linux eksperymentalnie | [Polski](installer/codex/README-INSTALACJA.md) · [English](installer/codex/README-INSTALL-EN.md) |
| Claude (aplikacja i Claude Code) | Windows; macOS i Linux eksperymentalnie | [Polski](installer/claude/README-CLAUDE.md) · [English](installer/claude/README-CLAUDE-EN.md) |

## Szybki start

1. Pobierz instalator dla swojej aplikacji z [najnowszego wydania](https://github.com/gmcoach-plugin/gmcoach/releases/latest).
2. Porównaj sumę kontrolną pliku z plikiem `.sha256`.
3. Rozpakuj całe archiwum i uruchom `START-WINDOWS.cmd` (Codex) albo `START-CLAUDE-WINDOWS.cmd` (Claude).
4. Otwórz nowy czat i napisz: *„GM Coach, pomóż mi połączyć moje konto Speediance”.*

Potrzebujesz konta Speediance i urządzenia Gym Monster. Instalację na macOS i Linux, aktualizację oraz odinstalowanie opisuje instrukcja instalacji.

**Sprawdzone urządzenia:** Gym Monster **GM1** i **GM2**.

## Prywatność i bezpieczeństwo

- Hasło Speediance jest przechowywane wyłącznie w systemowym magazynie poświadczeń: Menedżerze poświadczeń Windows, Pęku kluczy macOS albo Secret Service na Linuksie. Nie podawaj go w czacie.
- Plugin odczytuje historię i zmienia dane na koncie tylko po Twojej zgodzie w rozmowie.
- Instalatory pobierają zależności z oficjalnych źródeł i sprawdzają ich sumy kontrolne.

## Zgłaszanie błędów i propozycji

Skorzystaj z [GitHub Issues](https://github.com/gmcoach-plugin/gmcoach/issues/new/choose). Podaj wersję pluginu z lokalnej diagnostyki i nie wklejaj haseł, adresów e-mail, tokenów ani kluczy.

## Wsparcie projektu

GM Coach jest darmowy. Jeśli pomaga Ci w treningu, możesz [wesprzeć go na Ko-fi](https://ko-fi.com/gmcoach).

## Licencja

Projekt jest udostępniony na [licencji MIT](LICENSE).

## Zastrzeżenia

GM Coach to niezależny projekt, niepowiązany ze Speediance, nieautoryzowany ani niesponsorowany przez tę firmę. Gym Monster i Speediance są znakami towarowymi ich właścicieli. Sugestie treningowe nie zastępują porady wykwalifikowanego trenera ani lekarza.
