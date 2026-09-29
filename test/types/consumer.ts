// A strict TypeScript project that imports Zeg through the package name (REQ-138).
import {
  Zeg,
  command,
  query,
  ZegError,
  type DispatchInfo,
  type GlobOutput,
  type Middleware,
} from '@otar/zeg';

class GetUser {
  email: string;

  constructor(email: string) {
    this.email = email;
  }
}

class GetUserHandler {
  handle(message: GetUser): { email: string } {
    return { email: message.email };
  }
}

const queries: GlobOutput = {
  './GetUser.ts': { default: GetUser },
  './GetUserHandler.ts': { default: GetUserHandler },
};

const keys: string[] = [];

const logDispatch: Middleware = (message, next, info: DispatchInfo) => {
  keys.push(`${info.kind} ${info.key}`);
  return next();
};

// @ts-expect-error: next() takes no arguments
const withArgument: Middleware = (message, next) => next(1);

export async function check(): Promise<string> {
  Zeg({ queries: [queries], middleware: [logDispatch, withArgument] });
  // @ts-expect-error: each middleware entry must be a function
  Zeg({ middleware: ['x'] });
  const user = await query<{ email: string }>(new GetUser('a@b.c'));
  const done: undefined = await command(new GetUser('a@b.c'));
  const error = new ZegError('INVALID_CONFIG', 'text');
  // @ts-expect-error: without a type argument, the result of query() is unknown
  void (await query(new GetUser('a@b.c'))).email;
  // @ts-expect-error: a message must be an object
  await command('RegisterUser');
  // @ts-expect-error: Zeg() has no option handlers
  Zeg({ handlers: queries });
  return `${user.email} ${error.code} ${String(done)} ${keys.join()}`;
}
