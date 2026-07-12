'use client';

import { Market } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface MarketCardProps {
  market: Market;
  index?: number;
}

export default function MarketCard({ market, index = 0 }: MarketCardProps) {
  const { match, type, outcomes, poolSize, volume, status, lockTime } = market;

  const statusConfig = {
    live: { label: 'LIVE', className: 'badge-live' },
    upcoming: { label: 'Upcoming', className: 'badge-upcoming' },
    settled: { label: 'Settled', className: 'badge-settled' },
  };

  const timeUntilLock = formatDistanceToNow(new Date(lockTime), { addSuffix: true });
  const marketTypeLabels: Record<string, string> = {
    match_winner: 'Match Winner',
    over_under: 'Over/Under 2.5',
    correct_score: 'Correct Score',
    first_goal: 'First Goalscorer',
    both_to_score: 'Both Teams to Score',
    total_corners: 'Total Corners',
    player_to_score: 'Anytime Goalscorer',
  };

  return (
    <Link href={`/markets/${market.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        className="glass-card-hover p-5 group cursor-pointer"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={statusConfig[status].className}>
              {status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
              {statusConfig[status].label}
            </span>
            <span className="text-xs text-goalchain-text-muted">{marketTypeLabels[type] || type}</span>
          </div>
          <span className="text-xs text-goalchain-text-muted">{match.stage}</span>
        </div>

        {/* Teams & Score */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <span className="text-2xl">{match.homeTeam.flag}</span>
            <span className="text-sm font-semibold text-white group-hover:text-goalchain-green transition-colors">
              {match.homeTeam.shortName}
            </span>
          </div>

          <div className="flex flex-col items-center gap-1 px-4">
            {match.status === 'live' || match.status === 'finished' ? (
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-extrabold font-mono ${match.status === 'live' ? 'text-goalchain-green' : 'text-white'}`}>
                  {match.homeScore}
                </span>
                <span className="text-goalchain-muted text-lg font-mono">:</span>
                <span className={`text-2xl font-extrabold font-mono ${match.status === 'live' ? 'text-goalchain-green' : 'text-white'}`}>
                  {match.awayScore}
                </span>
              </div>
            ) : (
              <span className="text-xs text-goalchain-text-muted uppercase tracking-wider font-medium">VS</span>
            )}
            {match.status === 'live' && match.minute && (
              <span className="text-xs text-goalchain-green font-medium">{match.minute}&apos;</span>
            )}
            {match.status === 'finished' && (
              <span className="text-xs text-goalchain-text-muted">FT</span>
            )}
          </div>

          <div className="flex flex-col items-center gap-1.5 flex-1">
            <span className="text-2xl">{match.awayTeam.flag}</span>
            <span className="text-sm font-semibold text-white group-hover:text-goalchain-green transition-colors">
              {match.awayTeam.shortName}
            </span>
          </div>
        </div>

        {/* Odds */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {outcomes.map((outcome) => (
            <div
              key={outcome.id}
              className="text-center px-2 py-2 rounded-lg bg-goalchain-navy-light border border-goalchain-border group-hover:border-goalchain-border-light transition-colors"
            >
              <div className="text-xs text-goalchain-text-muted mb-1 truncate">{outcome.label}</div>
              <div className="text-lg font-bold font-mono text-white">
                {outcome.odds.toFixed(2)}
              </div>
              <div className="text-xs text-goalchain-green">
                {(outcome.probability * 100).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-goalchain-text-muted border-t border-goalchain-border pt-3">
          <div className="flex items-center gap-3">
            <span>💰 ${poolSize.toLocaleString()}</span>
            <span>📊 ${volume.toLocaleString()}</span>
          </div>
          <span>🔒 {timeUntilLock}</span>
        </div>
      </motion.div>
    </Link>
  );
}
