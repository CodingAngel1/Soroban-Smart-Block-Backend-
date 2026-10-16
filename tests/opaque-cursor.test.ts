import { describe, expect, it } from 'vitest';
import {
  createCursorScope,
  decodeOpaqueCursor,
  encodeOpaqueCursor,
} from '../src/utils/opaque-cursor';

describe('opaque API cursors', () => {
  const position = { ledgerSequence: 12345, id: 'internal-row-id' };
  const scope = createCursorScope('transactions', { limit: 20, status: 'success' });

  it('round-trips an encrypted position without exposing its payload', () => {
    const cursor = encodeOpaqueCursor(position, scope);

    expect(cursor).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(cursor).not.toContain('internal-row-id');
    expect(cursor).not.toContain('12345');
    expect(decodeOpaqueCursor(cursor, scope)).toEqual(position);
  });

  it('uses a fresh nonce for every token', () => {
    expect(encodeOpaqueCursor(position, scope)).not.toBe(encodeOpaqueCursor(position, scope));
  });

  it('rejects a cursor when its endpoint or query scope differs', () => {
    const cursor = encodeOpaqueCursor(position, scope);

    expect(
      decodeOpaqueCursor(cursor, createCursorScope('events', { limit: 20, status: 'success' })),
    ).toBeNull();
    expect(
      decodeOpaqueCursor(
        cursor,
        createCursorScope('transactions', { limit: 20, status: 'failed' }),
      ),
    ).toBeNull();
  });

  it('rejects malformed and tampered tokens', () => {
    const cursor = encodeOpaqueCursor(position, scope);
    const [, nonce, ciphertext] = cursor.split('.');
    const tampered = `v1.${nonce}.${ciphertext.slice(0, -1)}${ciphertext.endsWith('A') ? 'B' : 'A'}`;

    expect(decodeOpaqueCursor('not-a-cursor', scope)).toBeNull();
    expect(decodeOpaqueCursor(tampered, scope)).toBeNull();
  });
});
