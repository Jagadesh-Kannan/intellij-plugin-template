import type { Bar } from '../types.js';

/**
 * Calendar helpers.
 *
 * Bar dates are treated as plain calendar dates, never as instants: every parse
 * goes through UTC so a machine in UTC-5 cannot shift a Monday bar into Sunday.
 */

export function parseDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

/** 0 = Sunday ... 6 = Saturday, matching Date#getUTCDay. */
export function dayOfWeek(iso: string): number {
  return parseDate(iso).getUTCDay();
}

export function dayOfMonth(iso: string): number {
  return parseDate(iso).getUTCDate();
}

/** `YYYY-MM` bucket key. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Bucket key for the Monday-anchored week a date falls in. Using the week's
 * Monday (rather than an ISO week number) keeps the key trivially comparable
 * and avoids year-boundary edge cases.
 */
export function weekKey(iso: string): string {
  const d = parseDate(iso);
  const dow = d.getUTCDay();
  // Shift Sunday (0) back 6 days so it belongs to the week that started before it.
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function yearFraction(startIso: string, endIso: string): number {
  const ms = parseDate(endIso).getTime() - parseDate(startIso).getTime();
  return ms / (365.2425 * 24 * 60 * 60 * 1000);
}

/** Indices of `bars` grouped by a key function, preserving chronological order. */
export function groupIndices(bars: Bar[], key: (iso: string) => string): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < bars.length; i++) {
    const k = key(bars[i].date);
    const bucket = groups.get(k);
    if (bucket) bucket.push(i);
    else groups.set(k, [i]);
  }
  return groups;
}
