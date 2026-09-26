# zeg: decisions

This file lists the decisions for zeg, a small CQRS library for Cloudflare Workers. Each decision has an ID. `docs/syntax.md` and the later documents refer to these IDs.

The user made these decisions in the clarification rounds and in the reviews of phase 1. Some decisions add an exact detail to an answer from the user. These decisions have the mark **(detail)**. When the user approves phase 1, the user also approves these details.

To change a decision, change this file first. Then update the documents that refer to it. The section "History" at the end lists the revisions of this file.

## Terms

- **Message:** an object that the caller gives to `command()` or `query()`, for example `new RegisterUser(email)`.
- **Kind:** command or query.
- **Dispatch:** one call to `command()` or `query()`.
- **Glob output:** the object that `import.meta.glob` returns. Each property name is a file path, and each property value is the module of that file.
- **Handler file:** a file in a glob output whose name ends in `Handler.js`, for example `RegisterUserHandler.js`.
- **Message file:** a file in a glob output whose name does not end in `Handler.js`, for example `RegisterUser.js`.
- **Helper file:** a file in a command folder or a query folder that is not a message file or a handler file of a pair, for example `_email.js`.
- **Message class:** the default export of a message file.
- **Handler class:** the default export of a handler file.
- **Pair:** a message file and its handler file.
- **Key:** the file path of a message file without `.js`, as the glob output supplies it. An example is `./commands/billing/ChargeCard`.
- **Plain object:** an object whose prototype is `Object.prototype` or `null`.
- **Array:** a value for which `Array.isArray()` returns `true`.
- **Error text:** the `message` property of an error.

## Scope

- **D-01** Version 1 contains only `configure()`, `command()`, `query()` and `CqrsError`. It has no middleware, no events and no Cloudflare Queues support.
- **D-02** The package exports exactly four names: `configure`, `command`, `query` and `CqrsError`.
- **D-03** The library code imports no modules. It uses only standard JavaScript. **(detail)** As a result, it imports no `node:*` module and no `cloudflare:*` module.

## API model

- **D-04** The API has global functions. The project calls `configure()` one time, in its Worker entry file, for example `src/index.js`. Each other file that dispatches a message imports `command` or `query` from `'@otar/zeg'`.
- **D-05** The library keeps the handlers in a hidden module-level registry. As a result, each isolate has one registry. The package has no bus object and no `reset()` function.

## Build and discovery

- **D-06** A project that uses zeg must build with Vite and `@cloudflare/vite-plugin`. zeg does not support a build with Wrangler only, because Wrangler does not transform `import.meta.glob`.
- **D-07** The project finds its message files and handler files with the eager form of `import.meta.glob`, that is `{ eager: true }`. The project writes one glob for each kind in its call to `configure()`. Each glob must find the message files and the handler files of its kind. **(detail)** Vite requires that each glob pattern is a string literal in the source file.
- **D-08** The library does not use class names. Message classes and handler classes can be anonymous or named. A project does not need the `keepNames` setting.

## Files and pairs

- **D-09** The glob in the `commands` option supplies the command files. The glob in the `queries` option supplies the query files.
- **D-10** Each file in a glob output must be part of a pair.
- **D-11** A message file `X.js` and a handler file `XHandler.js` in the same folder form a pair. Each message file must have its handler file, and each handler file must have its message file. The file names must match exactly, and the match is case-sensitive. The files can be in subfolders.
- **D-12** Files with the same name in different folders form different pairs. For example, `./commands/billing/Charge.js` and `./commands/shop/Charge.js` are valid together.
- **D-13** Each message file and each handler file has a default export. **(detail)** The library reads only the default export. It ignores other exports.
- **D-14** If a command folder or a query folder contains helper files, the project excludes them with a negative glob pattern. An example is `'!**/_*.js'`.
- **D-15** **(detail)** The name of a message file cannot end in `Handler.js`, because the library then treats it as a handler file.

## Resolution

- **D-16** The library finds the handler through the class of the message, not through a name. **(detail)** The class of the message is the message class whose `prototype` is equal to `Object.getPrototypeOf(message)`.
- **D-17** The library uses the key only in error texts.

## Handlers

- **D-18** A handler class has an instance method `handle(message)`. The method gets exactly one argument. **(detail)** It can be sync or async.
- **D-19** `configure()` checks each handler class. The class must be a function, and `HandlerClass.prototype.handle` must be a function. A `handle()` method that the class inherits from a base class passes this check. A class field such as `handle = () => {}` does not pass.
- **D-20** **(detail)** `configure()` checks each message class. The class must be a function whose `prototype` is an object.
- **D-21** The library creates a new handler instance for each dispatch, with `new HandlerClass()` and no arguments. **(detail)** The library creates the instance before deep freeze starts.
- **D-22** The library gives no context to handlers. When a handler needs `env` or `waitUntil`, it imports them from `'cloudflare:workers'`. A handler cannot get the `Request` object. The caller must put the data that the handler needs into the message.
- **D-23** A handler dispatches another message with `command()` or `query()` from `'@otar/zeg'`.
- **D-24** The library has no guard against recursive dispatch.
- **D-25** **(detail)** A message file or a handler file must not import the Worker entry file. Such an import cycle can cause `undefined` values and no error.
- **D-26** If the top-level code of a message file or a handler file throws, the Worker fails at startup. zeg does not catch this error.

## Messages

- **D-27** These values are not valid messages: `null`, primitives, **(detail)** functions, arrays and plain objects. Instances of anonymous classes are valid.
- **D-28** A subclass is a different class. It needs its own pair. The library does not use the handler of the parent class.

## Deep freeze

- **D-29** The library deep-freezes the message immediately before `handle()` runs. It freezes the message itself. Then it walks nested plain objects and nested arrays and freezes them.
- **D-30** Deep freeze does not change other nested objects, and it does not walk them. Examples are class instances, `Map`, `Set`, `Date`, typed arrays, `Request` and streams.
- **D-31** Deep freeze walks properties whose names are strings or symbols. It also walks properties that are not enumerable. It reads only data properties and does not call getters. It walks each object one time, so circular references do not cause an infinite loop. It also walks objects that are already frozen.
- **D-32** Deep freeze applies to `command()` and to `query()`. **(detail)** If the dispatch stops before deep freeze starts, the message does not change.
- **D-33** **(detail)** If `Object.freeze` throws during deep freeze, the Promise rejects with that error, and `handle()` does not run. The objects that the library froze before the error stay frozen.
- **D-34** The caller's message object stays frozen after the dispatch.

## configure()

- **D-35** Each call to `configure()` replaces all handlers. The options `commands` and `queries` are both optional. **(detail)** An option with the value `undefined` is the same as a missing option.
- **D-36** `configure({})` is valid. It creates an empty registry.
- **D-37** `configure()` throws a `CqrsError` with the code `INVALID_CONFIG` in these cases:
  - **(detail)** The argument is not a plain object.
  - The argument has a property other than `commands` and `queries`.
  - **(detail)** The value of `commands` or `queries` is not a plain object.
  - **(detail)** A value in a glob output is not an object. For example, a lazy glob supplies functions, which are not valid.
  - **(detail)** A file path in a glob output does not end in `.js`.
  - A file has no default export.
  - A message file has no handler file in its folder, or a handler file has no message file in its folder. This includes a helper file that no negative pattern excludes. **(detail)** It also includes a handler file with the name `Handler.js` only.
  - A message class does not pass the check in D-20, or a handler class does not pass the check in D-19.
  - **(detail)** Two message files have the same class as their default export, in one kind or in both kinds. Two message classes with the same `prototype` object are also not valid.
- **D-38** `configure()` runs when the Worker starts (D-04). As a result, an `INVALID_CONFIG` error stops the Worker at startup, and `vite dev` does not start.
- **D-39** `configure()` checks all options before it changes the registry. If `configure()` throws, the registry does not change, and the handlers from the previous call stay active.
- **D-40** **(detail)** Two handler files can have the same handler class as their default export.

## Dispatch

- **D-41** `command()` and `query()` always return a Promise. **(detail)** They never throw synchronously.
- **D-42** `command()` resolves to `undefined`. The library ignores the return value of a command handler. It does not throw an error and does not write a warning.
- **D-43** `query()` resolves to the value that the handler returns, after `await`. `null` is a valid value.
- **D-44** If the value from a query handler is `undefined` after `await`, the Promise rejects with the code `UNDEFINED_RESULT`.
- **D-45** If the message is not valid (D-27), the Promise rejects with a `TypeError`.
- **D-46** Until a call to `configure()` returns without an error, the Promise rejects with the code `NOT_CONFIGURED`.
- **D-47** If the class of the message is not a message class of the correct kind, the Promise rejects with the code `HANDLER_NOT_FOUND`. This includes a class that no glob found and a message of the other kind.
- **D-48** If the message is a message of the other kind, the error text tells the caller to use the other function. **(detail)** The error text names the message file by its key.
- **D-49** If `new HandlerClass()` or `handle()` throws, or if the Promise of `handle()` rejects, the Promise of the dispatch rejects with the same error object. The library does not wrap or change this error.

## Errors

- **D-50** The library uses one error class, `CqrsError`. **(detail)** It extends `Error`.
- **D-51** The constructor is public: `new CqrsError(code, message)`. It sets `code` and `message`. It does not check the code. The `name` property is always `'CqrsError'`.
- **D-52** A `CqrsError` has the properties `name`, `code` and `message`. zeg adds no other properties. **(detail)** The `stack` property that the JavaScript engine adds is not part of this rule.
- **D-53** The codes are `INVALID_CONFIG`, `NOT_CONFIGURED`, `HANDLER_NOT_FOUND` and `UNDEFINED_RESULT`.
- **D-54** The class and the code are the API. The error text can change in any version.

## Package

- **D-55** The name of the library is zeg. The npm package is `@otar/zeg`.
- **D-56** `package.json` has `"name": "@otar/zeg"`, `"version": "0.1.0"`, `"type": "module"`, `"exports": "./src/index.js"`, `"license": "MIT"` and `"publishConfig": { "access": "public" }`. It has no `"private"` field, so the package is ready to publish. It has no runtime dependencies and no `peerDependencies`.
- **D-57** The package has no build step and no type declarations.
- **D-58** The license is MIT, with `Copyright (c) 2026 Otar Chekurishvili`.
- **D-59** The README lists the tested versions: Vite 8.3 and `@cloudflare/vite-plugin` 1.60.
- **D-60** The library is at the root of the repository. The package manager is npm.

## Process

- **D-61** Phase 1 writes `docs/decisions.md` and `docs/syntax.md`. `docs/decisions.md` lists all decisions with numbers. `docs/syntax.md` shows a complete example project, each export with its signature, the error codes and the rules for files and pairs. Phase 1 writes no implementation.
- **D-62** Phase 2 writes `docs/spec.md`. The spec has numbered requirements, and each requirement has a Given / When / Then check.
- **D-63** Phase 3 writes `src/index.js`, `README.md` and `examples/basic-worker/`. **(detail)** It also writes `LICENSE` and `package.json`.
- **D-64** Phase 4 writes one or more tests for each requirement in `docs/spec.md`. It also writes the checks in D-69 to D-72.
- **D-65** After each phase, the work stops until the user approves the phase.
- **D-66** All work is on the `main` branch. If `main` does not exist, phase 1 creates it. Each phase ends with a push of one commit to `origin main`. **(detail)** If the user asks for changes after a push, a new commit contains the changes. Nobody force-pushes `main`.
- **D-67** The commit author is `Otar Chekurishvili <otar@hey.com>`. Commit messages contain no Claude Code text, for example no `Co-Authored-By` line and no `Claude-Session` line. **(detail)** Code comments and documents also contain no Claude Code text. A commit message starts with a prefix, for example `docs: phase 1 syntax design`.

## Tests (phase 4)

- **D-68** The tests run with Vitest 4.1 and `@cloudflare/vitest-plugin`, in workerd.
- **D-69** A production build test runs `vite build` on `examples/basic-worker/`. It then sends HTTP requests to the built Worker in local workerd.
- **D-70** Istanbul measures the coverage of `src/index.js`. Lines, branches, functions and statements must all have 100% coverage.
- **D-71** The size of `src/index.js` after `esbuild --minify --format=esm` and `gzip -9` must be 1536 bytes or less.
- **D-72** A GitHub Actions workflow runs all tests and checks on each push to `main`, with Node 22.

## Background facts

The decisions above use these facts. The lab tests used wrangler 4.141.0, Vite 8.3.1 with Rolldown 1.2.11, `@cloudflare/vite-plugin` 1.60.2, Vitest 4.1.11, `@cloudflare/vitest-plugin` 1.2.8 and workerd 1.20260925.1. The tests ran in local workerd. They did not run on a Cloudflare deployment.

1. A Worker cannot read folders at runtime. For this reason, the build must find the files.
2. A Vite build transforms `import.meta.glob`. A build with Wrangler only completes without an error, but the Worker then fails at startup.
3. The eager glob returns a plain object. Each property name is a file path, and each property value is the module of that file.
4. The class that a caller imports is the same object (`===`) as the class that the glob supplies. The lab confirmed this in `vite dev`, in a Vite build, in a minified build, in Vitest and for imports through an alias.
5. Class names are not reliable. For `export default class {}`, the name is `__vite_ssr_export_default__` in `vite dev` and Vitest, and `RegisterUser_default` in a Vite build.
6. In a minified build, class names have one letter, and a message class and its handler class can get the same letter. In Node without a bundler, the name is `default`.
7. With eager globs, the Vite build has one chunk and no warnings. All message files and handler files run when the isolate starts.
8. If `configure()` throws at startup, `vite dev` does not start, and workerd does not start the Worker.
9. A handler that imports `command` from the library causes no error at startup.
10. `import { env, waitUntil } from 'cloudflare:workers'` works with the compatibility date `2026-09-01` and no flags.
11. Workers use one isolate for many requests, also for concurrent requests. Module-level state stays from one request to the next.
12. Vitest with `@cloudflare/vitest-plugin` gives each test file a new module state. The tests in one file share the module state.
13. `@cloudflare/vitest-plugin` adds an import of the Worker entry file to the module `cloudflare:test`. As a result, the entry file runs when a test file or a setup file imports `cloudflare:test`. If no file imports `cloudflare:test`, the entry file runs at the first `exports.default.fetch()` in a test file.
14. `vi.resetModules()` in Vitest creates new class objects and a new instance of zeg. After a reset, a class from an earlier import is not equal to the class from a new import.
15. `Object.freeze` throws a `TypeError` on a typed array that has elements. It also throws on a module namespace object.

## History

- **Revision 1** (commit `2484a37`): resolution by class name. The name of a handler file supplied the lookup name, and `message.constructor.name` supplied the message name. The design needed the `keepNames` setting and lazy globs.
- **Revision 2** (the next commit after `2484a37`): pairs by file name in `configure()`, and resolution by class identity. The user chose layout B from the explored options. Layout B has message files and handler files in pairs, and it uses default exports. It has one eager glob for each kind and does all checks in `configure()`.
  - Revision 2 renumbered the IDs from D-09 on. The IDs in this list are the IDs of revision 2.
  - New or changed: the terms, D-07 to D-17, D-19 to D-21, D-25 to D-28, D-35, D-37, D-38, D-40, D-47 to D-49, D-53, D-61 and D-66.
  - Removed rules of revision 1: the named export, the TypeError for anonymous classes, the `keepNames` setting and its hint, the path rule for `Handler.js` only, the error for the same file name in two folders, the lazy load with its retry rule, the rule for errors from a lazy load and the code `INVALID_HANDLER`. The rule for the same message name in both kinds became the rule for the same class in D-37.
  - The background facts 3 to 9 changed for eager globs and class identity. Revision 2 corrected fact 13 and added fact 14.
