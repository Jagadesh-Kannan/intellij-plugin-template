import { describe, expect, it } from 'vitest';
import { generateSyntheticBars } from '../data/synthetic.js';
import { parseStooqCsv, stooqSymbol } from '../data/stooq.js';
import { parseYahooChart } from '../data/yahoo.js';

describe('stooq', () => {
  it('namespaces plain US tickers', () => {
    expect(stooqSymbol('AAPL')).toBe('aapl.us');
    expect(stooqSymbol('spy')).toBe('spy.us');
    expect(stooqSymbol('^spx')).toBe('^spx');
    expect(stooqSymbol('BMW.DE')).toBe('bmw.de');
  });

  it('parses daily CSV and drops malformed rows', () => {
    const csv = [
      'Date,Open,High,Low,Close,Volume',
      '2024-01-03,101,103,100,102,5000',
      '2024-01-02,100,101,99,100.5,4000',
      'garbage-row',
      '2024-01-04,0,0,0,0,0',
    ].join('\n');

    const parsed = parseStooqCsv(csv);
    expect(parsed.map((b) => b.date)).toEqual(['2024-01-02', '2024-01-03']);
    expect(parsed[1].close).toBe(102);
  });

  it('returns nothing for an error page', () => {
    expect(parseStooqCsv('Exceeded the daily hits limit')).toEqual([]);
  });
});

describe('yahoo', () => {
  it('scales the whole bar by the adjusted-close factor', () => {
    const bars = parseYahooChart({
      chart: {
        result: [
          {
            timestamp: [1704240000], // 2024-01-03
            indicators: {
              quote: [{ open: [200], high: [210], low: [190], close: [200], volume: [1000] }],
              adjclose: [{ adjclose: [100] }],
            },
          },
        ],
      },
    });

    expect(bars).toHaveLength(1);
    // A 2:1 split factor halves every price but leaves the shape of the bar.
    expect(bars[0].close).toBe(100);
    expect(bars[0].open).toBe(100);
    expect(bars[0].high).toBe(105);
    expect(bars[0].low).toBe(95);
  });

  it('skips days with no close', () => {
    const bars = parseYahooChart({
      chart: {
        result: [
          {
            timestamp: [1704240000, 1704326400],
            indicators: { quote: [{ close: [null, 50] }] },
          },
        ],
      },
    });
    expect(bars).toHaveLength(1);
    expect(bars[0].close).toBe(50);
  });

  it('handles an empty payload', () => {
    expect(parseYahooChart({})).toEqual([]);
    expect(parseYahooChart({ chart: { result: [] } })).toEqual([]);
  });
});

describe('synthetic provider', () => {
  it('is deterministic per ticker', () => {
    const a = generateSyntheticBars('DEMO', { years: 3 });
    const b = generateSyntheticBars('DEMO', { years: 3 });
    expect(a).toEqual(b);
    expect(generateSyntheticBars('OTHER', { years: 3 })[10].close).not.toBe(a[10].close);
  });

  it('emits chronological weekday bars with sane OHLC', () => {
    const series = generateSyntheticBars('DEMO', { years: 2 });
    expect(series.length).toBeGreaterThan(400);

    for (let i = 0; i < series.length; i++) {
      const bar = series[i];
      const dow = new Date(`${bar.date}T00:00:00Z`).getUTCDay();
      expect(dow).toBeGreaterThan(0);
      expect(dow).toBeLessThan(6);
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close) - 1e-9);
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close) + 1e-9);
      expect(bar.close).toBeGreaterThan(0);
      if (i > 0) expect(bar.date > series[i - 1].date).toBe(true);
    }
  });

  it('contains a drawdown deep enough to exercise the crash strategy', () => {
    const series = generateSyntheticBars('DEMO', { years: 12 });
    let peak = -Infinity;
    let worst = 0;
    for (const bar of series) {
      peak = Math.max(peak, bar.close);
      worst = Math.min(worst, bar.close / peak - 1);
    }
    expect(worst).toBeLessThan(-0.1);
  });
});
