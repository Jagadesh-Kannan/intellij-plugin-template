import type { DataSource } from './types.js';

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export type ProviderPreference = 'auto' | DataSource;

export const config = {
  port: int(process.env.PORT, 4000),
  /** `auto` tries Stooq, then Yahoo. Pin a single provider to bypass the chain. */
  provider: (process.env.DATA_PROVIDER ?? 'auto') as ProviderPreference,
  /**
   * When every live provider fails (offline, firewall, rate limit), fall back to
   * simulated prices so the UI still works. Responses are flagged `synthetic`.
   */
  allowSyntheticFallback: bool(process.env.ALLOW_SYNTHETIC_FALLBACK, true),
  cacheTtlMs: int(process.env.CACHE_TTL_MS, 6 * 60 * 60 * 1000),
  fetchTimeoutMs: int(process.env.FETCH_TIMEOUT_MS, 15000),
};
