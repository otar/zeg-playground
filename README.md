# zeg

zeg is a small CQRS library for Cloudflare Workers. It dispatches each command and each query to its handler.

- You do not register handlers by hand. Vite finds the message files and the handler files at build time.
- zeg finds the handler through the class of the message, not through a name. The classes can be anonymous.
- zeg has four exports, no dependencies and no build step. After esbuild minifies it and gzip compresses it, its size is less than 1.5 KB.

## Requirements

- The project builds with Vite and `@cloudflare/vite-plugin`. zeg does not support a build with Wrangler only, because Wrangler does not transform `import.meta.glob`.
- The tested versions are Vite 8.3 and `@cloudflare/vite-plugin` 1.60.
- zeg needs no other Vite settings and no compatibility flags.

## Installation

```sh
npm install @otar/zeg
```

## Example

Each message class is in its own file. Its handler class is in a second file in the same folder. `RegisterUser.js` and `RegisterUserHandler.js` form a pair.

```
src/
  index.js
  commands/
    RegisterUser.js
    RegisterUserHandler.js
  queries/
    GetUser.js
    GetUserHandler.js
```

A message file has a class as its default export:

```js
// src/commands/RegisterUser.js
export default class {
  constructor(email) {
    this.email = email;
  }
}
```

A handler file has a class with a `handle()` method as its default export:

```js
// src/commands/RegisterUserHandler.js
import { env } from 'cloudflare:workers';

export default class {
  async handle(message) {
    await env.DB.prepare('INSERT INTO users (email) VALUES (?)').bind(message.email).run();
  }
}
```

```js
// src/queries/GetUserHandler.js
import { env } from 'cloudflare:workers';

export default class {
  async handle(message) {
    return env.DB.prepare('SELECT email FROM users WHERE email = ?').bind(message.email).first();
  }
}
```

The Worker entry file calls `zeg()` one time with one glob for each kind:

```js
// src/index.js
import { zeg, command, query } from '@otar/zeg';
import RegisterUser from './commands/RegisterUser.js';
import GetUser from './queries/GetUser.js';

zeg({
  commands: import.meta.glob(['./commands/**/*.js', '!**/_*.js'], { eager: true }),
  queries: import.meta.glob(['./queries/**/*.js', '!**/_*.js'], { eager: true }),
});

export default {
  async fetch(request) {
    const { email } = await request.json();
    await command(new RegisterUser(email));
    return Response.json(await query(new GetUser(email)));
  },
};
```

The folder `examples/basic-worker/` contains a complete Worker with a D1 database. To run it, do these steps:

1. In `examples/basic-worker/`, run `npm install`.
2. Run `npm run migrate` to create the local database.
3. Run `npm run dev`.

## API

```js
import { zeg, command, query, ZegError } from '@otar/zeg';
```

| Export | Description |
| --- | --- |
| `zeg(options)` | Sets the pairs of message classes and handler classes. `options.commands` and `options.queries` are each a glob output or an array of glob outputs. Each call replaces all pairs. Returns `undefined`. |
| `command(message)` | Dispatches a command. Returns a Promise that resolves to `undefined`. |
| `query(message)` | Dispatches a query. Returns a Promise that resolves to the value from the handler. |
| `ZegError` | The error class of zeg. It has the properties `name` (`'ZegError'`), `code` and `message`. |

### Types in the editor

`src/zeg.js` has JSDoc docblocks for the four exports. An editor shows their descriptions and types. The package has no `.d.ts` file.

- A TypeScript 7 editor shows the docblocks only if the project has a `jsconfig.json` or a `tsconfig.json`. An empty file (`{}`) is sufficient.
- A strict TypeScript project gets the error `TS7016` for `@otar/zeg`, because the package has no type declarations.
- In a JavaScript project with `checkJs`, the editor shows some incorrect calls, for example `command('RegisterUser')`. zeg also does all its checks at runtime.
- The result type of `query()` is `unknown`. To set a type in JavaScript, write `/** @type {User} */` before the variable.

## Rules

Rules for the files:

- Each file that a glob finds must be part of a pair. Exclude helper files with a negative pattern, for example `'!**/_*.js'`.
- A handler file name is the name of the message file without `.js`, plus `Handler.js`. The names are case-sensitive.
- A message file and its handler file must be in the same folder and in the same glob output.
- The handler files can be in a separate folder, for example `src/command-handlers/`. Section 3.9 of `docs/syntax.md` shows the globs with the Vite option `base`.
- Files with the same name in different folders form different pairs.

Rules for the handlers:

- zeg creates a new handler instance for each dispatch, with no arguments.
- `handle(message)` can be sync or async. It gets the message itself.
- zeg gives no context to handler classes. If a handler needs `env` or `waitUntil`, its handler file imports them from `'cloudflare:workers'`.
- A handler can dispatch another message with `command()` or `query()`.
- A query handler must not return `undefined`. It can return `null`.

Rules for the messages:

- A message must be an instance of a class. It must not be an array or a plain object.
- zeg does not freeze, copy or change the message.
- A subclass is a different class. It needs its own pair.

## Errors

| Code | Source | Cause |
| --- | --- | --- |
| `INVALID_CONFIG` | `zeg()` throws | The options, the files, the pairs or the classes are not valid. |
| `NOT_CONFIGURED` | The Promise rejects | No call to `zeg()` returned before the dispatch. |
| `HANDLER_NOT_FOUND` | The Promise rejects | The class of the message has no pair of this kind. If it is a message of the other kind, the error text tells you to use the other function. |
| `UNDEFINED_RESULT` | The Promise of `query()` rejects | The query handler returned `undefined`. |

If the message is `null`, a primitive, a function, an array or a plain object, the Promise rejects with a `TypeError`. If a handler constructor or `handle()` throws, the Promise rejects with the same value.

`zeg()` runs when the Worker starts. As a result, an `INVALID_CONFIG` error stops the Worker at startup, and `vite dev` does not start.

## Tests

To run the tests of zeg, do these steps in the repository root:

1. Run `npm ci`.
2. Run `npm test`. This command runs all tests and checks, except the coverage check and the mutation tests. It also checks the style of the code (see below) and the types in the docblocks, with TypeScript 7.
3. Run `npm run coverage`. This command runs the unit tests with Istanbul and checks that the coverage of `src/zeg.js` is 100%.

The unit tests run in workerd with Vitest and `@cloudflare/vitest-plugin`. The build tests and the static checks run in Node. The build tests install the packages of `examples/basic-worker/` in a temporary folder, so they need access to the npm registry. To run only the unit tests, run `npm run test:unit`.

GitHub Actions runs these commands on each push to `main`.

Prettier sets the layout of the code. ESLint finds code that is hard to read or that can be wrong. The body of each `if`, `else`, `for`, `while` and `do` statement must have braces.

- To check the style, run `npm run lint`.
- To correct the style, run `npm run lint:fix`.

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
