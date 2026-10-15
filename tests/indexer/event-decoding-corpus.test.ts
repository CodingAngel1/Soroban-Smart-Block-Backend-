import { describe, expect, it, vi } from 'vitest';
import corpus from '../fixtures/event-decoding/regression-corpus.json';

vi.mock('../../src/db', () => ({
  prismaRead: {
    eventDefinition: { findUnique: vi.fn() },
    contract: { findUnique: vi.fn() },
  },
  prismaWrite: {},
}));

vi.mock('../../src/config', () => ({
  config: { stellarNetwork: 'testnet' },
}));

import { decodeEvent } from '../../src/indexer/decoder';

describe('reviewed event-decoding regression corpus', () => {
  it.each(corpus.cases)('$id', (fixture) => {
    const actual = decodeEvent(fixture.topics, fixture.data);

    expect(actual.eventType).toBe(fixture.expected.eventType);
    expect(actual.topicSymbol).toBe(fixture.expected.topicSymbol);
    for (const [field, value] of Object.entries(fixture.expected.decoded)) {
      expect(actual.decoded[field]).toEqual(value);
    }
  });

  it('contains uniquely named, sourced fixtures for validated protocol versions', () => {
    const ids = corpus.cases.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(corpus.cases.every(({ source }) => source.length > 0)).toBe(true);
    expect(corpus.protocolVersionsValidated).toEqual([20, 21]);
  });
});
