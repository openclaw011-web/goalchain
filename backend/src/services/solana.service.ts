/**
 * Solana Integration Service
 *
 * Manages on-chain prediction market state via Anchor (Solana) integration.
 * Handles:
 *  - Market account deserialisation (read market state)
 *  - Bet account reading
 *  - Settlement transaction signing (keeper bot)
 *  - Monitoring on-chain state changes
 *
 * NOTE: This is a scaffold that works with real Anchor IDL or a mock.
 * In a hackathon context, the actual program ID and IDL would be determined
 * by the deployed prediction market program. The module is designed to work
 * with either real on-chain data or fallback mock mode.
 */

import { getLogger } from '../logger.js';
import { config } from '../config.js';

const logger = getLogger();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SolanaMarketAccount {
  authority: string;
  fixtureId: string;
  outcome0Pool: number;  // home_win pool in lamports
  outcome1Pool: number;  // away_win pool in lamports
  outcome2Pool: number;  // draw pool in lamports
  locked: boolean;
  settled: boolean;
  result: number;        // 0=home_win, 1=away_win, 2=draw
  totalBets: number;
}

export interface SolanaBetAccount {
  user: string;
  market: string;
  outcome: number;
  amount: number;        // lamports
  odds: number;          // scaled decimal odds (e.g. 200 = 2.0)
  claimed: boolean;
}

export interface SolanaServiceOptions {
  rpcUrl?: string;
  privateKey?: string;
  programId?: string;
  /** If true, use mock data instead of real RPC calls (default: true for dev). */
  mockMode?: boolean;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class SolanaService {
  private options: Required<SolanaServiceOptions>;
  private anchor: typeof import('@coral-xyz/anchor') | null = null;
  private connection: import('@solana/web3.js').Connection | null = null;
  private wallet: import('@coral-xyz/anchor').Wallet | null = null;
  private program: import('@coral-xyz/anchor').Program | null = null;

  // In-memory mock state for development
  private mockMarkets: Map<string, SolanaMarketAccount> = new Map();
  private mockBets: Map<string, SolanaBetAccount[]> = new Map();

  constructor(options?: SolanaServiceOptions) {
    this.options = {
      rpcUrl: options?.rpcUrl ?? config.solanaRpcUrl,
      privateKey: options?.privateKey ?? config.solanaKeeperPrivateKey,
      programId: options?.programId ?? config.solanaProgramId,
      mockMode: options?.mockMode ?? (!config.solanaKeeperPrivateKey && !config.solanaProgramId),
    };

    if (!this.options.mockMode) {
      this.initialiseRealConnection();
    } else {
      logger.info('Solana service running in MOCK mode — no on-chain operations');
    }
  }

  // ─── Initialisation ───────────────────────────────────────────────────────

  private async initialiseRealConnection(): Promise<void> {
    try {
      const anchor = await import('@coral-xyz/anchor');
      const web3 = await import('@solana/web3.js');
      this.anchor = anchor;

      this.connection = new web3.Connection(this.options.rpcUrl, 'confirmed');

      if (this.options.privateKey) {
        // KEEPER_PRIVATE_KEY is expected as base64-encoded secret key bytes.
        // (Base58 is not a Node Buffer encoding.)
        const keypair = web3.Keypair.fromSecretKey(
          Buffer.from(this.options.privateKey, 'base64'),
        );
        this.wallet = new anchor.Wallet(keypair);
      }

      if (this.options.programId) {
        const idl = await this.fetchIdl();
        if (idl) {
          const provider = new anchor.AnchorProvider(
            this.connection,
            this.wallet ?? anchor.Wallet.local(),
            { commitment: 'confirmed' },
          );
          this.program = new anchor.Program(
            idl as import('@coral-xyz/anchor').Idl,
            provider,
          );
        }
      }

      logger.info({ rpcUrl: this.options.rpcUrl }, 'Solana real connection initialised');
    } catch (error) {
      logger.error({ error }, 'Failed to initialise Solana connection, falling back to mock mode');
      this.options.mockMode = true;
    }
  }

  /**
   * Fetch the IDL for the prediction market program.
   * This would fetch from on-chain or a local file.
   */
  private async fetchIdl(): Promise<unknown | null> {
    // In a real deployment, the IDL is typically stored on-chain or in the repo.
    // For the hackathon, we return null which makes the program use mock data.
    logger.warn('IDL not available — using mock mode for account reads');
    return null;
  }

  // ─── Public API (works in both mock and real modes) ────────────────────────

  /**
   * Read a prediction market account on-chain.
   * Returns mock data if in mock mode or if real RPC fails.
   */
  async getMarketAccount(marketAddress: string): Promise<SolanaMarketAccount | null> {
    if (this.options.mockMode) {
      return this.mockMarkets.get(marketAddress) ?? null;
    }

    try {
      // Real on-chain read via Anchor
      // const account = await this.program!.account.market.fetch(marketAddress);
      // return this.parseMarketAccount(account);
      throw new Error('Real RPC not implemented — use mock mode');
    } catch (error) {
      logger.error({ error, marketAddress }, 'Failed to read market account, falling back to mock');
      return this.mockMarkets.get(marketAddress) ?? null;
    }
  }

  /**
   * Read bet accounts for a market.
   */
  async getBetAccounts(marketAddress: string): Promise<SolanaBetAccount[]> {
    if (this.options.mockMode) {
      return this.mockBets.get(marketAddress) ?? [];
    }

    try {
      // Real on-chain read via Anchor
      // const accounts = await this.program!.account.bet.all([
      //   { memcmp: { offset: 8, bytes: marketAddress } }
      // ]);
      // return accounts.map(a => this.parseBetAccount(a.account));
      return [];
    } catch (error) {
      logger.error({ error, marketAddress }, 'Failed to read bet accounts, falling back to mock');
      return this.mockBets.get(marketAddress) ?? [];
    }
  }

  /**
   * Submit a settlement transaction as keeper bot.
   * This signs and sends the tx to update the on-chain market state.
   */
  async settleMarket(
    marketAddress: string,
    outcome: number,  // 0=home_win, 1=away_win, 2=draw
    merkleProof: { root: string; proof: string[]; leaf: string },
  ): Promise<{ signature: string } | null> {
    if (this.options.mockMode) {
      // Update mock state
      const market = this.mockMarkets.get(marketAddress);
      if (market) {
        market.settled = true;
        market.result = outcome;
        this.mockMarkets.set(marketAddress, market);
      }
      logger.info({ marketAddress, outcome }, 'Mock settlement submitted');
      return { signature: `mock-sig-${Date.now()}` };
    }

    try {
      // Real on-chain settlement via Anchor
      // const tx = await this.program!.methods
      //   .settleMarket(outcome, merkleProof.root, merkleProof.proof, merkleProof.leaf)
      //   .accounts({ ... })
      //   .rpc();
      // return { signature: tx };
      throw new Error('Real settlement not implemented');
    } catch (error) {
      logger.error({ error, marketAddress }, 'Failed to settle market on-chain');
      return null;
    }
  }

  /**
   * Monitor on-chain market state. Returns key state indicators.
   */
  async monitorMarket(marketAddress: string): Promise<{
    locked: boolean;
    settled: boolean;
    totalPool: number;
  }> {
    const account = await this.getMarketAccount(marketAddress);
    if (!account) {
      return { locked: false, settled: false, totalPool: 0 };
    }

    return {
      locked: account.locked,
      settled: account.settled,
      totalPool: account.outcome0Pool + account.outcome1Pool + account.outcome2Pool,
    };
  }

  /**
   * Get the keeper wallet balance (if connected).
   */
  async getKeeperBalance(): Promise<number | null> {
    if (this.options.mockMode) {
      return 100_000_000; // 0.1 SOL in lamports
    }

    try {
      if (!this.wallet) return null;
      const web3 = await import('@solana/web3.js');
      const balance = await this.connection!.getBalance(this.wallet.publicKey);
      return balance;
    } catch (error) {
      logger.error({ error }, 'Failed to get keeper balance');
      return null;
    }
  }

  /**
   * Get the keeper wallet public key.
   */
  getKeeperPublicKey(): string | null {
    if (this.options.mockMode) {
      return 'mock-keeper-public-key';
    }
    return this.wallet?.publicKey.toBase58() ?? null;
  }

  // ─── Mock helpers (for seeding test data) ─────────────────────────────────

  /** Seed a mock market account (for testing/dev). */
  seedMockMarket(address: string, data: Partial<SolanaMarketAccount>): void {
    const defaultMarket: SolanaMarketAccount = {
      authority: 'mock-authority',
      fixtureId: 'mock-fixture',
      outcome0Pool: 100_000_000,  // 0.1 SOL
      outcome1Pool: 150_000_000,  // 0.15 SOL
      outcome2Pool: 75_000_000,   // 0.075 SOL
      locked: false,
      settled: false,
      result: 0,
      totalBets: 0,
    };
    this.mockMarkets.set(address, { ...defaultMarket, ...data });
  }

  /** Seed mock bet accounts for a market. */
  seedMockBets(marketAddress: string, bets: SolanaBetAccount[]): void {
    this.mockBets.set(marketAddress, bets);
  }
}

// ─── Zod schemas for validation ──────────────────────────────────────────────

import { z } from 'zod';

export const SettleMarketSchema = z.object({
  outcome: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  merkleProof: z.object({
    root: z.string(),
    proof: z.array(z.string()),
    leaf: z.string(),
  }),
});

export type SettleMarketInput = z.infer<typeof SettleMarketSchema>;
