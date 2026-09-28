// Helpers of the unit tests. The words "throws X", "rejects with X" and "handles" are defined in docs/spec.md section 1.4.
import { expect } from 'vitest';
import { ZegError, zeg } from '@otar/zeg';
import { A, calls } from './spec-fixtures.js';

export const CODES = ['INVALID_CONFIG', 'NOT_CONFIGURED', 'HANDLER_NOT_FOUND', 'UNDEFINED_RESULT'];

// Each ZegError that zeg creates in the tests of one test file (REQ-113). Each test file has its own module state,
// and as a result its own copy of this list.
export const seen = [];

// REQ-113: a ZegError from zeg has a known code and a message that is a string and not empty.
export function checkKnown(error) {
  expect(error).toBeInstanceOf(ZegError);
  expect(CODES).toContain(error.code);
  expect(typeof error.message).toBe('string');
  expect(error.message.length).toBeGreaterThan(0);
  seen.push(error);
  return error;
}

// REQ-113: the last test of each test file calls this function. `codes` are the codes that the file expects.
// checkKnown() checked each error in `seen` before it added the error.
export function checkSeen(codes) {
  expect([...new Set(seen.map((error) => error.code))].sort()).toEqual([...codes].sort());
}

// Calls zeg(...args) and returns the value that it throws. Fails if zeg() returns.
export function thrownBy(...args) {
  let result;
  try {
    result = zeg(...args);
  } catch (error) {
    return error;
  }
  throw new Error(`zeg() returned ${String(result)} and did not throw`);
}

// "Throws X": the call throws a ZegError whose code is X.
export function expectThrows(code, ...args) {
  const error = thrownBy(...args);
  expect(error).toBeInstanceOf(ZegError);
  expect(error.code).toBe(code);
  return checkKnown(error);
}

export async function settle(promise) {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}

// "Rejects with X": the Promise rejects with a ZegError whose code is X.
export async function expectRejects(code, promise) {
  expect(promise).toBeInstanceOf(Promise);
  const r = await settle(promise);
  expect(r.ok).toBe(false);
  expect(r.error).toBeInstanceOf(ZegError);
  expect(r.error.code).toBe(code);
  return checkKnown(r.error);
}

// The Promise rejects with a TypeError that is not a ZegError.
export async function expectTypeError(promise) {
  expect(promise).toBeInstanceOf(Promise);
  const r = await settle(promise);
  expect(r.ok).toBe(false);
  expect(r.error).toBeInstanceOf(TypeError);
  expect(r.error).not.toBeInstanceOf(ZegError);
  return r.error;
}

// Settles a Promise. If it rejects with a ZegError, the error goes to the REQ-113 checks.
export async function settleAndCheck(promise) {
  const r = await settle(promise);
  if (!r.ok && r.error instanceof ZegError) {
    checkKnown(r.error);
  }
  return r;
}

// "`XH` handles the message `m`": calls contains [tag, m]. The check uses identity only, so that it reads no
// property of a Proxy or a getter of the message.
export function expectHandled(tag, m) {
  expect(calls.some((c) => Array.isArray(c) && c[0] === tag && c[1] === m)).toBe(true);
}

export function expectNotHandled(tag) {
  expect(calls.some((c) => Array.isArray(c) && c[0] === tag)).toBe(false);
}

// A glob output with one pair: './<name>.js' and './<name>Handler.js'.
export const pairOf = (Message, Handler, name = 'A') => ({
  [`./${name}.js`]: { default: Message },
  [`./${name}Handler.js`]: { default: Handler },
});

// A handler class whose handle() returns fn(message).
export const returning = (fn) =>
  class {
    handle(m) {
      return fn(m);
    }
  };

// The invalid messages of REQ-061.
export const invalidMessages = () => [
  undefined,
  null,
  1,
  'x',
  true,
  Symbol(),
  1n,
  () => {},
  A,
  [],
  {},
  Object.create(null),
];
