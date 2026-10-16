import { Request, Response, NextFunction } from 'express';

/**
 * Mark a JSON resource as cacheable while requiring validation before reuse.
 * Express generates the ETag and handles matching If-None-Match requests.
 */
export function conditionalCache(_req: Request, res: Response, next: NextFunction): void {
  res.set('Cache-Control', 'public, max-age=0, must-revalidate');
  res.vary('X-Network');
  next();
}
