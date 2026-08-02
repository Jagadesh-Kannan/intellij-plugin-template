import { money, percent, shares as fmtShares } from '../format';
import type { StrategyResult } from '../types';

interface Props {
  results: StrategyResult[];
  /** Strategy id → chart colour, for the ones currently plotted. */
  colors: Map<string, string>;
  charted: string[];
  selected: string | null;
  onToggleChart: (id: string) => void;
  onSelect: (id: string) => void;
}

/**
 * The table is the canonical view of the run: every number the charts encode
 * visually is readable here as text, which is what keeps the light-mode series
 * colours (some below 3:1 on the surface) from being the only channel.
 */
export function ResultsTable({ results, colors, charted, selected, onToggleChart, onSelect }: Props) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Results</h2>
        <p className="hint">Tick a row to plot it · click a row for its trades</p>
      </div>
      <div className="table-scroll">
        <table className="results">
          <thead>
            <tr>
              <th scope="col" className="tick-col">
                <span className="sr-only">Plot</span>
              </th>
              <th scope="col">Strategy</th>
              <th scope="col" className="num">Buys</th>
              <th scope="col" className="num">Invested</th>
              <th scope="col" className="num">Final value</th>
              <th scope="col" className="num">Profit</th>
              <th scope="col" className="num">ROI</th>
              <th scope="col" className="num">Annualised</th>
              <th scope="col" className="num">Avg cost</th>
              <th scope="col" className="num">Avg price</th>
              <th scope="col" className="num">Max drawdown</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => {
              const m = result.metrics;
              const isCharted = charted.includes(result.strategyId);
              const color = colors.get(result.strategyId);
              return (
                <tr
                  key={result.strategyId}
                  className={selected === result.strategyId ? 'selected' : undefined}
                  onClick={() => onSelect(result.strategyId)}
                >
                  <td className="tick-col" onClick={(e) => e.stopPropagation()}>
                    <label className="plot-toggle">
                      <input type="checkbox" checked={isCharted} onChange={() => onToggleChart(result.strategyId)} />
                      <span
                        className="swatch"
                        style={{ background: isCharted && color ? color : 'transparent' }}
                        aria-hidden="true"
                      />
                      <span className="sr-only">Plot {result.name}</span>
                    </label>
                  </td>
                  <th scope="row">
                    <span className="strategy-name">{result.name}</span>
                    {result.warnings.length > 0 && (
                      <span className="warn-dot" title={result.warnings.join(' ')}>
                        ⚠
                      </span>
                    )}
                  </th>
                  <td className="num">{m.buyCount.toLocaleString()}</td>
                  <td className="num">{money(m.totalInvested)}</td>
                  <td className="num">{money(m.finalValue)}</td>
                  <td className={`num ${m.profit >= 0 ? 'pos' : 'neg'}`}>{money(m.profit)}</td>
                  <td className={`num strong ${m.roiPct >= 0 ? 'pos' : 'neg'}`}>{percent(m.roiPct)}</td>
                  <td className="num">{percent(m.annualizedReturnPct)}</td>
                  <td className="num">{m.avgCostBasis ? money(m.avgCostBasis) : '—'}</td>
                  <td className="num muted">{money(m.avgMarketPrice)}</td>
                  <td className="num">{m.maxDrawdownPct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {results.some((r) => r.metrics.sharesHeld > 0) && (
        <p className="footnote">
          Shares held by the leader: {fmtShares(results[0].metrics.sharesHeld)} · “Avg cost” below “Avg price” means the
          strategy bought at better-than-average prices.
        </p>
      )}
    </div>
  );
}
