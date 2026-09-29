// docs/spec.md section 4.7: REQ-070 to REQ-076.
import { beforeEach, describe, expect, it } from 'vitest';
import { zeg, command, query } from '@otar/zeg';
import { A, AH, B, BH, Q, cmd, qry, calls, resetCalls } from './spec-fixtures.js';
import {
  checkSeen,
  expectHandled,
  expectNotHandled,
  expectRejects,
  expectThrows,
  pairOf,
} from './helpers.js';

beforeEach(() => {
  resetCalls();
});

describe('4.7 dispatch: the lookup', () => {
  it('REQ-070 the lookup uses the prototype of the message', async () => {
    zeg({ commands: cmd });
    const m1 = Object.create(A.prototype);
    await command(m1);
    expectHandled('A', m1);
    const m2 = new A(1);
    m2.constructor = Q;
    await command(m2);
    expectHandled('A', m2);
  });

  it('REQ-071 a dispatch of a class without a pair rejects with HANDLER_NOT_FOUND', async () => {
    zeg({ commands: cmd, queries: qry });
    await expectRejects('HANDLER_NOT_FOUND', command(new (class {})()));
    await expectRejects('HANDLER_NOT_FOUND', query(new (class {})()));
  });

  it('REQ-071 the error text does not contain the class name', async () => {
    zeg({ commands: cmd, queries: qry });
    class UniqueName987 {}
    expect(UniqueName987.name).toBe('UniqueName987');
    const error = await expectRejects('HANDLER_NOT_FOUND', command(new UniqueName987()));
    expect(error.message).not.toContain('UniqueName987');
  });

  it('REQ-071 (section 3) no error text of zeg contains a class name: the hint, UNDEFINED_RESULT and Z6', async () => {
    class UniqueName987 {}
    class UniqueHandler654 {
      handle() {}
    }
    expect([UniqueName987.name, UniqueHandler654.name]).toEqual([
      'UniqueName987',
      'UniqueHandler654',
    ]);
    zeg({
      commands: pairOf(UniqueName987, UniqueHandler654, 'U'),
      queries: pairOf(Q, UniqueHandler654, 'Q'),
    });
    const hint = await expectRejects('HANDLER_NOT_FOUND', query(new UniqueName987()));
    const undef = await expectRejects('UNDEFINED_RESULT', query(new Q(1)));
    const z6 = expectThrows('INVALID_CONFIG', {
      commands: [
        pairOf(UniqueName987, UniqueHandler654, 'U'),
        pairOf(UniqueName987, UniqueHandler654, 'V'),
      ],
    });
    for (const error of [hint, undef, z6]) {
      expect(error.message).not.toContain('UniqueName987');
      expect(error.message).not.toContain('UniqueHandler654');
    }
  });

  it('REQ-072 a subclass needs its own pair', async () => {
    class S extends A {}
    zeg({ commands: cmd });
    await expectRejects('HANDLER_NOT_FOUND', command(new S(1)));
    zeg({ commands: { ...cmd, './S.js': { default: S }, './SHandler.js': { default: BH } } });
    const m = new S(1);
    await command(m);
    expectHandled('B', m);
    expectNotHandled('A');
  });

  it('REQ-073 a dispatch of a message of the other kind rejects with HANDLER_NOT_FOUND and a hint', async () => {
    zeg({ commands: cmd, queries: qry });
    const e1 = await expectRejects('HANDLER_NOT_FOUND', query(new A(1)));
    expect(e1.message).toContain('command()');
    expect(e1.message).toContain('./A');
    const e2 = await expectRejects('HANDLER_NOT_FOUND', command(new Q(1)));
    expect(e2.message).toContain('query()');
    expect(e2.message).toContain('./Q');
    expect(calls).toEqual([]);
  });

  it('REQ-074 the hint names the position in an array', async () => {
    zeg({ commands: cmd, queries: [pairOf(B, BH, 'B'), qry] });
    const e = await expectRejects('HANDLER_NOT_FOUND', command(new Q(1)));
    expect(e.message).toContain('queries[1]');
  });

  it('REQ-075 two glob outputs can have the same file paths', async () => {
    zeg({
      commands: [
        { './R.js': { default: A }, './RHandler.js': { default: AH } },
        { './R.js': { default: B }, './RHandler.js': { default: BH } },
      ],
    });
    const a = new A(1);
    const b = new B(2);
    await command(a);
    await command(b);
    expect(calls).toHaveLength(2);
    expectHandled('A', a);
    expectHandled('B', b);
  });

  it('REQ-076 zeg does not use class names', async () => {
    const R1 = (() =>
      class R {
        constructor(v) {
          this.v = v;
        }
      })();
    const R2 = (() =>
      class R {
        constructor(v) {
          this.v = v;
        }
      })();
    expect(R1.name).toBe('R');
    expect(R2.name).toBe('R');
    zeg({
      commands: {
        './x/R.js': { default: R1 },
        './x/RHandler.js': { default: AH },
        './y/R.js': { default: R2 },
        './y/RHandler.js': { default: BH },
      },
    });
    const m1 = new R1(1);
    const m2 = new R2(2);
    await command(m2);
    await command(m1);
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe('B');
    expect(calls[0][1]).toBe(m2);
    expect(calls[1][0]).toBe('A');
    expect(calls[1][1]).toBe(m1);

    resetCalls();
    class S {
      static name = 'Other';
    }
    expect(S.name).toBe('Other');
    zeg({ commands: { './S.js': { default: S }, './SHandler.js': { default: AH } } });
    const s = new S();
    await command(s);
    expectHandled('A', s);
  });

  it('REQ-113 the ZegErrors of this file have known codes', () => {
    checkSeen(['HANDLER_NOT_FOUND', 'UNDEFINED_RESULT', 'INVALID_CONFIG']);
  });
});
