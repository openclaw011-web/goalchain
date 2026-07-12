/**
 * Tests for the Keeper Bot — automatic on-chain settlement crank.
 *
 * Uses fake market/proof sources and a mock-mode SolanaService so no
 * network is involved.
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { KeeperService, outcomeToIndex } from '../services/keeper.service.js';
import { SolanaService } from '../services/solana.service.js';
import type { MarketOutcome } from '../types/txline.js';

interface FakeMarket {
  id: string;
  fixtureId: string;
  status: string;
  outcome: MarketOutcome | null;
  solanaMarketAddress: string | null;
}

class FakeMarketSource extends EventEmitter {
  markets: FakeMarket[] = [];
  getAllMarkets(status?: string): FakeMarket[] {
    return status ? this.markets.filter((m) => m.status === status) : this.markets;
  }
}

const proof = {
  merkleRoot: 'ab'.repeat(32),
  proof: ['cd'.repeat(32)],
  leaf: 'ef'.repeat(32),
};

function makeKeeper(overrides?: {
  proofResult?: typeof proof | null;
  markets?: FakeMarket[];
}) {
  const marketSource = new FakeMarketSource();
  marketSource.markets = overrides?.markets ?? [
    {
      id: 'mkt-1',
      fixtureId: 'fixture-1',
      status: 'settled',
      outcome: 'home_win',
      solanaMarketAddress: 'onchain-market-1',
    },
  ];

  const proofSource = {
    fetchMerkleProof: jest.fn(async () =>
      overrides && 'proofResult' in overrides ? overrides.proofResult ?? null : proof,
    ),
  };

  const solana = new SolanaService({ mockMode: true });
  solana.seedMockMarket('onchain-market-1', { locked: true });
  const settleSpy = jest.spyOn(solana, 'settleMarket');

  const keeper = new KeeperService(marketSource, proofSource, solana, {
    sweepIntervalMs: 100_000,
  });

  return { keeper, marketSource, proofSource, solana, settleSpy };
}

describe('outcomeToIndex', () => {
  it('maps outcomes to on-chain indices ([home, Draw, away])', () => {
    expect(outcomeToIndex('home_win')).toBe(0);
    expect(outcomeToIndex('draw')).toBe(1);
    expect(outcomeToIndex('away_win')).toBe(2);
  });
});

describe('KeeperService', () => {
  it('settles a DB-settled market on-chain during a sweep', async () => {
    const { keeper, settleSpy } = makeKeeper();

    const submitted = await keeper.sweepOnce();

    expect(submitted).toBe(1);
    expect(settleSpy).toHaveBeenCalledWith(
      'onchain-market-1',
      0, // home_win
      { root: proof.merkleRoot, proof: proof.proof, leaf: proof.leaf },
      undefined,
    );
    expect(keeper.getStatus().settled).toBe(1);
  });

  it('is idempotent — never settles the same market twice', async () => {
    const { keeper, settleSpy } = makeKeeper();

    await keeper.sweepOnce();
    await keeper.sweepOnce();

    expect(settleSpy).toHaveBeenCalledTimes(1);
  });

  it('skips markets without an on-chain address', async () => {
    const { keeper, settleSpy } = makeKeeper({
      markets: [
        {
          id: 'mkt-offchain',
          fixtureId: 'fixture-x',
          status: 'settled',
          outcome: 'draw',
          solanaMarketAddress: null,
        },
      ],
    });

    expect(await keeper.sweepOnce()).toBe(0);
    expect(settleSpy).not.toHaveBeenCalled();
  });

  it('skips markets that are not settled in the DB yet', async () => {
    const { keeper, settleSpy } = makeKeeper({
      markets: [
        {
          id: 'mkt-open',
          fixtureId: 'fixture-y',
          status: 'open',
          outcome: null,
          solanaMarketAddress: 'onchain-market-1',
        },
      ],
    });

    expect(await keeper.sweepOnce()).toBe(0);
    expect(settleSpy).not.toHaveBeenCalled();
  });

  it('retries when the proof is not yet available', async () => {
    const { keeper, proofSource, settleSpy } = makeKeeper({ proofResult: null });

    expect(await keeper.sweepOnce()).toBe(0);
    expect(settleSpy).not.toHaveBeenCalled();
    expect(proofSource.fetchMerkleProof).toHaveBeenCalledWith('fixture-1');
    // still pending — a later sweep retries
    expect(keeper.getStatus().pending).toBe(1);
  });

  it('settles immediately on the market:settled event', async () => {
    const { keeper, marketSource, settleSpy } = makeKeeper();

    marketSource.emit('market:settled', { marketId: 'mkt-1' });
    await new Promise((r) => setTimeout(r, 20)); // let the async handler run

    expect(settleSpy).toHaveBeenCalledTimes(1);
    expect(keeper.getStatus().settled).toBe(1);
  });

  it('gives up after maxAttempts failed attempts', async () => {
    const { marketSource, proofSource } = makeKeeper({ proofResult: null });
    const solana = new SolanaService({ mockMode: true });
    const keeper = new KeeperService(marketSource, proofSource, solana, {
      sweepIntervalMs: 100_000,
      maxAttempts: 2,
    });

    await keeper.sweepOnce();
    await keeper.sweepOnce();
    await keeper.sweepOnce(); // beyond maxAttempts — no fetch

    expect(proofSource.fetchMerkleProof).toHaveBeenCalledTimes(2);
  });

  it('start/stop toggles the running flag', () => {
    const { keeper } = makeKeeper();
    expect(keeper.getStatus().running).toBe(false);
    keeper.start();
    expect(keeper.getStatus().running).toBe(true);
    keeper.stop();
    expect(keeper.getStatus().running).toBe(false);
  });
});
