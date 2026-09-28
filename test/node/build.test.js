// Build tests (type B) of docs/spec.md: REQ-120 to REQ-122. They run in Node (section 1.5, rule 7).
// The tests copy examples/basic-worker/ to a temporary folder and install its packages. The copy uses @otar/zeg
// from this repository. Then the tests build the Worker and start it in local workerd with Vite.
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const EXAMPLE = join(ROOT, 'examples/basic-worker');

// The child processes do not get the environment variables of Vitest. For example, NODE_ENV=test changes vite build.
const ENV = { ...process.env, CI: '1', NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false' };
for (const name of Object.keys(ENV)) {
  if (
    name.startsWith('VITEST') ||
    ['NODE_ENV', 'TEST', 'MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL'].includes(name)
  ) {
    delete ENV[name];
  }
}

let dir;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (text) => stripVTControlCharacters(text); // remove the color codes

// Runs a command in the copy of the example and returns its output. Throws if the exit code is not 0.
function run(command, args, timeout = 120_000) {
  return execFileSync(command, args, {
    cwd: dir,
    env: ENV,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout,
  });
}

// An empty local database with the migration of the example. POST / inserts a@b.c, and the email is the primary key.
function resetDatabase() {
  rmSync(join(dir, '.wrangler/state'), { recursive: true, force: true });
  run('npm', ['run', 'migrate']);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(condition, timeout) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (condition()) {
      return true;
    }
    await sleep(250);
  }
  return condition();
}

// Starts `vite preview` or `vite dev` in its own process group.
async function start(mode, args = []) {
  const port = await freePort();
  const child = spawn(
    join(dir, 'node_modules/.bin/vite'),
    [mode, '--port', String(port), '--strictPort', ...args],
    {
      cwd: dir,
      env: ENV,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const server = { child, port, output: '', exited: false, url: `http://localhost:${port}` };
  const append = (data) => {
    server.output += clean(String(data));
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('exit', () => {
    server.exited = true;
  });
  return server;
}

// Stops the process group of the server, also the workerd processes.
async function stop(server) {
  const kill = (signal) => {
    try {
      process.kill(-server.child.pid, signal);
    } catch {
      // the process group does not exist
    }
  };
  kill('SIGTERM');
  await waitFor(() => server.exited, 5_000);
  kill('SIGKILL');
}

// Starts the server, waits until it listens, and sends the requests of REQ-120.
async function checkRequests(args = []) {
  const server = await start('preview', args);
  try {
    const ready = await waitFor(() => server.output.includes('Local:') || server.exited, 60_000);
    expect(ready && !server.exited, server.output).toBe(true);

    const post = await fetch(`${server.url}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"email":"a@b.c"}',
    });
    const postBody = await post.text();
    const wrongKind = await fetch(`${server.url}/wrong-kind`);
    const wrongKindBody = await wrongKind.text();

    expect([post.status, postBody], server.output).toEqual([200, '{"email":"a@b.c"}']);
    expect([wrongKind.status, wrongKindBody], server.output).toEqual([
      400,
      '{"name":"ZegError","code":"HANDLER_NOT_FOUND"}',
    ]);
    // The nested dispatch writes this line
    expect(
      await waitFor(() => server.output.includes('welcome mail to a@b.c'), 10_000),
      server.output,
    ).toBe(true);
  } finally {
    await stop(server);
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'zeg-build-'));
  cpSync(EXAMPLE, dir, {
    recursive: true,
    filter: (source) => !['node_modules', 'dist', '.wrangler'].includes(basename(source)),
  });
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  expect(pkg.dependencies['@otar/zeg']).toBe('file:../..');
  pkg.dependencies['@otar/zeg'] = `file:${ROOT}`;
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  run('npm', ['install', '--no-audit', '--no-fund'], 600_000);
}, 600_000);

afterAll(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('4.12 build and runtime', () => {
  it('REQ-120 the example Worker works after a production build', async () => {
    run('npm', ['run', 'build']);
    resetDatabase();
    await checkRequests();
  }, 180_000);

  it('REQ-121 the example Worker works after a minified build', async () => {
    // A copy of vite.config.js with build.minify set to true and no keepNames setting
    const config = readFileSync(join(dir, 'vite.config.js'), 'utf8');
    const minified = config.replace(
      '  plugins: [cloudflare()],\n',
      '  plugins: [cloudflare()],\n  build: { minify: true },\n',
    );
    expect(minified).not.toBe(config);
    expect(minified).not.toContain('keepNames');
    writeFileSync(join(dir, 'vite.config.min.js'), minified);

    run('npm', ['run', 'build', '--', '--config', 'vite.config.min.js']);
    // The minifier renamed the class ZegError. The response still has the name ZegError.
    const worker = readFileSync(join(dir, 'dist/users_worker/index.js'), 'utf8');
    expect(worker).not.toContain('class ZegError');
    resetDatabase();
    await checkRequests(['--config', 'vite.config.min.js']);
  }, 180_000);

  it('REQ-122 an INVALID_CONFIG error stops the Worker at startup', async () => {
    const orphan = join(dir, 'src/commands/Orphan.js');
    writeFileSync(orphan, 'export default class {}\n');
    try {
      run('npm', ['run', 'build']);
      resetDatabase();
      for (const mode of ['preview', 'dev']) {
        const server = await start(mode);
        const statuses = [];
        try {
          const end = Date.now() + 30_000;
          // A process that stopped cannot answer a request later.
          while (Date.now() < end && !server.exited) {
            const requests = [
              [
                `${server.url}/`,
                {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: '{"email":"o@b.c"}',
                },
              ],
              [`${server.url}/wrong-kind`, {}],
            ];
            for (const [url, init] of requests) {
              try {
                const response = await fetch(url, { ...init, signal: AbortSignal.timeout(2_000) });
                await response.arrayBuffer();
                statuses.push(response.status);
              } catch {
                statuses.push('no response');
              }
            }
            await sleep(1_000);
          }
          const results = [...new Set(statuses)].join(', ');
          const exited = server.exited ? 'the process stopped' : 'the process runs after 30 s';
          console.log(
            `REQ-122 vite ${mode}: ${statuses.length} requests, results: ${results}, ${exited}`,
          );
          expect(
            statuses.filter((status) => status >= 200 && status < 300),
            `vite ${mode}`,
          ).toEqual([]);
          expect(server.output, `vite ${mode}`).toContain('ZegError');
          expect(server.output, `vite ${mode}`).toContain('./commands/Orphan.js');
        } finally {
          await stop(server);
        }
      }
    } finally {
      rmSync(orphan, { force: true });
    }
  }, 240_000);
});
