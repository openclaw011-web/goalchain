'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { solanaClient } from '@/lib/solana';
import { motion } from 'framer-motion';

export default function WalletButton() {
  const { publicKey, connected, connecting, disconnect, select } = useWallet();
  const { setVisible } = useWalletModal();
  const [balance, setBalance] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (publicKey && connected) {
      solanaClient.getSOLBalance(publicKey).then(setBalance).catch(() => setBalance(null));
    } else {
      setBalance(null);
    }
  }, [publicKey, connected]);

  const handleCopy = async () => {
    if (publicKey) {
      await navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shortAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : '';

  if (!connected) {
    return (
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setVisible(true)}
        disabled={connecting}
        className="btn-primary flex items-center gap-2 text-sm"
      >
        {connecting ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Connecting...
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <circle cx="12" cy="12" r="2" />
            </svg>
            Connect Wallet
          </>
        )}
      </motion.button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-3"
      >
        {balance !== null && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-goalchain-surface border border-goalchain-border text-sm">
            <span className="text-goalchain-green font-mono font-medium">{balance.toFixed(2)}</span>
            <span className="text-goalchain-text-muted text-xs">SOL</span>
          </div>
        )}

        <motion.button
          whileHover={{ scale: 1.02 }}
          onClick={handleCopy}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-goalchain-surface border border-goalchain-border hover:border-goalchain-border-light transition-all duration-200 cursor-pointer"
          title={publicKey?.toBase58()}
        >
          <div className="w-2 h-2 rounded-full bg-goalchain-green animate-pulse-slow" />
          <span className="text-sm font-mono text-white">{shortAddress}</span>
          {copied ? (
            <svg className="w-3.5 h-3.5 text-goalchain-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-goalchain-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          )}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={disconnect}
          className="p-2 rounded-lg text-goalchain-text-muted hover:text-red-400 hover:bg-goalchain-surface-light transition-all duration-200"
          title="Disconnect"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </motion.button>
      </motion.div>
    </div>
  );
}
