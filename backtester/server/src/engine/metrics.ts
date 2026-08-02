import type { EquityPoint } from '../types.js';
import { yearFraction } from './calendar.js';

export interface CashFlow {
  date: string;
  /** Negative for money paid in, positive for money returned. */
  amount: number;
}

function npv(flows: CashFlow[], rate: number, anchor: string): number {
  let total = 0;
  for (const flow of flows) {
    const years = yearFraction(anchor, flow.date);
    total += flow.amount / Math.pow(1 + rate, years);
  }
  return total;
}

/**
 * Money-weighted annualised return (XIRR), solved by bisection.
 *
 * Bisection rather than Newton-Raphson: DCA cash-flow streams routinely produce
 * flat or steep regions where Newton overshoots, and we only need 1e-7 here.
 * Returns null when the flows do not bracket a root (e.g. a total wipeout, or
 * every flow pointing the same way).
 */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const hasInflow = flows.some((f) => f.amount > 0);
  const hasOutflow = flows.some((f) => f.amount < 0);
  if (!hasInflow || !hasOutflow) return null;

  const anchor = flows[0].date;
  let low = -0.9999;
  let high = 10;
  let fLow = npv(flows, low, anchor);
  let fHigh = npv(flows, high, anchor);
  if (Number.isNaN(fLow) || Number.isNaN(fHigh) || fLow * fHigh > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const fMid = npv(flows, mid, anchor);
    if (Math.abs(fMid) < 1e-7 || high - low < 1e-9) return mid;
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

/**
 * Largest peak-to-trough decline of the portfolio value, as a positive percent.
 *
 * Contributions are netted out of the running peak so that new cash arriving
 * mid-drawdown does not register as a recovery it did not earn.
 */
export function maxDrawdownPct(curve: EquityPoint[]): number {
  let peakExcess = -Infinity;
  let worst = 0;
  for (const point of curve) {
    const excess = point.value - point.invested;
    if (excess > peakExcess) peakExcess = excess;
    if (point.invested <= 0) continue;
    const drop = (peakExcess - excess) / point.invested;
    if (drop > worst) worst = drop;
  }
  return worst * 100;
}

export function round(value: number, digits = 6): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}
