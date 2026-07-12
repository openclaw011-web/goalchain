#!/usr/bin/env node
/**
 * Real TxLINE Devnet subscription + API-token activation.
 *
 * Uses the txoracle IDL fetched from chain (scripts/idl/txoracle.json —
 * `anchor idl fetch 6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`).
 *
 * Flow:
 *   1. POST /auth/guest/start                    → guest JWT
 *   2. (if needed) request_devnet_faucet         → devnet USDT
 *   3. (if needed) purchase_subscription_token_usdt → TXL tokens
 *   4. subscribe(service_level_id, weeks)        → on-chain subscription tx
 *   5. POST /api/token/activate (signed message) → API token
 *   6. write credentials to backend/.env.txline
 *
 * Usage: node txline-subscribe.mjs [service_level_id] [weeks]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import anchorPkg from '@coral-xyz/anchor';
import web3 from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import nacl from 'tweetnacl';

const { AnchorProvider, BN, Program, Wallet } = anchorPkg;
const { Connection, Keypair, PublicKey } = web3;

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_ORIGIN = 'https://txline-dev.txodds.com';
const TXL_MINT = new PublicKey('4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG');
const SERVICE_LEVEL_ID = Number(process.argv[2] ?? 1); // 1 = free/basic tier
const WEEKS = Number(process.argv[3] ?? 4);
const LEAGUES = [];

const keypairPath = process.env.SOLANA_KEYPAIR || join(homedir(), '.config/solana/id.json');
const keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(keypairPath, 'utf8'))));
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
const provider = new AnchorProvider(connection, new Wallet(keypair), { commitment: 'confirmed' });
const idl = JSON.parse(readFileSync(join(__dirname, 'idl/txoracle.json'), 'utf8'));
const program = new Program(idl, provider);
const programId = program.programId;

const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds.map((s) => Buffer.from(s)), programId)[0];

async function main() {
  console.log(`Wallet:  ${keypair.publicKey.toBase58()}`);
  console.log(`Program: ${programId.toBase58()} (txoracle)`);

  // ── 1. Guest JWT ────────────────────────────────────────────────────
  const authRes = await fetch(`${API_ORIGIN}/auth/guest/start`, { method: 'POST' });
  if (!authRes.ok) throw new Error(`guest auth failed: ${authRes.status}`);
  const { token: jwt } = await authRes.json();
  console.log('JWT:     obtained ✓');

  // ── Derive accounts ────────────────────────────────────────────────
  const pricingMatrix = pda('pricing_matrix');
  const tokenTreasuryPda = pda('token_treasury_v2');
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    TXL_MINT, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const userTokenAccount = getAssociatedTokenAddressSync(
    TXL_MINT, keypair.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  // ── 2/3. Ensure TXL balance (faucet USDT → purchase TXL) ───────────
  const txlBalance = async () => {
    try {
      const bal = await connection.getTokenAccountBalance(userTokenAccount);
      return Number(bal.value.amount);
    } catch {
      return 0;
    }
  };

  // Ensure the TXL associated token account exists (required by subscribe
  // even when the tier costs 0 TXL).
  const ataInfo = await connection.getAccountInfo(userTokenAccount);
  if (!ataInfo) {
    console.log('Creating TXL token account (ATA)...');
    const ix = createAssociatedTokenAccountInstruction(
      keypair.publicKey, userTokenAccount, keypair.publicKey, TXL_MINT,
      TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const tx = new web3.Transaction().add(ix);
    const sig = await provider.sendAndConfirm(tx);
    console.log(`ATA:     created — ${sig}`);
  }

  let txl = await txlBalance();
  console.log(`TXL:     ${txl} (raw)`);

  if (txl < 1_000_000) {
    console.log('Requesting devnet USDT faucet + purchasing TXL...');
    const usdtMintAcc = idl.instructions.find((i) => i.name === 'request_devnet_faucet');
    // usdt mint address comes from the IDL account defaults if present;
    // otherwise derive the treasury and let Anchor resolve.
    try {
      const usdtTreasuryPda = pda('usdt_treasury');
      // The usdt mint is a program-known account — try resolving from chain:
      // the treasury PDA's token account mint. Fall back to letting Anchor
      // resolve via IDL defaults.
      const faucetTracker = PublicKey.findProgramAddressSync(
        [Buffer.from('faucet_tracker'), keypair.publicKey.toBuffer()],
        programId,
      )[0];
      const sig = await program.methods
        .requestDevnetFaucet()
        .accountsPartial({ user: keypair.publicKey, faucetTracker })
        .rpc();
      console.log(`Faucet:  ${sig}`);
    } catch (e) {
      console.log(`Faucet:  skipped/failed (${e.message?.slice(0, 120)})`);
    }

    try {
      const sig = await program.methods
        .purchaseSubscriptionTokenUsdt(new BN(1_000_000))
        .accountsPartial({ user: keypair.publicKey })
        .rpc();
      console.log(`TXL buy: ${sig}`);
    } catch (e) {
      console.log(`TXL buy: skipped/failed (${e.message?.slice(0, 120)})`);
    }
    txl = await txlBalance();
    console.log(`TXL:     ${txl} (raw)`);
  }

  // ── 4. Subscribe on-chain ──────────────────────────────────────────
  console.log(`Subscribing: service_level=${SERVICE_LEVEL_ID}, weeks=${WEEKS}...`);
  const txSig = await program.methods
    .subscribe(SERVICE_LEVEL_ID, WEEKS)
    .accountsPartial({
      user: keypair.publicKey,
      pricingMatrix,
      tokenMint: TXL_MINT,
      userTokenAccount,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log(`Sub tx:  ${txSig}`);
  console.log(`         https://explorer.solana.com/tx/${txSig}?cluster=devnet`);

  // ── 5. Activate API token ──────────────────────────────────────────
  const message = new TextEncoder().encode(`${txSig}:${LEAGUES.join(',')}:${jwt}`);
  const walletSignature = Buffer.from(nacl.sign.detached(message, keypair.secretKey)).toString('base64');

  const actRes = await fetch(`${API_ORIGIN}/api/token/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ txSig, walletSignature, leagues: LEAGUES }),
  });
  const actBody = await actRes.text();
  if (!actRes.ok) throw new Error(`activation failed: ${actRes.status} ${actBody.slice(0, 300)}`);
  let apiToken;
  try {
    const parsed = JSON.parse(actBody);
    apiToken = parsed.token ?? parsed.apiToken ?? parsed;
  } catch {
    apiToken = actBody;
  }
  console.log('API token: obtained ✓');

  // ── 6. Persist credentials (gitignored) ────────────────────────────
  const envContent = [
    `TXLINE_API_BASE=${API_ORIGIN}/api`,
    `TXLINE_JWT=${jwt}`,
    `TXLINE_API_TOKEN=${typeof apiToken === 'string' ? apiToken : JSON.stringify(apiToken)}`,
    `TXLINE_WALLET_PUBKEY=${keypair.publicKey.toBase58()}`,
    `TXLINE_SUBSCRIBE_TX_SIG=${txSig}`,
  ].join('\n');
  writeFileSync(join(__dirname, '../backend/.env.txline'), envContent + '\n');
  console.log('\n✅ Credentials written to backend/.env.txline — merge into backend/.env');
}

main().catch((err) => {
  console.error('❌', err.message ?? err);
  if (err.logs) console.error(err.logs.slice(-8).join('\n'));
  process.exit(1);
});
