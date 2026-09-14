import { BoundedCache } from './boundedCache';

const recentWarnings = new BoundedCache<boolean>(64);

/** Preserve diagnostics while avoiding repeated native logging during a network outage. */
export function warnThrottled(message: string, ...details: unknown[]) {
  if (!__DEV__ && recentWarnings.get(message)) return;
  recentWarnings.set(message, true, 30_000);
  console.warn(message, ...details);
}
