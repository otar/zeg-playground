export default class {
  handle(message: { text: string }): string {
    return `pong ${message.text}`;
  }
}
