/**
 * TxLINE SSE Stream Ingestion Service
 *
 * Connects to TxLINE Devnet SSE streams for live World Cup scores and odds.
 * Handles:
 *  - SSE connection lifecycle (connect, reconnect with exponential backoff)
 *  - Event parsing and normalisation (goals, cards, match_start, match_end, odds_update, etc.)
 *  - In-memory event buffer + SQLite persistence via DbBridge
 *  - Backpressure detection (buffer size threshold)
 *  - Mock authentication for dev environments (real auth requires Solana tx signing)
 *
 * TxLINE Devnet API: https://txline-dev.txodds.com/api
 * SSE endpoints:
 *   GET /api/scores/soccer/stream
 *   GET /api/odds/stream
 * Snapshot endpoints:
 *   GET /api/scores/soccer/snapshot
 *   GET /api/scores/soccer/proof/:matchId
 *   GET /api/fixtures
 */

import EventSource from 'eventsource';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'node:events';
import { config } from '../config.js';
import { getLogger } from '../logger.js';
import type {
  TxlineStreamEvent,
  TxlineMerkleProof,
  TxlineFixturesResponse,
  TxlineScoreSnapshot,
  NormalisedMatchEvent,
} from '../types/txline.js';

// ─── Logger ──────────────────────────────────────────────────────────────────

const logger = getLogger();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TxlineServiceOptions {
  jwt?: string;
  apiToken?: string;
  apiBase?: string;
  /** Max events buffered in memory before backpressure kicks in (default: 10_000). */
  maxBufferSize?: number;
  /** Base reconnection delay in ms (default: 1000). */
  reconnectBaseMs?: number;
  /** Max reconnection delay in ms (default: 60_000). */
  reconnectMaxMs?: number;
}

export interface TxlineStatus {
  scoresConnected: boolean;
  oddsConnected: boolean;
  eventsIngested: number;
  bufferSize: number;
  lastEventAt: string | null;
  reconnectAttempt: number;
}

// ─── Event Types ─────────────────────────────────────────────────────────────

export type TxlineServiceEvent =
  | 'event:goal'
  | 'event:card'
  | 'event:match_start'
  | 'event:match_end'
  | 'event:halftime'
  | 'event:substitution'
  | 'event:odds_update'
  | 'connection:scores_open'
  | 'connection:scores_error'
  | 'connection:scores_close'
  | 'connection:odds_open'
  | 'connection:odds_error'
  | 'connection:odds_close'
  | 'error'
  | 'backpressure';

// ─── DbBridge interface (injected to avoid circular dep at import time) ──────

export interface DbBridgeLike {
  insertEvent(event: {
    id: string; matchId: string; type: string; data: unknown;
    timestamp: string; ingestedAt: string;
  }): void;
  upsertFixture(fixture: {
    id: string; sport: string; league: string; homeTeam: string; awayTeam: string;
    startTime: string; status: string; metadata?: Record<string, unknown>;
  }): void;
  getFixtures(status?: string): unknown[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class TxlineService extends EventEmitter {
  private options: Required<TxlineServiceOptions>;
  private db: DbBridgeLike | null = null;

  // SSE connections
  private scoresSource: EventSource | null = null;
  private oddsSource: EventSource | null = null;

  // State
  private eventsIngested = 0;
  private reconnectAttempt = 0;
  private lastEventAt: string | null = null;
  private scoresConnected = false;
  private oddsConnected = false;

  // In-memory event buffer (ring buffer semantics with backpressure signal)
  private eventBuffer: NormalisedMatchEvent[] = [];
  private readonly bufferSizeLimit: number;

  // Reconnection timers
  private scoresReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private oddsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Fixture polling
  private fixturePollTimer: ReturnType<typeof setInterval> | null = null;

  // Stream error thresholds
  private scoresErrorCount = 0;
  private oddsErrorCount = 0;
  private readonly maxErrorsBeforeReset = 20;

  constructor(options?: TxlineServiceOptions) {
    super();
    this.options = {
      jwt: options?.jwt ?? config.txlineJwt,
      apiToken: options?.apiToken ?? config.txlineApiToken,
      apiBase: options?.apiBase ?? config.txlineApiBase,
      maxBufferSize: options?.maxBufferSize ?? 10_000,
      reconnectBaseMs: options?.reconnectBaseMs ?? 1_000,
      reconnectMaxMs: options?.reconnectMaxMs ?? 60_000,
    };
    this.bufferSizeLimit = this.options.maxBufferSize;
    logger.info({ options: this.options }, 'TxLINE service initialised');
  }

  /**
   * Set the database bridge for persistence.
   * Call before start().
   */
  setDb(db: DbBridgeLike): void {
    this.db = db;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Start all connections: scores SSE, odds SSE, and fixture polling. */
  start(): void {
    logger.info('Starting TxLINE service...');
    this.connectScoresStream();
    this.connectOddsStream();
    this.startFixturePolling();
  }

  /** Gracefully stop all connections and timers. */
  stop(): void {
    logger.info('Stopping TxLINE service...');
    this.disconnectScoresStream();
    this.disconnectOddsStream();
    this.stopFixturePolling();
    this.removeAllListeners();
  }

  /** Get current service status. */
  getStatus(): TxlineStatus {
    return {
      scoresConnected: this.scoresConnected,
      oddsConnected: this.oddsConnected,
      eventsIngested: this.eventsIngested,
      bufferSize: this.eventBuffer.length,
      lastEventAt: this.lastEventAt,
      reconnectAttempt: this.reconnectAttempt,
    };
  }

  /** Get a slice of the in-memory event buffer. */
  getRecentEvents(limit = 100): NormalisedMatchEvent[] {
    return this.eventBuffer.slice(-limit);
  }

  /** Get events for a specific match from the buffer. */
  getEventsForMatch(matchId: string): NormalisedMatchEvent[] {
    return this.eventBuffer.filter((e) => e.matchId === matchId);
  }

  /** Fetch a Merkle proof for a given match from TxLINE. */
  async fetchMerkleProof(matchId: string): Promise<TxlineMerkleProof | null> {
    const url = `${this.options.apiBase}/scores/soccer/proof/${matchId}`;
    try {
      const response = await fetch(url, {
        headers: this.buildHeaders(),
      });
      if (!response.ok) {
        logger.warn({ matchId, status: response.status }, 'Failed to fetch Merkle proof');
        return null;
      }
      const data = (await response.json()) as TxlineMerkleProof;
      return data;
    } catch (error) {
      logger.error({ error, matchId }, 'Error fetching Merkle proof');
      return null;
    }
  }

  /**
   * Fetch current fixtures snapshot.
   *
   * The real TxLINE endpoint is `GET /api/fixtures/snapshot` and returns a
   * raw array of entries shaped like:
   *   { FixtureId, Competition, CompetitionId, Participant1, Participant2,
   *     Participant1IsHome, StartTime (ms), GameState, SportId?, Ts }
   * We normalise that into TxlineFixturesResponse.
   */
  async fetchFixtures(): Promise<TxlineFixturesResponse | null> {
    const url = `${this.options.apiBase}/fixtures/snapshot`;
    try {
      const response = await fetch(url, {
        headers: this.buildHeaders(),
      });
      if (!response.ok) {
        logger.warn({ status: response.status }, 'Failed to fetch fixtures');
        return null;
      }
      const raw = (await response.json()) as unknown;
      const entries = Array.isArray(raw) ? raw : (raw as { fixtures?: unknown[] })?.fixtures ?? [];

      const fixtures = (entries as Array<Record<string, unknown>>)
        .filter((e) => e && e.FixtureId !== undefined)
        .map((e) => {
          const p1 = String(e.Participant1 ?? 'Home');
          const p2 = String(e.Participant2 ?? 'Away');
          const p1Home = e.Participant1IsHome !== false;
          const startMs = Number(e.StartTime ?? 0);
          const gameState = e.GameState;
          let status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
          if (typeof gameState === 'string' && ['scheduled', 'live', 'finished', 'postponed', 'cancelled'].includes(gameState)) {
            status = gameState as typeof status;
          } else if (startMs > Date.now()) {
            status = 'scheduled';
          } else {
            status = 'live';
          }
          return {
            id: String(e.FixtureId),
            sport: 'soccer',
            league: String(e.Competition ?? e.CompetitionId ?? 'unknown'),
            homeTeam: p1Home ? p1 : p2,
            awayTeam: p1Home ? p2 : p1,
            startTime: new Date(startMs || Date.now()).toISOString(),
            status,
            metadata: {
              fixtureId: e.FixtureId,
              competitionId: e.CompetitionId,
              fixtureGroupId: e.FixtureGroupId,
            },
          };
        });

      return { fixtures, updatedAt: new Date().toISOString() };
    } catch (error) {
      logger.error({ error }, 'Error fetching fixtures');
      return null;
    }
  }

  /** Fetch score snapshot for a specific match (or all live matches). */
  async fetchScoreSnapshot(matchId?: string): Promise<TxlineScoreSnapshot | TxlineScoreSnapshot[] | null> {
    const url = matchId
      ? `${this.options.apiBase}/scores/snapshot/${matchId}`
      : `${this.options.apiBase}/scores/snapshot`;
    try {
      const response = await fetch(url, {
        headers: this.buildHeaders(),
      });
      if (!response.ok) {
        logger.warn({ status: response.status }, 'Failed to fetch score snapshot');
        return null;
      }
      const data = (await response.json()) as TxlineScoreSnapshot | TxlineScoreSnapshot[];
      return data;
    } catch (error) {
      logger.error({ error }, 'Error fetching score snapshot');
      return null;
    }
  }

  // ─── SSE Connection: Scores ────────────────────────────────────────────────

  private connectScoresStream(): void {
    const url = `${this.options.apiBase}/scores/stream`;
    logger.info({ url: this.maskUrl(url) }, 'Connecting to scores SSE stream');

    try {
      this.scoresSource = new EventSource(url, {
        headers: this.buildHeaders() as Record<string, string>,
      });

      this.scoresSource.onopen = () => {
        this.scoresConnected = true;
        this.scoresErrorCount = 0;
        this.reconnectAttempt = 0;
        logger.info('Scores SSE stream connected');
        this.emit('connection:scores_open');
      };

      this.scoresSource.onmessage = (event: MessageEvent) => {
        this.handleScoresMessage(event.data);
      };

      this.scoresSource.onerror = (error: Event) => {
        this.scoresErrorCount++;
        logger.error(
          { error: String(error), count: this.scoresErrorCount },
          'Scores SSE stream error',
        );
        this.scoresConnected = false;
        this.emit('connection:scores_error', error);

        if (this.scoresErrorCount >= this.maxErrorsBeforeReset) {
          logger.warn('Scores stream hit max errors — forcing reconnect');
          this.disconnectScoresStream();
          this.scheduleScoresReconnect();
        }
      };

      // EventSource doesn't natively emit 'close' — we infer via error + readyState
    } catch (error) {
      logger.error({ error }, 'Failed to create scores SSE connection');
      this.scheduleScoresReconnect();
    }
  }

  private disconnectScoresStream(): void {
    if (this.scoresReconnectTimer) {
      clearTimeout(this.scoresReconnectTimer);
      this.scoresReconnectTimer = null;
    }
    if (this.scoresSource) {
      this.scoresSource.close();
      this.scoresSource = null;
    }
    this.scoresConnected = false;
    this.emit('connection:scores_close');
  }

  private scheduleScoresReconnect(): void {
    if (this.scoresReconnectTimer) return; // already scheduled
    const delay = this.getReconnectDelay();
    logger.info({ delayMs: delay }, 'Scheduling scores SSE reconnect');
    this.scoresReconnectTimer = setTimeout(() => {
      this.scoresReconnectTimer = null;
      this.connectScoresStream();
    }, delay);
  }

  // ─── SSE Connection: Odds ──────────────────────────────────────────────────

  private connectOddsStream(): void {
    const url = `${this.options.apiBase}/odds/stream`;
    logger.info({ url: this.maskUrl(url) }, 'Connecting to odds SSE stream');

    try {
      this.oddsSource = new EventSource(url, {
        headers: this.buildHeaders() as Record<string, string>,
      });

      this.oddsSource.onopen = () => {
        this.oddsConnected = true;
        this.oddsErrorCount = 0;
        logger.info('Odds SSE stream connected');
        this.emit('connection:odds_open');
      };

      this.oddsSource.onmessage = (event: MessageEvent) => {
        this.handleOddsMessage(event.data);
      };

      this.oddsSource.onerror = (error: Event) => {
        this.oddsErrorCount++;
        logger.error(
          { error: String(error), count: this.oddsErrorCount },
          'Odds SSE stream error',
        );
        this.oddsConnected = false;
        this.emit('connection:odds_error', error);

        if (this.oddsErrorCount >= this.maxErrorsBeforeReset) {
          logger.warn('Odds stream hit max errors — forcing reconnect');
          this.disconnectOddsStream();
          this.scheduleOddsReconnect();
        }
      };
    } catch (error) {
      logger.error({ error }, 'Failed to create odds SSE connection');
      this.scheduleOddsReconnect();
    }
  }

  private disconnectOddsStream(): void {
    if (this.oddsReconnectTimer) {
      clearTimeout(this.oddsReconnectTimer);
      this.oddsReconnectTimer = null;
    }
    if (this.oddsSource) {
      this.oddsSource.close();
      this.oddsSource = null;
    }
    this.oddsConnected = false;
    this.emit('connection:odds_close');
  }

  private scheduleOddsReconnect(): void {
    if (this.oddsReconnectTimer) return;
    const delay = this.getReconnectDelay();
    logger.info({ delayMs: delay }, 'Scheduling odds SSE reconnect');
    this.oddsReconnectTimer = setTimeout(() => {
      this.oddsReconnectTimer = null;
      this.connectOddsStream();
    }, delay);
  }

  // ─── Fixture Polling ──────────────────────────────────────────────────────

  private startFixturePolling(): void {
    // Fetch immediately, then poll
    this.pollFixtures();
    const intervalMs = config.fixturePollInterval;
    this.fixturePollTimer = setInterval(() => this.pollFixtures(), intervalMs);
    logger.info({ intervalMs }, 'Fixture polling started');
  }

  private stopFixturePolling(): void {
    if (this.fixturePollTimer) {
      clearInterval(this.fixturePollTimer);
      this.fixturePollTimer = null;
    }
  }

  private async pollFixtures(): Promise<void> {
    try {
      const fixtures = await this.fetchFixtures();
      if (!fixtures || !fixtures.fixtures) {
        logger.warn('No fixtures returned from poll');
        return;
      }

      for (const fixture of fixtures.fixtures) {
        this.db?.upsertFixture({
          id: fixture.id,
          sport: fixture.sport,
          league: fixture.league,
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          startTime: fixture.startTime,
          status: fixture.status,
          metadata: fixture.metadata,
        });
      }

      // Notify market service so upcoming World Cup fixtures get markets.
      const worldCupUpcoming = fixtures.fixtures.filter(
        (f) =>
          f.status === 'scheduled' &&
          (f.league === 'World Cup' || (f.metadata as { competitionId?: number } | undefined)?.competitionId === 72),
      );
      if (worldCupUpcoming.length > 0) {
        this.emit('fixtures:updated', worldCupUpcoming);
      }

      logger.debug(
        { count: fixtures.fixtures.length, worldCup: worldCupUpcoming.length },
        'Fixtures polled and upserted',
      );
    } catch (error) {
      logger.error({ error }, 'Error during fixture polling');
    }
  }

  // ─── Message Handlers ─────────────────────────────────────────────────────

  private handleScoresMessage(rawData: string): void {
    try {
      const parsed = JSON.parse(rawData) as TxlineStreamEvent;
      const normalised = this.normaliseEvent(parsed);
      if (!normalised) return;

      this.ingestEvent(normalised);

      // Emit typed events for other services to react
      const eventKey = `event:${normalised.type}` as TxlineServiceEvent;
      this.emit(eventKey, normalised);
    } catch (error) {
      logger.error({ error, raw: rawData.substring(0, 500) }, 'Failed to parse scores SSE message');
    }
  }

  private handleOddsMessage(rawData: string): void {
    try {
      const parsed = JSON.parse(rawData) as TxlineStreamEvent;
      const normalised = this.normaliseEvent(parsed);
      if (!normalised) return;

      this.ingestEvent(normalised);
      this.emit('event:odds_update', normalised);
    } catch (error) {
      logger.error({ error, raw: rawData.substring(0, 500) }, 'Failed to parse odds SSE message');
    }
  }

  // ─── Event Normalisation ──────────────────────────────────────────────────

  /**
   * Parse a raw TxLINE stream event into a normalised internal event.
   * Returns null if the event type is unknown/unsupported.
   */
  private normaliseEvent(raw: TxlineStreamEvent): NormalisedMatchEvent | null {
    const now = new Date().toISOString();

    switch (raw.type) {
      case 'goal':
        return {
          id: uuidv4(),
          matchId: raw.matchId,
          type: 'goal',
          data: {
            team: raw.team,
            scorer: raw.scorer,
            assist: raw.assist ?? null,
            minute: raw.minute,
            homeScore: raw.homeScore,
            awayScore: raw.awayScore,
          },
          timestamp: raw.timestamp,
          ingestedAt: now,
        };

      case 'card':
        return {
          id: uuidv4(),
          matchId: raw.matchId,
          type: 'card',
          data: {
            team: raw.team,
            player: raw.player,
            cardType: raw.cardType,
            minute: raw.minute,
          },
          timestamp: raw.timestamp,
          ingestedAt: now,
        };

      case 'match_start':
        return {
          id: uuidv4(),
          matchId: raw.matchId,
          type: 'match_start',
          data: {
            homeTeam: raw.homeTeam,
            awayTeam: raw.awayTeam,
            kickoffTime: raw.kickoffTime,
          },
          timestamp: raw.timestamp,
          ingestedAt: now,
        };

      case 'match_end':
        return {
          id: uuidv4(),
          matchId: raw.matchId,
          type: 'match_end',
          data: {
            homeScore: raw.homeScore,
            awayScore: raw.awayScore,
            result: raw.result,
          },
          timestamp: raw.timestamp,
          ingestedAt: now,
        };

      case 'odds_update':
        return {
          id: uuidv4(),
          matchId: raw.matchId,
          type: 'odds_update',
          data: {
            marketType: raw.marketType,
            odds: raw.odds,
          },
          timestamp: raw.timestamp,
          ingestedAt: now,
        };

      case 'halftime':
        return {
          id: uuidv4(),
          matchId: raw.matchId,
          type: 'halftime',
          data: {
            homeScore: raw.homeScore,
            awayScore: raw.awayScore,
          },
          timestamp: raw.timestamp,
          ingestedAt: now,
        };

      case 'substitution':
        return {
          id: uuidv4(),
          matchId: raw.matchId,
          type: 'substitution',
          data: {
            team: raw.team,
            playerOff: raw.playerOff,
            playerOn: raw.playerOn,
            minute: raw.minute,
          },
          timestamp: raw.timestamp,
          ingestedAt: now,
        };

      default:
        logger.warn({ type: (raw as Record<string, unknown>).type }, 'Unknown TxLINE event type');
        return null;
    }
  }

  // ─── Ingestion + Backpressure ─────────────────────────────────────────────

  /**
   * Store an event in the in-memory buffer and optionally persist to SQLite.
   * Emits a 'backpressure' event if the buffer exceeds the configured limit.
   */
  private ingestEvent(event: NormalisedMatchEvent): void {
    this.eventBuffer.push(event);
    this.eventsIngested++;
    this.lastEventAt = event.ingestedAt;

    // Persist to SQLite (fire-and-forget, non-blocking)
    try {
      this.db?.insertEvent({
        id: event.id,
        matchId: event.matchId,
        type: event.type,
        data: event.data,
        timestamp: event.timestamp,
        ingestedAt: event.ingestedAt,
      });
    } catch (error) {
      logger.error({ error, eventId: event.id }, 'Failed to persist event to SQLite');
    }

    // Backpressure: if buffer is full, trim oldest events and emit warning
    if (this.eventBuffer.length > this.bufferSizeLimit) {
      const trimmed = this.eventBuffer.splice(0, this.eventBuffer.length - this.bufferSizeLimit);
      logger.warn({
        trimmed: trimmed.length,
        bufferSize: this.eventBuffer.length,
      }, 'Backpressure: event buffer trimmed');
      this.emit('backpressure', { trimmed: trimmed.length, bufferSize: this.eventBuffer.length });
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Build the HTTP headers for TxLINE API requests.
   * In dev mode, uses mock JWT and API token. Real auth requires Solana tx signing.
   */
  private buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.options.jwt}`,
      'X-Api-Token': this.options.apiToken,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
    };
  }

  /**
   * Exponential backoff with jitter for reconnection delays.
   */
  private getReconnectDelay(): number {
    this.reconnectAttempt++;
    const base = this.options.reconnectBaseMs;
    const max = this.options.reconnectMaxMs;
    const exponential = Math.min(base * Math.pow(2, this.reconnectAttempt - 1), max);
    // Add ±25% jitter
    const jitter = exponential * (0.75 + Math.random() * 0.5);
    return Math.floor(jitter);
  }

  /** Mask API tokens in URLs for safe logging. */
  private maskUrl(url: string): string {
    return url.replace(/\/api\//, '/api/...');
  }

  /**
   * Mock TxLINE authentication for development/testing.
   * Real auth: POST /auth/guest/start → JWT, plus on-chain subscription → X-Api-Token.
   * This skips the real flow and returns mock credentials.
   */
  static mockAuth(): { jwt: string; apiToken: string } {
    return {
      jwt: 'mock-jwt-for-development',
      apiToken: 'mock-api-token-for-development',
    };
  }
}
