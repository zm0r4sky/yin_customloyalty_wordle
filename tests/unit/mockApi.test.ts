import { describe, test, expect, beforeEach } from 'vitest';
import { WordleMockBackend } from '../../src/mockApi';

describe('WordleMockBackend Unit Tests', () => {

  beforeEach(() => {
    // Clear localStorage to ensure clean, isolated tests
    localStorage.clear();
  });

  test('should initialize with default states and a mock dictionary', () => {
    const backend = new WordleMockBackend();
    expect(backend.dailyWord).toBe('SKLEP');
    expect(backend.dictionary.length).toBeGreaterThan(50);
    expect(backend.maxAttempts).toBe(6);
  });

  test('should start a new daily game session successfully', async () => {
    const backend = new WordleMockBackend();
    const session = await backend.startGame('daily');

    expect(session.status).toBe('success');
    expect(session.game_token).toContain('sess_');
    expect(session.word_length).toBe(5);
    expect(session.attempts_left).toBe(6);
  });

  test('should start a free play session with a random word from dictionary', async () => {
    const backend = new WordleMockBackend();
    await backend.startGame('free');
    const word = backend.dailyWord;

    expect(word).toBeDefined();
    expect(word.length).toBe(5);
    expect(backend.dictionary).toContain(word);
  });

  test('should return correct results (green, yellow, absent) on word submission', async () => {
    const backend = new WordleMockBackend();
    backend.dailyWord = "SKLEP";
    const game = await backend.startGame('daily');
    
    // EKRAN vs SKLEP -> E(present), K(correct), R(absent), A(absent), N(absent)
    const res = await backend.submitWord(game.game_token, 'EKRAN');

    expect(res.status).toBe('success');
    expect(res.game_state).toBe('playing');
    expect(res.attempts_left).toBe(5);
    expect(res.result).toEqual([
      { char: 'E', status: 'present' },
      { char: 'K', status: 'correct' },
      { char: 'R', status: 'absent' },
      { char: 'A', status: 'absent' },
      { char: 'N', status: 'absent' }
    ]);
  });

  test('should trigger ad-gateway state on winning word submission', async () => {
    const backend = new WordleMockBackend();
    backend.dailyWord = "SKLEP";
    const game = await backend.startGame('daily');
    
    const result = await backend.submitWord(game.game_token, 'SKLEP');

    expect(result.status).toBe('success');
    expect(result.game_state).toBe('won_pending_ad');
    expect(result.attempts_left).toBe(5); // 6 - 1 attempt
    expect(result.ad_trigger_url).toContain('/ads/get');
  });

  test('should handle attempt exhaustion and trigger lost_pending_ad state', async () => {
    const backend = new WordleMockBackend();
    backend.dailyWord = "SKLEP";
    const game = await backend.startGame('daily');
    
    // Fail 5 times
    for (let i = 0; i < 5; i++) {
      await backend.submitWord(game.game_token, 'EKRAN');
    }
    // Submit 6th incorrect attempt
    const result = await backend.submitWord(game.game_token, 'KABEL');

    expect(result.game_state).toBe('lost_pending_ad');
    expect(result.attempts_left).toBe(0);
    expect(result.ad_trigger_url).toContain('/ads/get');
  });

  test('should claim rewards and award points and streaks correctly', async () => {
    const backend = new WordleMockBackend();
    backend.dailyWord = "SKLEP";
    
    const game = await backend.startGame('daily');
    await backend.submitWord(game.game_token, 'SKLEP'); // win on 1st attempt
    
    const ad = await backend.getAd(game.game_token);
    const claim = await backend.claimReward(game.game_token, ad.verification_token);
    const stats = await backend.getUserStats();
    
    // Score on 1st attempt: 100 base points, streak incremented to 1
    expect(claim.status).toBe('success');
    expect(claim.game_state).toBe('completed_rewarded');
    expect(claim.points_earned).toBe(100);
    expect(claim.new_streak).toBe(1);
    expect(stats.points).toBe(100);
    expect(stats.streak).toBe(1);
  });

  test('should prevent claiming rewards twice (Double Claim Protection)', async () => {
    const backend = new WordleMockBackend();
    backend.dailyWord = "SKLEP";
    
    const game = await backend.startGame('daily');
    await backend.submitWord(game.game_token, 'SKLEP');
    
    const ad = await backend.getAd(game.game_token);
    const token = ad.verification_token;
    
    // First claim - should succeed
    const firstClaim = await backend.claimReward(game.game_token, token);
    expect(firstClaim.status).toBe('success');
    expect(firstClaim.game_state).toBe('completed_rewarded');
    
    // Second claim - should throw an error or reject the promise
    await expect(backend.claimReward(game.game_token, token)).rejects.toThrow('Reward already claimed or session finished');
  });

  test('should initialize game with different custom word lengths in free play', async () => {
    const backend = new WordleMockBackend();
    
    // Start game with 8 letters
    const game8 = await backend.startGame('free', 8);
    expect(game8.word_length).toBe(8);
    expect(backend.dailyWord.length).toBe(8);

    // Start game with 12 letters
    const game12 = await backend.startGame('free', 12);
    expect(game12.word_length).toBe(12);
    expect(backend.dailyWord.length).toBe(12);
  });

  test('should verify all dictionary assets fall strictly within 5 to 12 letter bounds', () => {
    const backend = new WordleMockBackend();
    expect(backend.dictionary.length).toBeGreaterThan(0);
    
    backend.dictionary.forEach(word => {
      expect(word.length).toBeGreaterThanOrEqual(5);
      expect(word.length).toBeLessThanOrEqual(12);
      // Make sure it is uppercase
      expect(word).toBe(word.toUpperCase());
    });
  });
});
