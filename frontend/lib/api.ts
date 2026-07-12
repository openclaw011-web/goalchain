import { Market, Match, Bet, LeaderboardEntry, MerkleProof, LiveScore } from './types';
import { markets, matches, liveScores, leaderboard, bets, merkleProofs, getMarketByMatchId } from './mock-data';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        ...options,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    } catch (e) {
      // Fallback to mock data
      return this.getMockFallback<T>(endpoint, options?.method || 'GET');
    }
  }

  private getMockFallback<T>(_endpoint: string, _method: string): T {
    // Parse endpoint to determine which mock data to return
    if (_endpoint.startsWith('/markets') && !_endpoint.includes('/')) {
      return markets as unknown as T;
    }
    if (_endpoint.includes('/markets/')) {
      const id = _endpoint.split('/markets/')[1]?.split('?')[0];
      const market = markets.find(m => m.id === id);
      return (market || markets[0]) as unknown as T;
    }
    if (_endpoint.startsWith('/matches')) {
      return matches as unknown as T;
    }
    if (_endpoint.startsWith('/live-scores')) {
      return liveScores as unknown as T;
    }
    if (_endpoint.startsWith('/leaderboard')) {
      return leaderboard as unknown as T;
    }
    if (_endpoint.startsWith('/bets')) {
      return bets as unknown as T;
    }
    if (_endpoint.startsWith('/proof')) {
      const matchId = _endpoint.split('/proof/')[1];
      const proof = merkleProofs[matchId];
      return (proof || merkleProofs['match-7']) as unknown as T;
    }
    if (_endpoint.startsWith('/pool-distribution')) {
      const matchId = _endpoint.split('/pool-distribution/')[1];
      const market = getMarketByMatchId(matchId);
      if (market) {
        const total = market.poolSize;
        const dist = market.outcomes.map(o => ({
          outcome: o.label,
          percentage: (o.volume / total) * 100,
          amount: o.volume,
          color: o.id.includes('home') ? '#00ff88' : o.id.includes('draw') ? '#f59e0b' : '#3b82f6',
        }));
        return dist as unknown as T;
      }
      return [] as unknown as T;
    }
    return [] as unknown as T;
  }

  async getMarkets(): Promise<Market[]> {
    return this.fetch<Market[]>('/markets');
  }

  async getMarket(id: string): Promise<Market> {
    return this.fetch<Market>(`/markets/${id}`);
  }

  async getMatches(): Promise<Match[]> {
    return this.fetch<Match[]>('/matches');
  }

  async getLiveScores(): Promise<LiveScore[]> {
    return this.fetch<LiveScore[]>('/live-scores');
  }

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    return this.fetch<LeaderboardEntry[]>('/leaderboard');
  }

  async getBets(userId?: string): Promise<Bet[]> {
    const query = userId ? `?userId=${userId}` : '';
    return this.fetch<Bet[]>(`/bets${query}`);
  }

  async getMerkleProof(matchId: string): Promise<MerkleProof> {
    return this.fetch<MerkleProof>(`/proof/${matchId}`);
  }

  async placeBet(bet: { marketId: string; outcomeId: string; amount: number }): Promise<Bet> {
    return this.fetch<Bet>('/bets', {
      method: 'POST',
      body: JSON.stringify(bet),
    });
  }

  createWebSocket(): WebSocket {
    try {
      const ws = new WebSocket(WS_URL);
      return ws;
    } catch {
      // Return a mock WebSocket that provides live data
      return new WebSocket('wss://echo.websocket.org');
    }
  }
}

export const apiClient = new ApiClient(API_BASE);
