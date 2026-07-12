/**
 * Tests for Market Service
 *
 * Tests market lifecycle: creation, locking, settlement, odds updates,
 * stats aggregation, and leaderboard computation.
 */

import { jest } from '@jest/globals';
import { MarketService } from '../services/market.service.js';
import type { NormalisedMatchEvent } from '../types/txline.js';

// ─── Mock DB ─────────────────────────────────────────────────────────────────

function createMockDb() {
  const markets: Record<string, unknown>[] = [];
  const bets: Record<string, unknown>[] = [];
  const fixtures: Record<string, unknown>[] = [];
  const stats = new Map<string, string>();

  return {
    markets,
    bets,
    fixtures,

    insertMarket: jest.fn((m) => {
      // Store in snake_case to match what real SQLite returns
      markets.push({
        id: m.id,
        fixture_id: m.fixtureId,
        home_team: m.homeTeam,
        away_team: m.awayTeam,
        kickoff_time: m.kickoffTime,
        status: 'open',
        odds: m.odds,
        pool_sizes: m.poolSizes,
        outcome: null,
        solana_market_addr: null,
        created_at: new Date().toISOString(),
        settled_at: null,
      });
    }),

    getMarkets: jest.fn((status?: string) => {
      if (status) return markets.filter((m: Record<string, unknown>) => m.status === status);
      return markets;
    }),

    getMarket: jest.fn((id: string) => {
      return markets.find((m: Record<string, unknown>) => m.id === id) ?? null;
    }),

    updateMarketStatus: jest.fn((id: string, status: string, outcome?: string) => {
      const m = markets.find((x: Record<string, unknown>) => x.id === id) as Record<string, unknown>;
      if (m) {
        m.status = status;
        if (outcome) m.outcome = outcome;
        if (outcome) m.settled_at = new Date().toISOString();
      }
    }),

    updateMarketOdds: jest.fn((id: string, odds: string) => {
      const m = markets.find((x: Record<string, unknown>) => x.id === id) as Record<string, unknown>;
      if (m) m.odds = odds;
    }),

    updateMarketPoolSizes: jest.fn((id: string, pools: string) => {
      const m = markets.find((x: Record<string, unknown>) => x.id === id) as Record<string, unknown>;
      if (m) m.pool_sizes = pools;
    }),

    getFixtures: jest.fn((status?: string) => {
      if (status) return fixtures.filter((f: Record<string, unknown>) => f.status === status);
      return fixtures;
    }),

    getFixture: jest.fn((id: string) => {
      return fixtures.find((f: Record<string, unknown>) => f.id === id) ?? null;
    }),

    upsertFixture: jest.fn((f) => {
      // Store in snake_case to match real SQLite rows
      const existing = fixtures.findIndex((x: Record<string, unknown>) => x.id === f.id);
      const row = {
        id: f.id,
        sport: f.sport,
        league: f.league,
        home_team: f.homeTeam,
        away_team: f.awayTeam,
        start_time: f.startTime,
        status: f.status,
        metadata: f.metadata ? JSON.stringify(f.metadata) : null,
        updated_at: new Date().toISOString(),
      };
      if (existing >= 0) {
        fixtures[existing] = row;
      } else {
        fixtures.push(row);
      }
    }),

    insertBet: jest.fn((b) => {
      bets.push(b);
    }),

    getBetsByMarket: jest.fn((marketId: string) => {
      if (!marketId) return bets;
      return bets.filter((b: Record<string, unknown>) => b.market_id === marketId);
    }),

    getAllBets: jest.fn(() => {
      return bets;
    }),

    incrementStat: jest.fn((key: string, by = 1) => {
      const current = parseFloat(stats.get(key) || '0');
      stats.set(key, String(current + by));
    }),

    getStat: jest.fn((key: string) => {
      return stats.get(key) ?? '0';
    }),

    setStat: jest.fn((key: string, value: string) => {
      stats.set(key, value);
    }),
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('MarketService', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let service: MarketService;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new MarketService(mockDb);
  });

  describe('initialisation', () => {
    it('should create instance with empty markets', () => {
      const markets = service.getAllMarkets();
      expect(markets).toEqual([]);
    });
  });

  describe('processFixtures', () => {
    it('should create markets for scheduled fixtures', () => {
      const now = Date.now();
      service.processFixtures([
        {
          id: 'fixture-1',
          homeTeam: 'Brazil',
          awayTeam: 'Argentina',
          startTime: new Date(now + 3600_000).toISOString(), // 1 hour from now
          status: 'scheduled',
        },
      ]);

      const markets = service.getAllMarkets();
      expect(markets).toHaveLength(1);
      expect(markets[0].homeTeam).toBe('Brazil');
      expect(markets[0].awayTeam).toBe('Argentina');
      expect(markets[0].status).toBe('open');
    });

    it('should not create duplicate markets for the same fixture', () => {
      const now = Date.now();
      const fixture = {
        id: 'fixture-1',
        homeTeam: 'Brazil',
        awayTeam: 'Argentina',
        startTime: new Date(now + 3600_000).toISOString(),
        status: 'scheduled' as const,
      };

      service.processFixtures([fixture]);
      service.processFixtures([fixture]);

      const markets = service.getAllMarkets();
      expect(markets).toHaveLength(1);
    });

    it('should skip fixtures far in the future', () => {
      const farFuture = Date.now() + 100 * 24 * 3600_000; // 100 days
      service.processFixtures([
        {
          id: 'fixture-far',
          homeTeam: 'Team A',
          awayTeam: 'Team B',
          startTime: new Date(farFuture).toISOString(),
          status: 'scheduled',
        },
      ]);

      const markets = service.getAllMarkets();
      expect(markets).toHaveLength(0);
    });

    it('should skip non-scheduled fixtures', () => {
      service.processFixtures([
        {
          id: 'fixture-finished',
          homeTeam: 'Team A',
          awayTeam: 'Team B',
          startTime: new Date().toISOString(),
          status: 'finished',
        },
      ]);

      const markets = service.getAllMarkets();
      expect(markets).toHaveLength(0);
    });
  });

  describe('market lifecycle via processTxlineEvent', () => {
    beforeEach(() => {
      // Upsert the fixture into the mock DB (lockMarket looks up fixture)
      mockDb.upsertFixture({
        id: 'fixture-lifecycle',
        sport: 'soccer',
        league: 'FIFA World Cup',
        homeTeam: 'France',
        awayTeam: 'Spain',
        startTime: new Date(Date.now() + 3600_000).toISOString(),
        status: 'scheduled',
      });
      // Create a market first
      service.processFixtures([
        {
          id: 'fixture-lifecycle',
          homeTeam: 'France',
          awayTeam: 'Spain',
          startTime: new Date(Date.now() + 3600_000).toISOString(),
          status: 'scheduled',
        },
      ]);
    });

    it('should lock market on match_start', () => {
      service.processTxlineEvent({
        id: 'evt-1',
        matchId: 'fixture-lifecycle',
        type: 'match_start',
        data: { homeTeam: 'France', awayTeam: 'Spain', kickoffTime: new Date().toISOString() },
        timestamp: new Date().toISOString(),
        ingestedAt: new Date().toISOString(),
      });

      const markets = service.getAllMarkets();
      const market = markets.find((m) => m.fixtureId === 'fixture-lifecycle');
      expect(market?.status).toBe('locked');
    });

    it('should settle market on match_end', () => {
      // First lock it
      service.processTxlineEvent({
        id: 'evt-start',
        matchId: 'fixture-lifecycle',
        type: 'match_start',
        data: {},
        timestamp: new Date().toISOString(),
        ingestedAt: new Date().toISOString(),
      });

      // Then end it
      service.processTxlineEvent({
        id: 'evt-end',
        matchId: 'fixture-lifecycle',
        type: 'match_end',
        data: { homeScore: 3, awayScore: 1, result: 'home_win' },
        timestamp: new Date().toISOString(),
        ingestedAt: new Date().toISOString(),
      });

      const markets = service.getAllMarkets();
      const market = markets.find((m) => m.fixtureId === 'fixture-lifecycle');
      expect(market?.status).toBe('settled');
      expect(market?.outcome).toBe('home_win');
    });

    it('should update odds on odds_update event', () => {
      service.processTxlineEvent({
        id: 'evt-odds',
        matchId: 'fixture-lifecycle',
        type: 'odds_update',
        data: {
          marketType: '1x2',
          odds: { home_win: 1.5, away_win: 6.0, draw: 4.0 },
        },
        timestamp: new Date().toISOString(),
        ingestedAt: new Date().toISOString(),
      });

      const odds = service.getLiveOdds('fixture-lifecycle');
      expect(odds).not.toBeNull();
      expect(odds?.home_win).toBe(1.5);
      expect(odds?.away_win).toBe(6.0);
    });

    it('should ignore non-1x2 odds markets', () => {
      service.processTxlineEvent({
        id: 'evt-odds-2',
        matchId: 'fixture-lifecycle',
        type: 'odds_update',
        data: {
          marketType: 'over_under',
          odds: { over_2_5: 1.8, under_2_5: 2.0 },
        },
        timestamp: new Date().toISOString(),
        ingestedAt: new Date().toISOString(),
      });

      // Odds should not have been stored for this match
      // (no match_winner or 1x2 type)
      const odds = service.getLiveOdds('fixture-lifecycle');
      expect(odds).toBeNull();
    });
  });

  describe('manual settlement', () => {
    beforeEach(() => {
      service.processFixtures([
        {
          id: 'fixture-manual',
          homeTeam: 'Germany',
          awayTeam: 'Italy',
          startTime: new Date(Date.now() + 3600_000).toISOString(),
          status: 'scheduled',
        },
      ]);
    });

    it('should return false for non-existent market', () => {
      const result = service.settleMarketManually('non-existent', 'home_win');
      expect(result).toBe(false);
    });

    it('should settle an open market', () => {
      const markets = service.getAllMarkets();
      const result = service.settleMarketManually(markets[0].id, 'home_win');
      expect(result).toBe(true);

      const settled = service.getMarket(markets[0].id);
      expect(settled?.status).toBe('settled');
      expect(settled?.outcome).toBe('home_win');
    });

    it('should not settle an already-settled market', () => {
      const markets = service.getAllMarkets();
      service.settleMarketManually(markets[0].id, 'home_win');
      const result = service.settleMarketManually(markets[0].id, 'away_win');
      expect(result).toBe(false);
    });
  });

  describe('getMarket', () => {
    beforeEach(() => {
      service.processFixtures([
        {
          id: 'fixture-get',
          homeTeam: 'Portugal',
          awayTeam: 'Netherlands',
          startTime: new Date(Date.now() + 3600_000).toISOString(),
          status: 'scheduled',
        },
      ]);
    });

    it('should return a market by ID', () => {
      const markets = service.getAllMarkets();
      const market = service.getMarket(markets[0].id);
      expect(market).not.toBeNull();
      expect(market?.homeTeam).toBe('Portugal');
    });

    it('should return null for unknown ID', () => {
      const market = service.getMarket('non-existent');
      expect(market).toBeNull();
    });
  });

  describe('stats', () => {
    it('should return default stats when empty', () => {
      const stats = service.getStats();
      expect(stats).toHaveProperty('totalVolume');
      expect(stats).toHaveProperty('totalMarkets');
      expect(stats).toHaveProperty('activeBets');
      expect(stats).toHaveProperty('settledMarkets');
      expect(stats).toHaveProperty('activeMarkets');
    });

    it('should reflect market creation in stats', () => {
      const before = service.getStats();
      service.processFixtures([
        {
          id: 'fixture-stats',
          homeTeam: 'England',
          awayTeam: 'Belgium',
          startTime: new Date(Date.now() + 3600_000).toISOString(),
          status: 'scheduled',
        },
      ]);
      const after = service.getStats();
      expect(after.totalMarkets).toBeGreaterThan(before.totalMarkets);
    });
  });

  describe('leaderboard', () => {
    it('should return empty leaderboard when no bets', () => {
      const board = service.getLeaderboard();
      expect(board).toEqual([]);
    });

    it('should rank users by winnings', () => {
      // Insert bets into mock DB directly
      // The getBetsByMarket returns bets, but the leaderboard needs some bets
      mockDb.getBetsByMarket = jest.fn(() => [
        { id: 'b1', market_id: 'm1', user_addr: 'user1', outcome: 'home_win', amount: 10, odds: 2.0, claimed: 1, timestamp: '2026-01-01' },
        { id: 'b2', market_id: 'm1', user_addr: 'user2', outcome: 'away_win', amount: 5, odds: 3.0, claimed: 1, timestamp: '2026-01-01' },
        { id: 'b3', market_id: 'm1', user_addr: 'user1', outcome: 'draw', amount: 2, odds: 4.0, claimed: 0, timestamp: '2026-01-01' },
      ]);

      // Populate the mock 'bets' array for getBetsByMarket/getAllBets
      mockDb.bets.splice(0, mockDb.bets.length,
        { id: 'b1', market_id: 'm1', user_addr: 'user1', outcome: 'home_win', amount: 10, odds: 2.0, claimed: 1, timestamp: '2026-01-01' },
        { id: 'b2', market_id: 'm1', user_addr: 'user2', outcome: 'away_win', amount: 5, odds: 3.0, claimed: 1, timestamp: '2026-01-01' },
        { id: 'b3', market_id: 'm1', user_addr: 'user1', outcome: 'draw', amount: 2, odds: 4.0, claimed: 0, timestamp: '2026-01-01' },
      );

      const board = service.getLeaderboard(10);

      // user1: 10 * 2.0 = 20 winnings (claimed), 2 bets (one unclaimed)
      // user2: 5 * 3.0 = 15 winnings (claimed), 1 bet
      expect(board).toHaveLength(2);
      expect(board[0].user).toBe('user1');
      expect(board[0].winnings).toBe(20);
      expect(board[1].user).toBe('user2');
      expect(board[1].winnings).toBe(15);
    });
  });
});
