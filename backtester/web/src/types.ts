/** Wire types — mirrors server/src/types.ts. */

export type AllocationMode = 'fixedPerBuy' | 'fixedTotal';
export type StrategyCategory = 'dip' | 'weekday' | 'monthly' | 'benchmark';
export type DataSource = 'stooq' | 'yahoo' | 'synthetic';

export interface StrategyParams {
  redDayBasis: 'prevClose' | 'open';
  weekdayHolidayPolicy: 'skip' | 'nextTradingDay';
  crashDrawdownPct: number;
  crashCooldownDays: number;
}

export interface StrategyInfo {
  id: string;
  name: string;
  description: string;
  category: StrategyCategory;
}

export interface BacktestRequest {
  ticker: string;
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
  cost: number;
  contribution: number;
}

export interface EquityPoint {
  date: string;
  invested: number;
  value: number;
}

export interface StrategyMetrics {
  buyCount: number;
  totalInvested: number;
  sharesHeld: number;
  cashRemaining: number;
  finalValue: number;
  profit: number;
  roiPct: number;
  annualizedReturnPct: number | null;
  avgCostBasis: number;
  avgMarketPrice: number;
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
  warnings: string[];
}

export interface BacktestResponse {
  ticker: string;
  source: DataSource;
  synthetic: boolean;
  notice: string | null;
  start: string;
  end: string;
  tradingDays: number;
  firstClose: number;
  lastClose: number;
  buyAndHoldPct: number;
  priceSeries: { date: string; close: number }[];
  results: StrategyResult[];
  request: BacktestRequest;
}
