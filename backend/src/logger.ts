/**
 * Shared Logger
 *
 * Wraps pino with structured JSON logging. Provides a single logger instance
 * shared across all modules to avoid circular dependencies.
 */

import pino from 'pino';
import { config } from './config.js';

let loggerInstance: pino.Logger | null = null;

/**
 * Create or return the singleton logger.
 */
export function createLogger(opts?: { name?: string; level?: string }): pino.Logger {
  if (loggerInstance && !opts) return loggerInstance;

  const level = opts?.level ?? config.logLevel;
  const name = opts?.name ?? 'worldcup-predict';

  const logger = pino({
    name,
    level,
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
  });

  if (!opts) {
    loggerInstance = logger;
  }

  return logger;
}

/** Get the global shared logger (created on first call). */
export function getLogger(): pino.Logger {
  return createLogger();
}
