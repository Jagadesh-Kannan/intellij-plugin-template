import type { BacktestRequest, BacktestResponse, StrategyInfo, StrategyParams } from './types';

/** Same-origin in production; Vite proxies /api to the server in dev. */
const BASE = '/api';

export class ApiError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function readError(response: Response): Promise<never> {
  let message = `Request failed (${response.status})`;
  let detail: string | undefined;
  try {
    const payload = (await response.json()) as {
      error?: string;
      detail?: string;
      attempts?: string[];
      issues?: { path: (string | number)[]; message: string }[];
    };
    if (payload.error) message = payload.error;
    if (payload.issues?.length) {
      detail = payload.issues.map((i) => `${i.path.join('.') || 'request'}: ${i.message}`).join('; ');
    } else if (payload.attempts?.length) {
      detail = payload.attempts.join(' · ');
    } else if (payload.detail) {
      detail = payload.detail;
    }
  } catch {
    // Non-JSON body: keep the status-code message.
  }
  throw new ApiError(message, detail);
}

export async function fetchStrategies(): Promise<{ strategies: StrategyInfo[]; defaults: StrategyParams }> {
  const response = await fetch(`${BASE}/strategies`);
  if (!response.ok) await readError(response);
  return response.json();
}

export async function runBacktest(request: BacktestRequest): Promise<BacktestResponse> {
  const response = await fetch(`${BASE}/backtest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) await readError(response);
  return response.json();
}
