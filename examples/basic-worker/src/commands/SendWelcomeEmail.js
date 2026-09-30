// src/commands/SendWelcomeEmail.js
export default class {
  // The middleware function background runs this command in the background.
  static background = true;

  constructor(email) {
    this.email = email;
  }
}
