import { API_BASE_URL } from '@/config/env';
import { getValidAccessToken } from '@/services/tokenRefresh';
import { io, Socket } from 'socket.io-client';

export interface DriverLocationPayload {
  tripId: string;
  coordinates: [number, number] | null;
  updatedAt?: string | null;
}

type LocationListener = (payload: DriverLocationPayload) => void;
type ErrorListener = (message: string) => void;

function resolveSocketBaseUrl() {
  if (!API_BASE_URL) {
    return '';
  }
  return API_BASE_URL.replace(/\/api\/v1\/?$/, '');
}

class TrackingSocketClient {
  private socket: Socket | null = null;
  private connecting: Promise<Socket> | null = null;
  private locationListeners = new Set<LocationListener>();
  private errorListeners = new Set<ErrorListener>();

  private notifyLocationListeners(payload: DriverLocationPayload) {
    this.locationListeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.warn('[TrackingSocket] location listener error:', error);
      }
    });
  }

  private notifyErrorListeners(message: string) {
    this.errorListeners.forEach((listener) => {
      try {
        listener(message);
      } catch (error) {
        console.warn('[TrackingSocket] error listener error:', error);
      }
    });
  }

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
      const socket = io(`${baseUrl}/tracking`, {
        transports: ['websocket'],
        auth: { token },
      });

      socket.on('connect', () => {
        console.log('[TrackingSocket] connecté');
      });

      socket.on('disconnect', () => {
        console.log('[TrackingSocket] déconnecté');
      });

      socket.on('driver_location', (payload: DriverLocationPayload) => {
        this.notifyLocationListeners(payload);
      });

      socket.on('error', (payload: { message?: string }) => {
        const message = payload?.message ?? 'Erreur de suivi';
        this.notifyErrorListeners(message);
      });

      socket.on('connect_error', (error: { message?: string }) => {
        const message = error?.message ?? 'Connexion tracking impossible';
        this.notifyErrorListeners(message);
      });

      this.socket = socket;
      this.connecting = null;
      return socket;
    })();

    return this.connecting;
  }

  subscribeToDriverLocation(listener: LocationListener) {
    this.locationListeners.add(listener);
    return () => this.locationListeners.delete(listener);
  }

  subscribeToErrors(listener: ErrorListener) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  async joinTrip(tripId: string) {
    if (!tripId) return;
    const socket = await this.connect();
    socket.emit('join_trip', { tripId });
  }

  async leaveTrip(tripId: string) {
    if (!tripId || !this.socket) return;
    this.socket.emit('leave_trip', { tripId });
  }

  async updateDriverLocation(tripId: string, coordinates: [number, number]) {
    if (!tripId || !coordinates) return;
    const socket = await this.connect();
    socket.emit('driver_location_update', { tripId, coordinates });
  }

  async requestDriverLocation(tripId: string) {
    if (!tripId) return;
    const socket = await this.connect();
    socket.emit('get_driver_location', { tripId });
  }
}

export const trackingSocket = new TrackingSocketClient();


