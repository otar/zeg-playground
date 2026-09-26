// docs/spec.md section 4.6: REQ-061, REQ-063 and REQ-064. REQ-060 and REQ-062 are in req-060.test.js and req-062.test.js.
import { beforeEach, describe, expect, it } from 'vitest';
import { zeg, command, query } from '@otar/zeg';
import { A, cmd, qry, calls, resetCalls } from './spec-fixtures.js';
import { checkSeen, expectHandled, expectRejects, expectTypeError, invalidMessages, pairOf, settle } from './helpers.js';

beforeEach(() => {
  resetCalls();
});

describe('4.6 dispatch: the message', () => {
  it('REQ-061 the Promise rejects with a TypeError for an invalid message', async () => {
    zeg({ commands: cmd, queries: qry });
    for (const value of invalidMessages()) {
      await expectTypeError(command(value));
      await expectTypeError(query(value));
    }
    expect(calls).toEqual([]);
  });

  it('REQ-063 other objects are valid messages', async () => {
    zeg({ commands: cmd, queries: qry });
    for (const message of [new Map(), new Date()]) {
      await expectRejects('HANDLER_NOT_FOUND', command(message));
      await expectRejects('HANDLER_NOT_FOUND', query(message));
    }
  });

  it('REQ-064 zeg reads no property of the message: an own getter constructor that throws', async () => {
    zeg({ commands: cmd });
    const m = new A(1);
    Object.defineProperty(m, 'constructor', {
      get() {
        throw new Error('read of constructor');
      },
    });
    await command(m);
    expectHandled('A', m);
  });

  it('REQ-064 a Proxy message: getPrototypeOf runs one time, and a read of constructor throws', async () => {
    zeg({ commands: cmd });
    let count = 0;
    const proxy = new Proxy(new A(1), {
      getPrototypeOf(target) {
        count++;
        return Reflect.getPrototypeOf(target);
      },
      get(target, key, receiver) {
        if (key === 'constructor') throw new Error('read of constructor');
        return Reflect.get(target, key, receiver);
      },
    });
    const r = await settle(command(proxy));
    // "Directly after the dispatch": no trap runs between the dispatch and these reads.
    const countAfter = count;
    const first = calls[0][1];
    expect(countAfter).toBe(1);
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(first === proxy).toBe(true);
  });

  it('REQ-064 (section 3) zeg uses no trap of the message other than one getPrototypeOf', async () => {
    const traps = [];
    const all = {};
    const names = [
      'get', 'has', 'set', 'ownKeys', 'getOwnPropertyDescriptor', 'defineProperty', 'deleteProperty',
      'getPrototypeOf', 'setPrototypeOf', 'isExtensible', 'preventExtensions', 'apply', 'construct',
    ];
    for (const name of names) {
      all[name] = (...args) => {
        traps.push(name);
        return Reflect[name](...args);
      };
    }
    // A handler that does not use the message
    const H = class {
      handle(m) {
        calls.push(['H', m]);
      }
    };
    zeg({ commands: pairOf(A, H) });
    const proxy = new Proxy(new A(1), all);
    await command(proxy);
    expect(traps).toEqual(['getPrototypeOf']);
    expectHandled('H', proxy);
  });

  it('REQ-064 a Proxy whose getPrototypeOf trap throws e: the Promise rejects with e', async () => {
    zeg({ commands: cmd });
    for (const e of [new Error('e'), 'x', undefined]) {
      const proxy = new Proxy(new A(1), {
        getPrototypeOf() {
          throw e;
        },
      });
      let p;
      expect(() => {
        p = command(proxy);
      }).not.toThrow();
      const r = await settle(p);
      expect(r.ok).toBe(false);
      expect(r.error).toBe(e);
    }
  });

  it('REQ-113 the ZegErrors of this file have known codes', () => {
    checkSeen(['HANDLER_NOT_FOUND']);
  });
});
