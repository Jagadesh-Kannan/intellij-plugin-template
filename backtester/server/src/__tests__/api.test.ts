import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { cacheClear } from '../data/cache.js';
import type { BacktestResponse } from '../types.js';

// DATA_PROVIDER=synthetic comes from vitest.config.ts, so this suite never
// touches the network.

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  cacheClear();
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected a TCP address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function post(body: unknown) {
  const response = await fetch(`${baseUrl}/api/backtest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as never };
}

describe('GET /api/strategies', () => {
  it('lists every strategy with metadata', async () => {
    const response = await fetch(`${baseUrl}/api/strategies`);
    const payload = (await response.json()) as { strategies: Array<{ id: string; category: string }> };

    expect(response.status).toBe(200);
    expect(payload.strategies).toHaveLength(12);
    expect(payload.strategies.filter((s) => s.category !== 'benchmark')).toHaveLength(10);
  });
});

describe('POST /api/backtest', () => {
  it('runs every strategy and ranks them by ROI', async () => {
    const { status, body } = await post({ ticker: 'DEMO', amount: 100 });
    const payload = body as BacktestResponse;

    expect(status).toBe(200);
    expect(payload.ticker).toBe('DEMO');
    expect(payload.synthetic).toBe(true);
    expect(payload.notice).toMatch(/simulated/i);
    expect(payload.results).toHaveLength(10);
    expect(payload.priceSeries.length).toBe(payload.tradingDays);

    const rois = payload.results.map((r) => r.metrics.roiPct);
    expect([...rois].sort((a, b) => b - a)).toEqual(rois);

    for (const result of payload.results) {
      expect(result.metrics.buyCount).toBeGreaterThan(0);
      expect(result.metrics.totalInvested).toBeGreaterThan(0);
      expect(result.equityCurve.length).toBe(payload.tradingDays);
    }
  });

  it('honours the requested date range', async () => {
    const { status, body } = await post({
      ticker: 'DEMO',
      start: '2023-01-01',
      end: '2023-12-31',
      strategyIds: ['weekly-monday'],
    });
    const payload = body as BacktestResponse;

    expect(status).toBe(200);
    expect(payload.start >= '2023-01-01').toBe(true);
    expect(payload.end <= '2023-12-31').toBe(true);
    // ~52 Mondays in a year.
    expect(payload.results[0].metrics.buyCount).toBeGreaterThan(45);
    expect(payload.results[0].metrics.buyCount).toBeLessThan(55);
  });

  it('rejects an unknown strategy id', async () => {
    const { status, body } = await post({ ticker: 'DEMO', strategyIds: ['buy-the-dip-lol'] });
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/Unknown strategy/);
  });

  it('rejects malformed input', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ ticker: 'DEMO', amount: -5 })).status).toBe(400);
    expect((await post({ ticker: 'DEMO', start: '01-01-2024' })).status).toBe(400);
    expect((await post({ ticker: 'DEMO', start: '2024-06-01', end: '2024-01-01' })).status).toBe(400);
  });

  it('explains a range with no usable history', async () => {
    const { status, body } = await post({ ticker: 'DEMO', start: '1970-01-01', end: '1970-02-01' });
    expect(status).toBe(422);
    expect((body as { error: string }).error).toMatch(/Not enough price history/);
  });
});
