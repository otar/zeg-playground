// src/middleware/background.js
import { waitUntil } from 'cloudflare:workers';

// Runs a command in the background if its class has `static background = true`. The handler
// starts at once, but command() does not wait for it. waitUntil() keeps the Worker alive until the
// handler completes, also after the response. The caller does not get an error of the handler, so
// this function writes it.
export function background(message, next, { kind, key }) {
  if (kind !== 'command' || message.constructor.background !== true) {
    return next();
  }
  const work = next().catch((error) => {
    console.error(`${kind} ${key} failed in the background`, error);
  });
  waitUntil(work);
  return undefined;
}
