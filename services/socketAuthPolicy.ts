import type { Socket } from 'socket.io-client';
import { getValidAccessToken } from '@/services/tokenRefresh';
import { getTokenSessionVersion } from './tokenSession';

export const SOCKET_CONNECTION_OPTIONS = {
  autoConnect: false,
  timeout: 8_000,
  reconnectionAttempts: 5,
  reconnectionDelay: 1_000,
  reconnectionDelayMax: 10_000,
  randomizationFactor: 0.5,
};

export class SocketSessionUnavailableError extends Error {
  constructor() { super('Connexion en attente d’une session valide.'); }
}

/** Stop existing automatic retries too; never connect a namespace with token:null. */
export function requireSocketToken(token: string | null, socket: Socket | null) {
  if (token) return;
  socket?.disconnect();
  throw new SocketSessionUnavailableError();
}

/** Socket.IO calls this for EVERY handshake, including its own reconnections. */
export function bindSocketAuthentication(socket: Socket, isCurrent: () => boolean) {
  let handshake = 0;
  socket.on('disconnect', () => { handshake++; });
  socket.auth = callback => {
    const attempt = ++handshake;
    const version = getTokenSessionVersion();
    void getValidAccessToken().then(token => {
      if (!isCurrent() || attempt !== handshake) return;
      if (!token || version !== getTokenSessionVersion()) { socket.disconnect(); return; }
      callback({ token });
    }).catch(() => { if (isCurrent() && attempt === handshake) socket.disconnect(); });
  };
}
