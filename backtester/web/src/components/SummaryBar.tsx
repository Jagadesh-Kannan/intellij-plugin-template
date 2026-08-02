import { money, percent } from '../format';
import type { BacktestResponse } from '../types';

const SOURCE_LABELS: Record<string, string> = {
  stooq: 'Stooq',
  yahoo: 'Yahoo Finance',
  synthetic: 'Simulated',
};

export function SummaryBar({ report }: { report: BacktestResponse }) {
  const winner = report.results[0];
  return (
    <div className="summary">
      <Stat label="Ticker" value={report.ticker} sub={`${SOURCE_LABELS[report.source]} · ${report.tradingDays.toLocaleString()} trading days`} />
      <Stat label="Range" value={`${report.start} → ${report.end}`} sub={`${money(report.firstClose)} → ${money(report.lastClose)}`} />
      <Stat
        label="Buy & hold"
        value={percent(report.buyAndHoldPct, 1)}
        sub="Price change over the range"
        tone={report.buyAndHoldPct >= 0 ? 'pos' : 'neg'}
      />
      {winner && (
        <Stat
          label="Best strategy"
          value={winner.name}
          sub={`${percent(winner.metrics.roiPct, 1)} on ${money(winner.metrics.totalInvested)}`}
          tone={winner.metrics.roiPct >= 0 ? 'pos' : 'neg'}
        />
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone ?? ''}`}>{value}</span>
      <span className="stat-sub">{sub}</span>
    </div>
  );
}
