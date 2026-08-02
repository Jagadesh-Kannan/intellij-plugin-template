import { describe, expect, it } from 'vitest';
import { runStrategy, sliceRange } from '../engine/backtest.js';
import { maxDrawdownPct, xirr } from '../engine/metrics.js';
import { DEFAULT_PARAMS, STRATEGY_BY_ID } from '../engine/strategies.js';
import type { RunOptions } from '../engine/backtest.js';
import { bars, weekdayBars } from './helpers.js';

const baseOptions: RunOptions = {
  amount: 100,
  allocationMode: 'fixedPerBuy',
  fractionalShares: true,
  params: DEFAULT_PARAMS,
};

const daily = STRATEGY_BY_ID.get('benchmark-daily')!;
const lumpSum = STRATEGY_BY_ID.get('benchmark-lump-sum')!;

describe('runStrategy', () => {
  it('accumulates one contribution per trigger', () => {
    const series = weekdayBars('2024-01-01', [100, 100, 100]);
    const result = runStrategy(daily, series, baseOptions);

    expect(result.metrics.buyCount).toBe(3);
    expect(result.metrics.totalInvested).toBe(300);
    expect(result.metrics.sharesHeld).toBe(3);
    expect(result.metrics.finalValue).toBe(300);
    expect(result.metrics.roiPct).toBe(0);
    expect(result.metrics.avgCostBasis).toBe(100);
  });

  it('prices the position at the final close', () => {
    const series = weekdayBars('2024-01-01', [100, 50, 200]);
    const result = runStrategy(daily, series, baseOptions);

    // 1 share at 100, 2 at 50, 0.5 at 200 = 3.5 shares for $300.
    expect(result.metrics.sharesHeld).toBeCloseTo(3.5, 6);
    expect(result.metrics.finalValue).toBeCloseTo(700, 4);
    expect(result.metrics.roiPct).toBeCloseTo(133.3333, 3);
    expect(result.metrics.avgCostBasis).toBeCloseTo(85.7143, 3);
  });

  it('splits a fixed budget evenly across triggers in fixedTotal mode', () => {
    const series = weekdayBars('2024-01-01', [100, 100, 100, 100]);
    const result = runStrategy(daily, series, { ...baseOptions, amount: 400, allocationMode: 'fixedTotal' });

    expect(result.metrics.totalInvested).toBe(400);
    expect(result.trades.every((t) => t.contribution === 100)).toBe(true);
  });

  it('gives every strategy the same capital in fixedTotal mode', () => {
    const series = weekdayBars('2024-01-01', Array.from({ length: 40 }, (_, i) => 100 + i));
    const options: RunOptions = { ...baseOptions, amount: 1200, allocationMode: 'fixedTotal' };
    const monday = runStrategy(STRATEGY_BY_ID.get('weekly-monday')!, series, options);
    const everyDay = runStrategy(daily, series, options);

    expect(monday.metrics.totalInvested).toBeCloseTo(1200, 6);
    expect(everyDay.metrics.totalInvested).toBeCloseTo(1200, 6);
    expect(monday.metrics.buyCount).toBeLessThan(everyDay.metrics.buyCount);
  });

  it('carries leftover cash forward when fractional shares are off', () => {
    const series = weekdayBars('2024-01-01', [100, 100, 100]);
    const result = runStrategy(daily, series, { ...baseOptions, amount: 150, fractionalShares: false });

    // 150 → 1 share, 50 left; 50+150 → 2 shares, 0 left; 150 → 1 share, 50 left.
    expect(result.trades.map((t) => t.shares)).toEqual([1, 2, 1]);
    expect(result.metrics.sharesHeld).toBe(4);
    expect(result.metrics.cashRemaining).toBe(50);
    expect(result.metrics.totalInvested).toBe(450);
    expect(result.metrics.finalValue).toBe(450);
  });

  it('warns when a whole-share contribution cannot buy anything', () => {
    const series = weekdayBars('2024-01-01', [500, 500]);
    const result = runStrategy(daily, series, { ...baseOptions, amount: 100, fractionalShares: false });

    expect(result.metrics.buyCount).toBe(0);
    expect(result.metrics.sharesHeld).toBe(0);
    expect(result.metrics.cashRemaining).toBe(200);
    expect(result.warnings.join(' ')).toMatch(/below one share price/);
  });

  it('reports the best and worst entry prices', () => {
    const series = weekdayBars('2024-01-01', [120, 80, 100]);
    const result = runStrategy(daily, series, baseOptions);

    expect(result.metrics.bestBuyDate).toBe(result.trades[1].date);
    expect(result.metrics.worstBuyDate).toBe(result.trades[0].date);
  });

  it('returns an empty result with a warning when nothing triggers', () => {
    const series = weekdayBars('2024-01-01', [100, 101, 102]);
    const result = runStrategy(STRATEGY_BY_ID.get('market-crash')!, series, baseOptions);

    expect(result.metrics.buyCount).toBe(0);
    expect(result.metrics.totalInvested).toBe(0);
    expect(result.trades).toEqual([]);
    expect(result.warnings[0]).toMatch(/never triggered/);
  });

  it('builds an equity curve covering every bar', () => {
    const series = weekdayBars('2024-01-01', [100, 110, 120]);
    const result = runStrategy(lumpSum, series, baseOptions);

    expect(result.equityCurve).toHaveLength(3);
    expect(result.equityCurve[0]).toEqual({ date: series[0].date, invested: 100, value: 100 });
    expect(result.equityCurve[2].value).toBeCloseTo(120, 4);
    expect(result.equityCurve[2].invested).toBe(100);
  });

  it('annualises a one-year lump sum correctly', () => {
    const series = bars([
      ['2020-01-01', 100],
      ['2021-01-01', 110],
    ]);
    const result = runStrategy(lumpSum, series, baseOptions);
    expect(result.metrics.annualizedReturnPct! / 100).toBeCloseTo(0.0993, 3);
  });
});

describe('sliceRange', () => {
  const series = bars([
    ['2024-01-01', 100],
    ['2024-02-01', 110],
    ['2024-03-01', 120],
  ]);

  it('filters inclusively on both ends', () => {
    expect(sliceRange(series, '2024-01-01', '2024-02-01').map((b) => b.date)).toEqual(['2024-01-01', '2024-02-01']);
    expect(sliceRange(series, '2024-02-01').map((b) => b.date)).toEqual(['2024-02-01', '2024-03-01']);
    expect(sliceRange(series).map((b) => b.date)).toHaveLength(3);
  });
});

describe('metrics', () => {
  it('solves XIRR for a simple one-year flow', () => {
    const rate = xirr([
      { date: '2020-01-01', amount: -1000 },
      { date: '2021-01-01', amount: 1100 },
    ]);
    expect(rate).toBeCloseTo(0.0993, 3);
  });

  it('returns null when the flows do not bracket a root', () => {
    expect(xirr([{ date: '2020-01-01', amount: -100 }])).toBeNull();
    expect(
      xirr([
        { date: '2020-01-01', amount: -100 },
        { date: '2021-01-01', amount: -100 },
      ]),
    ).toBeNull();
  });

  it('measures drawdown against gains rather than fresh contributions', () => {
    const curve = [
      { date: '2024-01-01', invested: 100, value: 100 },
      { date: '2024-01-02', invested: 100, value: 150 },
      { date: '2024-01-03', invested: 100, value: 120 },
    ];
    // Peak excess +50, trough excess +20, on 100 invested = 30%.
    expect(maxDrawdownPct(curve)).toBeCloseTo(30, 6);
  });

  it('reports no drawdown for a curve that only rises', () => {
    const curve = [
      { date: '2024-01-01', invested: 100, value: 100 },
      { date: '2024-01-02', invested: 100, value: 120 },
    ];
    expect(maxDrawdownPct(curve)).toBe(0);
  });
});
