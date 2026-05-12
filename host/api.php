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
    $preferredLength = intval($input['length'] ?? 5);
    $idCustomer = intval($input['id_customer'] ?? 0);
    $idPlayerClient = intval($input['id_player'] ?? 0);
    $idGame = $input['id_game'] ?? '';

    // Pobieramy lub tworzymy unikalny identyfikator gracza
    $idPlayer = getOrCreatePlayer($db, $idPlayerClient, $idCustomer);

    // A. Wznowienie istniejącej sesji (State Recovery na przeładowanie strony)
    if (!empty($idGame)) {
        $stmt = $db->prepare("SELECT * FROM `ps_bn_yin_customloyalty_wordle_sessions` WHERE `id_game` = ? LIMIT 1");
        $stmt->execute([$idGame]);
        $session = $stmt->fetch();

        if ($session) {
            $guessesDecoded = json_decode($session['guesses'], true);
            if (!is_array($guessesDecoded)) {
                $guessesDecoded = [];
            }

            // Generujemy ewaluacje dla każdego wpisanego słowa (bez ujawniania secret word!)
            $evaluatedGuesses = [];
            $targetWord = strtoupper($session['target_word']);
            $length = strlen($targetWord);

            foreach ($guessesDecoded as $gWord) {
                $gWord = strtoupper($gWord);
                $result = [];
                $targetChars = str_split($targetWord);
                $guessChars = str_split($gWord);

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
                "id_game" => $session['id_game'],
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
            // Fallback słowo dnia jeśli baza pusta
            $targetWord = "SKLEP";
        }
    } else {
        // Tryb Free Play - losujemy słowo o żądanej długości ze słownika
        $stmt = $db->prepare("SELECT `word` FROM `ps_bn_yin_customloyalty_wordle_dictionary` WHERE `length` = ? AND `is_active` = 1 ORDER BY RAND() LIMIT 1");
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

    $targetWord = strtoupper($targetWord);
    $newIdGame = 'game_' . bin2hex(random_bytes(16));

    // C. Zapisz nową sesję w bazie danych
    $stmt = $db->prepare("INSERT INTO `ps_bn_yin_customloyalty_wordle_sessions` 
        (`id_game`, `id_player`, `game_type`, `target_word`, `attempts`, `max_attempts`, `guesses`, `game_state`, `date_add`, `date_upd`) 
        VALUES (?, ?, ?, ?, 0, 6, '[]', 'playing', NOW(), NOW())");
    $stmt->execute([$newIdGame, $idPlayer, $gameType, $targetWord]);

    echo json_encode([
        "status" => "success",
        "id_game" => $newIdGame,
        "id_player" => $idPlayer,
        "length" => strlen($targetWord),
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
    $idGame = $input['id_game'] ?? '';
    $wordRaw = trim($input['word'] ?? '');

    if (empty($idGame) || empty($wordRaw)) {
        echo json_encode(["status" => "error", "code" => "MISSING_PARAMS", "message" => "Brak wymaganych parametrów."]);
        return;
    }

    $word = strtoupper($wordRaw);

    // A. Pobierz sesję gry
    $stmt = $db->prepare("SELECT * FROM `ps_bn_yin_customloyalty_wordle_sessions` WHERE `id_game` = ? LIMIT 1");
    $stmt->execute([$idGame]);
    $session = $stmt->fetch();

    if (!$session) {
        echo json_encode(["status" => "error", "code" => "SESSION_NOT_FOUND", "message" => "Sesja gry nie istnieje."]);
        return;
    }

    if ($session['game_state'] !== 'playing') {
        echo json_encode(["status" => "error", "code" => "GAME_ENDED", "message" => "Gra została już zakończona."]);
        return;
    }

    $targetWord = strtoupper($session['target_word']);
    $length = strlen($targetWord);

    if (strlen($word) !== $length) {
        echo json_encode(["status" => "error", "code" => "BAD_WORD_LENGTH", "message" => "Nieprawidłowa długość słowa."]);
        return;
    }

    // B. Walidacja liter (porównanie znaków: correct/present/absent)
    $result = [];
    $targetChars = str_split($targetWord);
    $guessChars = str_split($word);

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
    $stmt = $db->prepare("UPDATE `ps_bn_yin_customloyalty_wordle_sessions` 
        SET `attempts` = ?, `guesses` = ?, `game_state` = ?, `date_upd` = NOW() 
        WHERE `id_game` = ?");
    $stmt->execute([$newAttempts, json_encode($guesses), $newGameState, $idGame]);

    // E. SAMOBUDUJĄCY SIĘ SŁOWNIK: Zarejestruj zgłoszenie słowa i zwiększ licznik count_submitted
    // Nowe słowo trafia jako nieaktywne (oczekujące), chyba że przekroczy próg popularności np. 3 zgłoszenia
    $stmtDict = $db->prepare("INSERT INTO `ps_bn_yin_customloyalty_wordle_dictionary` 
        (`word`, `length`, `count_submitted`, `is_active`) 
        VALUES (:word, :len, 1, 0) 
        ON DUPLICATE KEY UPDATE `count_submitted` = `count_submitted` + 1");
    $stmtDict->execute([
        ':word' => $word,
        ':len' => strlen($word)
    ]);

    // Auto-aktywacja słowa jeśli przekroczyło próg 3 zgłoszeń od graczy
    $stmtActivate = $db->prepare("UPDATE `ps_bn_yin_customloyalty_wordle_dictionary` 
        SET `is_active` = 1 
        WHERE `word` = ? AND `count_submitted` >= 3 AND `is_active` = 0");
    $stmtActivate->execute([$word]);

    // F. Przygotuj odpowiedź
    $response = [
        "status" => "success",
        "game_state" => $newGameState,
        "result" => $result,
        "attempts_left" => intval($session['max_attempts']) - $newAttempts
    ];

    if ($newGameState === 'won_pending_ad' || $newGameState === 'lost_pending_ad') {
        $response["ad_trigger_url"] = "api.php?action=getAd&id_game=" . urlencode($idGame);
    }

    echo json_encode($response);
}

/**
 * Zwraca informacje o reklamie sponsorskiej i token weryfikacyjny
 */
function handleGetAd($db, $input) {
    $idGame = $input['id_game'] ?? $_GET['id_game'] ?? '';

    if (empty($idGame)) {
        echo json_encode(["status" => "error", "code" => "MISSING_GAME_ID", "message" => "Brak id_game."]);
        return;
    }

    $token = 'tok_' . bin2hex(random_bytes(10));

    // Zapisz wygenerowany token w sesji, aby zapobiec fałszowaniu ukończenia reklamy
    $stmt = $db->prepare("UPDATE `ps_bn_yin_customloyalty_wordle_sessions` SET `verification_token` = ? WHERE `id_game` = ?");
    $stmt->execute([$token, $idGame]);

    echo json_encode([
        "ad_id" => "ad_bcs_partner",
        "banner_url" => "https://bcsnagradza.pl/img/logo-1730213850.svg", // Logo BCS jako banner reklamowy
        "duration_seconds" => 5, // 5 sekund odliczania
        "verification_token" => $token
    ]);
}

/**
 * Weryfikuje ukończenie reklamy i przyznaje punkty oraz aktualizuje passę (streak)
 */
function handleClaimReward($db, $input) {
    $idGame = $input['id_game'] ?? '';
    $token = $input['token'] ?? '';

    if (empty($idGame) || empty($token)) {
        echo json_encode(["status" => "error", "code" => "MISSING_PARAMS", "message" => "Brak wymaganych parametrów."]);
        return;
    }

    // A. Zweryfikuj sesję i token reklamy
    $stmt = $db->prepare("SELECT * FROM `ps_bn_yin_customloyalty_wordle_sessions` WHERE `id_game` = ? LIMIT 1");
    $stmt->execute([$idGame]);
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
    $stmtEnd = $db->prepare("UPDATE `ps_bn_yin_customloyalty_wordle_sessions` 
        SET `game_state` = 'completed_rewarded', `verification_token` = NULL, `date_upd` = NOW() 
        WHERE `id_game` = ?");
    $stmtEnd->execute([$idGame]);

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
