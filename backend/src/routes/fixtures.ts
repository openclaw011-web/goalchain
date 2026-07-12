/**
 * Fixtures Router
 *
 * Endpoints:
 *   GET /api/fixtures — List upcoming World Cup fixtures from TxLINE
 *
 * Returns fixtures from the local SQLite cache, which is kept up-to-date
 * by the TxLINE service's polling loop.
 */

import { Router, Request, Response } from 'express';
import { getLogger } from '../logger.js';
import type { DbBridge } from '../db/schema.js';

const logger = getLogger();

// ─── Router factory ──────────────────────────────────────────────────────────

export function createFixturesRouter(db: DbBridge): Router {
  const router = Router();

  // ── GET /api/fixtures ───────────────────────────────────────────────────

  router.get('/', (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;

      // Fixtures are returned from the SQLite cache (populated by TxLINE polling)
      const fixtures = db.getFixtures(status);

      // Parse metadata JSON fields
      const parsed = (fixtures as Array<Record<string, unknown>>).map((f) => ({
        id: f.id,
        sport: f.sport,
        league: f.league,
        homeTeam: f.home_team,
        awayTeam: f.away_team,
        startTime: f.start_time,
        status: f.status,
        metadata: typeof f.metadata === 'string' ? safeParseJson(f.metadata as string) : f.metadata,
        updatedAt: f.updated_at,
      }));

      res.json({
        success: true,
        data: parsed,
        count: parsed.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list fixtures');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  return router;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeParseJson(str: string): Record<string, unknown> | null {
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    return null;
  }
}
