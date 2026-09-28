import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-plugin';

// docs/spec.md section 1.5:
// - The unit tests run in workerd (rule 1). The build tests and the static checks run in Node (rule 7).
//   The two projects are in this one configuration (rule 8).
// - test/wrangler.jsonc has no main (rule 2), and no setup file exists (rule 3).
// - The tests import '@otar/zeg' through the self-reference of package.json (rule 4).
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './test/wrangler.jsonc' } })],
        test: { name: 'unit', include: ['test/*.test.js'], sequence: { concurrent: false } }, // rule 6
      },
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/node/*.test.js'],
          sequence: { concurrent: false },
        },
      },
    ],
    // REQ-131: `npm run coverage` runs the unit project with --coverage.
    coverage: {
      provider: 'istanbul',
      include: ['src/zeg.js'],
      reporter: [['text', { skipFull: false }], 'json-summary'],
      reportsDirectory: './coverage',
      thresholds: { 100: true },
    },
  },
});
