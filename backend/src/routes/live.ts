/**
 * Live Router & Stats/Leaderboard Endpoints
 *
 * Endpoints:
 *   GET /api/live        — Live match scores SSE endpoint (relay to frontend)
 *   GET /api/stats       — Platform stats (total volume, markets, active bets)
 *   GET /api/leaderboard — Top predictors by winnings
 */

import { Router, Request, Response } from 'express';
import { getLogger } from '../logger.js';
import type { MarketService } from '../services/market.service.js';
import type { TxlineService } from '../services/txline.service.js';

const logger = getLogger();

// ─── Router factory ──────────────────────────────────────────────────────────

export function createLiveRouter(
  marketService: MarketService,
  txlineService: TxlineService,
): Router {
  const router = Router();

  // ── GET /api/live (SSE endpoint) ────────────────────────────────────────
  //
  // This endpoint uses Server-Sent Events to push live match scores to the
  // frontend. It relays the latest events from the TxLINE ingestion buffer.
  //
  // The frontend connects using:
  //   const evtSource = new EventSource('/api/live');
  //   evtSource.addEventListener('score', (e) => { ... });
  //   evtSource.addEventListener('odds', (e) => { ... });

  router.get('/live', (req: Request, res: Response) => {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',         // Disable nginx buffering
    });

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ event: 'connected', timestamp: new Date().toISOString() })}\n\n`);

    logger.info('SSE client connected to /api/live');

    // Send recent events as a replay on connection
    const recentEvents = txlineService.getRecentEvents(20);
    for (const event of recentEvents) {
      const ssePayload = {
        event: event.type,
        matchId: event.matchId,
        data: event.data,
        timestamp: event.timestamp,
      };
      res.write(`data: ${JSON.stringify(ssePayload)}\n\n`);
    }

    // Listen for new events from market service (which relays from txline service)
    const onOddsUpdate = (payload: { channel: string; event: string; data: Record<string, unknown> }) => {
      if (res.destroyed) return;
      const ssePayload = {
        event: 'odds_changed',
        ...payload.data,
        timestamp: new Date().toISOString(),
      };
      res.write(`data: ${JSON.stringify(ssePayload)}\n\n`);
    };

    const onMarketUpdate = (payload: { channel: string; event: string; data: Record<string, unknown> }) => {
      if (res.destroyed) return;
      const ssePayload = {
        event: payload.event,
        ...payload.data,
        timestamp: new Date().toISOString(),
      };
      res.write(`data: ${JSON.stringify(ssePayload)}\n\n`);
    };

    // Also listen directly on txline service for score events
    const onScoreEvent = (event: { matchId: string; type: string; data: unknown; timestamp: string }) => {
      if (res.destroyed) return;
      const ssePayload = {
        event: event.type,
        matchId: event.matchId,
        data: event.data,
        timestamp: event.timestamp,
      };
      res.write(`data: ${JSON.stringify(ssePayload)}\n\n`);
    };

    // Register listeners
    marketService.on('ws:odds_update', onOddsUpdate);
    marketService.on('ws:market_update', onMarketUpdate);
    txlineService.on('event:goal', onScoreEvent);
    txlineService.on('event:card', onScoreEvent);
    txlineService.on('event:match_start', onScoreEvent);
    txlineService.on('event:match_end', onScoreEvent);
    txlineService.on('event:halftime', onScoreEvent);

    // Clean up on disconnect
    req.on('close', () => {
      logger.info('SSE client disconnected from /api/live');
      marketService.off('ws:odds_update', onOddsUpdate);
      marketService.off('ws:market_update', onMarketUpdate);
      txlineService.off('event:goal', onScoreEvent);
      txlineService.off('event:card', onScoreEvent);
      txlineService.off('event:match_start', onScoreEvent);
      txlineService.off('event:match_end', onScoreEvent);
      txlineService.off('event:halftime', onScoreEvent);
    });

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      if (res.destroyed) {
        clearInterval(heartbeat);
        return;
      }
      res.write(': heartbeat\n\n'); // SSE comment — keeps connection alive
    }, 30_000);

    req.on('close', () => clearInterval(heartbeat));
  });

  // ── GET /api/stats ──────────────────────────────────────────────────────

  router.get('/stats', (_req: Request, res: Response) => {
    try {
      const stats = marketService.getStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get stats');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /api/leaderboard ────────────────────────────────────────────────

  router.get('/leaderboard', (req: Request, res: Response) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
      const leaderboard = marketService.getLeaderboard(limit);

      res.json({
        success: true,
        data: leaderboard,
        count: leaderboard.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get leaderboard');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  return router;
}
