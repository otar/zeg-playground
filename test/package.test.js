// docs/spec.md section 1.5 rule 1 and section 4.1: REQ-001.
import { describe, expect, it } from 'vitest';
import * as ns from '@otar/zeg';

describe('1.5 test environment', () => {
  it('1.5 rule 1: the unit tests run in workerd', () => {
    expect(navigator.userAgent).toBe('Cloudflare-Workers');
  });
});

describe('4.1 package', () => {
  it('REQ-001 the package has exactly four named exports', () => {
    const names = Reflect.ownKeys(ns).filter((key) => typeof key === 'string');
    expect(names.sort()).toEqual(['Zeg', 'ZegError', 'command', 'query']);
    expect('default' in ns).toBe(false);
    for (const name of names) {
      expect(typeof ns[name]).toBe('function');
    }
  });
});
