import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { configureApiJsonSerialization, normalizeApiTimestamp } from '../src/lib/api-timestamps';

describe('API timestamp serialization', () => {
  it.each([
    ['2026-10-15T16:22:25Z', '2026-10-15T16:22:25.000Z'],
    ['2026-10-15T16:22:25.1+02:00', '2026-10-15T14:22:25.100Z'],
    ['2026-10-15T16:22:25.123456-05:30', '2026-10-15T21:52:25.123Z'],
    ['2026-10-15T16:22:25', '2026-10-15T16:22:25.000Z'],
  ])('normalizes %s to %s', (value, expected) => {
    expect(normalizeApiTimestamp(value)).toBe(expected);
  });

  it('preserves date-only, non-date, and invalid values', () => {
    expect(normalizeApiTimestamp('2026-10-15')).toBe('2026-10-15');
    expect(normalizeApiTimestamp('not a timestamp')).toBe('not a timestamp');
    expect(normalizeApiTimestamp('2026-99-45T99:99:99Z')).toBe('2026-99-45T99:99:99Z');
  });

  it('normalizes timestamp strings and Date values in JSON responses', async () => {
    const app = express();
    configureApiJsonSerialization(app);
    app.get('/', (_req, res) => {
      res.json({
        date: new Date('2026-10-15T16:22:25Z'),
        offset: '2026-10-15T18:22:25+02:00',
        dateOnly: '2026-10-15',
      });
    });

    const response = await request(app).get('/');

    expect(response.body).toEqual({
      date: '2026-10-15T16:22:25.000Z',
      offset: '2026-10-15T16:22:25.000Z',
      dateOnly: '2026-10-15',
    });
  });
});
