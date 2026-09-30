// src/index.js
import { Zeg, command, query } from '@otar/zeg';
import { logDispatch } from './middleware/logDispatch.js';
import { background } from './middleware/background.js';
import { traceDispatch } from './middleware/traceDispatch.js';
import RegisterUser from './commands/RegisterUser.js';
import GetUser from './queries/GetUser.js';

Zeg({
  commands: import.meta.glob('./commands/**/*.js', { eager: true }),
  queries: import.meta.glob('./queries/**/*.js', { eager: true }),
  middleware: [logDispatch, background, traceDispatch],
});

export default {
  async fetch(request) {
    // An extra route of this example. It shows the error for a message of the wrong kind.
    if (request.method === 'GET' && new URL(request.url).pathname === '/wrong-kind') {
      try {
        await command(new GetUser('a@b.c'));
        return new Response('the command did not reject', { status: 500 });
      } catch (error) {
        return Response.json({ name: error.name, code: error.code }, { status: 400 });
      }
    }

    const { email } = await request.json();
    await command(new RegisterUser(email));
    const user = await query(new GetUser(email));
    return Response.json(user);
  },
};
