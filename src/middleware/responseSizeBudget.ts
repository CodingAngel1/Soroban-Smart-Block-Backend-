import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

export const BATCH_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
export const EXPENSIVE_RESPONSE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Reject a fully serialized response that exceeds its route group's byte
 * budget. The response is not truncated, so clients never receive invalid JSON.
 */
export function responseSizeBudget(limitBytes: number) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const originalSend = res.send.bind(res);
    res.send = ((body?: unknown): Response => {
      const serialized =
        typeof body === 'string' ? body : Buffer.isBuffer(body) ? body : JSON.stringify(body ?? '');
      const sizeBytes =
        typeof serialized === 'string' ? Buffer.byteLength(serialized) : serialized.byteLength;

      if (sizeBytes > limitBytes) {
        res.send = originalSend;
        logger.warn('[response-budget] Response exceeded size limit', {
          path: _req.path,
          method: _req.method,
          sizeBytes,
          limitBytes,
        });
        return res.status(500).json({
          error: 'Response exceeded maximum size',
          code: 'RESPONSE_TOO_LARGE',
          maxBytes: limitBytes,
        });
      }

      return originalSend(body as Parameters<Response['send']>[0]);
    }) as Response['send'];
    next();
  };
}
