import { asyncHandler } from './middleware/asyncHandler';
import { config } from './config';
import { getHealthStatus } from './health';

export function createDependencyHealthHandler(isShuttingDown: () => boolean) {
  return asyncHandler(async (_req, res) => {
    if (isShuttingDown()) {
      return res.status(503).json({
        status: 'shutting_down',
        timestamp: new Date().toISOString(),
      });
    }

    const healthStatus = await getHealthStatus(true);
    const statusCode = healthStatus.status === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json({
      ...healthStatus,
      network: config.stellarNetwork,
    });
  });
}
