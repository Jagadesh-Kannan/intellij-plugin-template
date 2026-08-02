import { useState } from 'react';
import { money, percent, shares as fmtShares } from '../format';
import type { StrategyResult } from '../types';

const PAGE = 25;

export function TradeTable({ result, lastClose }: { result: StrategyResult; lastClose: number }) {
  const [limit, setLimit] = useState(PAGE);
  const trades = result.trades;
  const visible = trades.slice(0, limit);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{result.name}</h2>
        <p className="hint">{result.description}</p>
      </div>

      {result.warnings.map((warning) => (
        <p className="warning" key={warning}>
          {warning}
        </p>
      ))}

      {trades.length === 0 ? (
        <p className="empty">No trades.</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="results compact">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col" className="num">Price</th>
                  <th scope="col" className="num">Shares</th>
                  <th scope="col" className="num">Contributed</th>
                  <th scope="col" className="num">Return since</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((trade) => {
                  const change = (lastClose / trade.price - 1) * 100;
                  return (
                    <tr key={`${trade.date}-${trade.price}`}>
                      <th scope="row">{trade.date}</th>
                      <td className="num">{money(trade.price)}</td>
                      <td className="num">{fmtShares(trade.shares)}</td>
                      <td className="num">{money(trade.contribution)}</td>
                      <td className={`num ${change >= 0 ? 'pos' : 'neg'}`}>{percent(change, 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {limit < trades.length && (
            <button type="button" className="link more" onClick={() => setLimit(limit + PAGE * 4)}>
              Show more ({trades.length - limit} remaining)
            </button>
          )}
        </>
      )}
    </div>
  );
}
