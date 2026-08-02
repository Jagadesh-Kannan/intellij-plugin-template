import type { Bar } from '../types.js';

/** Build bars from `[isoDate, close]` pairs; OHLC defaults around the close. */
export function bars(rows: Array<[string, number] | [string, number, number]>): Bar[] {
  return rows.map(([date, close, open]) => ({
    date,
    open: open ?? close,
    high: Math.max(close, open ?? close) * 1.01,
    low: Math.min(close, open ?? close) * 0.99,
    close,
    volume: 1000,
  }));
}

/** Weekday-only bars starting at `startIso`, one entry per close. */
export function weekdayBars(startIso: string, closes: number[]): Bar[] {
  const rows: Array<[string, number]> = [];
  const cursor = new Date(`${startIso}T00:00:00Z`);
  for (const close of closes) {
    while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    rows.push([cursor.toISOString().slice(0, 10), close]);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return bars(rows);
}
