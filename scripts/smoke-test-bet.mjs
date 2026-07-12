// Smoke test: place a real 0.01 SOL bet on market 101 (Devnet)
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import anchorPkg from '@coral-xyz/anchor';
import web3 from '@solana/web3.js';

const { AnchorProvider, BN, Program, Wallet } = anchorPkg;
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } = web3;

const idl = JSON.parse(readFileSync('/home/camel/Documents/worldcup-predict/backend/idl/prediction_market.json', 'utf8'));
const kp = Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(join(homedir(), '.config/solana/id.json'), 'utf8'))));
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const provider = new AnchorProvider(connection, new Wallet(kp), { commitment: 'confirmed' });
const program = new Program(idl, provider);

const MARKET_ID = 101n;
const OUTCOME = 0; // ARG
const idBuf = Buffer.alloc(8); idBuf.writeBigUInt64LE(MARKET_ID);
const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), idBuf], program.programId);
const [betPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('bet'), marketPda.toBuffer(), kp.publicKey.toBuffer(), Buffer.from([OUTCOME])],
  program.programId,
);

const before = await connection.getBalance(marketPda);
const sig = await program.methods
  .placeBet(new BN(0.01 * LAMPORTS_PER_SOL), OUTCOME)
  .accountsPartial({ market: marketPda, bet: betPda, bettor: kp.publicKey })
  .rpc();
const after = await connection.getBalance(marketPda);
const market = await program.account.market.fetch(marketPda);
const bet = await program.account.bet.fetch(betPda);

console.log('tx:', sig);
console.log(`escrow: ${before / LAMPORTS_PER_SOL} -> ${after / LAMPORTS_PER_SOL} SOL`);
console.log('market.totalPool:', market.totalPool.toString(), 'outcomePools:', market.outcomePools.map(String));
console.log('bet:', { outcome: bet.outcomeIndex, amount: bet.amount.toString(), claimed: bet.claimed });
console.log(`explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
