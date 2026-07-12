'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion } from 'framer-motion';
import { PublicKey } from '@solana/web3.js';
import { solanaClient, resolveMarketPda, deriveBetPda, OnchainMarket } from '@/lib/solana';
import { Market } from '@/lib/types';

interface ClaimPanelProps {
  market: Market;
}

interface ClaimableBet {
  outcomeIndex: number;
  amountSol: number;
  claimed: boolean;
  isWinner: boolean;
  payoutSol: number;
}

/**
 * Shown on settled (or on-chain-settled) markets: reads the connected
 * wallet's Bet PDAs, computes the proportional payout, and lets winners
 * claim straight from the market escrow.
 */
export default function ClaimPanel({ market }: ClaimPanelProps) {
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [onchain, setOnchain] = useState<OnchainMarket | null>(null);
  const [bets, setBets] = useState<ClaimableBet[]>([]);
  const [claiming, setClaiming] = useState<number | null>(null);
  const [txSignature, setTxSignature] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const marketPda = resolveMarketPda(market);
    if (!marketPda || !publicKey) return;

    const chainMarket = await solanaClient.getOnchainMarket(marketPda);
    setOnchain(chainMarket);
    if (!chainMarket) return;

    const connection = solanaClient.getConnection();
    const found: ClaimableBet[] = [];

    for (let i = 0; i < chainMarket.outcomes.length; i++) {
      const betPda = deriveBetPda(marketPda, publicKey as PublicKey, i);
      const info = await connection.getAccountInfo(betPda);
      if (!info) continue;

      // Bet layout: 8 disc + 32 market + 32 bettor + 1 outcome + 8 amount(u64 LE) + 1 claimed
      const data = info.data;
      const amount = Number(data.readBigUInt64LE(73));
      const claimed = data[81] === 1;
      const isWinner =
        chainMarket.status === 'settled' && chainMarket.winningOutcome === i;
      const winningPool =
        chainMarket.winningOutcome !== null
          ? chainMarket.outcomePools[chainMarket.winningOutcome]
          : 0;
      const payout =
        isWinner && winningPool > 0 ? (amount * chainMarket.totalPool) / winningPool : 0;

      found.push({
        outcomeIndex: i,
        amountSol: amount / 1e9,
        claimed,
        isWinner,
        payoutSol: payout / 1e9,
      });
    }
    setBets(found);
  }, [market, publicKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleClaim = async (outcomeIndex: number) => {
    const marketPda = resolveMarketPda(market);
    if (!marketPda) return;
    setClaiming(outcomeIndex);
    setError('');
    const result = await solanaClient.claimWinnings(wallet, marketPda, outcomeIndex);
    setClaiming(null);
    if (result.success) {
      setTxSignature(result.signature);
      void load();
    } else {
      setError(result.error || 'Claim failed');
    }
  };

  if (!connected || !resolveMarketPda(market)) return null;
  if (!onchain || bets.length === 0) return null;

  const settled = onchain.status === 'settled';

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold mb-4">Your On-Chain Bets</h3>

      <div className="space-y-3">
        {bets.map((bet) => (
          <div
            key={bet.outcomeIndex}
            className="flex items-center justify-between p-3 rounded-xl bg-goalchain-navy-light border border-goalchain-border"
          >
            <div>
              <div className="text-sm font-medium">
                {onchain.outcomes[bet.outcomeIndex]}
                {bet.isWinner && (
                  <span className="ml-2 text-xs text-goalchain-green">WINNER</span>
                )}
              </div>
              <div className="text-xs text-goalchain-text-muted font-mono">
                {bet.amountSol.toFixed(2)} SOL staked
                {bet.isWinner && ` → ${bet.payoutSol.toFixed(2)} SOL payout`}
              </div>
            </div>

            {bet.claimed ? (
              <span className="text-xs text-goalchain-text-muted">Claimed ✓</span>
            ) : bet.isWinner ? (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleClaim(bet.outcomeIndex)}
                disabled={claiming !== null}
                className="btn-primary text-xs px-4 py-2"
              >
                {claiming === bet.outcomeIndex ? 'Claiming…' : 'Claim Winnings'}
              </motion.button>
            ) : settled ? (
              <span className="text-xs text-goalchain-text-muted">Not a winning bet</span>
            ) : (
              <span className="text-xs text-goalchain-text-muted">Awaiting settlement</span>
            )}
          </div>
        ))}
      </div>

      {txSignature && (
        <a
          href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-xs text-goalchain-green hover:underline"
        >
          Claim transaction on Solana Explorer ↗
        </a>
      )}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}
