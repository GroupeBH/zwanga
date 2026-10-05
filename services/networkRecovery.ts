// A confirmed offline -> online edge, not every connectivity notification.
// Kept independent of Redux/auth imports to avoid a startup dependency cycle.
let online = true;
let recoveryEpoch = 0;

export function observeNetworkConnection(connected: boolean) {
  if (connected && !online) recoveryEpoch += 1;
  online = connected;
}

export const getNetworkRecoveryEpoch = () => recoveryEpoch;
