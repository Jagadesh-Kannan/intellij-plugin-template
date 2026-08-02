import type { Bar } from '../types.js';

/**
 * Deterministic simulated price history.
 *
 * Used when no live provider can be reached (offline dev, blocked egress, rate
 * limits) so the app stays demonstrable, and by the test suite so assertions do
 * not depend on the market. Every response built from it is flagged
 * `synthetic: true` and the UI shows a banner — it must never be mistaken for
 * real history.
 */

/** xorshift32 — small, fast, and reproducible across runs and machines. */
function makeRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Box-Muller transform, so the daily log-returns are actually normal. */
function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-9);
  const v = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface SyntheticOptions {
  years?: number;
  startPrice?: number;
  /** Annual drift and volatility of the log-return process. */
  drift?: number;
  volatility?: number;
}

export function generateSyntheticBars(ticker: string, options: SyntheticOptions = {}): Bar[] {
  const { years = 12, startPrice = 50, drift = 0.09, volatility = 0.28 } = options;
  const rand = makeRandom(hashString(ticker.toUpperCase()));

  const bars: Bar[] = [];
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const cursor = new Date(end);
  cursor.setUTCFullYear(cursor.getUTCFullYear() - years);

  const dt = 1 / 252;
  let price = startPrice;

  // Two drawdown episodes at fixed points in the series give the crash strategy
  // something to react to, and keep the demo data honest about downside.
  const totalDays = years * 252;
  let day = 0;

  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const inCrash =
        (day > totalDays * 0.32 && day < totalDays * 0.36) || (day > totalDays * 0.68 && day < totalDays * 0.71);
      const episodeDrift = inCrash ? -2.2 : drift;
      const episodeVol = inCrash ? volatility * 2.1 : volatility;

      const shock = episodeDrift * dt + episodeVol * Math.sqrt(dt) * gaussian(rand);
      const open = price;
      price = Math.max(0.5, price * Math.exp(shock));
      const close = price;
      const spread = Math.abs(close - open) + close * 0.004 * rand();
      bars.push({
        date: cursor.toISOString().slice(0, 10),
        open: r(open),
        high: r(Math.max(open, close) + spread * 0.6),
        low: r(Math.max(0.25, Math.min(open, close) - spread * 0.6)),
        close: r(close),
        volume: Math.round(1_000_000 + rand() * 9_000_000),
      });
      day++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return bars;
}

function r(value: number): number {
  return Math.round(value * 100) / 100;
}
