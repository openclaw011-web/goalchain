/**
 * Markets Router
 *
 * Endpoints:
 *   GET  /api/markets          — List all markets with live odds + pool sizes
 *   GET  /api/markets/:id      — Single market detail with bet distribution
 *   GET  /api/markets/:id/proof — Get TxLINE settlement Merkle proof
 *   POST /api/markets/:id/settle — Trigger settlement (admin)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getLogger } from '../logger.js';
import type { MarketService } from '../services/market.service.js';
import type { TxlineService } from '../services/txline.service.js';
import type { SolanaService } from '../services/solana.service.js';
import { MarketOutcomeSchema } from '../services/market.service.js';

const logger = getLogger();

// ─── Router factory ──────────────────────────────────────────────────────────

export function createMarketsRouter(
  marketService: MarketService,
  txlineService: TxlineService,
  solanaService: SolanaService,
): Router {
  const router = Router();

  // ── GET /api/markets ────────────────────────────────────────────────────

  router.get('/', (_req: Request, res: Response) => {
    try {
      const status = _req.query.status as string | undefined;
      const markets = marketService.getAllMarkets(
        status as 'open' | 'locked' | 'settled' | 'cancelled' | undefined,
      );

      // Enrich with live odds and Solana on-chain pool sizes
      const enrichedMarkets = markets.map((market) => {
        const liveOdds = marketService.getLiveOdds(market.fixtureId);
        return {
          ...market,
          odds: liveOdds ?? market.odds,
          // Pool sizes from on-chain (or DB if mock)
          poolSizes: market.poolSizes,
        };
      });

      res.json({
        success: true,
        data: enrichedMarkets,
        count: enrichedMarkets.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list markets');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /api/markets/:id ────────────────────────────────────────────────

  router.get('/:id', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const market = marketService.getMarket(id);

      if (!market) {
        res.status(404).json({ success: false, error: 'Market not found' });
        return;
      }

      // Get bet distribution
      const bets = marketService.getMarketBets(id);
      const betDistribution = {
        home_win: bets.filter((b) => b.outcome === 'home_win').reduce((s, b) => s + b.amount, 0),
        away_win: bets.filter((b) => b.outcome === 'away_win').reduce((s, b) => s + b.amount, 0),
        draw: bets.filter((b) => b.outcome === 'draw').reduce((s, b) => s + b.amount, 0),
      };

      // Get live odds
      const liveOdds = marketService.getLiveOdds(market.fixtureId);

      // Try to fetch on-chain state if market has a Solana address
      let onChainState = null;
      if (market.solanaMarketAddress) {
        solanaService.getMarketAccount(market.solanaMarketAddress).then((state) => {
          // Fire-and-forget; don't block response
          if (state) {
            logger.debug({ marketId: id, state }, 'On-chain market state fetched');
          }
        }).catch(() => { /* ignore */ });
      }

      res.json({
        success: true,
        data: {
          ...market,
          odds: liveOdds ?? market.odds,
          betDistribution,
          totalBets: bets.length,
          totalVolume: bets.reduce((s, b) => s + b.amount, 0),
          onChainState,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get market');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /api/markets/:id/proof ──────────────────────────────────────────

  router.get('/:id/proof', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const market = marketService.getMarket(id);

      if (!market) {
        res.status(404).json({ success: false, error: 'Market not found' });
        return;
      }

      const proof = await txlineService.fetchMerkleProof(market.fixtureId);

      if (!proof) {
        res.status(404).json({
          success: false,
          error: 'Merkle proof not available yet — match may not be finished',
        });
        return;
      }

      res.json({ success: true, data: proof });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch Merkle proof');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /api/markets/:id/settle ────────────────────────────────────────

  const settleBodySchema = z.object({
    outcome: MarketOutcomeSchema,
    merkleProof: z
      .object({
        root: z.string(),
        proof: z.array(z.string()),
        leaf: z.string(),
      })
      .optional(),
  });

  router.post('/:id/settle', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);

      // Validate body
      const parsed = settleBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: parsed.error.flatten(),
        });
        return;
      }

      const { outcome, merkleProof } = parsed.data;

      // Settle off-chain first
      const settled = marketService.settleMarketManually(id, outcome);
      if (!settled) {
        res.status(400).json({
          success: false,
          error: 'Market could not be settled — check status and try again',
        });
        return;
      }

      // If we have a Solana market address and optional merkle proof, settle on-chain
      const market = marketService.getMarket(id);
      let txSignature = null;

      if (market?.solanaMarketAddress && merkleProof) {
        const outcomeIndex = ['home_win', 'away_win', 'draw'].indexOf(outcome);
        const txResult = await solanaService.settleMarket(
          market.solanaMarketAddress,
          outcomeIndex,
          merkleProof as { root: string; proof: string[]; leaf: string },
        );
        txSignature = txResult?.signature ?? null;
      }

      logger.info({ marketId: id, outcome, txSignature }, 'Market settled via admin');

      res.json({
        success: true,
        data: {
          marketId: id,
          outcome,
          txSignature,
          settled: true,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to settle market');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  return router;
}
