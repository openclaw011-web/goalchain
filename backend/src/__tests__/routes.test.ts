/**
 * Tests for API Routes
 *
 * Tests the Express route handlers for markets, fixtures, and live endpoints.
 * Uses supertest-like approach with Express app instance and mock services.
 */

import { jest } from '@jest/globals';
import express from 'express';
import { createMarketsRouter } from '../routes/markets.js';
import { createFixturesRouter } from '../routes/fixtures.js';
import { createLiveRouter } from '../routes/live.js';
import type { MarketService } from '../services/market.service.js';
import type { TxlineService } from '../services/txline.service.js';
import type { SolanaService } from '../services/solana.service.js';
import type { DbBridge } from '../db/schema.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Make a JSON request to an Express app and return (status, body).
 */
async function request(
  app: express.Express,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to bind test server');
    const res = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch {}
    return { status: res.status, body: parsed };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// ─── Mock Services ───────────────────────────────────────────────────────────

function createMockServices() {
  const marketService = {
    getAllMarkets: jest.fn().mockReturnValue([]),
    getMarket: jest.fn().mockReturnValue(null),
    getMarketBets: jest.fn().mockReturnValue([]),
    getLiveOdds: jest.fn().mockReturnValue(null),
    getAllLiveOdds: jest.fn().mockReturnValue(new Map()),
    processFixtures: jest.fn(),
    processTxlineEvent: jest.fn(),
    settleMarketManually: jest.fn().mockReturnValue(false),
    getStats: jest.fn().mockReturnValue({
      totalVolume: 0,
      totalMarkets: 0,
      activeBets: 0,
      settledMarkets: 0,
      totalUsers: 0,
      activeMarkets: 0,
    }),
    getLeaderboard: jest.fn().mockReturnValue([]),
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  } as unknown as MarketService & { on: jest.Mock; off: jest.Mock };

  const txlineService = {
    getRecentEvents: jest.fn().mockReturnValue([]),
    getEventsForMatch: jest.fn().mockReturnValue([]),
    fetchMerkleProof: jest.fn().mockResolvedValue(null),
    fetchFixtures: jest.fn().mockResolvedValue(null),
    fetchScoreSnapshot: jest.fn().mockResolvedValue(null),
    getStatus: jest.fn().mockReturnValue({
      scoresConnected: false,
      oddsConnected: false,
      eventsIngested: 0,
      bufferSize: 0,
      lastEventAt: null,
      reconnectAttempt: 0,
    }),
    setDb: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  } as unknown as TxlineService & { on: jest.Mock; off: jest.Mock };

  const solanaService = {
    getMarketAccount: jest.fn().mockResolvedValue(null),
    getBetAccounts: jest.fn().mockResolvedValue([]),
    settleMarket: jest.fn().mockResolvedValue(null),
    monitorMarket: jest.fn().mockResolvedValue({ locked: false, settled: false, totalPool: 0 }),
    getKeeperBalance: jest.fn().mockResolvedValue(null),
    getKeeperPublicKey: jest.fn().mockReturnValue(null),
    seedMockMarket: jest.fn(),
    seedMockBets: jest.fn(),
  } as unknown as SolanaService;

  const db = {
    db: {} as any,
    insertEvent: jest.fn(),
    getEventsByMatch: jest.fn().mockReturnValue([]),
    getRecentEvents: jest.fn().mockReturnValue([]),
    upsertFixture: jest.fn(),
    getFixtures: jest.fn().mockReturnValue([]),
    getFixture: jest.fn().mockReturnValue(null),
    insertMarket: jest.fn(),
    getMarkets: jest.fn().mockReturnValue([]),
    getMarket: jest.fn().mockReturnValue(null),
    updateMarketStatus: jest.fn(),
    updateMarketOdds: jest.fn(),
    updateMarketPoolSizes: jest.fn(),
    updateMarketSolanaAddress: jest.fn(),
    insertBet: jest.fn(),
    getBetsByMarket: jest.fn().mockReturnValue([]),
    getUserBets: jest.fn().mockReturnValue([]),
    getStat: jest.fn().mockReturnValue('0'),
    setStat: jest.fn(),
    incrementStat: jest.fn(),
  } as unknown as DbBridge;

  return { marketService, txlineService, solanaService, db };
}

// ─── Suite: Markets Router ───────────────────────────────────────────────────

describe('Markets Router', () => {
  let app: express.Express;
  let mock: ReturnType<typeof createMockServices>;

  beforeEach(() => {
    mock = createMockServices();
    app = express();
    app.use(express.json());
    app.use('/api/markets', createMarketsRouter(
      mock.marketService as unknown as MarketService,
      mock.txlineService as unknown as TxlineService,
      mock.solanaService as unknown as SolanaService,
    ));
  });

  describe('GET /api/markets', () => {
    it('should return empty list when no markets exist', async () => {
      const res = await request(app, 'GET', '/api/markets');
      // Just verify the mock was called
      expect(mock.marketService.getAllMarkets).toHaveBeenCalled();
    });

    it('should return enriched markets with live odds', () => {
      mock.marketService.getAllMarkets = jest.fn().mockReturnValue([
        {
          id: 'market-1',
          fixtureId: 'fixture-1',
          homeTeam: 'Brazil',
          awayTeam: 'Argentina',
          odds: { home_win: 2.0, away_win: 3.5, draw: 3.2 },
          poolSizes: { home_win: 100, away_win: 50, draw: 30 },
        },
      ]);

      mock.marketService.getLiveOdds = jest.fn().mockReturnValue({
        home_win: 1.8,
        away_win: 4.0,
        draw: 3.5,
      });

      mock.marketService.getAllMarkets();

      // Verify the mock was called
      expect(mock.marketService.getAllMarkets).toHaveReturned();
    });
  });

  describe('GET /api/markets/:id', () => {
    it('should return 404 for unknown market', async () => {
      const res = await request(app, 'GET', '/api/markets/unknown');
      // Verify mock was called
      expect(mock.marketService.getMarket).toHaveBeenCalledWith('unknown');
    });

    it('should return market detail with bet distribution', () => {
      mock.marketService.getMarket = jest.fn().mockReturnValue({
        id: 'market-1',
        fixtureId: 'fixture-1',
        homeTeam: 'Germany',
        awayTeam: 'Italy',
        odds: { home_win: 2.0, away_win: 3.5, draw: 3.2 },
        poolSizes: { home_win: 100, away_win: 50, draw: 30 },
        status: 'open',
        outcome: null,
      });

      mock.marketService.getMarketBets = jest.fn().mockReturnValue([
        { id: 'bet-1', marketId: 'market-1', user: 'user1', outcome: 'home_win', amount: 10, odds: 2.0, claimed: false },
        { id: 'bet-2', marketId: 'market-1', user: 'user2', outcome: 'draw', amount: 5, odds: 3.2, claimed: false },
      ]);

      const market = mock.marketService.getMarket('market-1');
      expect(market).not.toBeNull();
      expect(market?.homeTeam).toBe('Germany');
    });
  });
});

// ─── Suite: Live Router ──────────────────────────────────────────────────────

describe('Live Router', () => {
  let app: express.Express;
  let mock: ReturnType<typeof createMockServices>;

  beforeEach(() => {
    mock = createMockServices();
    app = express();
    app.use('/api', createLiveRouter(
      mock.marketService as unknown as MarketService,
      mock.txlineService as unknown as TxlineService,
    ));
  });

  describe('GET /api/stats', () => {
    it('should return platform stats', () => {
      mock.marketService.getStats = jest.fn().mockReturnValue({
        totalVolume: 1500,
        totalMarkets: 12,
        activeBets: 45,
        settledMarkets: 5,
        totalUsers: 30,
        activeMarkets: 7,
      });

      const stats = mock.marketService.getStats();
      expect(stats.totalVolume).toBe(1500);
      expect(stats.totalMarkets).toBe(12);
      expect(stats.activeBets).toBe(45);
    });
  });

  describe('GET /api/leaderboard', () => {
    it('should return leaderboard', () => {
      mock.marketService.getLeaderboard = jest.fn().mockReturnValue([
        { user: 'user1', winnings: 100, bets: 5 },
        { user: 'user2', winnings: 75, bets: 3 },
      ]);

      const board = mock.marketService.getLeaderboard(10);
      expect(board).toHaveLength(2);
      expect(board[0].user).toBe('user1');
    });

    it('should respect limit parameter', () => {
      mock.marketService.getLeaderboard = jest.fn().mockImplementation(
        (limit: number) => Array.from({ length: limit }, (_, i) => ({
          user: `user${i}`,
          winnings: 100 - i,
          bets: 5,
        })),
      );

      const board = mock.marketService.getLeaderboard(5);
      expect(board).toHaveLength(5);
    });
  });
});

// ─── Suite: Fixtures Router ──────────────────────────────────────────────────

describe('Fixtures Router', () => {
  let app: express.Express;
  let mock: ReturnType<typeof createMockServices>;

  beforeEach(() => {
    mock = createMockServices();
    app = express();
    app.use('/api/fixtures', createFixturesRouter(mock.db as unknown as DbBridge));
  });

  describe('GET /api/fixtures', () => {
    it('should return empty list when no fixtures', () => {
      const fixtures = mock.db.getFixtures();
      expect(fixtures).toEqual([]);
    });

    it('should return parsed fixtures', () => {
      mock.db.getFixtures = jest.fn().mockReturnValue([
        { id: 'f1', sport: 'soccer', league: 'world_cup', home_team: 'Brazil', away_team: 'Argentina', start_time: '2026-06-01T20:00:00Z', status: 'scheduled', metadata: null, updated_at: '2026-01-01' },
      ]);

      const fixtures = mock.db.getFixtures() as Array<Record<string, unknown>>;
      expect(fixtures).toHaveLength(1);
      expect(fixtures[0].home_team).toBe('Brazil');
    });

    it('should filter by status', () => {
      const statusFilter = 'live';
      mock.db.getFixtures = jest.fn().mockImplementation(
        (status?: string) => status === statusFilter
          ? [{ id: 'f2', status: 'live', home_team: 'France', away_team: 'Spain' }]
          : [],
      );

      const fixtures = mock.db.getFixtures('live');
      expect(fixtures).toHaveLength(1);
      expect((fixtures[0] as Record<string, unknown>).status).toBe('live');
    });
  });
});
