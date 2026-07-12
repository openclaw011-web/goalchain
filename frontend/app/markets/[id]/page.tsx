'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import Navbar from '@/components/Navbar';
import LiveTicker from '@/components/LiveTicker';
import MatchScore from '@/components/MatchScore';
import OddsChart from '@/components/OddsChart';
import BetForm from '@/components/BetForm';
import PoolDistributionComponent from '@/components/PoolDistribution';
import { MatchScoreSkeleton, OddsChartSkeleton } from '@/components/Skeletons';
import ErrorBoundary from '@/components/ErrorBoundary';
import { getMarketById } from '@/lib/mock-data';
import { poolDistributions } from '@/lib/mock-data';
import { apiClient } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';

export default function MarketDetailPage({ params }: { params: { id: string } }) {
  // Next 14: `params` is a plain object (the Promise/use() form is Next 15+).
  const marketId = params.id;
  const { connected } = useWallet();

  const { data: market, isLoading } = useQuery({
    queryKey: ['market', marketId],
    queryFn: () => apiClient.getMarket(marketId),
    initialData: getMarketById(marketId),
  });

  if (isLoading && !market) {
    return (
      <div className="min-h-screen bg-goalchain-navy">
        <Navbar />
        <LiveTicker />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="skeleton h-8 w-64 mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <MatchScoreSkeleton />
              <OddsChartSkeleton />
            </div>
            <div>
              <div className="glass-card p-6 animate-pulse">
                <div className="skeleton h-6 w-40 mb-6" />
                <div className="space-y-4">
                  <div className="skeleton h-20 rounded-xl" />
                  <div className="skeleton h-12 rounded-lg" />
                  <div className="skeleton h-12 rounded-lg" />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="min-h-screen bg-goalchain-navy">
        <Navbar />
        <LiveTicker />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-white mb-2">Market Not Found</h1>
          <p className="text-goalchain-text-muted mb-6">This market doesn't exist or has been removed.</p>
          <Link href="/markets" className="btn-primary inline-block">
            Browse Markets
          </Link>
        </main>
      </div>
    );
  }

  const poolDist = poolDistributions[market.matchId] || market.outcomes.map((o, i) => ({
    outcome: o.label,
    percentage: (o.volume / market.poolSize) * 100,
    amount: o.volume,
    color: i === 0 ? '#00ff88' : i === 1 ? '#f59e0b' : '#3b82f6',
  }));

  const labels = market.outcomes.map((o) => o.label);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-goalchain-navy">
        <Navbar />
        <LiveTicker />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              {market.title}
            </h1>
            <div className="flex items-center gap-3">
              <span className={`badge ${
                market.status === 'live' ? 'badge-live' :
                market.status === 'settled' ? 'badge-settled' : 'badge-upcoming'
              }`}>
                {market.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                {market.status.charAt(0).toUpperCase() + market.status.slice(1)}
              </span>
              <span className="text-sm text-goalchain-text-muted">
                Pool: <span className="font-mono text-white">${market.poolSize.toLocaleString()}</span>
              </span>
              <span className="text-sm text-goalchain-text-muted">
                Volume: <span className="font-mono text-white">${market.volume.toLocaleString()}</span>
              </span>
            </div>
          </motion.div>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Side - Match Details & Charts */}
            <div className="lg:col-span-2 space-y-6">
              {/* Match Score */}
              <MatchScore match={market.match} />

              {/* Odds Chart */}
              {market.oddsHistory.length > 0 && (
                <OddsChart data={market.oddsHistory} labels={labels} />
              )}

              {/* Pool Distribution */}
              <PoolDistributionComponent data={poolDist} totalPool={market.poolSize} />

              {/* Market Info Card */}
              <div className="glass-card p-6">
                <h3 className="text-lg font-semibold mb-4">Market Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-goalchain-text-muted uppercase tracking-wider mb-1">Venue</div>
                    <div className="text-sm text-white">{market.match.venue}</div>
                  </div>
                  <div>
                    <div className="text-xs text-goalchain-text-muted uppercase tracking-wider mb-1">Stage</div>
                    <div className="text-sm text-white">{market.match.stage}</div>
                  </div>
                  <div>
                    <div className="text-xs text-goalchain-text-muted uppercase tracking-wider mb-1">Market Type</div>
                    <div className="text-sm text-white capitalize">{market.type.replace(/_/g, ' ')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-goalchain-text-muted uppercase tracking-wider mb-1">Settlement</div>
                    <div className="text-sm text-white">TxLINE Oracle</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Bet Form */}
            <div className="lg:col-span-1">
              <div className="sticky top-24">
                {market.status !== 'settled' && connected ? (
                  <BetForm market={market} />
                ) : (
                  <>
                    {!connected && (
                      <div className="glass-card p-6 text-center">
                        <div className="text-4xl mb-4">🔌</div>
                        <h3 className="text-lg font-semibold mb-2">Connect Your Wallet</h3>
                        <p className="text-sm text-goalchain-text-muted mb-4">
                          Connect a Solana wallet to place predictions.
                        </p>
                      </div>
                    )}
                    {market.status === 'settled' && (
                      <div className="glass-card p-6 text-center">
                        <div className="text-4xl mb-4">✅</div>
                        <h3 className="text-lg font-semibold mb-2">Market Settled</h3>
                        <p className="text-sm text-goalchain-text-muted mb-4">
                          This market has been settled. View the proof verification.
                        </p>
                        <Link
                          href={`/verify/${market.matchId}`}
                          className="btn-primary text-sm inline-block"
                        >
                          View Proof
                        </Link>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
}
