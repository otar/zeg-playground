// src/commands/RegisterUserHandler.js
import { env } from 'cloudflare:workers';
import { command } from '@otar/zeg';
import SendWelcomeEmail from './SendWelcomeEmail.js';

export default class {
  async handle(message) {
    await env.DB.prepare('INSERT INTO users (email) VALUES (?)').bind(message.email).run();
    await command(new SendWelcomeEmail(message.email));
  }
}
