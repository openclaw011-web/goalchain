import { create } from 'zustand';
import { Market, Bet, LiveScore, LeaderboardEntry } from './types';
import { markets as mockMarkets, liveScores as mockLiveScores, leaderboard as mockLeaderboard, bets as mockBets } from './mock-data';

interface AppState {
  // Markets
  markets: Market[];
  selectedMarket: Market | null;
  setMarkets: (markets: Market[]) => void;
  setSelectedMarket: (market: Market | null) => void;

  // Live scores
  liveScores: LiveScore[];
  setLiveScores: (scores: LiveScore[]) => void;
  updateLiveScore: (score: LiveScore) => void;

  // Bets
  bets: Bet[];
  addBet: (bet: Bet) => void;
  setBets: (bets: Bet[]) => void;

  // Leaderboard
  leaderboard: LeaderboardEntry[];
  setLeaderboard: (entries: LeaderboardEntry[]) => void;

  // UI State
  isConnecting: boolean;
  setIsConnecting: (val: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterStatus: string;
  setFilterStatus: (status: string) => void;

  // Initialize with mock data
  hydrate: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state with mock data
  markets: mockMarkets,
  selectedMarket: null,
  setMarkets: (markets) => set({ markets }),
  setSelectedMarket: (market) => set({ selectedMarket: market }),

  liveScores: mockLiveScores,
  setLiveScores: (scores) => set({ liveScores: scores }),
  updateLiveScore: (score) =>
    set((state) => ({
      liveScores: state.liveScores.map((s) => (s.id === score.id ? score : s)),
    })),

  bets: mockBets,
  addBet: (bet) => set((state) => ({ bets: [bet, ...state.bets] })),
  setBets: (bets) => set({ bets }),

  leaderboard: mockLeaderboard,
  setLeaderboard: (entries) => set({ leaderboard: entries }),

  isConnecting: false,
  setIsConnecting: (val) => set({ isConnecting: val }),
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  filterStatus: 'all',
  setFilterStatus: (status) => set({ filterStatus: status }),

  hydrate: () =>
    set({
      markets: mockMarkets,
      liveScores: mockLiveScores,
      leaderboard: mockLeaderboard,
      bets: mockBets,
    }),
}));
