import { config } from '../config.js';
import type { Bar, DataSource, PriceSeries } from '../types.js';
import { cacheGet, cacheSet } from './cache.js';
import { fetchStooq } from './stooq.js';
import { generateSyntheticBars } from './synthetic.js';
import { fetchYahoo } from './yahoo.js';

export class DataFetchError extends Error {
  constructor(message: string, readonly attempts: string[]) {
    super(message);
    this.name = 'DataFetchError';
  }
}

const LIVE_FETCHERS: Record<'stooq' | 'yahoo', (ticker: string) => Promise<Bar[]>> = {
  stooq: fetchStooq,
  yahoo: fetchYahoo,
};

function chainFor(preference: typeof config.provider): DataSource[] {
  if (preference === 'auto') return ['stooq', 'yahoo'];
  return [preference];
}

/**
 * Resolve daily history for a ticker.
 *
 * Providers are tried in order and the first success wins. If they all fail and
 * synthetic fallback is enabled, simulated bars are returned with
 * `synthetic: true` so callers can label them.
 */
export async function getPriceSeries(ticker: string): Promise<PriceSeries> {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) throw new DataFetchError('Ticker is required.', []);

  const cacheKey = `${config.provider}:${symbol}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const attempts: string[] = [];
  for (const source of chainFor(config.provider)) {
    if (source === 'synthetic') break;
    try {
      const bars = await LIVE_FETCHERS[source](symbol);
      const series: PriceSeries = { ticker: symbol, bars, source, synthetic: false };
      cacheSet(cacheKey, series);
      return series;
    } catch (error) {
      attempts.push(`${source}: ${(error as Error).message}`);
    }
  }

  if (config.provider === 'synthetic' || config.allowSyntheticFallback) {
    const series: PriceSeries = {
      ticker: symbol,
      bars: generateSyntheticBars(symbol),
      source: 'synthetic',
      synthetic: true,
    };
    cacheSet(cacheKey, series);
    return series;
  }

  throw new DataFetchError(`Could not load price history for "${symbol}".`, attempts);
}
