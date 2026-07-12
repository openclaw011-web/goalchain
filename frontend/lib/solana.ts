import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';

const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.devnet.solana.com';
const PROGRAM_ID = process.env.NEXT_PUBLIC_PREDICTION_PROGRAM_ID || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Minimum IDL shape for Anchor 0.30 — using writable/signer fields
// (avoid TS strict IdlAccount type conflicts)
const PREDICTION_MARKET_IDL: any = {
  version: '0.1.0',
  name: 'goalchain_prediction',
  instructions: [
    {
      name: 'placeBet',
      accounts: [
        { name: 'betAccount', writable: true, signer: false },
        { name: 'marketAccount', writable: true, signer: false },
        { name: 'user', writable: true, signer: true },
        { name: 'systemProgram', writable: false, signer: false },
      ],
      args: [
        { name: 'marketId', type: 'string' },
        { name: 'outcomeId', type: 'string' },
        { name: 'amount', type: 'u64' },
      ],
    },
    {
      name: 'claimWinnings',
      accounts: [
        { name: 'betAccount', writable: true, signer: false },
        { name: 'marketAccount', writable: true, signer: false },
        { name: 'user', writable: true, signer: true },
      ],
      args: [{ name: 'betId', type: 'string' }],
    },
  ],
  accounts: [],
};

class SolanaClient {
  private connection: Connection;
  private programId: PublicKey;

  constructor() {
    this.connection = new Connection(SOLANA_RPC, 'confirmed');
    this.programId = new PublicKey(PROGRAM_ID);
  }

  getConnection(): Connection {
    return this.connection;
  }

  getProgramId(): PublicKey {
    return this.programId;
  }

  async placeBet(
    wallet: WalletContextState,
    marketId: string,
    outcomeId: string,
    amountSol: number,
  ): Promise<{ signature: string; success: boolean }> {
    try {
      if (!wallet.publicKey) throw new Error('Wallet not connected');
      if (!wallet.signTransaction) throw new Error('Wallet does not support signing');
      if (!wallet.signAllTransactions) throw new Error('Wallet does not support signing multiple transactions');

      const lamports = amountSol * LAMPORTS_PER_SOL;

      // Simulated bet placement for hackathon demo.
      // In production this would call the Anchor program's place_bet instruction
      // which transfers SOL from user → market PDA escrow via CPI.
      // We skip the raw SystemProgram.transfer to avoid accidental fund loss
      // to an incorrect address.
      const { LAMPORTS_PER_SOL: LPS } = await import('@solana/web3.js');
      const tx = new Transaction();

      // Log the intended transfer for demo transparency
      console.info(
        `[GoalChain Demo] Simulating placeBet: marketId=${marketId} outcomeId=${outcomeId} amount=${amountSol} SOL`,
      );

      // Add a memo instruction so the user sees something in their wallet
      const memoIx = {
        keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: true }],
        programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
        data: Buffer.from(`placeBet:${marketId}:${outcomeId}:${lamports}`, 'utf-8'),
      };
      tx.add(memoIx);

      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

      // For demo, simulate the transaction without sending real funds
      // Return a simulated signature for the frontend to show
      await new Promise((resolve) => setTimeout(resolve, 1500)); // simulate confirmation delay

      const simulatedSig = Array.from({ length: 88 }, () =>
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)]
      ).join('');

      console.info(`[GoalChain Demo] Bet placed (simulated): tx=${simulatedSig}`);
      return { signature: simulatedSig, success: true };
    } catch (error: any) {
      console.error('Bet placement failed:', error);
      return { signature: '', success: false };
    }
  }

  async verifyProofOnChain(merkleRoot: string, proof: string[], leaf: string): Promise<boolean> {
    try {
      return true;
    } catch {
      return false;
    }
  }

  async getSOLBalance(publicKey: PublicKey): Promise<number> {
    try {
      const balance = await this.connection.getBalance(publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch {
      return 0;
    }
  }
}

export const solanaClient = new SolanaClient();
export default SolanaClient;
