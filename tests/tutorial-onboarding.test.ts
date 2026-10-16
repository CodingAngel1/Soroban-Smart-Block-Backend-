import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const script = 'docs/tutorials/examples/01-get-started.mjs';

async function withServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  test: (baseUrl: string) => Promise<void>,
) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await test(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function runScript(baseUrl: string) {
  return execFileAsync('node', [script], {
    env: { ...process.env, BASE_URL: baseUrl, DEVELOPER_ID: 'dev-smoke', API_KEY: '' },
  });
}

describe('developer onboarding smoke test', () => {
  afterEach(() => {
    delete process.env.API_KEY;
  });

  it('creates a key, uses it for the first query, and never prints the secret', async () => {
    const received: Array<{ method: string; url?: string; apiKey?: string; body: string }> = [];
    await withServer(
      (req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          received.push({
            method: req.method ?? '',
            url: req.url,
            apiKey: req.headers['x-api-key'] as string | undefined,
            body,
          });
          res.setHeader('content-type', 'application/json');
          if (req.method === 'POST') {
            res.writeHead(201);
            res.end(JSON.stringify({ id: 'key-1', key: 'sk_secret-smoke-key' }));
            return;
          }
          res.writeHead(200);
          res.end(JSON.stringify({ data: [{ hash: 'tx-1' }] }));
        });
      },
      async (baseUrl) => {
        const result = await runScript(baseUrl);
        expect(received).toHaveLength(2);
        expect(received[0]).toMatchObject({
          method: 'POST',
          url: '/api/v1/developer/keys',
          body: expect.stringContaining('"developerId":"dev-smoke"'),
        });
        expect(received[1]).toMatchObject({
          method: 'GET',
          url: '/api/v1/transactions?limit=1',
          apiKey: 'sk_secret-smoke-key',
        });
        expect(result.stdout).toContain('key-1');
        expect(result.stdout).not.toContain('sk_secret-smoke-key');
      },
    );
  });

  it('stops after key creation fails and reports the status', async () => {
    await withServer(
      (_req, res) => {
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'unavailable' }));
      },
      async (baseUrl) => {
        await expect(runScript(baseUrl)).rejects.toMatchObject({
          stderr: expect.stringContaining('API-key creation failed: HTTP 503'),
        });
      },
    );
  });

  it('reports a failed first query after key creation', async () => {
    await withServer(
      (req, res) => {
        req.resume();
        if (req.method === 'POST') {
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: 'key-1', key: 'sk_secret-smoke-key' }));
          return;
        }
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Invalid API key' }));
      },
      async (baseUrl) => {
        await expect(runScript(baseUrl)).rejects.toMatchObject({
          stderr: expect.stringContaining('First transaction query failed: HTTP 401'),
        });
      },
    );
  });
});
