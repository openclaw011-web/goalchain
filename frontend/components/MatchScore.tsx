'use client';

import { Match, MatchEvent } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';

interface MatchScoreProps {
  match: Match;
  compact?: boolean;
}

function MatchEventBubble({ event }: { event: MatchEvent }) {
  const icons: Record<string, string> = {
    goal: '⚽',
    yellow_card: '🟨',
    red_card: '🟥',
    substitution: '🔄',
    penalty_missed: '❌',
  };

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span>{icons[event.type] || '•'}</span>
      <span className="text-goalchain-text-muted">{event.player}</span>
      <span className="font-mono text-goalchain-muted">
        {event.minute}{event.additionalTime ? `+${event.additionalTime}` : ''}&apos;
      </span>
    </div>
  );
}

export default function MatchScore({ match, compact = false }: MatchScoreProps) {
  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card ${compact ? 'p-4' : 'p-6'}`}
    >
      {/* Stage & Status */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-goalchain-text-muted uppercase tracking-wider font-medium">
          {match.stage}
          {match.group && <span> • Group {match.group}</span>}
        </span>
        <div className="flex items-center gap-2">
          {isLive && match.minute && (
            <span className="badge-live text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {match.minute}&apos;
            </span>
          )}
          {isFinished && <span className="badge-settled text-xs">FT</span>}
          {match.status === 'scheduled' && (
            <span className="badge-scheduled text-xs">
              {format(parseISO(match.date), 'MMM d, HH:mm')}
            </span>
          )}
        </div>
      </div>

      {/* Teams & Score */}
      <div className="flex items-center justify-between mb-4">
        {/* Home Team */}
        <div className={`flex ${compact ? 'gap-2' : 'gap-3'} items-center flex-1 ${compact ? 'flex-row' : 'flex-row'}`}>
          <span className={compact ? 'text-2xl' : 'text-4xl'}>{match.homeTeam.flag}</span>
          <div>
            <div className={`font-bold text-white ${compact ? 'text-base' : 'text-xl'}`}>
              {match.homeTeam.shortName}
            </div>
            {!compact && (
              <div className="text-xs text-goalchain-text-muted">{match.homeTeam.name}</div>
            )}
          </div>
        </div>

        {/* Score */}
        <div className="text-center px-4">
          {isLive || isFinished ? (
            <div className="flex items-center gap-2">
              <span className={`${compact ? 'text-2xl' : 'text-5xl'} font-extrabold font-mono ${isLive ? 'text-goalchain-green' : 'text-white'}`}>
                {match.homeScore}
              </span>
              <span className={`${compact ? 'text-xl' : 'text-3xl'} text-goalchain-muted font-mono`}>:</span>
              <span className={`${compact ? 'text-2xl' : 'text-5xl'} font-extrabold font-mono ${isLive ? 'text-goalchain-green' : 'text-white'}`}>
                {match.awayScore}
              </span>
            </div>
          ) : (
            <div className="text-sm text-goalchain-text-muted uppercase tracking-widest font-medium">VS</div>
          )}
        </div>

        {/* Away Team */}
        <div className={`flex ${compact ? 'gap-2' : 'gap-3'} items-center flex-1 flex-row-reverse`}>
          <span className={compact ? 'text-2xl' : 'text-4xl'}>{match.awayTeam.flag}</span>
          <div className="text-right">
            <div className={`font-bold text-white ${compact ? 'text-base' : 'text-xl'}`}>
              {match.awayTeam.shortName}
            </div>
            {!compact && (
              <div className="text-xs text-goalchain-text-muted">{match.awayTeam.name}</div>
            )}
          </div>
        </div>
      </div>

      {/* Venue */}
      {!compact && (
        <div className="text-xs text-goalchain-text-muted text-center mb-4">
          📍 {match.venue}
        </div>
      )}

      {/* Events */}
      {match.events.length > 0 && !compact && (
        <div className="border-t border-goalchain-border pt-4">
          <div className="text-xs font-semibold text-goalchain-text-muted uppercase tracking-wider mb-2">
            Match Events
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              {match.events
                .filter((e) => e.team === 'home')
                .map((event) => (
                  <MatchEventBubble key={event.id} event={event} />
                ))}
            </div>
            <div className="space-y-1 text-right">
              {match.events
                .filter((e) => e.team === 'away')
                .map((event) => (
                  <MatchEventBubble key={event.id} event={event} />
                ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
