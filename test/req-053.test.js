// docs/spec.md REQ-053. It needs a module state in which no call to zeg() occurred (section 1.5, rule 5).
// Each test file has its own module state. test/wrangler.jsonc has no main, and no setup file exists.
// As a result, no code calls zeg() before these tests. The tests run in the order of the requirement.
import { beforeEach, describe, expect, it } from 'vitest';
import { zeg, command } from '@otar/zeg';
import { A, cmd, calls, resetCalls } from './spec-fixtures.js';
import { checkSeen, expectRejects, expectThrows, seen } from './helpers.js';

beforeEach(() => {
  resetCalls();
});

describe('REQ-053 the first call to zeg() that returns configures zeg', () => {
  it('REQ-053 (1) no call to zeg() occurred: command() rejects with NOT_CONFIGURED', async () => {
    await expectRejects('NOT_CONFIGURED', command(new A(1)));
  });

  it('REQ-053 (2) after a first call to zeg() that throws INVALID_CONFIG: NOT_CONFIGURED', async () => {
    expectThrows('INVALID_CONFIG', { commands: { './A.js': { default: A } } });
    await expectRejects('NOT_CONFIGURED', command(new A(1)));
  });

  it('REQ-053 (3) after a call zeg({}) that returns: HANDLER_NOT_FOUND', async () => {
    expect(zeg({})).toBeUndefined();
    await expectRejects('HANDLER_NOT_FOUND', command(new A(1)));
    // A later valid call makes the dispatch work
    zeg({ commands: cmd });
    const m = new A(1);
    await command(m);
    expect(calls[0][1]).toBe(m);
  });

  it('REQ-113 the ZegErrors of this file have known codes, also NOT_CONFIGURED', () => {
    expect(seen.map((e) => e.code)).toEqual([
      'NOT_CONFIGURED',
      'INVALID_CONFIG',
      'NOT_CONFIGURED',
      'HANDLER_NOT_FOUND',
    ]);
    checkSeen(['NOT_CONFIGURED', 'INVALID_CONFIG', 'HANDLER_NOT_FOUND']);
  });
});
