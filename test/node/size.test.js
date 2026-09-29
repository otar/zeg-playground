// docs/spec.md REQ-132 (type N). It runs in Node (section 1.5, rule 7).
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');

it('REQ-132 the library is small: esbuild --minify --format=esm, then gzip -9, is 2048 bytes or less', () => {
  const minified = execFileSync(
    join(ROOT, 'node_modules/.bin/esbuild'),
    ['src/zeg.js', '--minify', '--format=esm'],
    {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const size = gzipSync(minified, { level: 9 }).length;
  console.log(`REQ-132: minified ${minified.length} bytes, gzip -9 ${size} bytes`);
  expect(minified.length).toBeGreaterThan(0);
  expect(size).toBeLessThanOrEqual(2048);
});
