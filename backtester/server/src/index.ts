import { createApp } from './app.js';
import { config } from './config.js';

createApp().listen(config.port, () => {
  console.log(`Backtester API listening on http://localhost:${config.port}`);
  console.log(`Data provider: ${config.provider} (synthetic fallback ${config.allowSyntheticFallback ? 'on' : 'off'})`);
});
