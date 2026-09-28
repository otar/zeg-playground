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
- **Key:** the file path of a message file without `.js`, as the glob output supplies it. An example is `./commands/billing/ChargeCard`. **(detail)** With an array, two glob outputs can supply the same key.
- **Plain object:** an object whose prototype is `Object.prototype` or `null`.
- **Array:** a value for which `Array.isArray()` returns `true`.
- **Error text:** the `message` property of an error.

## Scope

- **D-01** Version 1 contains only `zeg()`, `command()`, `query()` and `ZegError`. It has no middleware, no events and no Cloudflare Queues support.
- **D-02** The package exports exactly four names: `zeg`, `command`, `query` and `ZegError`. All four are named exports. The package has no default export.
- **D-03** The library code imports no modules. It uses only standard JavaScript. **(detail)** As a result, it imports no `node:*` module and no `cloudflare:*` module.

## API model

- **D-04** The API has global functions. The project calls the setup function `zeg()` one time, in its Worker entry file, for example `src/index.js`. Each other file that dispatches a message imports `command` or `query` from `'@otar/zeg'`.
- **D-05** The library keeps the handlers in a hidden module-level registry. As a result, each isolate has one registry. The package has no bus object and no `reset()` function.

## Build and discovery

- **D-06** A project that uses zeg must build with Vite and `@cloudflare/vite-plugin`. zeg does not support a build with Wrangler only, because Wrangler does not transform `import.meta.glob`.
- **D-07** The project finds its message files and handler files with the eager form of `import.meta.glob`, that is `{ eager: true }`. The project gives the glob outputs of each kind to `zeg()`. Each glob must find the message files and the handler files of its kind. **(detail)** Vite requires that each glob pattern is a string literal in the source file.
- **D-08** The library does not use class names. Message classes and handler classes can be anonymous or named. A project does not need the `keepNames` setting.

## Files and pairs

- **D-09** The `commands` option supplies the command files, and the `queries` option supplies the query files. Each option is a glob output or an array of glob outputs. One glob can have several patterns, so one glob can find files in several folders. **(detail)** An empty array is valid.
- **D-10** Each file in a glob output must be part of a pair.
- **D-11** A message file `X.js` and a handler file `XHandler.js` in the same folder form a pair. Each message file must have its handler file, and each handler file must have its message file. The file names must match exactly, and the match is case-sensitive. The files can be in subfolders. **(detail)** A message file and its handler file must be in the same glob output. **(detail)** "The same folder" means the same folder in the file paths of the glob output. With the Vite option `base`, these file paths are relative to the base folder (background fact 22). As a result, the handler files can be in a separate folder of the project (`docs/syntax.md` section 3.9).
- **D-12** Files with the same name in different folders form different pairs. For example, `./commands/billing/Charge.js` and `./commands/shop/Charge.js` are valid together.
- **D-13** Each message file and each handler file has a default export. **(detail)** The library reads only the default export. It ignores other exports.
- **D-14** If a command folder or a query folder contains helper files, the project excludes them with a negative glob pattern. An example is `'!**/_*.js'`.
- **D-15** **(detail)** The name of a message file cannot end in `Handler.js`, because the library then treats it as a handler file.

## Resolution

- **D-16** The library finds the handler through the class of the message, not through a name. **(detail)** The class of the message is the message class whose `prototype` is equal to `Object.getPrototypeOf(message)`.
- **D-17** The library uses the key in error texts and to find the handler file.

## Handlers

- **D-18** A handler class has an instance method `handle(message)`. The method gets exactly one argument. **(detail)** It can be sync or async.
- **D-19** `zeg()` checks each handler class. The class must be a function, and `HandlerClass.prototype.handle` must be a function. A `handle()` method that the class inherits from a base class passes this check. A class field such as `handle = () => {}` does not pass.
- **D-20** **(detail)** `zeg()` checks each message class. The class must be a function whose `prototype` is an object.
- **D-21** The library creates a new handler instance for each dispatch, with `new HandlerClass()` and no arguments.
- **D-22** The library gives no context to handlers. When a handler needs `env` or `waitUntil`, it imports them from `'cloudflare:workers'`. A handler cannot get the `Request` object. The caller must put the data that the handler needs into the message.
- **D-23** A handler dispatches another message with `command()` or `query()` from `'@otar/zeg'`.
- **D-24** The library has no guard against recursive dispatch.
- **D-25** **(detail)** A message file or a handler file must not import the Worker entry file. Such an import cycle can cause `undefined` values and no error.
- **D-26** If the top-level code of a message file or a handler file throws, the Worker fails at startup. zeg does not catch this error.

## Messages

- **D-27** These values are not valid messages: `null`, primitives, **(detail)** functions, arrays and plain objects. Instances of anonymous classes are valid.
- **D-28** A subclass is a different class. It needs its own pair. The library does not use the handler of the parent class.

## The message object

- **D-29** The library gives the message to the handler as it is. It does not freeze, copy or change the message. If a message must not change, its message class can freeze the message in the constructor, for example with `Object.freeze(this)`.
- **D-30 to D-34** Revision 3 removed these decisions. They described the deep freeze.

## zeg()

- **D-35** Each call to `zeg()` replaces all handlers. The options `commands` and `queries` are both optional. **(detail)** An option with the value `undefined` is the same as a missing option.
- **D-36** `zeg({})` is valid. It creates an empty registry.
- **D-37** `zeg()` throws a `ZegError` with the code `INVALID_CONFIG` in these cases:
  - **(detail)** The argument is not a plain object.
  - The argument has a property other than `commands` and `queries`.
  - **(detail)** The value of `commands` or `queries` is not a plain object and not an array. An entry of such an array is not a plain object.
  - **(detail)** A value in a glob output is not an object. For example, a lazy glob supplies functions, which are not valid.
  - **(detail)** A file path in a glob output does not end in `.js`.
  - A file has no default export.
  - A message file has no handler file in its folder in the same glob output, or a handler file has no message file in its folder in the same glob output. This includes a helper file that no negative pattern excludes. **(detail)** It also includes a handler file with the name `Handler.js` only.
  - A message class does not pass the check in D-20, or a handler class does not pass the check in D-19.
  - **(detail)** Two message files have the same class as their default export. This applies in one glob output, across the glob outputs of an array and across both kinds. For example, if two globs find the same file, `zeg()` throws this error. Two message classes with the same `prototype` object are also not valid.
- **D-38** `zeg()` runs when the Worker starts (D-04). As a result, an `INVALID_CONFIG` error stops the Worker at startup, and `vite dev` does not start.
- **D-39** `zeg()` checks all options before it changes the registry. If `zeg()` throws, the registry does not change, and the handlers from the previous call stay active.
- **D-40** **(detail)** Two handler files can have the same handler class as their default export.

## Dispatch

- **D-41** `command()` and `query()` always return a Promise. **(detail)** They never throw synchronously.
- **D-42** `command()` resolves to `undefined`. The library ignores the return value of a command handler. It does not throw an error and does not write a warning.
- **D-43** `query()` resolves to the value that the handler returns, after `await`. `null` is a valid value.
- **D-44** If the value from a query handler is `undefined` after `await`, the Promise rejects with the code `UNDEFINED_RESULT`.
- **D-45** If the message is not valid (D-27), the Promise rejects with a `TypeError`.
- **D-46** Until a call to `zeg()` returns without an error, the Promise rejects with the code `NOT_CONFIGURED`.
- **D-47** If the class of the message is not a message class of the correct kind, the Promise rejects with the code `HANDLER_NOT_FOUND`. This includes a class that no glob found and a message of the other kind.
- **D-48** If the message is a message of the other kind, the error text tells the caller to use the other function. **(detail)** The error text names the message file by its key. If the option is an array, the error text also names the position of the glob output in the array, for example `commands[1]`.
- **D-49** If `new HandlerClass()` or `handle()` throws, or if the Promise of `handle()` rejects, the Promise of the dispatch rejects with the same error object. The library does not wrap or change this error.

## Errors

- **D-50** The library uses one error class, `ZegError`. **(detail)** It extends `Error`.
- **D-51** The constructor is public: `new ZegError(code, message)`. It sets `code` and `message`. It does not check the code. The `name` property is always `'ZegError'`.
- **D-52** A `ZegError` has the properties `name`, `code` and `message`. zeg adds no other properties. **(detail)** The `stack` property that the JavaScript engine adds is not part of this rule.
- **D-53** The codes are `INVALID_CONFIG`, `NOT_CONFIGURED`, `HANDLER_NOT_FOUND` and `UNDEFINED_RESULT`.
- **D-54** The class and the code are the API. The error text can change in any version.

## Package

- **D-55** The name of the library is zeg. The npm package is `@otar/zeg`.
- **D-56** `package.json` has `"name": "@otar/zeg"`, `"version": "0.1.0"`, `"type": "module"`, `"exports": "./src/zeg.js"`, `"license": "MIT"` and `"publishConfig": { "access": "public" }`. It has no `"private"` field, so the package is ready to publish. It has no runtime dependencies and no `peerDependencies`.
- **D-57** The package has no build step and no type declarations.
- **D-58** The license is MIT, with `Copyright (c) 2026 Otar Chekurishvili`.
- **D-59** The README lists the tested versions: Vite 8.3 and `@cloudflare/vite-plugin` 1.60.
- **D-60** The library is at the root of the repository. The package manager is npm.

## Process

- **D-61** Phase 1 writes `docs/decisions.md` and `docs/syntax.md`. `docs/decisions.md` lists all decisions with numbers. `docs/syntax.md` shows a complete example project, each export with its signature, the error codes and the rules for files and pairs. Phase 1 writes no implementation.
- **D-62** Phase 2 writes `docs/spec.md`. The spec has numbered requirements, and each requirement has a Given / When / Then check.
- **D-63** Phase 3 writes `src/index.js` (since revision 6: `src/zeg.js`), `README.md` and `examples/basic-worker/`. **(detail)** It also writes `LICENSE` and `package.json`.
- **D-64** Phase 4 writes one or more tests for each requirement in `docs/spec.md`. It also writes the checks in D-69 to D-72.
- **D-65** After each phase, the work stops until the user approves the phase.
- **D-66** All work is on the `main` branch. If `main` does not exist, phase 1 creates it. Each phase ends with a push of one commit to `origin main`. **(detail)** If the user asks for changes after a push, a new commit contains the changes. Nobody force-pushes `main`.
- **D-67** The commit author is `Otar Chekurishvili <otar@hey.com>`. Commit messages contain no Claude Code text, for example no `Co-Authored-By` line and no `Claude-Session` line. **(detail)** Code comments and documents also contain no Claude Code text. A commit message starts with a prefix, for example `docs: phase 1 syntax design`.

## Tests (phase 4)

- **D-68** The unit tests run with Vitest 4.1 and `@cloudflare/vitest-plugin`, in workerd. **(detail)** The build tests and the static checks run in Node, because they start processes and read files.
- **D-69** A production build test runs `vite build` on `examples/basic-worker/`. It then sends HTTP requests to the built Worker in local workerd.
- **D-70** Istanbul measures the coverage of `src/zeg.js`. Lines, branches, functions and statements must all have 100% coverage.
- **D-71** The size of `src/zeg.js` after `esbuild --minify --format=esm` and `gzip -9` must be 1536 bytes or less.
- **D-72** A GitHub Actions workflow runs all tests and checks, except the mutation tests (D-75), on each push to `main`, with Node 22.

## Tooling (revision 5)

- **D-73** The repository has no `.npmrc` file, so npm checks the peer dependencies of each package. `package.json` has no `overrides` field. `devDependencies` lists only the packages that the project uses directly. **(detail)** npm 10 cannot resolve the dependencies without a lockfile (background fact 19). For this reason, a change to the dependencies or to `package-lock.json` must use npm 11.6 or later. CI uses `npm ci`, which works with npm 10.
- **D-74** Prettier formats the JavaScript, JSON, YAML and Markdown files. ESLint checks the JavaScript files and the JavaScript code blocks in the Markdown files. The ESLint rule `curly` with the option `all` requires braces for the body of each `if`, `else`, `for`, `while` and `do` statement (background fact 20).
  - **(detail)** The layout has 2 spaces, single quotes, semicolons, trailing commas and a line width of 100. `npm run lint` checks the style, and `npm run lint:fix` corrects it. A static check runs the same tools, so `npm test` and CI fail if the style is not correct. `package.json` gives an exact version for Prettier, because a new version can change the layout.
- **D-75** The mutation tests are optional, and CI does not run them. `npm run test:mutation` fails if the mutation score is below 100%. `npm run test:mutation` runs Stryker with `@stryker-mutator/vitest-runner` (background fact 21). Stryker changes only `src/zeg.js`, and it runs only the unit tests, in workerd.
  - **(detail)** `vitest.mutation.config.js` contains only the unit project of `vitest.config.js`. For each mutant, Stryker runs only the unit tests that cover the mutant. The REQ-113 tests depend on the order of the tests in their file, but they cover no mutant. The report is `reports/mutation/mutation.html`, and the temporary copies are in `.stryker-tmp/`. Git, Prettier and ESLint ignore the two folders.

## Background facts

The decisions above use these facts. The lab tests used wrangler 4.141.0, Vite 8.3.1 with Rolldown 1.2.11, `@cloudflare/vite-plugin` 1.60.2, Vitest 4.1.11, `@cloudflare/vitest-plugin` 1.2.8 and workerd 1.20260925.1. The tests ran in local workerd. They did not run on a Cloudflare deployment.

1. A Worker cannot read folders at runtime. For this reason, the build must find the files.
2. A Vite build transforms `import.meta.glob`. A build with Wrangler only completes without an error, but the Worker then fails at startup.
3. The eager glob returns a plain object. Each property name is a file path, and each property value is the module of that file.
4. The class that a caller imports is the same object (`===`) as the class that the glob supplies. The lab confirmed this in `vite dev`, in a Vite build, in a minified build, in Vitest and for imports through an alias.
5. Class names are not reliable. For `export default class {}`, the name is `__vite_ssr_export_default__` in `vite dev` and Vitest, and `RegisterUser_default` in a Vite build.
6. In a minified build, class names have one letter, and a message class and its handler class can get the same letter. In Node without a bundler, the name is `default`.
7. With eager globs, the Vite build has one chunk and no warnings. All message files and handler files run when the isolate starts.
8. If `zeg()` throws at startup, `vite dev` does not start, and workerd does not start the Worker.
9. A handler that imports `command` from the library causes no error at startup.
10. `import { env, waitUntil } from 'cloudflare:workers'` works with the compatibility date `2026-09-01` and no flags.
11. Workers use one isolate for many requests, also for concurrent requests. Module-level state stays from one request to the next.
12. Vitest with `@cloudflare/vitest-plugin` gives each test file a new module state. The tests in one file share the module state.
13. `@cloudflare/vitest-plugin` adds an import of the Worker entry file to the module `cloudflare:test`. As a result, the entry file runs when a test file or a setup file imports `cloudflare:test`. If no file imports `cloudflare:test`, the entry file runs at the first `exports.default.fetch()` in a test file.
14. `vi.resetModules()` in Vitest creates new class objects and a new instance of zeg. After a reset, a class from an earlier import is not equal to the class from a new import.
15. Revision 3 removed this fact. It described `Object.freeze` errors for typed arrays and module namespace objects.
16. One `import.meta.glob` call accepts an array of patterns, including negative patterns. As a result, one glob can find files in several folders.
17. Each glob supplies file paths relative to the file that contains it. As a result, two globs in different files can supply the same file path. If a project merges them with `{ ...a, ...b }`, the merge loses entries, and no error occurs. In the lab, 6 files became 4 entries.
18. The deep freeze of revision 2 needed 22 ms for a message with an array of 10,000 plain objects. This test ran in Node 22, which uses V8, the same engine as workerd. The Workers Free plan allows 10 ms of CPU time for each request. The deep-freeze code of the lab prototype was 128 bytes after minify and gzip.
19. npm 10.9 stops with the error `Cannot read properties of null (reading 'edgesOut')` when it resolves the development dependencies without a lockfile. The cause is an optional peer dependency `vitest: "*"`. It comes from `vite` 8 through `@vitejs/devtools` and `@vitejs/devtools-vitest`. Since 2026-09-03, the range `*` selects vitest 5, and npm 10 then stops with this error. npm 11.6.0 contains the fix, but npm 10 does not. With an existing lockfile, `npm ci` and `npm install` work with npm 10.
20. StandardJS, Airbnb and Google set the ESLint rule `curly` to `multi-line`. This setting allows `if (x) doSomething();`. Of the widely used style guides, only XO requires braces, but XO uses tabs and adds many other rules. Prettier does not add or remove braces. `eslint --fix` with `curly: 'all'` adds the braces safely. Biome marks the fix of its rule `useBlockStatements` as unsafe, and in a test this fix wrote a file that did not parse.
21. Stryker 10.0.0 with `@stryker-mutator/vitest-runner` runs the unit tests in workerd, because `@cloudflare/vitest-plugin` sets its own test pool. This runner always selects the tests for each mutant by coverage, and the setting `coverageAnalysis` has no effect on it. The command runner of Stryker does not work with workerd, because the active mutant does not reach workerd. With it, all mutants survive. On 2026-09-28, Stryker made 200 mutants of `src/zeg.js`, and the tests killed all 200 (a mutation score of 100%). The run needed 2 minutes.
22. Vite 8.3.1 supports the option `base` of `import.meta.glob`. With `base`, each file path of the glob output is relative to the base folder, for example `./RegisterUser.js` and `./billing/ChargeCard.js`. The base folder must start with `/`, `./` or `../`. A base folder that starts with `./` or `../` is relative to the file that contains the glob. A base folder that starts with `/` is relative to the project root. Vite 8.3.1 has two implementations of the glob transform: one for `vite dev` and Vitest, and one in Rolldown for a build. The lab got the same file paths in `vite dev`, in a Vite build and in Vitest with workerd. On 2026-09-28, the example Worker with the folders and the globs of `docs/syntax.md` section 3.9 worked in `vite dev` and in `vite preview` after a build, without a change to the library.

## History

- **Revision 1** (commit `2484a37`): resolution by class name. The name of a handler file supplied the lookup name, and `message.constructor.name` supplied the message name. The design needed the `keepNames` setting and lazy globs.
- **Revision 2** (the next commit after `2484a37`): pairs by file name in `configure()`, and resolution by class identity. The user chose layout B from the explored options. Layout B has message files and handler files in pairs, and it uses default exports. It has one eager glob for each kind and does all checks in `configure()`.
  - Revision 2 renumbered the IDs from D-09 on. The IDs in this list are the IDs of revision 2.
  - New or changed: the terms, D-07 to D-17, D-19 to D-21, D-25 to D-28, D-35, D-37, D-38, D-40, D-47 to D-49, D-53, D-61 and D-66.
  - Removed rules of revision 1: the named export, the TypeError for anonymous classes, the `keepNames` setting and its hint, the path rule for `Handler.js` only, the error for the same file name in two folders, the lazy load with its retry rule, the rule for errors from a lazy load and the code `INVALID_HANDLER`. The rule for the same message name in both kinds became the rule for the same class in D-37.
  - The background facts 3 to 9 changed for eager globs and class identity. Revision 2 corrected fact 13 and added fact 14.
- **Revision 3** (the next commit after `1e7eec6`): the user asked for three improvements.
  - The setup function `configure()` became `zeg()`, and the error class `CqrsError` became `ZegError`. The new names are specific to zeg. This changed D-01, D-02, D-04, D-07, D-19, D-20, D-35 to D-39, D-46, D-50 to D-52 and background fact 8.
  - Each option accepts a glob output or an array of glob outputs. This changed D-07, D-09, D-11, D-37, D-48 and the term Key.
  - The library no longer freezes the message (D-29). Revision 3 removed D-30 to D-34 and the deep-freeze detail of D-21. Deep freeze also froze nested objects that other code can share with the caller. It also cost CPU time and code size (background fact 18).
  - Revision 3 kept all other IDs. It removed background fact 15 and added facts 16 to 18.
- **Revision 4** (phase 2): the spec showed that a build test cannot run in workerd, because it starts `vite` processes. Revision 4 limited D-68 to the unit tests. The build tests and the static checks run in Node. All IDs stay the same.
- **Revision 5** (after phase 4): the user asked for three changes.
  - The repository no longer uses the npm setting `legacy-peer-deps`. Revision 5 added D-73 and background fact 19.
  - The code has braces on all statements, and Prettier and ESLint check the style. Revision 5 added D-74 and background fact 20. The spec added REQ-134.
  - The repository has optional mutation tests with Stryker. Revision 5 added D-75 and background fact 21, and it changed D-72. The spec changed REQ-133 and rule 8 of section 1.5. The mutation tests found a gap in the test of REQ-041, so REQ-041 now also lists `null` and `{ prototype: {} }`.
- **Revision 6** (after revision 5): the user asked for six changes.
  - The library file `src/index.js` became `src/zeg.js`, because `index.js` is also the name of the Worker entry file of a user project and of the example. This changed D-56, D-63 (a note), D-70, D-71, D-75 and background fact 21. The spec changed rule 4 and rule 8 of section 1.5, REQ-002, REQ-003, REQ-006, REQ-131, REQ-132 and spec detail 24. In `docs/syntax.md` section 3.8, the glob files of the feature folders became `globs.js`.
  - The REQ-122 build test stops when the Vite process stops, because a stopped process cannot answer. The spec changed REQ-122.
  - A simpler `src/zeg.js` with the same behavior: one registry Map for both kinds, one list of glob outputs, and the check of Z6 in the loop of Z5. The spec changed the notes of section 2 and the S4 row.
  - The tests check the start of each error text, and `npm run test:mutation` fails below a mutation score of 100%. `src/zeg.js` no longer has a separate check for a file without a default export, and it calculates each key one time. This changed D-17, D-75 and background fact 21. The spec changed rule 8 of section 1.5, REQ-056, REQ-061, REQ-113 and spec detail 20, and it added spec detail 25.
  - The handler files can be in a separate folder, for example `src/command-handlers/`, without a change to the library. A project uses two globs with the Vite option `base` and merges the two glob outputs with a spread (`docs/syntax.md` section 3.9). This changed D-11 and added background fact 22. The spec added REQ-034 and the fixtures in `test/fixtures/split/`.
