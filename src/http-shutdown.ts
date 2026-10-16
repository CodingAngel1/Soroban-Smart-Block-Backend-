import type { Server } from 'http';
import type { Socket } from 'net';

export function closeHttpServerAndDrain(
  server: Server,
  activeConnections: Set<Socket>,
  forceCloseAfterMs = 5_000,
): Promise<void> {
  if (!server.listening) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let serverClosed = false;
    let settled = false;
    const onSocketClose = () => finishIfDrained();
    const forceCloseTimer = setTimeout(() => {
      for (const socket of activeConnections) socket.destroy();
    }, forceCloseAfterMs);

    function finishIfDrained(): void {
      if (!serverClosed || activeConnections.size > 0 || settled) return;
      settled = true;
      clearTimeout(forceCloseTimer);
      resolve();
    }

    for (const socket of activeConnections) socket.once('close', onSocketClose);

    server.close((error) => {
      if (error) {
        settled = true;
        clearTimeout(forceCloseTimer);
        reject(error);
        return;
      }
      serverClosed = true;
      finishIfDrained();
    });
  });
}
