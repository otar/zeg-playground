# zeg: decisions

This file lists the decisions for zeg, a small CQRS library for Cloudflare Workers. Each decision has an ID. `docs/syntax.md` and the later documents refer to these IDs.

The user made these decisions in the clarification rounds and in the review of the phase 1 draft. Some decisions add an exact detail to an answer of the user. These decisions have the mark **(detail)**. The user approves them with phase 1.

To change a decision, change this file first. Then update the documents that refer to it.

## Terms

- **Message:** an instance of a class that the caller gives to `command()` or `query()`, for example `new RegisterUser(email)`.
- **Kind:** command or query.
- **Dispatch:** one call to `command()` or `query()`.
- **Message name:** the value of `message.constructor.name`.
- **Handler key:** the file name of a handler without `Handler.js`.
- **Plain object:** an object whose prototype is `Object.prototype` or `null`.
- **Array:** a value for which `Array.isArray()` returns `true`.
- **Error text:** the `message` property of an error.

## Scope

- **D-01** Version 1 contains only `configure()`, `command()`, `query()` and `CqrsError`. It has no middleware, no events and no Cloudflare Queues support.
- **D-02** The package exports exactly four names: `configure`, `command`, `query` and `CqrsError`.
- **D-03** The library code imports no modules. It uses only standard JavaScript. **(detail)** As a result, it imports no `node:*` module and no `cloudflare:*` module.

## API model

- **D-04** The API has global functions. The project calls `configure()` one time, in its Worker entry file, for example `src/index.js`. Every other file imports `command` and `query` from `'@otar/zeg'`.
- **D-05** The library keeps the handlers in a hidden module-level registry. As a result, each isolate has one registry. The package has no bus object and no `reset()` function.

## Build and discovery

- **D-06** A project that uses zeg must build with Vite and `@cloudflare/vite-plugin`. zeg does not support a build with Wrangler only, because Wrangler does not transform `import.meta.glob`.
- **D-07** The project finds its handlers with the lazy form of `import.meta.glob`. The project writes the globs in its call to `configure()`. **(detail)** Vite requires that each glob pattern is a string literal in the source file.
- **D-08** The project must set `build.rolldownOptions.output.keepNames` to `true` in `vite.config.js`. Without this setting, a Vite build can rename a class, for example `RegisterUser` to `RegisterUser$1`.

## Names and kinds

- **D-09** The glob in the `commands` option supplies the command handlers. The glob in the `queries` option supplies the query handlers.
- **D-10** The handler key is the file name of the handler without `Handler.js`. The class name of the handler does not change the key. Handler files can be in subfolders, and the folder names do not change the key. For example, `./commands/billing/ChargeCardHandler.js` has the key `ChargeCard`.
- **D-11** The key comparison is exact and case-sensitive.
- **D-12** A handler runs when its key is equal to the message name.
- **D-13** A handler file exports its handler class with a named export. The export name is the file name without `.js`, for example `export class RegisterUserHandler`.

## Handlers

- **D-14** A handler class has an instance method `handle(message)`. The method gets exactly one argument. **(detail)** It can be sync or async.
- **D-15** The library checks a handler class at the first dispatch to it. The export must be a function, and `Export.prototype.handle` must be a function. A `handle()` method that the class inherits from a base class passes this check. A class field such as `handle = () => {}` does not pass.
- **D-16** The library creates a new handler instance for each dispatch, with `new Handler()` and no arguments.
- **D-17** The library loads a handler file at the first dispatch to that handler. After the class passes the check, the library keeps the class for later dispatches. If the load or the check fails, the library keeps nothing, and the next dispatch loads the file again. Two first dispatches at the same time can each load the file.
- **D-18** The library passes no context to handlers. A handler imports `env` and `waitUntil` from `'cloudflare:workers'` when it needs them. A handler cannot get the `Request` object. The caller must put the data that the handler needs into the message.
- **D-19** A handler dispatches another message with `command()` or `query()` from `'@otar/zeg'`.
- **D-20** The library has no guard against recursive dispatch.

## Messages

- **D-21** A message must be an instance of a named class. These values are not valid: plain objects, **(detail)** arrays, `null`, primitives and instances of anonymous classes. An anonymous class has the name `''`.
- **D-22** A subclass does not use the handler of its parent class. The library uses only the name of the class of the message to find the handler.

## Deep freeze

- **D-23** The library deep-freezes the message immediately before `handle()` runs. It freezes the message itself. Then it walks nested plain objects and nested arrays and freezes them.
- **D-24** Deep freeze does not change other nested objects, and it does not walk them. Examples are class instances, `Map`, `Set`, `Date`, typed arrays, `Request` and streams.
- **D-25** Deep freeze walks string keys and symbol keys. It also walks keys that are not enumerable. It reads only data properties and does not call getters. It walks each object one time, so circular references do not cause an infinite loop. It also walks objects that are already frozen.
- **D-26** Deep freeze applies to `command()` and to `query()`. If the dispatch stops before deep freeze starts, the message does not change.
- **D-27** **(detail)** If `Object.freeze` throws during deep freeze, the Promise rejects with that error, and `handle()` does not run. The objects that were frozen before the error stay frozen.
- **D-28** The caller's message object stays frozen after the dispatch.

## configure()

- **D-29** Each call to `configure()` replaces all handlers. The options `commands` and `queries` are both optional.
- **D-30** `configure({})` is valid. It creates an empty registry.
- **D-31** `configure()` throws a `CqrsError` with the code `INVALID_CONFIG` in these cases:
  - The argument is not an object.
  - The argument has a key other than `commands` and `queries`.
  - The value of `commands` or `queries` is not an object.
  - A glob value is not a function.
  - A glob path does not end in `Handler.js`. **(detail)** A file name that is only `Handler.js` is also not valid.
  - One kind has two files with the same name in different folders.
  - The same message name has a command handler and a query handler.
- **D-32** `configure()` checks all options before it changes the registry. If `configure()` throws, the registry does not change, and the handlers from the previous call stay active.

## Dispatch

- **D-33** `command()` and `query()` always return a Promise. **(detail)** They never throw synchronously.
- **D-34** `command()` resolves to `undefined`. The library discards the return value of a command handler silently. It gives no error and no warning.
- **D-35** `query()` resolves to the value that the handler returns, after `await`. `null` is a valid value.
- **D-36** If the value from a query handler is `undefined` after `await`, the Promise rejects with the code `UNDEFINED_RESULT`.
- **D-37** If the message is not valid (D-21), the Promise rejects with a `TypeError`.
- **D-38** Until a call to `configure()` returns without an error, the Promise rejects with the code `NOT_CONFIGURED`.
- **D-39** If no handler of the correct kind has the message name as its key, the Promise rejects with the code `HANDLER_NOT_FOUND`.
- **D-40** The error text of `HANDLER_NOT_FOUND` contains a hint in two cases:
  - If the other kind has a handler for the name, the text tells the caller to use the other function.
  - If the message name ends in `$` and one or more digits, the text names the `keepNames` setting.
- **D-41** If the handler module has no export whose name is the file name without `.js`, the Promise rejects with the code `INVALID_HANDLER`. If the export does not pass the check in D-15, the Promise also rejects with `INVALID_HANDLER`.
- **D-42** If `handle()` throws or its Promise rejects, the Promise of the dispatch rejects with the same error object. If the load of a handler file fails, the Promise also rejects with the same error object. The library does not wrap or change these errors.

## Errors

- **D-43** The library uses one error class, `CqrsError`. **(detail)** It extends `Error`.
- **D-44** The constructor is public: `new CqrsError(code, message)`. It sets `code` and `message`. It does not check the code. The `name` property is always `'CqrsError'`.
- **D-45** A `CqrsError` has the properties `name`, `code` and `message`. zeg adds no other properties. The `stack` property that the JavaScript engine adds is not part of this rule.
- **D-46** The codes are `INVALID_CONFIG`, `NOT_CONFIGURED`, `HANDLER_NOT_FOUND`, `INVALID_HANDLER` and `UNDEFINED_RESULT`.
- **D-47** The class and the code are the API. The error text can change in any version.

## Package

- **D-48** The name of the library is zeg. The npm package is `@otar/zeg`.
- **D-49** `package.json` has `"name": "@otar/zeg"`, `"version": "0.1.0"`, `"type": "module"`, `"exports": "./src/index.js"`, `"license": "MIT"` and `"publishConfig": { "access": "public" }`. It has no `"private"` field, so the package is ready to publish. It has no runtime dependencies and no `peerDependencies`.
- **D-50** The package has no build step and no type declarations.
- **D-51** The license is MIT, with `Copyright (c) 2026 Otar Chekurishvili`.
- **D-52** The README lists the tested versions: Vite 8.3 and `@cloudflare/vite-plugin` 1.60.
- **D-53** The library is at the root of the repository. The package manager is npm.

## Process

- **D-54** Phase 1 writes `docs/decisions.md` and `docs/syntax.md`. `docs/decisions.md` lists all decisions with numbers. `docs/syntax.md` shows a complete example project, each export with its signature, the error codes and the rules for names and folders. Phase 1 writes no implementation.
- **D-55** Phase 2 writes `docs/spec.md`. The spec has numbered requirements, and each requirement has a Given / When / Then check.
- **D-56** Phase 3 writes `src/index.js`, `README.md` and `examples/basic-worker/`. **(detail)** It also writes `LICENSE` and `package.json`.
- **D-57** Phase 4 writes one or more tests for each requirement in `docs/spec.md`. It also writes the checks in D-62 to D-65.
- **D-58** After each phase, the work stops until the user approves the phase.
- **D-59** All work is on the `main` branch. Phase 1 creates `main`. Each phase gets one commit, which goes to `origin main`. If the user asks for changes after a push, the changes go into a new commit. Nobody force-pushes `main`.
- **D-60** The commit author is `Otar Chekurishvili <otar@hey.com>`. Commit messages, code comments and documents contain no Claude Code text, for example no `Co-Authored-By` line and no `Claude-Session` line. A commit message starts with a prefix, for example `docs: phase 1 syntax design`.

## Tests (phase 4)

- **D-61** The tests run with Vitest 4.1 and `@cloudflare/vitest-plugin`, in workerd.
- **D-62** A production build test runs `vite build` on `examples/basic-worker/`. It then sends HTTP requests to the built Worker in local workerd.
- **D-63** Istanbul measures the coverage of `src/index.js`. Lines, branches, functions and statements must all have 100% coverage.
- **D-64** The size of `src/index.js` after `esbuild --minify --format=esm` and `gzip -9` must be 1536 bytes or less.
- **D-65** A GitHub Actions workflow runs all tests and checks on each push to `main`, with Node 22.

## Background facts

The decisions above use these facts. The lab tests used wrangler 4.141.0, Vite 8.3.1 with Rolldown 1.2.11, `@cloudflare/vite-plugin` 1.60.2, Vitest 4.1.11, `@cloudflare/vitest-plugin` 1.2.8 and workerd 1.20260925.1. The tests ran in local workerd. They did not run on a Cloudflare deployment.

1. A Worker cannot read folders at runtime. For this reason, handler discovery must occur at build time.
2. A Vite build transforms `import.meta.glob`. A build with Wrangler only completes without an error, but the Worker then fails at startup.
3. The lazy glob returns an object. Each key is a file path, and each value is a function that loads the file.
4. A default Vite 8 build does not minify the Worker. But Rolldown renames a class when the output file has another top-level name that is the same as the class name. An example is `RegisterUser$1`.
5. `vite dev` does not show the problem in fact 4. The `keepNames` setting keeps the original class names, also with minification. The lab confirmed that the setting applies to the Worker build.
6. A build that minifies without `keepNames` changes a class name to a short name, for example `r`.
7. Export names do not change in a Vite build, also with minification.
8. A handler that the library loads lazily can import `command` from the library without an error at startup.
9. `import { env, waitUntil } from 'cloudflare:workers'` works with the compatibility date `2026-09-01` and no flags.
10. Workers use one isolate for many requests, also for concurrent requests. Module-level state stays from one request to the next.
11. Vitest with `@cloudflare/vitest-plugin` gives each test file a new module state. The tests in one file share the module state.
12. If the Wrangler configuration has `main`, `@cloudflare/vitest-plugin` loads that module for each test file.
13. `Object.freeze` throws a `TypeError` on a typed array that has elements. It also throws on a module namespace object.
