import type { Bar, PriceSeries, StrategyParams } from '../types.js';
import { round } from '../engine/metrics.js';
import { STRATEGIES } from '../engine/strategies.js';

/**
 * Post-close market scan.
 *
 * This reports which of the backtested rules fire on the most recent bar. It is
 * signal reporting, not a recommendation: a rule firing means "this strategy
 * would have bought today", nothing more.
 */

export interface TickerScan {
  ticker: string;
  lastDate: string;
  close: number;
  prevClose: number;
  dayChangePct: number;
  /** Decline from the trailing 52-week closing high. Negative or zero. */
  drawdownPct: number;
  high52w: number;
  /** Names of the strategies that would buy on this bar. */
  triggered: string[];
}

export interface MarketScan {
  index: TickerScan;
  crash: boolean;
  crashThresholdPct: number;
}

export interface ScanReport {
  asOf: string;
  market: MarketScan;
  tickers: TickerScan[];
  /** Tickers whose crash rule fired, deepest drawdown first. */
  crashCandidates: TickerScan[];
  /** Data freshness warnings — a stale feed makes the whole report suspect. */
  warnings: string[];
}

const TRADING_DAYS_PER_YEAR = 252;

/** Highest close over the trailing window ending at `endIndex` (inclusive). */
export function trailingHigh(bars: Bar[], endIndex: number, window = TRADING_DAYS_PER_YEAR): number {
  const start = Math.max(0, endIndex - window + 1);
  let high = -Infinity;
  for (let i = start; i <= endIndex; i++) {
    if (bars[i].close > high) high = bars[i].close;
  }
  return high;
}

/**
 * Evaluate every strategy against the final bar.
 *
 * Each strategy's own `signals()` is reused rather than reimplemented, so the
 * scan can never drift from what the backtest measured.
 */
export function scanTicker(series: PriceSeries, params: StrategyParams): TickerScan {
  const bars = series.bars;
  if (bars.length < 2) throw new Error(`Not enough history for ${series.ticker}`);

  const last = bars.length - 1;
  const close = bars[last].close;
  const prevClose = bars[last - 1].close;
  const high52w = trailingHigh(bars, last);

  const triggered = STRATEGIES.filter((strategy) => {
    if (strategy.category === 'benchmark') return false;
    const signals = strategy.signals(bars, params);
    return signals.length > 0 && signals[signals.length - 1] === last;
  }).map((strategy) => strategy.name);

  return {
    ticker: series.ticker,
    lastDate: bars[last].date,
    close: round(close, 4),
    prevClose: round(prevClose, 4),
    dayChangePct: round((close / prevClose - 1) * 100, 2),
    drawdownPct: round((close / high52w - 1) * 100, 2),
    high52w: round(high52w, 4),
    triggered,
  };
}

/**
 * Flag a stale feed. Providers publish end-of-day bars a few hours after the
 * close, and a weekend or holiday legitimately leaves the last bar behind, so
 * this only complains past a few days.
 */
export function stalenessWarning(lastDate: string, today: string, maxLagDays = 4): string | null {
  const lagMs = new Date(`${today}T00:00:00Z`).getTime() - new Date(`${lastDate}T00:00:00Z`).getTime();
  const lagDays = Math.floor(lagMs / (24 * 60 * 60 * 1000));
  if (lagDays > maxLagDays) {
    return `Latest bar is ${lastDate}, ${lagDays} days behind ${today}. The feed may be stale — treat this report as unreliable.`;
  }
  return null;
}

export function buildReport(
  indexSeries: PriceSeries,
  tickerSeries: PriceSeries[],
  params: StrategyParams,
  today: string,
): ScanReport {
  const warnings: string[] = [];
  const index = scanTicker(indexSeries, params);

  const tickers = tickerSeries.map((series) => scanTicker(series, params));
  for (const series of [indexSeries, ...tickerSeries]) {
    const scan = series === indexSeries ? index : tickers.find((t) => t.ticker === series.ticker)!;
    const warning = stalenessWarning(scan.lastDate, today);
    if (warning) warnings.push(`${scan.ticker}: ${warning}`);
  }

  const crashName = STRATEGIES.find((s) => s.id === 'market-crash')!.name;
  const crashCandidates = tickers
    .filter((t) => t.triggered.includes(crashName))
    .sort((a, b) => a.drawdownPct - b.drawdownPct);

  return {
    asOf: today,
    market: {
      index,
      crash: index.drawdownPct <= -Math.abs(params.crashDrawdownPct),
      crashThresholdPct: params.crashDrawdownPct,
    },
    tickers,
    crashCandidates,
    warnings,
  };
}

function pct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatReport(report: ScanReport): string {
  const lines: string[] = [];
  const { index, crash, crashThresholdPct } = report.market;

  lines.push(`Market scan — ${report.asOf}`);
  lines.push('='.repeat(52));
  lines.push('');
  lines.push(
    `${index.ticker}  ${index.close}  ${pct(index.dayChangePct)} on the day  ·  ${pct(index.drawdownPct)} from its 52-week high`,
  );

  if (crash) {
    lines.push('');
    lines.push(`*** MARKET CRASH: ${index.ticker} is ${pct(index.drawdownPct)} off its 52-week high,`);
    lines.push(`    past the ${crashThresholdPct}% threshold. ***`);
  } else {
    lines.push(`No crash: drawdown has not reached the ${crashThresholdPct}% threshold.`);
  }

  if (report.crashCandidates.length > 0) {
    lines.push('');
    lines.push('Crash rule fired on (deepest drawdown first):');
    for (const t of report.crashCandidates) {
      lines.push(`  ${t.ticker.padEnd(6)} ${String(t.close).padStart(9)}  ${pct(t.drawdownPct).padStart(8)} from 52w high`);
    }
  }

  const withSignals = report.tickers.filter((t) => t.triggered.length > 0);
  lines.push('');
  lines.push(`Rules firing today (${withSignals.length} of ${report.tickers.length} tickers):`);
  if (withSignals.length === 0) {
    lines.push('  none');
  }
  for (const t of withSignals) {
    lines.push(`  ${t.ticker.padEnd(6)} ${pct(t.dayChangePct).padStart(8)}  ${t.triggered.join(', ')}`);
  }

  if (report.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of report.warnings) lines.push(`  ! ${warning}`);
  }

  lines.push('');
  lines.push('These are mechanical rule triggers on closing prices, not investment advice.');
  return lines.join('\n');
}
