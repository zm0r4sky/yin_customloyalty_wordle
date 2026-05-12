-- ====================================================================
-- YIN WORDLE PWA - ARCHITEKTURA BAZY DANYCH (PRESTASHOP COMPATIBLE)
-- ====================================================================

-- 1. SŁOWNIK: Słowa w języku polskim (samobudujący się słownik)
-- Jako PRIMARY KEY używamy bezpośrednio kolumny `word` (słowa są unikalne, brak potrzeby sztucznego id)
CREATE TABLE IF NOT EXISTS `ps_bn_yin_customloyalty_wordle_dictionary` (
    `word` VARCHAR(12) NOT NULL,
    `length` TINYINT UNSIGNED NOT NULL,
    `count_submitted` INT UNSIGNED DEFAULT 1, -- Licznik zgłoszeń tego słowa przez graczy
    `is_active` TINYINT(1) DEFAULT 0,         -- 0 = oczekuje na weryfikację / próg, 1 = aktywne w puli losowej
    PRIMARY KEY (`word`),
    INDEX `idx_len` (`length`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. SŁOWO DNIA: Przypisanie konkretnych słów do poszczególnych dat kalendarzowych
CREATE TABLE IF NOT EXISTS `ps_bn_yin_customloyalty_wordle_daily` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `scheduled_date` DATE NOT NULL,
    `word` VARCHAR(12) NOT NULL,
    `length` TINYINT UNSIGNED NOT NULL,
    UNIQUE KEY `idx_date` (`scheduled_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. SESJE GRY: Serwerowe źródło prawdy (Source of Truth) eliminujące oszustwa (cheating)
CREATE TABLE IF NOT EXISTS `ps_bn_yin_customloyalty_wordle_sessions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `id_game` VARCHAR(64) NOT NULL,
    `id_player` INT UNSIGNED NOT NULL, -- Powiązane z ps_bn_yin_customloyalty_wordle_player_stats
    `game_type` ENUM('daily', 'free') NOT NULL,
    `target_word` VARCHAR(12) NOT NULL,
    `attempts` TINYINT UNSIGNED DEFAULT 0,
    `max_attempts` TINYINT UNSIGNED DEFAULT 6,
    `guesses` TEXT DEFAULT NULL,             -- Wprowadzone dotychczas słowa (zapisane jako tablica JSON ["SKLEP","PUDŁO"])
    `game_state` ENUM('playing', 'won_pending_ad', 'lost_pending_ad', 'completed_rewarded') DEFAULT 'playing',
    `verification_token` VARCHAR(64) DEFAULT NULL,
    `date_add` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `date_upd` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `idx_id_game` (`id_game`),
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

-- A. PRZYKŁADOWE SŁOWA SŁOWNIKA (Wszystkie od razu aktywne, is_active = 1)
INSERT INTO `ps_bn_yin_customloyalty_wordle_dictionary` (`word`, `length`, `count_submitted`, `is_active`) VALUES
('SKLEP', 5, 10, 1),
('EKRAN', 5, 8, 1),
('OBRAZ', 5, 5, 1),
('KABEL', 5, 4, 1),
('WIDEO', 5, 7, 1),
('AUDIO', 5, 3, 1),
('RUTER', 5, 6, 1),
('POLAK', 5, 12, 1),
('DOBRO', 5, 9, 1),
('SŁOWO', 5, 15, 1),
('KAMERA', 6, 8, 1),
('PORTAL', 6, 5, 1),
('MYSZKA', 6, 12, 1),
('PULPIT', 6, 4, 1),
('KOSZYK', 6, 6, 1),
('SERWER', 6, 15, 1),
('CHMURA', 6, 11, 1),
('MONITOR', 7, 9, 1),
('PROJEKT', 7, 14, 1),
('REKLAMA', 7, 7, 1),
('PROGRAM', 7, 18, 1),
('TELEFON', 7, 10, 1),
('KLAWISZ', 7, 6, 1),
('GŁOŚNIK', 7, 8, 1),
('ZASILACZ', 8, 5, 1),
('INTERNET', 8, 20, 1),
('DRUKARKA', 8, 11, 1),
('SZABLONY', 8, 7, 1),
('ŁADOWARKA', 9, 13, 1),
('KOMPUTERY', 9, 16, 1),
('LOGOWANIE', 9, 11, 1),
('KONTROLER', 9, 9, 1),
('CERTYFIKAT', 10, 15, 1),
('AKUMULATOR', 10, 8, 1),
('INFORMATYKA', 11, 14, 1),
('REJESTRACJA', 11, 9, 1),
('WERYFIKACJA', 11, 11, 1),
('KLIMATYZACJA', 12, 16, 1),
('WYSZUKIWARKA', 12, 12, 1),
('DOKUMENTACJA', 12, 10, 1),
('KONFIGURACJA', 12, 13, 1)
-- Dozwolone słowa z polskimi znakami
ON DUPLICATE KEY UPDATE `is_active` = 1;

-- B. HARMONOGRAM SŁOWA DNIA (Kalendarz zaplanowanych słów)
-- Używamy CURDATE() (obecna data bazy), aby po wgraniu od razu działało słowo dnia dla dzisiaj, jutra i pojutrza!
INSERT INTO `ps_bn_yin_customloyalty_wordle_daily` (`scheduled_date`, `word`, `length`) VALUES
(CURDATE(), 'SKLEP', 5),
(CURDATE() + INTERVAL 1 DAY, 'MONITOR', 7),
(CURDATE() + INTERVAL 2 DAY, 'SERWER', 6)
ON DUPLICATE KEY UPDATE `word` = VALUES(`word`);
