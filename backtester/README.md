# Strategy Backtester

A full-stack app that runs ten recurring-buy strategies against one ticker's historical
prices and ranks them side by side.

- **Backend** — Node + TypeScript (Express), with the strategy engine, metrics, and market
  data providers. Vitest covers the engine and the HTTP API.
- **Frontend** — React + TypeScript (Vite) with Recharts, served by the same origin in
  production.

## Quick start

```bash
cd backtester
npm install
npm run dev          # API on :4000, UI on :5173 (proxied to the API)
```

Production build and single-process serve:

```bash
npm run build
npm start            # http://localhost:4000 serves the API and the built UI
```

Other scripts: `npm test` (server suite), `npm run typecheck`.

## Strategies

| Strategy | Rule |
|---|---|
| Buy on red day | Every down day. "Red" defaults to *close below the previous close*; the other reading, *close below that day's open*, is a setting. |
| Buy every Monday…Friday | One buy per calendar week on that weekday. If the exchange was closed, the buy rolls to the next open day **within the same week** (or skips the week — configurable). It never spills into the next week. |
| Buy 1st of the month | First trading day on or after the 1st. |
| Buy 15th of the month | First trading day on or after the 15th. |
| Buy last day of month | Final trading day of each month. |
| Buy on market crash | Close at least N% below its running peak (default 10%), with a cooldown (default 20 trading days) so one long drawdown does not fire every session. |

Two benchmarks are included for context and are off by default: **buy every trading day**
(plain DCA) and **lump sum on day one**.

## How a run works

Every buy fills at that day's **close** — the rules are all decided from closing data, so
filling anywhere else would grant hindsight. Contributed cash that cannot be converted to
shares (whole-share mode) stays as cash and rolls into the next buy.

**Allocation mode** decides how much each trigger spends:

- `fixedPerBuy` — the same dollar amount on every trigger. Frequent strategies invest more
  in total, so final values are not directly comparable (ROI still is).
- `fixedTotal` — one budget split evenly across a strategy's triggers, so every strategy
  deploys identical capital. This is the apples-to-apples comparison.

### Metrics

| Metric | Meaning |
|---|---|
| Invested | Total cash contributed. |
| Final value | Shares × final close, plus uninvested cash. |
| ROI | Profit ÷ invested. Simple, not annualised. |
| Annualised | Money-weighted return (XIRR), solved by bisection over the contribution stream. `—` when the cash flows do not bracket a root. |
| Avg cost | Total paid ÷ shares held. Compare against **avg price** (mean close over the range): below it means the strategy bought at better-than-average prices. |
| Max drawdown | Largest peak-to-trough fall of portfolio value, measured on value *above contributions* so that fresh cash arriving mid-drawdown does not look like a recovery. |

## Daily post-close scan

`npm run scan` applies the same rules to *today's* bar instead of history: it reports the
index's drawdown, whether that crosses the crash threshold, and which strategies fired on
which watchlist tickers.

```bash
cp watchlist.example.json watchlist.json   # then edit the tickers
npm run scan
```

Configuration is `watchlist.json`, overridable per run by `WATCHLIST` (comma-separated),
`INDEX_TICKER`, `CRASH_PCT`, and `WATCHLIST_FILE`. `JSON_OUT=1` appends the raw report.

Exit codes are meant for scripting: **0** no crash, **2** crash threshold breached,
**1** the scan could not be trusted.

That last one matters. The scan **refuses to run on synthetic data** — if no live provider
is reachable it fails loudly rather than reporting simulated prices as real. It also warns
when the feed's latest bar has fallen more than a few days behind.

### Scheduling it (macOS)

```bash
sed -i '' "s|REPO_PATH|$(pwd)|g" scripts/com.backtester.market-scan.plist
cp scripts/com.backtester.market-scan.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.backtester.market-scan.plist
```

Runs weekdays at 17:30 local — 90 minutes after the 16:00 ET close, since end-of-day bars
take a while to publish. launchd uses local time, so the EST/EDT switch is handled for you
if the Mac is on US Eastern; adjust `Hour` otherwise. Reports append to
`logs/market-scan.log`, and a crash or a failed scan raises a macOS notification.

Test the wrapper before trusting the schedule:

```bash
./scripts/market-scan.sh; echo "exit: $?"
```

**What it does not do:** pick stocks. A fired rule means "this strategy would have bought
today" — it is a mechanical trigger on closing prices, not a recommendation, and the report
says so in as many words.

## Market data

Providers are tried in order and the first success wins:

1. **Stooq** daily CSV — no API key. US tickers get an automatic `.us` suffix.
2. **Yahoo Finance** chart API — used when Stooq fails. Prices are dividend/split adjusted,
   and the whole bar is scaled by the same factor so open-vs-close relationships survive.
3. **Synthetic** — deterministic simulated history, used only when every live provider
   fails (offline, blocked egress, rate limit). Those responses carry `synthetic: true` and
   the UI shows a "Simulated data" banner. It is a fallback for demos and tests, never a
   stand-in for real returns.

Series are cached in memory for six hours per ticker.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | API port. |
| `DATA_PROVIDER` | `auto` | `auto`, `stooq`, `yahoo`, or `synthetic`. |
| `ALLOW_SYNTHETIC_FALLBACK` | `true` | Set `false` to return HTTP 502 instead of simulated data. |
| `CACHE_TTL_MS` | `21600000` | Price cache lifetime. |
| `FETCH_TIMEOUT_MS` | `15000` | Per-provider request timeout. |

## API

### `GET /api/strategies`

Returns strategy metadata and the default rule parameters.

### `POST /api/backtest`

```jsonc
{
  "ticker": "AAPL",
  "start": "2019-01-01",          // optional, defaults to earliest available
  "end": "2024-12-31",            // optional
  "strategyIds": ["red-day", "weekly-monday"],  // optional, defaults to all ten
  "amount": 100,
  "allocationMode": "fixedPerBuy", // or "fixedTotal"
  "fractionalShares": true,
  "params": {
    "redDayBasis": "prevClose",           // or "open"
    "weekdayHolidayPolicy": "nextTradingDay", // or "skip"
    "crashDrawdownPct": 10,
    "crashCooldownDays": 20
  }
}
```

Responds with per-strategy metrics, trades, and a daily equity curve, sorted by ROI.
Errors: `400` invalid request or unknown strategy id, `422` range too short,
`502` no provider could supply data (only when synthetic fallback is off).

```bash
curl -s localhost:4000/api/backtest \
  -H 'content-type: application/json' \
  -d '{"ticker":"AAPL","start":"2020-01-01","amount":100}'
```

## Limitations

Backtests model closing prices only — **no fees, spreads, slippage, taxes, or dividends**
(except that Yahoo's adjusted prices fold dividends into the price series, while Stooq's do
not). Survivorship and delisting are not handled. Results are educational, not advice.
