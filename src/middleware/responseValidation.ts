import type { Response } from 'express';
import type { z } from 'zod';
import { logger } from '../logger';

export function sendValidatedResponse<T extends z.ZodTypeAny>(
  res: Response,
  schema: T,
  payload: unknown,
  endpoint: string,
): void {
  const result = schema.safeParse(payload);
  if (!result.success) {
    logger.error('API response schema validation failed', {
      endpoint,
      issues: result.error.issues.map(({ code, message, path }) => ({ code, message, path })),
    });
    res.status(500).json({
      error: 'Internal Server Error',
      code: 'RESPONSE_SCHEMA_VALIDATION_FAILED',
    });
    return;
  }

  res.json(result.data);
}
