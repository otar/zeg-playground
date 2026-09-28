// zeg: a small CQRS library for Cloudflare Workers.
// The rules are in docs/spec.md. Z1 to Z8 and S1 to S8 refer to its sections 2 and 3.

const CALLS = { commands: 'command()', queries: 'query()' };
const KINDS = Object.keys(CALLS);

// The registry: a Map from the prototype of a message class to its pair, for both kinds.
// It is null until the first call to zeg() returns.
let registry = null;

export class ZegError extends Error {
  constructor(code, message) {
    super(message);
    // Set explicitly, because a minified build can change the class name.
    this.name = 'ZegError';
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
  throw new ZegError('INVALID_CONFIG', `zeg(): ${text}`);
};

export function zeg(options) {
  // Z1
  if (!isPlainObject(options)) {
    fail('the options must be a plain object');
  }

  // Z2
  for (const name of Reflect.ownKeys(options)) {
    if (!KINDS.includes(name)) {
      fail(`unknown option ${String(name)}`);
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

  // Z4: check each file and read its class one time
  const checked = [];
  for (const [kind, label, output] of outputs) {
    const files = new Map();
    for (const path of Object.keys(output)) {
      const where = `${label} ${path}`;
      if (!path.endsWith('.js')) {
        fail(`${where}: the file path must end in .js`);
      }
      const module = output[path];
      if (!isObject(module)) {
        fail(`${where}: the module must be an object`);
      }
      const cls = module.default;
      const isHandler = path.endsWith('Handler.js');
      const proto = typeof cls === 'function' ? cls.prototype : undefined;
      if (isHandler) {
        if (!proto || typeof proto.handle !== 'function') {
          fail(
            `${where}: the file must have a default export that is a class with a handle() method`,
          );
        }
      } else if (!isObject(proto)) {
        fail(`${where}: the file must have a default export that is a class`);
      }
      files.set(path, { isHandler, cls, proto, where });
    }
    checked.push({ kind, label, files });
  }

  // Z5: form the pairs in each glob output. The Map is the next registry. Z6 fails only after Z5 is complete.
  const next = new Map();
  let duplicate;
  for (const { kind, label, files } of checked) {
    for (const [path, file] of files) {
      if (file.isHandler) {
        const messagePath = `${path.slice(0, -10)}.js`;
        const message = files.get(messagePath);
        if (path === 'Handler.js' || path.endsWith('/Handler.js')) {
          fail(`${file.where}: the file name has no message name before Handler.js`);
        }
        if (!message) {
          fail(`${file.where}: no message file ${messagePath}`);
        }
        if (message.isHandler) {
          fail(`${file.where}: ${messagePath} is a handler file, not a message file`);
        }
      } else {
        const key = path.slice(0, -3);
        const handlerPath = `${key}Handler.js`;
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
}

async function dispatch(kind, message) {
  const call = CALLS[kind];

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
    throw new ZegError('NOT_CONFIGURED', `${call}: call zeg() first`);
  }

  // S4
  const pair = registry.get(proto);
  if (pair?.kind !== kind) {
    throw new ZegError(
      'HANDLER_NOT_FOUND',
      pair
        ? `${call}: the message file ${pair.key} is in ${pair.label}. Use ${CALLS[pair.kind]}`
        : `${call}: no pair for the class of the message`,
    );
  }

  // S5 to S7
  const value = await new pair.Handler().handle(message);

  // S8
  if (kind === 'commands') {
    return undefined;
  }
  if (value === undefined) {
    throw new ZegError(
      'UNDEFINED_RESULT',
      `query(): the handler of ${pair.key} returned undefined`,
    );
  }
  return value;
}

export const command = (message) => dispatch('commands', message);

export const query = (message) => dispatch('queries', message);
