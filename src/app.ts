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
    
    // Header controls
    const btnRanking = document.getElementById('btn-ranking') as HTMLButtonElement;
    const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;
    const btnHelp = document.getElementById('btn-help') as HTMLButtonElement;

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

    // Nowe modale info
    const helpModal = document.getElementById('help-modal') as HTMLElement;
    const closeHelp = document.getElementById('close-help') as HTMLButtonElement;

    const settingsModal = document.getElementById('settings-modal') as HTMLElement;
    const closeSettings = document.getElementById('close-settings') as HTMLButtonElement;
    const toggleSwapKeys = document.getElementById('toggle-swap-keys') as HTMLInputElement;
    const lengthSelector = document.getElementById('length-selector') as HTMLElement;

    const rankingModal = document.getElementById('ranking-modal') as HTMLElement;
    const closeRanking = document.getElementById('close-ranking') as HTMLButtonElement;
    const closeRankingBtn = document.getElementById('close-ranking-btn') as HTMLButtonElement;

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
    let currentGameType: 'daily' | 'free' = 'daily';
    let wordLength = parseInt(localStorage.getItem('wordLength') || '5');
    let maxAttempts = 6;
    let currentRow = 0;
    let currentTile = 0;
    let currentGuess = "";
    let isGameOver = false;
    let isProcessing = false;
    let adToken = "";

    // Ustawienia układu klawiatury i kolorów klawiszy
    let swapEnterBackspace = localStorage.getItem('swapEnterBackspace') === 'true';
    let keyColors: Record<string, 'correct' | 'present' | 'absent'> = {};

    // === INICJALIZACJA GRY ===
    async function initGame() {
        try {
            const stats = await window.api.getUserStats();
            const pointsDisplay = document.getElementById('points-display');
            const streakDisplay = document.getElementById('streak-display');
            if (pointsDisplay) pointsDisplay.textContent = `💰 ${stats.points} pkt`;
            if (streakDisplay) streakDisplay.textContent = `🔥 ${stats.streak}`;

            // Inicjalizacja przełączników w ustawieniach
            if (toggleSwapKeys) toggleSwapKeys.checked = swapEnterBackspace;
            updateLengthSelectorUI();

            currentGameType = 'daily';
            const response = await window.api.startGame('daily', wordLength);
            gameId = response.game_id;
            wordLength = response.word_length;
            maxAttempts = response.attempts_left;

            buildBoard();
            buildKeyboard();
            setupKeyboardEvents();
            setupHeaderControls();
        } catch (e) {
            showToast("Błąd inicjalizacji gry.");
        }
    }

    function buildBoard() {
        board.innerHTML = '';
        
        const dailyBadge = document.getElementById('daily-badge') as HTMLElement;
        const boardWrapper = board.parentElement as HTMLElement;
        if (dailyBadge) {
            dailyBadge.style.display = currentGameType === 'daily' ? 'block' : 'none';
        }
        
        if (currentGameType === 'daily') {
            board.classList.add('daily-game');
            if (boardWrapper) boardWrapper.classList.add('daily-game');
        } else {
            board.classList.remove('daily-game');
            if (boardWrapper) boardWrapper.classList.remove('daily-game');
        }

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
        
        const availW = section.clientWidth - 20; 
        const badgeOffset = currentGameType === 'daily' ? 18 : 0;
        const availH = section.clientHeight - 16 - badgeOffset; 
        const gap = 4;
        
        const maxTileW = (availW - (wordLength - 1) * gap) / wordLength;
        const maxTileH = (availH - (maxAttempts - 1) * gap) / maxAttempts;
        
        const tileSize = Math.min(maxTileW, maxTileH, 65);
        
        const boardW = (tileSize * wordLength) + ((wordLength - 1) * gap);
        const boardH = (tileSize * maxAttempts) + ((maxAttempts - 1) * gap);
        
        boardElem.style.width = boardW + 'px';
        boardElem.style.height = boardH + 'px';
        
        document.querySelectorAll('.tile').forEach(tile => {
            (tile as HTMLElement).style.fontSize = Math.max(12, tileSize * 0.45) + 'px';
        });
    }

    window.addEventListener('resize', resizeBoard);

    // === GENEROWANIE KLAWIATURY ===
    function buildKeyboard() {
        keyboard.innerHTML = '';
        
        const row1 = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"];
        const row2 = ["A", "S", "D", "F", "G", "H", "J", "K", "L"];
        const row4 = ["Ą", "Ć", "Ę", "Ł", "Ń", "Ó", "Ś", "Ź", "Ż"];
        
        // Row 1
        const r1 = document.createElement('div');
        r1.className = 'keyboard-row';
        row1.forEach(k => r1.appendChild(createKeyBtn(k)));
        keyboard.appendChild(r1);
        
        // Row 2
        const r2 = document.createElement('div');
        r2.className = 'keyboard-row';
        row2.forEach(k => r2.appendChild(createKeyBtn(k)));
        keyboard.appendChild(r2);
        
        // Row 3 (Contains ENTER and BACKSPACE)
        const r3 = document.createElement('div');
        r3.className = 'keyboard-row';
        
        const backspaceBtn = createKeyBtn('BACKSPACE', 'Cofnij');
        backspaceBtn.classList.add('wide-key', 'key-secondary');
        const enterBtn = createKeyBtn('ENTER', 'Enter');
        enterBtn.classList.add('wide-key', 'key-primary');
        
        const midLetters = ["Z", "X", "C", "V", "B", "N", "M"];
        
        if (swapEnterBackspace) {
            r3.appendChild(enterBtn);
            midLetters.forEach(k => r3.appendChild(createKeyBtn(k)));
            r3.appendChild(backspaceBtn);
        } else {
            r3.appendChild(backspaceBtn);
            midLetters.forEach(k => r3.appendChild(createKeyBtn(k)));
            r3.appendChild(enterBtn);
        }
        keyboard.appendChild(r3);
        
        // Row 4 (Polish letters at the bottom)
        const r4 = document.createElement('div');
        r4.className = 'keyboard-row';
        row4.forEach(k => r4.appendChild(createKeyBtn(k)));
        keyboard.appendChild(r4);

        restoreKeyColors();
    }

    function createKeyBtn(key: string, label?: string): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.setAttribute('data-key', key);
        btn.textContent = label || key;
        return btn;
    }

    // === OBSŁUGA ZDARZEŃ KLAWIATURY ===
    function setupKeyboardEvents() {
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

    // === KONTROLE MODALI NAGŁÓWKA ===
    function setupHeaderControls() {
        // Otwieranie modali
        btnHelp.addEventListener('click', () => helpModal.style.display = 'flex');
        btnSettings.addEventListener('click', () => settingsModal.style.display = 'flex');
        btnRanking.addEventListener('click', () => rankingModal.style.display = 'flex');

        // Zamykanie modali
        closeHelp.addEventListener('click', () => helpModal.style.display = 'none');
        closeSettings.addEventListener('click', () => settingsModal.style.display = 'none');
        closeRanking.addEventListener('click', () => rankingModal.style.display = 'none');
        closeRankingBtn.addEventListener('click', () => rankingModal.style.display = 'none');

        // Zamykanie modalu kliknięciem poza jego treść
        window.addEventListener('click', (e) => {
            if (e.target === helpModal) helpModal.style.display = 'none';
            if (e.target === settingsModal) settingsModal.style.display = 'none';
            if (e.target === rankingModal) rankingModal.style.display = 'none';
        });

        // Obsługa przełącznika "Zamień przyciski"
        if (toggleSwapKeys) {
            toggleSwapKeys.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                swapEnterBackspace = target.checked;
                localStorage.setItem('swapEnterBackspace', swapEnterBackspace.toString());
                buildKeyboard();
            });
        }

        // Obsługa wyboru długości słowa
        if (lengthSelector) {
            lengthSelector.addEventListener('click', async (e) => {
                const target = e.target as HTMLElement;
                if (target.tagName === 'BUTTON') {
                    const len = parseInt(target.getAttribute('data-len') || '5');
                    if (len >= 5 && len <= 12 && len !== wordLength) {
                        wordLength = len;
                        localStorage.setItem('wordLength', len.toString());
                        updateLengthSelectorUI();
                        settingsModal.style.display = 'none'; // Zamknij modal po wyborze
                        await resetGame('free');
                    }
                }
            });
        }
    }

    function updateLengthSelectorUI() {
        if (!lengthSelector) return;
        const buttons = lengthSelector.querySelectorAll('button');
        buttons.forEach(btn => {
            const len = parseInt(btn.getAttribute('data-len') || '5');
            if (len === wordLength) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
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
                showToast(res.message || "Brak słowa w słowniku");
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
        
        return new Promise<void>(resolve => setTimeout(resolve, wordLength * 200 + 300));
    }

    function updateKeyboardColors(resultObj: { char: string; status: 'correct' | 'present' | 'absent' | null }[]) {
        resultObj.forEach(res => {
            if (!res.status) return;
            const current = keyColors[res.char];
            if (res.status === 'correct') {
                keyColors[res.char] = 'correct';
            } else if (res.status === 'present' && current !== 'correct') {
                keyColors[res.char] = 'present';
            } else if (res.status === 'absent' && current !== 'correct' && current !== 'present') {
                keyColors[res.char] = 'absent';
            }
        });
        restoreKeyColors();
    }

    function restoreKeyColors() {
        for (const [char, status] of Object.entries(keyColors)) {
            const btn = document.querySelector(`button[data-key="${char}"]`) as HTMLElement;
            if (btn) {
                btn.className = status;
            }
        }
        // Upewnij się, że klawisze funkcyjne zachowują domyślny styl
        const enterBtn = document.querySelector('button[data-key="ENTER"]');
        const backspaceBtn = document.querySelector('button[data-key="BACKSPACE"]');
        if (enterBtn) {
            enterBtn.className = 'wide-key key-primary';
        }
        if (backspaceBtn) {
            backspaceBtn.className = 'wide-key key-secondary';
        }
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
        
        const result = await window.api.claimReward(gameId, adToken);
        
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

        const pointsDisplay = document.getElementById('points-display');
        const streakDisplay = document.getElementById('streak-display');
        const stats = await window.api.getUserStats();
        if (pointsDisplay) pointsDisplay.textContent = `💰 ${stats.points} pkt`;
        if (streakDisplay) streakDisplay.textContent = `🔥 ${stats.streak}`;
    });

    // === POMOCNICZE OBSŁUGI KLAWIATURY PO ZAKOŃCZENIU GRY ===
    function showPlayAgainKeyboardCTA() {
        const keyboardElem = document.getElementById('keyboard') as HTMLElement;
        const keyboardBtn = document.getElementById('keyboard-play-again-btn') as HTMLElement;
        if (keyboardElem && keyboardBtn) {
            keyboardElem.style.display = 'none';
            keyboardBtn.style.display = 'block';
        }
    }
    function hidePlayAgainKeyboardCTA() {
        const keyboardElem = document.getElementById('keyboard') as HTMLElement;
        const keyboardBtn = document.getElementById('keyboard-play-again-btn') as HTMLElement;
        if (keyboardElem && keyboardBtn) {
            keyboardElem.style.display = '';
            keyboardBtn.style.display = 'none';
        }
    }

    closeEndBtn.addEventListener('click', () => {
        endModal.style.display = 'none';
        showPlayAgainKeyboardCTA();
        showToast("Zakończono. Możesz zagrać w Free Play.");
    });

    playAgainBtn.addEventListener('click', async () => {
        endModal.style.display = 'none';
        await resetGame('free');
    });

    const keyboardPlayAgainBtn = document.getElementById('keyboard-play-again-btn') as HTMLElement;
    if (keyboardPlayAgainBtn) {
        keyboardPlayAgainBtn.addEventListener('click', async () => {
            await resetGame('free');
        });
    }

    async function resetGame(type: 'daily' | 'free') {
        board.innerHTML = '';
        keyColors = {};
        currentGameType = type;
        hidePlayAgainKeyboardCTA();
        buildKeyboard();
        
        currentRow = 0;
        currentTile = 0;
        currentGuess = "";
        isGameOver = false;
        isProcessing = false;
        
        try {
            const response = await window.api.startGame(type, wordLength);
            gameId = response.game_id;
            wordLength = response.word_length;
            maxAttempts = response.attempts_left;
            buildBoard();
            showToast(`Rozpoczęto nową grę (${type === 'daily' ? 'Tryb Dzienny' : 'Tryb Free Play'})`);
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
