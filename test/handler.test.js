// docs/spec.md section 4.8: REQ-080 to REQ-089.
import { beforeEach, describe, expect, it } from 'vitest';
import { zeg, command, query } from '@otar/zeg';
import { A, B, BH, Q, cmd, qry, calls, resetCalls } from './spec-fixtures.js';
import { expectHandled, expectTypeError, pairOf, settle } from './helpers.js';

beforeEach(() => {
  resetCalls();
});

describe('4.8 dispatch: the handler', () => {
  it('REQ-080 each dispatch creates a new handler instance', async () => {
    const instances = [];
    class H {
      handle() {
        instances.push(this);
      }
    }
    zeg({ commands: pairOf(A, H) });
    await command(new A(1));
    await command(new A(2));
    expect(instances).toHaveLength(2);
    expect(instances[0]).not.toBe(instances[1]);
    expect(instances[0]).toBeInstanceOf(H);
    expect(instances[1]).toBeInstanceOf(H);
  });

  it('REQ-081 the handler constructor receives no arguments', async () => {
    const lengths = [];
    class H {
      constructor() {
        lengths.push(arguments.length);
      }
      handle() {}
    }
    zeg({ commands: pairOf(A, H) });
    await command(new A(1));
    expect(lengths).toEqual([0]);
  });

  it('REQ-082 handle() receives exactly one argument, the message itself', async () => {
    const stored = [];
    const instances = [];
    class H {
      constructor() {
        instances.push(this);
      }
      handle() {
        stored.push([arguments.length, arguments[0], this]);
      }
    }
    zeg({ commands: pairOf(A, H) });
    const message = new A(1);
    await command(message);
    expect(stored).toHaveLength(1);
    expect(stored[0][0]).toBe(1);
    expect(stored[0][1]).toBe(message);
    // `this` is the handler instance that zeg created for this dispatch
    expect(instances).toHaveLength(1);
    expect(stored[0][2]).toBe(instances[0]);
    expect(stored[0][2]).toBeInstanceOf(H);
  });

  it('REQ-083 handle() starts during the call', async () => {
    zeg({ commands: cmd });
    const m = new A(1);
    const p = command(m);
    expectHandled('A', m);
    await p;
  });

  it('REQ-084 zeg does not change the message', async () => {
    class H {
      handle(m) {
        m.v = 2;
        m.list.push(1);
      }
    }
    zeg({ commands: pairOf(A, H) });
    const message = new A(1);
    message.list = [];
    await command(message);
    expect(message.v).toBe(2);
    expect(message.list).toHaveLength(1);
    expect(Object.isFrozen(message)).toBe(false);
    expect(Object.isFrozen(message.list)).toBe(false);
  });

  it('REQ-085 a message class can freeze its message', async () => {
    class F {
      constructor(v) {
        this.v = v;
        Object.freeze(this);
      }
    }
    class FH {
      handle(m) {
        m.v = 2;
      }
    }
    zeg({ commands: pairOf(F, FH, 'F') });
    const message = new F(1);
    await expectTypeError(command(message));
    expect(message.v).toBe(1);
  });

  it('REQ-086 a handler can dispatch another message', async () => {
    let b;
    class AD {
      async handle() {
        b = new B(1);
        await command(b);
        calls.push(await query(new Q(1)));
      }
    }
    zeg({
      commands: {
        './A.js': { default: A },
        './AHandler.js': { default: AD },
        './B.js': { default: B },
        './BHandler.js': { default: BH },
      },
      queries: qry,
    });
    const r = await settle(command(new A(1)));
    expect(r).toEqual({ ok: true, value: undefined });
    expectHandled('B', b);
    expect(calls).toContainEqual({ tag: 'Q', v: 1 });
  });

  it('REQ-087 zeg has no limit for nested dispatches', async () => {
    class R {
      constructor(n) {
        this.n = n;
      }
    }
    let runs = 0;
    class RH {
      async handle(m) {
        runs++;
        if (m.n > 0) {
          await command(new R(m.n - 1));
        }
      }
    }
    zeg({ commands: pairOf(R, RH, 'R') });
    const r = await settle(command(new R(100)));
    expect(r).toEqual({ ok: true, value: undefined });
    expect(runs).toBe(101);
  });

  it('REQ-088 handle() can be sync or async', async () => {
    class S1 {}
    class S2 {}
    class SyncHandler {
      handle() {
        return { v: 1 };
      }
    }
    class AsyncHandler {
      async handle() {
        return { v: 1 };
      }
    }
    zeg({ queries: { ...pairOf(S1, SyncHandler, 'S1'), ...pairOf(S2, AsyncHandler, 'S2') } });
    expect(await query(new S1())).toEqual({ v: 1 });
    expect(await query(new S2())).toEqual({ v: 1 });
  });

  it('REQ-089 zeg calls the handle() of the instance: an own function has priority', async () => {
    const ran = [];
    class H {
      constructor() {
        this.handle = (m) => {
          ran.push(['own', m]);
        };
      }
      handle(m) {
        ran.push(['prototype', m]);
      }
    }
    zeg({ commands: pairOf(A, H) });
    const m = new A(1);
    await command(m);
    expect(ran).toHaveLength(1);
    expect(ran[0][0]).toBe('own');
    expect(ran[0][1]).toBe(m);
  });

  it('REQ-089 an own property handle with the value 1: the Promise rejects with a TypeError', async () => {
    class H {
      constructor() {
        this.handle = 1;
      }
      handle() {}
    }
    zeg({ commands: pairOf(A, H) });
    await expectTypeError(command(new A(1)));
  });

  it('REQ-089 a generator function as handler class: zeg() returns, and the Promise rejects with the TypeError from new', async () => {
    let handleRan = 0;
    function* G() {}
    G.prototype.handle = function () {
      handleRan++;
    };
    expect(zeg({ commands: pairOf(A, G) })).toBeUndefined();
    const error = await expectTypeError(command(new A(1)));
    expect(error.message).toMatch(/not a constructor/);
    expect(handleRan).toBe(0);
  });
});
