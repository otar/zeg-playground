// docs/spec.md section 4.5: REQ-050 to REQ-058. REQ-053 is in req-053.test.js.
import { beforeEach, describe, expect, it } from 'vitest';
import { zeg, command, query } from '@otar/zeg';
import { A, AH, B, BH, cmd, qry, calls, resetCalls } from './spec-fixtures.js';
import {
  checkSeen,
  expectHandled,
  expectRejects,
  expectThrows,
  pairOf,
  returning,
  settle,
  thrownBy,
} from './helpers.js';

beforeEach(() => {
  resetCalls();
});

describe('4.5 zeg(): state and errors', () => {
  it('REQ-050 each call to zeg() replaces the registry', async () => {
    zeg({ commands: cmd });
    zeg({ queries: qry });
    await expectRejects('HANDLER_NOT_FOUND', command(new A(1)));
    expect(calls).toEqual([]);
  });

  it('REQ-050 a dispatch that started before a later call to zeg() uses the registry of its call', async () => {
    zeg({ commands: cmd });
    const m = new A(1);
    const p = command(m);
    expect(zeg({})).toBeUndefined();
    expect(await settle(p)).toEqual({ ok: true, value: undefined });
    expectHandled('A', m);
    // The new, empty registry applies to the next call
    await expectRejects('HANDLER_NOT_FOUND', command(new A(2)));
  });

  it('REQ-050 (S4) the registry of the call also applies when handle() is async', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    class H {
      async handle(m) {
        await gate;
        calls.push(['H', m]);
      }
    }
    zeg({ commands: pairOf(A, H) });
    const m = new A(1);
    const p = command(m);
    zeg({});
    release();
    expect(await settle(p)).toEqual({ ok: true, value: undefined });
    expectHandled('H', m);
  });

  it('REQ-051 zeg({}) creates an empty registry', async () => {
    zeg({ commands: cmd, queries: qry });
    zeg({});
    await expectRejects('HANDLER_NOT_FOUND', command(new A(1)));
  });

  it('REQ-052 a call to zeg() that throws does not change the registry', async () => {
    zeg({ commands: cmd });
    expectThrows('INVALID_CONFIG', { commands: { './X.js': { default: B } } });
    // Also a failure in Z6, after both kinds passed Z3 to Z5
    expectThrows('INVALID_CONFIG', { commands: pairOf(B, BH, 'B'), queries: [qry, qry] });
    const m = new A(1);
    await command(m);
    expectHandled('A', m);
    await expectRejects('HANDLER_NOT_FOUND', command(new B(1)));
  });

  it('REQ-054 zeg() copies the entries of the glob outputs', async () => {
    const output = { ...cmd };
    zeg({ commands: output });
    for (const key of Object.keys(output)) {
      delete output[key];
    }
    const m = new A(1);
    await command(m);
    expectHandled('A', m);
  });

  it('REQ-055 a value that user code throws in zeg() reaches the caller unchanged', async () => {
    zeg({ commands: cmd });
    const e = new Error('e');
    const output = {
      ...cmd,
      get './B.js'() {
        throw e;
      },
    };
    expect(thrownBy({ commands: output })).toBe(e);
    const m = new A(1);
    await command(m);
    expectHandled('A', m);
  });

  it('REQ-055 (section 2) other user code: getters and Proxy traps, also values that are not an Error', async () => {
    zeg({ commands: cmd });
    for (const v of [new Error('v'), 'x', 42, undefined]) {
      const thrower = () => {
        throw v;
      };
      const optionSets = [
        new Proxy({}, { getPrototypeOf: thrower }),
        new Proxy({}, { ownKeys: thrower }),
        Object.defineProperty({}, 'commands', { enumerable: true, get: thrower }),
        { commands: Object.defineProperty([], 0, { enumerable: true, get: thrower }) },
        { commands: new Proxy([], { get: (t, k) => (k === 'length' ? thrower() : t[k]) }) },
        { commands: new Proxy({}, { ownKeys: thrower }) },
        {
          commands: {
            './A.js': {
              get default() {
                return thrower();
              },
            },
            './AHandler.js': { default: AH },
          },
        },
        {
          commands: {
            './A.js': {
              default: new Proxy(A, { get: (t, k) => (k === 'prototype' ? thrower() : t[k]) }),
            },
            './AHandler.js': { default: AH },
          },
        },
        {
          commands: {
            './A.js': { default: A },
            './AHandler.js': {
              default: class {
                get handle() {
                  return thrower();
                }
              },
            },
          },
        },
      ];
      for (const options of optionSets) {
        expect(thrownBy(options)).toBe(v);
      }
    }
    const m = new A(1);
    await command(m);
    expectHandled('A', m);
  });

  it('REQ-056 the error text of INVALID_CONFIG names the option and the file', () => {
    const e1 = expectThrows('INVALID_CONFIG', { commands: [cmd, { './B.js': { default: B } }] });
    expect(e1.message).toContain('commands[1]');
    expect(e1.message).toContain('./B.js');
    const e2 = expectThrows('INVALID_CONFIG', {
      commands: { ...cmd, './B.js': { default: A }, './BHandler.js': { default: AH } },
    });
    expect(e2.message).toContain('./A.js');
    expect(e2.message).toContain('./B.js');
    const e3 = expectThrows('INVALID_CONFIG', { extra: 1 });
    expect(e3.message).toContain('extra');
  });

  it('REQ-057 zeg() stops at the first check that fails', () => {
    const e = new Error('e');
    const badPath = { './B.tsx': { default: B } };
    const unpaired = { './B.js': { default: B } };
    const throwing = {
      get './C.js'() {
        throw e;
      },
    };
    expect(Object.keys(throwing)).toEqual(['./C.js']);
    expectThrows('INVALID_CONFIG', { commands: [badPath, throwing] });
    expect(thrownBy({ commands: [throwing, badPath] })).toBe(e);
    expect(thrownBy({ commands: [unpaired, throwing] })).toBe(e);
    expectThrows('INVALID_CONFIG', { commands: badPath, queries: throwing });
    expectThrows('INVALID_CONFIG', { commands: throwing, queries: 'x' });
    // Z5 before Z6: commands[0] and commands[1] have the same message class, and commands[2] has no pair.
    const error = expectThrows('INVALID_CONFIG', {
      commands: [cmd, cmd, { './X.js': { default: B } }],
    });
    expect(error.message).toContain('commands[2]');
    expect(error.message).toContain('./X.js');
  });

  it('REQ-058 the error texts of common mistakes name the fix', async () => {
    const field = class {
      handle = () => {};
    };
    const cases = [
      [{ extra: 1 }, 'The options are commands and queries'],
      [{ commands: {} }, 'Check the glob pattern'],
      [{ commands: { ...cmd, './B.js': () => {} } }, '{ eager: true }'],
      [{ commands: { ...cmd, './B.js': B } }, 'without the import option'],
      [{ commands: pairOf(B, field, 'B') }, 'on its prototype'],
    ];
    for (const [options, hint] of cases) {
      expect(expectThrows('INVALID_CONFIG', options).message).toContain(hint);
    }
    zeg({
      commands: cmd,
      queries: pairOf(
        B,
        returning(() => undefined),
        'B',
      ),
    });
    const notFound = await expectRejects('HANDLER_NOT_FOUND', command(new Map()));
    expect(notFound.message).toContain('is not the default export of a message file in commands');
    const noValue = await expectRejects('UNDEFINED_RESULT', query(new B(1)));
    expect(noValue.message).toContain('Return null for no value');
  });

  it('REQ-113 the ZegErrors of this file have known codes', () => {
    checkSeen(['INVALID_CONFIG', 'HANDLER_NOT_FOUND', 'UNDEFINED_RESULT']);
  });
});
