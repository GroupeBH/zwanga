/** Finite bursts. Network/foreground/token recovery may start another burst. */
export const socketConnectionOptions = {
  transports: ['websocket'], autoConnect: false,
  reconnectionAttempts: 5, reconnectionDelay: 1000, reconnectionDelayMax: 10000,
  randomizationFactor: 0.5, timeout: 8000,
};
