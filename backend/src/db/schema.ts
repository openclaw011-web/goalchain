/**
 * SQLite Database Schema
 *
 * Uses better-sqlite3 for local persistence of events, markets, fixtures,
 * bets, and platform stats. The DB lives at DATABASE_PATH (default ./data/worldcup.db).
 *
 * Migration is applied on every server start via initDatabase().
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let db: Database.Database | null = null;

/**
 * Get (or create) the singleton database connection.
 * Ensures the data directory exists before opening.
 */
export function getDatabase(dbPath?: string): Database.Database {
  if (db) return db;

  const resolvedPath = dbPath || process.env.DATABASE_PATH || './data/worldcup.db';
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Register global cleanup — don't prevent process exit
  process.on('exit', () => closeDatabase());
  process.on('SIGINT', () => { closeDatabase(); process.exit(0); });
  process.on('SIGTERM', () => { closeDatabase(); process.exit(0); });

  return db;
}

/** Close the database connection gracefully. */
export function closeDatabase(): void {
  if (db) {
    try { db.close(); } catch { /* ignore */ }
    db = null;
  }
}

// ─── Schema ──────────────────────────────────────────────────────────────────

/**
 * Apply the full schema. Idempotent — uses IF NOT EXISTS everywhere.
 * Call once at server startup.
 */
export function initDatabase(database?: Database.Database): void {
  const d = database ?? getDatabase();

  d.exec(`
    -- Normalised match events ingested from TxLINE SSE streams
    CREATE TABLE IF NOT EXISTS match_events (
      id           TEXT PRIMARY KEY,
      match_id     TEXT NOT NULL,
      event_type   TEXT NOT NULL,     -- goal, card, match_start, match_end, halftime, substitution, odds_update
      data         TEXT NOT NULL,     -- JSON blob
      timestamp    TEXT NOT NULL,
      ingested_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON match_events(match_id);
    CREATE INDEX IF NOT EXISTS idx_match_events_type ON match_events(event_type);

    -- World Cup fixtures from TxLINE snapshot
    CREATE TABLE IF NOT EXISTS fixtures (
      id           TEXT PRIMARY KEY,
      sport        TEXT NOT NULL DEFAULT 'soccer',
      league       TEXT NOT NULL DEFAULT 'world_cup',
      home_team    TEXT NOT NULL,
      away_team    TEXT NOT NULL,
      start_time   TEXT NOT NULL,      -- ISO 8601
      status       TEXT NOT NULL DEFAULT 'scheduled',
      metadata     TEXT,               -- JSON blob
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_fixtures_status ON fixtures(status);
    CREATE INDEX IF NOT EXISTS idx_fixtures_start_time ON fixtures(start_time);

    -- Prediction markets auto-created from fixtures
    CREATE TABLE IF NOT EXISTS markets (
      id                  TEXT PRIMARY KEY,
      fixture_id          TEXT NOT NULL UNIQUE,
      home_team           TEXT NOT NULL,
      away_team           TEXT NOT NULL,
      kickoff_time        TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'open',   -- open, locked, settled, cancelled
      odds                TEXT NOT NULL DEFAULT '{}',      -- JSON: {home_win: 2.0, away_win: 3.5, draw: 3.2}
      pool_sizes          TEXT NOT NULL DEFAULT '{}',      -- JSON: {home_win: 0, away_win: 0, draw: 0}
      outcome             TEXT,                           -- home_win, away_win, draw (null until settled)
      solana_market_addr  TEXT,                           -- on-chain market account
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      settled_at          TEXT,
      FOREIGN KEY (fixture_id) REFERENCES fixtures(id)
    );

    CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);

    -- Bets placed on markets
    CREATE TABLE IF NOT EXISTS bets (
      id          TEXT PRIMARY KEY,
      market_id   TEXT NOT NULL,
      user_addr   TEXT NOT NULL,      -- Solana wallet
      outcome     TEXT NOT NULL,      -- home_win, away_win, draw
      amount      REAL NOT NULL,      -- notional SOL
      odds        REAL NOT NULL,
      timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
      claimed     INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (market_id) REFERENCES markets(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bets_market_id ON bets(market_id);
    CREATE INDEX IF NOT EXISTS idx_bets_user_addr ON bets(user_addr);

    -- Platform stats (materialised, updated periodically)
    CREATE TABLE IF NOT EXISTS platform_stats (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Seed default stats if empty
  const statsCount = d.prepare('SELECT COUNT(*) AS c FROM platform_stats').get() as { c: number };
  if (statsCount.c === 0) {
    const insert = d.prepare('INSERT OR IGNORE INTO platform_stats (key, value) VALUES (?, ?)');
    const seed = [
      ['total_volume', '0'],
      ['total_markets', '0'],
      ['active_bets', '0'],
      ['settled_markets', '0'],
      ['total_users', '0'],
    ];
    const tx = d.transaction(() => {
      for (const [k, v] of seed) insert.run(k, v);
    });
    tx();
  }

  logger.info('Database initialised (schema applied)');
}

// ─── Prepared Statements ─────────────────────────────────────────────────────
// Reusable query builder helpers that wrap the raw Database instance.
// These are attached as convenience methods on the DB bridge.

export interface DbBridge {
  db: Database.Database;

  // Events
  insertEvent(event: {
    id: string; matchId: string; type: string; data: unknown; timestamp: string; ingestedAt: string;
  }): void;
  getEventsByMatch(matchId: string): unknown[];
  getRecentEvents(limit: number): unknown[];

  // Fixtures
  upsertFixture(fixture: {
    id: string; sport: string; league: string; homeTeam: string; awayTeam: string;
    startTime: string; status: string; metadata?: Record<string, unknown>;
  }): void;
  getFixtures(status?: string): unknown[];
  getFixture(id: string): unknown;

  // Markets
  insertMarket(market: {
    id: string; fixtureId: string; homeTeam: string; awayTeam: string;
    kickoffTime: string; odds: string; poolSizes: string;
  }): void;
  getMarkets(status?: string): unknown[];
  getMarket(id: string): unknown;
  updateMarketStatus(id: string, status: string, outcome?: string): void;
  updateMarketOdds(id: string, odds: string): void;
  updateMarketPoolSizes(id: string, poolSizes: string): void;
  updateMarketSolanaAddress(id: string, address: string): void;

  // Bets
  insertBet(bet: {
    id: string; marketId: string; userAddr: string; outcome: string;
    amount: number; odds: number; timestamp: string;
  }): void;
  getBetsByMarket(marketId: string): unknown[];
  getAllBets(): unknown[];
  getUserBets(userAddr: string): unknown[];

  // Stats
  getStat(key: string): string | null;
  setStat(key: string, value: string): void;
  incrementStat(key: string, by?: number): void;
}

/**
 * Build a DbBridge — a convenience API over raw better-sqlite3 statements.
 */
export function createDbBridge(database?: Database.Database): DbBridge {
  const d = database ?? getDatabase();

  const insertEventStmt = d.prepare(`
    INSERT OR IGNORE INTO match_events (id, match_id, event_type, data, timestamp, ingested_at)
    VALUES (@id, @matchId, @type, @data, @timestamp, @ingestedAt)
  `);
  const getEventsByMatchStmt = d.prepare('SELECT * FROM match_events WHERE match_id = ? ORDER BY timestamp ASC');
  const getRecentEventsStmt = d.prepare('SELECT * FROM match_events ORDER BY ingested_at DESC LIMIT ?');

  const upsertFixtureStmt = d.prepare(`
    INSERT INTO fixtures (id, sport, league, home_team, away_team, start_time, status, metadata, updated_at)
    VALUES (@id, @sport, @league, @homeTeam, @awayTeam, @startTime, @status, @metadata, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      home_team = excluded.home_team,
      away_team = excluded.away_team,
      start_time = excluded.start_time,
      metadata = excluded.metadata,
      updated_at = datetime('now')
  `);
  const getFixturesStmt = d.prepare('SELECT * FROM fixtures WHERE 1=1');
  const getFixturesByStatusStmt = d.prepare('SELECT * FROM fixtures WHERE status = ? ORDER BY start_time ASC');
  const getFixtureStmt = d.prepare('SELECT * FROM fixtures WHERE id = ?');

  const insertMarketStmt = d.prepare(`
    INSERT OR IGNORE INTO markets (id, fixture_id, home_team, away_team, kickoff_time, odds, pool_sizes)
    VALUES (@id, @fixtureId, @homeTeam, @awayTeam, @kickoffTime, @odds, @poolSizes)
  `);
  const getMarketsStmt = d.prepare('SELECT * FROM markets');
  const getMarketsByStatusStmt = d.prepare('SELECT * FROM markets WHERE status = ?');
  const getMarketStmt = d.prepare('SELECT * FROM markets WHERE id = ?');
  const updateMarketStatusStmt = d.prepare(
    'UPDATE markets SET status = ?, outcome = ?, settled_at = CASE WHEN ? IS NOT NULL THEN datetime(\'now\') ELSE settled_at END WHERE id = ?'
  );
  const updateMarketOddsStmt = d.prepare('UPDATE markets SET odds = ? WHERE id = ?');
  const updateMarketPoolSizesStmt = d.prepare('UPDATE markets SET pool_sizes = ? WHERE id = ?');
  const updateMarketSolanaAddressStmt = d.prepare('UPDATE markets SET solana_market_addr = ? WHERE id = ?');

  const insertBetStmt = d.prepare(`
    INSERT INTO bets (id, market_id, user_addr, outcome, amount, odds, timestamp)
    VALUES (@id, @marketId, @userAddr, @outcome, @amount, @odds, @timestamp)
  `);
  const getBetsByMarketStmt = d.prepare('SELECT * FROM bets WHERE market_id = ?');
  const getAllBetsStmt = d.prepare('SELECT * FROM bets ORDER BY timestamp DESC');
  const getUserBetsStmt = d.prepare('SELECT * FROM bets WHERE user_addr = ? ORDER BY timestamp DESC');

  const getStatStmt = d.prepare('SELECT value FROM platform_stats WHERE key = ?');
  const setStatStmt = d.prepare(
    'INSERT OR REPLACE INTO platform_stats (key, value) VALUES (?, ?)'
  );
  const incrementStatStmt = d.prepare(`
    INSERT INTO platform_stats (key, value)
    VALUES (?, CAST(? AS TEXT))
    ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS REAL) + excluded.value AS TEXT)
  `);

  return {
    db: d,

    // Events
    insertEvent(event) {
      insertEventStmt.run({
        id: event.id,
        matchId: event.matchId,
        type: event.type,
        data: JSON.stringify(event.data),
        timestamp: event.timestamp,
        ingestedAt: event.ingestedAt,
      });
    },
    getEventsByMatch(matchId: string) {
      return getEventsByMatchStmt.all(matchId);
    },
    getRecentEvents(limit: number) {
      return getRecentEventsStmt.all(limit);
    },

    // Fixtures
    upsertFixture(fixture) {
      upsertFixtureStmt.run({
        id: fixture.id,
        sport: fixture.sport,
        league: fixture.league,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        startTime: fixture.startTime,
        status: fixture.status,
        metadata: fixture.metadata ? JSON.stringify(fixture.metadata) : null,
      });
    },
    getFixtures(status?: string) {
      if (status) {
        return getFixturesByStatusStmt.all(status);
      }
      return getFixturesStmt.all();
    },
    getFixture(id: string) {
      return getFixtureStmt.get(id);
    },

    // Markets
    insertMarket(market) {
      insertMarketStmt.run({
        id: market.id,
        fixtureId: market.fixtureId,
        homeTeam: market.homeTeam,
        awayTeam: market.awayTeam,
        kickoffTime: market.kickoffTime,
        odds: market.odds,
        poolSizes: market.poolSizes,
      });
    },
    getMarkets(status?: string) {
      if (status) {
        return getMarketsByStatusStmt.all(status);
      }
      return getMarketsStmt.all();
    },
    getMarket(id: string) {
      return getMarketStmt.get(id);
    },
    updateMarketStatus(id: string, status: string, outcome?: string) {
      updateMarketStatusStmt.run(status, outcome ?? null, outcome ?? null, id);
    },
    updateMarketOdds(id: string, odds: string) {
      updateMarketOddsStmt.run(odds, id);
    },
    updateMarketPoolSizes(id: string, poolSizes: string) {
      updateMarketPoolSizesStmt.run(poolSizes, id);
    },
    updateMarketSolanaAddress(id: string, address: string) {
      updateMarketSolanaAddressStmt.run(address, id);
    },

    // Bets
    insertBet(bet) {
      insertBetStmt.run({
        id: bet.id,
        marketId: bet.marketId,
        userAddr: bet.userAddr,
        outcome: bet.outcome,
        amount: bet.amount,
        odds: bet.odds,
        timestamp: bet.timestamp ?? new Date().toISOString(),
      });
    },
    getBetsByMarket(marketId: string) {
      return getBetsByMarketStmt.all(marketId);
    },
    getUserBets(userAddr: string) {
      return getUserBetsStmt.all(userAddr);
    },
    getAllBets() {
      return getAllBetsStmt.all();
    },

    // Stats
    getStat(key: string) {
      const row = getStatStmt.get(key) as { value: string } | undefined;
      return row?.value ?? null;
    },
    setStat(key: string, value: string) {
      setStatStmt.run(key, value);
    },
    incrementStat(key: string, by = 1) {
      incrementStatStmt.run(key, by);
    },
  };
}

// ─── Re-export logger from shared module ──────────────────────────────────────
import { createLogger } from '../logger.js';

/** Bootstrap logger used before the main logger is available. */
const logger = createLogger({ name: 'db' });
