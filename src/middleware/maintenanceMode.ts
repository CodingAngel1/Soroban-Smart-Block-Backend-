import type { RequestHandler } from 'express';

export type ApiMaintenanceMode = 'off' | 'reads' | 'writes' | 'all';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CONTROL_PATHS = new Set([
  '/health',
  '/health/detailed',
  '/healthz',
  '/livez',
  '/ready',
  '/readyz',
  '/metrics',
]);

export function createMaintenanceModeMiddleware(
  mode: ApiMaintenanceMode,
  network: string,
): RequestHandler {
  return (req, res, next) => {
    if (mode === 'off' || CONTROL_PATHS.has(req.path)) {
      return next();
    }

    const isRead = READ_METHODS.has(req.method);
    const blockRequest =
      mode === 'all' || (mode === 'reads' && isRead) || (mode === 'writes' && !isRead);

    if (!blockRequest) {
      return next();
    }

    return res.status(503).json({
      error: 'API temporarily unavailable for maintenance',
      code: 'MAINTENANCE_MODE',
      maintenance: true,
      mode,
      network,
    });
  };
}
