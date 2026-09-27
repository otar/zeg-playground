// docs/spec.md section 4.11: REQ-110 to REQ-113.
import { describe, expect, it } from 'vitest';
import { zeg, command, ZegError } from '@otar/zeg';
import { Q, cmd } from './spec-fixtures.js';
import { checkSeen, expectRejects } from './helpers.js';

describe('4.11 ZegError', () => {
  it('REQ-110 a ZegError has a name, a code and an error text', () => {
    const error = new ZegError('HANDLER_NOT_FOUND', 'text');
    expect(error instanceof ZegError).toBe(true);
    expect(error instanceof Error).toBe(true);
    expect(error.name).toBe('ZegError');
    expect(error.code).toBe('HANDLER_NOT_FOUND');
    expect(error.message).toBe('text');
  });

  it('REQ-111 the constructor does not check the code', () => {
    expect(new ZegError('ANY', 'x').code).toBe('ANY');
    expect(new ZegError(42).code).toBe(42);
    expect(new ZegError(42).message).toBe('');
  });

  it('REQ-112 zeg adds no other properties', async () => {
    zeg({ commands: cmd });
    const fromDispatch = await expectRejects('HANDLER_NOT_FOUND', command(new Q(1)));
    for (const error of [new ZegError('HANDLER_NOT_FOUND', 'text'), fromDispatch]) {
      for (const key of Reflect.ownKeys(error)) {
        expect(['stack', 'message', 'name', 'code']).toContain(key);
      }
      expect('cause' in error).toBe(false);
    }
  });

  it('REQ-113 each ZegError from zeg has a known code', () => {
    // The helpers check each ZegError that zeg creates in a test file. Each other test file that creates a ZegError
    // ends with the same test, or checks the list `seen` itself.
    checkSeen(['HANDLER_NOT_FOUND']);
  });
});
