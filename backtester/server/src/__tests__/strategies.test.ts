import { describe, expect, it } from 'vitest';
import { dayOfWeek } from '../engine/calendar.js';
import { DEFAULT_PARAMS, STRATEGY_BY_ID } from '../engine/strategies.js';
import type { Bar, StrategyParams } from '../types.js';
import { bars, weekdayBars } from './helpers.js';

function signalsFor(id: string, series: Bar[], overrides: Partial<StrategyParams> = {}): string[] {
  const strategy = STRATEGY_BY_ID.get(id)!;
  const params = { ...DEFAULT_PARAMS, ...overrides };
  return strategy.signals(series, params).map((i) => series[i].date);
}

describe('weekday strategies', () => {
  // 2024-01-01 through 2024-01-19: three full weeks of weekdays.
  const series = weekdayBars('2024-01-01', Array.from({ length: 15 }, (_, i) => 100 + i));

  it('buys once per week on the named weekday', () => {
    const mondays = signalsFor('weekly-monday', series);
    expect(mondays).toEqual(['2024-01-01', '2024-01-08', '2024-01-15']);
    expect(mondays.every((d) => dayOfWeek(d) === 1)).toBe(true);

    expect(signalsFor('weekly-wednesday', series)).toEqual(['2024-01-03', '2024-01-10', '2024-01-17']);
    expect(signalsFor('weekly-friday', series)).toEqual(['2024-01-05', '2024-01-12', '2024-01-19']);
  });

  it('rolls a holiday weekday forward to the next open day of the same week', () => {
    // Drop Monday 2024-01-08 as if the exchange were closed.
    const withHoliday = series.filter((bar) => bar.date !== '2024-01-08');
    expect(signalsFor('weekly-monday', withHoliday)).toEqual(['2024-01-01', '2024-01-09', '2024-01-15']);
  });

  it('skips the week instead when the policy says so', () => {
    const withHoliday = series.filter((bar) => bar.date !== '2024-01-08');
    expect(signalsFor('weekly-monday', withHoliday, { weekdayHolidayPolicy: 'skip' })).toEqual([
      '2024-01-01',
      '2024-01-15',
    ]);
  });

  it('does not roll a holiday into the following week', () => {
    // Friday 2024-01-05 closed: there is no later weekday in that week, so no buy.
    const withHoliday = series.filter((bar) => bar.date !== '2024-01-05');
    expect(signalsFor('weekly-friday', withHoliday)).toEqual(['2024-01-12', '2024-01-19']);
  });
});

describe('monthly strategies', () => {
  const series = bars([
    ['2024-01-02', 100],
    ['2024-01-16', 110],
    ['2024-01-31', 120],
    ['2024-02-01', 130],
    ['2024-02-14', 140],
    ['2024-02-16', 150],
    ['2024-02-29', 160],
  ]);

  it('buys the first trading day on or after the 1st', () => {
    expect(signalsFor('month-first', series)).toEqual(['2024-01-02', '2024-02-01']);
  });

  it('buys the first trading day on or after the 15th', () => {
    // February has no bar on the 15th, so the 16th takes it.
    expect(signalsFor('month-fifteenth', series)).toEqual(['2024-01-16', '2024-02-16']);
  });

  it('buys the last trading day of each month', () => {
    expect(signalsFor('month-last', series)).toEqual(['2024-01-31', '2024-02-29']);
  });
});

describe('red day', () => {
  const series = bars([
    ['2024-01-01', 100, 99], // green vs open, no previous close
    ['2024-01-02', 98, 101], // red both ways
    ['2024-01-03', 99, 97], // up vs previous close, green vs open
    ['2024-01-04', 95, 94], // red vs previous close, green vs open
  ]);

  it('defaults to a close below the previous close', () => {
    expect(signalsFor('red-day', series)).toEqual(['2024-01-02', '2024-01-04']);
  });

  it('can use close below open instead', () => {
    expect(signalsFor('red-day', series, { redDayBasis: 'open' })).toEqual(['2024-01-02']);
  });
});

describe('market crash', () => {
  it('buys once the drawdown from the running peak crosses the threshold', () => {
    const series = weekdayBars('2024-01-01', [100, 110, 104, 98, 88, 120]);
    // Peak 110 → 20% threshold triggers at 88 (-20%) only.
    expect(signalsFor('market-crash', series, { crashDrawdownPct: 20, crashCooldownDays: 0 })).toEqual([
      '2024-01-05',
    ]);
    // 10% threshold also catches 98 (-10.9%).
    expect(signalsFor('market-crash', series, { crashDrawdownPct: 10, crashCooldownDays: 0 })).toEqual([
      '2024-01-04',
      '2024-01-05',
    ]);
  });

  it('honours the cooldown between crash buys', () => {
    const series = weekdayBars('2024-01-01', [100, 80, 79, 78, 77, 76, 75]);
    const withCooldown = signalsFor('market-crash', series, { crashDrawdownPct: 10, crashCooldownDays: 3 });
    expect(withCooldown).toEqual(['2024-01-02', '2024-01-08']);
    const noCooldown = signalsFor('market-crash', series, { crashDrawdownPct: 10, crashCooldownDays: 0 });
    expect(noCooldown).toHaveLength(6);
  });

  it('never fires on a series that only goes up', () => {
    const series = weekdayBars('2024-01-01', [100, 101, 102, 103, 104]);
    expect(signalsFor('market-crash', series, { crashDrawdownPct: 10 })).toEqual([]);
  });
});

describe('benchmarks', () => {
  const series = weekdayBars('2024-01-01', [100, 101, 102]);

  it('daily benchmark buys every bar', () => {
    expect(signalsFor('benchmark-daily', series)).toHaveLength(3);
  });

  it('lump sum buys only the first bar', () => {
    expect(signalsFor('benchmark-lump-sum', series)).toEqual(['2024-01-01']);
  });
});

describe('registry', () => {
  it('exposes the ten requested strategies plus benchmarks', () => {
    const ids = [...STRATEGY_BY_ID.keys()];
    expect(ids).toEqual([
      'red-day',
      'weekly-monday',
      'weekly-tuesday',
      'weekly-wednesday',
      'weekly-thursday',
      'weekly-friday',
      'month-first',
      'month-fifteenth',
      'month-last',
      'market-crash',
      'benchmark-daily',
      'benchmark-lump-sum',
    ]);
  });
});
