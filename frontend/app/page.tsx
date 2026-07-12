'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Navbar from '@/components/Navbar';
import LiveTicker from '@/components/LiveTicker';
import MarketCard from '@/components/MarketCard';
import { useAppStore } from '@/lib/store';
import { markets as allMarkets, matches, leaderboard, liveScores } from '@/lib/mock-data';

function StatCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="glass-card p-5 text-center"
    >
      <div className="text-2xl font-bold font-mono text-goalchain-green mb-1">{value}</div>
      <div className="text-sm text-white font-medium">{label}</div>
      {sublabel && <div className="text-xs text-goalchain-text-muted mt-1">{sublabel}</div>}
    </motion.div>
  );
}

function TopPredictorCard({ rank, username, avatar, totalWon, accuracy }: { rank: number; username: string; avatar: string; totalWon: number; accuracy: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4 flex items-center gap-4"
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
        rank === 1 ? 'bg-yellow-500/20 text-yellow-400' :
        rank === 2 ? 'bg-gray-300/20 text-gray-300' :
        rank === 3 ? 'bg-amber-600/20 text-amber-500' :
        'bg-goalchain-surface-light text-goalchain-text-muted'
      }`}>
        {rank}
      </div>
      <div className="text-2xl">{avatar}</div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-white">{username}</div>
        <div className="text-xs text-goalchain-text-muted">{accuracy}% accuracy</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold font-mono text-goalchain-green">+${totalWon.toLocaleString()}</div>
        <div className="text-xs text-goalchain-text-muted">won</div>
      </div>
    </motion.div>
  );
}

export default function HomePage() {
  const liveMatches = matches.filter((m) => m.status === 'live');
  const upcomingMarkets = allMarkets.filter((m) => m.status === 'upcoming').slice(0, 6);
  const topPredictors = leaderboard.slice(0, 3);

  const totalVolume = allMarkets.reduce((s, m) => s + m.volume, 0);
  const totalPools = allMarkets.reduce((s, m) => s + m.poolSize, 0);
  const activeMarkets = allMarkets.filter((m) => m.status === 'live' || m.status === 'upcoming').length;
  const settledMarkets = allMarkets.filter((m) => m.status === 'settled').length;

  return (
    <div className="min-h-screen bg-goalchain-navy">
      <Navbar />
      <LiveTicker />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full border border-goalchain-green/5" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full border border-goalchain-green/5" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-4xl mx-auto"
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-goalchain-green/10 border border-goalchain-green/20 mb-6"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-goalchain-green animate-pulse" />
              <span className="text-xs font-medium text-goalchain-green uppercase tracking-wider">
                World Cup 2026 — Now Live
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white mb-6"
            >
              Predict the World Cup.
              <br />
              <span className="text-goalchain-green">Win on Solana.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-lg text-goalchain-text-muted max-w-2xl mx-auto mb-8"
            >
              Place verifiable predictions on every World Cup 2026 match. Powered by{' '}
              <span className="text-goalchain-green font-medium">TxLINE</span> for
              cryptographically proven results and instant payouts on Solana.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link href="/markets" className="btn-primary text-base px-8 py-3">
                Browse Markets
              </Link>
              <Link href="/leaderboard" className="btn-secondary text-base px-8 py-3">
                View Leaderboard
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-goalchain-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Volume" value={`$${(totalVolume / 1000).toFixed(0)}K`} sublabel="Across all markets" />
            <StatCard label="Active Markets" value={activeMarkets.toString()} sublabel={`${settledMarkets} settled`} />
            <StatCard label="Total Pool" value={`$${(totalPools / 1000).toFixed(0)}K`} sublabel="USDC locked" />
            <StatCard label="Predictors" value={leaderboard.length.toString()} sublabel="Top traders" />
          </div>
        </div>
      </section>

      {/* Live Matches */}
      {liveMatches.length > 0 && (
        <section className="py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">
                <span className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-goalchain-green animate-pulse" />
                  Live Now
                </span>
              </h2>
              <Link href="/markets?status=live" className="text-sm text-goalchain-green hover:text-goalchain-green-dark transition-colors">
                View All →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {liveMatches.map((match) => {
                const market = allMarkets.find((m) => m.matchId === match.id);
                return market ? <MarketCard key={market.id} market={market} /> : null;
              })}
            </div>
          </div>
        </section>
      )}

      {/* Featured Markets */}
      <section className="py-12 bg-goalchain-surface/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Featured Markets</h2>
            <Link href="/markets" className="text-sm text-goalchain-green hover:text-goalchain-green-dark transition-colors">
              Browse All →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingMarkets.map((market, idx) => (
              <MarketCard key={market.id} market={market} index={idx} />
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-white text-center mb-12">How GoalChain Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Connect Wallet',
                desc: 'Connect your Solana wallet (Phantom, Backpack) to start predicting.',
                icon: '🔌',
              },
              {
                step: '02',
                title: 'Predict Matches',
                desc: 'Browse World Cup markets and place predictions on match outcomes.',
                icon: '⚽',
              },
              {
                step: '03',
                title: 'Win & Verify',
                desc: 'Results are verified on-chain via TxLINE Merkle proofs. Instant payouts.',
                icon: '🏆',
              },
            ].map((item, idx) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="glass-card p-6 text-center"
              >
                <div className="text-4xl mb-4">{item.icon}</div>
                <div className="text-xs font-mono text-goalchain-green mb-2">{item.step}</div>
                <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-goalchain-text-muted">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Leaderboard Preview */}
      <section className="py-12 bg-goalchain-surface/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Top Predictors</h2>
            <Link href="/leaderboard" className="text-sm text-goalchain-green hover:text-goalchain-green-dark transition-colors">
              Full Leaderboard →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {topPredictors.map((p, idx) => (
              <TopPredictorCard
                key={p.userId}
                rank={p.rank}
                username={p.username}
                avatar={p.avatar}
                totalWon={p.totalWon}
                accuracy={Math.round(p.accuracy * 100)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-goalchain-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-goalchain-green/15 border border-goalchain-green/30 flex items-center justify-center">
                <span className="text-xs font-bold text-goalchain-green">G</span>
              </div>
              <span className="text-sm font-semibold text-white">GoalChain</span>
              <span className="text-xs text-goalchain-muted">| Powered by TxLINE</span>
            </div>
            <div className="flex items-center gap-6 text-xs text-goalchain-text-muted">
              <span>World Cup 2026</span>
              <span>Solana Devnet</span>
              <span>Built for TxODDS Hackathon</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
