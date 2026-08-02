import { Router } from 'express';
import { z } from 'zod';
import { DataFetchError, getPriceSeries } from '../data/provider.js';
import { runStrategy, sliceRange } from '../engine/backtest.js';
import { round } from '../engine/metrics.js';
import { CORE_STRATEGY_IDS, DEFAULT_PARAMS, STRATEGY_BY_ID, listStrategies } from '../engine/strategies.js';
import type { BacktestResponse } from '../types.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date');

const paramsSchema = z.object({
  redDayBasis: z.enum(['prevClose', 'open']).default(DEFAULT_PARAMS.redDayBasis),
  weekdayHolidayPolicy: z.enum(['skip', 'nextTradingDay']).default(DEFAULT_PARAMS.weekdayHolidayPolicy),
  crashDrawdownPct: z.number().min(1).max(90).default(DEFAULT_PARAMS.crashDrawdownPct),
  crashCooldownDays: z.number().int().min(0).max(750).default(DEFAULT_PARAMS.crashCooldownDays),
});

const requestSchema = z
  .object({
    ticker: z.string().trim().min(1).max(20),
    start: isoDate.optional(),
    end: isoDate.optional(),
    strategyIds: z.array(z.string()).min(1).default(CORE_STRATEGY_IDS),
    amount: z.number().positive().max(1_000_000_000).default(100),
    allocationMode: z.enum(['fixedPerBuy', 'fixedTotal']).default('fixedPerBuy'),
    fractionalShares: z.boolean().default(true),
    params: paramsSchema.default(DEFAULT_PARAMS),
  })
  .refine((value) => !value.start || !value.end || value.start <= value.end, {
    message: 'start must be on or before end',
    path: ['start'],
  });

export const backtestRouter = Router();

backtestRouter.get('/strategies', (_req, res) => {
  res.json({ strategies: listStrategies(), defaults: DEFAULT_PARAMS });
});

backtestRouter.post('/backtest', async (req, res) => {
  const parsed = requestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues });
    return;
  }
  const request = parsed.data;

  const unknown = request.strategyIds.filter((id) => !STRATEGY_BY_ID.has(id));
  if (unknown.length > 0) {
    res.status(400).json({ error: `Unknown strategy id(s): ${unknown.join(', ')}` });
    return;
  }

  let series;
  try {
    series = await getPriceSeries(request.ticker);
  } catch (error) {
    if (error instanceof DataFetchError) {
      res.status(502).json({ error: error.message, attempts: error.attempts });
      return;
    }
    throw error;
  }

  const bars = sliceRange(series.bars, request.start, request.end);
  if (bars.length < 2) {
    res.status(422).json({
      error: `Not enough price history for ${series.ticker} in the selected range.`,
      availableFrom: series.bars[0]?.date ?? null,
      availableTo: series.bars[series.bars.length - 1]?.date ?? null,
    });
    return;
  }

  const results = request.strategyIds
    .map((id) => STRATEGY_BY_ID.get(id)!)
    .map((strategy) =>
      runStrategy(strategy, bars, {
        amount: request.amount,
        allocationMode: request.allocationMode,
        fractionalShares: request.fractionalShares,
        params: request.params,
      }),
    )
    .sort((a, b) => b.metrics.roiPct - a.metrics.roiPct);

  const first = bars[0];
  const last = bars[bars.length - 1];

  const response: BacktestResponse = {
    ticker: series.ticker,
    source: series.source,
    synthetic: series.synthetic,
    notice: series.synthetic
      ? 'Live market data was unavailable, so these results were computed on simulated prices. They are not real historical returns.'
      : null,
    start: first.date,
    end: last.date,
    tradingDays: bars.length,
    firstClose: round(first.close, 4),
    lastClose: round(last.close, 4),
    buyAndHoldPct: round((last.close / first.close - 1) * 100, 4),
    priceSeries: bars.map((bar) => ({ date: bar.date, close: round(bar.close, 4) })),
    results,
    request: {
      ticker: series.ticker,
      start: request.start,
      end: request.end,
      strategyIds: request.strategyIds,
      amount: request.amount,
      allocationMode: request.allocationMode,
      fractionalShares: request.fractionalShares,
      params: request.params,
    },
  };

  res.json(response);
});
