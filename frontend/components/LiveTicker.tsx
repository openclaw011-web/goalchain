'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { motion } from 'framer-motion';
import { LiveScore } from '@/lib/types';

function LiveScoreItem({ score }: { score: LiveScore }) {
  const isLive = score.status !== 'finished' && score.status !== 'not_started';
  const isFinished = score.status === 'finished';

  return (
    <div className="inline-flex items-center gap-3 px-4 py-2 mx-1 rounded-lg bg-goalchain-surface border border-goalchain-border whitespace-nowrap">
      <span className="text-xs font-medium text-goalchain-text-muted uppercase tracking-wider">{score.stage}</span>
      <span className="font-semibold">{score.homeTeam}</span>
      <span className={`font-mono text-lg font-bold ${isLive ? 'text-goalchain-green' : isFinished ? 'text-white' : 'text-goalchain-text-muted'}`}>
        {score.homeScore} - {score.awayScore}
      </span>
      <span className="font-semibold">{score.awayTeam}</span>
      {isLive && (
        <span className="flex items-center gap-1.5 text-goalchain-green text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-goalchain-green animate-pulse" />
          {score.minute}&apos;
        </span>
      )}
      {isFinished && (
        <span className="text-xs text-goalchain-text-muted font-medium">FT</span>
      )}
      {score.events && (
        <span className="text-xs text-goalchain-text-muted hidden lg:inline">{score.events}</span>
      )}
    </div>
  );
}

export default function LiveTicker() {
  const liveScores = useAppStore((s) => s.liveScores);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Double the items for seamless infinite scroll
  const items = [...liveScores, ...liveScores];

  return (
    <div className="relative w-full overflow-hidden border-b border-goalchain-border bg-goalchain-navy/80 backdrop-blur-sm">
      {/* Gradient fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-goalchain-navy to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-goalchain-navy to-transparent z-10 pointer-events-none" />

      {/* Live label */}
      <div className="absolute left-8 top-1/2 -translate-y-1/2 z-20 flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-goalchain-green/15 border border-goalchain-green/20">
          <span className="w-1.5 h-1.5 rounded-full bg-goalchain-green animate-pulse" />
          <span className="text-xs font-semibold text-goalchain-green uppercase tracking-wider">LIVE</span>
        </div>
      </div>

      {/* Scrolling ticker */}
      <motion.div
        ref={scrollRef}
        className="flex py-2"
        animate={{ x: ['0%', '-50%'] }}
        transition={{
          duration: 40,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        {items.map((score, idx) => (
          <LiveScoreItem key={`${score.id}-${idx}`} score={score} />
        ))}
      </motion.div>
    </div>
  );
}
