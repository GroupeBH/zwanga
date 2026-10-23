import type { Socket } from 'socket.io-client';

/** A server disconnect disables Socket.IO's automatic reconnection. Only the
 * explicit temporary-outage signal may restart it; never retry a revoked session. */
export function bindSocketRestartRecovery(socket: Socket, reconnect: () => Promise<unknown>, current: () => boolean) {
  let stopped = false;
  let attempts = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let stable: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { clearTimeout(retry); retry = undefined; };
  const onRestart = (payload: unknown) => {
    if (stopped || !current() || retry || attempts >= 5 || !payload || typeof payload !== 'object') return;
    const signal = payload as { reconnect?: unknown; retryAfterSeconds?: unknown };
    if (signal.reconnect !== true) return;
    const seconds = typeof signal.retryAfterSeconds === 'number' && Number.isFinite(signal.retryAfterSeconds)
      ? signal.retryAfterSeconds : 5;
    const delay = Math.min(60_000, Math.max(5000, seconds * 1000) * 2 ** attempts + Math.floor(Math.random() * 1000));
    retry = setTimeout(() => {
      retry = undefined;
      if (stopped || !current() || socket.connected) return;
      attempts++;
      void reconnect().catch(() => undefined); // Transport retries remain bounded by socketConnectionOptions.
    }, delay);
  };
  const onConnect = () => {
    cancel();
    clearTimeout(stable);
    // A transport handshake alone does not prove server authentication succeeded.
    stable = setTimeout(() => { if (!stopped && current() && socket.connected) attempts = 0; }, 30_000);
  };
  const onDisconnect = () => { clearTimeout(stable); };
  const onExpired = () => { cancel(); clearTimeout(stable); attempts = 5; };
  socket.on('server_restart', onRestart);
  socket.on('connect', onConnect);
  socket.on('disconnect', onDisconnect);
  socket.on('session_expired', onExpired);
  return () => {
    stopped = true;
    cancel(); clearTimeout(stable);
    socket.off('server_restart', onRestart); socket.off('connect', onConnect);
    socket.off('disconnect', onDisconnect); socket.off('session_expired', onExpired);
  };
}
