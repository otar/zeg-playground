// A strict TypeScript project that imports zeg through the package name (REQ-138).
import { zeg, command, query, ZegError, type GlobOutput } from '@otar/zeg';

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

export async function check(): Promise<string> {
  zeg({ queries: [queries] });
  const user = await query<{ email: string }>(new GetUser('a@b.c'));
  const done: undefined = await command(new GetUser('a@b.c'));
  const error = new ZegError('INVALID_CONFIG', 'text');
  // @ts-expect-error: without a type argument, the result of query() is unknown
  void (await query(new GetUser('a@b.c'))).email;
  // @ts-expect-error: a message must be an object
  await command('RegisterUser');
  // @ts-expect-error: zeg() has no option handlers
  zeg({ handlers: queries });
  return `${user.email} ${error.code} ${String(done)}`;
}
