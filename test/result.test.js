// docs/spec.md section 4.9: REQ-090 to REQ-094.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { zeg, command, query } from '@otar/zeg';
import { A, Q, calls, resetCalls } from './spec-fixtures.js';
import { checkSeen, expectHandled, expectRejects, pairOf, returning, settle } from './helpers.js';

beforeEach(() => {
  resetCalls();
});

describe('4.9 dispatch: the result', () => {
  it('REQ-090 command() resolves to undefined', async () => {
    const spies = ['warn', 'error', 'log', 'info', 'debug'].map((name) => vi.spyOn(console, name));
    try {
      for (const fn of [() => 42, () => Promise.resolve(42), () => {}]) {
        zeg({ commands: pairOf(A, returning(fn)) });
        const r = await settle(command(new A(1)));
        expect(r).toEqual({ ok: true, value: undefined });
      }
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it('REQ-091 command() waits for an async handle()', async () => {
    class H {
      async handle(m) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        calls.push(['H', m]);
      }
    }
    zeg({ commands: pairOf(A, H) });
    const m = new A(1);
    const p = command(m);
    expect(calls).toEqual([]);
    await p;
    expectHandled('H', m);
  });

  it('REQ-092 query() resolves to the value of handle()', async () => {
    const o = { x: 1 };
    const cases = [
      [() => o, o],
      [() => Promise.resolve(o), o],
      [() => null, null],
      [() => 0, 0],
      [() => '', ''],
      [() => false, false],
    ];
    for (const [fn, expected] of cases) {
      zeg({ queries: pairOf(Q, returning(fn), 'Q') });
      const r = await settle(query(new Q(1)));
      expect(r.ok).toBe(true);
      expect(r.value).toBe(expected);
    }
  });

  it('REQ-093 if handle() returns undefined, query() rejects with UNDEFINED_RESULT', async () => {
    for (const fn of [() => undefined, () => Promise.resolve(undefined), () => {}]) {
      zeg({ queries: pairOf(Q, returning(fn), 'Q') });
      await expectRejects('UNDEFINED_RESULT', query(new Q(1)));
    }
  });

  it('REQ-094 zeg resolves a thenable from handle()', async () => {
    zeg({ queries: pairOf(Q, returning(() => ({ then(resolve) { resolve(5); } })), 'Q') });
    expect(await query(new Q(1))).toBe(5);
    zeg({
      commands: pairOf(A, returning(() => ({
        then(resolve) {
          calls.push('then');
          resolve(5);
        },
      }))),
    });
    const r = await settle(command(new A(1)));
    expect(r).toEqual({ ok: true, value: undefined });
    expect(calls).toContain('then');
  });

  it('REQ-113 the ZegErrors of this file have known codes', () => {
    checkSeen(['UNDEFINED_RESULT']);
  });
});
