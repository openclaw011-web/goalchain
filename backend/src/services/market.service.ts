/**
 * Market Management Service
 *
 * Auto-creates prediction markets from World Cup fixtures, locks them at
 * kickoff, updates live odds from TxLINE stream, and triggers settlement
 * when matches end.
 *
 * Lifecycle:
 *   scheduled (fixture posted) → open (market created)
 *                             → locked (at kickoff)
 *                             → settled (match ended, outcome published)
 *                             → cancelled (match postponed/cancelled)
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'node:events';
import { config } from '../config.js';
import { getLogger } from '../logger.js';
import type { PredictionMarket, MarketOutcome, MarketStatus } from '../types/txline.js';
import type { NormalisedMatchEvent } from '../types/txline.js';

const logger = getLogger();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MarketDbBridge {
  insertMarket(market: {
    id: string; fixtureId: string; homeTeam: string; awayTeam: string;
    kickoffTime: string; odds: string; poolSizes: string;
  }): void;
  getMarkets(status?: string): unknown[];
  getMarket(id: string): unknown;
  updateMarketStatus(id: string, status: string, outcome?: string): void;
  updateMarketOdds(id: string, odds: string): void;
  updateMarketPoolSizes(id: string, poolSizes: string): void;
  getFixtures(status?: string): unknown[];
  getFixture(id: string): unknown;
  upsertFixture(fixture: {
    id: string; sport: string; league: string; homeTeam: string; awayTeam: string;
    startTime: string; status: string; metadata?: Record<string, unknown>;
  }): void;
  insertBet(bet: {
    id: string; marketId: string; userAddr: string; outcome: string;
    amount: number; odds: number;
  }): void;
  getBetsByMarket(marketId: string): unknown[];
  getAllBets(): unknown[];
  incrementStat(key: string, by?: number): void;
  getStat(key: string): string | null;
}

// ─── Row types from SQLite (snake_case -> camelCase conversion) ──────────────

interface MarketRow {
  id: string;
  fixture_id: string;
  home_team: string;
  away_team: string;
  kickoff_time: string;
  status: string;
  odds: string;
  pool_sizes: string;
  outcome: string | null;
  solana_market_addr: string | null;
  created_at: string;
  settled_at: string | null;
}

interface FixtureRow {
  id: string;
  sport: string;
  league: string;
  home_team: string;
  away_team: string;
  start_time: string;
  status: string;
  metadata: string | null;
  updated_at: string;
}

interface BetRow {
  id: string;
  market_id: string;
  user_addr: string;
  outcome: string;
  amount: number;
  odds: number;
  timestamp: string;
  claimed: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class MarketService extends EventEmitter {
  private db: MarketDbBridge;
  /** The current odds snapshot (indexed by matchId -> outcome -> odds). */
  private liveOdds: Map<string, Record<MarketOutcome, number>> = new Map();
  /** Track which markets have been created for which fixtures (to avoid duplicates). */
  private createdForFixture: Set<string> = new Set();

  constructor(db: MarketDbBridge) {
    super();
    this.db = db;

    // Seed createdForFixture from existing markets in DB
    const existing = this.db.getMarkets() as MarketRow[];
    for (const m of existing) {
      this.createdForFixture.add(m.fixture_id);
    }

    logger.info({ existingMarkets: existing.length }, 'Market service initialised');
  }

  // ─── Market CRUD ──────────────────────────────────────────────────────────

  /** Get all markets, optionally filtered by status. Returns camelCase objects. */
  getAllMarkets(status?: MarketStatus): PredictionMarket[] {
    const rows = this.db.getMarkets(status) as MarketRow[];
    return rows.map(this.rowToMarket);
  }

  /** Get a single market by ID. */
  getMarket(id: string): PredictionMarket | null {
    const row = this.db.getMarket(id) as MarketRow | undefined;
    if (!row) return null;
    return this.rowToMarket(row);
  }

  /** Get the bet distribution for a market. */
  getMarketBets(marketId: string): Array<{
    id: string; marketId: string; user: string; outcome: MarketOutcome;
    amount: number; odds: number; timestamp: string; claimed: boolean;
  }> {
    const rows = this.db.getBetsByMarket(marketId) as BetRow[];
    return rows.map((r) => ({
      id: r.id,
      marketId: r.market_id,
      user: r.user_addr,
      outcome: r.outcome as MarketOutcome,
      amount: r.amount,
      odds: r.odds,
      timestamp: r.timestamp,
      claimed: r.claimed === 1,
    }));
  }

  /** Get live odds for a match. */
  getLiveOdds(matchId: string): Record<MarketOutcome, number> | null {
    return this.liveOdds.get(matchId) ?? null;
  }

  /** Get all current live odds. */
  getAllLiveOdds(): Map<string, Record<MarketOutcome, number>> {
    return new Map(this.liveOdds);
  }

  // ─── Event-driven lifecycle ───────────────────────────────────────────────

  /**
   * Called when a fixture poll returns new fixtures.
   * Creates markets for upcoming fixtures that don't have one yet.
   */
  processFixtures(fixtures: Array<{
    id: string; homeTeam: string; awayTeam: string;
    startTime: string; status: string;
  }>): void {
    const now = Date.now();
    const lookahead = config.marketCreationLookahead;

    for (const fixture of fixtures) {
      // Only create markets for scheduled/upcoming fixtures
      if (fixture.status !== 'scheduled' && fixture.status !== 'live') continue;

      // Skip if we already created a market for this fixture
      if (this.createdForFixture.has(fixture.id)) continue;

      const kickoffMs = new Date(fixture.startTime).getTime();

      // Only create if within lookahead window (default 24h)
      if (kickoffMs > now + lookahead) continue;

      this.createMarket(fixture);
    }
  }

  /**
   * Process a TxLINE event. This handles:
   *  - match_start  → set market to 'locked' (bets close at kickoff)
   *  - match_end    → trigger settlement
   *  - odds_update  → update live odds
   *  - goal/halftime → update pool sizes (simulated price impact)
   */
  processTxlineEvent(event: NormalisedMatchEvent): void {
    switch (event.type) {
      case 'match_start':
        this.lockMarket(event.matchId);
        break;

      case 'match_end':
        this.settleMarket(event.matchId, event.data as { result: string });
        break;

      case 'odds_update': {
        const data = event.data as { marketType: string; odds: Record<string, number> };
        // Only track 1x2 market odds for prediction markets
        if (data.marketType === '1x2' || data.marketType === 'match_winner') {
          this.updateOdds(event.matchId, data.odds as unknown as Record<MarketOutcome, number>);
        }
        break;
      }

      case 'goal':
        // Simulate pool size drift on goals (price impact)
        this.simulateGoalImpact(event.matchId, event.data as { team: string });
        break;

      default:
        break;
    }
  }

  /**
   * Settle a market manually (admin trigger).
   */
  settleMarketManually(marketId: string, outcome: MarketOutcome): boolean {
    const market = this.getMarket(marketId);
    if (!market) {
      logger.warn({ marketId }, 'Market not found for manual settlement');
      return false;
    }

    if (market.status !== 'locked' && market.status !== 'open') {
      logger.warn({ marketId, status: market.status }, 'Market cannot be settled in current status');
      return false;
    }

    this.db.updateMarketStatus(marketId, 'settled', outcome);
    this.db.incrementStat('settled_markets');
    logger.info({ marketId, outcome }, 'Market settled (manual)');
    this.emit('market:settled', { marketId, outcome });

    // Emit WebSocket update
    this.emit('ws:market_update', {
      channel: 'market_updates',
      event: 'market_settled',
      data: { marketId, outcome },
    });

    return true;
  }

  // ─── Internal Market Lifecycle ────────────────────────────────────────────

  /**
   * Create a prediction market for a fixture.
   */
  private createMarket(fixture: {
    id: string; homeTeam: string; awayTeam: string; startTime: string;
  }): PredictionMarket {
    const initialOdds: Record<MarketOutcome, number> = {
      home_win: 2.0,
      away_win: 3.5,
      draw: 3.2,
    };
    const initialPools: Record<MarketOutcome, number> = {
      home_win: 0,
      away_win: 0,
      draw: 0,
    };

    const market: PredictionMarket = {
      id: uuidv4(),
      fixtureId: fixture.id,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      kickoffTime: fixture.startTime,
      status: 'open',
      odds: initialOdds,
      poolSizes: initialPools,
      outcome: null,
      solanaMarketAddress: null,
      createdAt: new Date().toISOString(),
      settledAt: null,
    };

    this.db.insertMarket({
      id: market.id,
      fixtureId: market.fixtureId,
      homeTeam: market.homeTeam,
      awayTeam: market.awayTeam,
      kickoffTime: market.kickoffTime,
      odds: JSON.stringify(initialOdds),
      poolSizes: JSON.stringify(initialPools),
    });

    this.createdForFixture.add(fixture.id);
    this.db.incrementStat('total_markets');

    logger.info(
      { marketId: market.id, fixture: fixture.id, home: fixture.homeTeam, away: fixture.awayTeam },
      'Prediction market created',
    );

    // Emit for WebSocket relay
    this.emit('ws:market_update', {
      channel: 'market_updates',
      event: 'market_created',
      data: market,
    });

    return market;
  }

  /**
   * Lock a market when the match starts (bets no longer accepted).
   */
  private lockMarket(matchId: string): void {
    const fixtureRow = this.db.getFixture(matchId) as FixtureRow | undefined;
    if (!fixtureRow) return;

    // Find the market for this fixture
    const markets = this.db.getMarkets('open') as MarketRow[];
    const marketRow = markets.find((m) => m.fixture_id === matchId);
    if (!marketRow) return;

    this.db.updateMarketStatus(marketRow.id, 'locked');
    logger.info({ marketId: marketRow.id, matchId }, 'Market locked at kickoff');
    this.emit('ws:market_update', {
      channel: 'market_updates',
      event: 'market_locked',
      data: { marketId: marketRow.id, matchId },
    });
  }

  /**
   * Settle a market based on match result.
   */
  private settleMarket(matchId: string, data: { result: string }): void {
    const markets = this.db.getMarkets('locked') as MarketRow[];
    const marketRow = markets.find((m) => m.fixture_id === matchId);
    let fallback: MarketRow | undefined;
    if (!marketRow) {
      // Maybe it's still 'open' — edge case for very quick matches
      const allMarkets = this.db.getMarkets() as MarketRow[];
      fallback = allMarkets.find((m) => m.fixture_id === matchId);
      if (!fallback || fallback.status === 'settled') return;
      // Force lock then settle
      this.db.updateMarketStatus(fallback.id, 'settled', data.result);
    } else {
      this.db.updateMarketStatus(marketRow.id, 'settled', data.result);
    }

    const settledId = marketRow?.id ?? fallback?.id;
    if (settledId) {
      this.db.incrementStat('settled_markets');
      logger.info({ marketId: settledId, matchId, result: data.result }, 'Market settled');
      this.emit('market:settled', { marketId: settledId, matchId, result: data.result });
      this.emit('ws:market_update', {
        channel: 'market_updates',
        event: 'market_settled',
        data: { marketId: settledId, matchId, result: data.result },
      });
    }
  }

  /**
   * Update live odds for a match from TxLINE odds stream.
   * Also persists to the market record in DB.
   */
  private updateOdds(matchId: string, newOdds: Record<MarketOutcome, number>): void {
    this.liveOdds.set(matchId, newOdds);

    // Find market and update its odds in DB
    const markets = this.db.getMarkets() as MarketRow[];
    const marketRow = markets.find((m) => m.fixture_id === matchId);
    if (marketRow && (marketRow.status === 'open' || marketRow.status === 'locked')) {
      this.db.updateMarketOdds(marketRow.id, JSON.stringify(newOdds));
    }

    this.emit('ws:odds_update', {
      channel: 'odds',
      event: 'odds_changed',
      data: { matchId, odds: newOdds },
    });
  }

  /**
   * Simulate pool size changes when a goal is scored (for demo purposes).
   * In production, pool sizes come from on-chain state.
   */
  private simulateGoalImpact(matchId: string, data: { team: string }): void {
    const markets = this.db.getMarkets() as MarketRow[];
    const marketRow = markets.find((m) => m.fixture_id === matchId);
    if (!marketRow) return;

    const pools = JSON.parse(marketRow.pool_sizes || '{}') as Record<string, number>;
    if (data.team === 'home') {
      pools.home_win = (pools.home_win || 0) + 5; // Simulated SOL inflow
    } else {
      pools.away_win = (pools.away_win || 0) + 5;
    }

    this.db.updateMarketPoolSizes(marketRow.id, JSON.stringify(pools));
  }

  // ─── Stats ─────────────────────────────────────────────────────────────────

  getStats(): {
    totalVolume: number;
    totalMarkets: number;
    activeBets: number;
    settledMarkets: number;
    totalUsers: number;
    activeMarkets: number;
  } {
    const activeMarkets = (this.db.getMarkets('open') as MarketRow[]).length;
    const lockedMarkets = (this.db.getMarkets('locked') as MarketRow[]).length;

    return {
      totalVolume: parseFloat(this.db.getStat('total_volume') || '0'),
      totalMarkets: parseFloat(this.db.getStat('total_markets') || '0'),
      activeBets: parseFloat(this.db.getStat('active_bets') || '0'),
      settledMarkets: parseFloat(this.db.getStat('settled_markets') || '0'),
      totalUsers: parseFloat(this.db.getStat('total_users') || '0'),
      activeMarkets: activeMarkets + lockedMarkets,
    };
  }

  getLeaderboard(limit = 20): Array<{ user: string; winnings: number; bets: number }> {
    const allBets = (this.db as any).getAllBets?.() as BetRow[] ?? this.db.getBetsByMarket('') as BetRow[];
    if (!Array.isArray(allBets)) return [];

    // Aggregate by user
    const userMap = new Map<string, { winnings: number; bets: number }>();
    for (const bet of allBets) {
      if (!bet.user_addr) continue;
      const entry = userMap.get(bet.user_addr) || { winnings: 0, bets: 0 };
      entry.bets++;
      // Winnings = amount * odds if claimed
      if (bet.claimed) {
        entry.winnings += bet.amount * bet.odds;
      }
      userMap.set(bet.user_addr, entry);
    }

    return Array.from(userMap.entries())
      .map(([user, data]) => ({ user, winnings: data.winnings, bets: data.bets }))
      .sort((a, b) => b.winnings - a.winnings)
      .slice(0, limit);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private rowToMarket(row: MarketRow): PredictionMarket {
    return {
      id: row.id,
      fixtureId: row.fixture_id,
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      kickoffTime: row.kickoff_time,
      status: row.status as MarketStatus,
      odds: JSON.parse(row.odds || '{}'),
      poolSizes: JSON.parse(row.pool_sizes || '{}'),
      outcome: row.outcome as MarketOutcome | null,
      solanaMarketAddress: row.solana_market_addr,
      createdAt: row.created_at,
      settledAt: row.settled_at,
    };
  }
}

// ─── Validate outcomes via Zod ───────────────────────────────────────────────

import { z } from 'zod';

export const MarketOutcomeSchema = z.enum(['home_win', 'away_win', 'draw']);
export const MarketStatusSchema = z.enum(['open', 'locked', 'settled', 'cancelled']);
