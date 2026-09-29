# Changelog

This file lists the changes of zeg that users can see. zeg follows semantic versioning (see "Versioning" in `README.md`).

## 0.1.0 (unreleased)

This is the first version of zeg.

- `zeg()` sets the pairs of message classes and handler classes from the glob outputs of `import.meta.glob` with `{ eager: true }`. `command()` and `query()` dispatch a message to its handler.
- `ZegError` has the codes `INVALID_CONFIG`, `NOT_CONFIGURED`, `HANDLER_NOT_FOUND` and `UNDEFINED_RESULT`.
- Message files and handler files can be `.js` files or `.ts` files. A pair uses one extension.
- `zeg()` checks all files, pairs and classes when the Worker starts. It also rejects a glob output with no files.
- The error texts of common mistakes name the fix.
- The package contains type declarations in `src/zeg.d.ts`.
