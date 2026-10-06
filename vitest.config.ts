import { defineConfig } from 'vitest/config';

// The local archive subproject uses node:test, so Vitest must only discover
// the upstream extension and site suites under the root tests directory.
export default defineConfig({
  test: { include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'] }
});
