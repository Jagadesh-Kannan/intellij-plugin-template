import type {
  AllocationMode,
  Bar,
  EquityPoint,
  StrategyMetrics,
  StrategyParams,
  StrategyResult,
  Trade,
} from '../types.js';
import { round, maxDrawdownPct, xirr, type CashFlow } from './metrics.js';
import type { Strategy } from './strategies.js';

export interface RunOptions {
  amount: number;
  allocationMode: AllocationMode;
  fractionalShares: boolean;
  params: StrategyParams;
}

const EMPTY_METRICS: StrategyMetrics = {
  buyCount: 0,
  totalInvested: 0,
  sharesHeld: 0,
  cashRemaining: 0,
  finalValue: 0,
  profit: 0,
  roiPct: 0,
  annualizedReturnPct: null,
  avgCostBasis: 0,
  avgMarketPrice: 0,
  maxDrawdownPct: 0,
  firstBuyDate: null,
  lastBuyDate: null,
  bestBuyDate: null,
  worstBuyDate: null,
};

/**
 * Simulate one strategy over `bars`.
 *
 * Every buy executes at that day's close — the strategies here are all decided
 * from closing data, so filling at the same close is the only assumption that
 * does not quietly grant hindsight.
 */
export function runStrategy(strategy: Strategy, bars: Bar[], options: RunOptions): StrategyResult {
  const warnings: string[] = [];
  const base = {
    strategyId: strategy.id,
    name: strategy.name,
    description: strategy.description,
    category: strategy.category,
  };

  if (bars.length === 0) {
    return { ...base, metrics: EMPTY_METRICS, trades: [], equityCurve: [], warnings: ['No price data in range.'] };
  }

  const signals = strategy.signals(bars, options.params);
  if (signals.length === 0) {
    warnings.push('This strategy never triggered over the selected range.');
    return { ...base, metrics: { ...EMPTY_METRICS, avgMarketPrice: averageClose(bars) }, trades: [], equityCurve: [], warnings };
  }

  const contributionPerBuy =
    options.allocationMode === 'fixedTotal' ? options.amount / signals.length : options.amount;

  if (options.allocationMode === 'fixedTotal' && contributionPerBuy < 1) {
    warnings.push(
      `Budget split across ${signals.length} triggers is only ${contributionPerBuy.toFixed(2)} per buy.`,
    );
  }

  const signalSet = new Set(signals);
  const trades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];
  const flows: CashFlow[] = [];

  let shares = 0;
  let cash = 0;
  let invested = 0;
  let shareCost = 0;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (signalSet.has(i)) {
      cash += contributionPerBuy;
      invested += contributionPerBuy;
      flows.push({ date: bar.date, amount: -contributionPerBuy });

      let bought: number;
      if (options.fractionalShares) {
        bought = cash / bar.close;
      } else {
        bought = Math.floor(cash / bar.close);
      }
      const cost = bought * bar.close;
      cash -= cost;
      shares += bought;
      shareCost += cost;
      trades.push({
        date: bar.date,
        price: round(bar.close, 4),
        shares: round(bought, 8),
        cost: round(cost, 2),
        contribution: round(contributionPerBuy, 2),
      });
    }
    equityCurve.push({
      date: bar.date,
      invested: round(invested, 2),
      value: round(shares * bar.close + cash, 2),
    });
  }

  const lastBar = bars[bars.length - 1];
  const finalValue = shares * lastBar.close + cash;
  if (finalValue > 0) flows.push({ date: lastBar.date, amount: finalValue });

  const executed = trades.filter((t) => t.shares > 0);
  if (!options.fractionalShares && executed.length < trades.length) {
    warnings.push(
      `${trades.length - executed.length} of ${trades.length} triggers bought no shares — the contribution was below one share price. That cash carried forward.`,
    );
  }

  const priced = [...executed].sort((a, b) => a.price - b.price);
  const annualized = xirr(flows);

  const metrics: StrategyMetrics = {
    buyCount: executed.length,
    totalInvested: round(invested, 2),
    sharesHeld: round(shares, 6),
    cashRemaining: round(cash, 2),
    finalValue: round(finalValue, 2),
    profit: round(finalValue - invested, 2),
    roiPct: invested > 0 ? round(((finalValue - invested) / invested) * 100, 4) : 0,
    annualizedReturnPct: annualized === null ? null : round(annualized * 100, 4),
    avgCostBasis: shares > 0 ? round(shareCost / shares, 4) : 0,
    avgMarketPrice: averageClose(bars),
    maxDrawdownPct: round(maxDrawdownPct(equityCurve), 4),
    firstBuyDate: trades.length ? trades[0].date : null,
    lastBuyDate: trades.length ? trades[trades.length - 1].date : null,
    bestBuyDate: priced.length ? priced[0].date : null,
    worstBuyDate: priced.length ? priced[priced.length - 1].date : null,
  };

  return { ...base, metrics, trades, equityCurve, warnings };
}

function averageClose(bars: Bar[]): number {
  if (bars.length === 0) return 0;
  const sum = bars.reduce((acc, bar) => acc + bar.close, 0);
  return round(sum / bars.length, 4);
}

/** Restrict a series to an inclusive ISO date window. */
export function sliceRange(bars: Bar[], start?: string, end?: string): Bar[] {
  return bars.filter((bar) => (!start || bar.date >= start) && (!end || bar.date <= end));
}
