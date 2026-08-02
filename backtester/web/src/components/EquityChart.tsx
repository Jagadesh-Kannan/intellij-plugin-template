import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { downsample, money, moneyCompact } from '../format';
import { CHROME, type Mode } from '../theme';
import type { StrategyResult } from '../types';

interface Props {
  results: StrategyResult[];
  colors: Map<string, string>;
  mode: Mode;
  /** Draws the contributed-capital line for this strategy, for context. */
  investedFor: string | null;
  /** Curves are only comparable when every strategy deployed the same capital. */
  equalCapital: boolean;
}

interface Row {
  date: string;
  invested?: number;
  [strategyId: string]: number | string | undefined;
}

/**
 * Portfolio value over time, one line per plotted strategy, all on a single
 * dollar axis — the contributed-capital line shares those units, so there is
 * never a second y-scale to misread.
 */
export function EquityChart({ results, colors, mode, investedFor, equalCapital }: Props) {
  const chrome = CHROME[mode];

  const data = useMemo(() => {
    if (results.length === 0) return [];
    const byDate = new Map<string, Row>();
    for (const result of results) {
      for (const point of result.equityCurve) {
        let row = byDate.get(point.date);
        if (!row) {
          row = { date: point.date };
          byDate.set(point.date, row);
        }
        row[result.strategyId] = point.value;
        if (result.strategyId === investedFor) row.invested = point.invested;
      }
    }
    return downsample([...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)));
  }, [results, investedFor]);

  if (results.length === 0) {
    return (
      <div className="panel chart">
        <div className="panel-head">
          <h2>Portfolio value</h2>
        </div>
        <p className="empty">Tick a strategy in the results table to plot it.</p>
      </div>
    );
  }

  const investedName = results.find((r) => r.strategyId === investedFor)?.name;

  return (
    <div className="panel chart">
      <div className="panel-head">
        <h2>Portfolio value over time</h2>
        <p className="hint">
          Value of shares held plus uninvested cash, in dollars.
          {!equalCapital &&
            ' Each strategy contributes on its own schedule, so a frequent buyer ends up larger simply by investing more — switch allocation to a fixed total budget to compare curves directly.'}
        </p>
      </div>

      <ul className="legend">
        {results.map((result) => (
          <li key={result.strategyId}>
            <span className="legend-mark" style={{ background: colors.get(result.strategyId) }} aria-hidden="true" />
            {result.name}
          </li>
        ))}
        {investedName && (
          <li>
            <span className="legend-mark dashed" style={{ background: chrome.invested }} aria-hidden="true" />
            Cash invested ({investedName})
          </li>
        )}
      </ul>

      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={chrome.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: chrome.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: chrome.axis }}
            minTickGap={48}
            tickFormatter={(value: string) => value.slice(0, 7)}
          />
          <YAxis
            tick={{ fill: chrome.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(value: number) => moneyCompact(value)}
          />
          <Tooltip
            cursor={{ stroke: chrome.axis, strokeWidth: 1 }}
            contentStyle={{
              background: chrome.surface,
              border: `1px solid ${chrome.grid}`,
              borderRadius: 8,
              color: chrome.text,
              fontSize: 13,
            }}
            labelStyle={{ color: chrome.muted, marginBottom: 4 }}
            formatter={(value: number, name: string) => [money(value), name]}
          />
          {investedName && (
            <Line
              type="monotone"
              dataKey="invested"
              name={`Cash invested (${investedName})`}
              stroke={chrome.invested}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}
          {results.map((result) => (
            <Line
              key={result.strategyId}
              type="monotone"
              dataKey={result.strategyId}
              name={result.name}
              stroke={colors.get(result.strategyId)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: chrome.surface }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
