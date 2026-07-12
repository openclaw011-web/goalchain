#!/usr/bin/env node
/**
 * Sync live TxLINE markets on-chain.
 *
 * For every open market the backend auto-created from real TxLINE World Cup
 * fixtures (backend/data/worldcup.db) that has no on-chain account yet:
 *   1. create_market on the prediction-market program
 *      (market_id = the numeric TxLINE FixtureId, lock = kickoff,
 *       resolve = kickoff + 3h, outcomes = [home, Draw, away])
 *   2. write the market PDA back to markets.solana_market_addr
 *
 * The frontend then resolves these markets via Market.onchainAddress and
 * real betting lights up for live fixtures. Idempotent.
 *
 * Usage: node sync-live-markets.mjs
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import anchorPkg from '@coral-xyz/anchor';
import web3 from '@solana/web3.js';

const { AnchorProvider, BN, Program, Wallet } = anchorPkg;
const { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY } = web3;

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRequire = createRequire(join(__dirname, '../backend/package.json'));
const Database = backendRequire('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || join(__dirname, '../backend/data/worldcup.db');
const IDL_PATH = join(__dirname, '../contracts/prediction-market/target/idl/prediction_market.json');
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR || join(homedir(), '.config/solana/id.json');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

function marketPda(programId, marketId) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(marketId));
  return PublicKey.findProgramAddressSync([Buffer.from('market'), buf], programId)[0];
}

async function main() {
  const db = new Database(DB_PATH);
  const rows = db
    .prepare(
      `SELECT id, fixture_id, home_team, away_team, kickoff_time, status, solana_market_addr
       FROM markets WHERE status = 'open'`,
    )
    .all();
  console.log(`Open markets in DB: ${rows.length}`);
  if (rows.length === 0) return;

  const idl = JSON.parse(readFileSync(IDL_PATH, 'utf8'));
  const admin = Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(KEYPAIR_PATH, 'utf8'))));
  const connection = new Connection(RPC_URL, 'confirmed');
  const provider = new AnchorProvider(connection, new Wallet(admin), { commitment: 'confirmed' });
  const program = new Program(idl, provider);
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], program.programId);

  const update = db.prepare('UPDATE markets SET solana_market_addr = ? WHERE id = ?');
  const now = Math.floor(Date.now() / 1000);

  for (const row of rows) {
    const fixtureId = Number(row.fixture_id);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      console.log(`- ${row.home_team} vs ${row.away_team}: non-numeric fixture id (${row.fixture_id}), skipped`);
      continue;
    }

    const pda = marketPda(program.programId, fixtureId);

    if (row.solana_market_addr === pda.toBase58()) {
      console.log(`- ${row.home_team} vs ${row.away_team}: already linked (${pda.toBase58()})`);
      continue;
    }

    const existing = await program.account.market.fetchNullable(pda);
    if (existing) {
      update.run(pda.toBase58(), row.id);
      console.log(`- ${row.home_team} vs ${row.away_team}: on-chain already, linked ${pda.toBase58()}`);
      continue;
    }

    const lockTime = Math.floor(new Date(row.kickoff_time).getTime() / 1000);
    if (lockTime <= now + 60) {
      console.log(`- ${row.home_team} vs ${row.away_team}: kickoff too soon/past, skipped`);
      continue;
    }

    const sig = await program.methods
      .createMarket(
        new BN(fixtureId),
        `TXLINE-${fixtureId}`,
        { matchWinner: {} },
        [row.home_team, 'Draw', row.away_team],
        new BN(lockTime),
        new BN(lockTime + 3 * 3600),
      )
      .accountsPartial({
        market: pda,
        config: configPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
        clock: SYSVAR_CLOCK_PUBKEY,
      })
      .rpc();

    update.run(pda.toBase58(), row.id);
    console.log(`- ${row.home_team} vs ${row.away_team}: CREATED ${pda.toBase58()}`);
    console.log(`    tx ${sig}`);
  }

  db.close();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('❌', err.message ?? err);
  process.exit(1);
});
