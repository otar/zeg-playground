# Changelog

This file lists the changes of Zeg that users can see. Zeg follows semantic versioning (see "Versioning" in `README.md`).

## 0.1.0 (unreleased)

This is the first version of Zeg.

- `Zeg()` sets the pairs of message classes and handler classes from the glob outputs of `import.meta.glob` with `{ eager: true }`. `command()` and `query()` dispatch a message to its handler.
- The option `middleware` of `Zeg()` is an array of middleware functions. They run around the handler of each dispatch.
- `ZegError` has the codes `INVALID_CONFIG`, `NOT_CONFIGURED`, `HANDLER_NOT_FOUND`, `UNDEFINED_RESULT` and `NEXT_CALLED_TWICE`.
- Message files and handler files can be `.js` files or `.ts` files. A pair uses one extension.
- `Zeg()` checks all files, pairs and classes when the Worker starts. It also rejects a glob output with no files.
- The error texts of common mistakes name the fix.
- The package contains type declarations in `src/zeg.d.ts`.
- In TypeScript, a query message class can state its result type with `declare readonly result?: T`. Then `query()` returns `Promise<T>` without a type argument.
