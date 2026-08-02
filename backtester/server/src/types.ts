/** Shared domain types. The web app re-declares the wire types in web/src/types.ts. */

/** One daily OHLCV bar. `date` is an ISO calendar date (YYYY-MM-DD), exchange local. */
export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type DataSource = 'stooq' | 'yahoo' | 'synthetic';

export interface PriceSeries {
  ticker: string;
  bars: Bar[];
  /** Which provider actually served the bars. */
  source: DataSource;
  /** True when the bars are simulated rather than real market history. */
  synthetic: boolean;
}

/** How the per-trigger purchase size is decided. */
export type AllocationMode =
  /** Invest `amount` on every trigger. Strategies that trigger more often invest more. */
  | 'fixedPerBuy'
  /** Split a fixed `amount` budget evenly across a strategy's triggers, so every
   *  strategy deploys the same total capital. Best for apples-to-apples ranking. */
  | 'fixedTotal';

export interface StrategyParams {
  /** What counts as a "red day". */
  redDayBasis: 'prevClose' | 'open';
  /** If a target weekday is a market holiday: skip that week, or buy the next open day. */
  weekdayHolidayPolicy: 'skip' | 'nextTradingDay';
  /** Drawdown from the running peak that defines a "crash", as a positive percent. */
  crashDrawdownPct: number;
  /** Minimum trading days between two crash buys. */
  crashCooldownDays: number;
}

export interface BacktestRequest {
  ticker: string;
  /** Inclusive ISO dates. Omitted values fall back to the extent of available history. */
  start?: string;
  end?: string;
  strategyIds: string[];
  amount: number;
  allocationMode: AllocationMode;
  fractionalShares: boolean;
  params: StrategyParams;
}

export interface Trade {
  date: string;
  price: number;
  shares: number;
  /** Cash actually converted into shares on this trade. */
  cost: number;
  /** Cash contributed on this trade (equals `cost` unless whole-share rounding left change). */
  contribution: number;
}

export interface EquityPoint {
  date: string;
  /** Cumulative cash contributed up to and including this day. */
  invested: number;
  /** Shares * close + uninvested cash. */
  value: number;
}

export interface StrategyMetrics {
  buyCount: number;
  totalInvested: number;
  sharesHeld: number;
  /** Contributed cash that whole-share rounding left unspent. */
  cashRemaining: number;
  finalValue: number;
  profit: number;
  /** Simple return on contributed capital. */
  roiPct: number;
  /** Money-weighted annualised return (XIRR). Null when it cannot be solved. */
  annualizedReturnPct: number | null;
  /** Average price paid per share held. */
  avgCostBasis: number;
  /** Mean close over the trading days in range — beats it and you timed entries well. */
  avgMarketPrice: number;
  /** Largest peak-to-trough decline of the portfolio value curve. */
  maxDrawdownPct: number;
  firstBuyDate: string | null;
  lastBuyDate: string | null;
  bestBuyDate: string | null;
  worstBuyDate: string | null;
}

export interface StrategyResult {
  strategyId: string;
  name: string;
  description: string;
  category: StrategyCategory;
  metrics: StrategyMetrics;
  trades: Trade[];
  equityCurve: EquityPoint[];
  /** Non-fatal notes, e.g. "strategy never triggered in this range". */
  warnings: string[];
}

export type StrategyCategory = 'dip' | 'weekday' | 'monthly' | 'benchmark';

export interface StrategyInfo {
  id: string;
  name: string;
  description: string;
  category: StrategyCategory;
}

export interface BacktestResponse {
  ticker: string;
  source: DataSource;
  synthetic: boolean;
  /** Warning shown to the user when `synthetic` is true. */
  notice: string | null;
  start: string;
  end: string;
  tradingDays: number;
  firstClose: number;
  lastClose: number;
  /** Buy-and-hold price return of the ticker over the range, for context. */
  buyAndHoldPct: number;
  priceSeries: { date: string; close: number }[];
  results: StrategyResult[];
  request: BacktestRequest;
}
