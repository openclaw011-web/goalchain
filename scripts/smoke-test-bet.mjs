// Smoke test: place a real 0.01 SOL bet on a Devnet market.
//
// Usage:
//   node smoke-test-bet.mjs                     # demo market 101, outcome 0
//   node smoke-test-bet.mjs <marketId|address> [outcomeIndex] [amountSol]
//   e.g. node smoke-test-bet.mjs CqFHm4vQ... 0 0.01   (live TxLINE market)
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

const marketArg = process.argv[2] ?? '101';
const OUTCOME = Number(process.argv[3] ?? 0);
const AMOUNT_SOL = Number(process.argv[4] ?? 0.01);

let marketPda;
if (/^\d+$/.test(marketArg)) {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(marketArg));
  marketPda = PublicKey.findProgramAddressSync([Buffer.from('market'), idBuf], program.programId)[0];
} else {
  marketPda = new PublicKey(marketArg);
}
const [betPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('bet'), marketPda.toBuffer(), kp.publicKey.toBuffer(), Buffer.from([OUTCOME])],
  program.programId,
);

const before = await connection.getBalance(marketPda);
const sig = await program.methods
  .placeBet(new BN(Math.round(AMOUNT_SOL * LAMPORTS_PER_SOL)), OUTCOME)
  .accountsPartial({ market: marketPda, bet: betPda, bettor: kp.publicKey })
  .rpc();
const after = await connection.getBalance(marketPda);
const market = await program.account.market.fetch(marketPda);
const bet = await program.account.bet.fetch(betPda);

console.log('tx:', sig);
console.log('market:', market.matchId, '| outcomes:', market.outcomes.join('/'));
console.log(`escrow: ${before / LAMPORTS_PER_SOL} -> ${after / LAMPORTS_PER_SOL} SOL`);
console.log('market.totalPool:', market.totalPool.toString(), 'outcomePools:', market.outcomePools.map(String));
console.log('bet:', { outcome: bet.outcomeIndex, amount: bet.amount.toString(), claimed: bet.claimed });
console.log(`explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
