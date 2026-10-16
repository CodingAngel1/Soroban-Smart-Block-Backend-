import { Router, Request, Response } from 'express';
import { prismaRead as prisma } from '../db';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler';
import { logger } from '../logger';

/**
 * @swagger
 * tags:
 *   name: Batch Operations
 *   description: Efficient bulk operations for power users - fetch multiple items in one request
 */

export const batchRouter = Router();

/**
 * Batch request schemas
 */
const batchEventsSchema = z.object({
  ids: z.array(z.unknown()).min(1).max(100),
});

const batchTransactionsSchema = z.object({
  hashes: z.array(z.unknown()).min(1).max(100),
});

const batchAccountsSchema = z.object({
  addresses: z.array(z.unknown()).min(1).max(100),
});

interface BatchItemError {
  index: number;
  code: 'INVALID_ITEM' | 'LOOKUP_FAILED';
  message: string;
}

function invalidItemErrors(items: unknown[]): BatchItemError[] {
  return items.flatMap((item, index) =>
    typeof item === 'string'
      ? []
      : [{ index, code: 'INVALID_ITEM' as const, message: 'Item must be a string' }],
  );
}

function lookupFailedErrors(indexes: number[]): BatchItemError[] {
  return indexes.map((index) => ({
    index,
    code: 'LOOKUP_FAILED',
    message: 'Unable to look up item',
  }));
}

/**
 * @swagger
 * /batch/events:
 *   post:
 *     summary: Fetch multiple events by ID (batch operation)
 *     tags: [Batch Operations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 maxItems: 100
 *                 description: Array of event IDs to fetch
 *             example:
 *               ids:
 *                 - '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566-AAAADwAAAAh0cmFuc2Zlcg=='
 *                 - '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566-AAAADwAAAARzd2Fw'
 *     responses:
 *       200:
 *         description: Array of matching events (null for missing IDs)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   description: Events in same order as input IDs; null for missing items
 *                   items:
 *                     type: object
 *                     nullable: true
 *                     properties:
 *                       id: { type: string }
 *                       transactionHash: { type: string }
 *                       contractAddress: { type: string }
 *                       eventType: { type: string }
 *                       topicSymbol: { type: string, nullable: true }
 *                       decoded: { type: object, nullable: true }
 *                       ledgerSequence: { type: integer }
 *                       ledgerCloseTime: { type: string, format: date-time }
 *                 missing:
 *                   type: array
 *                   description: IDs that were not found
 *                   items:
 *                     type: string
 *                 errors:
 *                   type: array
 *                   description: Invalid or failed input items, identified by their zero-based input index
 *                   items:
 *                     type: object
 *                     properties:
 *                       index: { type: integer }
 *                       code: { type: string, enum: [INVALID_ITEM, LOOKUP_FAILED] }
 *                       message: { type: string }
 *               example:
 *                 data:
 *                   - id: '3389e9f0-...-AAAADwAAAAh0cmFuc2Zlcg=='
 *                     transactionHash: '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566'
 *                     contractAddress: CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5
 *                     eventType: transfer
 *                     topicSymbol: transfer
 *                     decoded: { from: 'GBZX...', amount: '1000000000' }
 *                     ledgerSequence: 3168075
 *                     ledgerCloseTime: '2026-06-19T07:24:26.000Z'
 *                   - null
 *                 missing:
 *                   - '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566-AAAADwAAAARzd2Fw'
 *       400:
 *         description: Invalid request body or too many IDs
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Error'
 *               example:
 *                 error: 'ids array must contain at least 1 item(s)'
 */
batchRouter.post(
  '/events',
  asyncHandler(async (req: Request, res: Response) => {
    const { ids } = batchEventsSchema.parse(req.body);
    const validItems = ids.flatMap((id, index) => (typeof id === 'string' ? [{ id, index }] : []));
    const errors = invalidItemErrors(ids);

    let events: Array<{ id: string }> = [];
    try {
      events =
        validItems.length === 0
          ? []
          : await prisma.event.findMany({
              where: { id: { in: validItems.map(({ id }) => id) } },
              select: {
                id: true,
                transactionHash: true,
                contractAddress: true,
                eventType: true,
                topicSymbol: true,
                decoded: true,
                ledgerSequence: true,
                ledgerCloseTime: true,
              },
            });
    } catch (err) {
      logger.error('[batch] Event lookup failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(503).json({
        data: ids.map(() => null),
        missing: [],
        errors: [...errors, ...lookupFailedErrors(validItems.map(({ index }) => index))],
      });
    }

    // Create a map for quick lookup
    const eventMap = new Map(events.map((e) => [e.id, e]));

    // Maintain order from input and return null for missing
    const data = ids.map((id) => (typeof id === 'string' ? eventMap.get(id) || null : null));
    const missing = ids.filter((id) => typeof id === 'string' && !eventMap.has(id));

    res.json({
      data,
      missing,
      errors,
    });
  }),
);

/**
 * @swagger
 * /batch/transactions:
 *   post:
 *     summary: Fetch multiple transactions by hash (batch operation)
 *     tags: [Batch Operations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - hashes
 *             properties:
 *               hashes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 maxItems: 100
 *                 description: Array of transaction hashes to fetch
 *             example:
 *               hashes:
 *                 - '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566'
 *                 - 'a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0'
 *     responses:
 *       200:
 *         description: Array of matching transactions (null for missing hashes)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   description: Transactions in same order as input hashes; null for missing items
 *                   items:
 *                     type: object
 *                     nullable: true
 *                     properties:
 *                       hash: { type: string }
 *                       ledgerSequence: { type: integer }
 *                       ledgerCloseTime: { type: string, format: date-time }
 *                       sourceAccount: { type: string }
 *                       contractAddress: { type: string, nullable: true }
 *                       functionName: { type: string, nullable: true }
 *                       functionArgs: { type: object, nullable: true }
 *                       status: { type: string, description: 'success | failed' }
 *                       humanReadable: { type: string, nullable: true }
 *                       feeCharged: { type: integer }
 *                       sorobanResources: { type: object, nullable: true }
 *                       failureReason: { type: string, nullable: true }
 *                       events:
 *                         type: array
 *                         items:
 *                           type: object
 *                 missing:
 *                   type: array
 *                   description: Hashes that were not found
 *                   items:
 *                     type: string
 *                 errors:
 *                   type: array
 *                   description: Invalid or failed input items, identified by their zero-based input index
 *                   items:
 *                     type: object
 *                     properties:
 *                       index: { type: integer }
 *                       code: { type: string, enum: [INVALID_ITEM, LOOKUP_FAILED] }
 *                       message: { type: string }
 *               example:
 *                 data:
 *                   - hash: '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566'
 *                     ledgerSequence: 3168075
 *                     ledgerCloseTime: '2026-06-19T07:24:26.000Z'
 *                     sourceAccount: GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI
 *                     contractAddress: CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5
 *                     functionName: swap
 *                     status: success
 *                     humanReadable: 'GBZX...swapped 100 USDC for 98.7 XLM'
 *                     feeCharged: 100000
 *                     sorobanResources:
 *                       cpuInstructions: 2000000
 *                       memoryBytes: 1024000
 *                     failureReason: null
 *                     events: []
 *                   - null
 *                 missing:
 *                   - 'a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0'
 *       400:
 *         description: Invalid request body or too many hashes
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Error'
 *               example:
 *                 error: 'hashes array must contain at least 1 item(s)'
 */
batchRouter.post(
  '/transactions',
  asyncHandler(async (req: Request, res: Response) => {
    const { hashes } = batchTransactionsSchema.parse(req.body);
    const validItems = hashes.flatMap((hash, index) =>
      typeof hash === 'string' ? [{ hash, index }] : [],
    );
    const errors = invalidItemErrors(hashes);

    let transactions: Array<{ hash: string }> = [];
    try {
      transactions =
        validItems.length === 0
          ? []
          : await prisma.transaction.findMany({
              where: { hash: { in: validItems.map(({ hash }) => hash) } },
              select: {
                hash: true,
                ledgerSequence: true,
                ledgerCloseTime: true,
                sourceAccount: true,
                contractAddress: true,
                functionName: true,
                functionArgs: true,
                status: true,
                humanReadable: true,
                feeCharged: true,
                sorobanResources: true,
                failureReason: true,
                events: {
                  select: {
                    id: true,
                    eventType: true,
                    topicSymbol: true,
                    decoded: true,
                  },
                },
              },
            });
    } catch (err) {
      logger.error('[batch] Transaction lookup failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(503).json({
        data: hashes.map(() => null),
        missing: [],
        errors: [...errors, ...lookupFailedErrors(validItems.map(({ index }) => index))],
      });
    }

    // Create a map for quick lookup
    const txMap = new Map(transactions.map((tx) => [tx.hash, tx]));

    // Maintain order from input and return null for missing
    const data = hashes.map((hash) => (typeof hash === 'string' ? txMap.get(hash) || null : null));
    const missing = hashes.filter((hash) => typeof hash === 'string' && !txMap.has(hash));

    res.json({
      data,
      missing,
      errors,
    });
  }),
);

/**
 * @swagger
 * /batch/accounts:
 *   post:
 *     summary: Fetch wallet summaries for multiple accounts (batch operation)
 *     tags: [Batch Operations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - addresses
 *             properties:
 *               addresses:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 maxItems: 100
 *                 description: Array of Stellar account addresses to fetch
 *             example:
 *               addresses:
 *                 - 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI'
 *                 - 'GCZST3XVCDTUJ76ZAV2HA72KYXM4Y5LXNLHT3GSXWOOEDNVGY45UXGIT'
 *     responses:
 *       200:
 *         description: Array of account summaries (null for accounts with no activity)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   description: Account summaries in same order as input addresses; null for inactive accounts
 *                   items:
 *                     type: object
 *                     nullable: true
 *                     properties:
 *                       address: { type: string }
 *                       transactionCount: { type: integer, description: 'Total Soroban transactions from this account' }
 *                       eventCount: { type: integer, description: 'Total events involving this account' }
 *                       firstActivityLedger: { type: integer, nullable: true }
 *                       lastActivityLedger: { type: integer, nullable: true }
 *                       firstActivityTime: { type: string, format: date-time, nullable: true }
 *                       lastActivityTime: { type: string, format: date-time, nullable: true }
 *                 inactive:
 *                   type: array
 *                   description: Addresses with no recorded Soroban activity
 *                   items:
 *                     type: string
 *                 errors:
 *                   type: array
 *                   description: Invalid or failed input items, identified by their zero-based input index
 *                   items:
 *                     type: object
 *                     properties:
 *                       index: { type: integer }
 *                       code: { type: string, enum: [INVALID_ITEM, LOOKUP_FAILED] }
 *                       message: { type: string }
 *               example:
 *                 data:
 *                   - address: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI'
 *                     transactionCount: 42
 *                     eventCount: 127
 *                     firstActivityLedger: 3167000
 *                     lastActivityLedger: 3168075
 *                     firstActivityTime: '2026-06-18T12:00:00.000Z'
 *                     lastActivityTime: '2026-06-19T07:24:26.000Z'
 *                   - null
 *                 inactive:
 *                   - 'GCZST3XVCDTUJ76ZAV2HA72KYXM4Y5LXNLHT3GSXWOOEDNVGY45UXGIT'
 *       400:
 *         description: Invalid request body or too many addresses
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Error'
 *               example:
 *                 error: 'addresses array must contain at least 1 item(s)'
 */
batchRouter.post(
  '/accounts',
  asyncHandler(async (req: Request, res: Response) => {
    const { addresses } = batchAccountsSchema.parse(req.body);
    const validItems = addresses.flatMap((address, index) =>
      typeof address === 'string' ? [{ address, index }] : [],
    );
    const errors = invalidItemErrors(addresses);

    // Fetch transaction stats for each address
    let txStats: Array<{
      sourceAccount: string;
      _count: { hash: number };
      _min: { ledgerSequence: number | null; ledgerCloseTime: Date | null };
      _max: { ledgerSequence: number | null; ledgerCloseTime: Date | null };
    }> = [];
    try {
      txStats =
        validItems.length === 0
          ? []
          : await prisma.transaction.groupBy({
              by: ['sourceAccount'],
              where: { sourceAccount: { in: validItems.map(({ address }) => address) } },
              _count: { hash: true },
              _min: { ledgerSequence: true, ledgerCloseTime: true },
              _max: { ledgerSequence: true, ledgerCloseTime: true },
            });
    } catch (err) {
      logger.error('[batch] Account transaction lookup failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(503).json({
        data: addresses.map(() => null),
        inactive: [],
        errors: [...errors, ...lookupFailedErrors(validItems.map(({ index }) => index))],
      });
    }

    // Fetch event stats (events can reference addresses in decoded payload)
    // This is more complex, so we'll use a simpler approach: count events where the address appears in the event
    const accountStats: Record<
      string,
      {
        address: string;
        transactionCount: number;
        eventCount: number;
        firstActivityLedger: number | null;
        lastActivityLedger: number | null;
        firstActivityTime: string | null;
        lastActivityTime: string | null;
      }
    > = {};

    for (const stat of txStats) {
      accountStats[stat.sourceAccount] = {
        address: stat.sourceAccount,
        transactionCount: stat._count.hash || 0,
        eventCount: 0, // Will be populated below
        firstActivityLedger: stat._min.ledgerSequence || null,
        lastActivityLedger: stat._max.ledgerSequence || null,
        firstActivityTime: stat._min.ledgerCloseTime
          ? new Date(stat._min.ledgerCloseTime).toISOString()
          : null,
        lastActivityTime: stat._max.ledgerCloseTime
          ? new Date(stat._max.ledgerCloseTime).toISOString()
          : null,
      };
    }

    // For addresses with transaction activity, try to count related events
    const addressesWithActivity = Object.keys(accountStats);
    const eventCountResults = await Promise.allSettled(
      addressesWithActivity.map(async (address) => ({
        address,
        eventCount: await prisma.event.count({
          where: { transaction: { sourceAccount: address } },
        }),
      })),
    );
    const failedAddresses = new Set<string>();
    eventCountResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        accountStats[result.value.address].eventCount = result.value.eventCount;
      } else {
        failedAddresses.add(addressesWithActivity[index]);
        logger.error('[batch] Account event lookup failed', {
          address: addressesWithActivity[index],
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });

    for (const { address, index } of validItems) {
      if (failedAddresses.has(address)) {
        errors.push({
          index,
          code: 'LOOKUP_FAILED',
          message: 'Unable to look up item',
        });
      }
    }

    // Maintain order from input and return null for inactive addresses
    const data = addresses.map((addr) =>
      typeof addr === 'string' && !failedAddresses.has(addr) ? accountStats[addr] || null : null,
    );
    const inactive = addresses.filter(
      (addr) => typeof addr === 'string' && !accountStats[addr] && !failedAddresses.has(addr),
    );

    res.json({
      data,
      inactive,
      errors,
    });
  }),
);
