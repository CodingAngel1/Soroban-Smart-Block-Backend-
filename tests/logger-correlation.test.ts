import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../src/logger';
import { traceStorage } from '../src/middleware/correlation';

describe('structured log correlation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits request and trace IDs from the active async context', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    traceStorage.run(
      {
        requestId: 'request-123',
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
      },
      () => logger.info('request handled'),
    );

    expect(write).toHaveBeenCalledWith(expect.stringContaining('request-123'));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('a'.repeat(32)));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('b'.repeat(16)));
  });

  it('does not let log metadata replace the active correlation IDs', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    traceStorage.run(
      {
        requestId: 'request-123',
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
      },
      () => logger.info('request handled', { requestId: 'incorrect', traceId: 'incorrect' }),
    );

    const output = String(write.mock.calls[0]?.[0]);
    expect(output).toContain('request-123');
    expect(output).toContain('a'.repeat(32));
    expect(output).not.toContain('incorrect');
  });
});
