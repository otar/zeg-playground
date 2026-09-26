# zeg: syntax (phase 1)

This document shows how a project uses zeg. It contains the complete API, the rules for names and folders, and the error codes. It contains no implementation. The IDs in brackets, for example [D-10], refer to `docs/decisions.md`.

## 1. What zeg does

zeg dispatches a message to its handler. A message is an instance of a class, for example `RegisterUser`. A command changes state and returns no result. A query reads state and returns a result.

zeg finds the handler from the class name of the message. `RegisterUser` goes to `RegisterUserHandler`. You do not import or register each handler. Vite finds the handler files at build time [D-07].

## 2. Project requirements

- The project builds with Vite and `@cloudflare/vite-plugin`. zeg does not support a build with Wrangler only [D-06].
- `vite.config.js` must set `keepNames` [D-08].
- Each handler is a `.js` file, and the file name ends in `Handler.js` [D-31].

The tested versions are Vite 8.3 and `@cloudflare/vite-plugin` 1.60 [D-52].

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
```

The message files can be in any folder. In this example, each message is next to its handler.

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

### 3.2 vite.config.js

```js
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [cloudflare()],
  build: {
    rolldownOptions: {
      output: { keepNames: true }, // necessary for zeg [D-08]
    },
  },
});
```

### 3.3 wrangler.jsonc

```jsonc
{
  "name": "users-worker",
  "main": "./src/index.js",
  "compatibility_date": "2026-09-01",
  "d1_databases": [
    { "binding": "DB", "database_name": "users", "database_id": "<your-database-id>" }
  ]
}
```

### 3.4 D1 migration

```sql
-- migrations/0001_create_users.sql
CREATE TABLE users (email TEXT PRIMARY KEY);
```

To create the table in the local database, run `npx wrangler d1 migrations apply users --local`.

### 3.5 Messages

A message is a standard JavaScript class. It does not import zeg.

```js
// src/commands/RegisterUser.js
export class RegisterUser {
  constructor(email) {
    this.email = email;
  }
}
```

```js
// src/commands/SendWelcomeEmail.js
export class SendWelcomeEmail {
  constructor(email) {
    this.email = email;
  }
}
```

```js
// src/queries/GetUser.js
export class GetUser {
  constructor(email) {
    this.email = email;
  }
}
```

A message can check its data in its constructor:

```js
// src/commands/billing/ChargeCard.js
export class ChargeCard {
  constructor(userEmail, amount) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new TypeError('amount must be a positive integer');
    }
    this.userEmail = userEmail;
    this.amount = amount;
  }
}
```

### 3.6 Handlers

```js
// src/commands/RegisterUserHandler.js
import { env } from 'cloudflare:workers';
import { command } from '@otar/zeg';
import { SendWelcomeEmail } from './SendWelcomeEmail.js';

export class RegisterUserHandler {
  async handle(message) {
    await env.DB.prepare('INSERT INTO users (email) VALUES (?)')
      .bind(message.email)
      .run();
    await command(new SendWelcomeEmail(message.email));
  }
}
```

```js
// src/commands/SendWelcomeEmailHandler.js
export class SendWelcomeEmailHandler {
  handle(message) {
    console.log(`welcome mail to ${message.email}`);
  }
}
```

```js
// src/commands/billing/ChargeCardHandler.js
export class ChargeCardHandler {
  handle(message) {
    console.log(`charge ${message.amount} to ${message.userEmail}`);
  }
}
```

```js
// src/queries/GetUserHandler.js
import { env } from 'cloudflare:workers';

export class GetUserHandler {
  async handle(message) {
    const user = await env.DB.prepare('SELECT email FROM users WHERE email = ?')
      .bind(message.email)
      .first();
    return user; // the row, or null if no row exists
  }
}
```

The rules for handlers:

- The file name ends in `Handler.js`. The key is the file name without `Handler.js` [D-10]. For example, `ChargeCardHandler.js` in `commands/billing/` has the key `ChargeCard`.
- The key comparison is exact and case-sensitive. A message class `registerUser` does not match `RegisterUserHandler.js` [D-11].
- The file exports the class with a named export. The export name is the file name without `.js` [D-13].
- The class has an instance method `handle(message)`. The method gets exactly one argument [D-14].
- `handle()` can be sync or async [D-14].
- `handle()` must be a method of the class or of a base class. A class field such as `handle = () => {}` is not valid [D-15].
- zeg creates a new instance for each dispatch, with `new RegisterUserHandler()` and no arguments [D-16]. A value that you set on `this` exists only for that dispatch.
- zeg passes no context to the handler. The handler imports `env` and `waitUntil` from `'cloudflare:workers'` [D-18].
- A handler cannot get the `Request` object. The caller must put the necessary data into the message [D-18].
- A handler dispatches another message with `command()` or `query()` from `'@otar/zeg'` [D-19].
- The return value of a command handler has no effect [D-34].
- A query handler must not return `undefined`. It can return `null` [D-35, D-36].

### 3.7 Worker entry

```js
// src/index.js
import { configure, command, query } from '@otar/zeg';
import { RegisterUser } from './commands/RegisterUser.js';
import { GetUser } from './queries/GetUser.js';

configure({
  commands: import.meta.glob('./commands/**/*Handler.js'),
  queries: import.meta.glob('./queries/**/*Handler.js'),
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

`configure()` is module-level code in the Worker entry file. As a result, it runs one time for each isolate [D-04, D-05].

Vite reads the glob patterns at build time. For this reason, each pattern must be a string literal in your own file [D-07].

## 4. API

The package `@otar/zeg` has four exports [D-02]:

```js
import { configure, command, query, CqrsError } from '@otar/zeg';
```

### 4.1 configure(options)

```
configure(options) -> undefined
  options.commands  optional. The output of import.meta.glob for command handlers.
  options.queries   optional. The output of import.meta.glob for query handlers.
```

- A glob output is an object. Each key is a file path. Each value is a function that loads the file and returns a Promise for the module.
- Each call replaces all handlers of the previous call [D-29].
- `configure({})` is valid and creates an empty registry [D-30].
- If the options are not valid, `configure()` throws a `CqrsError` with the code `INVALID_CONFIG` [D-31]. See section 6.1.
- `configure()` checks all options before it changes the registry. If it throws, the handlers of the previous call stay active [D-32].

### 4.2 command(message)

```
command(message) -> Promise<undefined>
```

- `message` must be an instance of a named class [D-21].
- zeg finds the command handler whose key is equal to `message.constructor.name` [D-12].
- zeg deep-freezes `message` immediately before `handle()` runs [D-23].
- The Promise resolves to `undefined` when `handle()` is complete [D-34].
- If an error occurs, the Promise rejects. `command()` never throws synchronously [D-33].

### 4.3 query(message)

```
query(message) -> Promise<result>
```

- `message` must be an instance of a named class [D-21].
- zeg finds the query handler whose key is equal to `message.constructor.name` [D-12].
- zeg deep-freezes `message` immediately before `handle()` runs [D-23].
- The Promise resolves to the return value of `handle()`, after `await` [D-35].
- If that value is `undefined`, the Promise rejects with a `CqrsError` with the code `UNDEFINED_RESULT` [D-36].
- `query()` never throws synchronously [D-33].

### 4.4 CqrsError

```
new CqrsError(code, message) -> CqrsError
  name     always 'CqrsError'
  code     the code argument. zeg uses the codes in section 6.
  message  the message argument, a description for people
```

- `CqrsError` extends `Error` [D-43].
- The constructor is public. It does not check the code [D-44].
- zeg adds no other properties [D-45].
- The error text of a `CqrsError` from zeg can change in any version. The class and the code are the API [D-47].

```js
const error = new CqrsError('HANDLER_NOT_FOUND', 'test');
error instanceof Error;  // true
error.name;              // 'CqrsError'
error.code;              // 'HANDLER_NOT_FOUND'
```

### 4.5 Handler load

- zeg loads a handler file at the first dispatch to that handler [D-17].
- zeg then checks the export. It must be a function, and its `prototype.handle` must be a function [D-15].
- After the check passes, zeg keeps the class for later dispatches [D-17].
- If the load or the check fails, zeg keeps nothing. The next dispatch loads the file again [D-17].

## 5. Message rules

### 5.1 Valid messages

A message must be an instance of a named class [D-21]:

```js
await command(new RegisterUser('a@b.c'));   // valid

await command({ email: 'a@b.c' });          // TypeError: plain object
await command([1, 2]);                      // TypeError: array
await command(null);                        // TypeError
await command('RegisterUser');              // TypeError: primitive
await command(new (class {})());            // TypeError: anonymous class
```

A subclass uses only its own name [D-22]:

```js
class AdminRegisterUser extends RegisterUser {}

await command(new AdminRegisterUser('a@b.c'));
// zeg uses only the key 'AdminRegisterUser'
```

### 5.2 Deep freeze

zeg freezes the message immediately before `handle()` runs [D-23]. It freezes these values:

- the message itself
- each nested plain object
- each nested array

zeg does not change other nested objects, and it does not walk them [D-24].

```js
class CreateOrder {
  constructor(items, meta, createdAt, bytes) {
    this.items = items;         // array: frozen
    this.meta = meta;           // plain object: frozen
    this.createdAt = createdAt; // Date: not changed
    this.bytes = bytes;         // Uint8Array: not changed
  }
}
```

A handler cannot change a frozen value. A change throws a `TypeError`. Array methods such as `push()` always throw. An assignment throws because ES modules use strict mode:

```js
export class CreateOrderHandler {
  handle(message) {
    message.items.push('x'); // TypeError: the array is frozen
  }
}
```

The caller's object stays frozen after the dispatch [D-28]. If the dispatch stops before deep freeze starts, zeg does not change the message [D-26]. If `Object.freeze` throws during deep freeze, the Promise rejects with that error, and `handle()` does not run [D-27].

## 6. Error codes

| Code | Source | Cause |
|---|---|---|
| `INVALID_CONFIG` | `configure()` throws | The options are not valid. See section 6.1. |
| `NOT_CONFIGURED` | the Promise of `command()` or `query()` rejects | No call to `configure()` returned without an error before the dispatch [D-38]. |
| `HANDLER_NOT_FOUND` | the Promise of `command()` or `query()` rejects | No handler of this kind has the message name as its key [D-39]. |
| `INVALID_HANDLER` | the Promise of `command()` or `query()` rejects | The handler module has no export whose name is the file name without `.js`, or the export does not pass the check in section 4.5 [D-41]. |
| `UNDEFINED_RESULT` | the Promise of `query()` rejects | The query handler returned `undefined` [D-36]. |

### 6.1 INVALID_CONFIG cases

`configure()` throws a `CqrsError` with the code `INVALID_CONFIG` in these cases [D-31]:

```js
configure();                                      // the argument is not an object
configure({ handlers: {} });                      // unknown key
configure({ commands: 'x' });                     // the value is not an object
configure({ commands: { './aHandler.js': {} } }); // the glob value is not a function

configure({ commands: import.meta.glob('./commands/**/*.js') });
// './commands/RegisterUser.js' does not end in Handler.js

// './commands/users/ImportHandler.js' and './commands/admin/ImportHandler.js'
// the same file name occurs two times in one kind

// './commands/GetUserHandler.js' and './queries/GetUserHandler.js'
// the same message name has a command handler and a query handler
```

### 6.2 Hints in HANDLER_NOT_FOUND

The error text contains a hint in two cases [D-40]:

```js
await command(new GetUser('a@b.c'));
// CqrsError HANDLER_NOT_FOUND
// the text says that a query handler exists and tells you to use query()
```

```js
// a build without keepNames renamed the class to RegisterUser$1
await command(new RegisterUser('a@b.c'));
// CqrsError HANDLER_NOT_FOUND
// the text names the keepNames setting in vite.config.js
```

If a build minifies the code and has no `keepNames`, the class name becomes a short name, for example `r`. Then the error text contains no hint.

### 6.3 Errors that zeg does not create

zeg does not create these errors:

- If a message is not valid, the Promise rejects with a `TypeError` [D-37].
- If `handle()` throws, the Promise rejects with the same error object [D-42].
- If the load of a handler file fails, the Promise rejects with the same error object [D-42].

An error from `handle()` can be a `CqrsError`. For example, a handler dispatches another message, and that dispatch rejects with `HANDLER_NOT_FOUND`. zeg does not wrap this error. As a result, the caller cannot see if the error came from its own dispatch or from a nested dispatch.

### 6.4 Example: catch an error

```js
import { command, CqrsError } from '@otar/zeg';
import { RegisterUser } from './commands/RegisterUser.js';

async function register(email) {
  try {
    await command(new RegisterUser(email));
  } catch (error) {
    if (error instanceof CqrsError && error.code === 'HANDLER_NOT_FOUND') {
      // this can also come from a nested dispatch (section 6.3)
      return new Response('not supported', { status: 501 });
    }
    throw error; // for example an error from the handler
  }
  return new Response(null, { status: 204 });
}
```

## 7. Tests

The tests run in Vitest with `@cloudflare/vitest-plugin` [D-61]. Vitest supports `import.meta.glob`.

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

```js
// test/users.test.js
import { it, expect } from 'vitest';
import { configure, command, query } from '@otar/zeg';
import { RegisterUser } from '../src/commands/RegisterUser.js';
import { GetUser } from '../src/queries/GetUser.js';

it('registers a user', async () => {
  configure({
    commands: import.meta.glob('../src/commands/**/*Handler.js'),
    queries: import.meta.glob('../src/queries/**/*Handler.js'),
  });
  await command(new RegisterUser('a@b.c'));
  expect(await query(new GetUser('a@b.c'))).toEqual({ email: 'a@b.c' });
});
```

### 7.3 Test with a fake handler

The glob output is a plain object. As a result, a test can write one by hand:

```js
import { it, expect } from 'vitest';
import { configure, query } from '@otar/zeg';
import { GetUser } from '../src/queries/GetUser.js';

it('uses a fake handler', async () => {
  class GetUserHandler {
    handle(message) {
      return { email: message.email, fake: true };
    }
  }
  configure({
    queries: { './GetUserHandler.js': async () => ({ GetUserHandler }) },
  });
  expect(await query(new GetUser('a@b.c'))).toEqual({ email: 'a@b.c', fake: true });
});
```

### 7.4 Test of one handler

A test can create a handler directly, without zeg. `GetUserHandler.handle()` is async, so the test uses `await`. The handler reads `env.DB`, so the test needs the setup in section 7.1.

```js
import { it, expect } from 'vitest';
import { GetUserHandler } from '../src/queries/GetUserHandler.js';
import { GetUser } from '../src/queries/GetUser.js';

it('returns null for an unknown user', async () => {
  const result = await new GetUserHandler().handle(new GetUser('nobody@b.c'));
  expect(result).toBeNull();
});
```

### 7.5 Module state in tests

Each test file gets a new module state. The tests in one file share the zeg registry.

If `wrangler.jsonc` has `main`, the plugin loads that module for each test file. As a result, the `configure()` call in `src/index.js` runs before the tests. For this reason, each test calls `configure()` with the handlers that it needs [D-29].

A test that needs a registry without configuration, for example a test for `NOT_CONFIGURED`, needs a Wrangler configuration without `main`. Another possibility is a `main` module that does not call `configure()`.

## 8. What zeg does not do

- no middleware, no events, no Cloudflare Queues [D-01]
- no context argument for handlers [D-18]
- no build with Wrangler only [D-06]
- no fallback to the handler of a parent class [D-22]
- no guard against recursive dispatch [D-20]
- no type declarations [D-50]
