# zeg: syntax (phase 1)

This document shows how a project uses zeg. It contains the complete API, the rules for files and pairs, and the error codes. It contains no implementation. The IDs in brackets, for example [D-11], refer to `docs/decisions.md`.

## 1. What zeg does

zeg dispatches a message to its handler. A message is an instance of a class, for example `RegisterUser`. A command changes state and returns no result. A query reads state and returns a result.

Each message class is in its own file. Its handler class is in a second file in the same folder. `RegisterUser.js` and `RegisterUserHandler.js` form a pair [D-11]. You do not import or register each handler. Vite finds the files at build time [D-07].

zeg does not use class names. It finds the handler through the class of the message [D-08, D-16]. For this reason, the classes can be anonymous.

## 2. Project requirements

- The project builds with Vite and `@cloudflare/vite-plugin`. zeg does not support a build with Wrangler only [D-06].
- Each message file and each handler file is a `.js` file or a `.ts` file with a default export [D-13, D-37, D-78].
- A project does not need the `keepNames` setting [D-08].

The tested versions are Vite 8.3 and `@cloudflare/vite-plugin` 1.60 [D-59].

## 3. Example project

```
package.json
vite.config.js
vitest.config.js
wrangler.jsonc
migrations/
  0001_create_users.sql
src/
  index.js
  commands/
    RegisterUser.js
    RegisterUserHandler.js
    SendWelcomeEmail.js
    SendWelcomeEmailHandler.js
    billing/
      ChargeCard.js
      ChargeCardHandler.js
  queries/
    GetUser.js
    GetUserHandler.js
test/
  apply-migrations.js
  users.test.js
  fake-handler.test.js
  get-user-handler.test.js
```

### 3.1 package.json

```json
{
  "name": "users-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "vite build && wrangler deploy",
    "test": "vitest run"
  },
  "dependencies": {
    "@otar/zeg": "^0.1.0"
  },
  "devDependencies": {
    "@cloudflare/vite-plugin": "^1.60.2",
    "@cloudflare/vitest-plugin": "^1.2.8",
    "vite": "^8.3.1",
    "vitest": "^4.1.11",
    "wrangler": "^4.141.0"
  }
}
```

The lab tests did not test the `deploy` script.

npm 10 cannot resolve these packages without a lockfile (background fact 19 in `docs/decisions.md`). For the first `npm install`, use npm 11.6 or later.

### 3.2 vite.config.js

```js
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [cloudflare()],
});
```

zeg needs no other Vite settings [D-06, D-08].

### 3.3 wrangler.jsonc

```jsonc
{
  "name": "users-worker",
  "main": "./src/index.js",
  "compatibility_date": "2026-09-01",
  "d1_databases": [
    { "binding": "DB", "database_name": "users", "database_id": "<your-database-id>" },
  ],
}
```

### 3.4 D1 migration

```sql
-- migrations/0001_create_users.sql
CREATE TABLE users (email TEXT PRIMARY KEY);
```

To create the table in the local database, run `npx wrangler d1 migrations apply users --local`.

### 3.5 Message files

A message file has a class as its default export. A message file does not need to import zeg.

```js
// src/commands/RegisterUser.js
export default class {
  constructor(email) {
    this.email = email;
  }
}
```

```js
// src/commands/SendWelcomeEmail.js
export default class {
  constructor(email) {
    this.email = email;
  }
}
```

```js
// src/queries/GetUser.js
export default class {
  constructor(email) {
    this.email = email;
  }
}
```

A message can check its data in its constructor:

```js
// src/commands/billing/ChargeCard.js
export default class {
  constructor(userEmail, amount) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new TypeError('amount must be a positive integer');
    }
    this.userEmail = userEmail;
    this.amount = amount;
  }
}
```

A class name is optional. zeg ignores it, but stack traces and `console.log` show it [D-08]:

```js
// also valid
export default class RegisterUser {
  constructor(email) {
    this.email = email;
  }
}
```

### 3.6 Handler files

A handler file has a class as its default export. The name of the handler file is the name of the message file without its extension, plus `Handler` and the same extension. For example, `RegisterUser.js` goes with `RegisterUserHandler.js`, and `RegisterUser.ts` goes with `RegisterUserHandler.ts` [D-78].

```js
// src/commands/RegisterUserHandler.js
import { env } from 'cloudflare:workers';
import { command } from '@otar/zeg';
import SendWelcomeEmail from './SendWelcomeEmail.js';

export default class {
  async handle(message) {
    await env.DB.prepare('INSERT INTO users (email) VALUES (?)').bind(message.email).run();
    await command(new SendWelcomeEmail(message.email));
  }
}
```

```js
// src/commands/SendWelcomeEmailHandler.js
export default class {
  handle(message) {
    console.log(`welcome mail to ${message.email}`);
  }
}
```

```js
// src/commands/billing/ChargeCardHandler.js
export default class {
  handle(message) {
    console.log(`charge ${message.amount} to ${message.userEmail}`);
  }
}
```

```js
// src/queries/GetUserHandler.js
import { env } from 'cloudflare:workers';

export default class {
  async handle(message) {
    const user = await env.DB.prepare('SELECT email FROM users WHERE email = ?')
      .bind(message.email)
      .first();
    return user; // the row, or null if no row exists
  }
}
```

The rules for files and pairs:

- Each file that a glob finds must be part of a pair [D-10].
- A handler file name ends in `Handler.js` or `Handler.ts`. Each other file that a glob finds is a message file. For this reason, the name of a message file cannot end in `Handler.js` or `Handler.ts` [D-15].
- `X.js` and `XHandler.js` in the same folder form a pair. Each message file needs its handler file, and each handler file needs its message file. The file names must match exactly, and the match is case-sensitive [D-11].
- Files with the same name in different folders form different pairs [D-12].
- zeg reads only the default export of each file [D-13].

The rules for handler classes:

- The class has an instance method `handle(message)`. The method gets exactly one argument [D-18].
- `handle()` can be sync or async [D-18].
- `handle()` must be a method of the class or of a base class. A class field such as `handle = () => {}` is not valid [D-19].
- zeg creates a new instance for each dispatch, with `new HandlerClass()` and no arguments [D-21]. A value that you set on `this` exists only for that dispatch.
- zeg gives no context to the handler. The handler imports `env` and `waitUntil` from `'cloudflare:workers'` [D-22].
- A handler cannot get the `Request` object. The caller must put the necessary data into the message [D-22].
- A handler dispatches another message with `command()` or `query()` from `'@otar/zeg'` [D-23].
- A message file or a handler file must not import `src/index.js` [D-25].
- The return value of a command handler has no effect [D-42].
- A query handler must not return `undefined`. It can return `null` [D-43, D-44].

### 3.7 Worker entry

```js
// src/index.js
import { zeg, command, query } from '@otar/zeg';
import RegisterUser from './commands/RegisterUser.js';
import GetUser from './queries/GetUser.js';

zeg({
  commands: import.meta.glob('./commands/**/*.js', { eager: true }),
  queries: import.meta.glob('./queries/**/*.js', { eager: true }),
});

export default {
  async fetch(request) {
    const { email } = await request.json();
    await command(new RegisterUser(email));
    const user = await query(new GetUser(email));
    return Response.json(user);
  },
};
```

The caller imports a message class with a default import. You can use any local name, for example `RegisterUser`.

`zeg()` is module-level code in the Worker entry file. As a result, it runs one time for each isolate [D-04, D-05]. If `zeg()` throws, the Worker does not start, and `vite dev` does not start [D-38].

Vite reads the glob patterns at build time. For this reason, each pattern must be a string literal in your own file [D-07].

### 3.8 Files in several folders

One glob can have several patterns. As a result, one glob can find files in several folders [D-09]:

```js
zeg({
  commands: import.meta.glob(['./users/commands/**/*.js', './billing/commands/**/*.js'], {
    eager: true,
  }),
});
```

A wider pattern also works. It finds the files in the `commands` folder of each feature folder, for example `src/users/` and `src/billing/`:

```js
zeg({
  commands: import.meta.glob('./*/commands/**/*.js', { eager: true }),
});
```

If each feature folder has its own glob in its own file, give the glob outputs as an array [D-09]:

```js
// src/users/globs.js
export const commands = import.meta.glob('./commands/**/*.js', { eager: true });
```

```js
// src/billing/globs.js
export const commands = import.meta.glob('./commands/**/*.js', { eager: true });
```

```js
// src/index.js
import { zeg } from '@otar/zeg';
import { commands as userCommands } from './users/globs.js';
import { commands as billingCommands } from './billing/globs.js';

zeg({ commands: [userCommands, billingCommands] });

// export default { fetch } as in section 3.7
```

Do not merge such glob outputs with `{ ...userCommands, ...billingCommands }`. Without the option `base`, each glob supplies file paths relative to its own file. If both folders contain a file with the same name, both globs supply the same path, for example `./commands/RegisterUser.js`. The merge then loses entries, and `zeg()` does not throw. A later dispatch of a lost message class rejects with `HANDLER_NOT_FOUND` (background fact 17).

A message file and its handler file must be in the same glob output [D-11].

Section 3.9 shows the one exception to the rule about the merge.

### 3.9 Handler files in a separate folder

The handler files can be in a separate folder, for example `src/command-handlers/` for the files in `src/commands/`:

```
src/
  index.js
  commands/
    RegisterUser.js
    SendWelcomeEmail.js
    billing/
      ChargeCard.js
  command-handlers/
    RegisterUserHandler.js
    SendWelcomeEmailHandler.js
    billing/
      ChargeCardHandler.js
  queries/
    GetUser.js
  query-handlers/
    GetUserHandler.js
```

For each kind, use two globs with the Vite option `base`. Merge the two glob outputs with a spread:

```js
// src/index.js
import { zeg } from '@otar/zeg';

zeg({
  commands: {
    ...import.meta.glob(['./**/*.js', '!**/*Handler.js'], {
      eager: true,
      base: './commands',
    }),
    ...import.meta.glob('./**/*Handler.js', { eager: true, base: './command-handlers' }),
  },
  queries: {
    ...import.meta.glob(['./**/*.js', '!**/*Handler.js'], {
      eager: true,
      base: './queries',
    }),
    ...import.meta.glob('./**/*Handler.js', { eager: true, base: './query-handlers' }),
  },
});

// export default { fetch } as in section 3.7
```

With the option `base`, each file path in the glob output is relative to the base folder (background fact 22). A pattern that starts with `./` is also relative to the base folder. For example, `'./**/*.js'` with `base: './commands'` finds only the files in `src/commands/`. For example, the file path of `src/commands/billing/ChargeCard.js` is `./billing/ChargeCard.js`, and the file path of `src/command-handlers/billing/ChargeCardHandler.js` is `./billing/ChargeCardHandler.js`. As a result, zeg finds the pairs as in the other sections [D-11]. A base folder that starts with `./` or `../` is relative to the file that contains the glob.

Obey these rules:

- The name of each handler file must end in `Handler.js`.
- The handler folder must have the same subfolders as the message folder. For example, `src/commands/billing/ChargeCard.js` needs `src/command-handlers/billing/ChargeCardHandler.js`.
- Use the patterns of the example. The message glob excludes the handler files with `'!**/*Handler.js'`, and the handler glob finds only the handler files. As a result, the two glob outputs cannot contain the same file path, and the merge does not lose an entry. For `.ts` files, use `'!**/*Handler.ts'` and `'./**/*Handler.ts'`.

If a handler file imports a message class, it uses a path relative to its own folder. For example, `src/command-handlers/RegisterUserHandler.js` contains `import SendWelcomeEmail from '../commands/SendWelcomeEmail.js'`.

`zeg()` does the same checks as for one glob. For example, if `src/commands/Refund.js` has no handler file, `zeg()` throws `INVALID_CONFIG`. The error text contains the file paths relative to the base folder, for example `zeg(): commands ./Refund.js: no handler file ./RefundHandler.js`. The file paths in the error text do not contain the base folder `./commands`.

### 3.10 TypeScript

Message files and handler files can be `.ts` files. Vite transforms them [D-78]. A pair uses one extension: `RegisterUser.ts` goes with `RegisterUserHandler.ts`. The package contains type declarations in `src/zeg.d.ts` [D-57].

```ts
// src/index.ts
import { zeg, command, query } from '@otar/zeg';
import RegisterUser from './commands/RegisterUser.ts';
import GetUser from './queries/GetUser.ts';

zeg({
  commands: import.meta.glob('./commands/**/*.ts', { eager: true }),
  queries: import.meta.glob('./queries/**/*.ts', { eager: true }),
});

export default {
  async fetch(request: Request): Promise<Response> {
    const { email } = (await request.json()) as { email: string };
    await command(new RegisterUser(email));
    return Response.json(await query<{ email: string } | null>(new GetUser(email)));
  },
};
```

```ts
// src/queries/GetUserHandler.ts
import { users } from '../store.ts';
import type GetUser from './GetUser.ts';

export default class {
  handle(message: GetUser): { email: string } | null {
    return users.get(message.email) ?? null;
  }
}
```

The lab used this `tsconfig.json` (background fact 24):

```json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "lib": ["es2022", "dom"],
    "types": ["vite/client"],
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- `types: ["vite/client"]` gives the type of `import.meta.glob`.
- TypeScript finds the types of zeg with the `moduleResolution` values `bundler`, `node16` and `nodenext`.
- `query<T>()` sets the result type. zeg does not check this type at runtime.
- A glob such as `'./commands/**/*.ts'` also finds `.d.ts` files, and `zeg()` rejects them [D-78]. Keep `.d.ts` files out of the command folders and the query folders, or add `'!**/*.d.ts'` to the glob.

## 4. API

The package `@otar/zeg` has four exports [D-02]:

```js
import { zeg, command, query, ZegError } from '@otar/zeg';
```

### 4.1 zeg(options)

```
zeg(options) -> undefined
  options.commands  optional. A glob output, or an array of glob outputs, for the command files.
  options.queries   optional. A glob output, or an array of glob outputs, for the query files.
```

A glob output is the result of `import.meta.glob(patterns, { eager: true })`.

- A glob output is a plain object. Each property name is a file path. Each property value is the module of that file (background fact 3).
- An array of glob outputs is useful when the globs are in different files (section 3.8). An empty array is valid [D-09].
- A glob output with no files is not valid, because this shows a glob pattern with no match. If a kind has no files yet, leave out its option or its array entry [D-09].
- An option with the value `undefined` is the same as a missing option [D-35].
- `zeg()` checks all files, pairs and classes. If a check fails, it throws a `ZegError` with the code `INVALID_CONFIG` [D-37]. See section 6.1.
- `zeg()` checks all options before it changes the registry. If it throws, the handlers of the previous call stay active [D-39].
- Each call replaces all handlers of the previous call [D-35].
- `zeg({})` is valid and creates an empty registry [D-36].

### 4.2 command(message)

```
command(message) -> Promise<undefined>
```

- `message` must be an object. It must not be `null`, a function, an array or a plain object [D-27].
- zeg finds the handler through the class of `message` [D-16].
- zeg gives `message` to `handle()` as it is. It does not freeze, copy or change it [D-29].
- The Promise resolves to `undefined` when `handle()` is complete [D-42].
- If an error occurs, the Promise rejects. `command()` never throws synchronously [D-41].

### 4.3 query(message)

```
query(message) -> Promise<result>
```

- `message` must be an object. It must not be `null`, a function, an array or a plain object [D-27].
- zeg finds the handler through the class of `message` [D-16].
- zeg gives `message` to `handle()` as it is. It does not freeze, copy or change it [D-29].
- The Promise resolves to the return value of `handle()`, after `await` [D-43].
- If that value is `undefined`, the Promise rejects with a `ZegError` with the code `UNDEFINED_RESULT` [D-44].
- `query()` never throws synchronously [D-41].

### 4.4 ZegError

```
new ZegError(code, message) -> ZegError
  name     always 'ZegError'
  code     the code argument. zeg uses the codes in section 6.
  message  the message argument, a description for people
```

- `ZegError` extends `Error` [D-50].
- The constructor is public. It does not check the code [D-51].
- zeg adds no other properties [D-52].
- The error text of a `ZegError` from zeg can change in any version. The class and the code are the API [D-54].

<!-- prettier-ignore -->
```js
const error = new ZegError('HANDLER_NOT_FOUND', 'test');
error instanceof Error;  // true
error.name;              // 'ZegError'
error.code;              // 'HANDLER_NOT_FOUND'
```

## 5. Message rules

### 5.1 Valid messages

A message must be an object. It must not be `null`, a function, an array or a plain object [D-27]:

<!-- prettier-ignore -->
```js
await command(new RegisterUser('a@b.c'));   // valid

await command({ email: 'a@b.c' });          // TypeError: plain object
await command([1, 2]);                      // TypeError: array
await command(null);                        // TypeError
await command('RegisterUser');              // TypeError: primitive
await command(RegisterUser);                // TypeError: the class, not an instance
```

The class of the message must be a message class that a glob of the correct kind found [D-47]:

```js
await command(new (class {})());
// ZegError HANDLER_NOT_FOUND: no glob found this class

await command(new GetUser('a@b.c'));
// ZegError HANDLER_NOT_FOUND: GetUser is a query (section 6.2)
```

A subclass is a different class. It needs its own pair [D-28]:

```js
// src/commands/RegisterAdmin.js
import RegisterUser from './RegisterUser.js';

export default class extends RegisterUser {}

// src/commands/RegisterAdminHandler.js must also exist
```

### 5.2 The message object

zeg gives the message to `handle()` as it is. It does not freeze, copy or change the message [D-29].

As a result, a handler can change the message, and the caller then sees the change. If a message must not change, its message class can freeze the message in the constructor:

```js
// src/commands/RegisterUser.js (a variant that freezes the message)
export default class {
  constructor(email) {
    this.email = email;
    Object.freeze(this);
  }
}
```

- `Object.freeze()` is shallow. It does not freeze nested objects or arrays.
- A handler file is an ES module, so it runs in strict mode. If a handler assigns a value to a frozen message, a `TypeError` occurs. The Promise of the dispatch then rejects with this error [D-49].
- If a message class freezes the message in its constructor, a subclass cannot add properties. The constructor of the subclass then throws a `TypeError`. For this reason, freeze only in message classes that have no subclasses.

## 6. Error codes

| Code | Source | Cause |
| --- | --- | --- |
| `INVALID_CONFIG` | `zeg()` throws | The options, the files, the pairs or the classes are not valid. See section 6.1. |
| `NOT_CONFIGURED` | the Promise of `command()` or `query()` rejects | No call to `zeg()` returned without an error before the dispatch [D-46]. |
| `HANDLER_NOT_FOUND` | the Promise of `command()` or `query()` rejects | The class of the message is not a message class of this kind [D-47]. |
| `UNDEFINED_RESULT` | the Promise of `query()` rejects | The query handler returned `undefined` [D-44]. |

### 6.1 INVALID_CONFIG cases

`zeg()` throws a `ZegError` with the code `INVALID_CONFIG` in these cases [D-37]:

<!-- prettier-ignore -->
```js
zeg();                                  // the argument is not an object
zeg({ handlers: {} });                  // unknown key
zeg({ commands: 'x' });                 // the value is not an object
zeg({ commands: [userCommands, 'x'] }); // an entry of the array is not a plain object

zeg({ commands: import.meta.glob('./commands/**/*.js') });
// a lazy glob: each value is a function, not a module

zeg({ commands: import.meta.glob('./command/**/*.js', { eager: true }) });
// a wrong folder: the glob output has no files

zeg({ commands: { './commands/Ping.tsx': { default: class {} } } });
// the path does not end in .js or .ts

zeg({ commands: import.meta.glob('./commands/**/*.ts', { eager: true }) });
// the glob also finds a .d.ts file, for example ./commands/types.d.ts
```

These cases come from the files:

```
src/commands/Ping.js                 exists
src/commands/PingHandler.js          missing       -> message file without handler file

src/commands/PongHandler.js          exists
src/commands/Pong.js                 missing       -> handler file without message file

src/commands/utils.js                a file that is not part of a pair
                                     -> no default export, or no utilsHandler.js

src/commands/Handler.js              -> a handler file without a message file

src/commands/Ping.js                 export const x = 1 (no default export)

src/commands/PingHandler.js          export default class { handel(m) {} }
                                     -> no handle() method

src/commands/Copy.js                 export { default } from './Ping.js'
src/commands/CopyHandler.js          exists
                                     -> the same class in two message files

src/users/commands/RegisterUser.js   two glob outputs in the array find this file
                                     -> the same class in two message files

src/commands/Ping.js                 in one glob output of the array
src/commands/PingHandler.js          in another glob output of the array
                                     -> message file without handler file
```

### 6.2 Hint in HANDLER_NOT_FOUND

If the message is a message of the other kind, the error text tells you to use the other function [D-48]:

```js
await command(new GetUser('a@b.c'));
// ZegError HANDLER_NOT_FOUND
// the text names the key './queries/GetUser' and tells you to use query()
```

zeg names the message file by its key, not by its class name. If the option is an array, the error text also names the position of the glob output, for example `commands[1]` [D-48].

### 6.3 Errors that are not a ZegError

These errors are not a `ZegError`:

- If a message is not valid, the Promise rejects with a built-in `TypeError` [D-45].
- If `new HandlerClass()` or `handle()` throws, the Promise rejects with the same error object [D-49].
- If the top-level code of a message file or a handler file throws, the Worker fails at startup [D-26].

An error from `handle()` can be a `ZegError`. For example, a handler dispatches another message, and the Promise of that dispatch rejects with `HANDLER_NOT_FOUND`. zeg does not wrap this error. As a result, the caller cannot know if the error came from its own dispatch or from a nested dispatch.

### 6.4 Example: catch an error

```js
import { command, ZegError } from '@otar/zeg';
import RegisterUser from './commands/RegisterUser.js';

async function register(email) {
  try {
    await command(new RegisterUser(email));
  } catch (error) {
    if (error instanceof ZegError && error.code === 'HANDLER_NOT_FOUND') {
      // this can also come from a nested dispatch (section 6.3)
      return new Response('not supported', { status: 501 });
    }
    throw error; // for example an error from the handler
  }
  return new Response(null, { status: 204 });
}
```

## 7. Tests

The tests run in Vitest with `@cloudflare/vitest-plugin` [D-68]. Vitest supports `import.meta.glob`.

### 7.1 Test setup

The tests with the real handlers need the D1 table. The setup file applies the migrations for each test file.

```js
// vitest.config.js
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations') },
      },
    })),
  ],
  test: {
    include: ['test/**/*.test.js'],
    setupFiles: ['./test/apply-migrations.js'],
  },
});
```

```js
// test/apply-migrations.js
import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

### 7.2 Test with the real handlers

A test file can use its own globs. The file paths and the keys in error texts then start with `../src/`.

```js
// test/users.test.js
import { it, expect } from 'vitest';
import { zeg, command, query } from '@otar/zeg';
import RegisterUser from '../src/commands/RegisterUser.js';
import GetUser from '../src/queries/GetUser.js';

it('registers a user', async () => {
  zeg({
    commands: import.meta.glob('../src/commands/**/*.js', { eager: true }),
    queries: import.meta.glob('../src/queries/**/*.js', { eager: true }),
  });
  await command(new RegisterUser('a@b.c'));
  expect(await query(new GetUser('a@b.c'))).toEqual({ email: 'a@b.c' });
});
```

### 7.3 Test with a fake handler

The eager glob output is a plain object. As a result, a test can write one by hand. The object must contain an entry for the message file and an entry for the handler file:

```js
// test/fake-handler.test.js
import { it, expect } from 'vitest';
import { zeg, query } from '@otar/zeg';
import GetUser from '../src/queries/GetUser.js';

it('uses a fake handler', async () => {
  class FakeGetUserHandler {
    handle(message) {
      return { email: message.email, fake: true };
    }
  }
  zeg({
    queries: {
      './GetUser.js': { default: GetUser },
      './GetUserHandler.js': { default: FakeGetUserHandler },
    },
  });
  expect(await query(new GetUser('a@b.c'))).toEqual({ email: 'a@b.c', fake: true });
});
```

### 7.4 Test of one handler

A test can create a handler directly, without zeg. The `handle()` method of the `GetUser` handler is async, so the test uses `await`. The handler reads `env.DB`, so the test needs the setup in section 7.1.

```js
// test/get-user-handler.test.js
import { it, expect } from 'vitest';
import GetUserHandler from '../src/queries/GetUserHandler.js';
import GetUser from '../src/queries/GetUser.js';

it('returns null for an unknown user', async () => {
  const result = await new GetUserHandler().handle(new GetUser('nobody@b.c'));
  expect(result).toBeNull();
});
```

### 7.5 Module state in tests

- Each test file gets a new module state. The tests in one file share the zeg registry.
- The plugin adds an import of `src/index.js` to the module `cloudflare:test` (background fact 13). The setup file in section 7.1 imports `cloudflare:test`. As a result, `src/index.js` and its `zeg()` call run before the tests in each test file.
- A `zeg()` call in a test replaces the handlers of `src/index.js` [D-35]. A later `exports.default.fetch()` does not run `src/index.js` again, so the handlers of the test stay active.
- If no file imports `cloudflare:test`, `src/index.js` runs at the first `exports.default.fetch()` in a test file. Its `zeg()` call then replaces the handlers of the test.
- For these reasons, each test calls `zeg()` with the files that it needs.
- Do not use `vi.resetModules()` in tests that use zeg. A reset creates new class objects and a new instance of zeg (background fact 14). A glob in the test file still supplies the classes from before the reset.

## 8. What zeg does not do

- no middleware, no events, no Cloudflare Queues [D-01]
- no context argument for handlers [D-22]
- no build with Wrangler only [D-06]
- no class names for resolution [D-08]
- no fallback to the handler of a parent class [D-28]
- no guard against recursive dispatch [D-24]
- no freeze or copy of messages [D-29]
