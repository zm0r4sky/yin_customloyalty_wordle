document.addEventListener('DOMContentLoaded', async () => {
    // === REJESTRACJA SERVICE WORKERA ===
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Fail:', err));
    }
    // === ELEMENTY DOM ===
    const board = document.getElementById('board');
    const keyboard = document.getElementById('keyboard');
    const toastContainer = document.getElementById('toast-container');
    const offlineIndicator = document.getElementById('offline-indicator');
    // Header controls
    const btnRanking = document.getElementById('btn-ranking');
    const btnSettings = document.getElementById('btn-settings');
    const btnHelp = document.getElementById('btn-help');
    // Modale
    const adModal = document.getElementById('ad-modal');
    const adCountdown = document.getElementById('ad-countdown');
    const skipAdBtn = document.getElementById('skip-ad-btn');
    const endModal = document.getElementById('end-modal');
    const endTitle = document.getElementById('end-title');
    const endPoints = document.getElementById('end-points');
    const statStreak = document.getElementById('stat-streak');
    const statBonus = document.getElementById('stat-bonus');
    const closeEndBtn = document.getElementById('close-end-modal');
    const playAgainBtn = document.getElementById('play-again-btn');
    // Nowe modale info
    const helpModal = document.getElementById('help-modal');
    const closeHelp = document.getElementById('close-help');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettings = document.getElementById('close-settings');
    const toggleSwapKeys = document.getElementById('toggle-swap-keys');
    const lengthSelector = document.getElementById('length-selector');
    const rankingModal = document.getElementById('ranking-modal');
    const closeRanking = document.getElementById('close-ranking');
    const closeRankingBtn = document.getElementById('close-ranking-btn');
    // Nickname elements
    const inputNickname = document.getElementById('input-nickname');
    const btnSaveNickname = document.getElementById('btn-save-nickname');
    // === DŹWIĘKI (WEB AUDIO API) ===
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioCtx = AudioContextClass ? new AudioContextClass() : null;
    function playBeep(freq, type, duration, vol = 0.1) {
        if (!audioCtx)
            return;
        if (audioCtx.state === 'suspended')
            audioCtx.resume();
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
    function vibrate(pattern) {
        if (navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    }
    // === STAN APLIKACJI ===
    let gameToken = "";
    let currentGameType = 'daily';
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
    let keyColors = {};
    // === INICJALIZACJA GRY ===
    async function initGame() {
        try {
            const stats = await window.api.getUserStats();
            const pointsDisplay = document.getElementById('points-display');
            const streakDisplay = document.getElementById('streak-display');
            if (pointsDisplay)
                pointsDisplay.textContent = `💰 ${stats.points} pkt`;
            if (streakDisplay)
                streakDisplay.textContent = `🔥 ${stats.streak}`;
            // Inicjalizacja przełączników w ustawieniach
            if (toggleSwapKeys)
                toggleSwapKeys.checked = swapEnterBackspace;
            if (inputNickname && stats.nickname) {
                inputNickname.value = stats.nickname;
            }
            updateLengthSelectorUI();
            // Próba rozpoczęcia gry codziennej
            currentGameType = 'daily';
            const response = await window.api.startGame('daily', 5);
            // Jeśli gra codzienna na dziś jest już całkowicie zakończona i odebrana, 
            // automatycznie przenosimy gracza do trybu Free Play (treningu), aby nie blokować go na ukończonej planszy.
            if (response.game_state && response.game_state !== 'playing' && !response.game_state.includes('pending_ad')) {
                currentGameType = 'free';
                const lenReq = parseInt(localStorage.getItem('wordLength') || '5');
                const freeResponse = await window.api.startGame('free', lenReq);
                initializeSession(freeResponse);
                showToast("Dzisiejsze słowo dnia już zaliczone! Witaj w trybie Free Play.");
            }
            else {
                initializeSession(response);
            }
            setupKeyboardEvents();
            setupHeaderControls();
        }
        catch (e) {
            showToast(e.message || "Błąd inicjalizacji gry.");
        }
    }
    function initializeSession(response) {
        gameToken = response.game_token;
        wordLength = response.word_length;
        maxAttempts = response.max_attempts || 6;
        buildBoard();
        buildKeyboard();
        if (response.guesses && response.guesses.length > 0) {
            for (let i = 0; i < response.guesses.length; i++) {
                const guessObj = response.guesses[i];
                currentRow = i;
                for (let c = 0; c < wordLength; c++) {
                    const tile = document.getElementById(`tile-${currentRow}-${c}`);
                    if (tile) {
                        tile.textContent = guessObj.result[c].char;
                        tile.classList.add('filled');
                        tile.classList.add(guessObj.result[c].status);
                    }
                }
                updateKeyboardColors(guessObj.result);
            }
            currentRow = response.guesses.length;
            currentTile = 0;
            currentGuess = "";
        }
        else {
            currentRow = 0;
            currentTile = 0;
            currentGuess = "";
        }
        // Ustawienie flagi końca gry na podstawie statusu sesji (zapobiega pisaniu po skończonej grze)
        if (response.game_state && response.game_state !== 'playing') {
            isGameOver = true;
            if (response.game_state.includes('pending_ad')) {
                setTimeout(() => triggerAdGateway(response.game_state), 100);
            }
            else {
                setTimeout(() => showPlayAgainKeyboardCTA(), 100);
            }
        }
        else {
            isGameOver = false;
        }
    }
    function buildBoard() {
        board.innerHTML = '';
        const dailyBadge = document.getElementById('daily-badge');
        const boardWrapper = board.parentElement;
        if (dailyBadge) {
            dailyBadge.style.display = currentGameType === 'daily' ? 'block' : 'none';
        }
        if (currentGameType === 'daily') {
            board.classList.add('daily-game');
            if (boardWrapper)
                boardWrapper.classList.add('daily-game');
        }
        else {
            board.classList.remove('daily-game');
            if (boardWrapper)
                boardWrapper.classList.remove('daily-game');
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
        const section = document.querySelector('.board-section');
        const boardElem = document.querySelector('.board');
        if (!section || !boardElem)
            return;
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
            tile.style.fontSize = Math.max(12, tileSize * 0.45) + 'px';
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
        }
        else {
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
    function createKeyBtn(key, label) {
        const btn = document.createElement('button');
        btn.setAttribute('data-key', key);
        btn.textContent = label || key;
        return btn;
    }
    // === OBSŁUGA ZDARZEŃ KLAWIATURY ===
    function setupKeyboardEvents() {
        document.addEventListener('keydown', handlePhysicalKeyboard);
        keyboard.addEventListener('click', (e) => {
            const target = e.target;
            if (target.tagName === 'BUTTON') {
                const key = target.getAttribute('data-key');
                if (key)
                    handleKey(key);
            }
        });
    }
    function handlePhysicalKeyboard(e) {
        if (isGameOver || isProcessing)
            return;
        const key = e.key.toUpperCase();
        if (key === 'ENTER')
            handleKey('ENTER');
        if (key === 'BACKSPACE')
            handleKey('BACKSPACE');
        if (/^[A-ZĄĆĘŁŃÓŚŹŻ]$/.test(key))
            handleKey(key);
    }
    async function handleKey(key) {
        if (isGameOver || isProcessing)
            return;
        if (key === 'ENTER') {
            vibrate(20);
            await submitGuess();
        }
        else if (key === 'BACKSPACE') {
            if (currentTile > 0) {
                vibrate(10);
                playBeep(300, 'sine', 0.1);
                currentTile--;
                currentGuess = currentGuess.slice(0, -1);
                const tile = document.getElementById(`tile-${currentRow}-${currentTile}`);
                tile.textContent = '';
                tile.classList.remove('filled');
            }
        }
        else if (currentTile < wordLength) {
            vibrate(10);
            playBeep(400, 'sine', 0.1);
            currentGuess += key;
            const tile = document.getElementById(`tile-${currentRow}-${currentTile}`);
            tile.textContent = key;
            tile.classList.add('filled');
            currentTile++;
        }
    }
    async function loadAndRenderLeaderboard() {
        const rankingBody = document.querySelector('.ranking-body');
        if (!rankingBody)
            return;
        rankingBody.innerHTML = `
            <div class="ranking-loading">
                <div class="spinner"></div>
                <p>Pobieranie wyników...</p>
            </div>
        `;
        try {
            const data = await window.api.getLeaderboard();
            let html = `
                <div class="ranking-list-container">
                    <table class="ranking-table">
                        <thead>
                            <tr>
                                <th class="col-rank">Poz.</th>
                                <th class="col-name">Gracz</th>
                                <th class="col-points">Punkty</th>
                                <th class="col-streak">Streak Max</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            data.leaderboard.forEach(entry => {
                let medal = entry.rank.toString();
                if (entry.rank === 1)
                    medal = '🥇';
                else if (entry.rank === 2)
                    medal = '🥈';
                else if (entry.rank === 3)
                    medal = '🥉';
                const isMe = entry.id_player === window.api.idPlayer;
                html += `
                    <tr class="clickable-row ${isMe ? 'current-player-row' : ''}" data-player-id="${entry.id_player}">
                        <td class="col-rank">${medal}</td>
                        <td class="col-name">${escapeHTML(entry.name)}${isMe ? ' (Ty)' : ''}</td>
                        <td class="col-points">💰 ${entry.points}</td>
                        <td class="col-streak">🔥 ${entry.max_streak}</td>
                    </tr>
                `;
            });
            html += `
                        </tbody>
                    </table>
                </div>
            `;
            if (data.my_rank) {
                const myTotalDaily = data.my_rank.daily_won_count || 0;
                const myTotalFree = data.my_rank.free_played_count || 0;
                const myFreeWon = data.my_rank.free_won_count || 0;
                const myWinRatio = myTotalFree > 0 ? Math.round((myFreeWon / myTotalFree) * 100) : 0;
                const myCurrentStreak = data.leaderboard.find(e => e.id_player === window.api.idPlayer)?.streak || 0;
                html += `
                    <div class="my-ranking-badge">
                        <div class="my-badge-title">Twoja pozycja w rankingu</div>
                        <div class="my-badge-grid">
                            <div class="my-badge-item">
                                <span class="label">Miejsce</span>
                                <span class="value">🏆 #${data.my_rank.rank}</span>
                            </div>
                            <div class="my-badge-item">
                                <span class="label">Suma punktów</span>
                                <span class="value">💰 ${data.my_rank.points}</span>
                            </div>
                            <div class="my-badge-item">
                                <span class="label">Najlepszy streak</span>
                                <span class="value">🔥 ${data.my_rank.max_streak}</span>
                            </div>
                        </div>
                        <div class="my-badge-grid" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 8px;">
                            <div class="my-badge-item">
                                <span class="label">Passa teraz</span>
                                <span class="value">🔥 ${myCurrentStreak}</span>
                            </div>
                            <div class="my-badge-item">
                                <span class="label">Wygrane (Daily)</span>
                                <span class="value">📅 ${myTotalDaily}</span>
                            </div>
                            <div class="my-badge-item">
                                <span class="label">Win Ratio (Free)</span>
                                <span class="value">🎯 ${myWinRatio}%</span>
                            </div>
                        </div>
                    </div>
                `;
            }
            html += `
                <button id="close-ranking-btn-dynamic" class="btn-primary" style="margin-top: 15px;">Rozumiem</button>
            `;
            rankingBody.innerHTML = html;
            // Obsługa klikania w wiersze rankingu (rozwijanie statystyk)
            const rows = rankingBody.querySelectorAll('.clickable-row');
            rows.forEach(row => {
                row.addEventListener('click', () => {
                    const nextRow = row.nextElementSibling;
                    const isExpanded = nextRow && nextRow.classList.contains('ranking-details-row');
                    // Zamknij wszystkie inne otwarte
                    rankingBody.querySelectorAll('.ranking-details-row').forEach(r => r.remove());
                    rankingBody.querySelectorAll('.clickable-row').forEach(r => r.classList.remove('expanded'));
                    if (!isExpanded) {
                        row.classList.add('expanded');
                        const idPlayer = parseInt(row.getAttribute('data-player-id') || '0');
                        const entry = data.leaderboard.find(e => e.id_player === idPlayer);
                        if (entry) {
                            const totalDaily = entry.daily_won_count;
                            const totalFree = entry.free_played_count;
                            const freeWon = entry.free_won_count;
                            const winRatio = totalFree > 0 ? Math.round((freeWon / totalFree) * 100) : 0;
                            const detailsRow = document.createElement('tr');
                            detailsRow.className = 'ranking-details-row';
                            detailsRow.innerHTML = `
                                <td colspan="4">
                                    <div class="player-details-expand">
                                        <div class="details-grid">
                                            <div class="details-item">
                                                <span class="label">Bieżąca passa</span>
                                                <span class="value">🔥 ${entry.streak}</span>
                                            </div>
                                            <div class="details-item">
                                                <span class="label">Wygrane (Daily)</span>
                                                <span class="value">📅 ${totalDaily}</span>
                                            </div>
                                            <div class="details-item">
                                                <span class="label">Win Ratio (Free)</span>
                                                <span class="value">🎯 ${winRatio}% (${freeWon}/${totalFree})</span>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                            `;
                            row.parentNode?.insertBefore(detailsRow, row.nextSibling);
                            // Płynna mikroanimacja wysuwania
                            setTimeout(() => {
                                detailsRow.querySelector('.player-details-expand')?.classList.add('open');
                            }, 10);
                        }
                    }
                });
            });
            const closeBtnDynamic = document.getElementById('close-ranking-btn-dynamic');
            if (closeBtnDynamic) {
                closeBtnDynamic.addEventListener('click', () => {
                    rankingModal.style.display = 'none';
                });
            }
        }
        catch (e) {
            rankingBody.innerHTML = `
                <div class="ranking-error">
                    <p class="error-msg">❌ ${e.message || "Błąd połączenia spróbuj ponownie"}</p>
                    <button id="retry-ranking-btn" class="btn-primary" style="margin-top: 15px;">Spróbuj ponownie</button>
                </div>
            `;
            const retryBtn = document.getElementById('retry-ranking-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', loadAndRenderLeaderboard);
            }
        }
    }
    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    // === KONTROLE MODALI NAGŁÓWKA ===
    function setupHeaderControls() {
        // Otwieranie modali
        btnHelp.addEventListener('click', () => helpModal.style.display = 'flex');
        btnSettings.addEventListener('click', () => settingsModal.style.display = 'flex');
        btnRanking.addEventListener('click', () => {
            rankingModal.style.display = 'flex';
            loadAndRenderLeaderboard();
        });
        // Zamykanie modali
        closeHelp.addEventListener('click', () => helpModal.style.display = 'none');
        closeSettings.addEventListener('click', () => settingsModal.style.display = 'none');
        closeRanking.addEventListener('click', () => rankingModal.style.display = 'none');
        closeRankingBtn.addEventListener('click', () => rankingModal.style.display = 'none');
        // Zamykanie modalu kliknięciem poza jego treść
        window.addEventListener('click', (e) => {
            if (e.target === helpModal)
                helpModal.style.display = 'none';
            if (e.target === settingsModal)
                settingsModal.style.display = 'none';
            if (e.target === rankingModal)
                rankingModal.style.display = 'none';
        });
        // Obsługa przełącznika "Zamień przyciski"
        if (toggleSwapKeys) {
            toggleSwapKeys.addEventListener('change', (e) => {
                const target = e.target;
                swapEnterBackspace = target.checked;
                localStorage.setItem('swapEnterBackspace', swapEnterBackspace.toString());
                buildKeyboard();
            });
        }
        // Obsługa wyboru długości słowa
        if (lengthSelector) {
            lengthSelector.addEventListener('click', async (e) => {
                const target = e.target;
                if (target.tagName === 'BUTTON') {
                    const lenAttr = target.getAttribute('data-len');
                    const len = lenAttr === 'random' ? 0 : parseInt(lenAttr || '5');
                    const savedLength = parseInt(localStorage.getItem('wordLength') || '5');
                    if (len !== savedLength) {
                        // Jeśli zmieniamy długość w trakcie aktywnej gry we Free Play
                        if (currentGameType === 'free' && !isGameOver) {
                            showToast("Poddano grę (walkower)!");
                        }
                        localStorage.setItem('wordLength', len.toString());
                        updateLengthSelectorUI();
                        settingsModal.style.display = 'none'; // Zamknij modal po wyborze
                        await resetGame('free');
                    }
                }
            });
        }
        // Obsługa zapisu pseudonimu
        if (btnSaveNickname && inputNickname) {
            const saveNicknameFunc = async () => {
                const nicknameVal = inputNickname.value.trim();
                if (!nicknameVal) {
                    showToast("Pseudonim nie może być pusty.");
                    return;
                }
                if (nicknameVal.length > 20) {
                    showToast("Pseudonim może mieć maks. 20 znaków.");
                    return;
                }
                try {
                    btnSaveNickname.disabled = true;
                    const savedNick = await window.api.updateNickname(nicknameVal);
                    inputNickname.value = savedNick;
                    showToast("Pseudonim został zaktualizowany!");
                }
                catch (e) {
                    showToast(e.message || "Błąd zapisu pseudonimu.");
                }
                finally {
                    btnSaveNickname.disabled = false;
                }
            };
            btnSaveNickname.addEventListener('click', saveNicknameFunc);
            inputNickname.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveNicknameFunc();
                }
            });
        }
    }
    function updateLengthSelectorUI() {
        if (!lengthSelector)
            return;
        const savedLength = parseInt(localStorage.getItem('wordLength') || '5');
        const buttons = lengthSelector.querySelectorAll('button');
        buttons.forEach(btn => {
            const btnLenAttr = btn.getAttribute('data-len');
            const btnLen = btnLenAttr === 'random' ? 0 : parseInt(btnLenAttr || '5');
            if (btnLen === savedLength) {
                btn.classList.add('active');
            }
            else {
                btn.classList.remove('active');
            }
        });
    }
    // === WYSYŁKA SŁOWA (BACKEND WALIDACJA) ===
    async function submitGuess() {
        if (currentGuess.length !== wordLength) {
            showToast("Za krótkie słowo");
            shakeRow();
            vibrate([50, 50, 50]);
            playBeep(150, 'sawtooth', 0.3, 0.2);
            return;
        }
        if (!navigator.onLine) {
            showToast("Jesteś offline. Oczekuję na połączenie...");
            return;
        }
        isProcessing = true;
        try {
            const res = await window.api.submitWord(gameToken, currentGuess);
            if (res.status === 'error') {
                showToast(res.message || "Brak słowa w słowniku");
                shakeRow();
                vibrate([50, 50, 50]);
                playBeep(150, 'sawtooth', 0.3, 0.2);
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
                    vibrate([100, 50, 100, 50, 200]);
                    playBeep(600, 'triangle', 0.5);
                }
                else {
                    vibrate(300);
                    playBeep(200, 'sawtooth', 0.6);
                }
                setTimeout(() => triggerAdGateway(res.game_state), 1000);
            }
            else {
                currentRow++;
                currentTile = 0;
                currentGuess = "";
            }
        }
        catch (e) {
            showToast(e.message || "Błąd serwera.");
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
    async function animateRow(resultObj) {
        const row = document.getElementById(`row-${currentRow}`);
        if (!row)
            return;
        const tiles = row.children;
        for (let i = 0; i < tiles.length; i++) {
            const tile = tiles[i];
            const result = resultObj[i];
            setTimeout(() => {
                tile.classList.add('flip');
                if (result.status) {
                    tile.classList.add(result.status);
                }
            }, i * 200); // Kaskadowe opóźnienie
        }
        return new Promise(resolve => setTimeout(resolve, wordLength * 200 + 300));
    }
    function updateKeyboardColors(resultObj) {
        resultObj.forEach(res => {
            if (!res.status)
                return;
            const current = keyColors[res.char];
            if (res.status === 'correct') {
                keyColors[res.char] = 'correct';
            }
            else if (res.status === 'present' && current !== 'correct') {
                keyColors[res.char] = 'present';
            }
            else if (res.status === 'absent' && current !== 'correct' && current !== 'present') {
                keyColors[res.char] = 'absent';
            }
        });
        restoreKeyColors();
    }
    function restoreKeyColors() {
        for (const [char, status] of Object.entries(keyColors)) {
            const btn = document.querySelector(`button[data-key="${char}"]`);
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
    async function triggerAdGateway(gameState) {
        try {
            const adConfig = await window.api.getAd(gameToken);
            adToken = adConfig.verification_token;
            const adTitle = document.querySelector('.ad-content h2');
            if (adTitle) {
                adTitle.textContent = adConfig.title || "Wiadomość od Sponsora";
            }
            const adImage = document.getElementById('ad-image');
            if (adImage) {
                adImage.src = adConfig.banner_url;
                if (adConfig.target_url) {
                    adImage.style.cursor = 'pointer';
                    adImage.title = "Kliknij, aby otworzyć ofertę sponsora!";
                    adImage.onclick = () => {
                        window.open(adConfig.target_url, '_blank', 'noopener,noreferrer');
                    };
                }
                else {
                    adImage.style.cursor = '';
                    adImage.title = '';
                    adImage.onclick = null;
                }
            }
            adModal.style.display = 'flex';
            if (adCountdown && adCountdown.parentElement) {
                adCountdown.parentElement.style.display = 'block';
            }
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
                    if (adCountdown && adCountdown.parentElement) {
                        adCountdown.parentElement.style.display = 'none';
                    }
                }
            }, 1000);
        }
        catch (e) {
            showToast(e.message || "Brak połączenia spróbuj ponownie");
        }
    }
    skipAdBtn.addEventListener('click', async () => {
        try {
            adModal.style.display = 'none';
            const result = await window.api.claimReward(gameToken, adToken);
            endModal.style.display = 'flex';
            if (result.game_state === 'completed_rewarded') {
                endTitle.textContent = "Wygrałeś!";
                endTitle.style.color = "var(--correct-color)";
            }
            else {
                endTitle.textContent = "Przegrana!";
                endTitle.style.color = "var(--absent-color)";
            }
            endPoints.textContent = result.points_earned.toString();
            statStreak.textContent = result.new_streak.toString();
            statBonus.textContent = result.streak_bonus_applied;
            const pointsDisplay = document.getElementById('points-display');
            const streakDisplay = document.getElementById('streak-display');
            const stats = await window.api.getUserStats();
            if (pointsDisplay)
                pointsDisplay.textContent = `💰 ${stats.points} pkt`;
            if (streakDisplay)
                streakDisplay.textContent = `🔥 ${stats.streak}`;
        }
        catch (e) {
            showToast(e.message || "Brak połączenia spróbuj ponownie");
        }
    });
    // === POMOCNICZE OBSŁUGI KLAWIATURY PO ZAKOŃCZENIU GRY ===
    function showPlayAgainKeyboardCTA() {
        const keyboardElem = document.getElementById('keyboard');
        const keyboardBtn = document.getElementById('keyboard-play-again-btn');
        if (keyboardElem && keyboardBtn) {
            keyboardElem.style.display = 'none';
            keyboardBtn.style.display = 'block';
        }
    }
    function hidePlayAgainKeyboardCTA() {
        const keyboardElem = document.getElementById('keyboard');
        const keyboardBtn = document.getElementById('keyboard-play-again-btn');
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
    const keyboardPlayAgainBtn = document.getElementById('keyboard-play-again-btn');
    if (keyboardPlayAgainBtn) {
        keyboardPlayAgainBtn.addEventListener('click', async () => {
            await resetGame('free');
        });
    }
    async function resetGame(type) {
        keyColors = {};
        currentGameType = type;
        hidePlayAgainKeyboardCTA();
        isProcessing = false;
        try {
            const lenReq = type === 'daily' ? 5 : parseInt(localStorage.getItem('wordLength') || '5');
            const response = await window.api.startGame(type, lenReq);
            initializeSession(response);
            showToast(`Rozpoczęto nową grę (${type === 'daily' ? 'Tryb Dzienny' : 'Tryb Free Play'})`);
        }
        catch (e) {
            showToast(e.message || "Błąd resetowania gry.");
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
    function showToast(msg) {
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
    if (!navigator.onLine)
        offlineIndicator.style.display = 'block';
    initGame();
});
export {};
