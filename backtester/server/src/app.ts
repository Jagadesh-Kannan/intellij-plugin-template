import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { backtestRouter } from './routes/backtest.js';

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, provider: config.provider, syntheticFallback: config.allowSyntheticFallback });
  });

  app.use('/api', backtestRouter);

  // In production the built SPA is served from the same origin, so there is no
  // CORS or proxy configuration to get wrong on a deployment.
  const webDist = path.resolve(fileURLToPath(new URL('../../web/dist', import.meta.url)));
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'), (error) => {
      if (error) res.status(404).json({ error: 'Not found. Run `npm run build` to generate the web bundle.' });
    });
  });

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  });

  return app;
}
