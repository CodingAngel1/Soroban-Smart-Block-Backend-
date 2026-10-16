import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../src/config', () => ({ config: { stellarNetwork: 'testnet' } }));
vi.mock('../src/profiles', () => ({
  getProfile: (name: string) => ({
    name,
    rpcUrl: `${name}-rpc`,
    networkPassphrase: `${name}-passphrase`,
  }),
}));

import { networkRouter } from '../src/middleware/networkRouter';
import { networkRouter as networkInfoRouter } from '../src/api/network';

function makeReq(headers: Record<string, string> = {}, hostname = 'api.example.com'): Request {
  return { headers, hostname } as unknown as Request;
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnThis();
  const setHeader = vi.fn();
  return {
    res: { json, status, setHeader } as unknown as Response,
    json,
    setHeader,
    status,
  };
}

describe('network selection', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('defaults to the startup-selected network on an unqualified host', () => {
    const req = makeReq();
    const { res, setHeader } = makeRes();

    networkRouter(req, res, next);

    expect(req.network).toBe('testnet');
    expect(req.networkProfile?.name).toBe('testnet');
    expect(setHeader).toHaveBeenCalledWith('X-Network', 'testnet');
    expect(next).toHaveBeenCalledOnce();
  });

  it('accepts a case-insensitive explicit selector when it matches the instance', () => {
    const req = makeReq({ 'x-network': ' TESTNET ' });
    const { res } = makeRes();

    networkRouter(req, res, next);

    expect(req.network).toBe('testnet');
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects unknown and cross-network explicit selectors', () => {
    for (const [selector, statusCode] of [
      ['customnet', 400],
      ['mainnet', 400],
    ] as const) {
      const { res, status, json } = makeRes();
      const requestNext = vi.fn();

      networkRouter(makeReq({ 'x-network': selector }), res, requestNext);

      expect(status).toHaveBeenCalledWith(statusCode);
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
      expect(requestNext).not.toHaveBeenCalled();
    }
  });

  it('accepts matching network hosts and rejects hosts for another network', () => {
    const matchingNext = vi.fn();
    networkRouter(makeReq({}, 'testnet-api.example.com'), makeRes().res, matchingNext);
    expect(matchingNext).toHaveBeenCalledOnce();

    const { res, status, json } = makeRes();
    const mismatchedNext = vi.fn();
    networkRouter(makeReq({}, 'mainnet-api.example.com'), res, mismatchedNext);

    expect(status).toHaveBeenCalledWith(421);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(mismatchedNext).not.toHaveBeenCalled();
  });

  it('gives an explicit matching header precedence over a different host', () => {
    const nextForHeader = vi.fn();

    networkRouter(
      makeReq({ 'x-network': 'testnet' }, 'mainnet-api.example.com'),
      makeRes().res,
      nextForHeader,
    );

    expect(nextForHeader).toHaveBeenCalledOnce();
  });

  it('reports the selected profile in the network information endpoint', async () => {
    const app = express();
    app.use(networkRouter);
    app.use('/network', networkInfoRouter);

    const response = await request(app).get('/network').set('X-Network', 'testnet');

    expect(response.status).toBe(200);
    expect(response.headers['x-network']).toBe('testnet');
    expect(response.body).toMatchObject({
      network: 'testnet',
      rpcUrl: 'testnet-rpc',
      passphrase: 'testnet-passphrase',
    });
  });
});
