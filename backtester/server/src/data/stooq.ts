import { config } from '../config.js';
import type { Bar } from '../types.js';

/**
 * Stooq daily CSV. No API key, no rate-limit headers, generous history —
 * which is why it is tried first.
 */

/** Stooq namespaces symbols by market; plain US tickers need the `.us` suffix. */
export function stooqSymbol(ticker: string): string {
  const t = ticker.trim().toLowerCase();
  if (t.startsWith('^') || t.includes('.')) return t;
  return `${t}.us`;
}

export function parseStooqCsv(csv: string): Bar[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase();
  if (!header.startsWith('date,')) return [];

  const bars: Bar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 5) continue;
    const [date, open, high, low, close, volume] = cols;
    const bar: Bar = {
      date,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume ?? 0) || 0,
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bar.date)) continue;
    if (!Number.isFinite(bar.close) || bar.close <= 0) continue;
    bars.push(bar);
  }
  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchStooq(ticker: string): Promise<Bar[]> {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol(ticker))}&i=d`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(config.fetchTimeoutMs),
    headers: { accept: 'text/csv,text/plain,*/*' },
  });
  if (!response.ok) throw new Error(`Stooq responded ${response.status}`);
  const csv = await response.text();
  const bars = parseStooqCsv(csv);
  if (bars.length === 0) throw new Error(`Stooq returned no rows for "${ticker}"`);
  return bars;
}
