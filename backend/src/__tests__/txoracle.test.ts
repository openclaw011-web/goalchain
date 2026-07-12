/**
 * Tests for the real txoracle validate_stat payload builder.
 *
 * settle_market forwards proof_data verbatim after the validate_stat
 * discriminator, so these bytes must be exactly the borsh serialization
 * the deployed txoracle program expects. We verify:
 *  - the discriminator matches both the on-chain IDL and the standard
 *    Anchor derivation the program computes at runtime
 *  - the builder's output round-trips through Anchor's own decoder
 *    (this catches the coder's silent-garbage failure mode when field
 *    names don't exactly match the IDL)
 *  - Option<T> args (stat_b, op) encode in both present/absent forms
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  buildValidateStatProofData,
  VALIDATE_STAT_DISCRIMINATOR,
  type ValidateStatArgs,
} from '../services/txoracle.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const anchorMod = await import('@coral-xyz/anchor');
// Under jest's CJS interop the exports live on .default; under plain node
// ESM they are named exports. Support both.
const anchor = (anchorMod as { default?: typeof anchorMod }).default ?? anchorMod;
const { BN, BorshInstructionCoder } = anchor;

const idl = JSON.parse(
  readFileSync(path.join(__dirname, '../../idl/txoracle.json'), 'utf8'),
);

function node(fill: number, isRight = false) {
  return { hash: Array(32).fill(fill), is_right_sibling: isRight };
}

function sampleArgs(overrides: Partial<ValidateStatArgs> = {}): ValidateStatArgs {
  return {
    ts: new BN(1783875300), // 5-min aligned batch slot
    fixture_summary: {
      fixture_id: new BN(18237038), // France–Spain TxLINE FixtureId
      update_stats: {
        update_count: 12,
        min_timestamp: new BN(1783875000),
        max_timestamp: new BN(1783875290),
      },
      events_sub_tree_root: Array(32).fill(1),
    },
    fixture_proof: [node(2), node(3, true)],
    main_tree_proof: [node(4)],
    predicate: { threshold: 1, comparison: { GreaterThan: {} } },
    stat_a: {
      stat_to_prove: { key: 5, value: 2, period: 90 },
      event_stat_root: Array(32).fill(6),
      stat_proof: [node(7, true)],
    },
    stat_b: null,
    op: null,
    ...overrides,
  };
}

describe('txoracle validate_stat payload builder', () => {
  it('discriminator matches the on-chain IDL and the Anchor derivation', () => {
    const fromIdl = idl.instructions.find(
      (ix: { name: string }) => ix.name === 'validate_stat',
    ).discriminator;
    expect([...VALIDATE_STAT_DISCRIMINATOR]).toEqual(fromIdl);

    // settle_market computes sha256("global:validate_stat")[..8] on-chain —
    // it must agree with what the deployed oracle declares.
    const derived = createHash('sha256').update('global:validate_stat').digest();
    expect(derived.subarray(0, 8).equals(VALIDATE_STAT_DISCRIMINATOR)).toBe(true);
  });

  it('produces bytes that Anchor’s own coder decodes back losslessly', async () => {
    const args = sampleArgs();
    const proofData = await buildValidateStatProofData(args);

    // proof_data must NOT include the discriminator (the program prepends it)
    expect(proofData.subarray(0, 8).equals(VALIDATE_STAT_DISCRIMINATOR)).toBe(false);

    const coder = new BorshInstructionCoder(idl);
    const decoded = coder.decode(
      Buffer.concat([VALIDATE_STAT_DISCRIMINATOR, proofData]),
    );
    expect(decoded).not.toBeNull();
    expect(decoded!.name).toBe('validate_stat');

    const data = decoded!.data as unknown as ValidateStatArgs;
    expect(data.ts.toString()).toBe(args.ts.toString());
    expect(data.fixture_summary.fixture_id.toString()).toBe('18237038');
    expect(data.fixture_summary.update_stats.update_count).toBe(12);
    expect(data.fixture_proof).toHaveLength(2);
    expect(data.fixture_proof[1].is_right_sibling).toBe(true);
    expect(data.predicate.threshold).toBe(1);
    expect(data.stat_a.stat_to_prove).toEqual({ key: 5, value: 2, period: 90 });
    expect(data.stat_b).toBeNull();
    expect(data.op).toBeNull();
  });

  it('encodes present Option args (stat_b, op) and stays within the on-chain size cap', async () => {
    const args = sampleArgs({
      stat_b: {
        stat_to_prove: { key: 6, value: 1, period: 90 },
        event_stat_root: Array(32).fill(8),
        stat_proof: [node(9)],
      },
      op: { Subtract: {} },
    });
    const proofData = await buildValidateStatProofData(args);

    const coder = new BorshInstructionCoder(idl);
    const decoded = coder.decode(
      Buffer.concat([VALIDATE_STAT_DISCRIMINATOR, proofData]),
    );
    const data = decoded!.data as unknown as ValidateStatArgs;
    expect(data.stat_b).not.toBeNull();
    expect(data.stat_b!.stat_to_prove.key).toBe(6);
    expect(data.op).toEqual({ Subtract: {} });

    // Realistic proof must fit settle_market's MAX_PROOF_DATA_LEN (1024).
    expect(proofData.length).toBeGreaterThan(0);
    expect(proofData.length).toBeLessThanOrEqual(1024);
  });

  it('does not round-trip camelCase keys — the coder needs exact IDL names', async () => {
    // The coder silently drops unknown keys, so wrong casing yields a
    // garbage payload (either undecodable or with zeroed fields). This
    // guards the exact-naming contract documented in txoracle.ts.
    const bad = sampleArgs() as unknown as Record<string, unknown>;
    bad.fixtureSummary = bad.fixture_summary; // wrong casing
    delete bad.fixture_summary;

    const proofData = await buildValidateStatProofData(bad as unknown as ValidateStatArgs);
    const coder = new BorshInstructionCoder(idl);
    let faithful = false;
    try {
      const decoded = coder.decode(
        Buffer.concat([VALIDATE_STAT_DISCRIMINATOR, proofData]),
      );
      const data = decoded?.data as unknown as ValidateStatArgs | undefined;
      faithful = data?.fixture_summary?.fixture_id?.toString() === '18237038';
    } catch {
      // undecodable garbage — also an unfaithful round-trip
    }
    expect(faithful).toBe(false);
  });
});
