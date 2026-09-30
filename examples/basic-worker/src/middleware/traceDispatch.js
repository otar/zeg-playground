// src/middleware/traceDispatch.js
import { tracing } from 'cloudflare:workers';

// Runs each dispatch in a span, for example "command ./commands/RegisterUser". Without tracing,
// the span records nothing, and the dispatch runs as before.
export function traceDispatch(message, next, { kind, key }) {
  return tracing.enterSpan(`${kind} ${key}`, () => next());
}
