import { WordleMockBackend } from './mockApi';

declare global {
  interface Window {
    api: WordleMockBackend;
    webkitAudioContext?: typeof AudioContext;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
    // === REJESTRACJA SERVICE WORKERA ===
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Fail:', err));
    }

    // === ELEMENTY DOM ===
    const board = document.getElementById('board') as HTMLElement;
    const keyboard = document.getElementById('keyboard') as HTMLElement;
    const toastContainer = document.getElementById('toast-container') as HTMLElement;
    const offlineIndicator = document.getElementById('offline-indicator') as HTMLElement;
    
    // Modale
    const adModal = document.getElementById('ad-modal') as HTMLElement;
    const adCountdown = document.getElementById('ad-countdown') as HTMLElement;
    const skipAdBtn = document.getElementById('skip-ad-btn') as HTMLButtonElement;
    
    const endModal = document.getElementById('end-modal') as HTMLElement;
    const endTitle = document.getElementById('end-title') as HTMLElement;
    const endPoints = document.getElementById('end-points') as HTMLElement;
    const statStreak = document.getElementById('stat-streak') as HTMLElement;
    const statBonus = document.getElementById('stat-bonus') as HTMLElement;
    const closeEndBtn = document.getElementById('close-end-modal') as HTMLButtonElement;
    const playAgainBtn = document.getElementById('play-again-btn') as HTMLButtonElement;

    // === DŹWIĘKI (WEB AUDIO API) ===
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioCtx = AudioContextClass ? new AudioContextClass() : null;
    
    function playBeep(freq: number, type: OscillatorType, duration: number, vol = 0.1) {
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    // === WIBRACJE (HAPTIC FEEDBACK) ===
    function vibrate(pattern: number | number[]) {
        if (navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    }

    // === STAN APLIKACJI ===
    let gameId = "";
    let wordLength = 5;
    let maxAttempts = 6;
    let currentRow = 0;
    let currentTile = 0;
    let currentGuess = "";
    let isGameOver = false;
    let isProcessing = false;
    let adToken = "";

    // === INICJALIZACJA GRY ===
    async function initGame() {
        try {
            const stats = await window.api.getUserStats();
            const pointsDisplay = document.getElementById('points-display');
            const streakDisplay = document.getElementById('streak-display');
            if (pointsDisplay) pointsDisplay.textContent = `💰 ${stats.points} pkt`;
            if (streakDisplay) streakDisplay.textContent = `🔥 ${stats.streak}`;

            const response = await window.api.startGame();
            gameId = response.game_id;
            wordLength = response.word_length;
            maxAttempts = response.attempts_left;

            buildBoard();
            setupKeyboard();
        } catch (e) {
            showToast("Błąd inicjalizacji gry.");
        }
    }

    function buildBoard() {
        board.innerHTML = '';
        // Propagate dimensions to CSS custom properties
        document.documentElement.style.setProperty('--word-length', wordLength.toString());
        document.documentElement.style.setProperty('--max-attempts', maxAttempts.toString());
        for (let r = 0; r < maxAttempts; r++) {
            const row = document.createElement('div');
            row.className = 'board-row';
            row.id = `row-${r}`;
            for (let c = 0; c < wordLength; c++) {
                const tile = document.createElement('div');
                tile.className = 'tile';
                tile.id = `tile-${r}-${c}`;
                row.appendChild(tile);
            }
            board.appendChild(row);
        }
        
        requestAnimationFrame(resizeBoard);
    }

    function resizeBoard() {
        const section = document.querySelector('.board-section') as HTMLElement;
        const boardElem = document.querySelector('.board') as HTMLElement;
        if (!section || !boardElem) return;
        
        // Dostępne miejsce (z uwzględnieniem paddingu 10px i 8px)
        const availW = section.clientWidth - 20; 
        const availH = section.clientHeight - 16; 
        const gap = 4;
        
        // Wylicz maksymalny rozmiar kafelka, by zmieścił się na szerokość i wysokość
        const maxTileW = (availW - (wordLength - 1) * gap) / wordLength;
        const maxTileH = (availH - (maxAttempts - 1) * gap) / maxAttempts;
        
        // Zastosuj mniejszy z wymiarów (z limitem 65px) by zachować idealne kwadraty
        const tileSize = Math.min(maxTileW, maxTileH, 65);
        
        // Oblicz dokładny wymiar całej planszy w pikselach
        const boardW = (tileSize * wordLength) + ((wordLength - 1) * gap);
        const boardH = (tileSize * maxAttempts) + ((maxAttempts - 1) * gap);
        
        boardElem.style.width = boardW + 'px';
        boardElem.style.height = boardH + 'px';
        
        // Dynamicznie dopasuj czcionkę
        document.querySelectorAll('.tile').forEach(tile => {
            (tile as HTMLElement).style.fontSize = Math.max(12, tileSize * 0.45) + 'px';
        });
    }

    window.addEventListener('resize', resizeBoard);

    // === OBSŁUGA KLAWIATURY ===
    function setupKeyboard() {
        document.addEventListener('keydown', handlePhysicalKeyboard);
        keyboard.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'BUTTON') {
                const key = target.getAttribute('data-key');
                if (key) handleKey(key);
            }
        });
    }

    function handlePhysicalKeyboard(e: KeyboardEvent) {
        if (isGameOver || isProcessing) return;
        
        const key = e.key.toUpperCase();
        if (key === 'ENTER') handleKey('ENTER');
        if (key === 'BACKSPACE') handleKey('BACKSPACE');
        // Zezwól na polskie znaki w Regexie
        if (/^[A-ZĄĆĘŁŃÓŚŹŻ]$/.test(key)) handleKey(key);
    }

    async function handleKey(key: string) {
        if (isGameOver || isProcessing) return;

        if (key === 'ENTER') {
            vibrate(20);
            await submitGuess();
        } else if (key === 'BACKSPACE') {
            if (currentTile > 0) {
                vibrate(10); playBeep(300, 'sine', 0.1);
                currentTile--;
                currentGuess = currentGuess.slice(0, -1);
                const tile = document.getElementById(`tile-${currentRow}-${currentTile}`) as HTMLElement;
                tile.textContent = '';
                tile.classList.remove('filled');
            }
        } else if (currentTile < wordLength) {
            vibrate(10); playBeep(400, 'sine', 0.1);
            currentGuess += key;
            const tile = document.getElementById(`tile-${currentRow}-${currentTile}`) as HTMLElement;
            tile.textContent = key;
            tile.classList.add('filled');
            currentTile++;
        }
    }

    // === WYSYŁKA SŁOWA (BACKEND WALIDACJA) ===
    async function submitGuess() {
        if (currentGuess.length !== wordLength) {
            showToast("Za krótkie słowo");
            shakeRow();
            vibrate([50, 50, 50]); playBeep(150, 'sawtooth', 0.3, 0.2);
            return;
        }

        if (!navigator.onLine) {
            showToast("Jesteś offline. Oczekuję na połączenie...");
            return;
        }

        isProcessing = true;
        try {
            const res = await window.api.submitWord(gameId, currentGuess);
            
            if (res.status === 'error') {
                showToast(res.message || "Błąd walidacji");
                shakeRow();
                vibrate([50, 50, 50]); playBeep(150, 'sawtooth', 0.3, 0.2);
                isProcessing = false;
                return;
            }

            // Animacja kolorowania (Flip)
            if (res.result) {
                await animateRow(res.result);
                updateKeyboardColors(res.result);
            }

            if (res.game_state && res.game_state.includes('pending_ad')) {
                isGameOver = true;
                if (res.game_state === 'won_pending_ad') {
                    vibrate([100, 50, 100, 50, 200]); playBeep(600, 'triangle', 0.5);
                } else {
                    vibrate(300); playBeep(200, 'sawtooth', 0.6);
                }
                setTimeout(() => triggerAdGateway(res.game_state!), 1000);
            } else {
                currentRow++;
                currentTile = 0;
                currentGuess = "";
            }
        } catch (e) {
            showToast("Błąd serwera.");
        }
        isProcessing = false;
    }

    // === ANIMACJE ===
    function shakeRow() {
        const row = document.getElementById(`row-${currentRow}`);
        if (row) {
            row.classList.add('shake');
            setTimeout(() => row.classList.remove('shake'), 600);
        }
    }

    async function animateRow(resultObj: { char: string; status: 'correct' | 'present' | 'absent' | null }[]) {
        const row = document.getElementById(`row-${currentRow}`);
        if (!row) return;
        const tiles = row.children;
        
        for (let i = 0; i < tiles.length; i++) {
            const tile = tiles[i] as HTMLElement;
            const result = resultObj[i];
            
            setTimeout(() => {
                tile.classList.add('flip');
                if (result.status) {
                    tile.classList.add(result.status);
                }
            }, i * 200); // Kaskadowe opóźnienie
        }
        
        // Czekaj na koniec animacji
        return new Promise<void>(resolve => setTimeout(resolve, wordLength * 200 + 300));
    }

    function updateKeyboardColors(resultObj: { char: string; status: 'correct' | 'present' | 'absent' | null }[]) {
        resultObj.forEach(res => {
            const btn = document.querySelector(`button[data-key="${res.char}"]`) as HTMLElement;
            if (!btn) return;
            // Nadpisuj tylko na silniejszy status (correct > present > absent)
            if (res.status === 'correct') {
                btn.className = 'correct';
            } else if (res.status === 'present' && !btn.classList.contains('correct')) {
                btn.classList.add('present');
            } else if (res.status === 'absent' && !btn.classList.contains('correct') && !btn.classList.contains('present')) {
                btn.classList.add('absent');
            }
        });
    }

    // === SYSTEM REKLAM (AD GATEWAY) ===
    async function triggerAdGateway(gameState: string) {
        const adConfig = await window.api.getAd(gameId);
        adToken = adConfig.verification_token;
        
        const adImage = document.getElementById('ad-image') as HTMLImageElement;
        if (adImage) adImage.src = adConfig.banner_url;
        adModal.style.display = 'flex';
        
        let time = adConfig.duration_seconds;
        adCountdown.textContent = time.toString();
        skipAdBtn.disabled = true;
        skipAdBtn.textContent = "Oglądaj reklamę...";

        const interval = setInterval(() => {
            time--;
            adCountdown.textContent = time.toString();
            if (time <= 0) {
                clearInterval(interval);
                skipAdBtn.disabled = false;
                skipAdBtn.textContent = gameState === 'won_pending_ad' ? "Odbierz punkty!" : "Zakończ";
                adCountdown.textContent = "0";
            }
        }, 1000);
    }

    skipAdBtn.addEventListener('click', async () => {
        adModal.style.display = 'none';
        
        // Wysłanie tokenu reklamowego
        const result = await window.api.claimReward(gameId, adToken);
        
        // Pokaż podsumowanie
        endModal.style.display = 'flex';
        if (result.game_state === 'completed_rewarded') {
            endTitle.textContent = "Wygrałeś!";
            endTitle.style.color = "var(--correct-color)";
        } else {
            endTitle.textContent = "Przegrana!";
            endTitle.style.color = "var(--absent-color)";
        }
        
        endPoints.textContent = result.points_earned.toString();
        statStreak.textContent = result.new_streak.toString();
        statBonus.textContent = result.streak_bonus_applied;

        // Update top bar
        const pointsDisplay = document.getElementById('points-display');
        const streakDisplay = document.getElementById('streak-display');
        const stats = await window.api.getUserStats();
        if (pointsDisplay) pointsDisplay.textContent = `💰 ${stats.points} pkt`;
        if (streakDisplay) streakDisplay.textContent = `🔥 ${stats.streak}`;
    });

    closeEndBtn.addEventListener('click', () => {
        endModal.style.display = 'none';
        showToast("Zakończono. Możesz zagrać w Free Play.");
    });

    playAgainBtn.addEventListener('click', async () => {
        endModal.style.display = 'none';
        await resetGame('free');
    });

    async function resetGame(type: 'daily' | 'free') {
        board.innerHTML = '';
        document.querySelectorAll('.keyboard button').forEach(btn => btn.className = '');
        
        const enterBtn = document.querySelector('button[data-key="ENTER"]');
        const backspaceBtn = document.querySelector('button[data-key="BACKSPACE"]');
        if (enterBtn) enterBtn.className = 'wide-key key-primary';
        if (backspaceBtn) backspaceBtn.className = 'wide-key key-secondary';
        
        currentRow = 0;
        currentTile = 0;
        currentGuess = "";
        isGameOver = false;
        isProcessing = false;
        
        try {
            const response = await window.api.startGame(type);
            gameId = response.game_id;
            wordLength = response.word_length;
            maxAttempts = response.attempts_left;
            buildBoard();
            showToast("Rozpoczęto nową grę (Tryb Free Play)");
        } catch (e) {
            showToast("Błąd resetowania gry.");
        }
    }

    // === OFFLINE / ONLINE DETEKCJA ===
    window.addEventListener('offline', () => {
        offlineIndicator.style.display = 'block';
    });
    
    window.addEventListener('online', () => {
        offlineIndicator.style.display = 'none';
        showToast("Jesteś z powrotem online!");
    });

    // === POMOCNICZE ===
    function showToast(msg: string) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = msg;
        toastContainer.appendChild(toast);
        
        // Animacja
        setTimeout(() => toast.style.opacity = '1', 10);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Uruchomienie
    if (!navigator.onLine) offlineIndicator.style.display = 'block';
    initGame();
});
