import { z } from 'zod';

export type CursorResource = 'transactions' | 'events';

export interface StableCursorPosition {
  ledgerSequence: number;
  id: string;
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  hasNext: boolean;
}

const CURSOR_PREFIX = 'c1_';
const cursorPayloadSchema = z.object({
  version: z.literal(1),
  resource: z.enum(['transactions', 'events']),
  ledgerSequence: z.number().int().min(0),
  id: z.string().min(1),
});

export class InvalidCursorError extends Error {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';

  constructor() {
    super('Invalid cursor');
    this.name = 'InvalidCursorError';
  }
}

export function encodeStableCursor(
  resource: CursorResource,
  position: StableCursorPosition,
): string {
  const payload = {
    version: 1,
    resource,
    ledgerSequence: position.ledgerSequence,
    id: position.id,
  };
  return `${CURSOR_PREFIX}${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

export function decodeStableCursor(cursor: string, resource: CursorResource): StableCursorPosition {
  if (cursor.length > 2048 || !cursor.startsWith(CURSOR_PREFIX)) {
    throw new InvalidCursorError();
  }

  const encodedPayload = cursor.slice(CURSOR_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encodedPayload)) {
    throw new InvalidCursorError();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError();
  }

  const result = cursorPayloadSchema.safeParse(payload);
  if (!result.success || result.data.resource !== resource) {
    throw new InvalidCursorError();
  }

  return { ledgerSequence: result.data.ledgerSequence, id: result.data.id };
}
