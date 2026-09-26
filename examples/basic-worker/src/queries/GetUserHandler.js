// src/queries/GetUserHandler.js
import { env } from 'cloudflare:workers';

export default class {
  async handle(message) {
    const user = await env.DB.prepare('SELECT email FROM users WHERE email = ?')
      .bind(message.email)
      .first();
    return user; // the row, or null if no row exists
  }
}
