/**
 * Mock API - Symulacja Backend PHP dla YIN Wordle PWA
 * Source of Truth (Wszystkie walidacje odbywają się tutaj)
 */
// === KONFIGURACJA ZEWNĘTRZNEGO BACKENDU (PHP) ===
export const PRODUCTION_API_URL = "https://bcsnagradza.pl/modules/yin_customloyalty_wordle/api.php";
export class WordleMockBackend {
    dailyWord;
    dictionary;
    maxAttempts;
    db;
    idCustomer = 0;
    idPlayer = 0;
    constructor() {
        this.dailyWord = "SKLEP"; // Słowo Dnia (Hardcoded dla MVP)
        this.idCustomer = 0;
        this.idPlayer = 0;
        if (typeof window !== 'undefined') {
            // 1. Sprawdzamy czy PrestaShop wstrzyknął zalogowanego id_customer
            const psCustomerId = window.id_customer;
            if (typeof psCustomerId !== 'undefined' && parseInt(psCustomerId) > 0) {
                this.idCustomer = parseInt(psCustomerId);
            }
            // 2. Pobieramy id_player z LocalStorage (szczególnie ważne dla gości, ale przydatne dla każdego)
            const savedIdPlayer = localStorage.getItem('yin_wordle_id_player');
            if (savedIdPlayer) {
                this.idPlayer = parseInt(savedIdPlayer);
            }
        }
        // Duży słownik testowy dla słów o długościach od 5 do 12 liter (wyłącznie zweryfikowane polskie słowa)
        this.dictionary = [
            // 5 liter
            "SKLEP", "EKRAN", "OBRAZ", "KABEL", "WIDEO", "AUDIO", "RUTER", "POLAK", "DOBRO", "SŁOWO",
            "ŻÓŁTY", "ALARM", "DRZWI", "ZAMEK", "PILOT", "KARTA", "KODER", "MYSZA", "PŁYTA", "MASKA",
            "PORTY", "DYSKI", "PASEK", "RAMKA", "KANAŁ", "KLUCZ", "TAJNE", "FOKUS", "BŁYSK", "JASNY",
            // 6 liter
            "KAMERA", "PORTAL", "MYSZKA", "PULPIT", "KOSZYK", "SERWER", "WENTYL", "SŁUPKI", "CHMURA", "BATERI",
            "MODUŁY", "PUNKTU", "GRAFIK", "PĘTLA", "PROSTE", "BRAMKA", "KANAŁY", "PRODUK", "PUNKTX", "KABLEX",
            // 7 liter
            "MONITOR", "PROJEKT", "REKLAMA", "PROGRAM", "TELEFON", "GABINET", "TABLICA", "KLAWISZ", "GŁOŚNIK",
            "INTERFE", "ZASILAN", "KONTROL", "WEJŚCIE", "WYJŚCIE", "SYSTEMY", "BRAMKAA", "PROCESY", "SŁOWNIK",
            // 8 liter
            "ZASILACZ", "INTERNET", "PROGRAMY", "PŁATNOŚĆ", "ROZPRAWY", "PROCESOR", "DRUKARKA", "SŁOWNIKI", "AKTYWACJ",
            "KABLOWKA", "MODERACJ", "INSTALAC", "SZABLONY", "GAMINGOW", "LOGOWANI", "OPERATOR", "DETEKCJA",
            // 9 liter
            "ŁADOWARKA", "KOMPUTERY", "LOGOWANIE", "KONTROLER", "NAGRANIA", "TRANSKRYP", "REGULACJA", "DYSTRYBUC",
            "ZABEZPIEC", "KLIKANIE", "PUNKTACJA", "URZĄDZENI", "CERYFIKAT", "MIGRACYJN", "EKOSYSTEM", "CZYTNIKII",
            // 10 liter
            "CERTYFIKAT", "AKUMULATOR", "SUBKRYPCJA", "INTEGRACJA", "KOLOROWANI", "RESTRYKCJA", "KOMUNIKACJ",
            "GWARANCJAA", "LOKALIZACJ", "ZABEZPIECZ", "AUDYTOWANI", "KOMPILATOR", "PRODUCENTI", "MODEROWANI",
            // 11 liter
            "PRODUKTYWNY", "LOGISTYCZNY", "INFORMATYKA", "ELEKTRONIKA", "ZABEZPIECZA", "KLIMATYZACJ",
            "REJESTRACJA", "WERYFIKACJA", "AUDYTOWANIE", "MIGRACYJNYY", "KODOWANIEEB", "UŻYTKOWNIKK",
            // 12 liter
            "KLIMATYZACJA", "WYSZUKIWARKA", "ZABEZPIECZEŃ", "UŻYTKOWNIKÓW", "MODYFIKACJAA", "DOKUMENTACJA",
            "KONFIGURACJA", "PRODUKTYWNOŚ"
        ];
        this.maxAttempts = 6;
        // Symulowana baza danych w LocalStorage
        let stored = null;
        if (typeof localStorage !== 'undefined') {
            stored = localStorage.getItem('yin_wordle_db');
        }
        this.db = stored ? JSON.parse(stored) : {
            sessions: {},
            user: { points: 0, streak: 0, daily_won_count: 0, free_won_count: 0, free_played_count: 0 }
        };
        // Upewnij się, że liczniki są zainicjalizowane w obiekcie
        if (this.db.user) {
            if (typeof this.db.user.daily_won_count === 'undefined')
                this.db.user.daily_won_count = 0;
            if (typeof this.db.user.free_won_count === 'undefined')
                this.db.user.free_won_count = 0;
            if (typeof this.db.user.free_played_count === 'undefined')
                this.db.user.free_played_count = 0;
        }
    }
    _saveDb() {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('yin_wordle_db', JSON.stringify(this.db));
        }
    }
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    _normalize(word) {
        return word.toUpperCase();
    }
    _evaluateGuess(word, targetWord) {
        let result = [];
        let targetChars = targetWord.split('');
        let guessChars = word.split('');
        // Pass 1: Znajdź zielone (correct)
        for (let i = 0; i < targetWord.length; i++) {
            if (guessChars[i] === targetChars[i]) {
                result.push({ char: guessChars[i], status: "correct" });
                targetChars[i] = null;
            }
            else {
                result.push({ char: guessChars[i], status: null });
            }
        }
        // Pass 2: Znajdź żółte (present)
        for (let i = 0; i < targetWord.length; i++) {
            if (result[i].status !== "correct") {
                let targetIndex = targetChars.indexOf(guessChars[i]);
                if (targetIndex > -1) {
                    result[i].status = "present";
                    targetChars[targetIndex] = null;
                }
                else {
                    result[i].status = "absent";
                }
            }
        }
        return result;
    }
    isRemoteActive() {
        if (!PRODUCTION_API_URL)
            return false;
        // Zabezpieczenie przed testami jednostkowymi Vitest (zawsze lokalne/offline)
        const g = globalThis;
        if (typeof g.process !== 'undefined' && g.process.env && (g.process.env.VITEST || g.process.env.NODE_ENV === 'test')) {
            return false;
        }
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            // Wyłączamy zdalne API tylko dla automatycznych testów Playwright (port 8090) lub przy jawnej prośbie (?api=false / ?mock=true)
            if (window.location.port === '8090' || params.get('api') === 'false' || params.get('mock') === 'true') {
                return false;
            }
        }
        return true;
    }
    // [POST] /game/start
    async startGame(type = 'daily', preferredLength = 5) {
        if (this.isRemoteActive()) {
            const key = `yin_wordle_game_token_${type}_${preferredLength}`;
            const savedGameToken = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
            try {
                const response = await fetch(PRODUCTION_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'startGame',
                        game_type: type,
                        length: preferredLength,
                        id_customer: this.idCustomer,
                        id_player: this.idPlayer,
                        game_token: savedGameToken || undefined
                    })
                });
                const data = await response.json();
                if (data.status === 'error') {
                    throw new Error(data.message || 'Błąd inicjalizacji gry na serwerze.');
                }
                if (data.id_player && typeof localStorage !== 'undefined') {
                    this.idPlayer = data.id_player;
                    localStorage.setItem('yin_wordle_id_player', data.id_player.toString());
                }
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(key, data.game_token);
                }
                return {
                    status: "success",
                    game_token: data.game_token,
                    word_length: data.length,
                    max_attempts: data.max_attempts || 6,
                    attempts_left: data.attempts_left,
                    guesses: data.guesses
                };
            }
            catch (err) {
                console.error("AJAX Start Game Error, falling back to mock:", err);
            }
        }
        await this._delay(300); // Symulacja opóźnienia sieci
        let length = preferredLength;
        // 1. ZABEZPIECZENIE: Zmiana długości słowa w trakcie aktywnej gry oznacza walkower (przegraną)!
        if (type === 'free') {
            let activeSessId = null;
            let activeSess = null;
            for (const [sid, sess] of Object.entries(this.db.sessions)) {
                if (sess.type === 'free' && sess.state === 'playing') {
                    activeSessId = sid;
                    activeSess = sess;
                    break;
                }
            }
            if (activeSess && activeSessId) {
                const activeLength = this.dailyWord ? this.dailyWord.length : 5;
                if (preferredLength !== activeLength) {
                    // Walkower: naliczamy grę jako rozegraną i zamykamy jako zakończoną porażką
                    this.db.user.free_played_count = (this.db.user.free_played_count || 0) + 1;
                    activeSess.state = 'completed';
                    this._saveDb();
                    // Wybieramy nową długość dla nowej gry
                    if (preferredLength === 0) {
                        length = Math.floor(Math.random() * 8) + 5; // 5 do 12
                    }
                    else {
                        length = preferredLength;
                    }
                }
                else {
                    // Wznawiamy istniejącą grę o tej samej długości
                    const guesses = activeSess.attempts.map(word => {
                        return { word, result: this._evaluateGuess(word, this.dailyWord) };
                    });
                    return {
                        status: "success",
                        game_token: activeSessId,
                        word_length: activeLength,
                        attempts_left: this.maxAttempts - activeSess.attempts.length,
                        guesses
                    };
                }
            }
            else {
                // Jeśli brak aktywnej sesji i wybrano Losowo (preferredLength = 0), wybieramy długość od 5 do 12
                if (preferredLength === 0) {
                    length = Math.floor(Math.random() * 8) + 5;
                }
            }
        }
        if (type === 'daily') {
            this.dailyWord = "SKLEP"; // Tryb dzienny zawsze ma słowo "SKLEP" dla MVP
            length = 5;
        }
        else {
            // Tryb Free Play - losujemy słowo o wybranej długości
            const filtered = this.dictionary.filter(w => w.length === length);
            if (filtered.length > 0) {
                const randIndex = Math.floor(Math.random() * filtered.length);
                this.dailyWord = filtered[randIndex];
            }
            else {
                // Słowa zapasowe (fallback)
                const fallbacks = {
                    5: "SKLEP",
                    6: "KAMERA",
                    7: "MONITOR",
                    8: "ZASILACZ",
                    9: "ŁADOWARKA",
                    10: "CERTYFIKAT",
                    11: "INFORMATYKA",
                    12: "KLIMATYZACJA"
                };
                this.dailyWord = fallbacks[length] || "WORDLE";
            }
        }
        const sessionId = 'sess_' + Math.random().toString(36).substring(2, 11);
        this.db.sessions[sessionId] = {
            type: type,
            attempts: [],
            state: 'playing', // playing, won_pending_ad, lost_pending_ad, completed
            started_at: Date.now()
        };
        this._saveDb();
        return {
            status: "success",
            game_token: sessionId,
            word_length: this.dailyWord.length,
            attempts_left: this.maxAttempts
        };
    }
    // [POST] /game/submit-word
    async submitWord(gameToken, wordRaw) {
        if (this.isRemoteActive()) {
            try {
                const response = await fetch(PRODUCTION_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'submitWord',
                        game_token: gameToken,
                        word: wordRaw
                    })
                });
                return await response.json();
            }
            catch (err) {
                console.error("AJAX Submit Word Error, falling back to mock:", err);
            }
        }
        await this._delay(500); // Symulacja opóźnienia sieci
        const session = this.db.sessions[gameToken];
        if (!session || session.state !== 'playing') {
            throw new Error("Invalid session or game already ended.");
        }
        const word = this._normalize(wordRaw);
        // 1. Walidacja słownika
        if (!this.dictionary.includes(word) && word !== this.dailyWord) {
            return { status: "error", code: "INVALID_WORD", message: "Brak słowa w słowniku" };
        }
        // 2. Walidacja liter (Backend Source of Truth)
        let result = [];
        let targetChars = this.dailyWord.split('');
        let guessChars = word.split('');
        let won = true;
        // Pass 1: Znajdź zielone (correct)
        for (let i = 0; i < this.dailyWord.length; i++) {
            if (guessChars[i] === targetChars[i]) {
                result.push({ char: guessChars[i], status: "correct" });
                targetChars[i] = null; // Oznacz jako użyte
            }
            else {
                result.push({ char: guessChars[i], status: null });
                won = false;
            }
        }
        // Pass 2: Znajdź żółte (present)
        for (let i = 0; i < this.dailyWord.length; i++) {
            if (result[i].status !== "correct") {
                let targetIndex = targetChars.indexOf(guessChars[i]);
                if (targetIndex > -1) {
                    result[i].status = "present";
                    targetChars[targetIndex] = null;
                }
                else {
                    result[i].status = "absent";
                }
            }
        }
        session.attempts.push(word);
        // 3. Aktualizacja stanu gry
        let gameState = 'playing';
        if (won) {
            gameState = 'won_pending_ad';
            session.state = gameState;
        }
        else if (session.attempts.length >= this.maxAttempts) {
            gameState = 'lost_pending_ad';
            session.state = gameState;
        }
        this._saveDb();
        let response = {
            status: "success",
            game_state: gameState,
            result: result,
            attempts_left: this.maxAttempts - session.attempts.length
        };
        if (gameState.includes('pending_ad')) {
            response.ad_trigger_url = `/ads/get?game_token=${gameToken}`;
        }
        return response;
    }
    // [GET] /ads/get
    async getAd(gameToken) {
        if (this.isRemoteActive()) {
            try {
                const response = await fetch(PRODUCTION_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'getAd',
                        game_token: gameToken
                    })
                });
                return await response.json();
            }
            catch (err) {
                console.error("AJAX Get Ad Error, falling back to mock:", err);
            }
        }
        await this._delay(200);
        return {
            ad_id: "ad_bcs_mvp",
            banner_url: "https://via.placeholder.com/400x200.png?text=REKLAMA+SPONSORA",
            duration_seconds: 5, // MVP: 5 sekund odliczania
            verification_token: "tok_" + Math.random().toString(36).substring(2, 11)
        };
    }
    // [POST] /reward/claim
    async claimReward(gameToken, token) {
        if (this.isRemoteActive()) {
            try {
                const response = await fetch(PRODUCTION_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'claimReward',
                        game_token: gameToken,
                        token: token,
                        id_customer: this.idCustomer
                    })
                });
                const data = await response.json();
                // Czyszczenie game_token dla wszystkich konfiguracji po odebraniu nagrody, aby nowa gra rozpoczęła się od czystej sesji
                if (typeof localStorage !== 'undefined') {
                    const keys = Object.keys(localStorage);
                    for (const k of keys) {
                        if (k.startsWith('yin_wordle_game_token_')) {
                            localStorage.removeItem(k);
                        }
                    }
                }
                return data;
            }
            catch (err) {
                console.error("AJAX Claim Reward Error, falling back to mock:", err);
            }
        }
        await this._delay(600);
        const session = this.db.sessions[gameToken];
        if (!session) {
            throw new Error("Session not found");
        }
        if (session.state === 'completed_rewarded' || session.state === 'completed_failed' || session.state === 'completed') {
            throw new Error("Reward already claimed or session finished");
        }
        let earnedPoints = 0;
        let streakBonus = 0;
        if (session.state === 'won_pending_ad') {
            // Logika punktacji: 100% za 1 próbę, 50% za 6 próbę
            const basePoints = 100;
            const attemptPenalty = (session.attempts.length - 1) * 10;
            earnedPoints = basePoints - attemptPenalty;
            if (session.type === 'daily') {
                this.db.user.streak += 1;
                this.db.user.points += earnedPoints;
                this.db.user.daily_won_count = (this.db.user.daily_won_count || 0) + 1;
            }
            else {
                this.db.user.free_won_count = (this.db.user.free_won_count || 0) + 1;
                this.db.user.free_played_count = (this.db.user.free_played_count || 0) + 1;
            }
            streakBonus = Math.min(this.db.user.streak * 5, 25); // Max 25% bonusu
            session.state = 'completed_rewarded';
        }
        else {
            // Przegrana
            if (session.type === 'daily') {
                this.db.user.streak = 0;
            }
            else {
                this.db.user.free_played_count = (this.db.user.free_played_count || 0) + 1;
            }
            session.state = 'completed_failed';
        }
        this._saveDb();
        return {
            status: "success",
            game_state: session.state,
            points_earned: earnedPoints,
            new_streak: this.db.user.streak,
            streak_bonus_applied: streakBonus + "%"
        };
    }
    // User Data
    async getUserStats() {
        if (this.isRemoteActive()) {
            try {
                const response = await fetch(PRODUCTION_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'getUserStats',
                        id_customer: this.idCustomer,
                        id_player: this.idPlayer
                    })
                });
                const data = await response.json();
                if (data.id_player && typeof localStorage !== 'undefined') {
                    this.idPlayer = data.id_player;
                    localStorage.setItem('yin_wordle_id_player', data.id_player.toString());
                }
                return data;
            }
            catch (err) {
                console.error("AJAX Get User Stats Error, falling back to mock:", err);
            }
        }
        return this.db.user;
    }
}
// Globalna instancja symulowanego API dla przeglądarki
if (typeof window !== 'undefined') {
    window.api = new WordleMockBackend();
}
