// src/commands/billing/ChargeCard.js
export default class {
  constructor(userEmail, amount) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new TypeError('amount must be a positive integer');
    }
    this.userEmail = userEmail;
    this.amount = amount;
  }
}
