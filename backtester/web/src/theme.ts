import { useEffect, useState } from 'react';

/**
 * Chart colours.
 *
 * Recharts needs literal colour strings, so the palette lives in JS as well as
 * in CSS custom properties. Both modes are hand-stepped for their own surface —
 * dark is not a mechanical flip of light — and the categorical order is fixed:
 * slot N always means "the Nth series in this chart", never a rotating hue.
 */

export type Mode = 'light' | 'dark';

export const SERIES: Record<Mode, string[]> = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

/** Series cap: past eight slots, identity stops being readable by colour. */
export const MAX_CHART_SERIES = SERIES.light.length;

export const CHROME: Record<Mode, Record<string, string>> = {
  light: {
    surface: '#fcfcfb',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    muted: '#898781',
    text: '#0b0b0b',
    positive: '#2a78d6',
    negative: '#e34948',
    invested: '#898781',
  },
  dark: {
    surface: '#1a1a19',
    grid: '#2c2c2a',
    axis: '#383835',
    muted: '#898781',
    text: '#ffffff',
    positive: '#3987e5',
    negative: '#e66767',
    invested: '#898781',
  },
};

/** Tracks the OS preference unless the user has picked a mode explicitly. */
export function useThemeMode(): [Mode, (mode: Mode) => void] {
  const [override, setOverride] = useState<Mode | null>(() => {
    const stored = localStorage.getItem('backtester-theme');
    return stored === 'light' || stored === 'dark' ? stored : null;
  });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  const mode: Mode = override ?? (systemDark ? 'dark' : 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  return [
    mode,
    (next: Mode) => {
      setOverride(next);
      localStorage.setItem('backtester-theme', next);
    },
  ];
}
