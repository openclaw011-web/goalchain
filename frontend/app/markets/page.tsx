'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Navbar from '@/components/Navbar';
import LiveTicker from '@/components/LiveTicker';
import MarketCard from '@/components/MarketCard';
import { MarketCardSkeleton } from '@/components/Skeletons';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useAppStore } from '@/lib/store';
import { MarketStatus, MarketType } from '@/lib/types';
import { apiClient } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

const statusFilters = [
  { value: 'all', label: 'All Markets' },
  { value: 'live', label: 'Live' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'settled', label: 'Settled' },
];

const typeFilters = [
  { value: '', label: 'All Types' },
  { value: 'match_winner', label: 'Match Winner' },
  { value: 'over_under', label: 'Over/Under' },
  { value: 'correct_score', label: 'Correct Score' },
  { value: 'both_to_score', label: 'Both to Score' },
];

export default function MarketsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'pool' | 'volume' | 'lock'>('pool');

  const storeMarkets = useAppStore((s) => s.markets);

  const { data: markets, isLoading } = useQuery({
    queryKey: ['markets'],
    queryFn: () => apiClient.getMarkets(),
    initialData: storeMarkets,
  });

  const filteredMarkets = useMemo(() => {
    return markets.filter((m) => {
      const matchSearch =
        searchQuery === '' ||
        m.match.homeTeam.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.match.awayTeam.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.match.homeTeam.shortName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.match.awayTeam.shortName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchStatus = statusFilter === 'all' || m.status === statusFilter;
      const matchType = typeFilter === '' || m.type === typeFilter;

      return matchSearch && matchStatus && matchType;
    }).sort((a, b) => {
      if (sortBy === 'pool') return b.poolSize - a.poolSize;
      if (sortBy === 'volume') return b.volume - a.volume;
      return new Date(b.lockTime).getTime() - new Date(a.lockTime).getTime();
    });
  }, [markets, searchQuery, statusFilter, typeFilter, sortBy]);

  const liveCount = markets.filter((m) => m.status === 'live').length;
  const upcomingCount = markets.filter((m) => m.status === 'upcoming').length;
  const settledCount = markets.filter((m) => m.status === 'settled').length;

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-goalchain-navy">
        <Navbar />
        <LiveTicker />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-bold text-white mb-2">Markets</h1>
            <p className="text-goalchain-text-muted text-sm">
              {liveCount} live · {upcomingCount} upcoming · {settledCount} settled
            </p>
          </motion.div>

          {/* Filters */}
          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            {/* Search */}
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-goalchain-text-muted"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-10"
              />
            </div>

            {/* Status Filters */}
            <div className="flex gap-1 bg-goalchain-surface rounded-lg p-1">
              {statusFilters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`px-4 py-2 text-sm rounded-md transition-all ${
                    statusFilter === f.value
                      ? 'bg-goalchain-green/20 text-goalchain-green font-medium'
                      : 'text-goalchain-text-muted hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="input-field w-auto min-w-[140px]"
            >
              <option value="pool">Sort by Pool</option>
              <option value="volume">Sort by Volume</option>
              <option value="lock">Sort by Date</option>
            </select>
          </div>

          {/* Markets Grid */}
          {isLoading && markets.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <MarketCardSkeleton key={i} />
              ))}
            </div>
          ) : filteredMarkets.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-5xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-white mb-2">No markets found</h3>
              <p className="text-goalchain-text-muted text-sm">
                Try adjusting your search or filters
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMarkets.map((market, idx) => (
                <MarketCard key={market.id} market={market} index={idx} />
              ))}
            </div>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
