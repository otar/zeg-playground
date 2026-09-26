// src/commands/SendWelcomeEmailHandler.js
import { welcomeText } from './_email.js';

export default class {
  handle(message) {
    console.log(welcomeText(message.email));
  }
}
