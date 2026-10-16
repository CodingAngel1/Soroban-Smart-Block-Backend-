import { afterAll, describe, expect, it, vi } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';
// This test file also serves as the executable, deterministic throughput benchmark.

vi.mock('../config', () => ({ config: { stellarNetwork: 'testnet' } }));
vi.mock('../indexer/registry', () => ({
  getContractContext: vi.fn(),
  decodeArgs: vi.fn(),
  renderHuman: vi.fn(),
}));

import { BenchmarkRunner } from './runner';
import { BenchmarkStore } from './comparison';
import type { BenchmarkResult, BenchmarkSuite } from './types';
import { decodeEvent } from '../indexer/decoder';

const EVENTS_PER_BATCH = 100;

function symbol(value: string): string {
  return xdr.ScVal.scvSymbol(Buffer.from(value)).toXDR('base64');
}

function int128(value: bigint) {
  const unsigned = value < 0n ? value + 2n ** 128n : value;
  const hi = unsigned >> 64n;
  const lo = unsigned & 0xffffffffffffffffn;
  return xdr.ScVal.scvI128(
    new xdr.Int128Parts({ hi: new xdr.Int64(BigInt.asIntN(64, hi)), lo: new xdr.Uint64(lo) }),
  );
}

function createRepresentativeEvents() {
  const accountKey = (seed: number) =>
    xdr.PublicKey.publicKeyTypeEd25519(xdr.Uint256.fromXDR(Buffer.alloc(32, seed)));
  const address = (seed: number) =>
    xdr.ScVal.scvAddress(xdr.ScAddress.scAddressTypeAccount(accountKey(seed))).toXDR('base64');
  const transferAmount = int128(1_000_000_000_000n);
  const nestedData = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol(Buffer.from('amount')),
      val: transferAmount,
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol(Buffer.from('memo')),
      val: xdr.ScVal.scvBytes(Buffer.alloc(64, 7)),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol(Buffer.from('metadata')),
      val: xdr.ScVal.scvVec([
        xdr.ScVal.scvU32(2),
        xdr.ScVal.scvBool(true),
        xdr.ScVal.scvSymbol(Buffer.from('settled')),
      ]),
    }),
  ]);

  const payloads = [
    {
      topics: [symbol('transfer'), address(1), address(2)],
      data: transferAmount.toXDR('base64'),
    },
    {
      topics: [symbol('swap'), address(3), address(4)],
      data: nestedData.toXDR('base64'),
    },
    {
      topics: [symbol('position_updated'), xdr.ScVal.scvI64(new xdr.Int64(42n)).toXDR('base64')],
      data: nestedData.toXDR('base64'),
    },
    {
      topics: [
        symbol('deposit'),
        xdr.ScVal.scvU32(7).toXDR('base64'),
        xdr.ScVal.scvBytes(Buffer.alloc(32, 9)).toXDR('base64'),
      ],
      data: xdr.ScVal.scvVec([transferAmount, xdr.ScVal.scvBool(false)]).toXDR('base64'),
    },
  ];

  return Array.from({ length: EVENTS_PER_BATCH }, (_, index) => payloads[index % payloads.length]);
}

describe('XDR event indexing throughput benchmark', () => {
  const store = new BenchmarkStore();
  const results: BenchmarkResult[] = [];

  it('measures decoded Soroban events per second for a representative batch', async () => {
    const events = createRepresentativeEvents();
    const decodedSamples = events.map((event) => decodeEvent(event.topics, event.data));
    expect(decodedSamples.every((decoded) => decoded.eventType !== 'unknown')).toBe(true);

    const runner = new BenchmarkRunner({
      name: 'indexer-xdr-event-throughput',
      iterations: 100,
      warmupIterations: 10,
    });

    const measurements = await runner.runSync(() => {
      for (const event of events) {
        decodeEvent(event.topics, event.data);
      }
    });

    const metrics = BenchmarkRunner.calculateStats(measurements);
    const eventsPerSecond = (EVENTS_PER_BATCH * 1000) / metrics.mean;
    results.push({
      name: 'indexer-xdr-event-throughput',
      path: 'src/indexer/decoder.ts:decodeEvent',
      timestamp: new Date().toISOString(),
      metrics,
      threshold: 15,
      throughput: {
        perSecond: eventsPerSecond,
        unit: 'events',
        sampleSize: EVENTS_PER_BATCH,
      },
    });

    expect(metrics.samples).toBe(100);
    expect(eventsPerSecond).toBeGreaterThan(0);
    console.log(
      `\nDecoded ${eventsPerSecond.toFixed(0)} representative Soroban events/second ` +
        `(${EVENTS_PER_BATCH} events per sample; mean ${metrics.mean.toFixed(3)}ms per batch)`,
    );
  });

  afterAll(() => {
    if (!results.length) return;
    const suite: BenchmarkSuite = {
      name: 'indexer-throughput',
      description: 'Soroban indexer XDR event decoding throughput',
      results,
      timestamp: new Date().toISOString(),
      duration: results.reduce((sum, result) => sum + result.metrics.mean, 0),
    };
    store.saveSuite(suite);
    const comparisons = store.compare('indexer-throughput', suite);
    console.log(store.generateReport(comparisons));
  });
});
