import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../engine/strategies.js';
import { buildReport, formatReport, scanTicker, stalenessWarning, trailingHigh } from '../scan/report.js';
import type { Bar, PriceSeries } from '../types.js';
import { weekdayBars } from './helpers.js';

function series(ticker: string, bars: Bar[]): PriceSeries {
  return { ticker, bars, source: 'stooq', synthetic: false };
}

describe('trailingHigh', () => {
  it('takes the highest close in the window', () => {
    const bars = weekdayBars('2024-01-01', [10, 30, 20, 25]);
    expect(trailingHigh(bars, 3)).toBe(30);
  });

  it('ignores closes older than the window', () => {
    const bars = weekdayBars('2024-01-01', [100, 10, 20, 30]);
    expect(trailingHigh(bars, 3, 3)).toBe(30);
  });
});

describe('scanTicker', () => {
  it('reports the day move and drawdown from the trailing high', () => {
    const scan = scanTicker(series('TEST', weekdayBars('2024-01-01', [100, 120, 90])), DEFAULT_PARAMS);

    expect(scan.close).toBe(90);
    expect(scan.prevClose).toBe(120);
    expect(scan.dayChangePct).toBe(-25);
    expect(scan.high52w).toBe(120);
    expect(scan.drawdownPct).toBe(-25);
  });

  it('fires the red-day rule on a down close', () => {
    const scan = scanTicker(series('TEST', weekdayBars('2024-01-01', [100, 99])), DEFAULT_PARAMS);
    expect(scan.triggered).toContain('Buy on red day');
  });

  it('does not fire the red-day rule on an up close', () => {
    const scan = scanTicker(series('TEST', weekdayBars('2024-01-01', [100, 101])), DEFAULT_PARAMS);
    expect(scan.triggered).not.toContain('Buy on red day');
  });

  it('fires the crash rule only past the threshold', () => {
    const shallow = scanTicker(series('TEST', weekdayBars('2024-01-01', [100, 95])), DEFAULT_PARAMS);
    expect(shallow.triggered).not.toContain('Buy on market crash');

    const deep = scanTicker(series('TEST', weekdayBars('2024-01-01', [100, 80])), DEFAULT_PARAMS);
    expect(deep.triggered).toContain('Buy on market crash');
  });

  it('fires the weekday rule matching the last bar', () => {
    // 2024-01-01 is a Monday, so a series ending 2024-01-03 ends on a Wednesday.
    const scan = scanTicker(series('TEST', weekdayBars('2024-01-01', [100, 101, 102])), DEFAULT_PARAMS);
    expect(scan.triggered).toContain('Buy every Wednesday');
    expect(scan.triggered).not.toContain('Buy every Monday');
  });

  it('never reports a benchmark as a trigger', () => {
    const scan = scanTicker(series('TEST', weekdayBars('2024-01-01', [100, 99])), DEFAULT_PARAMS);
    expect(scan.triggered.join(' ')).not.toMatch(/Benchmark/);
  });

  it('rejects a series too short to compare', () => {
    expect(() => scanTicker(series('TEST', weekdayBars('2024-01-01', [100])), DEFAULT_PARAMS)).toThrow(
      /Not enough history/,
    );
  });
});

describe('stalenessWarning', () => {
  it('stays quiet across a normal weekend', () => {
    expect(stalenessWarning('2024-01-05', '2024-01-08')).toBeNull();
  });

  it('complains when the feed falls far behind', () => {
    expect(stalenessWarning('2024-01-01', '2024-01-20')).toMatch(/stale/);
  });
});

describe('buildReport', () => {
  const params = { ...DEFAULT_PARAMS, crashDrawdownPct: 10 };

  it('flags a market crash from the index drawdown', () => {
    const index = series('SPY', weekdayBars('2024-01-01', [100, 120, 100]));
    const report = buildReport(index, [], params, '2024-01-03');

    expect(report.market.crash).toBe(true);
    expect(report.market.index.drawdownPct).toBeCloseTo(-16.67, 1);
    expect(formatReport(report)).toMatch(/MARKET CRASH/);
  });

  it('reports no crash on a shallow dip', () => {
    const index = series('SPY', weekdayBars('2024-01-01', [100, 102, 99]));
    const report = buildReport(index, [], params, '2024-01-03');

    expect(report.market.crash).toBe(false);
    expect(formatReport(report)).toMatch(/No crash/);
  });

  it('ranks crash candidates by depth of drawdown', () => {
    const index = series('SPY', weekdayBars('2024-01-01', [100, 101, 102]));
    const mild = series('MILD', weekdayBars('2024-01-01', [100, 100, 88]));
    const deep = series('DEEP', weekdayBars('2024-01-01', [100, 100, 60]));
    const flat = series('FLAT', weekdayBars('2024-01-01', [100, 100, 100]));

    const report = buildReport(index, [mild, deep, flat], params, '2024-01-03');

    expect(report.crashCandidates.map((t) => t.ticker)).toEqual(['DEEP', 'MILD']);
  });

  it('surfaces a stale feed as a warning', () => {
    const index = series('SPY', weekdayBars('2024-01-01', [100, 101, 102]));
    const report = buildReport(index, [], params, '2024-03-01');

    expect(report.warnings.join(' ')).toMatch(/stale/);
    expect(formatReport(report)).toMatch(/Warnings:/);
  });

  it('always labels the output as non-advice', () => {
    const index = series('SPY', weekdayBars('2024-01-01', [100, 101, 102]));
    expect(formatReport(buildReport(index, [], params, '2024-01-03'))).toMatch(/not investment advice/);
  });
});
