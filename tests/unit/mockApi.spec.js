const { test, expect } = require('@playwright/test');

/**
 * Unit/Integration Tests for WordleMockBackend
 * Executed directly inside the browser context at the app origin,
 * meaning localStorage and class instances are fully available without mocks!
 */
test.describe('WordleMockBackend Unit Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the app to initialize the correct origin and load mockApi.js
    await page.goto('/');
    // Clear localStorage to ensure clean, isolated tests
    await page.evaluate(() => localStorage.clear());
  });

  test('should initialize with default states and a mock dictionary', async ({ page }) => {
    const stats = await page.evaluate(() => {
      // Create a fresh backend instance to isolate unit tests
      const backend = new WordleMockBackend();
      return {
        dailyWord: backend.dailyWord,
        dictionaryLength: backend.dictionary.length,
        maxAttempts: backend.maxAttempts,
      };
    });

    expect(stats.dailyWord).toBe('SKLEP');
    expect(stats.dictionaryLength).toBeGreaterThan(50);
    expect(stats.maxAttempts).toBe(6);
  });

  test('should start a new daily game session successfully', async ({ page }) => {
    const session = await page.evaluate(async () => {
      const backend = new WordleMockBackend();
      return await backend.startGame('daily');
    });

    expect(session.status).toBe('success');
    expect(session.game_id).toContain('sess_');
    expect(session.word_length).toBe(5);
    expect(session.attempts_left).toBe(6);
  });

  test('should start a free play session with a random word from dictionary', async ({ page }) => {
    const word = await page.evaluate(async () => {
      const backend = new WordleMockBackend();
      await backend.startGame('free');
      return backend.dailyWord;
    });

    expect(word).toBeDefined();
    expect(word.length).toBe(5);
  });

  test('should return correct results (green, yellow, absent) on word submission', async ({ page }) => {
    const matchResults = await page.evaluate(async () => {
      const backend = new WordleMockBackend();
      backend.dailyWord = "SKLEP";
      const game = await backend.startGame('daily');
      
      // EKRAN vs SKLEP -> E(present), K(correct), R(absent), A(absent), N(absent)
      const res = await backend.submitWord(game.game_id, 'EKRAN');
      return res;
    });

    expect(matchResults.status).toBe('success');
    expect(matchResults.game_state).toBe('playing');
    expect(matchResults.attempts_left).toBe(5);
    expect(matchResults.result).toEqual([
      { char: 'E', status: 'present' },
      { char: 'K', status: 'correct' },
      { char: 'R', status: 'absent' },
      { char: 'A', status: 'absent' },
      { char: 'N', status: 'absent' }
    ]);
  });

  test('should trigger ad-gateway state on winning word submission', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const backend = new WordleMockBackend();
      backend.dailyWord = "SKLEP";
      const game = await backend.startGame('daily');
      
      return await backend.submitWord(game.game_id, 'SKLEP');
    });

    expect(result.status).toBe('success');
    expect(result.game_state).toBe('won_pending_ad');
    expect(result.attempts_left).toBe(5); // 6 - 1 attempt
    expect(result.ad_trigger_url).toContain('/ads/get');
  });

  test('should handle attempt exhaustion and trigger lost_pending_ad state', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const backend = new WordleMockBackend();
      backend.dailyWord = "SKLEP";
      const game = await backend.startGame('daily');
      
      // Fail 5 times
      for (let i = 0; i < 5; i++) {
        await backend.submitWord(game.game_id, 'EKRAN');
      }
      // Submit 6th incorrect attempt
      return await backend.submitWord(game.game_id, 'KABEL');
    });

    expect(result.game_state).toBe('lost_pending_ad');
    expect(result.attempts_left).toBe(0);
    expect(result.ad_trigger_url).toContain('/ads/get');
  });

  test('should claim rewards and award points and streaks correctly', async ({ page }) => {
    const results = await page.evaluate(async () => {
      const backend = new WordleMockBackend();
      backend.dailyWord = "SKLEP";
      
      const game = await backend.startGame('daily');
      await backend.submitWord(game.game_id, 'SKLEP'); // win on 1st attempt
      
      const ad = await backend.getAd(game.game_id);
      const claim = await backend.claimReward(game.game_id, ad.verification_token);
      
      return { claim, stats: await backend.getUserStats() };
    });

    // Score on 1st attempt: 100 base points, streak incremented to 1
    expect(results.claim.status).toBe('success');
    expect(results.claim.game_state).toBe('completed_rewarded');
    expect(results.claim.points_earned).toBe(100);
    expect(results.claim.new_streak).toBe(1);
    expect(results.stats.points).toBe(100);
    expect(results.stats.streak).toBe(1);
  });
});
