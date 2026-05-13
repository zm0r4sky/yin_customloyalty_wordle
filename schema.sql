-- ====================================================================
-- YIN WORDLE PWA - ARCHITEKTURA BAZY DANYCH (PRESTASHOP COMPATIBLE)
-- ====================================================================

-- 1. SŁOWNIK: Słowa w języku polskim (samobudujący się słownik)
-- Jako PRIMARY KEY używamy bezpośrednio kolumny `word` (słowa są unikalne, brak potrzeby sztucznego id)
CREATE TABLE IF NOT EXISTS `ps_bn_yin_customloyalty_wordle_dictionary` (
    `word` VARCHAR(12) NOT NULL,
    `length` TINYINT UNSIGNED NOT NULL,
    `count_submitted` INT UNSIGNED DEFAULT 1, -- Licznik zgłoszeń tego słowa przez graczy
    `active` TINYINT(1) DEFAULT 0,            -- 0 = oczekuje na weryfikację / próg, 1 = aktywne w puli losowej
    `banned` TINYINT(1) DEFAULT 0,            -- 0 = dozwolone, 1 = zablokowane (wulgaryzmy, ciągi losowe)
    PRIMARY KEY (`word`),
    INDEX `idx_len` (`length`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. SŁOWO DNIA: Przypisanie konkretnych słów do poszczególnych dat kalendarzowych
-- scheduled_date jest unikalną i idealną wartością na PRIMARY KEY (brak potrzeby sztucznego id)
CREATE TABLE IF NOT EXISTS `ps_bn_yin_customloyalty_wordle_daily` (
    `scheduled_date` DATE NOT NULL,
    `word` VARCHAR(12) NOT NULL,
    `length` TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (`scheduled_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. GRY (ROZGRYWKI): Serwerowe źródło prawdy (Source of Truth) eliminujące oszustwa (cheating)
CREATE TABLE IF NOT EXISTS `ps_bn_yin_customloyalty_wordle_games` (
    `id_game` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, -- Identyfikator gry (klucz główny auto-increment dla szybkiego klastrowania)
    `game_token` VARCHAR(64) NOT NULL,                 -- Losowy token zabezpieczający sesję gry, wysyłany do przeglądarki klienta
    `id_player` INT UNSIGNED NOT NULL,                 -- Powiązane z ps_bn_yin_customloyalty_wordle_player_stats
    `game_type` ENUM('daily', 'free') NOT NULL,
    `target_word` VARCHAR(12) NOT NULL,
    `attempts` TINYINT UNSIGNED DEFAULT 0,
    `max_attempts` TINYINT UNSIGNED DEFAULT 6,
    `guesses` TEXT DEFAULT NULL,                       -- Wprowadzone dotychczas słowa (zapisane jako tablica JSON ["SKLEP","PUDŁO"])
    `game_state` ENUM('playing', 'won_pending_ad', 'lost_pending_ad', 'completed_rewarded') DEFAULT 'playing',
    `verification_token` VARCHAR(64) DEFAULT NULL,
    `date_add` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `date_upd` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `idx_game_token` (`game_token`),
    INDEX `idx_id_player` (`id_player`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. STATYSTYKI GRACZY: Punkty, aktualna oraz maksymalna passa (streak), historyczne liczniki gier
CREATE TABLE IF NOT EXISTS `ps_bn_yin_customloyalty_wordle_player_stats` (
    `id_player` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `id_customer` INT UNSIGNED NOT NULL DEFAULT 0, -- 0 dla gości, powiązane z ps_customer dla zalogowanych
    `points` INT UNSIGNED DEFAULT 0,
    `streak` INT UNSIGNED DEFAULT 0,
    `max_streak` INT UNSIGNED DEFAULT 0,
    `last_played_date` DATE DEFAULT NULL,
    `daily_won_count` INT UNSIGNED DEFAULT 0,    -- Łączna liczba wygranych gier codziennych (Daily)
    `free_won_count` INT UNSIGNED DEFAULT 0,     -- Łączna liczba wygranych gier wolnych (Free Play)
    `free_played_count` INT UNSIGNED DEFAULT 0,  -- Łączna liczba ukończonych gier wolnych (Free Play) (wygrane + przegrane, bez porzuconych)
    INDEX `idx_id_customer` (`id_customer`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================================================================
-- INICJALNE DANE TESTOWE (MOCK DATA DLA URUCHOMIENIA GRY)
-- ====================================================================

-- A. PRZYKŁADOWE SŁOWA SŁOWNIKA (Wszystkie od razu aktywne, active = 1, banned = 0)
INSERT INTO `ps_bn_yin_customloyalty_wordle_dictionary` (`word`, `length`, `count_submitted`, `active`, `banned`) VALUES
('SKLEP', 5, 10, 1, 0),
('EKRAN', 5, 8, 1, 0),
('OBRAZ', 5, 5, 1, 0),
('KABEL', 5, 4, 1, 0),
('WIDEO', 5, 7, 1, 0),
('AUDIO', 5, 3, 1, 0),
('RUTER', 5, 6, 1, 0),
('POLAK', 5, 12, 1, 0),
('DOBRO', 5, 9, 1, 0),
('SŁOWO', 5, 15, 1, 0),
('KAMERA', 6, 8, 1, 0),
('PORTAL', 6, 5, 1, 0),
('MYSZKA', 6, 12, 1, 0),
('PULPIT', 6, 4, 1, 0),
('KOSZYK', 6, 6, 1, 0),
('SERWER', 6, 15, 1, 0),
('CHMURA', 6, 11, 1, 0),
('MONITOR', 7, 9, 1, 0),
('PROJEKT', 7, 14, 1, 0),
('REKLAMA', 7, 7, 1, 0),
('PROGRAM', 7, 18, 1, 0),
('TELEFON', 7, 10, 1, 0),
('KLAWISZ', 7, 6, 1, 0),
('GŁOŚNIK', 7, 8, 1, 0),
('ZASILACZ', 8, 5, 1, 0),
('INTERNET', 8, 20, 1, 0),
('DRUKARKA', 8, 11, 1, 0),
('SZABLONY', 8, 7, 1, 0),
('ŁADOWARKA', 9, 13, 1, 0),
('KOMPUTERY', 9, 16, 1, 0),
('LOGOWANIE', 9, 11, 1, 0),
('KONTROLER', 9, 9, 1, 0),
('CERTYFIKAT', 10, 15, 1, 0),
('AKUMULATOR', 10, 8, 1, 0),
('INFORMATYKA', 11, 14, 1, 0),
('REJESTRACJA', 11, 9, 1, 0),
('WERYFIKACJA', 11, 11, 1, 0),
('KLIMATYZACJA', 12, 16, 1, 0),
('WYSZUKIWARKA', 12, 12, 1, 0),
('DOKUMENTACJA', 12, 10, 1, 0),
('KONFIGURACJA', 12, 13, 1, 0)
-- Dozwolone słowa z polskimi znakami
ON DUPLICATE KEY UPDATE `active` = 1;

-- B. HARMONOGRAM SŁOWA DNIA (Kalendarz zaplanowanych słów)
-- Używamy CURDATE() (obecna data bazy), aby po wgraniu od razu działało słowo dnia dla dzisiaj, jutra i pojutrza!
INSERT INTO `ps_bn_yin_customloyalty_wordle_daily` (`scheduled_date`, `word`, `length`) VALUES
(CURDATE(), 'SKLEP', 5),
(CURDATE() + INTERVAL 1 DAY, 'MONITOR', 7),
(CURDATE() + INTERVAL 2 DAY, 'SERWER', 6)
ON DUPLICATE KEY UPDATE `word` = VALUES(`word`);

-- 5. REKLAMY SPONSORÓW: Dynamiczne, losowo serwowane klikalne reklamy
CREATE TABLE IF NOT EXISTS `ps_bn_yin_customloyalty_wordle_ads` (
    `id_ad` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `banner_url` VARCHAR(255) NOT NULL,
    `target_url` VARCHAR(255) NOT NULL,
    `duration_seconds` INT UNSIGNED NOT NULL DEFAULT 5,
    `active` TINYINT(1) UNSIGNED NOT NULL DEFAULT 1,
    `date_add` DATETIME NOT NULL,
    `date_upd` DATETIME NOT NULL,
    PRIMARY KEY (`id_ad`),
    KEY `active_idx` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- C. TRZY REKLAMY TESTOWE (INICJALNE DANE REKLAMOWE)
INSERT INTO `ps_bn_yin_customloyalty_wordle_ads` 
(`id_ad`, `title`, `banner_url`, `target_url`, `duration_seconds`, `active`, `date_add`, `date_upd`) 
VALUES 
(1, 'BCS Nagradza - Oficjalny Sponsor', 'https://bcsnagradza.pl/img/logo-1730213850.svg', 'https://bcsnagradza.pl/?utm_source=wordle&utm_medium=ad&utm_campaign=bcs_nagradza', 5, 1, NOW(), NOW()),
(2, 'YIN Modules - Inteligentne systemy lojalnościowe', 'https://bcsnagradza.pl/img/logo-1730213850.svg', 'https://bcsnagradza.pl/?utm_source=wordle&utm_medium=ad&utm_campaign=yin_custom_loyalty', 6, 1, NOW(), NOW()),
(3, 'Szkolenia i certyfikacja instalatorów BCS', 'https://bcsnagradza.pl/img/logo-1730213850.svg', 'https://bcsnagradza.pl/?utm_source=wordle&utm_medium=ad&utm_campaign=wordle_championship', 7, 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE 
`title` = VALUES(`title`),
`banner_url` = VALUES(`banner_url`), 
`target_url` = VALUES(`target_url`), 
`duration_seconds` = VALUES(`duration_seconds`), 
`active` = VALUES(`active`), 
`date_upd` = NOW();
