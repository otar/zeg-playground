# Zeg

[![test](https://github.com/otar/zeg-playground/actions/workflows/test.yml/badge.svg)](https://github.com/otar/zeg-playground/actions/workflows/test.yml) [![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE) ![gzip: < 2 KB](https://img.shields.io/badge/gzip-%3C%202%20KB-blue)

Simple, opinionated CQRS for Cloudflare Workers. Zeg is one JavaScript file with 4 exports and no dependencies.

## The whole flow

A command writes a user, and a query reads the user.

```jsx
// src/index.js
import { Zeg, command, query } from '@otar/zeg';
import RegisterUser from './commands/RegisterUser.js';
import GetUser from './queries/GetUser.js';

Zeg({
  commands: import.meta.glob('./commands/**/*.js', { eager: true }),
  queries: import.meta.glob('./queries/**/*.js', { eager: true }),
});

export default {
  async fetch(request) {
    const { email } = await request.json();
    await command(new RegisterUser(email));
    return Response.json(await query(new GetUser(email)));
  },
};

// src/commands/RegisterUser.js
export default class {
  constructor(email) {
    this.email = email;
  }
}

// src/commands/RegisterUserHandler.js
import { users } from '../store.js';

export default class {
  handle(message) {
    users.set(message.email, { email: message.email });
  }
}

// src/queries/GetUser.js
export default class {
  constructor(email) {
    this.email = email;
  }
}

// src/queries/GetUserHandler.js
import { users } from '../store.js';

export default class {
  handle(message) {
    return users.get(message.email) ?? null;
  }
}

// src/store.js
export const users = new Map();
```

For a POST request with the body `{"email":"ada@example.com"}`, the Worker returns `{"email":"ada@example.com"}`.

The `users` Map is in the memory of one isolate, so this example is only a demo.

## Why Zeg

**What CQRS means here.** A command changes state and returns nothing. A query reads data and returns a value. Each message class has one handler class. Zeg has no events, no event sourcing and no separate read store. For a side effect after a command, the command handler dispatches another command.

**Why not a plain function call.**

- The caller imports only the message class. It does not import the handler or the modules that the handler uses.
- A test can replace a handler. It calls `Zeg()` with a hand-written glob output (section 7.3 of `docs/syntax.md`).
- The cost: each use case has one more file. "Go to definition" on `command(new X())` opens the message class, not the handler.

**When not to use Zeg.**

- The Worker has only a few routes, and a function call is sufficient.
- You need events or a queue integration. Zeg does not have them.
- You build the Worker with Wrangler only. Zeg needs Vite.

## Install

```sh
npm install @otar/zeg
```

## Opinions

- **Pairs by file name.** `X.js` and `XHandler.js` in the same folder form a pair. `.ts` files work the same way.
- **Default export only.** Zeg reads only the default export of each file that a glob finds. This export must be a class.
- **No registration.** Vite finds the files at build time, so you do not register handlers.
- **Classes, not names.** Zeg finds the handler through the class of the message. The classes can be anonymous.
- **Only queries return values.** `command()` resolves to `undefined`. `query()` resolves to the value from the handler or from the first middleware function. It rejects if that value is `undefined`.
- **Errors at startup.** Zeg checks all pairs when the Worker starts. A failed check stops the Worker before the first request.
- **No build step.** The package contains the source file `src/zeg.js`, not a built file. It also contains the type declarations in `src/zeg.d.ts`. After esbuild minifies `src/zeg.js` and gzip compresses it, its size is less than 2 KB.

## Requirements

- The project builds with Vite and `@cloudflare/vite-plugin`. Zeg does not support a build with Wrangler only, because Wrangler does not transform `import.meta.glob`.
- Message files and handler files can be `.js` files or `.ts` files. For TypeScript, see section 3.10 of `docs/syntax.md`.
- The tested versions are Vite 8.3 and `@cloudflare/vite-plugin` 1.60.
- Zeg needs no other Vite settings and no compatibility flags.

## Full example

The folder `examples/basic-worker/` contains a complete Worker with a D1 database. To run it, do these steps:

1. In `examples/basic-worker/`, run `npm install`.
2. Run `npm run migrate` to create the local database.
3. Run `npm run dev`.

## API

```js
import { Zeg, command, query, ZegError } from '@otar/zeg';
```

| Export | Description |
| --- | --- |
| `Zeg(options)` | Sets the pairs of message classes and handler classes. `options.commands` and `options.queries` are each a glob output or an array of glob outputs. `options.middleware` is an array of middleware functions. Each call replaces all pairs and all middleware functions. Returns `undefined`. |
| `command(message)` | Dispatches a command. Returns a Promise that resolves to `undefined`. |
| `query(message)` | Dispatches a query. Returns a Promise that resolves to the value from the handler. With middleware functions, the Promise resolves to the value from the first middleware function. |
| `ZegError` | The error class of Zeg. It has the properties `name` (`'ZegError'`), `code` and `message`. |

### Types in the editor

The package contains type declarations in `src/zeg.d.ts`. TypeScript generates this file from the JSDoc docblocks of `src/zeg.js`. An editor shows the descriptions and the types of the four exports.

- A TypeScript project needs the `moduleResolution` value `bundler`, `node16` or `nodenext`.
- In a JavaScript project with `checkJs`, the editor reports some incorrect calls as errors, for example `command('RegisterUser')`. Zeg also does all its checks at runtime.
- In TypeScript, a query message class can state its result type: `declare readonly result?: User`. Then `query(message)` has the type `Promise<User>`.
- Without this property, the result type of `query()` is `unknown`. In TypeScript, write `query<User>(message)`. In JavaScript, write `/** @type {User} */` before the variable.
- For a middleware function in TypeScript, use the type `Middleware`, for example `import type { Middleware } from '@otar/zeg'`.

## Middleware

A middleware function runs around the handler of each dispatch. Use it for work that many handlers need, for example a log, a check of the message or an error report.

```js
// src/middleware/logDispatch.js
export async function logDispatch(message, next, { kind, key }) {
  console.log(`${kind} ${key}`); // for example "command ./commands/RegisterUser"
  try {
    return await next();
  } catch (error) {
    console.error(`${kind} ${key} failed`, error);
    throw error;
  }
}
```

```js
// src/index.js
import { Zeg } from '@otar/zeg';
import { logDispatch } from './middleware/logDispatch.js';

Zeg({
  commands: import.meta.glob('./commands/**/*.js', { eager: true }),
  queries: import.meta.glob('./queries/**/*.js', { eager: true }),
  middleware: [logDispatch],
});
```

- `next()` runs the next middleware function, or the handler after the last function. For a query, it resolves to the result. For a command, it resolves to `undefined`.
- The first function in the array is the outermost.
- A middleware function can change the result of a query. It can stop a dispatch: it throws, or it returns without a call to `next()`.
- Call `next()` one time. A second call rejects with `NEXT_CALLED_TWICE`.
- Put the middleware files outside the folders of the globs. Each file that a glob finds must be part of a pair.
- Section 3.11 of `docs/syntax.md` has all rules for middleware functions.

### Recipes

`docs/syntax.md` shows three recipes with middleware functions. A recipe is code of your project. It needs no change to Zeg.

| Recipe | What it does | Section |
| --- | --- | --- |
| Tracing | Each dispatch becomes a span in Workers tracing. A nested dispatch becomes a span inside the span of its caller. | 3.12 |
| Background commands | A command class with `static background = true` runs in the background. The caller does not wait for its handler. | 3.13 |
| Test of a nested dispatch | A test records each dispatch and skips the commands that it names. | 7.6 |

The example Worker uses the tracing recipe and the background recipe.

## Rules

Rules for the files:

- Each file that a glob finds must be part of a pair. To exclude files that are not part of a pair, add a negative pattern to the glob, for example `['./commands/**/*.js', '!**/_*.js']`.
- A handler file name is the name of the message file without its extension, plus `Handler` and the same extension, for example `RegisterUserHandler.ts`. The names are case-sensitive.
- A message file and its handler file must be in the same folder and in the same glob output.
- The handler files can be in a separate folder of the project, for example `src/command-handlers/`. The Vite option `base` then makes the file paths in the glob output match. Section 3.9 of `docs/syntax.md` shows the globs.
- Files with the same name in different folders form different pairs.

Rules for the handlers:

- Zeg creates a new handler instance for each dispatch, with no arguments.
- `handle(message)` can be sync or async. It gets the message itself.
- Zeg gives no context to handler classes. If a handler needs `env` or `waitUntil`, its handler file imports them from `'cloudflare:workers'`.
- A handler can dispatch another message with `command()` or `query()`.
- A query handler must not return `undefined`. It can return `null`.

Rules for the messages:

- A message must be an instance of a class. It must not be an array or a plain object.
- Zeg does not freeze, copy or change the message.
- A subclass is a different class. It needs its own pair.
- A command returns nothing. To give the caller a new ID, create the ID in the message constructor, for example with `crypto.randomUUID()`.

## Errors

| Code | Source | Cause |
| --- | --- | --- |
| `INVALID_CONFIG` | `Zeg()` throws | The options, the files, the pairs or the classes are not valid. |
| `NOT_CONFIGURED` | The Promise rejects | No call to `Zeg()` returned before the dispatch. |
| `HANDLER_NOT_FOUND` | The Promise rejects | The class of the message has no pair of this kind. If it is a message of the other kind, the error text tells you to use the other function. |
| `UNDEFINED_RESULT` | The Promise of `query()` rejects | The query handler or a middleware function returned `undefined`. |
| `NEXT_CALLED_TWICE` | The Promise of the second `next()` rejects | A middleware function called `next()` a second time. |

If the message is `null`, a primitive, a function, an array or a plain object, the Promise rejects with a `TypeError`. If a handler constructor, `handle()` or a middleware function throws, the Promise rejects with the same value.

`Zeg()` runs when the Worker starts. As a result, an `INVALID_CONFIG` error stops the Worker at startup, and `vite dev` does not start.

## Versioning

Zeg follows semantic versioning. The API is the four exports, the option names, the rules for files and pairs, the class `ZegError` and its codes. The error texts are not part of the API. Before version 1.0.0, a new minor version can change the API. `CHANGELOG.md` lists the changes.

## Tests

To run the tests of Zeg, do these steps in the repository root:

1. Run `npm ci`.
2. Run `npm test`. This command runs all tests and checks, except the coverage check and the mutation tests. It also checks the style of the code (see below) and the types in the docblocks, with TypeScript 7.
3. Run `npm run coverage`. This command runs the unit tests with Istanbul and checks that the coverage of `src/zeg.js` is 100%.

The unit tests run in workerd with Vitest and `@cloudflare/vitest-plugin`. The build tests and the static checks run in Node. The build tests install the packages of `examples/basic-worker/` in a temporary folder, so they need access to the npm registry. To run only the unit tests, run `npm run test:unit`.

GitHub Actions runs these commands on each push to `main`.

Prettier sets the layout of the code. ESLint finds code that is hard to read or that can be wrong. The body of each `if`, `else`, `for`, `while` and `do` statement must have braces.

- To check the style, run `npm run lint`.
- To correct the style, run `npm run lint:fix`.

If you change a docblock in `src/zeg.js`, run `npm run types`. This command writes `src/zeg.d.ts` again. A static check fails if `src/zeg.d.ts` is not up to date.

To change the dependencies, use npm 11.6 or later, for example `npx npm@11 install`. npm 10 cannot resolve the dependencies without a lockfile (background fact 19 in `docs/decisions.md`).

### Mutation tests

The mutation tests are optional, and GitHub Actions does not run them. Stryker makes small changes (mutants) in `src/zeg.js`. For each mutant, it runs the unit tests in workerd. If a test fails, the test kills the mutant. If no test fails, the mutant survives. A mutant that survives shows a gap in the tests.

To run the mutation tests, do these steps:

1. Run `npm run test:mutation`. The command needs 2 to 3 minutes.
2. Open `reports/mutation/mutation.html` in a browser.

If one or more mutants survive, the command fails (D-75).

To make the next runs faster, use `npm run test:mutation -- --incremental`. The first run with `--incremental` tests all mutants and writes `reports/stryker-incremental.json`. The next runs with `--incremental` test only the changed mutants and the mutants of the changed tests. Stryker does not see changes in the test helpers, the fixtures or the configuration. After such a change, run `npm run test:mutation` without `--incremental`.

## Documents

- `docs/decisions.md`: all design decisions
- `docs/syntax.md`: the complete syntax with examples and test examples
- `docs/spec.md`: the numbered requirements

## License

MIT. See `LICENSE`.
