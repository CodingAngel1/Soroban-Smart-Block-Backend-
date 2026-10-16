import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { getProfile, type NetworkName } from '../profiles';

const VALID_NETWORKS = new Set<NetworkName>(['mainnet', 'testnet', 'devnet']);

/**
 * Resolves the target network for a request using two strategies (in order):
 *
 * 1. `X-Network` request header  (e.g. `X-Network: mainnet`)
 * 2. Subdomain prefix             (e.g. `mainnet-api.example.com`)
 *
 * Falls back to the server's own `STELLAR_NETWORK` env var (the default
 * network this instance was started with).
 *
 * On success, attaches `req.network` (the resolved NetworkName) and
 * `req.networkProfile` (the full NetworkProfile) so downstream handlers can
 * use network-specific config without re-reading env vars.
 *
 * Responds 400 if an explicit `X-Network` value is unrecognised.
 */
export function networkRouter(req: Request, res: Response, next: NextFunction): void {
  const activeProfile = getProfile(config.stellarNetwork);

  // 1. Explicit header takes highest precedence
  const headerValue = (req.headers['x-network'] as string | undefined)?.toLowerCase().trim();
  if (headerValue) {
    if (!VALID_NETWORKS.has(headerValue as NetworkName)) {
      res.status(400).json({
        error: `Unknown network "${headerValue}". Valid values: ${[...VALID_NETWORKS].join(', ')}`,
      });
      return;
    }
    if (headerValue !== activeProfile.name) {
      res.status(400).json({
        error: `This API instance serves ${activeProfile.name}; route ${headerValue} requests to the matching network instance.`,
      });
      return;
    }
    req.network = activeProfile.name;
    req.networkProfile = activeProfile;
    res.setHeader('X-Network', activeProfile.name);
    return next();
  }

  // 2. Subdomain detection  (e.g. "testnet-api.example.com" → "testnet")
  const host = req.hostname ?? '';
  const subdomain = host.split('.')[0] ?? '';
  for (const net of VALID_NETWORKS) {
    if (subdomain === net || subdomain.startsWith(`${net}-`)) {
      if (net !== activeProfile.name) {
        res.status(421).json({
          error: `This API instance serves ${activeProfile.name}; route ${net} requests to the matching network instance.`,
        });
        return;
      }
      req.network = activeProfile.name;
      req.networkProfile = activeProfile;
      res.setHeader('X-Network', activeProfile.name);
      return next();
    }
  }

  // 3. Default: all routes use the profile selected when this instance started.
  req.network = activeProfile.name;
  req.networkProfile = activeProfile;
  res.setHeader('X-Network', activeProfile.name);
  next();
}
