'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Navbar from '@/components/Navbar';
import LiveTicker from '@/components/LiveTicker';
import { LeaderboardRowSkeleton } from '@/components/Skeletons';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useAppStore } from '@/lib/store';
import { apiClient } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <div className="flex items-center justify-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
          rank === 1 ? 'bg-yellow-500/20 text-yellow-400' :
          rank === 2 ? 'bg-gray-300/20 text-gray-300' :
          'bg-amber-600/20 text-amber-500'
        }`}>
          {rank}
        </div>
      </div>
    );
  }
  return (
    <div className="text-center text-sm font-mono text-goalchain-text-muted w-8">
      {rank}
    </div>
  );
}

export default function LeaderboardPage() {
  const [sortBy, setSortBy] = useState<'won' | 'accuracy' | 'roi' | 'volume'>('won');
  const storeLeaderboard = useAppStore((s) => s.leaderboard);

  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => apiClient.getLeaderboard(),
    initialData: storeLeaderboard,
    initialDataUpdatedAt: 0, // refetch real data on mount; see markets/page.tsx
  });

  const sortedLeaderboard = useMemo(() => {
    return [...leaderboard].sort((a, b) => {
      switch (sortBy) {
        case 'won': return b.totalWon - a.totalWon;
        case 'accuracy': return b.accuracy - a.accuracy;
        case 'roi': return b.roi - a.roi;
        case 'volume': return b.volume - a.volume;
        default: return b.totalWon - a.totalWon;
      }
    }).map((entry, idx) => ({ ...entry, rank: idx + 1 }));
  }, [leaderboard, sortBy]);

  const sortOptions = [
    { value: 'won', label: 'Total Won' },
    { value: 'accuracy', label: 'Accuracy' },
    { value: 'roi', label: 'ROI' },
    { value: 'volume', label: 'Volume' },
  ] as const;

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-goalchain-navy">
        <Navbar />
        <LiveTicker />

        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-bold text-white mb-2">Leaderboard</h1>
            <p className="text-goalchain-text-muted text-sm">
              Top predictors ranked by USDC won, accuracy, and volume
            </p>
          </motion.div>

          {/* Sort Controls */}
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xs text-goalchain-text-muted uppercase tracking-wider mr-2">Sort by:</span>
            {sortOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSortBy(opt.value)}
                className={`px-4 py-1.5 text-sm rounded-lg transition-all ${
                  sortBy === opt.value
                    ? 'bg-goalchain-green/20 text-goalchain-green font-medium border border-goalchain-green/30'
                    : 'text-goalchain-text-muted hover:text-white border border-transparent'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Leaderboard Table */}
          <div className="glass-card overflow-hidden">
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 border-b border-goalchain-border bg-goalchain-navy-light/50">
              <div className="col-span-1 text-xs font-medium text-goalchain-text-muted uppercase tracking-wider">Rank</div>
              <div className="col-span-4 text-xs font-medium text-goalchain-text-muted uppercase tracking-wider">Predictor</div>
              <div className="col-span-2 text-right text-xs font-medium text-goalchain-text-muted uppercase tracking-wider">Won</div>
              <div className="col-span-2 text-right text-xs font-medium text-goalchain-text-muted uppercase tracking-wider">Accuracy</div>
              <div className="col-span-1 text-right text-xs font-medium text-goalchain-text-muted uppercase tracking-wider">ROI</div>
              <div className="col-span-2 text-right text-xs font-medium text-goalchain-text-muted uppercase tracking-wider">Volume</div>
            </div>

            {/* Table Body */}
            {isLoading && leaderboard.length === 0 ? (
              <div className="divide-y divide-goalchain-border">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <LeaderboardRowSkeleton key={i} />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-goalchain-border">
                {sortedLeaderboard.map((entry, idx) => (
                  <motion.div
                    key={entry.userId}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`grid grid-cols-12 gap-4 px-6 py-4 items-center transition-colors hover:bg-goalchain-surface-light ${
                      entry.rank <= 3 ? 'bg-goalchain-green/[0.02]' : ''
                    }`}
                  >
                    {/* Rank */}
                    <div className="col-span-1">
                      <RankBadge rank={entry.rank} />
                    </div>

                    {/* User Info */}
                    <div className="col-span-4 flex items-center gap-3">
                      <div className="text-xl">{entry.avatar}</div>
                      <div>
                        <div className="text-sm font-semibold text-white">{entry.username}</div>
                        <div className="text-xs text-goalchain-text-muted">
                          {entry.totalBets} predictions
                        </div>
                      </div>
                    </div>

                    {/* Won */}
                    <div className="col-span-2 text-right">
                      <div className="text-sm font-bold font-mono text-goalchain-green">
                        ${entry.totalWon.toLocaleString()}
                      </div>
                    </div>

                    {/* Accuracy */}
                    <div className="col-span-2 text-right">
                      <div className="text-sm font-medium font-mono text-white">
                        {(entry.accuracy * 100).toFixed(1)}%
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-goalchain-navy-light mt-1 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-goalchain-green transition-all duration-500"
                          style={{ width: `${entry.accuracy * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* ROI */}
                    <div className="col-span-1 text-right">
                      <div className={`text-sm font-mono font-medium ${
                        entry.roi >= 0 ? 'text-goalchain-green' : 'text-red-400'
                      }`}>
                        {(entry.roi * 100).toFixed(0)}%
                      </div>
                    </div>

                    {/* Volume */}
                    <div className="col-span-2 text-right">
                      <div className="text-sm font-mono text-goalchain-text-muted">
                        ${entry.volume.toLocaleString()}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {sortedLeaderboard.length === 0 && !isLoading && (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">🏆</div>
                <h3 className="text-lg font-semibold mb-1">No Predictors Yet</h3>
                <p className="text-sm text-goalchain-text-muted">Be the first to make a prediction!</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
}
