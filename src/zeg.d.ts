export type GlobOutput = Record<string, unknown>;
export type DispatchInfo = {
  /**
   * `'command'` for `command()`, `'query'` for `query()`.
   */
  kind: 'command' | 'query';
  /**
   * The file path of the message file without the extension, for example
   * `'./commands/RegisterUser'`.
   */
  key: string;
};
export type Middleware = (
  message: object,
  next: () => Promise<unknown>,
  info: DispatchInfo,
) => unknown;
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
export declare class ZegError extends Error {
  /** The error code, for example `'HANDLER_NOT_FOUND'`. */
  code: string;
  /**
   * @param {string} code The error code. The constructor does not check it at runtime.
   * @param {string} [message] The error text.
   */
  constructor(code: string, message?: string);
}
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
export declare function Zeg(options: {
  commands?: GlobOutput | GlobOutput[];
  queries?: GlobOutput | GlobOutput[];
  middleware?: Middleware[];
}): undefined;
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
export declare function command(message: object): Promise<undefined>;
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
export declare function query<T = unknown>(message: object): Promise<T>;
