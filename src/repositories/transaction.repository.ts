import { prismaRead as prisma } from '../db';
import { config } from '../config';

export const TX_SELECT = {
  id: true,
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
} as const;

export interface TransactionFindOptions {
  where: Record<string, any>;
  take?: number;
  skip?: number;
  orderBy?: Array<Record<string, 'asc' | 'desc'>>;
  after?: StableCursorPosition;
  includeCursorId?: boolean;
}

export class TransactionRepository {
  async findMany(options: TransactionFindOptions) {
    return prisma.transaction.findMany({
      where: { ...options.where, network: config.stellarNetwork },
      orderBy: options.orderBy ?? [{ ledgerSequence: 'desc' }, { id: 'desc' }],
      take: options.take,
      skip: options.skip,
      select: options.includeCursorId ? { id: true, ...TX_SELECT } : TX_SELECT,
    });
  }

  async count(where: Record<string, any>): Promise<number> {
    return prisma.transaction.count({
      where: { ...where, network: config.stellarNetwork },
    });
  }

  async findByHashWithEvents(hash: string, network = config.stellarNetwork) {
    return prisma.transaction.findUnique({
      where: { network_hash: { network, hash } },
      select: {
        ...TX_SELECT,
        events: true,
      },
    });
  }

  async findRawXdrByHash(hash: string) {
    return prisma.transaction.findUnique({
      where: { hash },
      select: { hash: true, rawXdr: true },
    });
  }
}

export const transactionRepository = new TransactionRepository();
