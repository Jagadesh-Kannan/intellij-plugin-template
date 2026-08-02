import type { AllocationMode, StrategyCategory, StrategyInfo, StrategyParams } from '../types';

export interface FormState {
  ticker: string;
  start: string;
  end: string;
  amount: number;
  allocationMode: AllocationMode;
  fractionalShares: boolean;
  strategyIds: string[];
  params: StrategyParams;
}

interface Props {
  form: FormState;
  strategies: StrategyInfo[];
  running: boolean;
  onChange: (next: FormState) => void;
  onRun: () => void;
}

const CATEGORY_LABELS: Record<StrategyCategory, string> = {
  dip: 'Dip buying',
  weekday: 'Weekly schedule',
  monthly: 'Monthly schedule',
  benchmark: 'Benchmarks',
};

const CATEGORY_ORDER: StrategyCategory[] = ['dip', 'weekday', 'monthly', 'benchmark'];

export function ControlPanel({ form, strategies, running, onChange, onRun }: Props) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => onChange({ ...form, [key]: value });
  const setParam = <K extends keyof StrategyParams>(key: K, value: StrategyParams[K]) =>
    onChange({ ...form, params: { ...form.params, [key]: value } });

  const toggleStrategy = (id: string) => {
    const next = form.strategyIds.includes(id)
      ? form.strategyIds.filter((s) => s !== id)
      : [...form.strategyIds, id];
    set('strategyIds', next);
  };

  const selectAll = (ids: string[], selected: boolean) => {
    const next = selected
      ? Array.from(new Set([...form.strategyIds, ...ids]))
      : form.strategyIds.filter((id) => !ids.includes(id));
    set('strategyIds', next);
  };

  const canRun = form.ticker.trim().length > 0 && form.strategyIds.length > 0 && form.amount > 0 && !running;

  return (
    <form
      className="panel controls"
      onSubmit={(event) => {
        event.preventDefault();
        if (canRun) onRun();
      }}
    >
      <div className="control-grid">
        <label className="field">
          <span>Ticker</span>
          <input
            value={form.ticker}
            onChange={(e) => set('ticker', e.target.value.toUpperCase())}
            placeholder="AAPL"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>

        <label className="field">
          <span>Start date</span>
          <input type="date" value={form.start} onChange={(e) => set('start', e.target.value)} />
        </label>

        <label className="field">
          <span>End date</span>
          <input type="date" value={form.end} onChange={(e) => set('end', e.target.value)} />
        </label>

        <label className="field">
          <span>{form.allocationMode === 'fixedTotal' ? 'Total budget ($)' : 'Amount per buy ($)'}</span>
          <input
            type="number"
            min={1}
            // `any` rather than a fixed step: with min=1, a step of 10 makes
            // ordinary amounts like 100 fail native validation (91 and 101
            // would be the nearest valid values) and silently blocks submit.
            step="any"
            value={form.amount}
            onChange={(e) => set('amount', Number(e.target.value))}
            required
          />
        </label>

        <label className="field">
          <span>Allocation</span>
          <select value={form.allocationMode} onChange={(e) => set('allocationMode', e.target.value as AllocationMode)}>
            <option value="fixedPerBuy">Fixed amount per buy</option>
            <option value="fixedTotal">Fixed total budget (equal capital)</option>
          </select>
          <small>
            {form.allocationMode === 'fixedTotal'
              ? 'Every strategy deploys the same total — the fair comparison.'
              : 'Frequent strategies invest more overall.'}
          </small>
        </label>

        <label className="field checkbox">
          <input
            type="checkbox"
            checked={form.fractionalShares}
            onChange={(e) => set('fractionalShares', e.target.checked)}
          />
          <span>Allow fractional shares</span>
        </label>
      </div>

      <details className="advanced">
        <summary>Strategy rules</summary>
        <div className="control-grid">
          <label className="field">
            <span>“Red day” means</span>
            <select
              value={form.params.redDayBasis}
              onChange={(e) => setParam('redDayBasis', e.target.value as StrategyParams['redDayBasis'])}
            >
              <option value="prevClose">Close below previous close</option>
              <option value="open">Close below that day’s open</option>
            </select>
          </label>

          <label className="field">
            <span>Weekday falls on a holiday</span>
            <select
              value={form.params.weekdayHolidayPolicy}
              onChange={(e) =>
                setParam('weekdayHolidayPolicy', e.target.value as StrategyParams['weekdayHolidayPolicy'])
              }
            >
              <option value="nextTradingDay">Buy the next open day that week</option>
              <option value="skip">Skip that week</option>
            </select>
          </label>

          <label className="field">
            <span>Crash = drawdown of (%)</span>
            <input
              type="number"
              min={1}
              max={90}
              step={1}
              value={form.params.crashDrawdownPct}
              onChange={(e) => setParam('crashDrawdownPct', Number(e.target.value))}
            />
          </label>

          <label className="field">
            <span>Crash cooldown (trading days)</span>
            <input
              type="number"
              min={0}
              max={750}
              step={1}
              value={form.params.crashCooldownDays}
              onChange={(e) => setParam('crashCooldownDays', Number(e.target.value))}
            />
          </label>
        </div>
      </details>

      <fieldset className="strategies">
        <legend>Strategies</legend>
        {CATEGORY_ORDER.map((category) => {
          const group = strategies.filter((s) => s.category === category);
          if (group.length === 0) return null;
          const ids = group.map((s) => s.id);
          const allOn = ids.every((id) => form.strategyIds.includes(id));
          return (
            <div className="strategy-group" key={category}>
              <div className="strategy-group-head">
                <h3>{CATEGORY_LABELS[category]}</h3>
                <button type="button" className="link" onClick={() => selectAll(ids, !allOn)}>
                  {allOn ? 'none' : 'all'}
                </button>
              </div>
              {group.map((strategy) => (
                <label className="strategy" key={strategy.id} title={strategy.description}>
                  <input
                    type="checkbox"
                    checked={form.strategyIds.includes(strategy.id)}
                    onChange={() => toggleStrategy(strategy.id)}
                  />
                  <span>{strategy.name}</span>
                </label>
              ))}
            </div>
          );
        })}
      </fieldset>

      <button type="submit" className="run" disabled={!canRun}>
        {running ? 'Running…' : 'Run backtest'}
      </button>
    </form>
  );
}
