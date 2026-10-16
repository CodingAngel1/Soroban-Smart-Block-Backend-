import { createServer, type Server } from 'http';
import type { Socket } from 'net';
import { afterEach, describe, expect, it } from 'vitest';
import { closeHttpServerAndDrain } from '../src/http-shutdown';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          if (!server.listening) return resolve();
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
});

async function startServer(
  handler: Parameters<typeof createServer>[0],
): Promise<{ server: Server; sockets: Set<Socket>; port: number }> {
  const server = createServer(handler);
  const sockets = new Set<Socket>();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Expected TCP server address'));
        return;
      }
      resolve({ server, sockets, port: address.port });
    });
  });
}

describe('closeHttpServerAndDrain', () => {
  it('waits for an in-flight HTTP request to finish', async () => {
    let markRequestStarted!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      markRequestStarted = resolve;
    });
    const { server, sockets, port } = await startServer((_req, res) => {
      markRequestStarted();
      setTimeout(() => res.end('finished'), 30);
    });

    const response = fetch(`http://127.0.0.1:${port}`);
    await requestStarted;
    let drained = false;
    const drain = closeHttpServerAndDrain(server, sockets, 500).then(() => {
      drained = true;
    });

    expect(await (await response).text()).toBe('finished');
    await drain;
    expect(drained).toBe(true);
    expect(sockets.size).toBe(0);
  });

  it('destroys connections that do not drain before the deadline', async () => {
    let markRequestStarted!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      markRequestStarted = resolve;
    });
    const { server, sockets, port } = await startServer(() => markRequestStarted());
    const response = fetch(`http://127.0.0.1:${port}`).catch(() => null);
    await requestStarted;

    await expect(closeHttpServerAndDrain(server, sockets, 20)).resolves.toBeUndefined();
    expect(await response).toBeNull();
    expect(sockets.size).toBe(0);
  });

  it('is a no-op for a server that has not started listening', async () => {
    const server = createServer();
    await expect(closeHttpServerAndDrain(server, new Set())).resolves.toBeUndefined();
  });
});
