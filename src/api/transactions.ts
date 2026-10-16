import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler';
import { transactionService } from '../services/transaction.service';

/**
 * @swagger
 * tags:
 *   name: Transactions
 *   description: Indexed Soroban transactions with human-readable decoding
 */

export const transactionRouter = Router();

const listSchema = z
  .object({
    // Legacy cursor is a ledger number; `pagination=cursor` opts into the stable opaque cursor.
    cursor: z.union([z.coerce.number().int().min(0), z.string().min(1).max(2048)]).optional(),
    pagination: z.literal('cursor').optional(),
    // offset-based fallback
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    // filters
    contract: z.string().optional(),
    account: z.string().optional(),
    status: z.string().optional(),
    ledgerMin: z.coerce.number().int().min(0).optional(),
    ledgerMax: z.coerce.number().int().min(0).optional(),
  })
  .superRefine((query, context) => {
    if (query.pagination === 'cursor' && query.page !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['page'],
        message: 'page cannot be used with cursor pagination',
      });
    }
  });

/**
 * @swagger
 * /transactions:
 *   get:
 *     summary: List indexed transactions (cursor- or offset-paginated)
 *     tags: [Transactions]
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           oneOf:
 *             - { type: integer, minimum: 0 }
 *             - { type: string, maxLength: 2048 }
 *         description: Legacy ledger-sequence cursor, or the opaque nextCursor value when `pagination=cursor`.
 *       - in: query
 *         name: pagination
 *         schema: { type: string, enum: [cursor] }
 *         description: Select the stable opaque cursor contract. On the first page, omit `cursor`; pass the returned `nextCursor` on subsequent requests.
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *         description: 1-based page number for legacy offset pagination; do not combine with pagination=cursor
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *         description: Page size
 *       - in: query
 *         name: contract
 *         schema: { type: string }
 *         description: Filter by contract address (exact match)
 *       - in: query
 *         name: account
 *         schema: { type: string }
 *         description: Filter by source account
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         description: Filter by status (success | failed)
 *       - in: query
 *         name: ledgerMin
 *         schema: { type: integer, minimum: 0 }
 *         description: Inclusive lower bound on ledger sequence
 *       - in: query
 *         name: ledgerMax
 *         schema: { type: integer, minimum: 0 }
 *         description: Inclusive upper bound on ledger sequence
 *     responses:
 *       200:
 *         description: Stable cursor requests return { data, nextCursor, hasNext }; legacy cursor and offset requests retain their existing response shapes.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - title: StableCursorPage
 *                   type: object
 *                   required: [data, nextCursor, hasNext]
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Transaction' }
 *                     nextCursor: { type: string, nullable: true, description: Opaque cursor; pass with pagination=cursor }
 *                     hasNext: { type: boolean }
 *                 - title: LegacyCursorPage
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Transaction' }
 *                     nextCursor:
 *                       type: integer
 *                       nullable: true
 *                       description: Legacy ledgerSequence cursor
 *                     hasNext: { type: boolean }
 *                 - title: OffsetPage
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Transaction' }
 *                     total: { type: integer, description: 'Total transactions matching the filter', example: 1543 }
 *                     page: { type: integer, example: 1 }
 *                     limit: { type: integer, example: 20 }
 *                     pages: { type: integer, description: 'Total number of pages (ceil(total / limit))', example: 78 }
 *       400:
 *         description: Invalid query parameters or cursor
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Error'
 *               example:
 *                 error: limit must be less than or equal to 100
 */
// GET /transactions
// Stable cursor mode: ?pagination=cursor&limit=20&contract=...
// Legacy cursor mode: ?cursor=<ledger>&limit=20&contract=...
// Offset mode:  ?page=2&limit=20&contract=...
transactionRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const q = listSchema.parse(req.query);
    const result = await transactionService.listTransactions(q);
    res.json(result);
  }),
);

/**
 * @swagger
 * /transactions/{hash}/xdr:
 *   get:
 *     summary: Retrieve the retained base64 transaction envelope XDR
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         schema: { type: string }
 *         description: Transaction hash
 *     responses:
 *       200:
 *         description: Base64-encoded transaction envelope XDR
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [transactionHash, encoding, xdr]
 *               properties:
 *                 transactionHash: { type: string }
 *                 encoding: { type: string, enum: [base64] }
 *                 xdr: { type: string, description: Base64-encoded Stellar transaction envelope XDR }
 *       404:
 *         description: Transaction or its raw XDR is not available
 */
transactionRouter.get(
  '/:hash/xdr',
  asyncHandler(async (req: Request, res: Response) => {
    const tx = await transactionService.getRawXdrByHash(req.params.hash);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (!tx.rawXdr) return res.status(404).json({ error: 'Raw transaction XDR is not available' });

    res.json({ transactionHash: tx.hash, encoding: 'base64', xdr: tx.rawXdr });
  }),
);

/**
 * @swagger
 * /transactions/{hash}:
 *   get:
 *     summary: Get a single transaction by hash
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         schema: { type: string }
 *         description: Transaction hash
 *     responses:
 *       200:
 *         description: The transaction, its decoded events, and an optional ZK gas-exemption summary
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Transaction'
 *                 - type: object
 *                   properties:
 *                     events:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Event' }
 *                       description: Full decoded events emitted by this transaction
 *                     bn254GasExemption:
 *                       type: object
 *                       nullable: true
 *                       description: >-
 *                         CAP-0080 BN254 host-function gas-exemption summary, or null when
 *                         the transaction used no host-accelerated ZK operations.
 *                       properties:
 *                         bn254Ops:
 *                           type: array
 *                           items: { type: string }
 *                           description: 'Detected BN254 op types, e.g. ["bn254_add", "bn254_pairing_check"]'
 *                           example: ['bn254_pairing_check', 'bn254_multiscalar_mul']
 *                         opCount: { type: integer, example: 2 }
 *                         feeCharged: { type: string, nullable: true, description: 'Actual fee charged (stroops)', example: '100' }
 *                         estimatedWasmFee: { type: string, nullable: true, description: 'Estimated equivalent Wasm fee (stroops)', example: '385' }
 *                         stroopSavings: { type: string, nullable: true, description: 'Net stroops saved', example: '285' }
 *                         savingsPct: { type: number, nullable: true, description: 'Savings percentage (e.g. 74.0)', example: 74.0 }
 *                         cpuInstructions: { type: integer, example: 24500000 }
 *                         msmComplexity: { type: integer, description: 'Multi-scalar multiplication complexity factor', example: 8 }
 *                         humanReadable: { type: string, example: 'Saved 74% in processing fees via host ZK acceleration (bn254_pairing_check, bn254_multiscalar_mul)' }
 *       404:
 *         description: Transaction not found
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Error'
 *               example:
 *                 error: Transaction not found
 */
// GET /transactions/:hash
transactionRouter.get(
  '/:hash',
  asyncHandler(async (req: Request, res: Response) => {
    const tx = await transactionService.getTransactionByHash(req.params.hash);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    res.json(tx);
  }),
);
