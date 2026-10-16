import { z } from 'zod';

const dateResponseSchema = z.union([z.date(), z.string().datetime({ offset: true })]);

export const transactionResponseSchema = z
  .object({
    hash: z.string(),
    ledgerSequence: z.number().int(),
    ledgerCloseTime: dateResponseSchema,
    sourceAccount: z.string(),
    contractAddress: z.string().nullable(),
    functionName: z.string().nullable(),
    functionArgs: z.unknown().nullable(),
    status: z.string(),
    humanReadable: z.string().nullable(),
    feeCharged: z.string().nullable(),
    sorobanResources: z.unknown().nullable(),
    failureReason: z.string().nullable(),
  })
  .passthrough();

export const eventSummaryResponseSchema = z
  .object({
    id: z.string(),
    transactionHash: z.string(),
    contractAddress: z.string(),
    eventType: z.string(),
    topicSymbol: z.string().nullable(),
    decoded: z.unknown().nullable(),
    ledgerSequence: z.number().int(),
    ledgerCloseTime: dateResponseSchema,
  })
  .passthrough();

export const eventResponseSchema = eventSummaryResponseSchema
  .extend({
    topics: z.array(z.unknown()),
    data: z.unknown(),
    compacted: z.boolean().nullable(),
    createdAt: dateResponseSchema,
  })
  .passthrough();

const pageFields = {
  data: z.array(transactionResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().min(1).max(100),
};

export const transactionListResponseSchema = z.union([
  z.object({
    data: z.array(transactionResponseSchema),
    nextCursor: z.number().int().nullable(),
    hasNext: z.boolean(),
  }),
  z.object({
    ...pageFields,
    pages: z.number().int().nonnegative(),
  }),
]);

export const transactionDetailResponseSchema = transactionResponseSchema
  .extend({
    events: z.array(eventResponseSchema),
    bn254GasExemption: z.unknown().optional(),
  })
  .passthrough();

export const eventListResponseSchema = z.object({
  data: z.array(eventSummaryResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().min(1).max(100),
  nextCursor: z.string().nullable(),
});
