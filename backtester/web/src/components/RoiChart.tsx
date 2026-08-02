import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { percent } from '../format';
import { CHROME, type Mode } from '../theme';
import type { StrategyResult } from '../types';

interface Props {
  results: StrategyResult[];
  mode: Mode;
  selected: string | null;
  onSelect: (id: string) => void;
}

/**
 * Return on contributed capital, ranked. One measure, so colour carries polarity
 * (gain vs loss) rather than identity — the strategy name is on the axis and the
 * value is direct-labelled, so nothing depends on hue.
 */
export function RoiChart({ results, mode, selected, onSelect }: Props) {
  const chrome = CHROME[mode];
  const data = results.map((result) => ({
    id: result.strategyId,
    name: result.name.replace(/^Benchmark: /, '↳ '),
    roi: result.metrics.roiPct,
  }));

  const hasNegative = data.some((d) => d.roi < 0);

  // Rounded data-end anchored to the baseline: the corners flip for losses so
  // the flat edge always sits on zero. Recharts renders <Cell> as a <Rectangle>,
  // which takes a per-corner tuple, but Cell's prop types only model the SVG
  // scalar — hence the cast at that boundary.
  const endRadius = (value: number) =>
    ({ radius: value >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] }) as unknown as { radius: number };

  return (
    <div className="panel chart">
      <div className="panel-head">
        <h2>Return on invested capital</h2>
        <p className="hint">Profit divided by the cash each strategy actually contributed</p>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34 + 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 4 }}>
          {/* Bars must start at zero — anchoring to dataMin would shrink a set of
              similar returns into slivers and exaggerate the spread between them. */}
          <XAxis type="number" hide domain={[hasNegative ? 'dataMin' : 0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="name"
            width={190}
            tick={{ fill: chrome.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          {hasNegative && <ReferenceLine x={0} stroke={chrome.axis} />}
          <Bar dataKey="roi" barSize={16} isAnimationActive={false} onClick={(entry: { id: string }) => onSelect(entry.id)}>
            {data.map((entry) => (
              <Cell
                key={entry.id}
                fill={entry.roi >= 0 ? chrome.positive : chrome.negative}
                fillOpacity={selected && selected !== entry.id ? 0.45 : 1}
                {...endRadius(entry.roi)}
                cursor="pointer"
              />
            ))}
            <LabelList
              dataKey="roi"
              position="right"
              formatter={(value: number) => percent(value, 1)}
              style={{ fill: chrome.text, fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
