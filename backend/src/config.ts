/**
 * Application Config
 *
 * Loads environment variables from .env (via dotenv) and exports a typed
 * config object. Falls back to sensible defaults for local development.
 */

import * as dotenv from 'dotenv';

// Load .env from CWD (project root)
dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  // TxLINE API
  txlineApiBase: process.env.TXLINE_API_BASE || 'https://txline-dev.txodds.com/api',
  txlineJwt: process.env.TXLINE_JWT || 'mock-jwt-for-development',
  txlineApiToken: process.env.TXLINE_API_TOKEN || 'mock-api-token-for-development',

  // Database
  databasePath: process.env.DATABASE_PATH || './data/worldcup.db',

  // Solana
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  solanaKeeperPrivateKey: process.env.SOLANA_KEEPER_PRIVATE_KEY || '',
  solanaProgramId: process.env.SOLANA_PROGRAM_ID || 'C5vNdxLcaMriywhQJzv3Dv8PKDfkfnKWHvqCVnqgEQE5',

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // WebSocket
  wsHeartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10),

  // Market scheduling
  fixturePollInterval: parseInt(process.env.FIXTURE_POLL_INTERVAL || '60000', 10),
  marketCreationLookahead: parseInt(process.env.MARKET_CREATION_LOOKAHEAD || '86400000', 10),
} as const;

export type Config = typeof config;
