// OTel SDK must be initialised before any other imports.
import './tracer';

import { writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import type { Server } from 'http';
import type { Socket } from 'net';

import { createApp } from './app';
import { createHttpServer } from './server';
import { closeHttpServerAndDrain } from './http-shutdown';
import { initializeServices } from './services';
import { config, assertConfig } from './config';
import { prismaWrite as prisma, prismaRead, prismaBackfill } from './db';
import { closeRawPool } from './db/raw';
import { scheduler } from './scheduler/cron-scheduler';
import { stopIndexerService } from './indexer/indexer';
import { stopP2pNode } from './p2p';
import { shutdownWebSocketServer } from './ws/websocketServer';
import { stopMevPredictionPublisher } from './ws/mevPredictBroadcaster';
import { stopBridgeWorker } from './bridge-tracker';
import { feedOrchestrator } from './feed/orchestrator';
import { stopPriceUpdater } from './services/pricing';
import { cacheClose } from './cache';
import { dbConnectionStatus, cacheBackendStatus } from './metrics';
import { eventBus } from './events/eventBus';
import { logger } from './logger';
import { featureFlags } from './feature-flags';
import { reconcileOrphanedFuzzJobs } from './fuzzing/fuzzer';
import { registerScheduledScanner } from './scanning/scheduled-scanner';
import { stopWebhookDeliveryWorker } from './webhooks/dispatcher';
import { stopGasAnalyticsScheduler } from './indexer/gasAnalytics';

let isShuttingDown = false;
const SERVICE_START_TIME = Date.now();
let wssRef: ReturnType<typeof createHttpServer>['wssRef'] | null = null;
let serverRef: Server | null = null;
const activeConnections = new Set<Socket>();

const SHUTDOWN_TIMEOUT_MS = config.shutdownTimeoutMs;
// Default to /tmp/state so the path is writable in read-only container filesystems.
// /tmp is already mounted as a tmpfs in the Compose security profile.
const STATE_DUMP_PATH = config.stateDumpPath;

// Names of optional services that are disabled, reported by /ready.
const disabledServices: string[] = [];

async function saveShutdownState(): Promise<void> {
  try {
    await mkdir(STATE_DUMP_PATH, { recursive: true });
    const state = {
      shutdownTimestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
    await writeFile(
      resolve(STATE_DUMP_PATH, 'shutdown-state.json'),
      JSON.stringify(state, null, 2),
    );
  } catch (err) {
    logger.warn('Failed to save shutdown state', { error: String(err) });
  }
}

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn('[shutdown] Already shutting down, forcing exit');
    process.exit(1);
  }
  isShuttingDown = true;
  logger.info(`[shutdown] Received ${signal}, starting graceful shutdown`);

  const forceExit = setTimeout(() => {
    logger.error(`[shutdown] Forced exit after ${SHUTDOWN_TIMEOUT_MS}ms`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  let shutdownFailed = false;
  const runShutdownStep = async (name: string, action: () => Promise<void> | void) => {
    try {
      await action();
      logger.info(`[shutdown] ${name} stopped`);
    } catch (err) {
      shutdownFailed = true;
      logger.error(`[shutdown] Failed to stop ${name}`, { error: String(err) });
    }
  };

  try {
    if (wssRef) {
      await runShutdownStep('WebSocket clients', shutdownWebSocketServer);
    }
    await runShutdownStep('HTTP server and in-flight requests', async () => {
      if (serverRef) await closeHttpServerAndDrain(serverRef, activeConnections);
      wssRef?.close();
    });

    await runShutdownStep('Indexer worker', stopIndexerService);
    await runShutdownStep('Gas analytics scheduler', stopGasAnalyticsScheduler);
    await runShutdownStep('Webhook delivery worker', stopWebhookDeliveryWorker);
    await runShutdownStep('Bridge worker', stopBridgeWorker);
    await runShutdownStep('Price updater', stopPriceUpdater);
    await runShutdownStep('Feed orchestrator', () => feedOrchestrator.shutdown());
    await runShutdownStep('Scheduled workers', () =>
      scheduler.gracefulShutdown(Math.max(0, SHUTDOWN_TIMEOUT_MS - 5_000)),
    );
    await runShutdownStep('MEV prediction publisher', stopMevPredictionPublisher);

    await stopP2pNode().catch((err) =>
      logger.warn('[shutdown] Error stopping p2p node', { error: String(err) }),
    );

    await saveShutdownState();
    logger.info('[shutdown] State saved');

    await runShutdownStep('Cache connection', async () => {
      await cacheClose();
      cacheBackendStatus.set(0);
    });
    await runShutdownStep('Event bus', () => eventBus.close());
    await runShutdownStep('Raw PostgreSQL pool', closeRawPool);
    await runShutdownStep('Database connections', async () => {
      await Promise.all([
        prismaRead.$disconnect(),
        prisma.$disconnect(),
        prismaBackfill.$disconnect(),
      ]);
      dbConnectionStatus.set(0);
    });

    clearTimeout(forceExit);
    logger.info(
      shutdownFailed
        ? '[shutdown] Shutdown completed with errors'
        : '[shutdown] Graceful shutdown complete',
    );
    process.exit(shutdownFailed ? 1 : 0);
  } catch (err) {
    logger.error('[shutdown] Error during graceful shutdown', { error: String(err) });
    clearTimeout(forceExit);
    process.exit(1);
  }
}

function registerShutdownHandlers(): void {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('[shutdown] Uncaught exception', { error: err.message, stack: err.stack });
    gracefulShutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('[shutdown] Unhandled rejection', { error: String(reason) });
    gracefulShutdown('unhandledRejection');
  });
}

async function validateStateDumpPath(): Promise<void> {
  try {
    await mkdir(STATE_DUMP_PATH, { recursive: true });
    const testFile = resolve(STATE_DUMP_PATH, '.write-test');
    await writeFile(testFile, '');
    const { unlink } = await import('fs/promises');
    await unlink(testFile).catch(() => {});
  } catch (err) {
    logger.warn('State dump path is not writable; shutdown state will not be persisted', {
      path: STATE_DUMP_PATH,
      error: String(err),
    });
  }
}

async function main() {
  assertConfig();

  registerShutdownHandlers();
  await validateStateDumpPath();

  // Warm the feature-flag cache (DB-backed toggles + schema availability) before
  // the HTTP/WebSocket servers attach. Best-effort: on failure the flags fall
  // back to env vars + registry defaults, so boot never blocks on the flag DB.
  await featureFlags.bootstrap();

  const app = createApp({
    isShuttingDown: () => isShuttingDown,
    serviceStartTime: SERVICE_START_TIME,
    disabledServices,
  });

  const server = createHttpServer(app, disabledServices);
  wssRef = server.wssRef;
  serverRef = server.httpServer;
  server.httpServer.on('connection', (socket) => {
    activeConnections.add(socket);
    socket.on('close', () => {
      activeConnections.delete(socket);
    });
  });

  await initializeServices(disabledServices);

  // Reconcile any orphaned fuzzing jobs from previous startup
  await reconcileOrphanedFuzzJobs();
  registerScheduledScanner();

  server.httpServer.listen(config.port, () => {
    logger.info('Soroban Explorer API started', { port: config.port });
  });
}

main().catch((err) => logger.error('Main startup failed', { error: String(err) }));
