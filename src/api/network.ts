import { Router, Request, Response } from 'express';
import { config } from '../config';
import { getProfile } from '../profiles';

/**
 * @swagger
 * tags:
 *   name: Network
 *   description: Active Stellar network configuration
 */

export const networkRouter = Router();

/**
 * @swagger
 * /network:
 *   get:
 *     summary: Get active network configuration
 *     description: Returns the startup-selected network profile. Use the matching network instance; X-Network cannot switch this instance's database or RPC connections.
 *     tags: [Network]
 *     responses:
 *       200:
 *         description: Active network info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 network:
 *                   type: string
 *                   description: Active network name
 *                   example: testnet
 *                 rpcUrl:
 *                   type: string
 *                   description: Soroban RPC endpoint
 *                   example: https://soroban-testnet.stellar.org
 *                 passphrase:
 *                   type: string
 *                   description: Stellar network passphrase
 *                   example: Test SDF Network ; September 2015
 *                 indexerStartLedger:
 *                   type: integer
 *                   description: Ledger sequence the indexer started from
 *                   example: 0
 */
networkRouter.get('/', (req: Request, res: Response) => {
  const profile = req.networkProfile ?? getProfile(config.stellarNetwork);
  res.json({
    network: profile.name,
    rpcUrl: profile.rpcUrl,
    passphrase: profile.networkPassphrase,
    indexerStartLedger: config.indexerStartLedger,
  });
});
