// A confirmed offline -> online edge, not every connectivity notification.
// Kept independent of Redux/auth imports to avoid a startup dependency cycle.
let online = true;
let recoveryEpoch = 0;
const connectionListeners = new Set<() => void>();
export function subscribeConnectionRecovery(listener: () => void) {
  connectionListeners.add(listener);
  return () => { connectionListeners.delete(listener); };
}
export function notifyConnectionRecovery() {
  connectionListeners.forEach(listener => { try { listener(); } catch { /* Isolate subscribers. */ } });
}

export function observeNetworkConnection(connected: boolean) {
  const recovered = connected && !online;
  if (recovered) recoveryEpoch += 1;
  online = connected;
  if (recovered) notifyConnectionRecovery();
}

export const getNetworkRecoveryEpoch = () => recoveryEpoch;
