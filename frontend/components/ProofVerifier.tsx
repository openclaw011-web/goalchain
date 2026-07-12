'use client';

import { useState } from 'react';
import { MerkleProof } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';

interface ProofVerifierProps {
  proof: MerkleProof;
}

function VerificationBadge({ verified }: { verified: boolean }) {
  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
      verified
        ? 'bg-goalchain-green/15 text-goalchain-green border border-goalchain-green/20'
        : 'bg-red-500/15 text-red-400 border border-red-500/20'
    }`}>
      {verified ? (
        <>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Verified
        </>
      ) : (
        <>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Not Verified
        </>
      )}
    </div>
  );
}

function HashDisplay({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-goalchain-text-muted uppercase tracking-wider">{label}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-goalchain-green hover:text-goalchain-green-dark transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div
        onClick={handleCopy}
        className="font-mono text-xs bg-goalchain-navy-light border border-goalchain-border rounded-lg p-3 break-all text-goalchain-text-muted hover:border-goalchain-border-light cursor-pointer transition-colors"
      >
        {value}
      </div>
    </div>
  );
}

export default function ProofVerifier({ proof }: ProofVerifierProps) {
  const [expanded, setExpanded] = useState(false);

  if (!proof) {
    return (
      <div className="glass-card p-6 text-center">
        <div className="text-4xl mb-4">🔍</div>
        <h3 className="text-lg font-semibold mb-2">No Proof Available</h3>
        <p className="text-sm text-goalchain-text-muted">
          This match hasn&apos;t been settled yet. Check back after the match is complete.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold mb-1">TxLINE Proof Verification</h3>
          <p className="text-sm text-goalchain-text-muted">
            Cryptographically verified match result via Merkle proof on Solana
          </p>
        </div>
        <VerificationBadge verified={proof.verified && proof.verifiedOnChain} />
      </div>

      {/* Result Card */}
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className="p-6 rounded-xl bg-goalchain-navy-light border border-goalchain-border mb-6 text-center"
      >
        <div className="text-xs text-goalchain-text-muted uppercase tracking-wider mb-2">Verified Result</div>
        <div className="text-2xl font-bold text-white mb-1">{proof.result}</div>
        <div className="text-sm text-goalchain-green">{proof.score}</div>
      </motion.div>

      {/* Verification Steps */}
      <div className="space-y-4 mb-6">
        <h4 className="text-sm font-semibold text-goalchain-text-muted uppercase tracking-wider">Verification Chain</h4>

        <div className="relative">
          {/* Step 1: Match Result -> Leaf Node */}
          <div className="flex items-start gap-4 mb-6">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-goalchain-green/20 flex items-center justify-center">
                <span className="text-xs font-bold text-goalchain-green">1</span>
              </div>
              <div className="w-0.5 h-8 bg-goalchain-border-light mt-1" />
            </div>
            <div className="flex-1 pt-1">
              <div className="text-sm font-medium text-white mb-1">Match Result</div>
              <div className="text-xs text-goalchain-text-muted">
                The on-chain oracle recorded the final score as <span className="text-goalchain-green font-medium">{proof.score}</span>
              </div>
            </div>
          </div>

          {/* Step 2: Merkle Proof */}
          <div className="flex items-start gap-4 mb-6">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-goalchain-green/20 flex items-center justify-center">
                <span className="text-xs font-bold text-goalchain-green">2</span>
              </div>
              <div className="w-0.5 h-8 bg-goalchain-border-light mt-1" />
            </div>
            <div className="flex-1 pt-1">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-sm font-medium text-white mb-1 hover:text-goalchain-green transition-colors"
              >
                Merkle Proof ({proof.proof.length} hashes)
                <svg className={`w-3.5 h-3.5 inline ml-1 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div className="text-xs text-goalchain-text-muted">
                {proof.proof.length} hash{proof.proof.length !== 1 ? 'es' : ''} linking the result to the Merkle root
              </div>

              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mt-3"
                  >
                    <div className="space-y-2 pl-2 border-l-2 border-goalchain-border">
                      {proof.proof.map((hash, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-goalchain-green/50" />
                          <code className="text-xs font-mono text-goalchain-text-muted break-all">{hash}</code>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Step 3: Merkle Root */}
          <div className="flex items-start gap-4 mb-6">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-goalchain-green/20 flex items-center justify-center">
                <span className="text-xs font-bold text-goalchain-green">3</span>
              </div>
              <div className="w-0.5 h-8 bg-goalchain-border-light mt-1" />
            </div>
            <div className="flex-1 pt-1">
              <div className="text-sm font-medium text-white mb-1">Merkle Root</div>
              <div className="text-xs text-goalchain-text-muted">
                Stored on-chain for the prediction market contract
              </div>
            </div>
          </div>

          {/* Step 4: On-Chain Verification */}
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                proof.verifiedOnChain ? 'bg-goalchain-green/20' : 'bg-yellow-500/20'
              }`}>
                {proof.verifiedOnChain ? (
                  <svg className="w-4 h-4 text-goalchain-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
              </div>
            </div>
            <div className="flex-1 pt-1">
              <div className="text-sm font-medium text-white mb-1">
                On-Chain Status: {proof.verifiedOnChain ? 'Verified ✓' : 'Pending'}
              </div>
              <div className="text-xs text-goalchain-text-muted">
                {proof.verifiedOnChain
                  ? 'The Solana smart contract has verified this proof against the stored Merkle root.'
                  : 'Awaiting on-chain verification...'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Raw Proof Data */}
      <div className="border-t border-goalchain-border pt-5 space-y-3">
        <h4 className="text-sm font-semibold text-goalchain-text-muted uppercase tracking-wider mb-3">Raw Proof Data</h4>
        <HashDisplay label="Merkle Root" value={proof.merkleRoot} />
        {proof.transactionSignature && (
          <HashDisplay label="Verification Transaction" value={proof.transactionSignature} />
        )}
      </div>
    </motion.div>
  );
}
