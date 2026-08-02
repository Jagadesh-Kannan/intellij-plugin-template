import type { Bar, StrategyCategory, StrategyInfo, StrategyParams } from '../types.js';
import { dayOfMonth, dayOfWeek, groupIndices, monthKey, weekKey } from './calendar.js';

export interface Strategy extends StrategyInfo {
  /** Indices into `bars` on which this strategy buys, ascending. */
  signals(bars: Bar[], params: StrategyParams): number[];
}

export const DEFAULT_PARAMS: StrategyParams = {
  redDayBasis: 'prevClose',
  weekdayHolidayPolicy: 'nextTradingDay',
  crashDrawdownPct: 10,
  crashCooldownDays: 20,
};

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * One buy per calendar week on `targetDow`. When the exchange was closed that
 * weekday, `nextTradingDay` rolls forward to the next open day inside the same
 * week; `skip` passes on the week entirely.
 */
function weekdaySignals(bars: Bar[], targetDow: number, params: StrategyParams): number[] {
  const out: number[] = [];
  for (const indices of groupIndices(bars, weekKey).values()) {
    const exact = indices.find((i) => dayOfWeek(bars[i].date) === targetDow);
    if (exact !== undefined) {
      out.push(exact);
      continue;
    }
    if (params.weekdayHolidayPolicy === 'nextTradingDay') {
      const next = indices.find((i) => dayOfWeek(bars[i].date) > targetDow);
      if (next !== undefined) out.push(next);
    }
  }
  return out.sort((a, b) => a - b);
}

/** First trading day on or after `targetDom` within each calendar month. */
function monthDaySignals(bars: Bar[], targetDom: number): number[] {
  const out: number[] = [];
  for (const indices of groupIndices(bars, monthKey).values()) {
    const hit = indices.find((i) => dayOfMonth(bars[i].date) >= targetDom);
    if (hit !== undefined) out.push(hit);
  }
  return out.sort((a, b) => a - b);
}

function makeWeekdayStrategy(dow: number): Strategy {
  const name = WEEKDAY_NAMES[dow];
  return {
    id: `weekly-${name.toLowerCase()}`,
    name: `Buy every ${name}`,
    description: `One purchase per week on ${name}'s close. If ${name} is a market holiday, the buy rolls to the next open day that week (configurable).`,
    category: 'weekday',
    signals: (bars, params) => weekdaySignals(bars, dow, params),
  };
}

const redDay: Strategy = {
  id: 'red-day',
  name: 'Buy on red day',
  description:
    'Buy on every down day. "Red" defaults to a close below the previous close; it can also be read as a close below that day\'s open.',
  category: 'dip',
  signals: (bars, params) => {
    const out: number[] = [];
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      if (params.redDayBasis === 'open') {
        if (bar.close < bar.open) out.push(i);
      } else if (i > 0 && bar.close < bars[i - 1].close) {
        out.push(i);
      }
    }
    return out;
  },
};

const firstOfMonth: Strategy = {
  id: 'month-first',
  name: 'Buy 1st of the month',
  description: 'One purchase per month on the first trading day on or after the 1st.',
  category: 'monthly',
  signals: (bars) => monthDaySignals(bars, 1),
};

const fifteenthOfMonth: Strategy = {
  id: 'month-fifteenth',
  name: 'Buy 15th of the month',
  description: 'One purchase per month on the first trading day on or after the 15th.',
  category: 'monthly',
  signals: (bars) => monthDaySignals(bars, 15),
};

const lastOfMonth: Strategy = {
  id: 'month-last',
  name: 'Buy last day of month',
  description: 'One purchase per month on the final trading day of that month.',
  category: 'monthly',
  signals: (bars) => {
    const out: number[] = [];
    for (const indices of groupIndices(bars, monthKey).values()) {
      out.push(indices[indices.length - 1]);
    }
    return out.sort((a, b) => a - b);
  },
};

const marketCrash: Strategy = {
  id: 'market-crash',
  name: 'Buy on market crash',
  description:
    'Buy when the close sits at least N% below its running all-time high within the tested range. A cooldown keeps a long drawdown from firing every single day.',
  category: 'dip',
  signals: (bars, params) => {
    const threshold = -Math.abs(params.crashDrawdownPct) / 100;
    const cooldown = Math.max(0, Math.floor(params.crashCooldownDays));
    const out: number[] = [];
    let peak = -Infinity;
    let lastBuy = -Infinity;
    for (let i = 0; i < bars.length; i++) {
      const close = bars[i].close;
      if (close > peak) peak = close;
      const drawdown = close / peak - 1;
      // Tolerance so a price exactly at the threshold counts: 88/110 - 1 is
      // -0.19999999999999996 in binary floating point, not -0.2.
      if (drawdown <= threshold + 1e-9 && i - lastBuy > cooldown) {
        out.push(i);
        lastBuy = i;
      }
    }
    return out;
  },
};

const everyTradingDay: Strategy = {
  id: 'benchmark-daily',
  name: 'Benchmark: buy every trading day',
  description: 'Baseline dollar-cost averaging with no timing rule at all.',
  category: 'benchmark',
  signals: (bars) => bars.map((_, i) => i),
};

const lumpSum: Strategy = {
  id: 'benchmark-lump-sum',
  name: 'Benchmark: lump sum on day one',
  description: 'Deploy everything on the first trading day of the range and hold.',
  category: 'benchmark',
  signals: (bars) => (bars.length ? [0] : []),
};

export const STRATEGIES: Strategy[] = [
  redDay,
  makeWeekdayStrategy(1),
  makeWeekdayStrategy(2),
  makeWeekdayStrategy(3),
  makeWeekdayStrategy(4),
  makeWeekdayStrategy(5),
  firstOfMonth,
  fifteenthOfMonth,
  lastOfMonth,
  marketCrash,
  everyTradingDay,
  lumpSum,
];

export const STRATEGY_BY_ID = new Map(STRATEGIES.map((s) => [s.id, s]));

/** Everything except the benchmarks — the ten strategies under test. */
export const CORE_STRATEGY_IDS = STRATEGIES.filter((s) => s.category !== 'benchmark').map((s) => s.id);

export function listStrategies(): StrategyInfo[] {
  return STRATEGIES.map(({ id, name, description, category }) => ({ id, name, description, category }));
}

export function strategyCategories(): StrategyCategory[] {
  return ['dip', 'weekday', 'monthly', 'benchmark'];
}
