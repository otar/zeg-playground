// docs/spec.md section 4.10: REQ-100 to REQ-103.
import { beforeEach, describe, expect, it } from 'vitest';
import { zeg, command } from '@otar/zeg';
import { A, calls, resetCalls } from './spec-fixtures.js';
import { checkSeen, expectRejects, pairOf, returning, settle } from './helpers.js';

beforeEach(() => {
  resetCalls();
});

describe('4.10 dispatch: values that user code throws', () => {
  it('REQ-100 an error from handle() reaches the caller unchanged', async () => {
    const e = new Error('e');
    const keys = Object.keys(e);
    class SyncHandler {
      handle() {
        throw e;
      }
    }
    class AsyncHandler {
      async handle() {
        throw e;
      }
    }
    for (const H of [SyncHandler, AsyncHandler]) {
      zeg({ commands: pairOf(A, H) });
      const r = await settle(command(new A(1)));
      expect(r.ok).toBe(false);
      expect(r.error).toBe(e);
    }
    expect(Object.keys(e)).toEqual(keys);
  });

  it('REQ-101 a value that is not an Error also reaches the caller unchanged', async () => {
    for (const v of ['x', 42, undefined]) {
      zeg({
        commands: pairOf(A, returning(() => {
          throw v;
        })),
      });
      const r = await settle(command(new A(1)));
      expect(r.ok).toBe(false);
      expect(r.error).toBe(v);
    }
  });

  it('REQ-102 an error from the handler constructor reaches the caller unchanged', async () => {
    const e = new Error('ctor');
    let handleRan = 0;
    class H {
      constructor() {
        throw e;
      }
      handle() {
        handleRan++;
      }
    }
    zeg({ commands: pairOf(A, H) });
    const r = await settle(command(new A(1)));
    expect(r.ok).toBe(false);
    expect(r.error).toBe(e);
    expect(handleRan).toBe(0);
  });

  it('REQ-103 a ZegError from a nested dispatch reaches the caller unchanged', async () => {
    class H {
      async handle() {
        try {
          await command(new (class {})());
        } catch (error) {
          calls.push(error);
          throw error;
        }
      }
    }
    zeg({ commands: pairOf(A, H) });
    const error = await expectRejects('HANDLER_NOT_FOUND', command(new A(1)));
    expect(calls).toHaveLength(1);
    expect(error).toBe(calls[0]);
  });

  it('REQ-113 the ZegErrors of this file have known codes', () => {
    checkSeen(['HANDLER_NOT_FOUND']);
  });
});
