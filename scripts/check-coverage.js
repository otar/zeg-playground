// REQ-131: `npm run coverage` runs this script after Vitest. Vitest checks the thresholds of 100%.
// This script checks that the report contains src/zeg.js with more than 0 statements.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const summary = JSON.parse(readFileSync(resolve(ROOT, 'coverage/coverage-summary.json'), 'utf8'));
const entry = summary[resolve(ROOT, 'src/zeg.js')];

const errors = [];
if (!entry) {
  errors.push('the coverage report does not contain src/zeg.js');
} else {
  if (!(entry.statements.total > 0)) {
    errors.push('the coverage report contains 0 statements for src/zeg.js');
  }
  for (const metric of ['lines', 'branches', 'functions', 'statements']) {
    if (entry[metric].pct !== 100) {
      errors.push(`the ${metric} coverage of src/zeg.js is ${entry[metric].pct}%, not 100%`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`REQ-131: ${error}`);
  }
  process.exit(1);
}
console.log(
  `REQ-131: src/zeg.js has 100% coverage of ${entry.statements.total} statements and ${entry.branches.total} branches.`,
);
