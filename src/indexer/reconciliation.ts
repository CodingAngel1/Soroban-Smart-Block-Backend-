/**
 * Issue #50 — Internal Reconciliation & Audit Cron Job
 *
 * Daily script that cross-references local DB transaction counts and ledger
 * sequences against Horizon to detect missing blocks or data gaps.
 * Logs discrepancies and triggers alerts (Slack/webhook if configured).
 */
import axios from 'axios';
import { prismaRead as prisma } from '../db';
import { config } from '../config';
import { logger } from '../logger';
import { triggerAutomatedGapRepair } from './repair';
import { scheduler } from '../scheduler/cron-scheduler';
import { fetchEvents } from './rpc';

const HEARTBEAT_ID = 'indexer:reconciliation-sweep';

export interface EventCountDiscrepancy {
  ledgerSequence: number;
  indexedCount: number;
  upstreamCount: number;
}

export interface ReconciliationReport {
  timestamp: string;
  localLedgerCount: number;
  localTxCount: number;
  localEventCount: number;
  upstreamEventCount: number;
  eventCheckStart: number;
  eventCheckEnd: number;
  eventCountDiscrepancies: EventCountDiscrepancy[];
  horizonLatestLedger: number;
  localLatestLedger: number;
  ledgerGap: number;
  missingLedgerRanges: Array<[number, number]>;
  discrepancies: string[];
  healthy: boolean;
}

export function findEventCountDiscrepancies(
  indexedCounts: Array<{ ledgerSequence: number; count: number }>,
  upstreamCounts: Map<number, number>,
): EventCountDiscrepancy[] {
  const indexedByLedger = new Map(
    indexedCounts.map(({ ledgerSequence, count }) => [ledgerSequence, count]),
  );
  const ledgerSequences = new Set([...indexedByLedger.keys(), ...upstreamCounts.keys()]);

  return [...ledgerSequences]
    .sort((a, b) => a - b)
    .flatMap((ledgerSequence) => {
      const indexedCount = indexedByLedger.get(ledgerSequence) ?? 0;
      const upstreamCount = upstreamCounts.get(ledgerSequence) ?? 0;
      return indexedCount === upstreamCount
        ? []
        : [{ ledgerSequence, indexedCount, upstreamCount }];
    });
}

/**
 * Fetch the latest ledger sequence from Horizon.
 */
async function getHorizonLatestLedger(): Promise<number> {
  const res = await axios.get(`${config.horizonUrl}/ledgers?order=desc&limit=1`, {
    timeout: 10_000,
  });
  const records = res.data?._embedded?.records ?? [];
  if (!records.length) throw new Error('No ledger records from Horizon');
  return Number(records[0].sequence);
}

/**
 * Find gaps in the locally indexed ledger sequences.
 * Returns ranges [start, end] of missing ledgers.
 */
async function findLedgerGaps(
  minLedger: number,
  maxLedger: number,
): Promise<Array<[number, number]>> {
  if (maxLedger <= minLedger) return [];

  // Fetch all indexed ledger sequences in range
  const indexed: Array<{ sequence: number }> = await prisma.ledger.findMany({
    where: { sequence: { gte: minLedger, lte: maxLedger } },
    select: { sequence: true },
    orderBy: { sequence: 'asc' },
  });

  const indexedSet = new Set(indexed.map((l) => l.sequence));
  const gaps: Array<[number, number]> = [];
  let gapStart: number | null = null;

  for (let seq = minLedger; seq <= maxLedger; seq++) {
    if (!indexedSet.has(seq)) {
      if (gapStart === null) gapStart = seq;
    } else if (gapStart !== null) {
      gaps.push([gapStart, seq - 1]);
      gapStart = null;
    }
  }
  if (gapStart !== null) gaps.push([gapStart, maxLedger]);

  return gaps;
}

/**
 * Send an alert via Slack webhook or log to stderr.
 */
async function sendAlert(message: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL ?? process.env.ALERT_WEBHOOK_URL;

  if (webhookUrl) {
    try {
      await axios.post(
        webhookUrl,
        { text: `🚨 Soroban Indexer Alert\n${message}` },
        { timeout: 5_000 },
      );
      logger.info('[reconciliation] Alert sent to webhook');
    } catch (err) {
      logger.error('[reconciliation] Failed to send webhook alert:', err);
    }
  } else {
    // Fallback: log prominently to stderr
    logger.error(`\n${'='.repeat(60)}\n🚨 RECONCILIATION ALERT\n${message}\n${'='.repeat(60)}\n`);
  }
}

/**
 * Run the reconciliation check and return a report.
 * Checks the last `lookbackLedgers` ledgers (default: 1000).
 */
export async function runReconciliation(lookbackLedgers = 1000): Promise<ReconciliationReport> {
  const timestamp = new Date().toISOString();
  const discrepancies: string[] = [];

  logger.info(`[reconciliation] Starting audit at ${timestamp}`);

  // 1. Get local stats
  const [localLedgerCount, localTxCount, localLatestLedgerRow] = await Promise.all([
    prisma.ledger.count(),
    prisma.transaction.count(),
    prisma.ledger.findFirst({ orderBy: { sequence: 'desc' }, select: { sequence: true } }),
  ]);

  const localLatestLedger = localLatestLedgerRow?.sequence ?? 0;

  // 2. Get Horizon latest ledger
  let horizonLatestLedger = 0;
  try {
    horizonLatestLedger = await getHorizonLatestLedger();
  } catch (err) {
    const msg = `Failed to reach Horizon: ${err}`;
    discrepancies.push(msg);
    logger.error(`[reconciliation] ${msg}`);
  }

  // 3. Check ledger gap
  const ledgerGap = horizonLatestLedger > 0 ? horizonLatestLedger - localLatestLedger : 0;
  const MAX_ACCEPTABLE_GAP = 100;

  if (ledgerGap > MAX_ACCEPTABLE_GAP) {
    discrepancies.push(
      `Indexer is ${ledgerGap} ledgers behind Horizon ` +
        `(local: ${localLatestLedger}, horizon: ${horizonLatestLedger})`,
    );
  }

  // 4. Find gaps in recent ledger range
  const lookbackStart = Math.max(1, localLatestLedger - lookbackLedgers);
  const missingLedgerRanges = await findLedgerGaps(lookbackStart, localLatestLedger);

  if (missingLedgerRanges.length > 0) {
    const totalMissing = missingLedgerRanges.reduce((sum, [s, e]) => sum + (e - s + 1), 0);
    discrepancies.push(
      `Found ${missingLedgerRanges.length} gap(s) covering ${totalMissing} missing ledgers ` +
        `in range ${lookbackStart}–${localLatestLedger}`,
    );

    // Automatically trigger gap repair workflow
    logger.info(
      `[reconciliation] Triggering automated repair for ${missingLedgerRanges.length} gap(s)...`,
    );
    try {
      await triggerAutomatedGapRepair(missingLedgerRanges);
    } catch (repairErr) {
      logger.error('[reconciliation] Automated gap repair failed:', repairErr);
    }
  }

  const eventCheckStart = Math.max(1, localLatestLedger - lookbackLedgers + 1);
  const eventCheckEnd =
    horizonLatestLedger > 0 ? Math.min(localLatestLedger, horizonLatestLedger) : 0;
  let localEventCount = 0;
  let upstreamEventCount = 0;
  let eventCountDiscrepancies: EventCountDiscrepancy[] = [];

  if (eventCheckEnd >= eventCheckStart) {
    const indexedEventCounts: Array<{
      ledgerSequence: number;
      _count: { _all: number };
    }> = await prisma.event.groupBy({
      by: ['ledgerSequence'],
      where: { ledgerSequence: { gte: eventCheckStart, lte: eventCheckEnd } },
      _count: { _all: true },
    });
    const indexedCounts = indexedEventCounts.map((entry) => ({
      ledgerSequence: entry.ledgerSequence,
      count: entry._count._all,
    }));
    localEventCount = indexedCounts.reduce((sum, entry) => sum + entry.count, 0);
    try {
      const upstreamEvents = await fetchEvents(eventCheckStart, eventCheckEnd);
      const inRangeEvents = upstreamEvents.filter(
        (event) => event.ledgerSequence >= eventCheckStart && event.ledgerSequence <= eventCheckEnd,
      );
      const upstreamCounts = new Map<number, number>();
      for (const event of inRangeEvents) {
        upstreamCounts.set(
          event.ledgerSequence,
          (upstreamCounts.get(event.ledgerSequence) ?? 0) + 1,
        );
      }
      upstreamEventCount = inRangeEvents.length;
      eventCountDiscrepancies = findEventCountDiscrepancies(indexedCounts, upstreamCounts);

      if (eventCountDiscrepancies.length > 0) {
        discrepancies.push(
          `Found ${eventCountDiscrepancies.length} ledger(s) with indexed event totals that differ from Soroban RPC ` +
            `in range ${eventCheckStart}–${eventCheckEnd}`,
        );
      }
    } catch (err) {
      const message = `Failed to fetch upstream event totals for range ${eventCheckStart}–${eventCheckEnd}: ${err}`;
      discrepancies.push(message);
      logger.error(`[reconciliation] ${message}`);
    }
  }

  const healthy = discrepancies.length === 0;

  const report: ReconciliationReport = {
    timestamp,
    localLedgerCount,
    localTxCount,
    localEventCount,
    upstreamEventCount,
    eventCheckStart,
    eventCheckEnd,
    eventCountDiscrepancies,
    horizonLatestLedger,
    localLatestLedger,
    ledgerGap,
    missingLedgerRanges,
    discrepancies,
    healthy,
  };

  // 5. Log report
  logger.info('[reconciliation] Report:', JSON.stringify(report, null, 2));

  // 6. Alert if unhealthy
  if (!healthy) {
    const alertMsg = [
      `Timestamp: ${timestamp}`,
      `Local latest ledger: ${localLatestLedger}`,
      `Horizon latest ledger: ${horizonLatestLedger}`,
      `Ledger gap: ${ledgerGap}`,
      `Discrepancies:`,
      ...discrepancies.map((d) => `  • ${d}`),
    ].join('\n');
    await sendAlert(alertMsg);
  } else {
    logger.info('[reconciliation] ✅ All checks passed — no discrepancies found');
  }

  return report;
}

/**
 * Schedule the reconciliation job to run daily.
 * Call this from the indexer startup to register the cron.
 */
export function scheduleReconciliation(): NodeJS.Timeout {
  const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  logger.info('[reconciliation] Daily reconciliation job scheduled');

  // Run once at startup (after a short delay to let the indexer warm up)
  const initialDelay = setTimeout(async () => {
    try {
      await runReconciliation();
      scheduler.recordHeartbeat(HEARTBEAT_ID, 'success', {
        taskName: 'Indexer Gap Reconciliation Sweep',
        expectedIntervalMs: INTERVAL_MS,
      });
    } catch (err) {
      logger.error('[reconciliation] Initial run failed:', err);
      scheduler.recordHeartbeat(HEARTBEAT_ID, 'failure', {
        taskName: 'Indexer Gap Reconciliation Sweep',
        expectedIntervalMs: INTERVAL_MS,
      });
    }
  }, 60_000); // 1 minute after startup

  // Then run every 24 hours
  const interval = setInterval(async () => {
    try {
      await runReconciliation();
      scheduler.recordHeartbeat(HEARTBEAT_ID, 'success', {
        taskName: 'Indexer Gap Reconciliation Sweep',
        expectedIntervalMs: INTERVAL_MS,
      });
    } catch (err) {
      logger.error('[reconciliation] Scheduled run failed:', err);
      scheduler.recordHeartbeat(HEARTBEAT_ID, 'failure', {
        taskName: 'Indexer Gap Reconciliation Sweep',
        expectedIntervalMs: INTERVAL_MS,
      });
    }
  }, INTERVAL_MS);

  return interval;
}
