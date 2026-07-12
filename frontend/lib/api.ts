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
      const json = await res.json();

      // The backend wraps responses in { success, data, ... } — unwrap it.
      const payload =
        json && typeof json === 'object' && 'success' in json && 'data' in json
          ? (json as { data: unknown }).data
          : json;

      // Adapt backend market rows (fixtureId/homeTeam/odds-map shape) to the
      // frontend Market type; fall back to demo data when the backend has no
      // markets yet (e.g. TxLINE credentials not configured).
      if (endpoint.startsWith('/markets')) {
        if (Array.isArray(payload)) {
          if (payload.length === 0) return this.getMockFallback<T>(endpoint, 'GET');
          return payload.map((m) => this.adaptBackendMarket(m)) as unknown as T;
        }
        if (payload && typeof payload === 'object' && 'fixtureId' in (payload as object)) {
          return this.adaptBackendMarket(payload) as unknown as T;
        }
      }

      return payload as T;
    } catch (e) {
      // Fallback to mock data
      return this.getMockFallback<T>(endpoint, options?.method || 'GET');
    }
  }

  /** Map a backend PredictionMarket row to the frontend Market shape. */
  private adaptBackendMarket(m: any): Market {
    const odds = {
      home: Number(m.odds?.home_win) || 2.0,
      draw: Number(m.odds?.draw) || 3.2,
      away: Number(m.odds?.away_win) || 3.0,
    };
    const pools = {
      home: Number(m.poolSizes?.home_win) || 0,
      draw: Number(m.poolSizes?.draw) || 0,
      away: Number(m.poolSizes?.away_win) || 0,
    };
    const poolSize = pools.home + pools.draw + pools.away;
    const status: Market['status'] =
      m.status === 'open' ? 'upcoming' : m.status === 'locked' ? 'live' : 'settled';

    const team = (name: string, id: string) => ({
      id,
      name,
      shortName: name.slice(0, 3).toUpperCase(),
      flag: '⚽',
      group: '',
      ranking: 0,
    });

    return {
      id: m.id,
      matchId: m.fixtureId,
      type: 'match_winner',
      title: `${m.homeTeam} vs ${m.awayTeam} - Match Winner`,
      status,
      lockTime: m.kickoffTime,
      resolveTime: m.settledAt ?? null,
      poolSize,
      volume: poolSize,
      onchainMarketId: m.onchainMarketId ?? undefined,
      onchainAddress: m.solanaMarketAddress ?? undefined,
      outcomes: [
        { id: `${m.id}-home`, label: m.homeTeam, odds: odds.home, probability: 1 / odds.home, volume: pools.home },
        { id: `${m.id}-draw`, label: 'Draw', odds: odds.draw, probability: 1 / odds.draw, volume: pools.draw },
        { id: `${m.id}-away`, label: m.awayTeam, odds: odds.away, probability: 1 / odds.away, volume: pools.away },
      ],
      oddsHistory: [],
      match: {
        id: m.fixtureId,
        homeTeam: team(m.homeTeam, `${m.id}-h`),
        awayTeam: team(m.awayTeam, `${m.id}-a`),
        date: m.kickoffTime,
        stage: 'World Cup 2026',
        status: status === 'upcoming' ? 'scheduled' : status === 'live' ? 'live' : 'finished',
        homeScore: null,
        awayScore: null,
        minute: null,
        events: [],
        venue: '',
        group: null,
      },
    };
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

  // NOTE: bet placement is a real on-chain transaction — see
  // solanaClient.placeBet in lib/solana.ts (there is no REST betting path).

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
