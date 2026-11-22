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

## Funkcje

- **Historia treningów:** odczytuje ukończone sesje Speediance razem z seriami, obciążeniami i szczegółami.
- **Plany treningowe:** tworzy i edytuje programy Gym Monster: siłowe, czasowe i cardio, wyłącznie z ćwiczeń i akcesoriów, które potwierdzisz.
- **Trening oparty na badaniach:** przed zaproponowaniem planu sprawdza jego założenia w aktualnych badaniach.
- **Bezpieczny zapis:** pokazuje pełny podgląd planu i zapisuje go na koncie dopiero po Twoim wyraźnym potwierdzeniu.
- **Lokalnie i prywatnie:** działa na Twoim komputerze, a hasło Speediance zostaje w systemowym magazynie haseł.

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
