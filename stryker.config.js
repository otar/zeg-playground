// The configuration of `npm run test:mutation` (D-75). CI does not run this command.
// Stryker makes many small changes (mutants) in src/index.js. For each mutant, it runs the unit tests in
// workerd. If a test fails, the test kills the mutant. If no test fails, the mutant survives.

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  // Only the unit project. The build tests of the Node project run the library only in child processes,
  // and the active mutant does not reach these processes.
  vitest: { configFile: 'vitest.mutation.config.js' },
  mutate: ['src/index.js'],
  // Each test runner starts its own workerd process.
  concurrency: '50%',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  // Stryker does not read .gitignore. It does not copy these folders into its temporary copies.
  ignorePatterns: ['coverage', 'dist', '.wrangler', 'examples'],
};
