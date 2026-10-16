/**
 * Correlation-ID middleware
 *
 * - Reads `x-request-id` from incoming headers (upstream gateway) or generates a new UUID.
 * - Reads `x-b3-traceid` / `x-b3-spanid` from upstream, or falls back to the active
 *   OpenTelemetry span so that OTel-instrumented calls propagate automatically.
 * - Writes requestId / traceId / spanId onto `req` for use in handlers and the logger.
 * - Sets `X-Request-Id` response header so callers can correlate their logs.
 * - Stores context in `traceStorage` (AsyncLocalStorage) so the logger picks it up
 *   without needing explicit passing.
 */
import { randomBytes, randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import type { Request, Response, NextFunction } from 'express';
import { trace } from '@opentelemetry/api';
import axios, { type InternalAxiosRequestConfig } from 'axios';

export interface TraceContext {
  requestId: string;
  traceId: string;
  spanId: string;
  ledgerSequence?: number;
}

export const traceStorage = new AsyncLocalStorage<TraceContext>();

// Propagate X-Request-Id to outgoing HTTP requests via Axios interceptor.
// Optional chaining keeps module load safe when axios is mocked in tests.
axios.interceptors?.request?.use?.(propagateRequestContext, (error) => {
  return Promise.reject(error);
});

export function propagateRequestContext(config: InternalAxiosRequestConfig) {
  const ctx = traceStorage.getStore();
  if (!ctx) return config;

  config.headers = config.headers || ({} as typeof config.headers);
  if (ctx.requestId) config.headers['X-Request-Id'] = ctx.requestId;

  const traceId =
    /^[0-9a-f]{32}$/i.test(ctx.traceId) || /^[0-9a-f]{16}$/i.test(ctx.traceId)
      ? ctx.traceId.padStart(32, '0')
      : '';
  if (traceId && /^[0-9a-f]{16}$/i.test(ctx.spanId)) {
    config.headers.traceparent = `00-${traceId}-${ctx.spanId}-01`;
  }

  return config;
}

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();

  // Prefer B3 headers (Zipkin / upstream gateway).
  let traceId = (req.headers['x-b3-traceid'] as string | undefined) ?? '';
  let spanId = (req.headers['x-b3-spanid'] as string | undefined) ?? '';

  // Fall back to the active OTel span (set by auto-instrumentation).
  if (!traceId || !spanId) {
    const otelSpan = trace.getActiveSpan();
    if (otelSpan) {
      const sc = otelSpan.spanContext();
      traceId = traceId || sc.traceId;
      spanId = spanId || sc.spanId;
    }
  }

  traceId = traceId || randomBytes(16).toString('hex');
  spanId = spanId || randomBytes(8).toString('hex');

  // Annotate the active OTel span with requestId for cross-signal correlation.
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.setAttribute('request.id', requestId);
  }

  const ctx: TraceContext = { requestId, traceId, spanId };

  req.requestId = requestId;
  req.traceId = traceId;
  req.spanId = spanId;

  res.setHeader('X-Request-Id', requestId);

  traceStorage.run(ctx, next);
}
