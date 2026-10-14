import { proactiveTokenRefresh } from './tokenRefresh';
import { getTokenSessionVersion } from './tokenSession';
import { chatSocket } from './chatSocket';
import { trackingSocket } from './trackingSocket';

let pending: { version: number; promise: Promise<void> } | null = null;

/** Called on real network/foreground recovery, not on each GPS sample. */
export function recoverSocketConnections() {
  if (!chatSocket.hasActiveSubscriptions() && !trackingSocket.hasActiveSubscriptions()) return Promise.resolve();
  const version = getTokenSessionVersion();
  if (pending?.version === version) return pending.promise;
  const work = (async () => {
    try {
      await proactiveTokenRefresh();
      if (version !== getTokenSessionVersion()) return;
      chatSocket.resumeConnection();
      trackingSocket.resumeConnection();
    } catch { /* Keep session and subscriptions for a later recovery event. */ }
  })();
  pending = { version, promise: work };
  void work.finally(() => { if (pending?.promise === work) pending = null; });
  return work;
}
