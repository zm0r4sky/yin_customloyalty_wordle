# Przewodnik Implementacji Testów w YIN Wordle PWA z Playwright

Wdrożyliśmy nowoczesną architekturę testową łączącą **testy jednostkowe i integracyjne (Unit/Integration Tests)** logiki biznesowej z pełnymi **testami End-to-End (E2E)** interfejsu użytkownika przy użyciu jednego z najpotężniejszych narzędzi na rynku – **Playwright**.

---

## 🏗️ Architektura Testów

Testy zostały zorganizowane w logiczny i modułowy sposób w katalogu głównym projektu:

```text
yin_customloyalty_wordle/
├── pwa_mvp/                  # Kod źródłowy aplikacji (HTML, CSS, JS, SW)
├── tests/
│   ├── unit/                 # Testy jednostkowe logiki silnika
│   │   └── mockApi.spec.js   # Testy klasy WordleMockBackend
│   └── e2e/                  # Testy interfejsu użytkownika (flow)
│       └── wordle.spec.js    # Testy zachowań UI i scenariuszy przejścia
├── package.json              # Skrypty i zależności projektu
└── playwright.config.js      # Centralna konfiguracja Playwright
```

---

## 💎 Supermoc: Testy Jednostkowe Bezpośrednio w Przeglądarce!

W tradycyjnym podejściu testowanie klas front-endowych (takich jak `WordleMockBackend`), które opierają się na obiektach przeglądarkowych takich jak `window`, `localStorage` czy `Promise` opóźniających symulację sieci, wymaga tworzenia skomplikowanych środowisk mockujących (np. JSDOM czy paczek mock-localstorage).

**W Playwright rozwiązaliśmy to o wiele prościej i pewniej:**
1. Playwright uruchamia **czystą kartę natywnej przeglądarki** (`about:blank`).
2. Wstrzykuje kod pliku `mockApi.js` jako skrypt inicjalizacyjny (`addInitScript`).
3. Wykonuje asercje bezpośrednio wewnątrz przeglądarki przy użyciu `page.evaluate()`.

Dzięki temu testujesz **dokładnie ten sam kod, w dokładnie takim samym środowisku przeglądarkowym**, w jakim uruchomi go końcowy użytkownik, bez konieczności pisania ani jednej linijki skomplikowanych mocków!

---

## 🛠️ Podgląd Wdrożonych Testów

### 1. Testy Jednostkowe (`tests/unit/mockApi.spec.js`)
Testują kompletną logikę biznesową silnika Wordle:
* **Inicjalizacja:** Sprawdzenie domyślnych parametrów (Słowo Dnia, liczba prób).
* **Rozgrywka i Walidacja:** Prawidłowe oznaczanie liter w algorytmie Wordle (zielony = `correct`, żółty = `present`, szary = `absent`).
* **Zarządzanie Stanem:** Sprawdzenie mechanizmu blokad, wyczerpywania limitu prób (`lost_pending_ad`) oraz wygranej (`won_pending_ad`).
* **Punkty i Streak:** Testowanie algorytmu punktacji oraz premii za serię zwycięstw.

### 2. Testy End-to-End (`tests/e2e/wordle.spec.js`)
Symulują rzeczywistego użytkownika i testują całe drzewo DOM oraz zdarzenia:
* **Generowanie UI:** Poprawność renderowania siatki 6x5 oraz klawiatury.
* **Interakcje Klawiatury:** Wprowadzanie znaków klawiaturą wirtualną (kliknięcia) oraz fizyczną (zdarzenia `keydown`).
* **Obsługa Błędów:** Wyświetlanie powiadomień Toast („Za krótkie słowo”) oraz animacji potrząsania wierszem (`shake`).
* **Brama Reklamowa (Ad Gateway):** Testowanie pełnego cyklu po wygranej – blokada ekranu reklamą sponsorowaną, odliczanie licznika, odblokowanie przycisku nagrody i aktualizacja punktacji w nagłówku.
* **Offline Detection:** Symulacja braku internetu i weryfikacja pojawienia się stosownego paska ostrzegawczego.

---

## 🚀 Jak Zainstalować i Uruchomić Testy

Aby uruchomić nowo skonfigurowany pakiet testowy na swoim komputerze, wykonaj następujące kroki w terminalu systemu Windows (PowerShell/CMD):

### Krok 1: Instalacja Zależności
Zainstaluj wymagane pakiety deweloperskie (`@playwright/test` oraz lekki serwer `http-server` do serwowania PWA):
```powershell
npm install
```

### Krok 2: Instalacja Przeglądarek Playwright
Pobierz zoptymalizowane binaria przeglądarek wymagane przez Playwright:
```powershell
npx playwright install chromium
```

### Krok 3: Uruchomienie Testów
Uruchom cały zestaw testów w tle (w trybie headless):
```powershell
npm test
```

---

## 🌟 Zaawansowane Narzędzia Deweloperskie Playwright

### 📊 Interaktywny Tryb UI (UI Mode)
Najwygodniejszy sposób na pisanie i debugowanie testów. Otwiera graficzny interfejs, w którym widzisz historię uruchomień, stan DOM w każdej milisekundzie, logi konsoli przeglądarki oraz możesz krok po kroku prześledzić wykonanie kodu:
```powershell
npm run test:ui
```

### 🔍 Generator Testów (Codegen)
Jeśli chcesz szybko wygenerować nowy scenariusz testowy E2E, możesz uruchomić wbudowany rejestrator. Klikaj po prostu elementy na ekranie, a Playwright automatycznie zapisze gotowy kod testu w JavaScript:
```powershell
npx playwright codegen http://localhost:8080
```

---

> [!TIP]
> **Automatyczne serwowanie aplikacji:**
> Playwright został skonfigurowany tak, że przy każdym uruchomieniu testów automatycznie podnosi serwer deweloperski pod adresem `http://localhost:8080` (korzystając z biblioteki `http-server`) i zamyka go po zakończeniu testów. Nie musisz uruchamiać serwera ręcznie przed włączeniem testów!
