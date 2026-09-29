// src/middleware/logDispatch.js
export async function logDispatch(message, next, { kind, key }) {
  console.log(`${kind} ${key}`);
  try {
    return await next();
  } catch (error) {
    console.error(`${kind} ${key} failed`, error);
    throw error;
  }
}
