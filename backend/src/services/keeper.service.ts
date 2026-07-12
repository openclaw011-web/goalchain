/**
 * Keeper Bot — trustless settlement crank
 *
 * Watches market lifecycle events and pushes settlements on-chain:
 *
 *   match ends → MarketService marks the DB market settled and emits
 *   'market:settled' → the keeper fetches the TxLINE Merkle proof for the
 *   match and calls settle_market on the Anchor program, which CPIs into
 *   TxLINE's validate_stat. If the proof is invalid the transaction
 *   reverts and the market stays Locked on-chain.
 *
 * A periodic sweep retries markets whose on-chain settlement previously
 * failed (RPC hiccups, proof not yet published, etc.), so settlement is
 * eventually consistent without any human in the loop.
 *
 * The keeper needs SOLANA_KEEPER_PRIVATE_KEY to sign; without it the
 * SolanaService rejects settlement and the keeper just logs and retries.
 */

import { EventEmitter } from 'node:events';
import { getLogger } from '../logger.js';
import type { SolanaService } from './solana.service.js';
import type { MarketOutcome } from '../types/txline.js';

const logger = getLogger();

// ─── Types ───────────────────────────────────────────────────────────────────

/** Minimal view of MarketService the keeper depends on. */
export interface KeeperMarketSource extends EventEmitter {
  getAllMarkets(status?: string): Array<{
    id: string;
    fixtureId: string;
    status: string;
    outcome: MarketOutcome | null;
    solanaMarketAddress: string | null;
  }>;
}

/** Minimal view of TxlineService the keeper depends on. */
export interface KeeperProofSource {
  fetchMerkleProof(matchId: string): Promise<{
    merkleRoot: string;
    proof: string[];
    leaf: string;
    /** On-chain account holding the proof, when TxLINE anchors it. */
    proofAccount?: string;
  } | null>;
}

export interface KeeperOptions {
  /** Sweep interval in ms (default: 60_000). */
  sweepIntervalMs?: number;
  /** Max settlement attempts per market before giving up (default: 10). */
  maxAttempts?: number;
}

export interface KeeperStatus {
  running: boolean;
  settled: number;
  failed: number;
  pending: number;
}

/** Outcome label → on-chain outcome index ([home, Draw, away]). */
export function outcomeToIndex(outcome: MarketOutcome): number {
  switch (outcome) {
    case 'home_win':
      return 0;
    case 'draw':
      return 1;
    case 'away_win':
      return 2;
    default:
      return -1;
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class KeeperService {
  private markets: KeeperMarketSource;
  private proofs: KeeperProofSource;
  private solana: SolanaService;
  private options: Required<KeeperOptions>;

  private timer: NodeJS.Timeout | null = null;
  private attempts: Map<string, number> = new Map();
  private settledOnchain: Set<string> = new Set();
  private stats = { settled: 0, failed: 0 };

  constructor(
    markets: KeeperMarketSource,
    proofs: KeeperProofSource,
    solana: SolanaService,
    options?: KeeperOptions,
  ) {
    this.markets = markets;
    this.proofs = proofs;
    this.solana = solana;
    this.options = {
      sweepIntervalMs: options?.sweepIntervalMs ?? 60_000,
      maxAttempts: options?.maxAttempts ?? 10,
    };

    // Event-driven path: settle on-chain as soon as the match result lands.
    this.markets.on('market:settled', (payload: { marketId: string }) => {
      void this.settleOne(payload.marketId).catch((error) =>
        logger.error({ error, marketId: payload.marketId }, 'Keeper event settlement failed'),
      );
    });
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.sweepOnce().catch((error) => logger.error({ error }, 'Keeper sweep failed'));
    }, this.options.sweepIntervalMs);
    this.timer.unref?.();
    logger.info(
      { sweepIntervalMs: this.options.sweepIntervalMs },
      'Keeper bot started — automatic on-chain settlement enabled',
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStatus(): KeeperStatus {
    return {
      running: this.timer !== null,
      settled: this.stats.settled,
      failed: this.stats.failed,
      pending: this.attempts.size,
    };
  }

  /**
   * One sweep: every DB-settled market with an on-chain address that we
   * have not yet settled on-chain gets a settlement attempt.
   */
  async sweepOnce(): Promise<number> {
    const settledMarkets = this.markets.getAllMarkets('settled');
    let submitted = 0;
    for (const market of settledMarkets) {
      if (await this.settleOne(market.id)) submitted++;
    }
    return submitted;
  }

  /** Attempt on-chain settlement for a single market. */
  async settleOne(marketId: string): Promise<boolean> {
    const market = this.markets
      .getAllMarkets()
      .find((m) => m.id === marketId);

    if (!market || market.status !== 'settled' || !market.outcome) return false;
    if (!market.solanaMarketAddress) return false; // off-chain-only market
    if (this.settledOnchain.has(marketId)) return false;

    const attempt = (this.attempts.get(marketId) ?? 0) + 1;
    if (attempt > this.options.maxAttempts) return false;
    this.attempts.set(marketId, attempt);

    const outcomeIndex = outcomeToIndex(market.outcome);
    if (outcomeIndex < 0) {
      logger.warn({ marketId, outcome: market.outcome }, 'Keeper: unmappable outcome');
      return false;
    }

    const proof = await this.proofs.fetchMerkleProof(market.fixtureId);
    if (!proof) {
      logger.warn({ marketId, fixtureId: market.fixtureId }, 'Keeper: proof not yet available');
      return false;
    }

    const result = await this.solana.settleMarket(
      market.solanaMarketAddress,
      outcomeIndex,
      { root: proof.merkleRoot, proof: proof.proof, leaf: proof.leaf },
      proof.proofAccount,
    );

    if (result) {
      this.settledOnchain.add(marketId);
      this.attempts.delete(marketId);
      this.stats.settled++;
      logger.info(
        { marketId, outcomeIndex, signature: result.signature },
        'Keeper: market settled on-chain',
      );
      return true;
    }

    this.stats.failed++;
    logger.warn({ marketId, attempt }, 'Keeper: on-chain settlement attempt failed');
    return false;
  }
}
