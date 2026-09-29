// Zeg: a small CQRS library for Cloudflare Workers.
// The rules are in docs/spec.md. Z1 to Z8 and S1 to S9 refer to its sections 2 and 3.

// The kinds, each with the name of its dispatch function
const NAMES = { commands: 'command', queries: 'query' };
const KINDS = Object.keys(NAMES);
const OPTIONS = [...KINDS, 'middleware'];

// The registry: a Map from the prototype of a message class to its pair, for both kinds.
// It is null until the first call to Zeg() returns.
let registry = null;
// The middleware functions. Z7 sets them together with the registry.
let middleware;

/**
 * The result of `import.meta.glob(patterns, { eager: true })`. Each property name is a file path,
 * and each property value is the module of that file.
 *
 * @typedef {Record<string, unknown>} GlobOutput
 */

/**
 * The kind and the key of a message, for a middleware function.
 *
 * @typedef {object} DispatchInfo
 * @property {'command' | 'query'} kind `'command'` for `command()`, `'query'` for `query()`.
 * @property {string} key The file path of the message file without the extension, for example
 *   `'./commands/RegisterUser'`.
 */

/**
 * A function that runs around the handler of each dispatch. It can do work before and after
 * `next()`, change the result of a query, or stop the dispatch with an error. If it returns without
 * a call to `next()`, the handler does not run.
 *
 * @callback Middleware
 * @param {object} message The message, as the caller gave it.
 * @param {() => Promise<unknown>} next Runs the next middleware function, or the handler after the
 *   last function. It takes no arguments. For a query, it resolves to the value of the next
 *   middleware function or of the handler. For a command, it resolves to `undefined`. A second call
 *   rejects with a `ZegError` with the code `NEXT_CALLED_TWICE`.
 * @param {DispatchInfo} info The kind and the key of the message.
 * @returns {unknown} For a query, the value for `next()` of the previous middleware function. The
 *   value of the first function is the result of `query()`.
 */

/**
 * The error class of Zeg. Use the class and the `code` to identify an error. The error text can
 * change in any version.
 *
 * Zeg uses the codes `INVALID_CONFIG`, `NOT_CONFIGURED`, `HANDLER_NOT_FOUND`, `UNDEFINED_RESULT`
 * and `NEXT_CALLED_TWICE`.
 *
 * @example
 * try {
 *   await command(new RegisterUser('a@b.c'));
 * } catch (error) {
 *   if (error instanceof ZegError) {
 *     // A ZegError shows a bug in the project, for example a missing pair.
 *     console.error(error.code, error.message);
 *   }
 *   throw error;
 * }
 */
export class ZegError extends Error {
  /**
   * @param {string} code The error code. The constructor does not check it at runtime.
   * @param {string} [message] The error text.
   */
  constructor(code, message) {
    super(message);
    // Set explicitly, because a minified build can change the class name.
    this.name = 'ZegError';
    /** The error code, for example `'HANDLER_NOT_FOUND'`. */
    this.code = code;
  }
}

const isObject = (value) => typeof value === 'object' && value !== null;

const isPlainObject = (value) => {
  if (!isObject(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const fail = (text) => {
  throw new ZegError('INVALID_CONFIG', `Zeg(): ${text}`);
};

/**
 * Sets the pairs of message classes and handler classes, and the middleware functions. Each call
 * replaces all pairs and all middleware functions.
 *
 * `Zeg()` checks all options before it changes the pairs and the middleware functions. If `Zeg()`
 * throws, the pairs and the middleware functions of the previous call stay active.
 *
 * @param {object} options The glob outputs of the command files and the query files, and the
 *   middleware functions.
 * @param {GlobOutput | GlobOutput[]} [options.commands] The command files.
 * @param {GlobOutput | GlobOutput[]} [options.queries] The query files.
 * @param {Middleware[]} [options.middleware] The middleware functions of each dispatch. The first
 *   function is the outermost. `Zeg()` copies the array.
 * @returns {undefined}
 * @throws {ZegError} With the code `INVALID_CONFIG` if the options, the files, the pairs or the
 *   classes are not valid. If user code throws a value while `Zeg()` reads the options, `Zeg()`
 *   throws the same value. Examples are a getter, a Proxy or a module in an import cycle.
 * @example
 * Zeg({
 *   commands: import.meta.glob('./commands/*.js', { eager: true }),
 *   queries: import.meta.glob('./queries/*.js', { eager: true }),
 *   middleware: [logDispatch],
 * });
 */
export function Zeg(options) {
  // Z1
  if (!isPlainObject(options)) {
    fail('the options must be a plain object');
  }

  // Z2
  for (const key of Reflect.ownKeys(options)) {
    // A symbol becomes a text such as 'Symbol(commands)', which is not a kind.
    const name = String(key);
    if (!OPTIONS.includes(name)) {
      fail(`unknown option ${name}. The options are commands, queries, middleware`);
    }
  }

  // Z3: a list of [kind, label, glob output]
  const outputs = [];
  for (const kind of KINDS) {
    const value = Object.hasOwn(options, kind) ? options[kind] : undefined;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const label = `${kind}[${i}]`;
        // A hole reads as undefined, also if Array.prototype has a value at this index.
        const output = Object.hasOwn(value, i) ? value[i] : undefined;
        if (!isPlainObject(output)) {
          fail(`${label} must be a plain object`);
        }
        outputs.push([kind, label, output]);
      }
    } else if (isPlainObject(value)) {
      outputs.push([kind, kind, value]);
    } else if (value !== undefined) {
      fail(`${kind} must be a glob output or an array of glob outputs`);
    }
  }

  // Z3: the middleware functions. The copy ignores a later change of the array.
  const functions = [];
  const value = Object.hasOwn(options, 'middleware') ? options.middleware : undefined;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const fn = Object.hasOwn(value, i) ? value[i] : undefined;
      if (typeof fn !== 'function') {
        fail(`middleware[${i}] must be a function`);
      }
      functions.push(fn);
    }
  } else if (value !== undefined) {
    fail('middleware must be an array of functions');
  }

  // Z4: check each file and read its class one time
  const checked = [];
  for (const [kind, label, output] of outputs) {
    const files = new Map();
    const paths = Object.keys(output);
    // A glob pattern with no match gives a glob output with no files. Vite does not warn about it.
    if (paths.length === 0) {
      fail(`${label}: the glob output has no files. Check the glob pattern`);
    }
    for (const path of paths) {
      const where = `${label} ${path}`;
      // A pair uses one extension: X.js with XHandler.js, or X.ts with XHandler.ts.
      const ext = path.slice(-3);
      if ((ext !== '.js' && ext !== '.ts') || path.endsWith('.d.ts')) {
        fail(`${where}: the file path must end in .js or .ts, but not in .d.ts`);
      }
      const module = output[path];
      if (!isObject(module)) {
        fail(
          `${where}: the module must be an object. Use import.meta.glob() with { eager: true } and without the import option`,
        );
      }
      const cls = module.default;
      const isHandler = path.endsWith(`Handler${ext}`);
      const proto = typeof cls === 'function' ? cls.prototype : undefined;
      if (isHandler) {
        if (!proto || typeof proto.handle !== 'function') {
          fail(
            `${where}: the file must have a default export that is a class with a handle() method on its prototype`,
          );
        }
      } else if (!isObject(proto)) {
        fail(`${where}: the file must have a default export that is a class`);
      }
      files.set(path, { ext, isHandler, cls, proto, where });
    }
    checked.push({ kind, label, files });
  }

  // Z5: form the pairs in each glob output. The Map is the next registry. Z6 fails only after Z5 is complete.
  const next = new Map();
  let duplicate;
  for (const { kind, label, files } of checked) {
    for (const [path, file] of files) {
      if (file.isHandler) {
        // The path before "Handler.js" or "Handler.ts"
        const base = path.slice(0, -10);
        const messagePath = `${base}${file.ext}`;
        const message = files.get(messagePath);
        if (base === '' || base.endsWith('/')) {
          fail(`${file.where}: the file name has no message name before Handler${file.ext}`);
        }
        if (!message) {
          fail(`${file.where}: no message file ${messagePath}`);
        }
        if (message.isHandler) {
          fail(`${file.where}: ${messagePath} is a handler file, not a message file`);
        }
      } else {
        const key = path.slice(0, -3);
        const handlerPath = `${key}Handler${file.ext}`;
        const handler = files.get(handlerPath);
        if (!handler) {
          fail(`${file.where}: no handler file ${handlerPath}`);
        }
        const other = next.get(file.proto);
        if (other) {
          duplicate ??= `${other.where} and ${file.where} have the same message class`;
        } else {
          next.set(file.proto, {
            kind,
            label,
            key,
            where: file.where,
            Handler: handler.cls,
          });
        }
      }
    }
  }

  // Z6: no two message classes with the same prototype
  if (duplicate) {
    fail(duplicate);
  }

  // Z7
  registry = next;
  middleware = functions;
}

async function dispatch(kind, message) {
  const call = `${NAMES[kind]}()`;

  // S2
  let proto;
  if (
    !isObject(message) ||
    Array.isArray(message) ||
    (proto = Object.getPrototypeOf(message)) === Object.prototype ||
    proto === null
  ) {
    throw new TypeError(
      `${call}: the message must be an instance of a class, not an array or a plain object`,
    );
  }

  // S3
  if (!registry) {
    throw new ZegError('NOT_CONFIGURED', `${call}: call Zeg() first`);
  }

  // S4
  const pair = registry.get(proto);
  if (pair?.kind !== kind) {
    throw new ZegError(
      'HANDLER_NOT_FOUND',
      pair
        ? `${call}: the message file ${pair.key} is in ${pair.label}. Use ${NAMES[pair.kind]}()`
        : `${call}: the class of the message is not the default export of a message file in ${kind}`,
    );
  }

  // S5: a running dispatch keeps the middleware functions that were active when it started.
  const chain = middleware;
  const info = { kind: NAMES[kind], key: pair.key };
  let last = -1;
  const step = async (i) => {
    if (i <= last) {
      throw new ZegError(
        'NEXT_CALLED_TWICE',
        `${call}: a middleware of ${pair.key} called next() two times`,
      );
    }
    last = i;
    let value;
    if (i < chain.length) {
      // A call without a receiver. As a result, `this` of the function is not the list.
      const fn = chain[i];
      value = await fn(message, () => step(i + 1), info);
    } else {
      // S6 to S8
      value = await new pair.Handler().handle(message);
    }
    // For a command, each next() resolves to undefined (D-83).
    return kind === 'queries' ? value : undefined;
  };
  const value = await step(0);

  // S9
  if (kind === 'commands') {
    return undefined;
  }
  if (value === undefined) {
    throw new ZegError(
      'UNDEFINED_RESULT',
      `query(): the handler or a middleware of ${pair.key} returned undefined. Return null for no value`,
    );
  }
  return value;
}

/**
 * Dispatches a command to its handler. Zeg finds the handler through the class of the message.
 *
 * @param {object} message An instance of a message class from the `commands` option.
 * @returns {Promise<undefined>} Resolves to `undefined` when the dispatch is complete. Rejects with
 *   a `TypeError` if the message is not an object, or if it is `null`, a function, an array or a
 *   plain object. Rejects with a `ZegError` with the code `NOT_CONFIGURED` or `HANDLER_NOT_FOUND`
 *   if Zeg cannot find the handler. If a step of the dispatch throws a value, rejects with the
 *   same value. Examples are a Proxy trap of the message, a middleware function, the handler
 *   constructor and the call of `handle()`. If the Promise from a middleware function or from
 *   `handle()` rejects, rejects with the same value. A second call to `next()` in a middleware
 *   function rejects with a `ZegError` with the code `NEXT_CALLED_TWICE`.
 * @example
 * await command(new RegisterUser('a@b.c'));
 */
export function command(message) {
  return dispatch('commands', message);
}

/**
 * Dispatches a query to its handler. Zeg finds the handler through the class of the message.
 *
 * @template [T=unknown]
 * @param {object} message An instance of a message class from the `queries` option.
 * @returns {Promise<T>} Resolves to the return value of `handle()`, after `await`. With middleware
 *   functions, resolves to the value of the first middleware function, after `await`. Rejects with
 *   a `ZegError` with the code `UNDEFINED_RESULT` if this value is `undefined`. The other errors are
 *   the same as for {@link command}.
 * @example
 * const user = await query(new GetUser('a@b.c'));
 */
export function query(message) {
  return dispatch('queries', message);
}
