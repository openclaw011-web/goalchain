'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { solanaClient } from '@/lib/solana';
import { Market, Outcome } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';

interface BetFormProps {
  market: Market;
  onBetPlaced?: (signature: string) => void;
}

export default function BetForm({ market, onBetPlaced }: BetFormProps) {
  const { publicKey, connected } = useWallet();
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>('10');
  const [step, setStep] = useState<'select' | 'confirm' | 'signing' | 'success' | 'error'>('select');
  const [txSignature, setTxSignature] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const selected = market.outcomes.find(o => o.id === selectedOutcome);
  const potentialPayout = selected && parseFloat(amount) > 0
    ? (parseFloat(amount) * selected.odds).toFixed(2)
    : '0.00';

  const quickAmounts = [5, 10, 25, 50, 100];

  const handleSelectOutcome = (outcomeId: string) => {
    setSelectedOutcome(outcomeId);
    setStep('select');
  };

  const handlePlaceBet = async () => {
    if (!selectedOutcome || !amount || !connected || !publicKey) return;

    setStep('signing');
    setErrorMessage('');

    try {
      const result = await solanaClient.placeBet(
        useWallet(),
        market.id,
        selectedOutcome,
        parseFloat(amount),
      );

      if (result.success) {
        setTxSignature(result.signature);
        setStep('success');
        onBetPlaced?.(result.signature);
      } else {
        throw new Error('Transaction failed');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to place bet');
      setStep('error');
    }
  };

  const handleTryAgain = () => {
    setStep('select');
    setErrorMessage('');
  };

  if (!connected) {
    return (
      <div className="glass-card p-6 text-center">
        <div className="mb-4 text-4xl">🔌</div>
        <h3 className="text-lg font-semibold mb-2">Connect Your Wallet</h3>
        <p className="text-sm text-goalchain-text-muted mb-4">
          Connect your Solana wallet to place predictions on World Cup matches.
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-goalchain-text-muted">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <path d="M12 6v6l4 2" />
          </svg>
          Powered by Solana & TxLINE
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold mb-5">Place Your Prediction</h3>

      <AnimatePresence mode="wait">
        {step === 'select' && (
          <motion.div
            key="select"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {/* Outcome Selection */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-goalchain-text-muted mb-3">Select Outcome</label>
              <div className="grid grid-cols-3 gap-2">
                {market.outcomes.map((outcome) => {
                  const isSelected = selectedOutcome === outcome.id;
                  return (
                    <motion.button
                      key={outcome.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleSelectOutcome(outcome.id)}
                      className={`relative p-3 rounded-xl border text-center transition-all duration-200 ${
                        isSelected
                          ? 'border-goalchain-green bg-goalchain-green/10 shadow-lg shadow-goalchain-green/10'
                          : 'border-goalchain-border bg-goalchain-navy-light hover:border-goalchain-border-light'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-goalchain-green" />
                      )}
                      <div className="text-xs text-goalchain-text-muted mb-1">{outcome.label}</div>
                      <div className="text-lg font-bold font-mono text-white">{outcome.odds.toFixed(2)}</div>
                      <div className="text-xs text-goalchain-green">{(outcome.probability * 100).toFixed(0)}%</div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Amount Input */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-goalchain-text-muted mb-3">
                Amount <span className="text-xs">(SOL)</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0.01"
                  step="0.01"
                  className="input-field pr-16"
                  placeholder="Enter amount"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-goalchain-text-muted font-medium">
                  SOL
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                {quickAmounts.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAmount(a.toString())}
                    className={`px-3 py-1 text-xs rounded-lg border transition-all ${
                      parseFloat(amount) === a
                        ? 'border-goalchain-green text-goalchain-green bg-goalchain-green/10'
                        : 'border-goalchain-border text-goalchain-text-muted hover:border-goalchain-border-light'
                    }`}
                  >
                    ${a}
                  </button>
                ))}
              </div>
            </div>

            {/* Potential Payout Preview */}
            {selected && parseFloat(amount) > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-5 p-4 rounded-xl bg-goalchain-navy-light border border-goalchain-border"
              >
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-goalchain-text-muted">Stake</span>
                  <span className="font-mono font-medium">{parseFloat(amount).toFixed(2)} SOL</span>
                </div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-goalchain-text-muted">Odds</span>
                  <span className="font-mono font-medium">{selected.odds.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-goalchain-text-muted">Outcome</span>
                  <span className="font-medium">{selected.label}</span>
                </div>
                <div className="border-t border-goalchain-border pt-2 mt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">Potential Payout</span>
                  <span className="text-lg font-bold font-mono text-goalchain-green">
                    ${potentialPayout}
                  </span>
                </div>
              </motion.div>
            )}

            <button
              onClick={() => setStep('confirm')}
              disabled={!selectedOutcome || !amount || parseFloat(amount) <= 0}
              className="btn-primary w-full text-sm"
            >
              Review Prediction
            </button>
          </motion.div>
        )}

        {step === 'confirm' && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="p-4 rounded-xl bg-goalchain-navy-light border border-goalchain-border mb-5">
              <h4 className="text-sm font-semibold text-goalchain-text-muted uppercase tracking-wider mb-4">
                Transaction Summary
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-goalchain-text-muted">Match</span>
                  <span className="font-medium">{market.match.homeTeam.shortName} vs {market.match.awayTeam.shortName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-goalchain-text-muted">Market</span>
                  <span className="font-medium">Match Winner</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-goalchain-text-muted">Your Pick</span>
                  <span className="font-medium text-goalchain-green">{selected?.label}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-goalchain-text-muted">Amount</span>
                  <span className="font-mono font-medium">{amount} SOL</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-goalchain-text-muted">Odds</span>
                  <span className="font-mono font-medium">{selected?.odds.toFixed(2)}</span>
                </div>
                <div className="border-t border-goalchain-border pt-3 flex justify-between">
                  <span className="font-semibold">Payout if Win</span>
                  <span className="text-lg font-bold font-mono text-goalchain-green">${potentialPayout}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('select')} className="btn-secondary flex-1 text-sm">
                Back
              </button>
              <button onClick={handlePlaceBet} className="btn-primary flex-1 text-sm">
                Confirm & Sign
              </button>
            </div>
          </motion.div>
        )}

        {(step === 'signing') && (
          <motion.div
            key="signing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-8"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-goalchain-border border-t-goalchain-green"
            />
            <h3 className="text-lg font-semibold mb-2">Signing Transaction</h3>
            <p className="text-sm text-goalchain-text-muted">
              Please approve the transaction in your wallet...
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-goalchain-text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-goalchain-green animate-pulse" />
              Waiting for wallet confirmation
            </div>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-6"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="w-16 h-16 mx-auto mb-4 rounded-full bg-goalchain-green/20 flex items-center justify-center"
            >
              <svg className="w-8 h-8 text-goalchain-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </motion.div>
            <h3 className="text-lg font-semibold mb-2">Prediction Placed!</h3>
            <p className="text-sm text-goalchain-text-muted mb-4">
              Your prediction for {selected?.label} has been placed on-chain.
            </p>
            {txSignature && (
              <div className="p-3 rounded-lg bg-goalchain-navy-light border border-goalchain-border mb-4 text-left">
                <div className="text-xs text-goalchain-text-muted mb-1">Transaction Signature</div>
                <code className="text-xs font-mono text-goalchain-green break-all">{txSignature}</code>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStep('select');
                  setTxSignature('');
                }}
                className="btn-primary flex-1 text-sm"
              >
                Place Another
              </button>
            </div>
          </motion.div>
        )}

        {step === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-6"
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Transaction Failed</h3>
            <p className="text-sm text-goalchain-text-muted mb-4">{errorMessage}</p>
            <button onClick={handleTryAgain} className="btn-secondary text-sm">
              Try Again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
