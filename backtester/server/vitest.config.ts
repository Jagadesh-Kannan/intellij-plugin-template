import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Pin the provider before any module reads config, so the suite never
    // depends on the network or on a live market data vendor.
    env: {
      DATA_PROVIDER: 'synthetic',
    },
  },
});
