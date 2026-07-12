/**
 * TxLINE txoracle proof-payload builder.
 *
 * `settle_market(winning_outcome, proof_data)` forwards `proof_data`
 * verbatim after the `validate_stat` discriminator, so the keeper is
 * responsible for producing the exact borsh serialization the real
 * txoracle program expects:
 *
 *   validate_stat(ts, fixture_summary, fixture_proof, main_tree_proof,
 *                 predicate, stat_a, stat_b, op)
 *
 * Rather than hand-rolling the layout, we encode with Anchor's own
 * BorshInstructionCoder against the txoracle IDL fetched from the chain
 * (`anchor idl fetch 6pW64...yP2J` → backend/idl/txoracle.json) and strip
 * the 8-byte discriminator — guaranteed byte-compatible with the deployed
 * program.
 *
 * NOTE on naming: the coder keys fields by their **exact IDL names**
 * (snake_case) and enum variants by their **exact IDL casing**
 * ({ GreaterThan: {} }, { Subtract: {} }). camelCase keys are silently
 * dropped and produce a garbage payload — the round-trip unit test
 * guards against this.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** First 8 bytes of sha256("global:validate_stat") — from the on-chain IDL. */
export const VALIDATE_STAT_DISCRIMINATOR = Buffer.from([
  107, 197, 232, 90, 191, 136, 105, 185,
]);

type BN = InstanceType<typeof import('@coral-xyz/anchor').BN>;

// ─── validate_stat argument types (exact IDL field names) ────────────────────

/** One Merkle-branch node. */
export interface ProofNode {
  hash: number[]; // 32 bytes
  is_right_sibling: boolean;
}

export interface ScoresUpdateStats {
  update_count: number; // i32
  min_timestamp: BN; // i64
  max_timestamp: BN; // i64
}

/** Per-fixture summary inside a 5-minute scores batch. */
export interface ScoresBatchSummary {
  fixture_id: BN; // i64 — the TxLINE FixtureId
  update_stats: ScoresUpdateStats;
  events_sub_tree_root: number[]; // 32 bytes
}

/** The provable key-value statistic — the inner Merkle leaf. */
export interface ScoreStat {
  key: number; // u32 stat key
  value: number; // i32
  period: number; // i32
}

export interface StatTerm {
  stat_to_prove: ScoreStat;
  event_stat_root: number[]; // 32 bytes
  stat_proof: ProofNode[];
}

/** { GreaterThan: {} } | { LessThan: {} } | { EqualTo: {} } — exact IDL casing. */
export type Comparison = object;

export interface TraderPredicate {
  threshold: number; // i32
  comparison: Comparison;
}

/** { Add: {} } | { Subtract: {} } — exact IDL casing. */
export type BinaryExpression = object;

export interface ValidateStatArgs {
  ts: BN; // i64 batch time slot (5-min aligned)
  fixture_summary: ScoresBatchSummary;
  fixture_proof: ProofNode[]; // fixture summary → batch root
  main_tree_proof: ProofNode[]; // batch root → on-chain daily root
  predicate: TraderPredicate;
  stat_a: StatTerm;
  stat_b: StatTerm | null;
  op: BinaryExpression | null;
}

// ─── Encoder ─────────────────────────────────────────────────────────────────

function loadTxoracleIdl(): unknown {
  const candidates = [
    path.join(process.cwd(), 'idl/txoracle.json'),
    path.join(__dirname, '../../idl/txoracle.json'),
    path.join(__dirname, '../../../scripts/idl/txoracle.json'),
  ];
  for (const candidate of candidates) {
    try {
      return JSON.parse(readFileSync(candidate, 'utf8'));
    } catch {
      // try next candidate
    }
  }
  throw new Error('txoracle IDL not found (expected idl/txoracle.json)');
}

/**
 * Borsh-serialize `validate_stat` args into the `proof_data` bytes that
 * `settle_market` forwards to the oracle (discriminator stripped — the
 * program prepends it on-chain).
 */
export async function buildValidateStatProofData(args: ValidateStatArgs): Promise<Buffer> {
  const anchorMod = await import('@coral-xyz/anchor');
  // jest's CJS interop puts exports on .default; plain node ESM has them named.
  const anchor = (anchorMod as { default?: typeof anchorMod }).default ?? anchorMod;
  const coder = new anchor.BorshInstructionCoder(
    loadTxoracleIdl() as import('@coral-xyz/anchor').Idl,
  );
  const encoded = coder.encode('validate_stat', args);
  if (!encoded.subarray(0, 8).equals(VALIDATE_STAT_DISCRIMINATOR)) {
    throw new Error('validate_stat discriminator mismatch — txoracle IDL out of date?');
  }
  return encoded.subarray(8);
}
