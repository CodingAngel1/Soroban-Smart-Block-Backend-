import type { NextFunction, Request, Response } from 'express';

const STATUS_ERROR_CODES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'AUTH_ERROR',
  403: 'AUTH_ERROR',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  408: 'REQUEST_TIMEOUT',
  409: 'CONFLICT',
  410: 'GONE',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  502: 'EXTERNAL_SERVICE_ERROR',
  503: 'SERVICE_UNAVAILABLE',
  504: 'EXTERNAL_SERVICE_ERROR',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function statusErrorCode(statusCode: number): string {
  if (STATUS_ERROR_CODES[statusCode]) return STATUS_ERROR_CODES[statusCode];
  return statusCode >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR';
}

export function withMachineReadableErrorCode(statusCode: number, body: unknown): unknown {
  if (statusCode < 400) return body;

  if (isRecord(body)) {
    const nestedError = isRecord(body.error) ? body.error : undefined;
    const code =
      (typeof body.code === 'string' && body.code) ||
      (typeof nestedError?.code === 'string' && nestedError.code) ||
      statusErrorCode(statusCode);
    return { ...body, code };
  }

  const code = statusErrorCode(statusCode);
  if (typeof body === 'string') return { code, message: body };
  return body === undefined ? { code } : { code, details: body };
}

export function publicErrorCodeMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res) as (body: unknown) => Response;
  res.json = ((body?: unknown): Response =>
    originalJson(withMachineReadableErrorCode(res.statusCode, body))) as Response['json'];

  const originalSend = res.send.bind(res) as (body?: unknown) => Response;
  res.send = ((body?: unknown): Response => {
    if (
      res.statusCode >= 400 &&
      typeof body === 'string' &&
      !res.get('Content-Type')?.toLowerCase().includes('application/json')
    ) {
      res.type('application/json');
      return originalSend(JSON.stringify(withMachineReadableErrorCode(res.statusCode, body)));
    }
    return originalSend(body);
  }) as Response['send'];

  next();
}
