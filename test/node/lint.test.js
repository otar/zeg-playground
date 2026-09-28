// docs/spec.md REQ-134 (type S). It runs in Node (section 1.5, rule 7).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ESLint } from 'eslint';
import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const gitFiles = () =>
  execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

// Runs a tool from node_modules/.bin in the repository root. Returns its exit code and its output.
function run(tool, args) {
  try {
    const output = execFileSync(join(ROOT, 'node_modules/.bin', tool), args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { code: 0, output };
  } catch (error) {
    return { code: error.status, output: `${error.stdout}${error.stderr}` };
  }
}

// The lines of the curly errors (not warnings) that ESLint reports for the text.
async function curlyErrorLines(eslint, text, filePath) {
  const [result] = await eslint.lintText(text, { filePath: join(ROOT, filePath) });
  return result.messages
    .filter((message) => message.ruleId === 'curly' && message.severity === 2)
    .map((message) => message.line);
}

// One statement of each kind without braces: if, else, for, while and do.
const NO_BRACES = [
  'if (a) b();',
  'else b();',
  'for (;;) b();',
  'while (a) b();',
  'do b();',
  'while (a);',
];

describe('4.13 non-functional checks', () => {
  it('REQ-134 ESLint and Prettier find no errors in the repository', () => {
    const { scripts } = JSON.parse(read('package.json'));
    expect(scripts.lint).toBe('eslint --max-warnings 0 . && prettier --check .');
    expect(scripts['lint:fix']).toBe('eslint --fix . && prettier --write .');

    const eslint = run('eslint', ['--max-warnings', '0', '.']);
    expect(eslint.code, eslint.output).toBe(0);
    const check = run('prettier', ['--check', '.']);
    expect(check.code, check.output).toBe(0);
  }, 60_000);

  it('REQ-134 the rule curly requires braces in the JavaScript files and in the Markdown code blocks', async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const files = [
      'src/zeg.js',
      'test/helpers.js',
      'test/node/lint.test.js',
      'scripts/check-coverage.js',
      'examples/basic-worker/src/index.js',
      'eslint.config.js',
    ];
    for (const file of files) {
      expect(await curlyErrorLines(eslint, NO_BRACES.join('\n'), file), file).toEqual([
        1, 2, 3, 4, 5,
      ]);
    }
    const markdown = ['# Example', '', '```js', ...NO_BRACES, '```', ''].join('\n');
    expect(await curlyErrorLines(eslint, markdown, 'docs/example.md')).toEqual([4, 5, 6, 7, 8]);
  }, 60_000);

  it('REQ-134 the tools check all tracked files, and no comment in a file turns off curly', async () => {
    const files = gitFiles();
    const eslint = new ESLint({ cwd: ROOT });
    for (const file of files.filter((f) => /\.(js|mjs|md)$/.test(f))) {
      expect(await eslint.isPathIgnored(join(ROOT, file)), file).toBe(false);
    }
    const formatted = files.filter(
      (f) => /\.(js|mjs|json|jsonc|yml|yaml|md)$/.test(f) && !f.endsWith('package-lock.json'),
    );
    for (const file of formatted) {
      const info = await prettier.getFileInfo(join(ROOT, file), {
        ignorePath: [join(ROOT, '.gitignore'), join(ROOT, '.prettierignore')],
      });
      expect(info.ignored, file).toBe(false);
      expect(info.inferredParser, file).not.toBeNull();
    }

    // ESLint without the comments in the files: the result has no curly error.
    const strict = new ESLint({
      cwd: ROOT,
      overrideConfig: { linterOptions: { noInlineConfig: true } },
    });
    const results = await strict.lintFiles(['.']);
    const curly = results.flatMap((result) =>
      result.messages
        .filter((m) => m.ruleId === 'curly')
        .map((m) => `${result.filePath}:${m.line}`),
    );
    expect(curly).toEqual([]);
    // The Markdown plugin does not lint a code block after the HTML comment eslint-skip.
    for (const file of files.filter((f) => f.endsWith('.md'))) {
      expect(read(file), file).not.toMatch(/<!--\s*eslint-skip\s*-->/);
    }
  }, 60_000);

  it('REQ-134 the only jsx code block in the Markdown files is the first code block of README.md', () => {
    const FENCE = /^[ \t]*(?:`{3,}|~{3,})[ \t]*([^\s`]*)/gm;
    const markdown = gitFiles().filter((file) => file.endsWith('.md'));
    const jsx = markdown.flatMap((file) =>
      [...read(file).matchAll(FENCE)].filter((match) => match[1] === 'jsx').map(() => file),
    );
    expect(jsx).toEqual(['README.md']);
    expect([...read('README.md').matchAll(FENCE)][0][0].trim()).toBe('```jsx');
  });

  it('REQ-134 the Prettier configuration has the decided layout, and Prettier has an exact version', async () => {
    const config = await prettier.resolveConfig(join(ROOT, 'src/zeg.js'));
    expect(config).toMatchObject({
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'all',
    });
    // The only override: Markdown tables use the compact form.
    expect(JSON.parse(read('.prettierrc.json')).overrides).toEqual([
      { files: '*.md', options: { proseWrap: 'never' } },
    ]);
    const { devDependencies } = JSON.parse(read('package.json'));
    expect(devDependencies.prettier).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
