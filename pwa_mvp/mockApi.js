/**
 * Mock API - Symulacja Backend PHP dla YIN Wordle PWA
 * Source of Truth (Wszystkie walidacje odbywają się tutaj)
 */
class WordleMockBackend {
    constructor() {
        this.dailyWord = "SKLEP"; // Słowo Dnia (Hardcoded dla MVP)
        // Duży słownik testowy (wyłącznie zweryfikowane polskie słowa 5-literowe)
        this.dictionary = [
            "SKLEP", "EKRAN", "OBRAZ", "KABEL", "WIDEO", "AUDIO", "RUTER", "POLAK", "DOBRO", "SŁOWO",
            "ŻÓŁTY", "ALARM", "DRZWI", "ZAMEK", "PILOT", "KARTA", "KODER", "MYSZA", "PŁYTA", "MASKA",
            "PORTY", "DYSKI", "PASEK", "RAMKA", "KANAŁ", "KLUCZ", "TAJNE", "FOKUS", "BŁYSK", "JASNY",
            "KOLOR", "WIZJA", "ROZUM", "UMYSŁ", "SERCE", "ZIMNO", "WIATR", "BURZA", "DROGA", "TRAWA",
            "OGIEŃ", "MIECZ", "KUBEK", "MLEKO", "PIWKO", "WINKO", "WÓDKA", "CHLEB", "MASŁO", "SEREK",
            "MIĘSO", "OWOCE", "ZIOŁA", "BLOKI", "ULICA", "ROWER", "LAMPY", "STOŁY", "FOTEL", "MYDŁO",
            "PASTA", "ZEGAR", "PIERŚ", "MIEDŹ", "SZKŁO", "DESKA", "BETON", "CEGŁA", "PIACH", "GLINA",
            "KWIAT", "KOSZT", "WIRUS", "ZYSKI", "WĘZEŁ", "KUPON", "HASŁO", "TABLA", "KOLOR", "MOTYW",
            "OFERT", "ZAKUP", "MARŻA", "KONTO", "WALUT", "PALIW", "MOTOR", "PASEK", "KROKI", "WYNIK"
        ];
        this.maxAttempts = 6;

        // Symulowana baza danych w LocalStorage
        this.db = JSON.parse(localStorage.getItem('yin_wordle_db')) || {
            sessions: {},
            user: { points: 0, streak: 0 }
        };
    }

    _saveDb() {
        localStorage.setItem('yin_wordle_db', JSON.stringify(this.db));
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _normalize(word) {
        return word.toUpperCase();
    }

    // [POST] /game/start
    async startGame(type = 'daily') {
        await this._delay(300); // Symulacja opóźnienia sieci

        if (type === 'free') {
            const randIndex = Math.floor(Math.random() * this.dictionary.length);
            this.dailyWord = this.dictionary[randIndex];
        } else {
            this.dailyWord = "SKLEP"; // Hardcoded for daily MVP
        }

        const sessionId = 'sess_' + Math.random().toString(36).substr(2, 9);
        this.db.sessions[sessionId] = {
            type: type,
            attempts: [],
            state: 'playing', // playing, won_pending_ad, lost_pending_ad, completed
            started_at: Date.now()
        };
        this._saveDb();

        return {
            status: "success",
            game_id: sessionId,
            word_length: this.dailyWord.length,
            attempts_left: this.maxAttempts
        };
    }

    // [POST] /game/submit-word
    async submitWord(sessionId, wordRaw) {
        await this._delay(500); // Symulacja opóźnienia sieci

        const session = this.db.sessions[sessionId];
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
            } else {
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
                } else {
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
        } else if (session.attempts.length >= this.maxAttempts) {
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
            response.ad_trigger_url = `/ads/get?game_id=${sessionId}`;
        }

        return response;
    }

    // [GET] /ads/get hi bye
    async getAd(sessionId) {
        await this._delay(200);
        return {
            ad_id: "ad_bcs_mvp",
            banner_url: "https://via.placeholder.com/400x200.png?text=REKLAMA+SPONSORA",
            duration_seconds: 5, // MVP: 5 sekund odliczania
            verification_token: "tok_" + Math.random().toString(36).substr(2, 9)
        };
    }

    // [POST] /reward/claim
    async claimReward(sessionId, token) {
        await this._delay(600);
        const session = this.db.sessions[sessionId];

        let earnedPoints = 0;
        let streakBonus = 0;

        if (session.state === 'won_pending_ad') {
            // Logika punktacji: 100% za 1 próbę, 50% za 6 próbę
            const basePoints = 100;
            const attemptPenalty = (session.attempts.length - 1) * 10;
            earnedPoints = basePoints - attemptPenalty;

            this.db.user.streak += 1;
            this.db.user.points += earnedPoints;
            streakBonus = Math.min(this.db.user.streak * 5, 25); // Max 25% bonusu

            session.state = 'completed_rewarded';
        } else {
            // Przegrana
            this.db.user.streak = 0;
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
        return this.db.user;
    }
}

// Globalna instancja symulowanego API
window.api = new WordleMockBackend();
