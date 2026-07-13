/**
 * World Cup Prediction Market — Backend Server
 *
 * Main entry point. Sets up:
 *  - Express HTTP server
 *  - SQLite database (init + bridge)
 *  - TxLINE SSE ingestion service
 *  - Market management service
 *  - Solana integration service
 *  - HTTP API routes (markets, fixtures, live/stats)
 *  - WebSocket relay for real-time events
 *
 * Usage:
 *   npm run dev    — Development with hot reload (tsx watch)
 *   npm run build  — Compile TypeScript
 *   npm start      — Run compiled JS
 */

import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from './config.js';
import { getLogger } from './logger.js';
import { initDatabase, createDbBridge } from './db/schema.js';
import { TxlineService } from './services/txline.service.js';
import { MarketService } from './services/market.service.js';
import { SolanaService } from './services/solana.service.js';
import { KeeperService } from './services/keeper.service.js';
import { createMarketsRouter } from './routes/markets.js';
import { createFixturesRouter } from './routes/fixtures.js';
import { createLiveRouter } from './routes/live.js';
import type { WsMessage } from './types/txline.js';

// ─── Logger ──────────────────────────────────────────────────────────────────

const logger = getLogger();

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info({ nodeEnv: config.nodeEnv }, 'Starting World Cup Prediction Market backend');

  // 1. Database
  initDatabase();
  const db = createDbBridge();
  logger.info('Database initialised');

  // 2. Services
  const txlineService = new TxlineService();
  txlineService.setDb(db);

  const marketService = new MarketService(db);
  const solanaService = new SolanaService();

  // Keeper bot: pushes DB settlements on-chain via the TxLINE proof CPI.
  const keeperService = new KeeperService(marketService, txlineService, solanaService);
  keeperService.start();

  // Connect TxLINE events → Market service
  txlineService.on('event:match_start', (event) => marketService.processTxlineEvent(event));
  txlineService.on('event:match_end', (event) => marketService.processTxlineEvent(event));
  txlineService.on('event:odds_update', (event) => marketService.processTxlineEvent(event));
  txlineService.on('event:goal', (event) => marketService.processTxlineEvent(event));
  txlineService.on('event:halftime', (event) => marketService.processTxlineEvent(event));

  // Connect fixture polling → market creation
  txlineService.on('fixtures:updated', (fixtures: Array<{
    id: string; homeTeam: string; awayTeam: string; startTime: string; status: string;
  }>) => {
    marketService.processFixtures(fixtures);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Express app + HTTP server
  // ────────────────────────────────────────────────────────────────────────────

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Request logging middleware
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, url: req.url }, 'Request');
    next();
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      txline: txlineService.getStatus(),
      keeper: keeperService.getStatus(),
    });
  });

  // Routes
  app.use('/api/markets', createMarketsRouter(marketService, txlineService, solanaService));
  app.use('/api/fixtures', createFixturesRouter(db));
  app.use('/api', createLiveRouter(marketService, txlineService));

  // Global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. HTTP server + WebSocket
  // ────────────────────────────────────────────────────────────────────────────

  const server = http.createServer(app);

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req) => {
    const clientIp = req.socket.remoteAddress ?? 'unknown';
    logger.info({ clientIp }, 'WebSocket client connected');

    // Send welcome message
    sendWsMessage(ws, {
      channel: 'market_updates',
      event: 'connected',
      data: { message: 'Connected to World Cup Prediction Market' },
      timestamp: new Date().toISOString(),
    });

    // Handle incoming messages (client subscriptions)
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'subscribe' && msg.channel) {
          logger.info({ clientIp, channel: msg.channel }, 'Client subscribed to channel');
          // We could implement per-channel subscriptions here
          // For now, all clients receive all broadcast channels
        }
      } catch {
        logger.warn({ clientIp, raw: raw.toString().substring(0, 200) }, 'Invalid WS message');
      }
    });

    ws.on('close', () => {
      logger.info({ clientIp }, 'WebSocket client disconnected');
    });

    ws.on('error', (error) => {
      logger.error({ error, clientIp }, 'WebSocket client error');
    });

    // Heartbeat / ping-pong
    const heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(heartbeatInterval);
      }
    }, config.wsHeartbeatInterval);

    ws.on('close', () => clearInterval(heartbeatInterval));
  });

  // ── Broadcast TxLINE events to all WS clients ────────────────────────────

  const broadcast = (channel: string, event: string, data: unknown): void => {
    const msg: WsMessage = {
      channel: channel as WsMessage['channel'],
      event,
      data,
      timestamp: new Date().toISOString(),
    };
    const payload = JSON.stringify(msg);

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  };

  // Wire market service events → WS broadcast
  marketService.on('ws:odds_update', (payload: { channel: string; event: string; data: unknown }) => {
    broadcast(payload.channel, payload.event, payload.data);
  });

  marketService.on('ws:market_update', (payload: { channel: string; event: string; data: unknown }) => {
    broadcast(payload.channel, payload.event, payload.data);
  });

  // Wire TxLINE score events → WS scores channel
  const scoreEventTypes = ['event:goal', 'event:card', 'event:match_start', 'event:match_end',
    'event:halftime', 'event:substitution'] as const;
  for (const eventType of scoreEventTypes) {
    txlineService.on(eventType, (event: { matchId: string; type: string; data: unknown; timestamp: string }) => {
      broadcast('scores', event.type, {
        matchId: event.matchId,
        data: event.data,
        timestamp: event.timestamp,
      });
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 5. Start TxLINE service (connects SSE streams + fixture polling)
  // ────────────────────────────────────────────────────────────────────────────

  txlineService.start();

  // Override fixture handler to also feed MarketService
  // (The txlineService polls fixtures autonomously; we duplicate the data to market service)

  // Patch: we already have fixture polling inside txline service that stores in DB.
  // After each poll, the market service processes new fixtures.
  // We'll use a periodic check instead.

  // Periodically scan scheduled fixtures and create markets. processFixtureRows
  // owns the row→input mapping (incl. league/metadata) so the World-Cup filter
  // in processFixtures sees the competition info — otherwise every in-window
  // fixture, including non-WC friendlies, would get a market.
  const marketCheckInterval = setInterval(() => {
    marketService.processFixtureRows(
      db.getFixtures('scheduled') as Array<{
        id: string; home_team: string; away_team: string; start_time: string; status: string;
        league: string; metadata: string | null;
      }>,
    );
  }, config.fixturePollInterval);

  // ────────────────────────────────────────────────────────────────────────────
  // 6. Start server
  // ────────────────────────────────────────────────────────────────────────────

  server.listen(config.port, config.host, () => {
    logger.info(
      { port: config.port, host: config.host, wsPath: '/ws' },
      'Server started',
    );
    logger.info(`API:       http://${config.host}:${config.port}/api`);
    logger.info(`WS:        ws://${config.host}:${config.port}/ws`);
    logger.info(`Health:    http://${config.host}:${config.port}/health`);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 7. Graceful shutdown
  // ────────────────────────────────────────────────────────────────────────────

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    clearInterval(marketCheckInterval);
    txlineService.stop();
    wss.close();
    server.close(() => {
      logger.info('Server shut down gracefully');
      process.exit(0);
    });

    // Force exit after 10s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sendWsMessage(ws: WebSocket, msg: WsMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main().catch((error) => {
  logger.error({ error }, 'Fatal error during startup');
  process.exit(1);
});
