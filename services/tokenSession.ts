// Synchronous identity boundary. A refresh rotates tokens, not this generation.
let generation = 0;
export const getTokenSessionVersion = () => generation;
export const invalidateTokenSession = () => {
  ++generation;
  // Synchronous native identity invalidation precedes any queued secure-store write.
  try { require('react-native').NativeModules?.ZwangaDriverAlerts?.clearNativeRideAccount?.(); }
  catch { /* Older binaries have no native delivery account. */ }
  return generation;
};

let writes: Promise<unknown> = Promise.resolve();
/** SecureStore writes/deletes must finish in invocation order, including logout. */
export function enqueueTokenWrite<T>(operation: () => Promise<T>): Promise<T> {
  const next = writes.then(operation, operation);
  writes = next.catch(() => undefined);
  return next;
}
