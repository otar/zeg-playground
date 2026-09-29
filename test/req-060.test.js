// docs/spec.md REQ-060. Its first state needs a module state in which no call to Zeg() occurred (section 1.5, rule 5).
// The tests run in the order of the requirement: first the state without Zeg(), then the state after Zeg().
import { beforeEach, describe, expect, it } from 'vitest';
import { Zeg, command, query, ZegError } from '@otar/zeg';
import { A, Q, cmd, qry, resetCalls } from './spec-fixtures.js';
import { checkSeen, invalidMessages, seen, settleAndCheck } from './helpers.js';

beforeEach(() => {
  resetCalls();
});

// The 4 valid messages of REQ-060, then the 12 values of REQ-061
const messages = () => [
  new A(1),
  new Q(1),
  new Map(),
  Object.create(A.prototype),
  ...invalidMessages(),
];

// 'ok', the code of a ZegError, or the class name of another error
function outcomeOf(r) {
  if (r.ok) {
    return 'ok';
  }
  return r.error instanceof ZegError ? r.error.code : r.error.constructor.name;
}

// For each message: [the outcome of command(), the outcome of query()]
async function expectNativePromises() {
  const outcomes = [];
  for (const message of messages()) {
    const pair = [];
    for (const fn of [command, query]) {
      let p;
      expect(() => {
        p = fn(message);
      }).not.toThrow();
      expect(p).toBeInstanceOf(Promise);
      expect(Object.getPrototypeOf(p)).toBe(Promise.prototype);
      expect(p.constructor).toBe(Promise);
      const r = await settleAndCheck(p);
      pair.push(outcomeOf(r));
    }
    outcomes.push(pair);
  }
  return outcomes;
}

describe('REQ-060 command() and query() always return a Promise', () => {
  it('REQ-060 (state 1) no call to Zeg() occurred', async () => {
    const outcomes = await expectNativePromises();
    // The 4 valid messages: NOT_CONFIGURED. The 12 invalid values: TypeError.
    expect(outcomes.slice(0, 4)).toEqual(Array(4).fill(['NOT_CONFIGURED', 'NOT_CONFIGURED']));
    expect(outcomes.slice(4)).toEqual(Array(12).fill(['TypeError', 'TypeError']));
  });

  it('REQ-060 (state 2) after Zeg({ commands: cmd, queries: qry })', async () => {
    expect(Zeg({ commands: cmd, queries: qry })).toBeUndefined();
    const outcomes = await expectNativePromises();
    expect(outcomes.slice(0, 4)).toEqual([
      ['ok', 'HANDLER_NOT_FOUND'], // new A(1)
      ['HANDLER_NOT_FOUND', 'ok'], // new Q(1)
      ['HANDLER_NOT_FOUND', 'HANDLER_NOT_FOUND'], // new Map()
      ['ok', 'HANDLER_NOT_FOUND'], // Object.create(A.prototype)
    ]);
    expect(outcomes.slice(4)).toEqual(Array(12).fill(['TypeError', 'TypeError']));
  });

  it('REQ-113 the ZegErrors of this file have known codes', () => {
    expect(seen).toHaveLength(8 + 5);
    checkSeen(['NOT_CONFIGURED', 'HANDLER_NOT_FOUND']);
  });
});
