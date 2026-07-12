'use client';

import { use } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Navbar from '@/components/Navbar';
import LiveTicker from '@/components/LiveTicker';
import ProofVerifier from '@/components/ProofVerifier';
import ErrorBoundary from '@/components/ErrorBoundary';
import { merkleProofs, getMatchById, getMarketByMatchId } from '@/lib/mock-data';
import { apiClient } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

export default function VerifyPage({ params }: { params: Promise<{ matchId: string }> }) {
  const resolvedParams = use(params);
  const matchId = resolvedParams.matchId.toLowerCase();

  const match = getMatchById(matchId);
  const market = getMarketByMatchId(matchId);

  const { data: proof, isLoading } = useQuery({
    queryKey: ['proof', matchId],
    queryFn: () => apiClient.getMerkleProof(matchId),
    initialData: merkleProofs[matchId],
  });

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-goalchain-navy">
        <Navbar />
        <LiveTicker />

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Breadcrumb */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Link
              href="/markets"
              className="text-sm text-goalchain-text-muted hover:text-white transition-colors inline-flex items-center gap-1"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back to Markets
            </Link>
          </motion.div>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-white">
                Proof Verification
              </h1>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/20">
                <svg className="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span className="text-xs font-medium text-blue-400">TxLINE</span>
              </div>
            </div>
            {match && (
              <p className="text-goalchain-text-muted text-sm">
                Verifying the result for {match.homeTeam.name} vs {match.awayTeam.name}
              </p>
            )}
          </motion.div>

          {/* Match Info Card */}
          {match && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card p-5 mb-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{match.homeTeam.flag}</span>
                  <div>
                    <div className="text-base font-semibold text-white">{match.homeTeam.name}</div>
                    <div className="text-xs text-goalchain-text-muted">{match.homeTeam.shortName}</div>
                  </div>
                </div>

                <div className="text-center px-6">
                  <div className="text-xs text-goalchain-text-muted uppercase tracking-wider mb-1">
                    {match.status === 'finished' ? 'Full Time' : match.status}
                  </div>
                  <div className="text-3xl font-extrabold font-mono text-white">
                    {match.homeScore ?? '?'} - {match.awayScore ?? '?'}
                  </div>
                  <div className="text-xs text-goalchain-text-muted mt-1">{match.stage}</div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-base font-semibold text-white">{match.awayTeam.name}</div>
                    <div className="text-xs text-goalchain-text-muted">{match.awayTeam.shortName}</div>
                  </div>
                  <span className="text-3xl">{match.awayTeam.flag}</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Loading State */}
          {isLoading && !proof && (
            <div className="glass-card p-6 animate-pulse">
              <div className="flex justify-between mb-6">
                <div className="skeleton h-6 w-48" />
                <div className="skeleton h-8 w-24 rounded-full" />
              </div>
              <div className="skeleton h-24 rounded-xl mb-6" />
              <div className="space-y-4">
                <div className="skeleton h-16 rounded-lg" />
                <div className="skeleton h-16 rounded-lg" />
                <div className="skeleton h-16 rounded-lg" />
              </div>
            </div>
          )}

          {/* Proof Verification Component */}
          {proof && <ProofVerifier proof={proof} />}

          {/* Related Actions */}
          {market && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-6 flex items-center justify-center gap-4"
            >
              <Link href={`/markets/${market.id}`} className="btn-secondary text-sm">
                View Market
              </Link>
              <Link href="/markets" className="btn-ghost text-sm">
                Browse All Markets
              </Link>
            </motion.div>
          )}

          {/* No verified match */}
          {!proof && !isLoading && !match && (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">🔍</div>
              <h2 className="text-xl font-semibold text-white mb-2">No Proof Found</h2>
              <p className="text-goalchain-text-muted mb-6">
                This match hasn't been settled yet or doesn't exist. Check back after the match is complete.
              </p>
              <Link href="/markets" className="btn-primary inline-block">
                Browse Markets
              </Link>
            </div>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
