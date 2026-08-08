import { readFileSync } from 'node:fs';
import { getPriceSeries } from '../data/provider.js';
import { DEFAULT_PARAMS } from '../engine/strategies.js';
import type { PriceSeries, StrategyParams } from '../types.js';
import { buildReport, formatReport } from './report.js';

/**
 * Post-close market scan, meant to be run on a schedule after the US close.
 *
 * Exit codes: 0 no crash, 2 crash detected (so a wrapper can escalate the
 * notification), 1 the scan could not be trusted.
 */

const DEFAULT_WATCHLIST = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META'];

interface ScanConfig {
  index: string;
  watchlist: string[];
  params: StrategyParams;
}

function loadConfig(): ScanConfig {
  let fileConfig: Partial<ScanConfig> = {};
  const path = process.env.WATCHLIST_FILE ?? 'watchlist.json';
  try {
    fileConfig = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    // No watchlist file: fall back to the env var, then to the defaults.
  }

  const envList = process.env.WATCHLIST?.split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  return {
    index: process.env.INDEX_TICKER ?? fileConfig.index ?? 'SPY',
    watchlist: envList?.length ? envList : (fileConfig.watchlist ?? DEFAULT_WATCHLIST),
    params: {
      ...DEFAULT_PARAMS,
      ...fileConfig.params,
      crashDrawdownPct: Number(process.env.CRASH_PCT ?? fileConfig.params?.crashDrawdownPct ?? 10),
    },
  };
}

/**
 * Fetch and refuse anything simulated.
 *
 * The provider falls back to synthetic prices when it cannot reach a live feed.
 * That is fine for a demo and fatal for a scheduled alert — reporting a
 * fabricated crash as real is the worst thing this tool could do.
 */
async function fetchReal(ticker: string): Promise<PriceSeries> {
  const series = await getPriceSeries(ticker);
  if (series.synthetic) {
    throw new Error(
      `Refusing to report on ${ticker}: no live data provider could be reached, and the fallback is simulated. ` +
        `Check network access to stooq.com and query1.finance.yahoo.com.`,
    );
  }
  return series;
}

async function main(): Promise<void> {
  // Note: setting ALLOW_SYNTHETIC_FALLBACK here would do nothing — config.ts
  // reads the environment at import time, which happens before main() runs. The
  // npm script sets it in the shell; the `synthetic` check in fetchReal is what
  // actually guarantees no simulated data reaches this report.
  const config = loadConfig();
  const today = new Date().toISOString().slice(0, 10);

  const [indexSeries, ...tickerSeries] = await Promise.all([
    fetchReal(config.index),
    ...config.watchlist.filter((t) => t !== config.index).map(fetchReal),
  ]);

  const report = buildReport(indexSeries, tickerSeries, config.params, today);
  console.log(formatReport(report));

  if (process.env.JSON_OUT) {
    console.log('\n--- json ---');
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(report.market.crash ? 2 : 0);
}

main().catch((error: Error) => {
  console.error(`Market scan failed: ${error.message}`);
  process.exit(1);
});
