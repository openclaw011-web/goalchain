#!/usr/bin/env node
/**
 * Bootstrap GoalChain demo markets on Solana Devnet.
 *
 * Idempotent: run it any number of times — it initialises the program
 * config (once) and creates any demo market that does not exist yet.
 *
 * The market ids/teams mirror frontend/lib/mock-data.ts so the UI's
 * `onchainMarketId` fields resolve to real on-chain accounts.
 *
 * Usage:
 *   node scripts/bootstrap-devnet-markets.mjs
 *
 * Requirements:
 *   - ~/.config/solana/id.json is the program admin (deploy authority)
 *   - `npm install` has been run in scripts/
 *   - anchor build artefacts exist (contracts/prediction-market/target/idl)
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import anchorPkg from '@coral-xyz/anchor';
import web3 from '@solana/web3.js';

const { AnchorProvider, BN, Program, Wallet } = anchorPkg;
const { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY, LAMPORTS_PER_SOL } = web3;

const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR || join(homedir(), '.config/solana/id.json');
const IDL_PATH = join(__dirname, '../contracts/prediction-market/target/idl/prediction_market.json');

const FEE_BPS = 100; // 1% protocol fee

// Demo markets — ids/teams mirror frontend/lib/mock-data.ts (matches 1-5, 10).
// lockHours = hours from now until betting locks; resolve = lock + 3h.
const DEMO_MARKETS = [
  { id: 101, matchId: 'FIFA-WC-2026-match-1', outcomes: ['ARG', 'Draw', 'BRA'], lockHours: 72 },
  { id: 102, matchId: 'FIFA-WC-2026-match-2', outcomes: ['FRA', 'Draw', 'ENG'], lockHours: 96 },
  { id: 103, matchId: 'FIFA-WC-2026-match-3', outcomes: ['ESP', 'Draw', 'GER'], lockHours: 48 },
  { id: 104, matchId: 'FIFA-WC-2026-match-4', outcomes: ['ITA', 'Draw', 'NED'], lockHours: 120 },
  { id: 105, matchId: 'FIFA-WC-2026-match-5', outcomes: ['POR', 'Draw', 'BEL'], lockHours: 36 },
  { id: 110, matchId: 'FIFA-WC-2026-match-10', outcomes: ['COL', 'Draw', 'MAR'], lockHours: 24 },
];

function loadKeypair(path) {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(path, 'utf8'))));
}

function marketPda(programId, marketId) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(marketId));
  return PublicKey.findProgramAddressSync([Buffer.from('market'), buf], programId)[0];
}

async function main() {
  const idl = JSON.parse(readFileSync(IDL_PATH, 'utf8'));
  const admin = loadKeypair(KEYPAIR_PATH);
  const connection = new Connection(RPC_URL, 'confirmed');
  const provider = new AnchorProvider(connection, new Wallet(admin), { commitment: 'confirmed' });
  const program = new Program(idl, provider);
  const programId = program.programId;

  console.log(`Program:  ${programId.toBase58()}`);
  console.log(`Admin:    ${admin.publicKey.toBase58()}`);
  console.log(`Balance:  ${(await connection.getBalance(admin.publicKey)) / LAMPORTS_PER_SOL} SOL`);

  // ── 1. Config singleton ────────────────────────────────────────────
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
  const existingConfig = await program.account.marketConfig.fetchNullable(configPda);
  if (existingConfig) {
    console.log(`Config:   exists (admin=${existingConfig.admin.toBase58()}, fee=${existingConfig.feeBps} bps)`);
    if (!existingConfig.admin.equals(admin.publicKey)) {
      throw new Error('Config admin differs from local keypair — markets cannot be created.');
    }
  } else {
    const sig = await program.methods
      .initializeConfig(FEE_BPS)
      .accounts({ config: configPda, admin: admin.publicKey })
      .rpc();
    console.log(`Config:   initialized (fee=${FEE_BPS} bps) — ${sig}`);
  }

  // ── 2. Demo markets ────────────────────────────────────────────────
  const now = Math.floor(Date.now() / 1000);
  for (const m of DEMO_MARKETS) {
    const pda = marketPda(programId, m.id);
    const existing = await program.account.market.fetchNullable(pda);
    if (existing) {
      const status = Object.keys(existing.status)[0];
      console.log(`Market ${m.id}: exists (${m.matchId}, status=${status}) — ${pda.toBase58()}`);
      continue;
    }

    const lockTime = new BN(now + m.lockHours * 3600);
    const resolveTime = new BN(now + (m.lockHours + 3) * 3600);
    const sig = await program.methods
      .createMarket(new BN(m.id), m.matchId, { matchWinner: {} }, m.outcomes, lockTime, resolveTime)
      .accounts({
        market: pda,
        config: configPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
        clock: SYSVAR_CLOCK_PUBKEY,
      })
      .rpc();
    console.log(`Market ${m.id}: CREATED (${m.matchId}, outcomes=${m.outcomes.join('/')}) — ${sig}`);
    console.log(`           PDA ${pda.toBase58()}`);
  }

  console.log('\nDone. Explorer:');
  console.log(`  https://explorer.solana.com/address/${programId.toBase58()}?cluster=devnet`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
