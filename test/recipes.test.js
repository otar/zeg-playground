// docs/spec.md section 4.15: REQ-150. The tests use the recipe of docs/syntax.md section 7.6.
// The handlers of the example Worker need a D1 database, so the tests use the fixtures of
// docs/spec.md section 1.4.
import { beforeEach, describe, expect, it } from 'vitest';
import { Zeg, command, query } from '@otar/zeg';
import { A, B, BH, Q, qry, calls, resetCalls } from './spec-fixtures.js';
import { expectHandled } from './helpers.js';

beforeEach(() => {
  resetCalls();
});

// The function of docs/syntax.md section 7.6. It returns the middleware function `record` and the
// array `keys`. `record` records the key of each dispatch. For a command whose key is in `skip`,
// `record` returns without a call to next(), so the handler does not run.
function recordDispatches(skip) {
  const keys = [];
  const record = (message, next, { kind, key }) => {
    keys.push(key);
    if (kind === 'command' && skip.includes(key)) {
      return undefined;
    }
    return next();
  };
  return { keys, record };
}

// The handler of A dispatches B, as RegisterUserHandler dispatches SendWelcomeEmail.
class AD {
  async handle(m) {
    calls.push(['A', m]);
    await command(new B(m.v));
  }
}
const commands = {
  './A.js': { default: A },
  './AHandler.js': { default: AD },
  './B.js': { default: B },
  './BHandler.js': { default: BH },
};

describe('4.15 recipes', () => {
  it('REQ-150 a middleware function records each dispatch and skips the named commands', async () => {
    const { keys, record } = recordDispatches(['./B', './Q']);
    Zeg({ commands, queries: qry, middleware: [record] });
    const m = new A(1);
    expect(await command(m)).toBeUndefined();
    expect(keys).toEqual(['./A', './B']);
    expect(calls).toEqual([['A', m]]);
    // The function skips only commands. A query in the list gets the value of its handler.
    expect(await query(new Q(2))).toEqual({ tag: 'Q', v: 2 });
    expect(keys).toEqual(['./A', './B', './Q']);
  });

  it('REQ-150 without a command in the list, each handler runs', async () => {
    const { keys, record } = recordDispatches([]);
    Zeg({ commands, middleware: [record] });
    const m = new A(1);
    await command(m);
    expect(keys).toEqual(['./A', './B']);
    expectHandled('A', m);
    expect(calls.map((call) => call[0])).toEqual(['A', 'B']);
  });
});
