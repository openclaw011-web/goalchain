/**
 * Tests for Solana Service
 *
 * Tests mock mode operations — account reads, settlement, and monitoring.
 * No real RPC connection is required.
 */

import { SolanaService } from '../services/solana.service.js';

describe('SolanaService', () => {
  let service: SolanaService;

  beforeEach(() => {
    service = new SolanaService({ mockMode: true });
  });

  describe('initialisation', () => {
    it('should start in mock mode by default', () => {
      expect(service).toBeInstanceOf(SolanaService);
    });

    it('should detect mock mode from options', () => {
      const s = new SolanaService({ mockMode: true });
      // Should be able to get keeper public key in mock mode
      expect(s.getKeeperPublicKey()).toBe('mock-keeper-public-key');
    });

    it('should return mock keeper balance', async () => {
      const balance = await service.getKeeperBalance();
      expect(balance).toBe(100_000_000);
    });
  });

  describe('market accounts', () => {
    it('should return null for unseeded accounts', async () => {
      const account = await service.getMarketAccount('unknown-address');
      expect(account).toBeNull();
    });

    it('should return seeded mock account', async () => {
      service.seedMockMarket('market-1', {
        fixtureId: 'fixture-1',
        outcome0Pool: 200_000_000,
        locked: false,
      });

      const account = await service.getMarketAccount('market-1');
      expect(account).not.toBeNull();
      expect(account?.fixtureId).toBe('fixture-1');
      expect(account?.outcome0Pool).toBe(200_000_000);
      expect(account?.locked).toBe(false);
    });

    it('should use defaults for unset fields when seeding', async () => {
      service.seedMockMarket('market-2', { fixtureId: 'fixture-2' });

      const account = await service.getMarketAccount('market-2');
      expect(account?.authority).toBe('mock-authority');
      expect(account?.outcome1Pool).toBe(150_000_000);
      expect(account?.totalBets).toBe(0);
    });
  });

  describe('bet accounts', () => {
    it('should return empty array for unknown market', async () => {
      const bets = await service.getBetAccounts('unknown');
      expect(bets).toEqual([]);
    });

    it('should return seeded bets', async () => {
      service.seedMockBets('market-bets', [
        { user: 'user1', market: 'market-bets', outcome: 0, amount: 100_000_000, odds: 200, claimed: false },
        { user: 'user2', market: 'market-bets', outcome: 1, amount: 50_000_000, odds: 350, claimed: false },
      ]);

      const bets = await service.getBetAccounts('market-bets');
      expect(bets).toHaveLength(2);
      expect(bets[0].user).toBe('user1');
      expect(bets[0].amount).toBe(100_000_000);
    });
  });

  describe('settlement', () => {
    it('should return mock signature in mock mode', async () => {
      const result = await service.settleMarket(
        'market-settle',
        0,
        { root: '0xabc', proof: ['0xdef'], leaf: '0xghi' },
      );
      expect(result).not.toBeNull();
      expect(result?.signature).toContain('mock-sig');
    });

    it('should update mock market state on settlement', async () => {
      service.seedMockMarket('market-settle-2', {
        fixtureId: 'fixture-settle',
        settled: false,
      });

      await service.settleMarket('market-settle-2', 1, {
        root: '0xabc', proof: [], leaf: '0xdef',
      });

      const account = await service.getMarketAccount('market-settle-2');
      expect(account?.settled).toBe(true);
      expect(account?.result).toBe(1);
    });
  });

  describe('monitoring', () => {
    it('should return default state for unknown market', async () => {
      const state = await service.monitorMarket('unknown');
      expect(state).toEqual({ locked: false, settled: false, totalPool: 0 });
    });

    it('should return correct state for known market', async () => {
      service.seedMockMarket('market-monitor', {
        locked: true,
        settled: false,
        outcome0Pool: 500_000_000,
        outcome1Pool: 300_000_000,
        outcome2Pool: 200_000_000,
      });

      const state = await service.monitorMarket('market-monitor');
      expect(state.locked).toBe(true);
      expect(state.settled).toBe(false);
      expect(state.totalPool).toBe(1_000_000_000); // 0.5 + 0.3 + 0.2 SOL
    });
  });

  describe('keeper', () => {
    it('should return mock public key in mock mode', () => {
      const key = service.getKeeperPublicKey();
      expect(key).toBe('mock-keeper-public-key');
    });

    it('should return mock balance in mock mode', async () => {
      const balance = await service.getKeeperBalance();
      expect(balance).toBe(100_000_000);
    });
  });
});
