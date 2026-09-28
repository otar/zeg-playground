// Static checks (type S) of docs/spec.md. They read, list or bundle files, and they do not run the library.
// They run in Node (section 1.5, rule 7).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const gitFiles = (...patterns) =>
  execFileSync('git', ['ls-files', '--', ...patterns], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

// Reads a JSONC file: JSON with // and /* */ comments and commas after the last entry.
function readJsonc(path) {
  const text = read(path);
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const start = i;
      for (i++; text[i] !== '"'; i++) {
        if (text[i] === '\\') {
          i++;
        }
      }
      out += text.slice(start, i + 1);
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') {
        i++;
      }
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
    } else {
      out += c;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

describe('4.1 package', () => {
  it('REQ-002 the library imports no modules (esbuild metafile)', async () => {
    const result = await build({
      entryPoints: [join(ROOT, 'src/zeg.js')],
      bundle: true,
      format: 'esm',
      write: false,
      metafile: true,
      outdir: 'out',
      absWorkingDir: ROOT,
      logLevel: 'silent',
    });
    const inputs = result.metafile.inputs;
    expect(Object.keys(inputs)).toEqual(['src/zeg.js']);
    expect(inputs['src/zeg.js'].imports).toEqual([]);
  });

  it('REQ-003 package.json has the decided fields', () => {
    const pkg = readJson('package.json');
    expect(pkg.name).toBe('@otar/zeg');
    expect(pkg.version).toBe('0.1.0');
    expect(pkg.type).toBe('module');
    expect(pkg.exports).toBe('./src/zeg.js');
    expect(pkg.license).toBe('MIT');
    expect(pkg.publishConfig).toEqual({ access: 'public' });
    for (const field of ['private', 'peerDependencies', 'types', 'typings']) {
      expect(pkg).not.toHaveProperty(field);
    }
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
    for (const script of ['build', 'prepare', 'prepublishOnly']) {
      expect(pkg.scripts ?? {}).not.toHaveProperty(script);
    }
    expect(gitFiles('*.d.ts')).toEqual([]);
  });

  it('REQ-004 the license is MIT', () => {
    const text = read('LICENSE');
    expect(text).toContain('MIT License');
    expect(text).toContain('Copyright (c) 2026 Otar Chekurishvili');
  });

  it('REQ-005 the README lists the tested versions', () => {
    const text = read('README.md').replaceAll('`', '');
    expect(text).toContain('Vite 8.3');
    expect(text).toContain('@cloudflare/vite-plugin 1.60');
  });

  it('REQ-006 the library is at the repository root, and npm is the package manager', () => {
    const files = gitFiles('package.json', 'package-lock.json', 'src/zeg.js');
    expect(files.sort()).toEqual(['package-lock.json', 'package.json', 'src/zeg.js']);
  });
});

describe('4.12 build and runtime', () => {
  it('REQ-120 (spec detail 22) examples/basic-worker/ contains the example project of syntax.md section 3', () => {
    const syntax = read('docs/syntax.md');
    const section = syntax.slice(
      syntax.indexOf('## 3. Example project'),
      syntax.indexOf('### 3.8'),
    );
    const blocks = [...section.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((match) => match[1]);
    const example = (path) => read(`examples/basic-worker/${path}`);

    // Sections 3.2 and 3.3
    expect(blocks).toContain(example('vite.config.js'));
    expect(blocks).toContain(example('wrangler.jsonc'));

    // Sections 3.4 to 3.7: each block whose first line names a file of the project
    const files = {};
    for (const block of blocks) {
      const match = block.match(/^(?:\/\/|--) ((?:src|migrations)\/\S+)/);
      if (match) {
        files[match[1]] = block;
      }
    }
    const exampleFiles = gitFiles(
      'examples/basic-worker/src',
      'examples/basic-worker/migrations',
    ).map((path) => path.slice('examples/basic-worker/'.length));
    expect(exampleFiles.sort()).toEqual(Object.keys(files).sort());
    for (const [path, block] of Object.entries(files)) {
      if (path === 'src/index.js') {
        continue;
      }
      expect(example(path), path).toBe(block);
    }
    // src/index.js has one added route
    const route = /\n {4}\/\/ An extra route of this example\.[\s\S]*?\n {4}}\n\n/;
    expect(example('src/index.js')).toMatch(route);
    expect(example('src/index.js').replace(route, '\n')).toBe(files['src/index.js']);

    // Section 3.1, without the test files: the example installs @otar/zeg from this repository and has a migrate script
    const pkg = readJson('examples/basic-worker/package.json');
    const documented = JSON.parse(blocks.find((block) => block.includes('"scripts"')));
    expect(pkg.name).toBe(documented.name);
    expect(pkg.type).toBe(documented.type);
    for (const script of ['dev', 'build', 'preview', 'deploy']) {
      expect(pkg.scripts[script]).toBe(documented.scripts[script]);
    }
    expect(pkg.dependencies).toEqual({ '@otar/zeg': 'file:../..' });
    for (const name of ['@cloudflare/vite-plugin', 'vite', 'wrangler']) {
      expect(pkg.devDependencies[name]).toBe(documented.devDependencies[name]);
    }
  });

  it('REQ-123 the example Worker needs no compatibility flags', () => {
    const config = readJsonc('examples/basic-worker/wrangler.jsonc');
    expect(config.main).toBe('./src/index.js'); // the file is really the Wrangler configuration of the example
    expect(config).not.toHaveProperty('compatibility_flags');
  });
});

describe('4.13 non-functional checks', () => {
  it('REQ-130 the unit tests use Vitest 4.1 and the Workers plugin', async () => {
    const { devDependencies } = readJson('package.json');
    expect(devDependencies.vitest).toMatch(/^\^4\.1/);
    expect(devDependencies).toHaveProperty('@cloudflare/vitest-plugin');

    expect(read('vitest.config.js')).toContain(
      "import { cloudflareTest } from '@cloudflare/vitest-plugin';",
    );
    const { default: config } = await import(pathToFileURL(join(ROOT, 'vitest.config.js')).href);
    const unit = config.test.projects.find((project) => project.test.name === 'unit');
    const { cloudflareTest } = await import('@cloudflare/vitest-plugin');
    const pluginName = cloudflareTest({}).name;
    expect(unit.plugins.flat(Infinity).map((plugin) => plugin.name)).toContain(pluginName);
  });

  it('REQ-131 the coverage check uses Istanbul for src/zeg.js with thresholds of 100%', async () => {
    // `npm run coverage` measures the coverage. This test checks its configuration.
    const { default: config } = await import(pathToFileURL(join(ROOT, 'vitest.config.js')).href);
    expect(config.test.coverage).toMatchObject({
      provider: 'istanbul',
      include: ['src/zeg.js'],
      thresholds: { 100: true },
    });
    expect(config.test.coverage.reporter).toContain('json-summary');
    expect(existsSync(join(ROOT, 'scripts/check-coverage.js'))).toBe(true);
  });

  it('REQ-133 CI runs all tests and checks, except the mutation tests', () => {
    const workflow = read('.github/workflows/test.yml');
    expect(workflow).toMatch(/^on:\n {2}push:\n {4}branches: \[main\]\n/m);
    expect(workflow).toMatch(/^ +node-version: 22$/m);
    const runs = [...workflow.matchAll(/^ +(?:- )?run: (.+)$/gm)].map((match) => match[1]);
    expect(runs).toEqual(['npm ci', 'npm test', 'npm run coverage']);

    // `npm test` runs both projects: the unit tests, and the Node tests with the build tests, the static checks
    // and the size check. `npm run coverage` runs the coverage check.
    const { scripts } = readJson('package.json');
    expect(scripts.test).toBe('vitest run');
    expect(scripts.coverage).toBe(
      'vitest run --project unit --coverage && node scripts/check-coverage.js',
    );
    for (const file of ['build', 'static', 'size', 'lint']) {
      expect(existsSync(join(ROOT, `test/node/${file}.test.js`))).toBe(true);
    }

    // The mutation tests have their own script, and the workflow does not run it (D-75).
    expect(scripts['test:mutation']).toBe('stryker run');
    expect(workflow).not.toMatch(/test:mutation|stryker/i);
  });
});

describe('4.13 docblocks and the type check', () => {
  it('REQ-135 each export of src/zeg.js has a docblock', () => {
    const source = read('src/zeg.js');
    const exports = [...source.matchAll(/^export .*$/gm)];
    expect(exports.map((match) => match[0].match(/^export (?:class|function) (\w+)/)?.[1])).toEqual(
      ['ZegError', 'zeg', 'command', 'query'],
    );
    for (const match of exports) {
      expect(source.slice(0, match.index), match[0]).toMatch(/\/\*\*(?:(?!\*\/)[\s\S])*\*\/\n$/);
    }
    // esbuild keeps these comments in a minified build (D-76).
    expect(source).not.toMatch(/@license|@preserve|\/\*!|\/\/!/);
  });

  it('REQ-136 the docblocks pass the type check of TypeScript 7', () => {
    expect(readJson('package.json').devDependencies.typescript).toMatch(/^\^7\./);
    const config = readJsonc('jsconfig.json');
    expect(config.files).toEqual(['src/zeg.js']);
    expect(config.compilerOptions).toMatchObject({ checkJs: true, noEmit: true, strict: false });
    const tsc = join(ROOT, 'node_modules/typescript/bin/tsc');
    const { status, stdout, stderr } = spawnSync(process.execPath, [tsc, '-p', 'jsconfig.json'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect({ status, stdout, stderr }).toEqual({ status: 0, stdout: '', stderr: '' });
  });
});

describe('1.5 test environment', () => {
  it('1.5 rules 2, 3 and 8: two projects, no main in the test Wrangler configuration, no setup file', async () => {
    const { default: config } = await import(pathToFileURL(join(ROOT, 'vitest.config.js')).href);
    expect(config.test.projects.map((project) => project.test.name)).toEqual(['unit', 'node']);
    expect(read('vitest.config.js')).toContain("configPath: './test/wrangler.jsonc'");
    expect(readJsonc('test/wrangler.jsonc')).not.toHaveProperty('main');
    expect(config.test).not.toHaveProperty('setupFiles');
    for (const project of config.test.projects) {
      expect(project.test).not.toHaveProperty('setupFiles');
    }
    // The mutation tests use only the unit project of this configuration. Stryker changes only src/zeg.js,
    // and the run fails below a score of 100%.
    const mutation = await import(pathToFileURL(join(ROOT, 'vitest.mutation.config.js')).href);
    expect(mutation.default.test.projects).toEqual([config.test.projects[0]]);
    const stryker = await import(pathToFileURL(join(ROOT, 'stryker.config.js')).href);
    expect(stryker.default.mutate).toEqual(['src/zeg.js']);
    expect(stryker.default.thresholds.break).toBe(100);
  });
});
