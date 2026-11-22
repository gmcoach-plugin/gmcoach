## 3. Analiza historii i ocena gotowości treningowej

- Przed zmianą programu podsumuj typową częstotliwość, wykonywane ćwiczenia, dostępne serie/powtórzenia/ciężary, długość sesji, progres, pominięte sesje i możliwą objętość tygodniową na grupę mięśniową. Pokaż zakres i pewność wniosków, jeśli dane są niekompletne.
- Porównuj podobne ćwiczenia, konfiguracje i tryby. Zmiana trybu, linki lub ruchu może zmienić odczuwany opór i utrudniać porównanie ciężaru; oznacz zmianę zamiast nazywać ją automatycznie progresją.
- Dla `speediance_get_session_detail` przepisz razem `training_id`, `type` i **datę wykonania** z tego samego wiersza historii. Data przyszłej rezerwacji lub data szablonu nie jest datą ukończonej sesji, nawet gdy nazwa i kod programu się zgadzają. Przed wywołaniem sprawdź tę trójkę w zredukowanym rejestrze; nie zgaduj daty z kalendarza.
- W wywiadzie zapytaj użytkownika o powód utrzymującego się spadku wyników, nietypowe zmęczenie, ból, sen, stres i trening poza maszyną. Pojedynczy słabszy trening nie jest diagnozą przetrenowania ani automatycznym sygnałem do deloadu; używaj tych danych do ostrożnej oceny gotowości, nie do diagnozy medycznej.
- Jeżeli historia nie jest podłączona, poproś o prosty opis obecnego planu lub krótką listę ostatnich sesji. Nie blokuj sensownego planu, jeśli użytkownik nie ma dziennika.

### Brakujący wykonany trening — ogólna diagnostyka

Brak wpisu w odczytanym dashboardzie nie dowodzi utraty ani niewykonania sesji. Najpierw ustal dokładną datę i wskazany profil, zakres dostępnego odczytu oraz czy użytkownik widzi tę sesję w natywnej historii maszyny lub aplikacji Speediance. Jeśli istnieje tam zapis, rozróżnij problem udostępniania/synchronizacji od braku zapisu; jeśli nigdzie go nie ma, przyczyna pozostaje nieustalona. Sprawdzenie danych konta lub historii przez MCP wymaga właściwego upoważnienia i ograniczonego zakresu; ten poradnik nie udziela zgody na odczyty.

Zaproponuj użytkownikowi sprawdzenie właściwego profilu, zapisania podsumowania i łączności maszyny/aplikacji. Nie uruchamiaj automatycznej synchronizacji, resetów, ponownego logowania, usuwania połączeń ani powtórnych zapisów. Nie rekonstruuj wykonanych ciężarów, powtórzeń lub czasu z recepty planu. Nie obiecuj odzyskania niezapisanej sesji; przy utrzymującym się problemie można wskazać kontakt ze wsparciem producenta.

Źródło: [Speediance, Why Some Workouts Don't Appear in Your Connected Fitness Dashboard, 2026-06-05](https://www.speediance.com/blogs/smart-fitness-connected-ecosystem/why-some-workouts-don-t-appear-in-your-connected-fitness-dashboard). To ogólny poradnik connected-fitness, częściowo oparty na przykładach innych platform, a nie kontrakt Gym Monster ani naszego API. Nie przenoś jego przykładowych opóźnień, progów zapisu, pause/resume ani zakresu danych ROM/tension na Gym Monster lub MCP. Dostępność danych potwierdza rzeczywisty odczyt, nie ten artykuł.
