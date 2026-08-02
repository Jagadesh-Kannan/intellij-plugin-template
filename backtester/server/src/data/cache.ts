import { config } from '../config.js';
import type { PriceSeries } from '../types.js';

interface Entry {
  series: PriceSeries;
  expiresAt: number;
}

const store = new Map<string, Entry>();

export function cacheGet(key: string): PriceSeries | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.series;
}

export function cacheSet(key: string, series: PriceSeries): void {
  store.set(key, { series, expiresAt: Date.now() + config.cacheTtlMs });
}

export function cacheClear(): void {
  store.clear();
}
