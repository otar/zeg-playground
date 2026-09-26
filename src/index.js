// zeg: a small CQRS library for Cloudflare Workers.
// The rules are in docs/spec.md. Z1 to Z8 and S1 to S8 refer to its sections 2 and 3.

const KINDS = ['commands', 'queries'];
const CALLS = { commands: 'command()', queries: 'query()' };

// The registry: for each kind, a Map from the prototype of a message class to its pair.
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
  if (!isObject(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const fail = (text) => {
  throw new ZegError('INVALID_CONFIG', `zeg(): ${text}`);
};

export function zeg(options) {
  // Z1
  if (!isPlainObject(options)) fail('the options must be a plain object');

  // Z2
  for (const name of Reflect.ownKeys(options)) {
    if (name !== 'commands' && name !== 'queries') fail(`unknown option ${String(name)}`);
  }

  // Z3: for each kind, a list of [label, glob output]
  const lists = {};
  for (const kind of KINDS) {
    const value = Object.hasOwn(options, kind) ? options[kind] : undefined;
    const list = [];
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const label = `${kind}[${i}]`;
        // A hole reads as undefined, also if Array.prototype has a value at this index.
        const output = Object.hasOwn(value, i) ? value[i] : undefined;
        if (!isPlainObject(output)) fail(`${label} must be a plain object`);
        list.push([label, output]);
      }
    } else if (isPlainObject(value)) {
      list.push([kind, value]);
    } else if (value !== undefined) {
      fail(`${kind} must be a glob output or an array of glob outputs`);
    }
    lists[kind] = list;
  }

  // Z4: check each file and read its class one time
  const outputs = [];
  for (const kind of KINDS) {
    for (const [label, output] of lists[kind]) {
      const files = new Map();
      for (const path of Object.keys(output)) {
        const where = `${label} ${path}`;
        if (!path.endsWith('.js')) fail(`${where}: the file path must end in .js`);
        const module = output[path];
        if (!isObject(module)) fail(`${where}: the module must be an object`);
        const cls = module.default;
        if (cls === undefined) fail(`${where}: the file has no default export`);
        const isHandler = path.endsWith('Handler.js');
        const proto = typeof cls === 'function' ? cls.prototype : undefined;
        if (isHandler) {
          if (!proto || typeof proto.handle !== 'function') {
            fail(`${where}: the default export must be a class with a handle() method`);
          }
        } else if (!isObject(proto)) {
          fail(`${where}: the default export must be a class`);
        }
        files.set(path, { isHandler, cls, proto, where });
      }
      outputs.push({ kind, label, files });
    }
  }

  // Z5: form the pairs in each glob output
  const pairs = [];
  for (const { kind, label, files } of outputs) {
    for (const [path, file] of files) {
      if (file.isHandler) {
        const messagePath = `${path.slice(0, -10)}.js`;
        const message = files.get(messagePath);
        if (path === 'Handler.js' || path.endsWith('/Handler.js')) {
          fail(`${file.where}: the file name has no message name before Handler.js`);
        }
        if (!message) fail(`${file.where}: no message file ${messagePath}`);
        if (message.isHandler) fail(`${file.where}: ${messagePath} is a handler file, not a message file`);
      } else {
        const handlerPath = `${path.slice(0, -3)}Handler.js`;
        const handler = files.get(handlerPath);
        if (!handler) fail(`${file.where}: no handler file ${handlerPath}`);
        pairs.push({ kind, label, key: path.slice(0, -3), where: file.where, proto: file.proto, Handler: handler.cls });
      }
    }
  }

  // Z6: no two message classes with the same prototype
  const seen = new Map();
  for (const pair of pairs) {
    const other = seen.get(pair.proto);
    if (other) fail(`${other.where} and ${pair.where} have the same message class`);
    seen.set(pair.proto, pair);
  }

  // Z7
  const next = { commands: new Map(), queries: new Map() };
  for (const pair of pairs) next[pair.kind].set(pair.proto, pair);
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
    throw new TypeError(`${call}: the message must be an instance of a class, not an array or a plain object`);
  }

  // S3
  if (!registry) throw new ZegError('NOT_CONFIGURED', `${call}: call zeg() first`);

  // S4
  const pair = registry[kind].get(proto);
  if (!pair) {
    const other = registry[kind === 'commands' ? 'queries' : 'commands'].get(proto);
    throw new ZegError(
      'HANDLER_NOT_FOUND',
      other
        ? `${call}: the message file ${other.key} is in ${other.label}. Use ${CALLS[other.kind]}`
        : `${call}: no pair for the class of the message`,
    );
  }

  // S5 to S7
  const value = await new pair.Handler().handle(message);

  // S8
  if (kind === 'commands') return undefined;
  if (value === undefined) {
    throw new ZegError('UNDEFINED_RESULT', `query(): the handler of ${pair.key} returned undefined`);
  }
  return value;
}

export const command = (message) => dispatch('commands', message);

export const query = (message) => dispatch('queries', message);
