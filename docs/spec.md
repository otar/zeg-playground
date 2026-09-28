# zeg: specification (phase 2)

This document contains the numbered requirements for zeg. Phase 3 implements them, and phase 4 tests them [D-62 to D-64]. The IDs in brackets, for example [D-11], refer to `docs/decisions.md`. The API and the examples are in `docs/syntax.md`.

## 1. Conventions

### 1.1 Requirement format

Each requirement has:

- an ID, for example `REQ-020`
- a title
- its sources: decisions, sections of `docs/syntax.md` or background facts of `docs/decisions.md`
- a test type
- one or more scenarios in the form Given / When / Then

Phase 4 writes one or more tests for each requirement [D-64].

### 1.2 Test types

| Type | Meaning |
| --- | --- |
| U | A unit test in Vitest with `@cloudflare/vitest-plugin`, in workerd [D-68]. |
| B | A production build test. It runs `vite build` and then sends HTTP requests to the built Worker in local workerd [D-69]. |
| S | A static check. It reads, lists or bundles files of the repository, and it does not run the library. |
| N | A check of a non-functional property, for example the size or the coverage. |

### 1.3 Spec details

Some rules in sections 1.5, 2, 3 and 4 add an exact detail that no decision states. These rules have the mark **(spec detail)**. Section 5 lists all of them. When the user approves phase 2, the user also approves these rules.

The method that a test uses to check a decision is not a spec detail. Examples are the name of a script or a time limit in a scenario.

### 1.4 Fixtures and words

The scenarios use these fixtures:

```js
let calls; // each test sets calls = [] before it starts

function makePair(tag) {
  const Message = class {
    constructor(v) {
      this.v = v;
    }
  };
  const Handler = class {
    handle(m) {
      calls.push([tag, m]);
      return { tag, v: m.v };
    }
  };
  return [Message, Handler];
}

const [A, AH] = makePair('A'); // a command pair
const [B, BH] = makePair('B'); // a second command pair
const [Q, QH] = makePair('Q'); // a query pair

const cmd = { './A.js': { default: A }, './AHandler.js': { default: AH } };
const qry = { './Q.js': { default: Q }, './QHandler.js': { default: QH } };
```

These words have one meaning in the scenarios:

- `cmd` and `qry` are hand-written glob outputs. A hand-written glob output has the same shape as the output of `import.meta.glob(patterns, { eager: true })`.
- `output` is the glob output that the Given line describes. "`cmd` plus a file" means `{ ...cmd, [path]: module }`.
- If a scenario defines its own handler class `H` for a message class `M`, the test calls `zeg()` with the pair `{ './M.js': { default: M }, './MHandler.js': { default: H } }`. This rule does not apply if the scenario shows its own call to `zeg()`.
- "`AH` handles the message `m`" means that `calls` contains `['A', m]` after the dispatch. The same applies to the other handler classes of the fixtures.
- If `X` is an error code, "throws `X`" means that the call throws a `ZegError` whose `code` is `X`. "Rejects with `X`" means the same for a Promise.
- For another value `v`, "throws `v`" and "rejects with `v`" mean that the value is `v` itself (`Object.is`).
- "Throws a `TypeError`" and "rejects with a `TypeError`" mean an instance of `TypeError`.
- The key of a message file is its file path without `.js`, for example `./A` [D-17].
- An object is a value `v` for which `typeof v === 'object'` and `v !== null`.

### 1.5 Test environment

Rule 1 repeats D-68 as revision 4 of `docs/decisions.md` states it. Rules 2 to 8 are spec details **(spec detail)**.

1. The unit tests (type U) run in workerd with Vitest 4.1 and `@cloudflare/vitest-plugin` [D-68].
2. The Wrangler configuration of the unit tests has no `main`. As a result, no Worker entry file exists, and no entry file runs before the tests (see background fact 13).
3. No setup file of the unit tests calls `zeg()`.
4. The unit tests import the library as `'@otar/zeg'`. The package refers to itself through its `exports` field, so the import resolves to `src/zeg.js` at the repository root. If Vite does not resolve the package name, the Vitest configuration adds an alias from `@otar/zeg` to `./src/zeg.js`.
5. The tests of REQ-053, REQ-060 and REQ-062 need a module state without a call to `zeg()`. Each of these requirements has its own test file. Each such file runs its scenarios in the order of the requirement.
6. The tests in one file run one after the other. They do not use `.concurrent`.
7. The build tests (type B) and the static checks (types S and N) run in Node, because they start processes and read files [D-68].
8. The unit tests and the Node tests are two projects of one Vitest configuration. The mutation tests use `vitest.mutation.config.js`, which contains only the unit project of this configuration. Stryker changes only `src/zeg.js` [D-75].

## 2. The steps of zeg()

`zeg(options)` does these steps in this order. `zeg()` stops at the first check that fails. Steps Z1 to Z6 do not change the registry [D-39].

| Step | Action | If the step fails |
| --- | --- | --- |
| Z1 | Check that `options` is a plain object. | Throw `INVALID_CONFIG`. |
| Z2 | Read the names of all own properties of `options`, also symbol names and the names of properties that are not enumerable. Check that each name is `commands` or `queries`. | Throw `INVALID_CONFIG`. |
| Z3 | First for `commands`, then for `queries`, read the own property of `options` one time and make a list of glob outputs. For `undefined`, the list is empty. For a plain object, the list contains that object. For an array, the list contains the entries at the indexes 0 to `length - 1`. Each entry must be a plain object. | Throw `INVALID_CONFIG`. |
| Z4 | First for the list of `commands`, then for the list of `queries`, check each glob output in list order. Use the file paths from `Object.keys()` in that order. Check that the path ends in `.js`. Check that the module is an object. Read `module.default` one time and check the class. | Throw `INVALID_CONFIG`. |
| Z5 | In each glob output, form the pairs. | Throw `INVALID_CONFIG`. |
| Z6 | Across all glob outputs of both kinds, check that no two message classes have the same `prototype` object. | Throw `INVALID_CONFIG`. |
| Z7 | Replace the registry with the new pairs. Mark zeg as configured. | This step cannot fail. |
| Z8 | Return `undefined`. |  |

The rules for the file paths:

- The file name is the part of the path after the last `/`. If the path has no `/`, the file name is the full path. The folder is the part before the file name.
- `F/X.js` means the folder `F` followed by the file name `X.js`. If `F` is empty, the path is `X.js`.
- A handler file is a file whose name ends in `Handler.js`. Each other file is a message file [D-15]. The comparisons are case-sensitive.

The rules for the classes (Z4):

- The default export of a message file must be a function whose `prototype` is an object [D-20]. If the default export is `undefined`, the file has no default export.
- The default export of a handler file must be a function, and its `prototype.handle` must be a function [D-19].
- Z4 reads the `prototype` of each message class one time. Z6 and Z7 use that value.

The rules for the pairs (Z5):

- For each handler file `F/XHandler.js`, `X` must not be empty, and the same glob output must contain the message file `F/X.js` [D-11, D-37]. The file `F/X.js` must be a message file, not a handler file.
- For each message file `F/X.js`, the same glob output must contain the handler file `F/XHandler.js` [D-11].

Other rules:

- **(spec detail)** A hole in an array reads as `undefined`. As a result, `zeg()` throws `INVALID_CONFIG` for it.
- **(spec detail)** `zeg()` reads the file paths of a glob output with `Object.keys()`. As a result, it reads only own, enumerable properties whose names are strings.
- **(spec detail)** If user code throws a value while `zeg()` reads a value, `zeg()` throws that same value. Examples of user code are a getter, a Proxy trap or a module in an import cycle. The registry does not change. In an import cycle, a read of the default export can throw a `ReferenceError`. D-25 describes the other possible result, `undefined` values.
- **(spec detail)** The error text of `INVALID_CONFIG` names the parts that the failed check concerns. These parts are the name of an unknown property, the option and the file path. If the option is an array, the text also names the position in the array, for example `commands[1] ./A.js`. For Z6, the text names both file paths.

## 3. The steps of a dispatch

`command(message)` and `query(message)` do these steps in this order. The option of the kind is `commands` for `command()` and `queries` for `query()`.

| Step | Action | If the step fails |
| --- | --- | --- |
| S1 | Create the Promise that the call returns. |  |
| S2 | Check that `message` is an object and not an array. Read `Object.getPrototypeOf(message)` one time. Check that the value is not `Object.prototype` and not `null` [D-27]. | Reject with a `TypeError`. |
| S3 | Check that zeg is configured [D-46]. | Reject with `NOT_CONFIGURED`. |
| S4 | In the registry of the kind, find the pair whose message class has the `prototype` from S2 [D-16]. | Reject with `HANDLER_NOT_FOUND`. If the registry of the other kind contains the prototype, the error text contains the name of the other function and the key. If that option is an array, the text also contains the position [D-48]. |
| S5 | Create the handler instance with `new HandlerClass()` [D-21]. | Reject with the value that the constructor throws. |
| S6 | Read `instance.handle` and call it as a method, with one argument: `message` [D-18]. | Reject with the value that the read or the call throws. |
| S7 | Wait for the return value of `handle()` with `await`. | Reject with the reason of the rejection. |
| S8 | For `command()`, resolve to `undefined`. For `query()`, if the value is `undefined`, reject with `UNDEFINED_RESULT`. If not, resolve to the value [D-42, D-43, D-44]. |  |

Other rules:

- **(spec detail)** S2 comes before S3. As a result, for an invalid message, the Promise rejects with a `TypeError` before and after the first call to `zeg()`.
- **(spec detail)** Steps S2 to S6 occur before `command()` or `query()` returns. As a result, `handle()` starts during the call.
- **(spec detail)** S4 uses the registry that is active at the time of the call.
- **(spec detail)** In S2 to S6, zeg reads no property of the message. S7 and S8 read the `then` property of the return value of `handle()`, as `await` and the resolution of a Promise do.
- **(spec detail)** The error texts of a dispatch contain keys. No error text of zeg contains a class name.
- **(spec detail)** If user code throws a value during a step, the Promise rejects with that same value. Examples of user code are a Proxy trap, a handler constructor and `handle()`. The value can be any value. It can be a value that is not an `Error`.
- **(spec detail)** S7 also waits for the return value of a command handler. Then zeg ignores the value [D-42].
- `command()` and `query()` never throw synchronously [D-41].

## 4. Requirements

### 4.1 Package

#### REQ-001 The package has exactly four named exports

Source: D-01, D-02, D-05. Test: U.

- Given the package `@otar/zeg`
- When a test reads the names of its module namespace
- Then the names are exactly `zeg`, `command`, `query` and `ZegError`, and the package has no `default` export

#### REQ-002 The library imports no modules

Source: D-03. Test: S.

- Given the file `src/zeg.js`
- When a static check bundles it with esbuild and reads the metafile
- Then the metafile lists no imports for `src/zeg.js`

#### REQ-003 package.json has the decided fields

Source: D-55, D-56, D-57. Test: S.

- Given the file `package.json`
- When a static check reads it
- Then it has `"name": "@otar/zeg"`, `"version": "0.1.0"`, `"type": "module"`, `"exports": "./src/zeg.js"`, `"license": "MIT"` and `"publishConfig": { "access": "public" }`
- And it has no `private`, `peerDependencies`, `types` or `typings` field
- And its `dependencies` field is missing or empty
- And its `scripts` field has no `build`, `prepare` or `prepublishOnly` script
- And `git ls-files '*.d.ts'` lists no file

#### REQ-004 The license is MIT

Source: D-58. Test: S.

- Given the file `LICENSE`
- When a static check reads it
- Then **(spec detail)** it contains `MIT License`, and it contains `Copyright (c) 2026 Otar Chekurishvili`

#### REQ-005 The README lists the tested versions

Source: D-59. Test: S.

- Given the file `README.md`
- When a static check removes all backticks from the text
- Then the text contains `Vite 8.3` and `@cloudflare/vite-plugin 1.60`

#### REQ-006 The library is at the repository root, and npm is the package manager

Source: D-60. Test: S.

- Given the repository
- When a static check lists its files
- Then the repository contains `package.json`, `package-lock.json` and `src/zeg.js` at its root

### 4.2 zeg(): argument and options

#### REQ-010 zeg() returns undefined

Source: D-05, syntax.md 4.1. Test: U.

- Given the options `{ commands: cmd }`
- When the test calls `zeg(options)`
- Then the call returns `undefined`

#### REQ-011 The argument must be a plain object

Source: D-37. Test: U.

- Given each of these values: `undefined`, `null`, `'x'`, `1`, `[]`, `() => {}`, `new Map()`, `new A()`
- When the test calls `zeg(value)`
- Then the call throws `INVALID_CONFIG`
- Given `Object.create(null)`
- When the test calls `zeg(value)`
- Then the call returns `undefined`

#### REQ-012 The argument cannot have other properties

Source: D-37. Test: U.

- Given each of these values:
  - `{ handlers: {} }`
  - `{ commands: cmd, extra: 1 }`
  - `{ extra: undefined }`
  - an object with a property whose name is `Symbol('x')`
  - an object with the property `extra` that is not enumerable
- When the test calls `zeg(value)`
- Then the call throws `INVALID_CONFIG`

#### REQ-013 An option with the value undefined is the same as a missing option

Source: D-35. Test: U.

- Given the options `{ commands: undefined, queries: qry }`
- When the test calls `zeg(options)` and then `await query(new Q(1))`
- Then `zeg()` returns `undefined`, and the Promise resolves to `{ tag: 'Q', v: 1 }`

#### REQ-014 An option is a glob output or an array

Source: D-09, D-37. Test: U.

- Given each of these values for `commands`: `'x'`, `null`, `1`, `() => {}`, `new Map()`, `new A()`
- When the test calls `zeg({ commands: value })`
- Then the call throws `INVALID_CONFIG`
- Given the value `cmd`, and then the value `[cmd]`
- When the test calls `zeg({ commands: value })` and then `await command(new A(1))`
- Then `zeg()` returns `undefined`, and `AH` handles the message in both cases

#### REQ-015 An array can be empty, and each entry must be a plain object

Source: D-09, D-37. Test: U.

- Given the options `{ commands: [] }`
- When the test calls `zeg(options)`
- Then the call returns `undefined`
- Given each of these arrays: `[cmd, 'x']`, `[cmd, null]`, `[cmd, []]`, `[cmd, new Map()]`, `[undefined]`, `[, cmd]`
- When the test calls `zeg({ commands: array })`
- Then the call throws `INVALID_CONFIG`

#### REQ-016 Each module in a glob output must be an object

Source: D-07, D-37. Test: U.

- Given `cmd` plus a file `./B.js` whose module is one of these values: `() => {}`, `Object.assign(() => {}, { default: B })`, `null`, `'x'`
- And the file `./BHandler.js` with the module `{ default: BH }`
- When the test calls `zeg({ commands: output })`
- Then the call throws `INVALID_CONFIG`

#### REQ-017 Each file path must end in .js

Source: D-37. Test: U.

- Given `cmd` plus a file whose path is one of these values: `'./A.ts'`, `'./A.JS'`, `'./A'`, with the module `{ default: B }`
- When the test calls `zeg({ commands: output })`
- Then the call throws `INVALID_CONFIG`

#### REQ-018 zeg() ignores properties of a glob output that are not enumerable strings

Source: D-07. Test: U.

- **(spec detail)** Given `cmd` plus a property whose name is a symbol, with the module `{ default: B }`
- And a property `./B.js` that is not enumerable, with the module `{ default: B }`
- When the test calls `zeg({ commands: output })` and then `await command(new A(1))`
- Then `zeg()` returns `undefined`, and `AH` handles the message

### 4.3 zeg(): files and pairs

#### REQ-020 A pair connects a message class to its handler class

Source: D-11, D-16. Test: U.

- Given `zeg({ commands: cmd })`
- When the test calls `await command(new A(1))`
- Then `AH` handles the message one time

#### REQ-021 A message file must have a handler file

Source: D-10, D-11, D-37. Test: U.

- Given the glob output `{ './A.js': { default: A } }`
- When the test calls `zeg({ commands: output })`
- Then the call throws `INVALID_CONFIG`

#### REQ-022 A handler file must have a message file

Source: D-10, D-11, D-37. Test: U.

- Given the glob output `{ './AHandler.js': { default: AH } }`
- When the test calls `zeg({ commands: output })`
- Then the call throws `INVALID_CONFIG`

#### REQ-023 The files of a pair must be in the same folder

Source: D-11, D-37. Test: U.

- Given the glob output `{ './x/A.js': { default: A }, './y/AHandler.js': { default: AH } }`
- When the test calls `zeg({ commands: output })`
- Then the call throws `INVALID_CONFIG`

#### REQ-024 The file names of a pair must match exactly

Source: D-11, D-37. Test: U.

- Given each of these glob outputs:
  - `{ './A.js': { default: A }, './aHandler.js': { default: AH } }`
  - `{ './a.js': { default: A }, './AHandler.js': { default: AH } }`
- When the test calls `zeg({ commands: output })`
- Then the call throws `INVALID_CONFIG`

#### REQ-025 Pairs can be in subfolders

Source: D-11. Test: U.

- Given the glob output `{ './billing/A.js': { default: A }, './billing/AHandler.js': { default: AH } }`
- When the test calls `zeg({ commands: output })` and then `await command(new A(1))`
- Then `AH` handles the message

#### REQ-026 Files with the same name in different folders form different pairs

Source: D-12, D-17. Test: U.

- Given the glob output `{ './billing/C.js': A, './billing/CHandler.js': AH, './shop/C.js': B, './shop/CHandler.js': BH }` (each value as `{ default: ... }`)
- When the test calls `zeg({ commands: output })`, then `await command(new A(1))` and `await command(new B(2))`
- Then `AH` handles the first message, and `BH` handles the second message

#### REQ-027 The files of a pair must be in the same glob output

Source: D-11, D-37. Test: U.

- Given the options `{ commands: [{ './A.js': { default: A } }, { './AHandler.js': { default: AH } }] }`
- When the test calls `zeg(options)`
- Then the call throws `INVALID_CONFIG`

#### REQ-028 A handler file named only Handler.js is not valid

Source: D-37. Test: U.

- Given each of these glob outputs:
  - `{ './Handler.js': { default: AH } }`
  - `{ './.js': { default: A }, './Handler.js': { default: AH } }`
- When the test calls `zeg({ commands: output })`
- Then the call throws `INVALID_CONFIG`

#### REQ-029 Only a file whose name ends in Handler.js is a handler file

Source: D-15, D-37. Test: U.

- Given the glob output `{ './ErrorHandler.js': { default: AH }, './ErrorHandlerHandler.js': { default: AH } }`
- When the test calls `zeg({ commands: output })`
- Then the call throws `INVALID_CONFIG`
- Given each of these glob outputs:
  - `{ './Error.js': { default: A }, './ErrorHandler.js': { default: AH } }`
  - `{ './Handlers.js': { default: A }, './HandlersHandler.js': { default: AH } }`
  - `{ './Ahandler.js': { default: A }, './AhandlerHandler.js': { default: AH } }`
- When the test calls `zeg({ commands: output })` and then `await command(new A(1))`
- Then `AH` handles the message

#### REQ-030 Each file must be part of a pair

Source: D-10, D-14, D-37. Test: U.

- Given `cmd` plus a helper file `./_email.js` with one of these modules: `{ welcomeText() {} }`, `{ default: class {} }`
- When the test calls `zeg({ commands: output })`
- Then the call throws `INVALID_CONFIG`

#### REQ-031 File paths can have any prefix

Source: D-11, syntax.md 7.2. Test: U.

- Given each of these pairs of paths:
  - `'A.js'` and `'AHandler.js'`
  - `'../src/A.js'` and `'../src/AHandler.js'`
  - `'/src/A.js'` and `'/src/AHandler.js'`
- When the test calls `zeg()` with a glob output that has these paths, and then `await command(new A(1))`
- Then `AH` handles the message

#### REQ-032 Real glob outputs work

Source: D-07, D-14, D-37. Test: U.

- Given the folder `test/fixtures/queries/` with these files:
  - `Ping.js` with a default class
  - `PingHandler.js` with a default class whose `handle()` returns `'pong'`
  - `_helper.js` with a named export only
- When the test calls `zeg({ queries: import.meta.glob(['./fixtures/queries/**/*.js', '!**/_*.js'], { eager: true }) })` and then `await query(new Ping())`
- Then `zeg()` returns `undefined`, and the Promise resolves to `'pong'`
- Given the same folder and the lazy glob `import.meta.glob('./fixtures/queries/**/*.js')`
- When the test calls `zeg({ queries: output })`
- Then the call throws `INVALID_CONFIG`
- Given the folder `test/fixtures/reexport/`, which is not in `test/fixtures/queries/`, with these files:
  - `A.js` with a default class and `AHandler.js` with a default handler class
  - `Copy.js` with `export { default } from './A.js'` and `CopyHandler.js` with a default handler class
- When the test calls `zeg({ commands: import.meta.glob('./fixtures/reexport/*.js', { eager: true }) })`
- Then the call throws `INVALID_CONFIG`

#### REQ-033 A handler file cannot use a handler file as its message file

Source: D-15, D-37. Test: U.

- Given `cmd` plus the file `./AHandlerHandler.js` with the module `{ default: AH }`
- When the test calls `zeg({ commands: output })`
- Then the call throws `INVALID_CONFIG`, because `./AHandler.js` is a handler file and not a message file

### 4.4 zeg(): classes

#### REQ-040 zeg() reads only the default export

Source: D-13, D-37. Test: U.

- Given the glob output `{ './A.js': { default: A, other: 1 }, './AHandler.js': { default: AH, X: class {} } }`
- When the test calls `zeg({ commands: output })` and then `await command(new A(1))`
- Then `AH` handles the message
- Given each of these glob outputs:
  - `{ './A.js': { A }, './AHandler.js': { default: AH } }`
  - `{ './A.js': { default: A }, './AHandler.js': { AH } }`
- When the test calls `zeg({ commands: output })`
- Then the call throws `INVALID_CONFIG`

#### REQ-041 A message class must be a function with a prototype object

Source: D-20, D-37. Test: U.

- Given each of these values as the default export of `./A.js`: `() => {}`, `async function () {}`, `{}`, `'x'`, `undefined`, `null`, `{ prototype: {} }`
- When the test calls `zeg()` with that file and `./AHandler.js`
- Then the call throws `INVALID_CONFIG`
- Given a class, and then a function declared with `function`, as the default export of `./A.js`
- When the test calls `zeg()` with that file and `./AHandler.js`
- Then the call returns `undefined`

#### REQ-042 A handler class must have a handle() method on its prototype

Source: D-19, D-37. Test: U.

- Given each of these values as the default export of `./AHandler.js`:
  - a class with the method `handle()`
  - a class that inherits `handle()` from a base class
  - a function declared with `function`, with `prototype.handle` set to a function
- When the test calls `zeg()` with `./A.js` and that file
- Then the call returns `undefined`
- Given each of these values as the default export of `./AHandler.js`:
  - a class without `handle()`
  - a class with the method `handel()`
  - a class with the class field `handle = () => {}`
  - a class with only a static method `handle()`
  - an arrow function
  - the object `{ handle() {} }`
- When the test calls `zeg()` with `./A.js` and that file
- Then the call throws `INVALID_CONFIG`

#### REQ-043 Two message files cannot have the same message class

Source: D-37. Test: U.

- Given each of these options:
  - `{ commands: { ...cmd, './B.js': { default: A }, './BHandler.js': { default: AH } } }` (the same class in one glob output)
  - `{ commands: [cmd, cmd] }` (the same class in two glob outputs)
  - `{ commands: cmd, queries: cmd }` (the same class in both kinds)
  - `{ commands: { ...cmd, './B.js': { default: F }, './BHandler.js': { default: AH } } }`, where `F` is a function declared with `function`, and `F.prototype` is `A.prototype`
- When the test calls `zeg(options)`
- Then the call throws `INVALID_CONFIG`

#### REQ-044 Two handler files can have the same handler class

Source: D-40. Test: U.

- Given the glob output `{ ...cmd, './B.js': { default: B }, './BHandler.js': { default: AH } }`
- When the test calls `zeg({ commands: output })`, then `await command(new A(1))` and `await command(new B(2))`
- Then `calls` contains `['A', message]` for each message

#### REQ-045 Anonymous classes are valid

Source: D-08. Test: U.

- Given a pair whose message class and handler class have the `name` `''`
- When the test calls `zeg()` and then dispatches an instance of the message class
- Then the handler class handles the message

### 4.5 zeg(): state and errors

#### REQ-050 Each call to zeg() replaces the registry

Source: D-35. Test: U.

- Given `zeg({ commands: cmd })` and then `zeg({ queries: qry })`
- When the test calls `command(new A(1))`
- Then the Promise rejects with `HANDLER_NOT_FOUND`
- **(spec detail)** Given `zeg({ commands: cmd })`
- When the test calls `const p = command(new A(1))`, then `zeg({})`, and then `await p`
- Then `AH` handles the message, because the dispatch started before the second call to `zeg()`

#### REQ-051 zeg({}) creates an empty registry

Source: D-36. Test: U.

- Given `zeg({})`
- When the test calls `command(new A(1))`
- Then the Promise rejects with `HANDLER_NOT_FOUND`

#### REQ-052 A call to zeg() that throws does not change the registry

Source: D-39. Test: U.

- Given `zeg({ commands: cmd })`, and then a call `zeg({ commands: { './X.js': { default: B } } })` that throws `INVALID_CONFIG`
- When the test calls `await command(new A(1))`
- Then `AH` handles the message

#### REQ-053 The first call to zeg() that returns configures zeg

Source: D-46. Test: U. The test of this requirement is in its own test file (section 1.5).

- Given a module state in which no call to `zeg()` occurred
- When the test calls `command(new A(1))`
- Then the Promise rejects with `NOT_CONFIGURED`
- Given a first call to `zeg()` that throws `INVALID_CONFIG`
- When the test calls `command(new A(1))`
- Then the Promise rejects with `NOT_CONFIGURED`
- Given a call `zeg({})` that returns
- When the test calls `command(new A(1))`
- Then the Promise rejects with `HANDLER_NOT_FOUND`

#### REQ-054 zeg() copies the entries of the glob outputs

Source: D-35. Test: U.

- **(spec detail)** Given `const output = { ...cmd }` and `zeg({ commands: output })`
- When the test deletes the properties of `output` and then calls `await command(new A(1))`
- Then `AH` handles the message

#### REQ-055 A value that user code throws in zeg() reaches the caller unchanged

Source: D-39. Test: U.

- **(spec detail)** Given `zeg({ commands: cmd })`, and then a glob output with an enumerable getter for `./B.js` that throws the value `e`, for example `{ ...cmd, get './B.js'() { throw e; } }`
- When the test calls `zeg({ commands: output })`
- Then the call throws `e`
- And after `await command(new A(1))`, `AH` handles the message

#### REQ-056 The error text of INVALID_CONFIG names the option and the file

Source: D-54. Test: U.

- **(spec detail)** Given the options `{ commands: [cmd, { './B.js': { default: B } }] }`
- When the test calls `zeg(options)`
- Then the error text contains `commands[1]` and `./B.js`
- Given the options of the first case of REQ-043
- When the test calls `zeg(options)`
- Then the error text contains `./A.js` and `./B.js`
- Given the options `{ extra: 1 }`
- When the test calls `zeg(options)`
- Then the error text contains `extra`
- The error text is not part of the API [D-54]. The tests check only these parts of the text.

#### REQ-057 zeg() stops at the first check that fails

Source: D-37, D-39. Test: U.

- **(spec detail)** Given these glob outputs:
  - `badPath = { './B.ts': { default: B } }`, which fails the path check of Z4
  - `unpaired = { './B.js': { default: B } }`, which passes Z4 and fails Z5
  - `throwing`, a glob output with an enumerable getter for `./C.js` that throws the value `e`
- When the test calls `zeg({ commands: [badPath, throwing] })`
- Then the call throws `INVALID_CONFIG`, because Z4 reads `badPath` first
- When the test calls `zeg({ commands: [throwing, badPath] })`
- Then the call throws `e`
- When the test calls `zeg({ commands: [unpaired, throwing] })`
- Then the call throws `e`, because Z4 reads all glob outputs before Z5 forms the pairs
- When the test calls `zeg({ commands: badPath, queries: throwing })`
- Then the call throws `INVALID_CONFIG`, because `zeg()` reads `commands` before `queries`
- When the test calls `zeg({ commands: throwing, queries: 'x' })`
- Then the call throws `INVALID_CONFIG`, because Z3 checks both options before Z4 reads a glob output

### 4.6 Dispatch: the message

#### REQ-060 command() and query() always return a Promise

Source: D-41. Test: U. The test of this requirement is in its own test file (section 1.5).

- **(spec detail)** Given a module state in which no call to `zeg()` occurred
- And each of these messages: `new A(1)`, `new Q(1)`, `new Map()`, `Object.create(A.prototype)` and each value of REQ-061
- When the test calls `command(message)` and `query(message)`
- Then each call returns a native `Promise` and does not throw
- Given `zeg({ commands: cmd, queries: qry })` and the same messages
- When the test calls `command(message)` and `query(message)`
- Then each call returns a native `Promise` and does not throw
- The test catches each rejection.

#### REQ-061 The Promise rejects with a TypeError for an invalid message

Source: D-27, D-45. Test: U.

- Given `zeg({ commands: cmd, queries: qry })`
- And each of these values: `undefined`, `null`, `1`, `'x'`, `true`, `Symbol()`, `1n`, `() => {}`, `A` (the class itself), `[]`, `{}`, `Object.create(null)`
- When the test calls `command(value)` and `query(value)`
- Then each Promise rejects with a `TypeError`, which is not a `ZegError`

#### REQ-062 The check of the message comes before the NOT_CONFIGURED check

Source: D-45, D-46. Test: U. The test of this requirement is in its own test file (section 1.5).

- **(spec detail)** Given a module state in which no call to `zeg()` occurred
- When the test calls `command(null)`
- Then the Promise rejects with a `TypeError`

#### REQ-063 Other objects are valid messages

Source: D-27, D-47. Test: U.

- Given `zeg({ commands: cmd, queries: qry })`
- When the test calls `command()` and `query()` with `new Map()` and with `new Date()`
- Then each Promise rejects with `HANDLER_NOT_FOUND`

#### REQ-064 zeg reads no property of the message

Source: D-16. Test: U.

- **(spec detail)** Given `zeg({ commands: cmd })` and a message `new A(1)` with an own getter `constructor` that throws
- When the test calls `await command(message)`
- Then `AH` handles the message
- Given a Proxy of `new A(1)`. Its `getPrototypeOf` trap counts its calls and returns `A.prototype`. Its `get` trap throws for the property `constructor` and forwards all other properties.
- When the test calls `await command(proxy)`
- Then, directly after the dispatch, the count is `1`, and `calls[0][1]` is the proxy
- Given a Proxy whose `getPrototypeOf` trap throws the value `e`
- When the test calls `command(proxy)`
- Then the Promise rejects with `e`

### 4.7 Dispatch: the lookup

#### REQ-070 The lookup uses the prototype of the message

Source: D-16. Test: U.

- Given `zeg({ commands: cmd })`
- When the test calls `await command(Object.create(A.prototype))`
- Then `AH` handles the message
- Given a message `new A(1)` with the own property `constructor` set to `Q`
- When the test calls `await command(message)`
- Then `AH` handles the message

#### REQ-071 A dispatch of a class without a pair rejects with HANDLER_NOT_FOUND

Source: D-47. Test: U.

- Given `zeg({ commands: cmd, queries: qry })`
- When the test calls `command(new (class {})())` and `query(new (class {})())`
- Then each Promise rejects with `HANDLER_NOT_FOUND`
- **(spec detail)** Given `class UniqueName987 {}`
- When the test calls `command(new UniqueName987())`
- Then the Promise rejects with `HANDLER_NOT_FOUND`, and the error text does not contain `UniqueName987`

#### REQ-072 A subclass needs its own pair

Source: D-28. Test: U.

- Given `class S extends A {}` and `zeg({ commands: cmd })`
- When the test calls `command(new S(1))`
- Then the Promise rejects with `HANDLER_NOT_FOUND`
- Given `class S extends A {}` and `zeg({ commands: { ...cmd, './S.js': { default: S }, './SHandler.js': { default: BH } } })`
- When the test calls `await command(new S(1))`
- Then `BH` handles the message, and `AH` does not

#### REQ-073 A dispatch of a message of the other kind rejects with HANDLER_NOT_FOUND and a hint

Source: D-47, D-48. Test: U.

- Given `zeg({ commands: cmd, queries: qry })`
- When the test calls `query(new A(1))`
- Then the Promise rejects with `HANDLER_NOT_FOUND`, and the error text contains `command()` and `./A`
- When the test calls `command(new Q(1))`
- Then the Promise rejects with `HANDLER_NOT_FOUND`, and the error text contains `query()` and `./Q`
- **(spec detail)** The hint in the error text contains the name of the other function as the literal text `command()` or `query()`.

#### REQ-074 The hint names the position in an array

Source: D-48. Test: U.

- Given `zeg({ commands: cmd, queries: [{}, qry] })`
- When the test calls `command(new Q(1))`
- Then the Promise rejects with `HANDLER_NOT_FOUND`, and the error text contains `queries[1]`

#### REQ-075 Two glob outputs can have the same file paths

Source: D-09, D-12, D-17. Test: U.

- Given `zeg({ commands: [{ './R.js': A, './RHandler.js': AH }, { './R.js': B, './RHandler.js': BH }] })` (each value as `{ default: ... }`)
- When the test calls `await command(new A(1))` and `await command(new B(2))`
- Then `AH` handles the first message, and `BH` handles the second message

#### REQ-076 zeg does not use class names

Source: D-08. Test: U.

- Given two different message classes that both have the name `R`, in two pairs with the handler classes `AH` and `BH`
- When the test dispatches an instance of each class
- Then each handler class handles only the message of its own pair
- Given a message class with `static name = 'Other'` in a pair with `AH`
- When the test dispatches an instance of it
- Then `AH` handles the message

### 4.8 Dispatch: the handler

#### REQ-080 Each dispatch creates a new handler instance

Source: D-21. Test: U.

- Given a handler class that stores `this` in an array in `handle()`
- When the test dispatches two messages
- Then the array contains two different objects, and each is an instance of the handler class

#### REQ-081 The handler constructor receives no arguments

Source: D-21. Test: U.

- Given a handler class whose constructor stores `arguments.length`
- When the test dispatches a message
- Then the stored value is `0`

#### REQ-082 handle() receives exactly one argument, the message itself

Source: D-18, D-22, D-29. Test: U.

- Given a handler class whose `handle()` stores `arguments.length`, `arguments[0]` and `this`
- When the test calls `await command(message)`
- Then the stored length is `1`, the stored argument is `message` (the same object), and `this` is the handler instance

#### REQ-083 handle() starts during the call

Source: D-41. Test: U.

- **(spec detail)** Given `zeg({ commands: cmd })`
- When the test calls `command(new A(1))` without `await` and reads `calls` on the next line
- Then `calls` contains the message

#### REQ-084 zeg does not change the message

Source: D-29. Test: U.

- Given a handler that sets `m.v = 2` and pushes to `m.list`
- When the test calls `await command(message)` with `message = new A(1)` and `message.list = []`
- Then `message.v` is `2`, and `message.list` has one entry
- And `Object.isFrozen(message)` and `Object.isFrozen(message.list)` are `false`

#### REQ-085 A message class can freeze its message

Source: D-29, D-49. Test: U.

- Given a message class that calls `Object.freeze(this)` in its constructor, and a handler that assigns a value to a property of the message
- When the test calls `command(message)`
- Then the Promise rejects with a `TypeError`, and the property of the message does not change

#### REQ-086 A handler can dispatch another message

Source: D-04, D-23. Test: U.

- Given a handler class `AD` whose `handle()` calls `await command(new B(1))` and `await query(new Q(1))`, and pushes the result of the query to `calls`
- And `zeg({ commands: { './A.js': { default: A }, './AHandler.js': { default: AD }, './B.js': { default: B }, './BHandler.js': { default: BH } }, queries: qry })`
- When the test calls `await command(new A(1))`
- Then `BH` handles its message, and `calls` contains `{ tag: 'Q', v: 1 }`

#### REQ-087 zeg has no limit for nested dispatches

Source: D-24. Test: U.

- Given a message class `R` with the property `n`, and a handler that dispatches `new R(n - 1)` if `n` is more than `0`
- When the test calls `await command(new R(100))`
- Then the handler runs 101 times, and the Promise resolves

#### REQ-088 handle() can be sync or async

Source: D-18. Test: U.

- Given one sync and one async `handle()` that both return `{ v: 1 }`, in two query pairs
- When the test calls `await query()` with a message of each pair
- Then both Promises resolve to `{ v: 1 }`

#### REQ-089 zeg calls the handle() of the instance

Source: D-19, D-21. Test: U.

- **(spec detail)** Given a handler class with a `handle()` method on its prototype, whose constructor sets an own property `handle` to a different function
- When the test dispatches a message
- Then the own function runs, and the prototype method does not run
- Given a handler class whose constructor sets the own property `handle` to `1`
- When the test calls `command(message)`
- Then the Promise rejects with a `TypeError`
- Given a generator function `G` declared with `function*`, with `G.prototype.handle` set to a function
- When the test calls `zeg({ commands: { './A.js': { default: A }, './AHandler.js': { default: G } } })` and then `command(new A(1))`
- Then `zeg()` returns `undefined`, and the Promise rejects with the `TypeError` from `new`

### 4.9 Dispatch: the result

#### REQ-090 command() resolves to undefined

Source: D-42. Test: U.

- Given command handlers that return `42`, `Promise.resolve(42)` and nothing
- And spies on `console.warn`, `console.error`, `console.log`, `console.info` and `console.debug`
- When the test calls `await command(message)` for each handler
- Then each Promise resolves to `undefined`, and the spies have no calls

#### REQ-091 command() waits for an async handle()

Source: D-42. Test: U.

- Given an async `handle()` that waits for a timer and then pushes to `calls`
- When the test calls `await command(new A(1))`
- Then `calls` contains the message after the `await`

#### REQ-092 query() resolves to the value of handle()

Source: D-43. Test: U.

- Given query handlers that return an object `o`, `Promise.resolve(o)`, `null`, `0`, `''` and `false`
- When the test calls `await query(message)` for each handler
- Then the Promises resolve to `o` (the same object), `o`, `null`, `0`, `''` and `false`

#### REQ-093 If handle() returns undefined, query() rejects with UNDEFINED_RESULT

Source: D-44. Test: U.

- Given query handlers that return `undefined`, `Promise.resolve(undefined)` and nothing
- When the test calls `query(message)` for each handler
- Then each Promise rejects with `UNDEFINED_RESULT`

#### REQ-094 zeg resolves a thenable from handle()

Source: D-42, D-43. Test: U.

- Given a query handler that returns `{ then(resolve) { resolve(5); } }`
- When the test calls `await query(message)`
- Then the Promise resolves to `5`
- **(spec detail)** Given a command handler that returns `{ then(resolve) { calls.push('then'); resolve(5); } }`
- When the test calls `await command(message)`
- Then the Promise resolves to `undefined`, and `calls` contains `'then'`

### 4.10 Dispatch: values that user code throws

#### REQ-100 An error from handle() reaches the caller unchanged

Source: D-49. Test: U.

- Given a sync `handle()` that throws the error `e`, and an async `handle()` that rejects with `e`
- When the test calls `command(message)` for each handler
- Then each Promise rejects with `e`, and `Object.keys(e)` does not change

#### REQ-101 A value that is not an Error also reaches the caller unchanged

Source: D-49. Test: U.

- **(spec detail)** Given handlers that throw `'x'`, `42` and `undefined`
- When the test calls `command(message)` for each handler
- Then each Promise rejects with that same value

#### REQ-102 An error from the handler constructor reaches the caller unchanged

Source: D-49. Test: U.

- Given a handler class whose constructor throws the error `e`
- When the test calls `command(new A(1))`
- Then the Promise rejects with `e`, and `handle()` does not run

#### REQ-103 A ZegError from a nested dispatch reaches the caller unchanged

Source: D-49, syntax.md 6.3. Test: U.

- Given a handler class of `A` that dispatches `new (class {})()`, pushes the rejection value to `calls` and throws it again
- When the test calls `command(new A(1))`
- Then the Promise rejects with `HANDLER_NOT_FOUND`, and the error is the same object as the value in `calls`

### 4.11 ZegError

#### REQ-110 A ZegError has a name, a code and an error text

Source: D-50, D-51. Test: U.

- Given `const error = new ZegError('HANDLER_NOT_FOUND', 'text')`
- When the test reads the error
- Then `error instanceof ZegError` and `error instanceof Error` are `true`
- And `error.name` is `'ZegError'`, `error.code` is `'HANDLER_NOT_FOUND'`, and `error.message` is `'text'`

#### REQ-111 The constructor does not check the code

Source: D-51. Test: U.

- Given `new ZegError('ANY', 'x')` and `new ZegError(42)`
- When the test reads `code`
- Then the values are `'ANY'` and `42`
- **(spec detail)** The constructor calls `Error` with the second argument. As a result, `new ZegError(42).message` is `''`.

#### REQ-112 zeg adds no other properties

Source: D-52. Test: U.

- Given a `ZegError` from the constructor, and a `ZegError` from a dispatch whose Promise rejects
- When the test reads `Reflect.ownKeys(error)`
- Then each name is `stack`, `message`, `name` or `code`, and `'cause' in error` is `false`

#### REQ-113 Each ZegError from zeg has a known code

Source: D-53. Test: U.

- Given each `ZegError` that zeg creates in the scenarios of a test file
- When a helper of that test file reads the error
- Then its `code` is `INVALID_CONFIG`, `NOT_CONFIGURED`, `HANDLER_NOT_FOUND` or `UNDEFINED_RESULT`
- **(spec detail)** And its `message` is a string that is not empty

### 4.12 Build and runtime

#### REQ-120 The example Worker works after a production build

Source: D-04, D-05, D-06, D-07, D-14, D-69, syntax.md 3. Test: B.

- **(spec detail)** Given `examples/basic-worker/`. It contains the example project of syntax.md section 3 without the test files, plus one route:

  | Route | Code in `src/index.js` |
  | --- | --- |
  | `GET /wrong-kind` | Calls `command(new GetUser('a@b.c'))`, catches the error and returns status 400 with the body `{ name, code }` of the error. |
  | each other request | The `fetch()` code of syntax.md section 3.7. |

- When the test applies the migration to the local database, runs `vite build`, starts the built Worker with `vite preview` and sends these requests:

  | Request | Expected response |
  | --- | --- |
  | `POST /` with the body `{"email":"a@b.c"}` | status 200, body `{"email":"a@b.c"}` |
  | `GET /wrong-kind` | status 400, body `{"name":"ZegError","code":"HANDLER_NOT_FOUND"}` |

- Then each response has the expected status and body
- And the console output of `vite preview` contains `welcome mail to a@b.c`, which shows the nested dispatch and the helper file

#### REQ-121 The example Worker works after a minified build

Source: D-08, D-69. Test: B.

- Given a copy of `vite.config.js` of the example with `build.minify` set to `true` and no `keepNames` setting
- When the test runs the build and the requests of REQ-120 with this configuration
- Then each response is the same as in REQ-120
- This includes the value `ZegError` of the property `name` in the response to `GET /wrong-kind`

#### REQ-122 An INVALID_CONFIG error stops the Worker at startup

Source: D-38, D-69. Test: B.

- Given a copy of the example with the added file `src/commands/Orphan.js`, which has a default class and no handler file
- When the test runs `vite build`, and then tries to start the Worker with `vite preview` and with `vite dev`
- Then `vite build` succeeds
- And for `vite preview` and for `vite dev`, the console output of the process contains `ZegError`, and no HTTP request to the Worker succeeds within 30 seconds, or before the process stops

#### REQ-123 The example Worker needs no compatibility flags

Source: D-22, background fact 10. Test: S.

- **(spec detail)** Given `examples/basic-worker/wrangler.jsonc`
- When a static check reads it
- Then it has no `compatibility_flags` property

### 4.13 Non-functional checks

#### REQ-130 The unit tests use Vitest 4.1 and the Workers plugin

Source: D-68. Test: S.

- Given `package.json` and `vitest.config.js`
- When a static check reads them
- Then `devDependencies` contains `vitest` with a version range that starts with `^4.1`, and contains `@cloudflare/vitest-plugin`
- And the unit test project in `vitest.config.js` uses `cloudflareTest` from `@cloudflare/vitest-plugin`

#### REQ-131 The coverage is 100%

Source: D-70. Test: N.

- Given the unit tests
- When Vitest runs them with Istanbul coverage for `src/zeg.js`
- Then lines, branches, functions and statements all have 100% coverage
- **(spec detail)** And the coverage report contains `src/zeg.js` with more than 0 statements

#### REQ-132 The library is small

Source: D-71. Test: N.

- Given `src/zeg.js`
- When a check runs `esbuild --minify --format=esm` and then `gzip -9` on it
- Then the result is 1536 bytes or less

#### REQ-133 CI runs all tests and checks, except the mutation tests

Source: D-72, D-75. Test: S.

- Given the workflow file in `.github/workflows/`
- When a static check reads it
- Then it runs on a push to `main` and uses Node 22
- And it runs the unit tests, the build tests and the static checks
- And it runs the coverage check and the size check
- And it does not run the mutation tests (`npm run test:mutation`)

#### REQ-134 The code follows the style rules

Source: D-74. Test: S.

- Given the repository
- When a static check runs `eslint --max-warnings 0 .` and `prettier --check .`
- Then both commands end with the exit code 0
- And the scripts `lint` and `lint:fix` of `package.json` run these two tools
- And ESLint and Prettier ignore no tracked JavaScript, JSON, YAML or Markdown file, except `package-lock.json`
- And no comment in a file turns off the rule `curly`, and no Markdown file has an `eslint-skip` comment
- Given the ESLint configuration
- When a static check lints an `if`, `else`, `for`, `while` and `do` statement without braces, in JavaScript files and in a Markdown code block
- Then the rule `curly` reports each of these statements as an error
- Given the Prettier configuration
- When a static check reads it
- Then it has a line width of 100, 2 spaces, no tabs, semicolons, single quotes and trailing commas `all`
- And its only override gives Markdown files the compact table form (`proseWrap: never`)
- And `package.json` gives an exact version for `prettier`

## 5. Spec details for approval

These rules come from this spec, not from a decision. When the user approves phase 2, the user also approves them.

1. Rules 2 to 8 of the test environment in section 1.5.
2. `zeg()` stops at the first check that fails, in the order of section 2. It handles `commands` before `queries`, the entries of an array in index order and the files in `Object.keys()` order (REQ-057).
3. `zeg()` reads the names of all own properties of the options, also symbol names and the names of properties that are not enumerable (Z2, REQ-012). D-37 does not state this detail.
4. `zeg()` reads the file paths of a glob output with `Object.keys()` (REQ-018).
5. A hole in an array reads as `undefined`, so `zeg()` throws `INVALID_CONFIG` for it (REQ-015).
6. If user code throws a value while `zeg()` reads a value, `zeg()` throws that same value, and the registry does not change (REQ-055).
7. The error text of `INVALID_CONFIG` names the unknown property, the option, the position in the array and the file path. For Z6, it names both file paths (REQ-056).
8. `zeg()` copies the entries of the glob outputs. Later changes to these objects have no effect (REQ-054).
9. S2 comes before S3. For an invalid message, the Promise rejects with a `TypeError` also before the first call to `zeg()` (REQ-062).
10. `handle()` starts during the call to `command()` or `query()` (REQ-083).
11. S4 uses the registry that is active at the time of the call (REQ-050).
12. In S2 to S6, zeg reads no property of the message. It reads `Object.getPrototypeOf(message)` one time (REQ-064).
13. No error text of zeg contains a class name (REQ-071).
14. If user code throws a value during a dispatch, the Promise rejects with that same value. This is also true for a value that is not an `Error` (REQ-064, REQ-101).
15. zeg calls `instance.handle`. An own property `handle` of the instance has priority over the prototype method (REQ-089).
16. `command()` also waits for a thenable that a command handler returns, and then ignores its value (REQ-094).
17. The hint in the error text contains the literal text `command()` or `query()` (REQ-073).
18. `command()` and `query()` return a native `Promise` (REQ-060).
19. `new ZegError(code)` without a second argument has the `message` `''`, as for `Error` (REQ-111).
20. The `message` of each `ZegError` that zeg creates is a string that is not empty (REQ-113).
21. `LICENSE` contains the text `MIT License` (REQ-004).
22. `examples/basic-worker/` contains the example project of syntax.md section 3, plus the route `GET /wrong-kind` (REQ-120).
23. The example Worker has no `compatibility_flags` (REQ-123).
24. The coverage report must contain `src/zeg.js` with more than 0 statements (REQ-131).

## 6. Decisions and requirements

| Decision | Requirements |
| --- | --- |
| D-01, D-02 | REQ-001 |
| D-03 | REQ-002 |
| D-04 | REQ-086, REQ-120 |
| D-05 | REQ-001, REQ-010, REQ-120 |
| D-06 | REQ-120 |
| D-07 | REQ-016, REQ-018, REQ-032, REQ-120 |
| D-08 | REQ-045, REQ-076, REQ-121 |
| D-09 | REQ-014, REQ-015, REQ-075 |
| D-10 | REQ-021, REQ-022, REQ-030 |
| D-11 | REQ-020 to REQ-025, REQ-027, REQ-031 |
| D-12 | REQ-026, REQ-075 |
| D-13 | REQ-040 |
| D-14 | REQ-030, REQ-032, REQ-120 |
| D-15 | REQ-029, REQ-033 |
| D-16 | REQ-020, REQ-064, REQ-070 |
| D-17 | REQ-026, REQ-075 |
| D-18 | REQ-082, REQ-088 |
| D-19 | REQ-042, REQ-089 |
| D-20 | REQ-041 |
| D-21 | REQ-080, REQ-081, REQ-089 |
| D-22 | REQ-082, REQ-123 |
| D-23 | REQ-086 |
| D-24 | REQ-087 |
| D-25, D-26 | Documentation only. These rules describe user code and module loading. Section 2 states what `zeg()` does if a read throws. |
| D-27 | REQ-061, REQ-063 |
| D-28 | REQ-072 |
| D-29 | REQ-082, REQ-084, REQ-085 |
| D-30 to D-34 | Removed in revision 3 of `docs/decisions.md` |
| D-35 | REQ-013, REQ-050, REQ-054 |
| D-36 | REQ-051 |
| D-37 | REQ-011, REQ-012, REQ-014 to REQ-017, REQ-021 to REQ-024, REQ-027 to REQ-030, REQ-032, REQ-033, REQ-040 to REQ-043, REQ-057 |
| D-38 | REQ-122 |
| D-39 | REQ-052, REQ-055, REQ-057 |
| D-40 | REQ-044 |
| D-41 | REQ-060, REQ-083 |
| D-42 | REQ-090, REQ-091, REQ-094 |
| D-43 | REQ-092, REQ-094 |
| D-44 | REQ-093 |
| D-45 | REQ-061, REQ-062 |
| D-46 | REQ-053, REQ-062 |
| D-47 | REQ-063, REQ-071, REQ-073 |
| D-48 | REQ-073, REQ-074 |
| D-49 | REQ-085, REQ-100 to REQ-103 |
| D-50, D-51 | REQ-110, REQ-111 |
| D-52 | REQ-112 |
| D-53 | REQ-113 |
| D-54 | REQ-056 |
| D-55, D-56, D-57 | REQ-003 |
| D-58 | REQ-004 |
| D-59 | REQ-005 |
| D-60 | REQ-006 |
| D-61 to D-67 | Process only |
| D-68 | REQ-130 |
| D-69 | REQ-120, REQ-121, REQ-122 |
| D-70 | REQ-131 |
| D-71 | REQ-132 |
| D-72 | REQ-133 |
| D-73 | Development setup only |
| D-74 | REQ-134 |
| D-75 | REQ-133 |
