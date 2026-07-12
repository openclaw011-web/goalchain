/**
 * subscribe-devnet.ts
 * 
 * One-time script to subscribe to TxLINE on Solana Devnet (free tier)
 * and activate an API token. Run once, save the output token to .env.
 * 
 * Usage: npx ts-node scripts/subscribe-devnet.ts
 * 
 * Requirements:
 *   - Solana CLI wallet at ~/.config/solana/devnet-goalchain.json (or ANCHOR_WALLET env)
 *   - Devnet SOL (run: solana airdrop 2 --url devnet)
 *   - Node.js 20+
 */

import * as anchor from '@coral-xyz/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Connection, PublicKey, SystemProgram, Keypair } from '@solana/web3.js';
import axios from 'axios';
import nacl from 'tweetnacl';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// CONFIG
// ============================================================
const NETWORK = 'devnet' as const;

const CONFIG = {
  devnet: {
    rpcUrl: 'https://api.devnet.solana.com',
    apiOrigin: 'https://txline-dev.txodds.com',
    programId: new PublicKey('6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J'),
    txlTokenMint: new PublicKey('4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG'),
  },
};

const { rpcUrl, apiOrigin, programId, txlTokenMint } = CONFIG[NETWORK];
const apiBaseUrl = `${apiOrigin}/api`;

// Free tier — no TxL payment required
const SERVICE_LEVEL_ID = 1;
const DURATION_WEEKS = 4;
const SELECTED_LEAGUES: number[] = [];

// ============================================================
// LOAD WALLET
// ============================================================
function loadWallet(): Keypair {
  const walletPath = process.env.ANCHOR_WALLET || 
    path.join(process.env.HOME!, '.config', 'solana', 'devnet-goalchain.json');
  
  if (!fs.existsSync(walletPath)) {
    console.error(`Wallet not found at ${walletPath}`);
    console.error('Generate with: solana-keygen new --outfile ~/.config/solana/devnet-goalchain.json');
    process.exit(1);
  }
  
  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('🚀 GoalChain — TxLINE Devnet Subscription Setup\n');

  const keypair = loadWallet();
  console.log(`Wallet: ${keypair.publicKey.toBase58()}`);

  const connection = new Connection(rpcUrl, 'confirmed');

  // Check balance
  const balance = await connection.getBalance(keypair.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL`);
  
  if (balance < 10_000_000) { // 0.01 SOL minimum
    console.error('❌ Insufficient SOL. Run: solana airdrop 2 --url devnet');
    process.exit(1);
  }

  // Set up Anchor provider
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);

  // Load IDL (you'll need to provide the actual TxLINE IDL)
  // For now we'll do a direct program method call
  
  // Derive PDAs
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('token_treasury_v2')],
    programId
  );

  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    txlTokenMint,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('pricing_matrix')],
    programId
  );

  const userTokenAccount = getAssociatedTokenAddressSync(
    txlTokenMint,
    keypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  console.log('\n📋 PDA Addresses:');
  console.log(`  Token Treasury: ${tokenTreasuryPda.toBase58()}`);
  console.log(`  Pricing Matrix: ${pricingMatrixPda.toBase58()}`);

  // Step 1: Get guest JWT
  console.log('\n1️⃣  Getting guest JWT...');
  const authResponse = await axios.post(`${apiOrigin}/auth/guest/start`);
  const jwt = authResponse.data.token;
  console.log('   ✅ JWT obtained');

  // Step 2: Subscribe on-chain
  console.log('\n2️⃣  Subscribing on-chain (free tier, Service Level 1)...');
  
  // Note: This requires the actual TxLINE IDL to be loaded
  // The IDL/types are available in the TxLINE runnable devnet examples
  // For this script, we construct the instruction manually
  
  // In production, load: import txoracleIdl from './idl/txoracle.json';
  // const program = new anchor.Program(txoracleIdl, provider);
  // const txSig = await program.methods.subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
  //   .accounts({ ... }).rpc();
  
  // PLACEHOLDER — replace with actual Anchor program call once IDL is available
  console.log('   ⚠️  Requires TxLINE IDL — get from runnable devnet examples in TxLINE docs');
  console.log('   See: https://txline.txodds.com/documentation/examples/runnable-devnet-examples');
  
  // For demo/testing, use a mock txSig
  const txSig = process.env.TXLINE_SUBSCRIBE_TX_SIG || 'MOCK_TX_SIG_REPLACE_WITH_REAL';

  // Step 3: Sign activation message
  console.log('\n3️⃣  Activating API token...');
  
  const messageString = `${txSig}:${SELECTED_LEAGUES.join(',')}:${jwt}`;
  const message = new TextEncoder().encode(messageString);
  const signatureBytes = nacl.sign.detached(message, keypair.secretKey);
  const walletSignature = Buffer.from(signatureBytes).toString('base64');

  // Step 4: Activate
  const activationResponse = await axios.post(
    `${apiBaseUrl}/token/activate`,
    { txSig, walletSignature, leagues: SELECTED_LEAGUES },
    { headers: { Authorization: `Bearer ${jwt}` } }
  );

  const apiToken = activationResponse.data.token || activationResponse.data;

  console.log('\n✅ SUCCESS! Save these credentials to your .env file:\n');
  console.log(`TXLINE_API_TOKEN=${apiToken}`);
  console.log(`TXLINE_JWT=${jwt}`);
  console.log(`TXLINE_API_URL=https://txline-dev.txodds.com`);
  console.log(`TXLINE_WALLET_PUBKEY=${keypair.publicKey.toBase58()}`);
  
  // Save to .env.txline for convenience
  const envContent = [
    `TXLINE_API_TOKEN=${apiToken}`,
    `TXLINE_JWT=${jwt}`,
    `TXLINE_API_URL=https://txline-dev.txodds.com`,
    `TXLINE_WALLET_PUBKEY=${keypair.publicKey.toBase58()}`,
    `TXLINE_NETWORK=devnet`,
    `TXLINE_PROGRAM_ID=6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`,
  ].join('\n');
  
  fs.writeFileSync(path.join(__dirname, '..', 'backend', '.env.txline'), envContent);
  console.log('\n💾 Credentials saved to backend/.env.txline');
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
