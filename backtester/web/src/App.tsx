import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, fetchStrategies, runBacktest } from './api';
import { ControlPanel, type FormState } from './components/ControlPanel';
import { EquityChart } from './components/EquityChart';
import { ResultsTable } from './components/ResultsTable';
import { RoiChart } from './components/RoiChart';
import { SummaryBar } from './components/SummaryBar';
import { TradeTable } from './components/TradeTable';
import { MAX_CHART_SERIES, SERIES, useThemeMode } from './theme';
import type { BacktestResponse, StrategyInfo } from './types';

function isoDaysAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

const INITIAL_FORM: FormState = {
  ticker: 'AAPL',
  start: isoDaysAgo(5),
  end: new Date().toISOString().slice(0, 10),
  amount: 100,
  allocationMode: 'fixedPerBuy',
  fractionalShares: true,
  strategyIds: [],
  params: {
    redDayBasis: 'prevClose',
    weekdayHolidayPolicy: 'nextTradingDay',
    crashDrawdownPct: 10,
    crashCooldownDays: 20,
  },
};

export default function App() {
  const [mode, setMode] = useThemeMode();
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [report, setReport] = useState<BacktestResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [charted, setCharted] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  /** strategy id → palette slot, held steady while the strategy stays plotted. */
  const [slots, setSlots] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchStrategies()
      .then(({ strategies: list, defaults }) => {
        setStrategies(list);
        setForm((current) => ({
          ...current,
          params: defaults,
          strategyIds: list.filter((s) => s.category !== 'benchmark').map((s) => s.id),
        }));
      })
      .catch((err: Error) => setError({ message: 'Could not reach the backtest API.', detail: err.message }));
  }, []);

  /**
   * Colour follows the strategy, not its rank: a slot is claimed when a series
   * is plotted and released when it is removed, so unplotting one line never
   * repaints the others.
   */
  const updateCharted = useCallback((next: string[]) => {
    const capped = next.slice(0, MAX_CHART_SERIES);
    setCharted(capped);
    setSlots((current) => {
      const kept: Record<string, number> = {};
      for (const id of capped) if (current[id] !== undefined) kept[id] = current[id];
      const taken = new Set(Object.values(kept));
      for (const id of capped) {
        if (kept[id] !== undefined) continue;
        let slot = 0;
        while (taken.has(slot) && slot < MAX_CHART_SERIES) slot++;
        kept[id] = slot % MAX_CHART_SERIES;
        taken.add(kept[id]);
      }
      return kept;
    });
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const response = await runBacktest({
        ticker: form.ticker.trim(),
        start: form.start || undefined,
        end: form.end || undefined,
        strategyIds: form.strategyIds,
        amount: form.amount,
        allocationMode: form.allocationMode,
        fractionalShares: form.fractionalShares,
        params: form.params,
      });
      setReport(response);
      const top = response.results.slice(0, 3).map((r) => r.strategyId);
      setSlots({});
      updateCharted(top);
      setSelected(response.results[0]?.strategyId ?? null);
    } catch (err) {
      setReport(null);
      if (err instanceof ApiError) setError({ message: err.message, detail: err.detail });
      else setError({ message: (err as Error).message });
    } finally {
      setRunning(false);
    }
  }, [form, updateCharted]);

  const colors = useMemo(() => {
    const map = new Map<string, string>();
    for (const [id, slot] of Object.entries(slots)) map.set(id, SERIES[mode][slot]);
    return map;
  }, [slots, mode]);

  const chartedResults = useMemo(
    () => (report ? charted.map((id) => report.results.find((r) => r.strategyId === id)!).filter(Boolean) : []),
    [report, charted],
  );

  const selectedResult = report?.results.find((r) => r.strategyId === selected) ?? null;

  return (
    <div className="app">
      <header className="app-head">
        <div>
          <h1>Strategy Backtester</h1>
          <p>Ten recurring-buy rules, run side by side over one ticker’s history.</p>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
          aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} theme`}
        >
          {mode === 'dark' ? '☀' : '☾'}
        </button>
      </header>

      <div className="layout">
        <aside>
          <ControlPanel form={form} strategies={strategies} running={running} onChange={setForm} onRun={run} />
        </aside>

        <main>
          {error && (
            <div className="panel error" role="alert">
              <strong>{error.message}</strong>
              {error.detail && <p>{error.detail}</p>}
            </div>
          )}

          {report?.notice && (
            <div className="panel notice" role="status">
              <strong>Simulated data</strong>
              <p>{report.notice}</p>
            </div>
          )}

          {!report && !error && (
            <div className="panel empty-state">
              <h2>Pick a ticker and run it</h2>
              <p>
                Every strategy contributes cash on its own schedule and buys at that day’s close. Results are ranked by
                return on the capital each one actually deployed.
              </p>
            </div>
          )}

          {report && (
            <>
              <SummaryBar report={report} />
              <RoiChart results={report.results} mode={mode} selected={selected} onSelect={setSelected} />
              <EquityChart
                results={chartedResults}
                colors={colors}
                mode={mode}
                investedFor={selected}
                equalCapital={report.request.allocationMode === 'fixedTotal'}
              />
              <ResultsTable
                results={report.results}
                colors={colors}
                charted={charted}
                selected={selected}
                onToggleChart={(id) =>
                  updateCharted(charted.includes(id) ? charted.filter((x) => x !== id) : [...charted, id])
                }
                onSelect={setSelected}
              />
              {charted.length >= MAX_CHART_SERIES && (
                <p className="footnote">Plotting is capped at {MAX_CHART_SERIES} series — untick one to add another.</p>
              )}
              {selectedResult && <TradeTable result={selectedResult} lastClose={report.lastClose} />}
            </>
          )}
        </main>
      </div>

      <footer className="app-foot">
        Educational backtests on historical closing prices. No fees, taxes, or slippage are modelled — past results are
        not a forecast.
      </footer>
    </div>
  );
}
