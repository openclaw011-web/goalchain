// Verify the PDA-payout fix on the DEPLOYED Devnet binary.
//
// claim_winnings/refund_bet move lamports out of the market PDA, which
// carries account data — a System transfer from it fails ("`from` must not
// carry data"), so the program debits/credits lamports directly. This
// script proves that code path works on-chain, end to end, without needing
// an oracle proof: create market → bet → cancel → refund_bet.
//
// Usage: node verify-payout-devnet.mjs
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import anchorPkg from '@coral-xyz/anchor';
import web3 from '@solana/web3.js';

const { AnchorProvider, BN, Program, Wallet } = anchorPkg;
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } = web3;

const __dirname = dirname(fileURLToPath(import.meta.url));
const idl = JSON.parse(readFileSync(join(__dirname, '../backend/idl/prediction_market.json'), 'utf8'));
const kp = Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(join(homedir(), '.config/solana/id.json'), 'utf8'))));
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
const provider = new AnchorProvider(connection, new Wallet(kp), { commitment: 'confirmed' });
const program = new Program(idl, provider);

const BET_LAMPORTS = 0.01 * LAMPORTS_PER_SOL;
const marketId = new BN(Date.now()); // throwaway, unique per run
const now = Math.floor(Date.now() / 1000);

const idBuf = marketId.toArrayLike(Buffer, 'le', 8);
const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), idBuf], program.programId);
const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], program.programId);
const [betPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('bet'), marketPda.toBuffer(), kp.publicKey.toBuffer(), Buffer.from([0])],
  program.programId,
);

console.log(`market_id ${marketId} → ${marketPda.toBase58()}`);

await program.methods
  .createMarket(marketId, `PAYOUT-VERIFY-${marketId}`, { matchWinner: {} }, ['A', 'B'], new BN(now + 3600), new BN(now + 7200))
  .accountsPartial({ market: marketPda, config: configPda, admin: kp.publicKey })
  .rpc();
console.log('1. market created');

await program.methods
  .placeBet(new BN(BET_LAMPORTS), 0)
  .accountsPartial({ market: marketPda, bet: betPda, bettor: kp.publicKey })
  .rpc();
console.log('2. bet placed: 0.01 SOL into PDA escrow');

await program.methods
  .cancelMarket()
  .accountsPartial({ market: marketPda, config: configPda, admin: kp.publicKey })
  .rpc();
console.log('3. market cancelled');

const escrowBefore = await connection.getBalance(marketPda);
const bettorBefore = await connection.getBalance(kp.publicKey);
const sig = await program.methods
  .refundBet()
  .accountsPartial({ market: marketPda, bet: betPda, bettor: kp.publicKey })
  .rpc();
const escrowAfter = await connection.getBalance(marketPda);
const bettorAfter = await connection.getBalance(kp.publicKey);

const escrowDelta = escrowBefore - escrowAfter;
if (escrowDelta !== BET_LAMPORTS) {
  throw new Error(`escrow debit mismatch: expected ${BET_LAMPORTS}, got ${escrowDelta}`);
}
console.log('4. refund_bet SUCCEEDED — lamports moved out of the data-carrying market PDA');
console.log(`   escrow:  ${escrowBefore / LAMPORTS_PER_SOL} -> ${escrowAfter / LAMPORTS_PER_SOL} SOL (-0.01 exactly)`);
console.log(`   bettor:  +${(bettorAfter - bettorBefore) / LAMPORTS_PER_SOL} SOL (refund minus tx fee)`);
console.log(`   tx: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
console.log('\n✅ PDA payout fix verified on the deployed Devnet binary.');
