// docs/spec.md section 4.2: REQ-010 to REQ-018.
import { beforeEach, describe, expect, it } from 'vitest';
import { zeg, command, query } from '@otar/zeg';
import { A, B, BH, Q, cmd, qry, resetCalls } from './spec-fixtures.js';
import { checkSeen, expectHandled, expectRejects, expectThrows, pairOf } from './helpers.js';

beforeEach(() => {
  resetCalls();
});

describe('4.2 zeg(): argument and options', () => {
  it('REQ-010 zeg() returns undefined', () => {
    expect(zeg({ commands: cmd })).toBeUndefined();
  });

  it('REQ-011 the argument must be a plain object', () => {
    for (const value of [undefined, null, 'x', 1, [], () => {}, new Map(), new A()]) {
      expectThrows('INVALID_CONFIG', value);
    }
    expectThrows('INVALID_CONFIG'); // no argument
    expect(zeg(Object.create(null))).toBeUndefined();
  });

  it('REQ-012 the argument cannot have other properties', () => {
    const notEnumerable = Object.defineProperty({}, 'extra', { value: 1, enumerable: false });
    expect(Object.keys(notEnumerable)).toEqual([]);
    const values = [
      { handlers: {} },
      { commands: cmd, extra: 1 },
      { extra: undefined },
      { [Symbol('x')]: 1 },
      notEnumerable,
    ];
    for (const value of values) {
      expectThrows('INVALID_CONFIG', value);
    }
    // Also with a valid option next to the symbol name or the name that is not enumerable
    expectThrows('INVALID_CONFIG', { commands: cmd, [Symbol('x')]: 1 });
    expectThrows('INVALID_CONFIG', Object.defineProperty({ commands: cmd }, 'extra', { value: 1 }));
  });

  it('REQ-012 (Z2, Z3) an own property commands that is not enumerable is a valid option', async () => {
    expect(
      zeg(Object.defineProperty({}, 'commands', { value: cmd, enumerable: false })),
    ).toBeUndefined();
    const m = new A(1);
    await command(m);
    expectHandled('A', m);
  });

  it('REQ-013 an option with the value undefined is the same as a missing option', async () => {
    expect(zeg({ commands: undefined, queries: qry })).toBeUndefined();
    expect(await query(new Q(1))).toEqual({ tag: 'Q', v: 1 });
  });

  it('REQ-013 (Z3) zeg() reads only own properties of the options', () => {
    Object.prototype.queries = 'x';
    try {
      expect(zeg({ commands: cmd })).toBeUndefined();
    } finally {
      delete Object.prototype.queries;
    }
  });

  it('REQ-014 an option is a glob output or an array', async () => {
    for (const value of ['x', null, 1, () => {}, new Map(), new A()]) {
      expectThrows('INVALID_CONFIG', { commands: value });
    }
    for (const value of [cmd, [cmd]]) {
      resetCalls();
      expect(zeg({ commands: value })).toBeUndefined();
      const m = new A(1);
      await command(m);
      expectHandled('A', m);
    }
  });

  it('REQ-015 an array can be empty, and each entry must be a plain object', () => {
    expect(zeg({ commands: [] })).toBeUndefined();
    // eslint-disable-next-line no-sparse-arrays
    const holey = [, cmd];
    expect(0 in holey).toBe(false);
    for (const array of [
      [cmd, 'x'],
      [cmd, null],
      [cmd, []],
      [cmd, new Map()],
      [undefined],
      holey,
    ]) {
      expectThrows('INVALID_CONFIG', { commands: array });
    }
  });

  it('REQ-015 (section 2) a hole reads as undefined, also if Array.prototype has a value at its index', () => {
    // eslint-disable-next-line no-sparse-arrays
    const holey = [, cmd];
    // A valid glob output with another class. As a result, only the hole can make the call throw.
    Array.prototype[0] = pairOf(B, BH, 'B');
    try {
      expectThrows('INVALID_CONFIG', { commands: holey });
    } finally {
      delete Array.prototype[0];
    }
  });

  it('REQ-016 each module in a glob output must be an object', () => {
    for (const module of [() => {}, Object.assign(() => {}, { default: B }), null, 'x']) {
      expectThrows('INVALID_CONFIG', {
        commands: { ...cmd, './B.js': module, './BHandler.js': { default: BH } },
      });
    }
  });

  it('REQ-017 each file path must end in .js', () => {
    for (const path of ['./A.ts', './A.JS', './A']) {
      const error = expectThrows('INVALID_CONFIG', {
        commands: { ...cmd, [path]: { default: B } },
      });
      expect(error.message).toContain(path);
    }
  });

  it('REQ-018 zeg() ignores properties of a glob output that are not enumerable strings', async () => {
    const output = { ...cmd, [Symbol('B')]: { default: B } };
    Object.defineProperty(output, './B.js', { value: { default: B }, enumerable: false });
    expect(zeg({ commands: output })).toBeUndefined();
    const m = new A(1);
    await command(m);
    expectHandled('A', m);
    // B is not in the registry
    await expectRejects('HANDLER_NOT_FOUND', command(new B(1)));
  });

  it('REQ-113 the ZegErrors of this file have known codes', () => {
    checkSeen(['INVALID_CONFIG', 'HANDLER_NOT_FOUND']);
  });
});
