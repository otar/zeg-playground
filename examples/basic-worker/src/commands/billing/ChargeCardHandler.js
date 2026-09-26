// src/commands/billing/ChargeCardHandler.js
export default class {
  handle(message) {
    console.log(`charge ${message.amount} to ${message.userEmail}`);
  }
}
