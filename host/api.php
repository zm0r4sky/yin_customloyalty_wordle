<?php
/**
 * ====================================================================
 * YIN WORDLE PWA - REPUBLIKACJA API BACKEND (PHP + MYSQL)
 * ====================================================================
 * 
 * Ten skrypt obsługuje bezpieczną, walidowaną po stronie serwera grę Wordle.
 * Współpracuje z bazą danych MySQL zgodnie z nazewnictwem i typami PrestaShop 8.
 */

// === 1. KONFIGURACJA NAGŁÓWKÓW I CORS ===
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

// Obsługa zapytań wstępnych OPTIONS (Preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// === 2. POZYSKANIE DANYCH BAZY DANYCH (PRESTASHOP INTEGRATION) ===
$dbHost = 'localhost';
$dbName = 'bcs_wordle';
$dbUser = 'root';
$dbPass = '';

// A. Próba załadowania parametrów z PrestaShop 1.7 / 8 (Symfony configuration)
$parametersFile = realpath(__DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . '..') . DIRECTORY_SEPARATOR . 'app' . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'parameters.php';
if (file_exists($parametersFile)) {
    $params = include $parametersFile;
    if (is_array($params) && isset($params['parameters'])) {
        $p = $params['parameters'];
        $dbHost = $p['database_host'] ?? $dbHost;
        $dbName = $p['database_name'] ?? $dbName;
        $dbUser = $p['database_user'] ?? $dbUser;
        $dbPass = $p['database_password'] ?? $dbPass;
    }
} else {
    // B. Próba załadowania przez legacy bootstrap PrestaShop (starsze wersje / fallback)
    $configFile = realpath(__DIR__ . '/../../config/config.inc.php');
    if (file_exists($configFile)) {
        require_once $configFile;
        if (defined('_DB_SERVER_')) {
            $dbHost = _DB_SERVER_;
            $dbName = _DB_NAME_;
            $dbUser = _DB_USER_;
            $dbPass = _DB_PASSWD_;
        }
    }
}

define('DB_HOST', $dbHost);
define('DB_NAME', $dbName);
define('DB_USER', $dbUser);
define('DB_PASS', $dbPass);

try {
    $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    $db = new PDO($dsn, DB_USER, DB_PASS, $options);
} catch (PDOException $e) {
    echo json_encode([
        "status" => "error",
        "code" => "DB_CONNECTION_FAILED",
        "message" => "Błąd połączenia z bazą danych: " . $e->getMessage()
    ]);
    exit();
}

// === 3. DEKODOWANIE ZAPYTANIA JSON ===
$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? $_GET['action'] ?? '';

if (empty($action)) {
    echo json_encode([
        "status" => "error",
        "code" => "MISSING_ACTION",
        "message" => "Nie określono akcji (action)."
    ]);
    exit();
}

// === 4. ROUTER AKCJI ===
switch ($action) {
    case 'startGame':
        handleStartGame($db, $input);
        break;

    case 'submitWord':
        handleSubmitWord($db, $input);
        break;

    case 'getAd':
        handleGetAd($db, $input);
        break;

    case 'claimReward':
        handleClaimReward($db, $input);
        break;

    case 'getUserStats':
        handleGetUserStats($db, $input);
        break;

    case 'getLeaderboard':
        handleGetLeaderboard($db, $input);
        break;

    default:
        echo json_encode([
            "status" => "error",
            "code" => "INVALID_ACTION",
            "message" => "Nieprawidłowa akcja."
        ]);
        break;
}

// === 5. IMPLEMENTACJA FUNKCJI INICJUJĄCYCH I AKCJI ===

/**
 * Pobiera lub tworzy unikalny profil gracza i zwraca jego id_player
 */
function getOrCreatePlayer($db, $idPlayerClient, $idCustomer) {
    if ($idCustomer > 0) {
        // Dla zalogowanego użytkownika PrestaShop szukamy po id_customer
        $stmt = $db->prepare("SELECT `id_player` FROM `ps_bn_yin_customloyalty_wordle_player_stats` WHERE `id_customer` = ? LIMIT 1");
        $stmt->execute([$idCustomer]);
        $idPlayer = $stmt->fetchColumn();

        if (!$idPlayer) {
            // Tworzymy profil w stats dla zalogowanego klienta
            $stmtInsert = $db->prepare("INSERT INTO `ps_bn_yin_customloyalty_wordle_player_stats` (`id_customer`) VALUES (?)");
            $stmtInsert->execute([$idCustomer]);
            $idPlayer = $db->lastInsertId();
        }
        return intval($idPlayer);
    } else {
        // Dla gościa sprawdzamy czy przesłał już istniejący id_player ze swojego LocalStorage
        if ($idPlayerClient > 0) {
            $stmt = $db->prepare("SELECT `id_player` FROM `ps_bn_yin_customloyalty_wordle_player_stats` WHERE `id_player` = ? LIMIT 1");
            $stmt->execute([$idPlayerClient]);
            $exists = $stmt->fetchColumn();
            if ($exists) {
                return intval($idPlayerClient);
            }
        }

        // Jeśli gość nie ma profilu (pierwszy raz), tworzymy go w bazie z id_customer = 0
        $stmtInsert = $db->prepare("INSERT INTO `ps_bn_yin_customloyalty_wordle_player_stats` (`id_customer`) VALUES (0)");
        $stmtInsert->execute([]);
        return intval($db->lastInsertId());
    }
}

/**
 * Rozpoczyna nową grę lub wznawia istniejącą po przeładowaniu strony
 */
function handleStartGame($db, $input) {
    $gameType = $input['game_type'] ?? 'daily';
    $rawLengthInput = isset($input['length']) ? intval($input['length']) : 5;
    $preferredLength = $rawLengthInput;
    $idCustomer = intval($input['id_customer'] ?? 0);
    $idPlayerClient = intval($input['id_player'] ?? 0);
    $gameToken = $input['game_token'] ?? '';

    // Pobieramy lub tworzymy unikalny identyfikator gracza
    $idPlayer = getOrCreatePlayer($db, $idPlayerClient, $idCustomer);

    // 1. ZABEZPIECZENIE: Zmiana długości słowa w trakcie aktywnej gry oznacza walkower (przegraną)!
    if ($gameType === 'free' && $idPlayer > 0) {
        $stmtActiveGame = $db->prepare("SELECT * FROM `ps_bn_yin_customloyalty_wordle_games` 
            WHERE `id_player` = ? AND `game_type` = 'free' AND `game_state` = 'playing' 
            LIMIT 1");
        $stmtActiveGame->execute([$idPlayer]);
        $activeGame = $stmtActiveGame->fetch();

        if ($activeGame) {
            $activeLength = mb_strlen($activeGame['target_word'], 'UTF-8');
            
            // Jeśli gracz przesłał nową preferencję długości (np. 6 lub 0 dla Losowo) różną od aktualnej gry
            if ($rawLengthInput !== $activeLength) {
                // Walkower: zwiększamy licznik rozegranych gier we Free Play (ale nie wygranych!)
                $stmtForfeitStats = $db->prepare("UPDATE `ps_bn_yin_customloyalty_wordle_player_stats` 
                    SET `free_played_count` = `free_played_count` + 1 
                    WHERE `id_player` = ?");
                $stmtForfeitStats->execute([$idPlayer]);

                // Oznaczamy tamtą sesję jako zakończoną porażką
                $stmtForfeitGame = $db->prepare("UPDATE `ps_bn_yin_customloyalty_wordle_games` 
                    SET `game_state` = 'completed_rewarded', `date_upd` = NOW() 
                    WHERE `id_game` = ?");
                $stmtForfeitGame->execute([$activeGame['id_game']]);

                // Usuwamy token starej gry, by zmusić do rozpoczęcia nowej sesji o nowej długości
                $gameToken = '';
            } else {
                // Ta sama długość - wznawiamy grę
                $gameToken = $activeGame['game_token'];
            }
        }
    }

    // 2. Jeśli wybrano tryb "Losowo" (length = 0), losujemy liczbę liter od 5 do 12
    if ($gameType === 'free' && $preferredLength === 0) {
        $preferredLength = rand(5, 12);
    }

    // Jeśli gracz ma zarejestrowany profil w bazie danych
    if ($idPlayer > 0) {
        if ($gameType === 'daily') {
            // Tryb Codzienny: ZAWSZE wznawiamy/zwracamy jedyną dzisiejszą sesję, jeśli jakakolwiek istnieje (nawet ukończona)!
            // Zapobiega to oszustwom i ponownemu uruchamianiu gry codziennej po odświeżeniu strony.
            $stmtActive = $db->prepare("SELECT `game_token` FROM `ps_bn_yin_customloyalty_wordle_games` 
                WHERE `id_player` = ? AND `game_type` = 'daily' AND DATE(`date_add`) = CURRENT_DATE() 
                LIMIT 1");
            $stmtActive->execute([$idPlayer]);
            $dbActiveToken = $stmtActive->fetchColumn();
            if ($dbActiveToken) {
                $gameToken = $dbActiveToken;
            }
        } elseif (empty($gameToken)) {
            // Tryb Free Play: wznawiamy KAŻDĄ aktywną, niedokończoną grę (nawet jeśli rozpoczęto ją wczoraj)
            $stmtActive = $db->prepare("SELECT `game_token` FROM `ps_bn_yin_customloyalty_wordle_games` 
                WHERE `id_player` = ? AND `game_type` = 'free' AND `game_state` = 'playing' 
                LIMIT 1");
            $stmtActive->execute([$idPlayer]);
            $dbActiveToken = $stmtActive->fetchColumn();
            if ($dbActiveToken) {
                $gameToken = $dbActiveToken;
            }
        }
    }

    // A. Wznowienie istniejącej sesji (State Recovery na przeładowanie strony lub odzyskanie z bazy danych)
    if (!empty($gameToken)) {
        $stmt = $db->prepare("SELECT * FROM `ps_bn_yin_customloyalty_wordle_games` WHERE `game_token` = ? LIMIT 1");
        $stmt->execute([$gameToken]);
        $session = $stmt->fetch();

        if ($session) {
            $guessesDecoded = json_decode($session['guesses'], true);
            if (!is_array($guessesDecoded)) {
                $guessesDecoded = [];
            }

            // Generujemy ewaluacje dla każdego wpisanego słowa (bez ujawniania secret word!)
            $evaluatedGuesses = [];
            $targetWord = mb_strtoupper($session['target_word'], 'UTF-8');
            $length = mb_strlen($targetWord, 'UTF-8');

            foreach ($guessesDecoded as $gWord) {
                $gWord = mb_strtoupper($gWord, 'UTF-8');
                $result = [];
                $targetChars = mb_str_split($targetWord, 1, 'UTF-8');
                $guessChars = mb_str_split($gWord, 1, 'UTF-8');

                for ($i = 0; $i < $length; $i++) {
                    $result[$i] = ["char" => $guessChars[$i], "status" => null];
                }

                // Pass 1: Zielone (correct)
                for ($i = 0; $i < $length; $i++) {
                    if ($guessChars[$i] === $targetChars[$i]) {
                        $result[$i]["status"] = "correct";
                        $targetChars[$i] = null;
                    }
                }

                // Pass 2: Żółte/Szare (present/absent)
                for ($i = 0; $i < $length; $i++) {
                    if ($result[$i]["status"] !== "correct") {
                        $foundIndex = array_search($guessChars[$i], $targetChars);
                        if ($foundIndex !== false) {
                            $result[$i]["status"] = "present";
                            $targetChars[$foundIndex] = null;
                        } else {
                            $result[$i]["status"] = "absent";
                        }
                    }
                }

                $evaluatedGuesses[] = [
                    "word" => $gWord,
                    "result" => $result
                ];
            }

            echo json_encode([
                "status" => "success",
                "game_token" => $session['game_token'],
                "id_player" => intval($session['id_player']),
                "length" => $length,
                "max_attempts" => intval($session['max_attempts']),
                "attempts_left" => intval($session['max_attempts']) - intval($session['attempts']),
                "game_state" => $session['game_state'],
                "guesses" => $evaluatedGuesses
            ]);
            return;
        }
    }

    // B. Losowanie słowa do nowej gry
    $targetWord = "";
    if ($gameType === 'daily') {
        // Sprawdź czy zaplanowano słowo dnia na dzisiejszy dzień
        $stmt = $db->prepare("SELECT `word` FROM `ps_bn_yin_customloyalty_wordle_daily` WHERE `scheduled_date` = CURRENT_DATE() LIMIT 1");
        $stmt->execute();
        $targetWord = $stmt->fetchColumn();

        if (empty($targetWord)) {
            // BRAK SŁOWA DNIA: Losujemy jedno aktywne, nie zablokowane słowo 5-literowe ze słownika i zapisujemy jako dzisiejsze słowo dnia!
            $stmtRand = $db->prepare("SELECT `word` FROM `ps_bn_yin_customloyalty_wordle_dictionary` WHERE `length` = 5 AND `active` = 1 AND `banned` = 0 ORDER BY RAND() LIMIT 1");
            $stmtRand->execute();
            $targetWord = $stmtRand->fetchColumn();

            if (!empty($targetWord)) {
                // Zapisujemy w _daily, aby wszyscy gracze dzisiaj mieli to samo wylosowane słowo!
                $stmtInsertDaily = $db->prepare("INSERT INTO `ps_bn_yin_customloyalty_wordle_daily` (`scheduled_date`, `word`, `length`) VALUES (CURRENT_DATE(), ?, 5)");
                $stmtInsertDaily->execute([$targetWord]);
            } else {
                // Ostateczny fallback gdyby słownik też był całkowicie pusty
                $targetWord = "SKLEP";
            }
        }
    } else {
        // Tryb Free Play - losujemy słowo o żądanej długości ze słownika, które jest aktywne i nie zablokowane
        $stmt = $db->prepare("SELECT `word` FROM `ps_bn_yin_customloyalty_wordle_dictionary` WHERE `length` = ? AND `active` = 1 AND `banned` = 0 ORDER BY RAND() LIMIT 1");
        $stmt->execute([$preferredLength]);
        $targetWord = $stmt->fetchColumn();

        if (empty($targetWord)) {
            // Predefiniowane bezpieczne słowa zapasowe w zależności od długości
            $fallbacks = [
                5 => "SKLEP", 6 => "KAMERA", 7 => "MONITOR", 8 => "ZASILACZ",
                9 => "ŁADOWARKA", 10 => "CERTYFIKAT", 11 => "INFORMATYKA", 12 => "KLIMATYZACJA"
            ];
            $targetWord = $fallbacks[$preferredLength] ?? "WORDLE";
        }
    }

    $targetWord = mb_strtoupper($targetWord, 'UTF-8');
    $newGameToken = 'game_' . bin2hex(random_bytes(16));

    // C. Zapisz nową sesję w bazie danych
    $stmt = $db->prepare("INSERT INTO `ps_bn_yin_customloyalty_wordle_games` 
        (`game_token`, `id_player`, `game_type`, `target_word`, `attempts`, `max_attempts`, `guesses`, `game_state`, `date_add`, `date_upd`) 
        VALUES (?, ?, ?, ?, 0, 6, '[]', 'playing', NOW(), NOW())");
    $stmt->execute([$newGameToken, $idPlayer, $gameType, $targetWord]);

    echo json_encode([
        "status" => "success",
        "game_token" => $newGameToken,
        "id_player" => $idPlayer,
        "length" => mb_strlen($targetWord, 'UTF-8'),
        "max_attempts" => 6,
        "attempts_left" => 6,
        "game_state" => "playing",
        "guesses" => []
    ]);
}

/**
 * Przetwarza i waliduje słowo wpisane przez użytkownika
 */
function handleSubmitWord($db, $input) {
    $gameToken = $input['game_token'] ?? '';
    $wordRaw = trim($input['word'] ?? '');

    if (empty($gameToken) || empty($wordRaw)) {
        echo json_encode(["status" => "error", "code" => "MISSING_PARAMS", "message" => "Brak wymaganych parametrów."]);
        return;
    }

    $word = mb_strtoupper($wordRaw, 'UTF-8');

    // 0. Sprawdzenie czy słowo jest na czarnej liście (banned = 1)
    $stmtCheckBanned = $db->prepare("SELECT `banned` FROM `ps_bn_yin_customloyalty_wordle_dictionary` WHERE `word` = ? LIMIT 1");
    $stmtCheckBanned->execute([$word]);
    $bannedStatus = $stmtCheckBanned->fetchColumn();

    if ($bannedStatus !== false && intval($bannedStatus) === 1) {
        echo json_encode(["status" => "error", "code" => "BANNED_WORD", "message" => "To słowo jest niedozwolone w grze."]);
        return;
    }

    // A. Pobierz sesję gry
    $stmt = $db->prepare("SELECT * FROM `ps_bn_yin_customloyalty_wordle_games` WHERE `game_token` = ? LIMIT 1");
    $stmt->execute([$gameToken]);
    $session = $stmt->fetch();

    if (!$session) {
        echo json_encode(["status" => "error", "code" => "SESSION_NOT_FOUND", "message" => "Sesja gry nie istnieje."]);
        return;
    }

    if ($session['game_state'] !== 'playing') {
        echo json_encode(["status" => "error", "code" => "GAME_ENDED", "message" => "Gra została już zakończona."]);
        return;
    }

    $targetWord = mb_strtoupper($session['target_word'], 'UTF-8');
    $length = mb_strlen($targetWord, 'UTF-8');

    if (mb_strlen($word, 'UTF-8') !== $length) {
        echo json_encode(["status" => "error", "code" => "BAD_WORD_LENGTH", "message" => "Nieprawidłowa długość słowa."]);
        return;
    }

    // B. Walidacja liter (porównanie znaków: correct/present/absent)
    $result = [];
    $targetChars = mb_str_split($targetWord, 1, 'UTF-8');
    $guessChars = mb_str_split($word, 1, 'UTF-8');

    // Inicjalizacja pustych wyników
    for ($i = 0; $i < $length; $i++) {
        $result[$i] = ["char" => $guessChars[$i], "status" => null];
    }

    // Pass 1: Zielone litery (dokładne trafienia)
    $won = true;
    for ($i = 0; $i < $length; $i++) {
        if ($guessChars[$i] === $targetChars[$i]) {
            $result[$i]["status"] = "correct";
            $targetChars[$i] = null; // wyklucz z dalszego wyszukiwania
        } else {
            $won = false;
        }
    }

    // Pass 2: Żółte litery (obecne, ale w złym miejscu)
    for ($i = 0; $i < $length; $i++) {
        if ($result[$i]["status"] !== "correct") {
            $foundIndex = array_search($guessChars[$i], $targetChars);
            if ($foundIndex !== false) {
                $result[$i]["status"] = "present";
                $targetChars[$foundIndex] = null; // wyklucz użyty znak
            } else {
                $result[$i]["status"] = "absent";
            }
        }
    }

    // C. Dekoduj, zaktualizuj i zakoduj próby
    $guesses = json_decode($session['guesses'], true);
    if (!is_array($guesses)) {
        $guesses = [];
    }
    $guesses[] = $word;
    $newAttempts = count($guesses);

    // Określenie nowego stanu gry
    $newGameState = 'playing';
    if ($won) {
        $newGameState = 'won_pending_ad';
    } elseif ($newAttempts >= intval($session['max_attempts'])) {
        $newGameState = 'lost_pending_ad';
    }

    // D. Zapisz zaktualizowaną sesję w bazie danych
    $stmt = $db->prepare("UPDATE `ps_bn_yin_customloyalty_wordle_games` 
        SET `attempts` = ?, `guesses` = ?, `game_state` = ?, `date_upd` = NOW() 
        WHERE `game_token` = ?");
    $stmt->execute([$newAttempts, json_encode($guesses), $newGameState, $gameToken]);

    // E. SAMOBUDUJĄCY SIĘ SŁOWNIK: Zarejestruj zgłoszenie słowa i zwiększ licznik count_submitted
    // Nowe słowo trafia jako nieaktywne (oczekujące), chyba że przekroczy próg popularności np. 3 zgłoszenia
    $stmtDict = $db->prepare("INSERT INTO `ps_bn_yin_customloyalty_wordle_dictionary` 
        (`word`, `length`, `count_submitted`, `active`, `banned`) 
        VALUES (:word, :len, 1, 0, 0) 
        ON DUPLICATE KEY UPDATE `count_submitted` = `count_submitted` + 1");
    $stmtDict->execute([
        ':word' => $word,
        ':len' => mb_strlen($word, 'UTF-8')
    ]);

    // Auto-aktywacja słowa jeśli przekroczyło próg 3 zgłoszeń od graczy i nie jest zablokowane (banned)
    $stmtActivate = $db->prepare("UPDATE `ps_bn_yin_customloyalty_wordle_dictionary` 
        SET `active` = 1 
        WHERE `word` = ? AND `count_submitted` >= 3 AND `active` = 0 AND `banned` = 0");
    $stmtActivate->execute([$word]);

    // F. Przygotuj odpowiedź
    $response = [
        "status" => "success",
        "game_state" => $newGameState,
        "result" => $result,
        "attempts_left" => intval($session['max_attempts']) - $newAttempts
    ];

    if ($newGameState === 'won_pending_ad' || $newGameState === 'lost_pending_ad') {
        $response["ad_trigger_url"] = "api.php?action=getAd&game_token=" . urlencode($gameToken);
    }

    echo json_encode($response);
}

/**
 * Zwraca informacje o reklamie sponsorskiej i token weryfikacyjny
 */
function handleGetAd($db, $input) {
    $gameToken = $input['game_token'] ?? $_GET['game_token'] ?? '';

    if (empty($gameToken)) {
        echo json_encode(["status" => "error", "code" => "MISSING_GAME_TOKEN", "message" => "Brak game_token."]);
        return;
    }

    $token = 'tok_' . bin2hex(random_bytes(10));

    // Zapisz wygenerowany token w sesji, aby zapobiec fałszowaniu ukończenia reklamy
    $stmt = $db->prepare("UPDATE `ps_bn_yin_customloyalty_wordle_games` SET `verification_token` = ? WHERE `game_token` = ?");
    $stmt->execute([$token, $gameToken]);

    // Pobierz losową aktywną reklamę z bazy danych MySQL z bezpiecznym fallbackiem
    $title = "Wiadomość od Sponsora"; // Fallback title
    $bannerUrl = "https://bcsnagradza.pl/img/logo-1730213850.svg"; // Fallback banner
    $targetUrl = "https://bcsnagradza.pl/"; // Fallback link
    $durationSeconds = 5; // Fallback duration
    $adId = "ad_fallback";

    try {
        $stmtAd = $db->prepare("SELECT * FROM `ps_bn_yin_customloyalty_wordle_ads` WHERE `active` = 1 ORDER BY RAND() LIMIT 1");
        $stmtAd->execute();
        $ad = $stmtAd->fetch();

        if ($ad) {
            $title = $ad['title'];
            $bannerUrl = $ad['banner_url'];
            $targetUrl = $ad['target_url'];
            $durationSeconds = intval($ad['duration_seconds']);
            $adId = "ad_" . $ad['id_ad'];
        }
    } catch (Exception $e) {
        // Cichy fallback na wypadek, gdyby tabela ads nie została jeszcze utworzona w bazie danych
    }

    echo json_encode([
        "ad_id" => $adId,
        "title" => $title,
        "banner_url" => $bannerUrl,
        "target_url" => $targetUrl,
        "duration_seconds" => $durationSeconds,
        "verification_token" => $token
    ]);
}

/**
 * Weryfikuje ukończenie reklamy i przyznaje punkty oraz aktualizuje passę (streak)
 */
function handleClaimReward($db, $input) {
    $gameToken = $input['game_token'] ?? '';
    $token = $input['token'] ?? '';

    if (empty($gameToken) || empty($token)) {
        echo json_encode(["status" => "error", "code" => "MISSING_PARAMS", "message" => "Brak wymaganych parametrów."]);
        return;
    }

    // A. Zweryfikuj sesję i token reklamy
    $stmt = $db->prepare("SELECT * FROM `ps_bn_yin_customloyalty_wordle_games` WHERE `game_token` = ? LIMIT 1");
    $stmt->execute([$gameToken]);
    $session = $stmt->fetch();

    if (!$session) {
        echo json_encode(["status" => "error", "code" => "SESSION_NOT_FOUND", "message" => "Sesja gry nie istnieje."]);
        return;
    }

    if ($session['verification_token'] !== $token) {
        echo json_encode(["status" => "error", "code" => "INVALID_AD_TOKEN", "message" => "Błąd weryfikacji ukończenia reklamy."]);
        return;
    }

    if ($session['game_state'] === 'completed_rewarded') {
        echo json_encode(["status" => "error", "code" => "ALREADY_CLAIMED", "message" => "Nagroda za tę grę została już odebrana."]);
        return;
    }

    // B. Oblicz punkty, streak i liczniki gier
    $idPlayer = intval($session['id_player']);
    $gameType = $session['game_type'];

    // Pobierz aktualne statystyki gracza
    $stmtStats = $db->prepare("SELECT * FROM `ps_bn_yin_customloyalty_wordle_player_stats` WHERE `id_player` = ? LIMIT 1");
    $stmtStats->execute([$idPlayer]);
    $stats = $stmtStats->fetch();

    $currentStreak = 0;
    if ($stats) {
        $currentStreak = intval($stats['streak']);
    }

    $earnedPoints = 0;
    $streakBonus = 0;
    $dailyWonIncrement = 0;
    $freeWonIncrement = 0;
    $freePlayedIncrement = 0;

    if ($gameType === 'daily') {
        if ($session['game_state'] === 'won_pending_ad') {
            // Oblicz punkty: 100 bazowe minus 10 za każdą dodatkową próbę (od 100 do 50 punktów)
            $attemptsCount = intval($session['attempts']);
            $earnedPoints = 100 - (($attemptsCount - 1) * 10);
            if ($earnedPoints < 50) $earnedPoints = 50;

            $currentStreak += 1;
            $streakBonus = min($currentStreak * 5, 25); // Max 25% bonusu punktowego za streak
            
            $bonusPoints = intval($earnedPoints * ($streakBonus / 100));
            $earnedPoints += $bonusPoints;

            $dailyWonIncrement = 1;
        } else {
            // Przegrana - zerowanie passy
            $currentStreak = 0;
            $earnedPoints = 0;
        }
    } else {
        // Gra typu Free - zwiększamy tylko licznik rozegranych gier free, brak wpływu na punkty i streak
        $freePlayedIncrement = 1;
        if ($session['game_state'] === 'won_pending_ad') {
            $freeWonIncrement = 1;
        }
        $earnedPoints = 0;
    }

    // C. Zaktualizuj statystyki gracza (MySQL)
    $stmtSaveStats = $db->prepare("UPDATE `ps_bn_yin_customloyalty_wordle_player_stats` 
        SET `points` = `points` + ?,
            `max_streak` = GREATEST(`max_streak`, ?),
            `streak` = ?,
            `daily_won_count` = `daily_won_count` + ?,
            `free_won_count` = `free_won_count` + ?,
            `free_played_count` = `free_played_count` + ?,
            `last_played_date` = IF(? = 'daily', CURRENT_DATE(), `last_played_date`)
        WHERE `id_player` = ?");
    $stmtSaveStats->execute([
        $earnedPoints,
        $currentStreak,
        $currentStreak,
        $dailyWonIncrement,
        $freeWonIncrement,
        $freePlayedIncrement,
        $gameType,
        $idPlayer
    ]);

    // D. Oznacz sesję jako pomyślnie nagrodzoną / zakończoną
    $stmtEnd = $db->prepare("UPDATE `ps_bn_yin_customloyalty_wordle_games` 
        SET `game_state` = 'completed_rewarded', `verification_token` = NULL, `date_upd` = NOW() 
        WHERE `game_token` = ?");
    $stmtEnd->execute([$gameToken]);

    echo json_encode([
        "status" => "success",
        "game_state" => "completed_rewarded",
        "points_earned" => $earnedPoints,
        "new_streak" => $currentStreak,
        "streak_bonus_applied" => $streakBonus . "%"
    ]);
}

/**
 * Zwraca punkty, passę i liczniki gier gracza
 */
function handleGetUserStats($db, $input) {
    $idCustomer = intval($input['id_customer'] ?? $_GET['id_customer'] ?? 0);
    $idPlayerClient = intval($input['id_player'] ?? $_GET['id_player'] ?? 0);

    // Pobieramy lub tworzymy gracza
    $idPlayer = getOrCreatePlayer($db, $idPlayerClient, $idCustomer);

    $stmt = $db->prepare("SELECT * FROM `ps_bn_yin_customloyalty_wordle_player_stats` WHERE `id_player` = ? LIMIT 1");
    $stmt->execute([$idPlayer]);
    $stats = $stmt->fetch();

    if ($stats) {
        echo json_encode([
            "id_player" => intval($stats['id_player']),
            "points" => intval($stats['points']),
            "streak" => intval($stats['streak']),
            "daily_won_count" => intval($stats['daily_won_count']),
            "free_won_count" => intval($stats['free_won_count']),
            "free_played_count" => intval($stats['free_played_count'])
        ]);
    } else {
        echo json_encode([
            "id_player" => $idPlayer,
            "points" => 0,
            "streak" => 0,
            "daily_won_count" => 0,
            "free_won_count" => 0,
            "free_played_count" => 0
        ]);
    }
}

/**
 * Pobiera Top 10 ranking graczy oraz pozycję gracza przekazanego w parametrze
 */
function handleGetLeaderboard($db, $input) {
    $idPlayerClient = intval($input['id_player'] ?? 0);

    // Pobierz Top 10
    try {
        $stmt = $db->prepare("
            SELECT 
                s.`id_player`,
                s.`id_customer`,
                s.`points`,
                s.`streak`,
                s.`max_streak`,
                c.`firstname`,
                c.`lastname`
            FROM `ps_bn_yin_customloyalty_wordle_player_stats` s
            LEFT JOIN `ps_customer` c ON s.`id_customer` = c.`id_customer`
            ORDER BY s.`points` DESC, s.`max_streak` DESC, s.`id_player` ASC
            LIMIT 10
        ");
        $stmt->execute();
        $rawRows = $stmt->fetchAll();
    } catch (Exception $e) {
        $stmt = $db->prepare("
            SELECT 
                `id_player`,
                `id_customer`,
                `points`,
                `streak`,
                `max_streak`,
                '' as `firstname`,
                '' as `lastname`
            FROM `ps_bn_yin_customloyalty_wordle_player_stats`
            ORDER BY `points` DESC, `max_streak` DESC, `id_player` ASC
            LIMIT 10
        ");
        $stmt->execute();
        $rawRows = $stmt->fetchAll();
    }

    $leaderboard = [];
    $rank = 1;
    foreach ($rawRows as $row) {
        $name = '';
        if (!empty($row['firstname'])) {
            $lastNameInitial = !empty($row['lastname']) ? ' ' . mb_substr($row['lastname'], 0, 1) . '.' : '';
            $name = mb_convert_case($row['firstname'], MB_CASE_TITLE, "UTF-8") . $lastNameInitial;
        } else {
            $name = "Gracz #" . $row['id_player'];
        }

        $leaderboard[] = [
            "rank" => $rank++,
            "id_player" => intval($row['id_player']),
            "name" => $name,
            "points" => intval($row['points']),
            "streak" => intval($row['streak']),
            "max_streak" => intval($row['max_streak'])
        ];
    }

    // Pobierz własną pozycję gracza
    $myRankInfo = null;
    if ($idPlayerClient > 0) {
        $stmtPlayer = $db->prepare("SELECT `points`, `max_streak` FROM `ps_bn_yin_customloyalty_wordle_player_stats` WHERE `id_player` = ? LIMIT 1");
        $stmtPlayer->execute([$idPlayerClient]);
        $playerStats = $stmtPlayer->fetch();
        
        if ($playerStats) {
            $playerPoints = intval($playerStats['points']);
            $playerMaxStreak = intval($playerStats['max_streak']);
            
            $stmtRank = $db->prepare("
                SELECT COUNT(*) + 1 
                FROM `ps_bn_yin_customloyalty_wordle_player_stats` 
                WHERE `points` > ? OR (`points` = ? AND `max_streak` > ?) OR (`points` = ? AND `max_streak` = ? AND `id_player` < ?)
            ");
            $stmtRank->execute([$playerPoints, $playerPoints, $playerMaxStreak, $playerPoints, $playerMaxStreak, $idPlayerClient]);
            $myRank = intval($stmtRank->fetchColumn());

            $myRankInfo = [
                "rank" => $myRank,
                "points" => $playerPoints,
                "max_streak" => $playerMaxStreak
            ];
        }
    }

    echo json_encode([
        "status" => "success",
        "leaderboard" => $leaderboard,
        "my_rank" => $myRankInfo
    ]);
}
