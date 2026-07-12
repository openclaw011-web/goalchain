export interface Team {
  id: string;
  name: string;
  shortName: string;
  flag: string; // emoji flag
  group: string;
  ranking: number;
}

export type MarketStatus = 'upcoming' | 'live' | 'settled';
export type MarketType = 'match_winner' | 'over_under' | 'correct_score' | 'first_goal' | 'both_to_score' | 'total_corners' | 'player_to_score';

export interface Market {
  id: string;
  matchId: string;
  type: MarketType;
  title: string;
  status: MarketStatus;
  lockTime: string; // ISO date
  resolveTime: string | null;
  poolSize: number; // in USDC
  outcomes: Outcome[];
  oddsHistory: OddsPoint[];
  match: Match;
  volume: number;
  /**
   * Numeric id of the corresponding on-chain market account.
   * Market PDA = ["market", u64-LE(onchainMarketId)] on the
   * prediction-market program. Undefined if the market has not been
   * created on-chain (betting is then disabled).
   */
  onchainMarketId?: number;
}

export interface Outcome {
  id: string;
  label: string;
  odds: number; // decimal odds
  probability: number; // 0-1
  volume: number;
  isSelected?: boolean;
}

export interface OddsPoint {
  timestamp: string;
  odds: number[];
  labels: string[];
}

export interface Match {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  date: string;
  stage: string;
  status: 'scheduled' | 'live' | 'finished';
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  events: MatchEvent[];
  venue: string;
  group: string | null;
}

export interface MatchEvent {
  id: string;
  type: 'goal' | 'yellow_card' | 'red_card' | 'substitution' | 'penalty_missed';
  team: 'home' | 'away';
  player: string;
  minute: number;
  additionalTime?: number;
}

export interface Bet {
  id: string;
  userId: string;
  marketId: string;
  matchId: string;
  outcomeId: string;
  amount: number;
  odds: number;
  potentialPayout: number;
  status: 'pending' | 'won' | 'lost' | 'cancelled';
  timestamp: string;
  transactionSignature?: string;
  confirmed?: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar: string;
  totalWon: number;
  totalBets: number;
  winRate: number;
  accuracy: number;
  roi: number;
  volume: number;
}

export interface MerkleProof {
  matchId: string;
  result: string;
  score: string;
  merkleRoot: string;
  proof: string[];
  verified: boolean;
  verifiedOnChain: boolean;
  transactionSignature: string;
  timestamp: string;
}

export interface LiveScore {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: 'not_started' | 'first_half' | 'halftime' | 'second_half' | 'finished';
  stage: string;
  events: string;
}

export interface PoolDistribution {
  outcome: string;
  percentage: number;
  amount: number;
  color: string;
}
