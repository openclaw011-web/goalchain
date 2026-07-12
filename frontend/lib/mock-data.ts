import { Match, Market, Outcome, OddsPoint, Bet, LeaderboardEntry, MerkleProof, LiveScore, PoolDistribution } from './types';

export const teams = [
  { id: 'arg', name: 'Argentina', shortName: 'ARG', flag: '🇦🇷', group: 'A', ranking: 1 },
  { id: 'bra', name: 'Brazil', shortName: 'BRA', flag: '🇧🇷', group: 'A', ranking: 3 },
  { id: 'fra', name: 'France', shortName: 'FRA', flag: '🇫🇷', group: 'B', ranking: 2 },
  { id: 'eng', name: 'England', shortName: 'ENG', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', group: 'B', ranking: 4 },
  { id: 'esp', name: 'Spain', shortName: 'ESP', flag: '🇪🇸', group: 'C', ranking: 8 },
  { id: 'ger', name: 'Germany', shortName: 'GER', flag: '🇩🇪', group: 'C', ranking: 10 },
  { id: 'ita', name: 'Italy', shortName: 'ITA', flag: '🇮🇹', group: 'D', ranking: 7 },
  { id: 'ned', name: 'Netherlands', shortName: 'NED', flag: '🇳🇱', group: 'D', ranking: 6 },
  { id: 'por', name: 'Portugal', shortName: 'POR', flag: '🇵🇹', group: 'E', ranking: 5 },
  { id: 'bel', name: 'Belgium', shortName: 'BEL', flag: '🇧🇪', group: 'E', ranking: 9 },
  { id: 'uru', name: 'Uruguay', shortName: 'URU', flag: '🇺🇾', group: 'F', ranking: 11 },
  { id: 'den', name: 'Denmark', shortName: 'DEN', flag: '🇩🇰', group: 'F', ranking: 13 },
  { id: 'cro', name: 'Croatia', shortName: 'CRO', flag: '🇭🇷', group: 'G', ranking: 12 },
  { id: 'mex', name: 'Mexico', shortName: 'MEX', flag: '🇲🇽', group: 'G', ranking: 15 },
  { id: 'jpn', name: 'Japan', shortName: 'JPN', flag: '🇯🇵', group: 'H', ranking: 18 },
  { id: 'sen', name: 'Senegal', shortName: 'SEN', flag: '🇸🇳', group: 'H', ranking: 20 },
  { id: 'usa', name: 'USA', shortName: 'USA', flag: '🇺🇸', group: 'A', ranking: 14 },
  { id: 'col', name: 'Colombia', shortName: 'COL', flag: '🇨🇴', group: 'C', ranking: 16 },
  { id: 'mar', name: 'Morocco', shortName: 'MAR', flag: '🇲🇦', group: 'F', ranking: 17 },
  { id: 'sui', name: 'Switzerland', shortName: 'SUI', flag: '🇨🇭', group: 'G', ranking: 19 },
  { id: 'kor', name: 'South Korea', shortName: 'KOR', flag: '🇰🇷', group: 'H', ranking: 22 },
  { id: 'nga', name: 'Nigeria', shortName: 'NGA', flag: '🇳🇬', group: 'D', ranking: 21 },
  { id: 'pol', name: 'Poland', shortName: 'POL', flag: '🇵🇱', group: 'E', ranking: 23 },
  { id: 'ecu', name: 'Ecuador', shortName: 'ECU', flag: '🇪🇨', group: 'B', ranking: 24 },
];

const now = new Date();
const addHours = (h: number) => new Date(now.getTime() + h * 3600000).toISOString();
const subHours = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();

function generateOddsHistory(baseOdds: number[], points: number): OddsPoint[] {
  const history: OddsPoint[] = [];
  for (let i = 0; i < points; i++) {
    history.push({
      timestamp: subHours((points - i) * 2),
      odds: baseOdds.map(o => o + (Math.random() - 0.5) * 0.8),
      labels: ['Home', 'Draw', 'Away'],
    });
  }
  return history;
}

export const matches: Match[] = [
  {
    id: 'match-1',
    homeTeam: teams[0], awayTeam: teams[1],
    date: addHours(72), stage: 'Group A', status: 'scheduled',
    homeScore: null, awayScore: null, minute: null, events: [],
    venue: 'MetLife Stadium, New York', group: 'A',
  },
  {
    id: 'match-2',
    homeTeam: teams[2], awayTeam: teams[3],
    date: addHours(96), stage: 'Group B', status: 'scheduled',
    homeScore: null, awayScore: null, minute: null, events: [],
    venue: 'SoFi Stadium, Los Angeles', group: 'B',
  },
  {
    id: 'match-3',
    homeTeam: teams[4], awayTeam: teams[5],
    date: addHours(48), stage: 'Group C', status: 'scheduled',
    homeScore: null, awayScore: null, minute: null, events: [],
    venue: 'AT&T Stadium, Dallas', group: 'C',
  },
  {
    id: 'match-4',
    homeTeam: teams[6], awayTeam: teams[7],
    date: addHours(120), stage: 'Group D', status: 'scheduled',
    homeScore: null, awayScore: null, minute: null, events: [],
    venue: 'Mercedes-Benz Stadium, Atlanta', group: 'D',
  },
  {
    id: 'match-5',
    homeTeam: teams[8], awayTeam: teams[9],
    date: addHours(36), stage: 'Group E', status: 'scheduled',
    homeScore: null, awayScore: null, minute: null, events: [],
    venue: 'NRG Stadium, Houston', group: 'E',
  },
  {
    id: 'match-6',
    homeTeam: teams[10], awayTeam: teams[11],
    date: subHours(4), stage: 'Group F', status: 'live',
    homeScore: 1, awayScore: 0, minute: 67, events: [
      { id: 'evt-1', type: 'goal', team: 'home', player: 'Federico Valverde', minute: 23, additionalTime: 0 },
      { id: 'evt-2', type: 'yellow_card', team: 'home', player: 'Ronald Araújo', minute: 45 },
      { id: 'evt-3', type: 'yellow_card', team: 'away', player: 'Christian Eriksen', minute: 52 },
    ],
    venue: 'Levi\'s Stadium, San Francisco', group: 'F',
  },
  {
    id: 'match-7',
    homeTeam: teams[12], awayTeam: teams[13],
    date: subHours(8), stage: 'Group G', status: 'finished',
    homeScore: 2, awayScore: 1, minute: 90, events: [
      { id: 'evt-4', type: 'goal', team: 'home', player: 'Luka Modrić', minute: 12 },
      { id: 'evt-5', type: 'goal', team: 'away', player: 'Raúl Jiménez', minute: 34 },
      { id: 'evt-6', type: 'goal', team: 'home', player: 'Andrej Kramarić', minute: 78 },
    ],
    venue: 'Allegiant Stadium, Las Vegas', group: 'G',
  },
  {
    id: 'match-8',
    homeTeam: teams[14], awayTeam: teams[15],
    date: subHours(12), stage: 'Group H', status: 'finished',
    homeScore: 1, awayScore: 1, minute: 90, events: [
      { id: 'evt-7', type: 'goal', team: 'home', player: 'Takefusa Kubo', minute: 41 },
      { id: 'evt-8', type: 'goal', team: 'away', player: 'Sadio Mané', minute: 67 },
    ],
    venue: 'Lumen Field, Seattle', group: 'H',
  },
  {
    id: 'match-9',
    homeTeam: teams[16], awayTeam: teams[0],
    date: subHours(6), stage: 'Group A', status: 'live',
    homeScore: 0, awayScore: 2, minute: 55, events: [
      { id: 'evt-9', type: 'goal', team: 'away', player: 'Lionel Messi', minute: 18 },
      { id: 'evt-10', type: 'goal', team: 'away', player: 'Julián Álvarez', minute: 32 },
      { id: 'evt-11', type: 'yellow_card', team: 'home', player: 'Weston McKennie', minute: 44 },
    ],
    venue: 'Rose Bowl, Los Angeles', group: 'A',
  },
  {
    id: 'match-10',
    homeTeam: teams[17], awayTeam: teams[18],
    date: addHours(24), stage: 'Group C', status: 'scheduled',
    homeScore: null, awayScore: null, minute: null, events: [],
    venue: 'Hard Rock Stadium, Miami', group: 'C',
  },
];

function getMatchOdds(match: Match): [number, number, number] {
  const rankingDiff = match.awayTeam.ranking - match.homeTeam.ranking;
  const baseHome = 2.2 - rankingDiff * 0.04;
  const baseDraw = 3.3;
  const baseAway = 2.8 + rankingDiff * 0.04;
  return [
    Math.max(1.1, Number(baseHome.toFixed(2))),
    Number(baseDraw.toFixed(2)),
    Math.max(1.1, Number(baseAway.toFixed(2))),
  ];
}

export const markets: Market[] = matches.map((match, idx) => {
  const odds = getMatchOdds(match);
  const status = match.status === 'live' ? 'live' as const : match.status === 'finished' ? 'settled' as const : 'upcoming' as const;
  const poolSize = Math.floor(Math.random() * 50000) + 5000;

  return {
    id: `market-${match.id}`,
    matchId: match.id,
    // On-chain ids 101..110 — created on Devnet by scripts/bootstrap-devnet-markets.mjs.
    // Only upcoming markets exist on-chain (past lock times cannot be created).
    onchainMarketId: status === 'upcoming' ? 101 + idx : undefined,
    type: 'match_winner',
    title: `${match.homeTeam.shortName} vs ${match.awayTeam.shortName} - Match Winner`,
    status,
    lockTime: match.date,
    resolveTime: match.status === 'finished' ? match.date : null,
    poolSize,
    volume: Math.floor(poolSize * 1.5),
    match,
    outcomes: [
      { id: `out-${match.id}-home`, label: match.homeTeam.shortName, odds: odds[0], probability: 1 / odds[0], volume: Math.floor(poolSize * 0.4) },
      { id: `out-${match.id}-draw`, label: 'Draw', odds: odds[1], probability: 1 / odds[1], volume: Math.floor(poolSize * 0.25) },
      { id: `out-${match.id}-away`, label: match.awayTeam.shortName, odds: odds[2], probability: 1 / odds[2], volume: Math.floor(poolSize * 0.35) },
    ],
    oddsHistory: generateOddsHistory(odds, 12),
  };
});

export const liveScores: LiveScore[] = [
  {
    id: 'match-6', homeTeam: 'Uruguay', awayTeam: 'Denmark',
    homeScore: 1, awayScore: 0, minute: 67, status: 'second_half',
    stage: 'Group F', events: '⚽ Valverde 23\'',
  },
  {
    id: 'match-9', homeTeam: 'USA', awayTeam: 'Argentina',
    homeScore: 0, awayScore: 2, minute: 55, status: 'second_half',
    stage: 'Group A', events: '⚽ Messi 18\', Álvarez 32\'',
  },
  {
    id: 'match-7', homeTeam: 'Croatia', awayTeam: 'Mexico',
    homeScore: 2, awayScore: 1, minute: 90, status: 'finished',
    stage: 'Group G', events: 'FT: 2-1',
  },
  {
    id: 'match-8', homeTeam: 'Japan', awayTeam: 'Senegal',
    homeScore: 1, awayScore: 1, minute: 90, status: 'finished',
    stage: 'Group H', events: 'FT: 1-1',
  },
];

export const bets: Bet[] = [
  {
    id: 'bet-1', userId: 'user-1', marketId: 'market-match-7', matchId: 'match-7',
    outcomeId: 'out-match-7-home', amount: 50, odds: 2.15, potentialPayout: 107.50,
    status: 'won', timestamp: subHours(10), transactionSignature: '5KtN3dJ1...', confirmed: true,
  },
  {
    id: 'bet-2', userId: 'user-1', marketId: 'market-match-8', matchId: 'match-8',
    outcomeId: 'out-match-8-draw', amount: 25, odds: 3.20, potentialPayout: 80.00,
    status: 'won', timestamp: subHours(14), transactionSignature: '7GhP2sY...', confirmed: true,
  },
  {
    id: 'bet-3', userId: 'user-2', marketId: 'market-match-6', matchId: 'match-6',
    outcomeId: 'out-match-6-home', amount: 100, odds: 1.85, potentialPayout: 185.00,
    status: 'pending', timestamp: subHours(6), confirmed: false,
  },
  {
    id: 'bet-4', userId: 'user-1', marketId: 'market-match-9', matchId: 'match-9',
    outcomeId: 'out-match-9-away', amount: 200, odds: 1.45, potentialPayout: 290.00,
    status: 'pending', timestamp: subHours(8), transactionSignature: '2JfL9pQ...', confirmed: true,
  },
  {
    id: 'bet-5', userId: 'user-3', marketId: 'market-match-7', matchId: 'match-7',
    outcomeId: 'out-match-7-away', amount: 30, odds: 3.80, potentialPayout: 114.00,
    status: 'lost', timestamp: subHours(11), transactionSignature: '8RmV4kA...', confirmed: true,
  },
];

export const leaderboard: LeaderboardEntry[] = [
  { rank: 1, userId: 'user-2', username: 'CryptoMessi10', avatar: '🐐', totalWon: 4560, totalBets: 47, winRate: 0.68, accuracy: 0.72, roi: 0.34, volume: 12400 },
  { rank: 2, userId: 'user-1', username: 'GoalPredictor', avatar: '⚽', totalWon: 3200, totalBets: 38, winRate: 0.63, accuracy: 0.65, roi: 0.28, volume: 9800 },
  { rank: 3, userId: 'user-3', username: 'SolanaKicker', avatar: '🌊', totalWon: 2800, totalBets: 52, winRate: 0.58, accuracy: 0.61, roi: 0.22, volume: 15200 },
  { rank: 4, userId: 'user-4', username: 'TxLINE_Pro', avatar: '🔗', totalWon: 2100, totalBets: 29, winRate: 0.72, accuracy: 0.74, roi: 0.41, volume: 6700 },
  { rank: 5, userId: 'user-5', username: 'WAGMIUnited', avatar: '🏆', totalWon: 1850, totalBets: 33, winRate: 0.61, accuracy: 0.63, roi: 0.19, volume: 8100 },
  { rank: 6, userId: 'user-6', username: 'DeFiDefender', avatar: '🛡️', totalWon: 1200, totalBets: 25, winRate: 0.56, accuracy: 0.58, roi: 0.15, volume: 5400 },
  { rank: 7, userId: 'user-7', username: 'ChainSideFC', avatar: '⛓️', totalWon: 980, totalBets: 20, winRate: 0.65, accuracy: 0.67, roi: 0.31, volume: 3800 },
  { rank: 8, userId: 'user-8', username: 'OnChainOle', avatar: '🇪🇸', totalWon: 750, totalBets: 18, winRate: 0.50, accuracy: 0.52, roi: 0.12, volume: 4200 },
  { rank: 9, userId: 'user-9', username: 'PredictionPro', avatar: '📊', totalWon: 600, totalBets: 15, winRate: 0.60, accuracy: 0.62, roi: 0.25, volume: 2900 },
  { rank: 10, userId: 'user-10', username: 'SlamDunkSzn', avatar: '💎', totalWon: 420, totalBets: 12, winRate: 0.58, accuracy: 0.55, roi: 0.18, volume: 2100 },
];

export const merkleProofs: Record<string, MerkleProof> = {
  'match-7': {
    matchId: 'match-7',
    result: 'Croatia 2 - 1 Mexico',
    score: '2-1',
    merkleRoot: '0x8f3b5c2a1d9e4f7...',
    proof: [
      '0xab12cd34ef56...',
      '0x7890ab12cd34...',
      '0xef56ab12cd34...',
      '0x1234567890ab...',
    ],
    verified: true,
    verifiedOnChain: true,
    transactionSignature: '5KtN3dJ1...',
    timestamp: subHours(2),
  },
  'match-8': {
    matchId: 'match-8',
    result: 'Japan 1 - 1 Senegal',
    score: '1-1',
    merkleRoot: '0x4e9d2c8f1a6b3...',
    proof: [
      '0xcd34ef56ab12...',
      '0x9012ab34cd56...',
      '0xab12cd34ef78...',
    ],
    verified: true,
    verifiedOnChain: true,
    transactionSignature: '7GhP2sY...',
    timestamp: subHours(10),
  },
};

export const poolDistributions: Record<string, PoolDistribution[]> = {
  'match-6': [
    { outcome: 'Uruguay', percentage: 45, amount: 22500, color: '#00ff88' },
    { outcome: 'Draw', percentage: 28, amount: 14000, color: '#f59e0b' },
    { outcome: 'Denmark', percentage: 27, amount: 13500, color: '#3b82f6' },
  ],
  'match-7': [
    { outcome: 'Croatia', percentage: 52, amount: 26000, color: '#00ff88' },
    { outcome: 'Draw', percentage: 22, amount: 11000, color: '#f59e0b' },
    { outcome: 'Mexico', percentage: 26, amount: 13000, color: '#3b82f6' },
  ],
};

// Helper to get match by ID
export function getMatchById(id: string): Match | undefined {
  return matches.find(m => m.id === id);
}

// Helper to get market by ID
export function getMarketById(id: string): Market | undefined {
  return markets.find(m => m.id === id);
}

// Helper to get market by match ID
export function getMarketByMatchId(matchId: string): Market | undefined {
  return markets.find(m => m.matchId === matchId);
}
