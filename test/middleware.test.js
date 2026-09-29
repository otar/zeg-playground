// docs/spec.md section 4.14: REQ-140 to REQ-149.
import { beforeEach, describe, expect, it } from 'vitest';
import { Zeg, command, query } from '@otar/zeg';
import { A, B, Q, cmd, qry, calls, resetCalls } from './spec-fixtures.js';
import {
  checkSeen,
  expectHandled,
  expectNotHandled,
  expectRejects,
  expectThrows,
  expectTypeError,
  pairOf,
  returning,
  settle,
} from './helpers.js';

beforeEach(() => {
  resetCalls();
});

// A middleware function that pushes `${tag}>` before next() and `<${tag}` after next().
const around = (tag) => async (message, next) => {
  calls.push(`${tag}>`);
  const value = await next();
  calls.push(`<${tag}`);
  return value;
};

describe('4.14 middleware', () => {
  it('REQ-140 the option middleware is an array of functions', () => {
    const fn = around('a');
    for (const value of [undefined, [], [fn], [fn, fn]]) {
      expect(Zeg({ commands: cmd, middleware: value })).toBeUndefined();
    }
    for (const value of [fn, (message, next) => next(), {}, { 0: fn, length: 1 }, 'x', null]) {
      const error = expectThrows('INVALID_CONFIG', { commands: cmd, middleware: value });
      expect(error.message).toBe('Zeg(): middleware must be an array of functions');
    }
    for (const value of [
      [fn, 'x'],
      [fn, null],
      [fn, {}],
      [fn, undefined],
      // eslint-disable-next-line no-sparse-arrays
      [fn, ,],
    ]) {
      const error = expectThrows('INVALID_CONFIG', { commands: cmd, middleware: value });
      expect(error.message).toBe('Zeg(): middleware[1] must be a function');
    }
  });

  it('REQ-140 (Z3) a hole reads as undefined, also if Array.prototype has a function at its index', () => {
    // eslint-disable-next-line no-sparse-arrays
    const holey = [around('a'), ,];
    expect(1 in holey).toBe(false);
    Array.prototype[1] = around('b');
    try {
      const error = expectThrows('INVALID_CONFIG', { commands: cmd, middleware: holey });
      expect(error.message).toBe('Zeg(): middleware[1] must be a function');
    } finally {
      delete Array.prototype[1];
    }
  });

  it('REQ-140 (Z3) Zeg() reads only an own property middleware', async () => {
    Object.prototype.middleware = 'x';
    try {
      expect(Zeg({ commands: cmd })).toBeUndefined();
    } finally {
      delete Object.prototype.middleware;
    }
    const m = new A(1);
    await command(m);
    expect(calls).toEqual([['A', m]]);
  });

  it('REQ-141 the first middleware function is the outermost', async () => {
    Zeg({ commands: cmd, middleware: [around('a'), around('b')] });
    const m = new A(1);
    expect(await command(m)).toBeUndefined();
    expect(calls).toEqual(['a>', 'b>', ['A', m], '<b', '<a']);
  });

  it('REQ-142 a middleware function gets the message, next and info', async () => {
    const args = [];
    const spy = (...values) => {
      args.push(values);
      return values[1]();
    };
    Zeg({ commands: [cmd], queries: qry, middleware: [spy] });
    const m1 = new A(1);
    const m2 = new Q(2);
    await command(m1);
    await query(m2);
    expect(args).toHaveLength(2);
    expect(args[0][0]).toBe(m1);
    expect(args[1][0]).toBe(m2);
    for (const [, next] of args) {
      expect(typeof next).toBe('function');
      expect(next.length).toBe(0);
    }
    expect(args.map((values) => values.length)).toEqual([3, 3]);
    expect(args[0][2]).toEqual({ kind: 'command', key: './A' });
    expect(args[1][2]).toEqual({ kind: 'query', key: './Q' });
  });

  it('REQ-142 (S5) a middleware function gets undefined as this', async () => {
    let self = 'unset';
    Zeg({
      commands: cmd,
      middleware: [
        function (message, next) {
          self = this;
          return next();
        },
      ],
    });
    await command(new A(1));
    expect(self).toBeUndefined();
  });

  it('REQ-143 next() resolves to the result of a query and to undefined for a command', async () => {
    const values = [];
    const record = async (message, next) => {
      const promise = next();
      expect(promise).toBeInstanceOf(Promise);
      values.push(await promise);
      return 42;
    };
    Zeg({
      commands: pairOf(
        A,
        returning(() => 7),
      ),
      queries: qry,
      middleware: [record],
    });
    // The value of the middleware function is the result of query(), and command() ignores it.
    expect(await query(new Q(1))).toBe(42);
    expect(await command(new A(1))).toBeUndefined();
    expect(values).toEqual([{ tag: 'Q', v: 1 }, undefined]);
  });

  it('REQ-143 (S5) next() of an outer middleware function resolves to undefined for a command', async () => {
    const values = [];
    const outer = async (message, next) => {
      values.push(await next());
    };
    const inner = async (message, next) => {
      await next();
      return 42;
    };
    Zeg({ commands: cmd, middleware: [outer, inner] });
    await command(new A(1));
    expect(values).toEqual([undefined]);
  });

  it('REQ-143 a middleware function can change the result of a query', async () => {
    const add = async (message, next) => ({ ...(await next()), extra: true });
    Zeg({ queries: qry, middleware: [add] });
    expect(await query(new Q(1))).toEqual({ tag: 'Q', v: 1, extra: true });
  });

  it('REQ-144 a middleware function can stop a dispatch', async () => {
    const e = new Error('e');
    Zeg({ commands: cmd, queries: qry, middleware: [() => 'short'] });
    expect(await query(new Q(1))).toBe('short');
    expect(await command(new A(1))).toBeUndefined();
    expect(calls).toEqual([]);

    Zeg({
      commands: cmd,
      middleware: [
        () => {
          throw e;
        },
      ],
    });
    const p = command(new A(1));
    expect(p).toBeInstanceOf(Promise);
    expect(await settle(p)).toEqual({ ok: false, error: e });
    expectNotHandled('A');
  });

  it('REQ-144 (S9) a query rejects with UNDEFINED_RESULT if a middleware function returns undefined', async () => {
    Zeg({ queries: qry, middleware: [() => undefined] });
    const error = await expectRejects('UNDEFINED_RESULT', query(new Q(1)));
    expect(error.message).toBe(
      'query(): the handler or a middleware of ./Q returned undefined. Return null for no value',
    );
    expectNotHandled('Q');
  });

  it('REQ-145 a second call to next() rejects with NEXT_CALLED_TWICE', async () => {
    const twice = async (message, next) => {
      await next();
      return next();
    };
    Zeg({ commands: cmd, middleware: [twice] });
    const m = new A(1);
    const error = await expectRejects('NEXT_CALLED_TWICE', command(m));
    expect(error.message).toBe('command(): a middleware of ./A called next() two times');
    expect(calls).toEqual([['A', m]]);
  });

  it('REQ-145 (S5) a second call to next() in an outer middleware function also rejects', async () => {
    const twice = async (message, next) => {
      await next();
      return next();
    };
    Zeg({ queries: qry, middleware: [twice, around('b')] });
    const m = new Q(1);
    const error = await expectRejects('NEXT_CALLED_TWICE', query(m));
    expect(error.message).toBe('query(): a middleware of ./Q called next() two times');
    expect(calls).toEqual(['b>', ['Q', m], '<b']);
  });

  it('REQ-146 a value that the handler throws reaches the middleware functions unchanged', async () => {
    const e = { reason: 'not an Error' };
    const seenByMiddleware = [];
    const watch = async (message, next) => {
      try {
        return await next();
      } catch (error) {
        seenByMiddleware.push(error);
        throw error;
      }
    };
    const Throws = class {
      handle() {
        throw e;
      }
    };
    Zeg({ commands: pairOf(A, Throws), middleware: [watch] });
    expect(await settle(command(new A(1)))).toEqual({ ok: false, error: e });
    expect(seenByMiddleware).toHaveLength(1);
    expect(seenByMiddleware[0]).toBe(e);
  });

  it('REQ-146 (S6) a value that the handler constructor throws reaches the middleware functions', async () => {
    const e = { reason: 'constructor' };
    const seenByMiddleware = [];
    const watch = async (message, next) => {
      try {
        return await next();
      } catch (error) {
        seenByMiddleware.push(error);
        throw error;
      }
    };
    const Throws = class {
      constructor() {
        throw e;
      }
      handle() {}
    };
    Zeg({ commands: pairOf(A, Throws), middleware: [watch] });
    expect(await settle(command(new A(1)))).toEqual({ ok: false, error: e });
    expect(seenByMiddleware).toHaveLength(1);
    expect(seenByMiddleware[0]).toBe(e);
  });

  it('REQ-147 the middleware functions do not run if the dispatch fails before S5', async () => {
    const spy = (message, next) => {
      calls.push('spy');
      return next();
    };
    Zeg({ commands: cmd, queries: qry, middleware: [spy] });
    await expectTypeError(command({}));
    await expectRejects('HANDLER_NOT_FOUND', command(new Q(1)));
    await expectRejects('HANDLER_NOT_FOUND', query(new B(1)));
    expect(calls).toEqual([]);
  });

  it('REQ-148 Zeg() copies and replaces the middleware functions', async () => {
    const list = [around('a')];
    Zeg({ commands: cmd, middleware: list });
    list.push(around('b'));
    list[0] = around('c');
    const m = new A(1);
    await command(m);
    expect(calls).toEqual(['a>', ['A', m], '<a']);
  });

  it('REQ-148 (Z7) a Zeg() that throws keeps the middleware functions of the previous call', async () => {
    Zeg({ commands: cmd, middleware: [around('a')] });
    expectThrows('INVALID_CONFIG', { commands: cmd, middleware: [around('b')], extra: 1 });
    expectThrows('INVALID_CONFIG', { commands: {}, middleware: [around('b')] });
    const m = new A(1);
    await command(m);
    expect(calls).toEqual(['a>', ['A', m], '<a']);
    // A call without the option removes the middleware functions.
    Zeg({ commands: cmd });
    resetCalls();
    await command(m);
    expect(calls).toEqual([['A', m]]);
  });

  it('REQ-148 (S5) a running dispatch keeps the middleware functions that were active when it started', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const wait = async (message, next) => {
      await gate;
      return next();
    };
    Zeg({ commands: cmd, middleware: [wait, around('b')] });
    const m = new A(1);
    const p = command(m);
    Zeg({ commands: cmd, middleware: [around('c')] });
    release();
    await p;
    expect(calls).toEqual(['b>', ['A', m], '<b']);
  });

  it('REQ-149 handle() starts during the call with middleware functions', async () => {
    Zeg({ commands: cmd, middleware: [(message, next) => next(), around('b')] });
    const m = new A(1);
    const p = command(m);
    expectHandled('A', m);
    await p;
  });

  it('REQ-149 (S5) a nested dispatch runs the middleware functions again', async () => {
    const log = [];
    const logDispatch = (message, next, { kind, key }) => {
      log.push(`${kind} ${key}`);
      return next();
    };
    const Nested = class {
      async handle() {
        await query(new Q(1));
      }
    };
    Zeg({ commands: pairOf(B, Nested, 'B'), queries: qry, middleware: [logDispatch] });
    await command(new B(1));
    expect(log).toEqual(['command ./B', 'query ./Q']);
  });

  it('REQ-113 the ZegErrors of this file have known codes', () => {
    checkSeen(['INVALID_CONFIG', 'UNDEFINED_RESULT', 'NEXT_CALLED_TWICE', 'HANDLER_NOT_FOUND']);
  });
});
