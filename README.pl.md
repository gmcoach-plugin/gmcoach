<p align="center">
  <img src="docs/logo.png" alt="Logo GM Coach" width="160">
</p>

<h1 align="center">GM Coach</h1>

<p align="center">
  Plugin trenera AI dla Speediance Gym Monster. Planuje trening siłowy w Codex, ChatGPT i Claude na podstawie historii Twoich treningów i aktualnych badań.
</p>

<p align="center">
  <a href="README.md">English</a> · <b>Polski</b>
</p>

<p align="center">
  <a href="#instalacja-jednym-poleceniem"><b>Instalacja jednym poleceniem (Codex / Claude)</b></a>
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
- **Cykle wielotygodniowe:** planuje progresję i deload tydzień po tygodniu, z datami, i zapisuje cały cykl po jednym zatwierdzeniu.
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
- **Przerwany zapis:** jeśli zapis zostanie przerwany, GM Coach przed ponowną próbą sprawdza konto, co chroni przed zdublowaniem treningu. Cykl wielotygodniowy jest kontynuowany od miejsca przerwania.
- **Pamięć lokalna:** zapamiętuje informacje, o które poprosisz, na przykład sprzęt albo preferencje, i usuwa je na Twoje życzenie.
- **Lokalnie i prywatnie:** działa na Twoim komputerze, a hasło Speediance zostaje w systemowym magazynie haseł.

## Jak to działa

GM Coach przechodzi przez kolejne kroki i pokazuje postęp podczas przygotowywania planu:

<p align="center">
  <img src="docs/gm-coach-plan-steps.png" alt="Kroki przygotowania planu w GM Coach: profil i audyt wywiadu, historia i kalendarz, ćwiczenia i dawki, ocena naukowa i podgląd, plan do akceptacji" width="330">
</p>

Gdy plan jest gotowy, GM Coach pokazuje cały trening, wyjaśnia swoje wybory i przed zapisem czeka na Twoją zgodę:

<p align="center">
  <img src="docs/gm-coach-plan-approval.png" alt="GM Coach pokazuje kompletny sobotni trening z trybem Eccentric, gotowy do zatwierdzenia" width="640">
</p>

## Nowości w 1.0.693

- **Dropsety są teraz zapisywane w planie:** dropset to kolejne serie tego samego ćwiczenia z niższym %1RM lub kg i minimalną przerwą (np. 70% → 65% → 55%), oznaczone w podglądzie „Drop set”.
- **Zasady:** dropsety tylko przy hipertrofii, maksymalnie jeden na trening, można je wyłączyć.
- **Zapisane plany:** odczyt zapisanego planu pokazuje % i kg przy każdej serii.
## Nowości w 1.0.692

- **Instalacja jednym poleceniem** w Codex i Claude (zobacz [Instalacja jednym poleceniem](#instalacja-jednym-poleceniem)).
- **%1RM w Smart RM:** procent jest dobierany automatycznie do celu, widoczny przy każdej serii, może się różnić między seriami jednego ćwiczenia i jest zachowywany przy imporcie i eksporcie.
- **Rozgrzewka:** Smart RM od 50% 1RM; lżejsza rozgrzewka używa Customize.
- **Techniki:** rozgrzewka z ciężarem, superserie i dropsety są dodawane tylko wtedy, gdy pomagają w celu lub czasie.
- **Dane zdrowotne:** GM Coach raz pyta, czy użyć Twoich danych zdrowotnych Speediance; raport zdrowia jest poprawiony (pomiary ciała, sen z fazami, tętno nocne, wiek biologiczny).
- **Tryby oporu:** wskazówka przy wyborze trybów Eccentric i Chain.
- **Szybsze tworzenie planów.**
- **Aktualizatory:** mała paczka aktualizuje wtyczkę bez ponownego pobierania całości.

## Jak działa progresja

GM Coach planuje progresję tydzień po tygodniu na podstawie Twojej historii i sprawdza ją z badaniami przed zapisem.

- **Z tygodnia na tydzień:** każdy tydzień może zmieniać powtórzenia, serie, obciążenie lub %1RM. Plan pokazuje każdą zmianę i porównuje tydzień z poprzednim tygodniem roboczym.
- **RIR (zapas powtórzeń):** planowana liczba powtórzeń, które zostawiasz w zapasie, od 0 do 5. Ustawiany osobno od powtórzeń, nie dotyczy serii czasowych.
- **Automatyczny %1RM w Smart RM:** procent wynika z powtórzeń plus RIR (np. 10 powtórzeń przy RIR 2 daje 70%) i mieści się w zakresie presetu: Gain Muscle 50–90%, Stamina 50–70%, Strength 50–90%. Dla serii można ustawić inny procent, z krótkim uzasadnieniem.
- **Deload:** tydzień deloadu musi zmniejszać planowaną dawkę względem tygodnia roboczego, a jego automatyczny %1RM nigdy nie jest wyższy niż w tygodniu bazowym. Termin dobierany jest indywidualnie, nie sztywno według kalendarza.
- **Twoja historia:** obciążenia i serie pochodzą z wykonanych treningów, odczytywanych tylko za Twoją zgodą. Bez historii GM Coach pyta zamiast zgadywać.
- **Dane zdrowotne (opcjonalnie):** GM Coach raz w rozmowie pyta, czy użyć Twoich danych zdrowotnych Speediance. Po odmowie planuje z historii i Twojej samooceny.
- **Bramka naukowa:** każdy prawdziwy plan przechodzi sprawdzenie z badaniami przed zapisem, chyba że wyłączysz je dla danego planu.

## Obsługiwane aplikacje

| Aplikacja | System | Instrukcja instalacji |
|---|---|---|
| Codex (opcjonalnie ChatGPT przez bezpieczny tunel) | Windows; macOS i Linux eksperymentalnie | [Polski](installer/codex/README-INSTALACJA.md) · [English](installer/codex/README-INSTALL-EN.md) |
| Claude (aplikacja i Claude Code) | Windows; macOS i Linux eksperymentalnie | [Polski](installer/claude/README-CLAUDE.md) · [English](installer/claude/README-CLAUDE-EN.md) |

## Instalacja jednym poleceniem

Wymaga [Node.js 24](https://nodejs.org/). Uruchom polecenia dla swojej aplikacji, potem otwórz nowy czat.

**Codex**

```
codex plugin marketplace add gmcoach-plugin/gmcoach
codex plugin add gm-coach@gm-coach
```

**Claude**

```
claude plugin marketplace add gmcoach-plugin/gmcoach
claude plugin install gm-coach@gm-coach
```

Przy pierwszym uruchomieniu GM Coach pobiera pliki pomocnicze (sprawdzane sumą SHA-256) do folderu użytkownika. Tunel nie jest potrzebny; służy tylko do ChatGPT.
## Szybki start

1. Pobierz instalator dla swojej aplikacji z [najnowszego wydania](https://github.com/gmcoach-plugin/gmcoach/releases/latest).
2. Opcjonalnie porównaj sumę SHA-256 pliku z sumą widoczną w wydaniu.
3. Rozpakuj całe archiwum i uruchom `START-WINDOWS.cmd` (Codex) albo `START-CLAUDE-WINDOWS.cmd` (Claude).
4. Otwórz nowy czat i napisz: *„GM Coach, pomóż mi połączyć moje konto Speediance”.*

Potrzebujesz konta Speediance i urządzenia Gym Monster. Instalację na macOS i Linux, aktualizację oraz odinstalowanie opisuje instrukcja instalacji.

**Urządzenia:** Sprawdzone na GM1 i GM2. GM3: wersja testowa, niesprawdzona.

## Aktualizacja

Użyj aktualizatora dla swojej aplikacji: [Codex](installer/updater/codex/README-AKTUALIZACJA.md) · [Claude](installer/updater/claude/README-CLAUDE-AKTUALIZACJA.md) (wszystkie pliki w [installer/updater](installer/updater)). Aktualizator to mała paczka, nie pobiera wszystkiego od nowa. Przetestowany na Windows; macOS i Linux są eksperymentalne.

## Instalacja ręczna (dla zaawansowanych)

Chcesz zainstalować GM Coach jako zwykły plugin bez instalatora? Zobacz [instalację ręczną](plugin/INSTALL.pl.md).

## Prywatność i bezpieczeństwo

- Hasło Speediance jest przechowywane wyłącznie w systemowym magazynie poświadczeń: Menedżerze poświadczeń Windows, Pęku kluczy macOS albo Secret Service na Linuksie. Nie podawaj go w czacie.
- Plugin odczytuje historię i zmienia dane na koncie tylko po Twojej zgodzie w rozmowie.
- Jeśli instalator pobiera zależności, robi to z oficjalnych źródeł i sprawdza ich sumy kontrolne.

## Zgłaszanie błędów i propozycji

Skorzystaj z [GitHub Issues](https://github.com/gmcoach-plugin/gmcoach/issues/new/choose). Podaj wersję pluginu z lokalnej diagnostyki i nie wklejaj haseł, adresów e-mail, tokenów ani kluczy.

## Wsparcie projektu

GM Coach jest darmowy. Jeśli pomaga Ci w treningu, możesz [wesprzeć go na Ko-fi](https://ko-fi.com/gmcoach).

## Licencja

Projekt jest udostępniony na [licencji MIT](LICENSE).

## Zastrzeżenia

GM Coach to niezależny projekt, niepowiązany ze Speediance, nieautoryzowany ani niesponsorowany przez tę firmę. Gym Monster i Speediance są znakami towarowymi ich właścicieli. Sugestie treningowe nie zastępują porady wykwalifikowanego trenera ani lekarza.
