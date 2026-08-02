import { config } from '../config.js';
import type { Bar } from '../types.js';

/** Shape of the slice of Yahoo's chart payload we rely on. */
interface YahooChart {
  chart?: {
    error?: { description?: string } | null;
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
        adjclose?: Array<{ adjclose?: (number | null)[] }>;
      };
    }>;
  };
}

export function parseYahooChart(payload: YahooChart): Bar[] {
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const stamps = result?.timestamp;
  if (!result || !quote || !stamps) return [];
  const adjcloses = result.indicators?.adjclose?.[0]?.adjclose;

  const bars: Bar[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const close = quote.close?.[i];
    if (close == null || !Number.isFinite(close) || close <= 0) continue;

    // Prefer the dividend/split-adjusted close, and scale the rest of the bar by
    // the same factor so intraday relationships (open vs close) stay intact.
    const adj = adjcloses?.[i];
    const factor = adj != null && Number.isFinite(adj) && close > 0 ? adj / close : 1;

    bars.push({
      date: new Date(stamps[i] * 1000).toISOString().slice(0, 10),
      open: num(quote.open?.[i], close) * factor,
      high: num(quote.high?.[i], close) * factor,
      low: num(quote.low?.[i], close) * factor,
      close: close * factor,
      volume: num(quote.volume?.[i], 0),
    });
  }
  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

function num(value: number | null | undefined, fallback: number): number {
  return value != null && Number.isFinite(value) ? value : fallback;
}

export async function fetchYahoo(ticker: string): Promise<Bar[]> {
  const symbol = encodeURIComponent(ticker.trim().toUpperCase());
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=max&interval=1d&events=div%2Csplit`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(config.fetchTimeoutMs),
    headers: {
      accept: 'application/json',
      // Yahoo rejects requests without a browser-ish agent.
      'user-agent': 'Mozilla/5.0 (compatible; backtester/1.0)',
    },
  });
  if (!response.ok) throw new Error(`Yahoo responded ${response.status}`);
  const payload = (await response.json()) as YahooChart;
  const error = payload.chart?.error;
  if (error) throw new Error(`Yahoo error: ${error.description ?? 'unknown'}`);
  const bars = parseYahooChart(payload);
  if (bars.length === 0) throw new Error(`Yahoo returned no rows for "${ticker}"`);
  return bars;
}
