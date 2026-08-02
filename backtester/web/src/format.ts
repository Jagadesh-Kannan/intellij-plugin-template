const currency = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const compactCurrency = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function money(value: number): string {
  return currency.format(value);
}

export function moneyCompact(value: number): string {
  return compactCurrency.format(value);
}

export function percent(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function shares(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function shortDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Thin a series down to at most `max` points for plotting.
 * Keeps the first and last point so the range endpoints stay honest.
 */
export function downsample<T>(items: T[], max = 420): T[] {
  if (items.length <= max) return items;
  const step = items.length / max;
  const out: T[] = [];
  for (let i = 0; i < max - 1; i++) out.push(items[Math.floor(i * step)]);
  out.push(items[items.length - 1]);
  return out;
}
