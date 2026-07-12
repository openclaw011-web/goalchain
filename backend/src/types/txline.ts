/**
 * TxLINE Data Types
 *
 * TypeScript interfaces for all TxLINE API responses — SSE stream events,
 * fixture snapshots, score snapshots, and Merkle proofs.
 *
 * TxLINE Devnet API: https://txline-dev.txodds.com/api
 */

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface TxlineAuthResponse {
  jwt: string;
  expiresIn: number;
  refreshToken?: string;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

export interface TxlineFixture {
  id: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string; // ISO 8601
  status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
  metadata?: Record<string, unknown>;
}

export interface TxlineFixturesResponse {
  fixtures: TxlineFixture[];
  updatedAt: string;
}

// ─── Scores / Match State ────────────────────────────────────────────────────

export interface TxlineScoreSnapshot {
  matchId: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: 'scheduled' | 'in_progress' | 'halftime' | 'finished' | 'extra_time' | 'penalties';
  homeTeam: string;
  awayTeam: string;
  events: TxlineStreamEvent[];
}

// ─── SSE Stream Events ──────────────────────────────────────────────────────

/**
 * The shape of every event pushed by TxLINE SSE streams.
 * The `type` field discriminates the event category.
 */
export type TxlineStreamEvent =
  | TxlineGoalEvent
  | TxlineCardEvent
  | TxlineMatchStartEvent
  | TxlineMatchEndEvent
  | TxlineOddsUpdateEvent
  | TxlineHalftimeEvent
  | TxlineSubstitutionEvent;

export interface TxlineGoalEvent {
  type: 'goal';
  matchId: string;
  team: 'home' | 'away';
  scorer: string;
  assist?: string;
  minute: number;
  homeScore: number;
  awayScore: number;
  timestamp: string;
}

export interface TxlineCardEvent {
  type: 'card';
  matchId: string;
  team: 'home' | 'away';
  player: string;
  cardType: 'yellow' | 'red' | 'second_yellow';
  minute: number;
  timestamp: string;
}

export interface TxlineMatchStartEvent {
  type: 'match_start';
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  timestamp: string;
}

export interface TxlineMatchEndEvent {
  type: 'match_end';
  matchId: string;
  homeScore: number;
  awayScore: number;
  result: 'home_win' | 'away_win' | 'draw' | 'home_win_pen' | 'away_win_pen';
  timestamp: string;
}

export interface TxlineOddsUpdateEvent {
  type: 'odds_update';
  matchId: string;
  marketType: string;   // e.g. '1x2', 'over_under', 'both_to_score'
  odds: Record<string, number>; // key → decimal odds
  timestamp: string;
}

export interface TxlineHalftimeEvent {
  type: 'halftime';
  matchId: string;
  homeScore: number;
  awayScore: number;
  timestamp: string;
}

export interface TxlineSubstitutionEvent {
  type: 'substitution';
  matchId: string;
  team: 'home' | 'away';
  playerOff: string;
  playerOn: string;
  minute: number;
  timestamp: string;
}

// ─── Merkle Proof ────────────────────────────────────────────────────────────

export interface TxlineMerkleProof {
  matchId: string;
  result: string;
  score: {
    home: number;
    away: number;
  };
  merkleRoot: string;
  proof: string[];         // hex-encoded sibling hashes
  leaf: string;            // hex-encoded leaf hash
  timestamp: string;
}

// ─── Internal Normalised Event ───────────────────────────────────────────────

/**
 * Normalised event stored in-memory and in SQLite.
 * Every stream event type is collapsed into this shape for uniform processing.
 */
export interface NormalisedMatchEvent {
  id: string;              // UUID
  matchId: string;
  type: 'goal' | 'card' | 'match_start' | 'match_end' | 'halftime'
      | 'substitution' | 'odds_update';
  data: Record<string, unknown>;
  timestamp: string;       // ISO 8601
  ingestedAt: string;      // ISO 8601 — when our server received it
}

// ─── Market Types ────────────────────────────────────────────────────────────

export type MarketOutcome = 'home_win' | 'away_win' | 'draw';
export type MarketStatus = 'open' | 'locked' | 'settled' | 'cancelled';

export interface PredictionMarket {
  id: string;               // UUID
  fixtureId: string;        // TxLINE fixture ID
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;      // ISO 8601
  status: MarketStatus;
  // Current odds (decimal) from TxLINE stream
  odds: Record<MarketOutcome, number>;
  // Pool sizes (notional SOL)
  poolSizes: Record<MarketOutcome, number>;
  // Settled outcome (null until settled)
  outcome: MarketOutcome | null;
  // Solana account address for on-chain market (once deployed)
  solanaMarketAddress: string | null;
  createdAt: string;
  settledAt: string | null;
}

export interface Bet {
  id: string;
  marketId: string;
  user: string;             // Solana wallet address
  outcome: MarketOutcome;
  amount: number;           // Notional SOL
  odds: number;             // Odds at time of bet
  timestamp: string;
  claimed: boolean;
}

// ─── WebSocket Message Types ─────────────────────────────────────────────────

export type WsChannel = 'scores' | 'odds' | 'market_updates';

export interface WsMessage {
  channel: WsChannel;
  event: string;
  data: unknown;
  timestamp: string;
}
