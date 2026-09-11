import { API_BASE_URL } from '@/config/env';
import { getValidAccessToken } from '@/services/tokenRefresh';
import type { Message } from '@/types';
import { io, Socket } from 'socket.io-client';

type MessageListener = (message: Message) => void;

class ChatSocketClient {
  private socket: Socket | null = null;
  private listeners = new Set<MessageListener>();
  private rooms = new Map<string, number>();
  private connecting: Promise<Socket> | null = null;
  private generation = 0;

  private async connect(): Promise<Socket> {
    if (this.connecting) return this.connecting;
    const generation = this.generation;
    const connection = (async () => {
      const token = await getValidAccessToken();
      if (generation !== this.generation) throw new Error('Session de messagerie fermée');
      if (!this.socket) {
        const baseUrl = API_BASE_URL.replace(/\/(?:api\/)?v1\/?$/, '');
        const socket = io(`${baseUrl}/chat`, { transports: ['websocket'], auth: { token }, autoConnect: false });
        this.socket = socket;
        socket.on('connect', () => {
          this.rooms.forEach((_count, bookingId) => socket.emit('join_booking', { bookingId }));
        });
        socket.on('new_message', (message: Message) => {
          this.listeners.forEach((listener) => listener(message));
        });
        socket.on('connect_error', (error: Error) => {
          if (__DEV__) console.warn('[ChatSocket]', error.message);
        });
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
    const generation = this.generation;
    const count = this.rooms.get(bookingId) ?? 0;
    this.rooms.set(bookingId, count + 1);
    try {
      const socket = await this.connect();
      if (count === 0 && socket.connected && this.rooms.has(bookingId)) {
        socket.emit('join_booking', { bookingId });
      }
    } catch (error) {
      if (generation === this.generation) this.releaseRoom(bookingId);
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
    if (this.rooms.size === 0) this.disconnect(false);
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
    return () => { this.listeners.delete(listener); };
  }

  /** Also invalidates a connection still waiting for secure storage. */
  disconnect(clearListeners = true) {
    this.generation += 1;
    this.socket?.disconnect();
    this.socket?.removeAllListeners();
    this.socket = null;
    this.connecting = null;
    this.rooms.clear();
    if (clearListeners) this.listeners.clear();
  }

  refreshAuthentication() {
    if (this.rooms.size === 0) return;
    const generation = this.generation;
    void getValidAccessToken().then((token) => {
      if (generation !== this.generation || !this.socket) return;
      this.socket.auth = { token };
      this.socket.disconnect().connect();
    }).catch(() => undefined);
  }
}

export const chatSocket = new ChatSocketClient();

