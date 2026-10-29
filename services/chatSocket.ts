import { API_BASE_URL } from '@/config/env';
import { getValidAccessToken, handle401Error } from '@/services/tokenRefresh';
import type { Message } from '@/types';
import { io, Socket } from 'socket.io-client';
import { socketConnectionOptions } from './socketConnectionPolicy';
import { bindSocketRestartRecovery } from './socketRestartRecovery';
import { subscribeConnectionRecovery } from './networkRecovery';
import { deliverSocketEvent, isChatMessage } from './socketPayloads';
import { parseRideRealtimeEvent, type RideRealtimeEvent } from '@/features/notifications/rideRealtime';

type MessageListener = (message: Message) => void;

class ChatSocketClient {
  private socket: Socket | null = null;
  private listeners = new Set<MessageListener>();
  private reconnectListeners = new Set<() => void>();
  private stopRestartRecovery: (() => void) | null = null;
  private rideListeners = new Set<(event: RideRealtimeEvent) => void>();
  // Passive observers never open or retain a second socket connection.
  private connectionListeners = new Set<(connected: boolean) => void>();
  private notifyConnection(connected: boolean) {
    this.connectionListeners.forEach(listener => { try { listener(connected); } catch { /* Isolate observers. */ } });
  }
  subscribeToConnectionState(listener: (connected: boolean) => void) {
    this.connectionListeners.add(listener);
    listener(Boolean(this.socket?.connected));
    return () => { this.connectionListeners.delete(listener); };
  }
  private hasConsumers() { return this.rooms.size > 0 || this.listeners.size > 0 || this.rideListeners.size > 0 || this.reconnectListeners.size > 0; }
  private rooms = new Map<string, number>();
  private connecting: Promise<Socket> | null = null;
  private generation = 0;
  private stopRecovery: (() => void) | null = null;

  private async connect(): Promise<Socket> {
    this.stopRecovery ??= subscribeConnectionRecovery(() => {
      if (this.hasConsumers() && !this.socket?.connected) {
        void this.connect().catch(() => undefined);
      }
    });
    if (this.connecting) return this.connecting;
    const generation = this.generation;
    const connection = (async () => {
      const token = await getValidAccessToken();
      if (generation !== this.generation) throw new Error('Session de messagerie fermée');
      if (!token) {
        this.socket?.disconnect();
        throw new Error('Messagerie en attente de votre session');
      }
      if (!this.socket) {
        const baseUrl = API_BASE_URL.replace(/\/(?:api\/)?v1\/?$/, '');
        const socket = io(`${baseUrl}/chat`, { ...socketConnectionOptions, auth: { token } });
        this.socket = socket;
        this.stopRestartRecovery = bindSocketRestartRecovery(socket, () => this.connect(),
          () => this.socket === socket && this.hasConsumers());
        socket.on('session_expired', () => { socket.disconnect(); void handle401Error().catch(() => undefined); });
        socket.on('connect', () => {
          if (this.socket !== socket) return;
          this.notifyConnection(true);
          this.rooms.forEach((_count, bookingId) => socket.emit('join_booking', { bookingId }));
          deliverSocketEvent(this.rideListeners, { kind: 'reconnected' });
          this.reconnectListeners.forEach(listener => { try { listener(); } catch { /* Isolate consumers. */ } });
        });
        socket.on('ride_alert', (raw: unknown) => {
          const event = parseRideRealtimeEvent(raw);
          if (event) deliverSocketEvent(this.rideListeners, event);
        });
        socket.on('new_message', (message: Message) => {
          if (isChatMessage(message)) deliverSocketEvent(this.listeners, message);
        });
        socket.on('connect_error', (error: Error) => {
          if (this.socket === socket) this.notifyConnection(false);
          if (__DEV__) console.warn('[ChatSocket]', error.message);
        });
        socket.on('disconnect', () => { if (this.socket === socket) this.notifyConnection(false); });
      }
      this.socket.auth = { token };
      // Reuse the same Socket.IO manager, including during automatic reconnection.
      if (!this.socket.connected) this.socket.connect();
      return this.socket;
    })();
    this.connecting = connection;
    try {
      return await connection;
    } finally {
      if (this.connecting === connection) this.connecting = null;
    }
  }

  async joinBookingRoom(bookingId: string) {
    if (!bookingId) return;
    const count = this.rooms.get(bookingId) ?? 0;
    this.rooms.set(bookingId, count + 1);
    try {
      const socket = await this.connect();
      if (count === 0 && socket.connected && this.rooms.has(bookingId)) {
        socket.emit('join_booking', { bookingId });
      }
    } catch (error) {
      // Keep the room until its owner leaves, including during an auth/network outage.
      throw error;
    }
  }

  private releaseRoom(bookingId: string) {
    const count = this.rooms.get(bookingId) ?? 0;
    if (count > 1) this.rooms.set(bookingId, count - 1);
    else {
      this.rooms.delete(bookingId);
      if (this.socket?.connected) this.socket.emit('leave_booking', { bookingId });
    }
    if (!this.hasConsumers()) this.disconnect(false);
  }

  async leaveBookingRoom(bookingId: string) { this.releaseRoom(bookingId); }

  async sendBookingMessage(bookingId: string, content: string) {
    if (!bookingId || !content.trim()) return;
    const socket = await this.connect();
    socket.emit('send_message', { bookingId, content });
  }

  async requestBookingMessages(bookingId: string) {
    if (!bookingId) return;
    const socket = await this.connect();
    socket.emit('get_messages', { bookingId });
  }

  subscribeToMessages(listener: MessageListener) {
    this.listeners.add(listener);
    void this.connect().catch(error => {
      if (__DEV__ && this.listeners.has(listener)) console.warn('[ChatSocket] Connexion indisponible:', error);
    });
    return () => {
      this.listeners.delete(listener);
      if (!this.hasConsumers()) this.disconnect(false);
    };
  }

  subscribeToRideAlerts(listener: (event: RideRealtimeEvent) => void) {
    this.rideListeners.add(listener);
    void this.connect().catch(() => undefined);
    return () => { this.rideListeners.delete(listener); if (!this.hasConsumers()) this.disconnect(false); };
  }

  subscribeToReconnect(listener: () => void) {
    this.reconnectListeners.add(listener);
    void this.connect().catch(() => undefined);
    return () => { this.reconnectListeners.delete(listener); if (!this.hasConsumers()) this.disconnect(false); };
  }

  /** Also invalidates a connection still waiting for secure storage. */
  disconnect(clearListeners = true) {
    this.stopRestartRecovery?.();
    this.stopRestartRecovery = null;
    this.stopRecovery?.();
    this.stopRecovery = null;
    this.generation += 1;
    this.socket?.disconnect();
    this.socket?.removeAllListeners();
    this.socket = null;
    this.notifyConnection(false);
    this.connecting = null;
    this.rooms.clear();
    if (clearListeners) { this.listeners.clear(); this.rideListeners.clear(); this.reconnectListeners.clear(); }
  }

  refreshAuthentication() {
    if (!this.hasConsumers()) return;
    if (!this.socket) { void this.connect().catch(() => undefined); return; }
    const generation = this.generation;
    void getValidAccessToken().then((token) => {
      if (generation !== this.generation || !this.socket) return;
      if (!token) { this.socket.disconnect(); return; }
      this.socket.auth = { token };
      this.socket.disconnect().connect();
    }).catch(() => undefined);
  }
}

export const chatSocket = new ChatSocketClient();

