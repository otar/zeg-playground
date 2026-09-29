// docs/spec.md section 4.3: REQ-020 to REQ-036.
import { beforeEach, describe, expect, it } from 'vitest';
import { Zeg, command, query } from '@otar/zeg';
import { A, AH, B, BH, cmd, calls, resetCalls } from './spec-fixtures.js';
import { checkSeen, expectHandled, expectThrows } from './helpers.js';
import Ping from './fixtures/queries/Ping.js';
import SplitPing from './fixtures/split/queries/Ping.js';
import SubPing from './fixtures/split/queries/sub/Ping.js';
import TsPing from './fixtures/ts/Ping.ts';
import TsEcho from './fixtures/ts/sub/Echo.ts';

beforeEach(() => {
  resetCalls();
});

describe('4.3 Zeg(): files and pairs', () => {
  it('REQ-020 a pair connects a message class to its handler class', async () => {
    Zeg({ commands: cmd });
    const m = new A(1);
    await command(m);
    expect(calls).toHaveLength(1);
    expectHandled('A', m);
  });

  it('REQ-021 a message file must have a handler file', () => {
    expectThrows('INVALID_CONFIG', { commands: { './A.js': { default: A } } });
  });

  it('REQ-022 a handler file must have a message file', () => {
    expectThrows('INVALID_CONFIG', { commands: { './AHandler.js': { default: AH } } });
  });

  it('REQ-023 the files of a pair must be in the same folder', () => {
    expectThrows('INVALID_CONFIG', {
      commands: { './x/A.js': { default: A }, './y/AHandler.js': { default: AH } },
    });
  });

  it('REQ-024 the file names of a pair must match exactly', () => {
    expectThrows('INVALID_CONFIG', {
      commands: { './A.js': { default: A }, './aHandler.js': { default: AH } },
    });
    expectThrows('INVALID_CONFIG', {
      commands: { './a.js': { default: A }, './AHandler.js': { default: AH } },
    });
  });

  it('REQ-025 pairs can be in subfolders', async () => {
    Zeg({
      commands: { './billing/A.js': { default: A }, './billing/AHandler.js': { default: AH } },
    });
    const m = new A(1);
    await command(m);
    expectHandled('A', m);
  });

  it('REQ-026 files with the same name in different folders form different pairs', async () => {
    Zeg({
      commands: {
        './billing/C.js': { default: A },
        './billing/CHandler.js': { default: AH },
        './shop/C.js': { default: B },
        './shop/CHandler.js': { default: BH },
      },
    });
    const a = new A(1);
    const b = new B(2);
    await command(a);
    await command(b);
    expect(calls).toEqual([
      ['A', a],
      ['B', b],
    ]);
    expect(calls[0][1]).toBe(a);
    expect(calls[1][1]).toBe(b);
  });

  it('REQ-027 the files of a pair must be in the same glob output', () => {
    expectThrows('INVALID_CONFIG', {
      commands: [{ './A.js': { default: A } }, { './AHandler.js': { default: AH } }],
    });
  });

  it('REQ-028 a handler file named only Handler.js or Handler.ts is not valid', () => {
    for (const ext of ['.js', '.ts']) {
      expectThrows('INVALID_CONFIG', { commands: { [`./Handler${ext}`]: { default: AH } } });
      expectThrows('INVALID_CONFIG', {
        commands: { [`./${ext}`]: { default: A }, [`./Handler${ext}`]: { default: AH } },
      });
      // The same without a folder: the file name is the full path
      expectThrows('INVALID_CONFIG', {
        commands: { [ext]: { default: A }, [`Handler${ext}`]: { default: AH } },
      });
    }
  });

  it('REQ-029 only a file whose name ends in Handler.js or Handler.ts is a handler file', async () => {
    for (const ext of ['.js', '.ts']) {
      const error = expectThrows('INVALID_CONFIG', {
        commands: {
          [`./ErrorHandler${ext}`]: { default: AH },
          [`./ErrorHandlerHandler${ext}`]: { default: AH },
        },
      });
      expect(error.message).toContain(`./ErrorHandler${ext}`);
      const valid = [
        [`./Error${ext}`, `./ErrorHandler${ext}`],
        [`./Handlers${ext}`, `./HandlersHandler${ext}`],
        [`./Ahandler${ext}`, `./AhandlerHandler${ext}`],
      ];
      for (const [message, handler] of valid) {
        resetCalls();
        expect(
          Zeg({ commands: { [message]: { default: A }, [handler]: { default: AH } } }),
        ).toBeUndefined();
        const m = new A(1);
        await command(m);
        expectHandled('A', m);
      }
    }
  });

  it('REQ-029 (section 2) other names that contain Handler are message files', async () => {
    const cases = [
      ['./HandlerX.js', './HandlerXHandler.js'],
      ['./AHandler.JS.js', './AHandler.JSHandler.js'],
    ];
    for (const [message, handler] of cases) {
      resetCalls();
      expect(
        Zeg({ commands: { [message]: { default: A }, [handler]: { default: AH } } }),
      ).toBeUndefined();
      const m = new A(1);
      await command(m);
      expectHandled('A', m);
    }
  });

  it('REQ-030 each file must be part of a pair', () => {
    for (const module of [{ welcomeText() {} }, { default: class {} }]) {
      expectThrows('INVALID_CONFIG', { commands: { ...cmd, './email.js': module } });
    }
  });

  it('REQ-031 file paths can have any prefix', async () => {
    const paths = [
      ['A.js', 'AHandler.js'],
      ['../src/A.js', '../src/AHandler.js'],
      ['/src/A.js', '/src/AHandler.js'],
    ];
    for (const [message, handler] of paths) {
      resetCalls();
      expect(
        Zeg({ commands: { [message]: { default: A }, [handler]: { default: AH } } }),
      ).toBeUndefined();
      const m = new A(1);
      await command(m);
      expectHandled('A', m);
    }
  });

  it('REQ-032 real glob outputs work: an eager glob', async () => {
    const output = import.meta.glob('./fixtures/queries/**/*.js', { eager: true });
    expect(Object.keys(output).sort()).toEqual([
      './fixtures/queries/Ping.js',
      './fixtures/queries/PingHandler.js',
    ]);
    expect(Zeg({ queries: output })).toBeUndefined();
    expect(await query(new Ping())).toBe('pong');
  });

  it('REQ-032 a lazy glob throws INVALID_CONFIG', () => {
    const output = import.meta.glob('./fixtures/queries/**/*.js');
    expect(Object.keys(output).sort()).toEqual([
      './fixtures/queries/Ping.js',
      './fixtures/queries/PingHandler.js',
    ]);
    for (const value of Object.values(output)) {
      expect(typeof value).toBe('function');
    }
    expectThrows('INVALID_CONFIG', { queries: output });
  });

  it('REQ-032 a second message file with a default export from another file throws INVALID_CONFIG', () => {
    const output = import.meta.glob('./fixtures/reexport/*.js', { eager: true });
    expect(Object.keys(output).sort()).toEqual([
      './fixtures/reexport/A.js',
      './fixtures/reexport/AHandler.js',
      './fixtures/reexport/Copy.js',
      './fixtures/reexport/CopyHandler.js',
    ]);
    expect(output['./fixtures/reexport/Copy.js'].default).toBe(
      output['./fixtures/reexport/A.js'].default,
    );
    const error = expectThrows('INVALID_CONFIG', { commands: output });
    expect(error.message).toContain('./fixtures/reexport/A.js');
    expect(error.message).toContain('./fixtures/reexport/Copy.js');
  });

  it('REQ-033 a handler file cannot use a handler file as its message file', () => {
    const error = expectThrows('INVALID_CONFIG', {
      commands: { ...cmd, './AHandlerHandler.js': { default: AH } },
    });
    expect(error.message).toContain('./AHandlerHandler.js');
  });

  it('REQ-034 handler files can be in a separate folder: two globs with the Vite option base', async () => {
    const messages = import.meta.glob(['./**/*.js', '!**/*Handler.js'], {
      eager: true,
      base: './fixtures/split/queries',
    });
    const handlers = import.meta.glob('./**/*Handler.js', {
      eager: true,
      base: './fixtures/split/query-handlers',
    });
    expect(Object.keys(messages).sort()).toEqual(['./Ping.js', './sub/Ping.js']);
    expect(Object.keys(handlers).sort()).toEqual(['./PingHandler.js', './sub/PingHandler.js']);
    expect(Zeg({ queries: { ...messages, ...handlers } })).toBeUndefined();
    expect(await query(new SplitPing())).toBe('split pong');
    expect(await query(new SubPing())).toBe('sub pong');
  });

  it('REQ-034 without the Vite option base, the file paths of the handler files do not match', () => {
    const messages = import.meta.glob(['./**/*.js', '!**/*Handler.js'], {
      eager: true,
      base: './fixtures/split/queries',
    });
    const handlers = import.meta.glob('./fixtures/split/query-handlers/**/*Handler.js', {
      eager: true,
    });
    expect(Object.keys(handlers).sort()).toEqual([
      './fixtures/split/query-handlers/PingHandler.js',
      './fixtures/split/query-handlers/sub/PingHandler.js',
    ]);
    expectThrows('INVALID_CONFIG', { queries: { ...messages, ...handlers } });
  });

  it('REQ-035 message files and handler files can be .ts files', async () => {
    const output = import.meta.glob('./fixtures/ts/**/*.ts', { eager: true });
    expect(Object.keys(output).sort()).toEqual([
      './fixtures/ts/Ping.ts',
      './fixtures/ts/PingHandler.ts',
      './fixtures/ts/sub/Echo.ts',
      './fixtures/ts/sub/EchoHandler.ts',
    ]);
    expect(Zeg({ queries: output })).toBeUndefined();
    expect(await query(new TsPing('a'))).toBe('pong a');
    expect(await query(new TsEcho('b'))).toBe('b');
  });

  it('REQ-036 a pair uses one extension', async () => {
    const noHandler = expectThrows('INVALID_CONFIG', {
      commands: { './B.ts': { default: B }, './BHandler.js': { default: BH } },
    });
    expect(noHandler.message).toContain('./BHandler.ts');
    const noMessage = expectThrows('INVALID_CONFIG', {
      commands: { './BHandler.ts': { default: BH }, './B.js': { default: B } },
    });
    expect(noMessage.message).toContain('./B.ts');
    // A .js pair and a .ts pair with the same key in one folder are valid.
    Zeg({ commands: { ...cmd, './A.ts': { default: B }, './AHandler.ts': { default: BH } } });
    const a = new A(1);
    const b = new B(2);
    await command(a);
    await command(b);
    expectHandled('A', a);
    expectHandled('B', b);
  });

  it('REQ-113 the ZegErrors of this file have known codes', () => {
    checkSeen(['INVALID_CONFIG']);
  });
});
