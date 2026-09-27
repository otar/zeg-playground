// docs/spec.md section 4.4: REQ-040 to REQ-045.
import { beforeEach, describe, expect, it } from 'vitest';
import { zeg, command } from '@otar/zeg';
import { A, AH, B, cmd, calls, resetCalls } from './spec-fixtures.js';
import { checkSeen, expectHandled, expectThrows, pairOf } from './helpers.js';

beforeEach(() => {
  resetCalls();
});

describe('4.4 zeg(): classes', () => {
  it('REQ-040 zeg() reads only the default export', async () => {
    zeg({
      commands: {
        './A.js': { default: A, other: 1 },
        './AHandler.js': { default: AH, X: class {} },
      },
    });
    const m = new A(1);
    await command(m);
    expectHandled('A', m);
    expectThrows('INVALID_CONFIG', {
      commands: { './A.js': { A }, './AHandler.js': { default: AH } },
    });
    expectThrows('INVALID_CONFIG', {
      commands: { './A.js': { default: A }, './AHandler.js': { AH } },
    });
  });

  it('REQ-040 (Z4) zeg() reads module.default one time', () => {
    let reads = 0;
    const module = {
      get default() {
        reads++;
        return A;
      },
    };
    expect(
      zeg({ commands: { './A.js': module, './AHandler.js': { default: AH } } }),
    ).toBeUndefined();
    expect(reads).toBe(1);
  });

  it('REQ-041 a message class must be a function with a prototype object', () => {
    for (const value of [() => {}, async function () {}, {}, 'x', undefined]) {
      expectThrows('INVALID_CONFIG', {
        commands: { './A.js': { default: value }, './AHandler.js': { default: AH } },
      });
    }
    function F() {}
    for (const value of [class {}, F]) {
      expect(
        zeg({ commands: { './A.js': { default: value }, './AHandler.js': { default: AH } } }),
      ).toBeUndefined();
    }
  });

  it('REQ-042 a handler class must have a handle() method on its prototype', () => {
    class Base {
      handle() {}
    }
    function FH() {}
    FH.prototype.handle = function () {};
    const valid = [
      class {
        handle() {}
      },
      class extends Base {},
      FH,
    ];
    for (const H of valid) {
      expect(
        zeg({ commands: { './A.js': { default: A }, './AHandler.js': { default: H } } }),
      ).toBeUndefined();
    }
    const invalid = [
      class {},
      class {
        handel() {}
      },
      class {
        handle = () => {};
      },
      class {
        static handle() {}
      },
      () => {},
      { handle() {} },
    ];
    for (const H of invalid) {
      expectThrows('INVALID_CONFIG', {
        commands: { './A.js': { default: A }, './AHandler.js': { default: H } },
      });
    }
  });

  it('REQ-042 (section 2) prototype.handle must be a function', () => {
    function FX() {}
    FX.prototype.handle = 1;
    expectThrows('INVALID_CONFIG', {
      commands: { './A.js': { default: A }, './AHandler.js': { default: FX } },
    });
  });

  it('REQ-043 two message files cannot have the same message class', () => {
    function F() {}
    F.prototype = A.prototype;
    const cases = [
      { commands: { ...cmd, './B.js': { default: A }, './BHandler.js': { default: AH } } },
      { commands: [cmd, cmd] },
      { commands: cmd, queries: cmd },
      { commands: { ...cmd, './B.js': { default: F }, './BHandler.js': { default: AH } } },
    ];
    for (const options of cases) {
      expectThrows('INVALID_CONFIG', options);
    }
  });

  it('REQ-044 two handler files can have the same handler class', async () => {
    zeg({ commands: { ...cmd, './B.js': { default: B }, './BHandler.js': { default: AH } } });
    const a = new A(1);
    const b = new B(2);
    await command(a);
    await command(b);
    expect(calls).toHaveLength(2);
    expectHandled('A', a);
    expectHandled('A', b);
  });

  it('REQ-045 anonymous classes are valid', async () => {
    const M = (() => class {})();
    const H = (() =>
      class {
        handle(m) {
          calls.push(['H', m]);
        }
      })();
    expect(M.name).toBe('');
    expect(H.name).toBe('');
    expect(zeg({ commands: pairOf(M, H, 'M') })).toBeUndefined();
    const m = new M();
    await command(m);
    expectHandled('H', m);
  });

  it('REQ-113 the ZegErrors of this file have known codes', () => {
    checkSeen(['INVALID_CONFIG']);
  });
});
