/**
 * Tests for Database Schema
 *
 * Tests initialisation, CRUD operations via DbBridge.
 * Uses an in-memory SQLite database for isolation.
 */

import Database from 'better-sqlite3';
import { initDatabase, createDbBridge } from '../db/schema.js';

describe('Database Schema', () => {
  let db: Database.Database;
  let bridge: ReturnType<typeof createDbBridge>;

  beforeEach(() => {
    // Create an in-memory database for each test
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initDatabase(db);
    bridge = createDbBridge(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('initDatabase', () => {
    it('should create all tables', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      ).all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('match_events');
      expect(tableNames).toContain('fixtures');
      expect(tableNames).toContain('markets');
      expect(tableNames).toContain('bets');
      expect(tableNames).toContain('platform_stats');
    });

    it('should seed default stats', () => {
      const stats = db.prepare('SELECT * FROM platform_stats').all() as { key: string; value: string }[];
      expect(stats.length).toBeGreaterThan(0);
      const keys = stats.map((s) => s.key);
      expect(keys).toContain('total_volume');
      expect(keys).toContain('total_markets');
    });

    it('should be idempotent', () => {
      expect(() => initDatabase(db)).not.toThrow();
      expect(() => initDatabase(db)).not.toThrow();
    });
  });

  describe('match_events', () => {
    it('should insert and retrieve events', () => {
      bridge.insertEvent({
        id: 'evt-1',
        matchId: 'match-1',
        type: 'goal',
        data: { team: 'home', scorer: 'Player X' },
        timestamp: '2026-01-01T00:00:00Z',
        ingestedAt: '2026-01-01T00:00:01Z',
      });

      const events = bridge.getEventsByMatch('match-1');
      expect(events).toHaveLength(1);
      expect((events[0] as Record<string, unknown>).event_type).toBe('goal');
    });

    it('should handle multiple events for the same match', () => {
      for (let i = 0; i < 5; i++) {
        bridge.insertEvent({
          id: `evt-${i}`,
          matchId: 'match-1',
          type: i % 2 === 0 ? 'goal' : 'card',
          data: { index: i },
          timestamp: '2026-01-01T00:00:00Z',
          ingestedAt: `2026-01-01T00:00:0${i}Z`,
        });
      }

      const events = bridge.getEventsByMatch('match-1');
      expect(events).toHaveLength(5);
    });

    it('should retrieve recent events', () => {
      for (let i = 0; i < 10; i++) {
        bridge.insertEvent({
          id: `evt-recent-${i}`,
          matchId: 'match-r',
          type: 'goal',
          data: {},
          timestamp: '2026-01-01T00:00:00Z',
          ingestedAt: `2026-01-01T00:00:0${i}Z`,
        });
      }

      const recent = bridge.getRecentEvents(3);
      expect(recent).toHaveLength(3);
    });
  });

  describe('fixtures', () => {
    it('should upsert fixtures', () => {
      bridge.upsertFixture({
        id: 'fixture-1',
        sport: 'soccer',
        league: 'world_cup',
        homeTeam: 'Brazil',
        awayTeam: 'Argentina',
        startTime: '2026-06-01T20:00:00Z',
        status: 'scheduled',
      });

      const fixtures = bridge.getFixtures();
      expect(fixtures).toHaveLength(1);
      expect((fixtures[0] as Record<string, unknown>).home_team).toBe('Brazil');
    });

    it('should update existing fixture on upsert', () => {
      bridge.upsertFixture({
        id: 'fixture-1',
        sport: 'soccer',
        league: 'world_cup',
        homeTeam: 'Brazil',
        awayTeam: 'Argentina',
        startTime: '2026-06-01T20:00:00Z',
        status: 'scheduled',
      });

      bridge.upsertFixture({
        id: 'fixture-1',
        sport: 'soccer',
        league: 'world_cup',
        homeTeam: 'Brazil',
        awayTeam: 'Argentina',
        startTime: '2026-06-01T20:00:00Z',
        status: 'live',
      });

      const fixtures = bridge.getFixtures();
      expect(fixtures).toHaveLength(1);
      expect((fixtures[0] as Record<string, unknown>).status).toBe('live');
    });

    it('should filter fixtures by status', () => {
      bridge.upsertFixture({
        id: 'f1', sport: 'soccer', league: 'world_cup',
        homeTeam: 'A', awayTeam: 'B', startTime: '2026-01-01', status: 'scheduled',
      });
      bridge.upsertFixture({
        id: 'f2', sport: 'soccer', league: 'world_cup',
        homeTeam: 'C', awayTeam: 'D', startTime: '2026-01-01', status: 'live',
      });

      const liveFixtures = bridge.getFixtures('live');
      expect(liveFixtures).toHaveLength(1);
    });
  });

  describe('markets', () => {
    // Markets have a FK to fixtures — create the fixture first
    beforeEach(() => {
      bridge.upsertFixture({
        id: 'fixture-1',
        sport: 'soccer',
        league: 'world_cup',
        homeTeam: 'Brazil',
        awayTeam: 'Argentina',
        startTime: '2026-06-01T20:00:00Z',
        status: 'scheduled',
      });
    });

    it('should insert and retrieve markets', () => {
      bridge.insertMarket({
        id: 'market-1',
        fixtureId: 'fixture-1',
        homeTeam: 'Brazil',
        awayTeam: 'Argentina',
        kickoffTime: '2026-06-01T20:00:00Z',
        odds: JSON.stringify({ home_win: 2.0, away_win: 3.5, draw: 3.2 }),
        poolSizes: JSON.stringify({ home_win: 0, away_win: 0, draw: 0 }),
      });

      const markets = bridge.getMarkets();
      expect(markets).toHaveLength(1);
      expect((markets[0] as Record<string, unknown>).status).toBe('open');
    });

    it('should update market status', () => {
      bridge.insertMarket({
        id: 'market-1',
        fixtureId: 'fixture-1',
        homeTeam: 'Brazil',
        awayTeam: 'Argentina',
        kickoffTime: '2026-06-01T20:00:00Z',
        odds: '{}',
        poolSizes: '{}',
      });

      bridge.updateMarketStatus('market-1', 'locked');
      const market = bridge.getMarket('market-1') as Record<string, unknown>;
      expect(market.status).toBe('locked');
    });

    it('should update market odds', () => {
      bridge.insertMarket({
        id: 'market-1',
        fixtureId: 'fixture-1',
        homeTeam: 'Brazil',
        awayTeam: 'Argentina',
        kickoffTime: '2026-06-01T20:00:00Z',
        odds: JSON.stringify({ home_win: 2.0, away_win: 3.5, draw: 3.2 }),
        poolSizes: '{}',
      });

      bridge.updateMarketOdds('market-1', JSON.stringify({ home_win: 1.5, away_win: 6.0, draw: 4.0 }));
      const market = bridge.getMarket('market-1') as Record<string, unknown>;
      const odds = JSON.parse(market.odds as string);
      expect(odds.home_win).toBe(1.5);
    });

    it('should update pool sizes', () => {
      bridge.insertMarket({
        id: 'market-1',
        fixtureId: 'fixture-1',
        homeTeam: 'Brazil',
        awayTeam: 'Argentina',
        kickoffTime: '2026-06-01T20:00:00Z',
        odds: '{}',
        poolSizes: JSON.stringify({ home_win: 100, away_win: 50, draw: 30 }),
      });

      bridge.updateMarketPoolSizes('market-1', JSON.stringify({ home_win: 200, away_win: 50, draw: 30 }));
      const market = bridge.getMarket('market-1') as Record<string, unknown>;
      const pools = JSON.parse(market.pool_sizes as string);
      expect(pools.home_win).toBe(200);
    });

    it('should filter markets by status', () => {
      // Create fixtures for these markets first
      bridge.upsertFixture({ id: 'f1', sport: 'soccer', league: 'wc', homeTeam: 'A', awayTeam: 'B', startTime: '2026-01-01', status: 'scheduled' });
      bridge.upsertFixture({ id: 'f2', sport: 'soccer', league: 'wc', homeTeam: 'C', awayTeam: 'D', startTime: '2026-01-01', status: 'scheduled' });
      bridge.insertMarket({
        id: 'm1', fixtureId: 'f1', homeTeam: 'A', awayTeam: 'B',
        kickoffTime: '2026-01-01', odds: '{}', poolSizes: '{}',
      });
      bridge.insertMarket({
        id: 'm2', fixtureId: 'f2', homeTeam: 'C', awayTeam: 'D',
        kickoffTime: '2026-01-01', odds: '{}', poolSizes: '{}',
      });

      bridge.updateMarketStatus('m1', 'locked');
      const locked = bridge.getMarkets('locked');
      const open = bridge.getMarkets('open');

      expect(locked).toHaveLength(1);
      expect(open).toHaveLength(1);
    });
  });

  describe('bets', () => {
    it('should insert bets', () => {
      // First create a fixture and market (foreign keys)
      bridge.upsertFixture({ id: 'f-bet', sport: 'soccer', league: 'wc', homeTeam: 'A', awayTeam: 'B', startTime: '2026-01-01', status: 'scheduled' });
      bridge.insertMarket({
        id: 'market-bet',
        fixtureId: 'f-bet',
        homeTeam: 'A', awayTeam: 'B',
        kickoffTime: '2026-01-01', odds: '{}', poolSizes: '{}',
      });

      bridge.insertBet({
        id: 'bet-1',
        marketId: 'market-bet',
        userAddr: 'user-solana-123',
        outcome: 'home_win',
        amount: 10,
        odds: 2.0,
      });

      // Also add timestamp manually for test
      const row = db.prepare('SELECT * FROM bets WHERE id = ?').get('bet-1') as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.user_addr).toBe('user-solana-123');
      expect(row.amount).toBe(10);
    });

    it('should retrieve bets by market', () => {
      bridge.upsertFixture({ id: 'f-bets-2', sport: 'soccer', league: 'wc', homeTeam: 'A', awayTeam: 'B', startTime: '2026-01-01', status: 'scheduled' });
      bridge.insertMarket({
        id: 'market-bets-2',
        fixtureId: 'f-bets-2',
        homeTeam: 'A', awayTeam: 'B',
        kickoffTime: '2026-01-01', odds: '{}', poolSizes: '{}',
      });

      bridge.insertBet({ id: 'b1', marketId: 'market-bets-2', userAddr: 'u1', outcome: 'home_win', amount: 5, odds: 2.0 });
      bridge.insertBet({ id: 'b2', marketId: 'market-bets-2', userAddr: 'u2', outcome: 'away_win', amount: 10, odds: 3.5 });

      const bets = bridge.getBetsByMarket('market-bets-2');
      expect(bets).toHaveLength(2);
    });

    it('should retrieve bets by user', () => {
      bridge.upsertFixture({ id: 'f-bets-3', sport: 'soccer', league: 'wc', homeTeam: 'A', awayTeam: 'B', startTime: '2026-01-01', status: 'scheduled' });
      bridge.insertMarket({
        id: 'market-bets-3',
        fixtureId: 'f-bets-3',
        homeTeam: 'A', awayTeam: 'B',
        kickoffTime: '2026-01-01', odds: '{}', poolSizes: '{}',
      });

      bridge.insertBet({ id: 'b1', marketId: 'market-bets-3', userAddr: 'user-alpha', outcome: 'home_win', amount: 5, odds: 2.0 });
      bridge.insertBet({ id: 'b2', marketId: 'market-bets-3', userAddr: 'user-alpha', outcome: 'draw', amount: 3, odds: 3.2 });
      bridge.insertBet({ id: 'b3', marketId: 'market-bets-3', userAddr: 'user-beta', outcome: 'away_win', amount: 8, odds: 3.5 });

      const userBets = bridge.getUserBets('user-alpha');
      expect(userBets).toHaveLength(2);

      const user2Bets = bridge.getUserBets('user-beta');
      expect(user2Bets).toHaveLength(1);
    });
  });

  describe('stats', () => {
    it('should get and set stats', () => {
      bridge.setStat('test_key', '42');
      const value = bridge.getStat('test_key');
      expect(value).toBe('42');
    });

    it('should return null for missing keys', () => {
      const value = bridge.getStat('nonexistent');
      expect(value).toBeNull();
    });

    it('should increment stats', () => {
      bridge.setStat('counter', '5');
      bridge.incrementStat('counter', 3);
      const value = bridge.getStat('counter');
      expect(parseFloat(value as string)).toBe(8);
    });

    it('should handle incrementing unset stats', () => {
      bridge.incrementStat('fresh_counter', 10);
      const value = bridge.getStat('fresh_counter');
      // 0 + 10 = 10
      expect(parseFloat(value as string)).toBe(10);
    });
  });
});
