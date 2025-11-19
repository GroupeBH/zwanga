import { API_BASE_URL } from '@/config/env';
import { getValidAccessToken } from '@/services/tokenRefresh';
import type { Message } from '@/types';
import { io, Socket } from 'socket.io-client';

type MessageListener = (message: Message) => void;

function resolveSocketBaseUrl() {
  if (!API_BASE_URL) {
    return '';
  }
  return API_BASE_URL.replace(/\/api\/v1\/?$/, '');
}

class ChatSocketClient {
  private socket: Socket | null = null;
  private listeners = new Set<MessageListener>();
  private connecting: Promise<Socket> | null = null;

  private async connect(): Promise<Socket> {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = (async () => {
      const token = await getValidAccessToken();
      const baseUrl = resolveSocketBaseUrl();
      const socket = io(`${baseUrl}/chat`, {
        transports: ['websocket'],
        auth: {
          token,
        },
      });

      socket.on('connect', () => {
        console.log('[ChatSocket] connecté au serveur de chat');
      });

      socket.on('disconnect', () => {
        console.log('[ChatSocket] déconnecté du serveur de chat');
      });

      socket.on('new_message', (message: Message) => {
        this.listeners.forEach((listener) => listener(message));
      });

      socket.on('error', (payload: any) => {
        console.warn('[ChatSocket] erreur', payload);
      });

      this.socket = socket;
      this.connecting = null;
      return socket;
    })();

    return this.connecting;
  }

  async joinBookingRoom(bookingId: string) {
    if (!bookingId) return;
    const socket = await this.connect();
    socket.emit('join_booking', { bookingId });
  }

  async leaveBookingRoom(bookingId: string) {
    if (!bookingId || !this.socket) return;
    this.socket.emit('leave_booking', { bookingId });
  }

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
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const chatSocket = new ChatSocketClient();

