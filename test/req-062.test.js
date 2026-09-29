// docs/spec.md REQ-062. It needs a module state in which no call to Zeg() occurred (section 1.5, rule 5).
import { describe, expect, it } from 'vitest';
import { command, query } from '@otar/zeg';
import { A } from './spec-fixtures.js';
import { expectRejects, expectTypeError, seen } from './helpers.js';

describe('REQ-062 the check of the message comes before the NOT_CONFIGURED check', () => {
  it('REQ-062 no call to Zeg() occurred: command(null) rejects with a TypeError', async () => {
    await expectTypeError(command(null));
    // Also query(). The last line shows that Zeg is really not configured.
    await expectTypeError(query(null));
    await expectRejects('NOT_CONFIGURED', command(new A(1)));
    expect(seen.map((e) => e.code)).toEqual(['NOT_CONFIGURED']);
  });
});
