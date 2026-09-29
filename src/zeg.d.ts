export type GlobOutput = Record<string, unknown>;
/**
 * The result of `import.meta.glob(patterns, { eager: true })`. Each property name is a file path,
 * and each property value is the module of that file.
 *
 * @typedef {Record<string, unknown>} GlobOutput
 */
/**
 * The error class of zeg. Use the class and the `code` to identify an error. The error text can
 * change in any version.
 *
 * zeg uses the codes `INVALID_CONFIG`, `NOT_CONFIGURED`, `HANDLER_NOT_FOUND` and
 * `UNDEFINED_RESULT`.
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
 * Sets the pairs of message classes and handler classes. Each call replaces all pairs.
 *
 * `zeg()` checks all options before it changes the pairs. If `zeg()` throws, the pairs of the
 * previous call stay active.
 *
 * @param {object} options The glob outputs of the command files and the query files.
 * @param {GlobOutput | GlobOutput[]} [options.commands] The command files.
 * @param {GlobOutput | GlobOutput[]} [options.queries] The query files.
 * @returns {undefined}
 * @throws {ZegError} With the code `INVALID_CONFIG` if the options, the files, the pairs or the
 *   classes are not valid. If user code throws a value while `zeg()` reads the options, `zeg()`
 *   throws the same value. Examples are a getter, a Proxy or a module in an import cycle.
 * @example
 * zeg({
 *   commands: import.meta.glob('./commands/*.js', { eager: true }),
 *   queries: import.meta.glob('./queries/*.js', { eager: true }),
 * });
 */
export declare function zeg(options: {
  commands?: GlobOutput | GlobOutput[];
  queries?: GlobOutput | GlobOutput[];
}): undefined;
/**
 * Dispatches a command to its handler. zeg finds the handler through the class of the message.
 *
 * @param {object} message An instance of a message class from the `commands` option.
 * @returns {Promise<undefined>} Resolves to `undefined` when `handle()` is complete. Rejects with
 *   a `TypeError` if the message is not an object, or if it is `null`, a function, an array or a
 *   plain object. Rejects with a `ZegError` with the code `NOT_CONFIGURED` or `HANDLER_NOT_FOUND`
 *   if zeg cannot find the handler. If a step of the dispatch throws a value, rejects with the
 *   same value. Examples are a Proxy trap of the message, the handler constructor and the call of
 *   `handle()`. If the Promise from `handle()` rejects, rejects with the same value.
 * @example
 * await command(new RegisterUser('a@b.c'));
 */
export declare function command(message: object): Promise<undefined>;
/**
 * Dispatches a query to its handler. zeg finds the handler through the class of the message.
 *
 * @template [T=unknown]
 * @param {object} message An instance of a message class from the `queries` option.
 * @returns {Promise<T>} Resolves to the return value of `handle()`, after `await`. Rejects with a
 *   `ZegError` with the code `UNDEFINED_RESULT` if this value is `undefined`. The other errors are
 *   the same as for {@link command}.
 * @example
 * const user = await query(new GetUser('a@b.c'));
 */
export declare function query<T = unknown>(message: object): Promise<T>;
