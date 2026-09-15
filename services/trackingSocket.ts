import { LocationUpdateAcknowledgement, DriverLocationPayload, PassengerLocationPayload, TrackingLocationMetadata, BookingAutoProgressPayload, LocationListener, PassengerLocationListener, BookingAutoProgressListener, ErrorListener } from './trackingSocket.types';
export type { DriverLocationPayload } from './trackingSocket.types';
export type { PassengerLocationPayload } from './trackingSocket.types';
export type { TrackingLocationMetadata } from './trackingSocket.types';
export type { BoardingDetectionState } from './trackingSocket.types';
export type { BoardingRejectionReason } from './trackingSocket.types';
export type { BookingAutoProgressEvent } from './trackingSocket.types';
export type { BookingAutoProgressPayload } from './trackingSocket.types';
import { API_BASE_URL } from '@/config/env';
import { getValidAccessToken } from '@/services/tokenRefresh';
import { io, Socket } from 'socket.io-client';

import { recordLocationDelivery, wasLocationDeliveredRecently } from './locationDelivery';

const SOCKET_CONNECT_TIMEOUT_MS = 8000;
const SOCKET_LOCATION_ACK_TIMEOUT_MS = 2500;

function resolveSocketBaseUrl() {
  if (!API_BASE_URL) {
    return '';
  }
  return API_BASE_URL.replace(/\/(?:api\/)?v1\/?$/, '');
}

class TrackingSocketClient {
  private socket: Socket | null = null;
  private connecting: Promise<Socket> | null = null;
  private generation = 0;
  private idleTimeout: ReturnType<typeof setTimeout> | null = null;
  private tripJoinCounts = new Map<string, number>();
  private locationListeners = new Set<LocationListener>();
  private passengerLocationListeners = new Set<PassengerLocationListener>();
  private bookingAutoProgressListeners = new Set<BookingAutoProgressListener>();
  private errorListeners = new Set<ErrorListener>();
  private connectionListeners = new Set<(connected: boolean) => void>();

  private notifyConnectionState(connected: boolean) {
    this.connectionListeners.forEach((listener) => {
      try { listener(connected); } catch (error) { console.warn('[TrackingSocket] connection listener error:', error); }
    });
  }

  subscribeToConnectionState(listener: (connected: boolean) => void) {
    this.connectionListeners.add(listener);
    listener(Boolean(this.socket?.connected));
    return () => { this.connectionListeners.delete(listener); };
  }

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

  private notifyPassengerLocationListeners(payload: PassengerLocationPayload) {
    this.passengerLocationListeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.warn('[TrackingSocket] passenger location listener error:', error);
      }
    });
  }

  private notifyBookingAutoProgressListeners(payload: BookingAutoProgressPayload) {
    this.bookingAutoProgressListeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.warn('[TrackingSocket] booking auto-progress listener error:', error);
      }
    });
  }

  private waitForConnected(socket: Socket): Promise<Socket> {
    if (socket.connected) {
      return Promise.resolve(socket);
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('connect', handleConnect);
        socket.off('connect_error', handleConnectError);
        socket.off('disconnect', handleDisconnect);
      };

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };

      const handleConnect = () => finish(() => resolve(socket));
      const handleConnectError = (error: Error) =>
        finish(() => reject(error));
      const handleDisconnect = (reason: string) =>
        finish(() => reject(new Error(reason || 'Suivi déconnecté')));

      timeout = setTimeout(() => {
        finish(() => reject(new Error('Connexion tracking expiree')));
      }, SOCKET_CONNECT_TIMEOUT_MS);

      socket.once('connect', handleConnect);
      socket.once('connect_error', handleConnectError);
      socket.once('disconnect', handleDisconnect);
      socket.connect();
    });
  }

  private async connect(): Promise<Socket> {
    if (this.connecting) {
      return this.connecting;
    }
    if (this.socket?.connected) return this.socket;
    const generation = this.generation;

    const connection = (async () => {
      const token = await getValidAccessToken();
      if (generation !== this.generation) throw new Error('Session de suivi fermée');
      if (this.socket) {
        const socket = this.socket;
        socket.auth = { token };
        return this.waitForConnected(socket);
      }
      const baseUrl = resolveSocketBaseUrl();
      const socket = io(`${baseUrl}/tracking`, {
        transports: ['websocket'],
        auth: { token },
        autoConnect: false,
      });
      this.socket = socket;

      socket.on('connect', () => {
        this.notifyConnectionState(true);
        console.log('[TrackingSocket] connecté');
        this.tripJoinCounts.forEach((_count, tripId) => {
          socket.emit('join_trip', { tripId });
        });
      });

      socket.on('disconnect', () => {
        this.notifyConnectionState(false);
        console.log('[TrackingSocket] déconnecté');
      });

      socket.on('driver_location', (payload: DriverLocationPayload) => {
        this.notifyLocationListeners(payload);
      });

      socket.on('passenger_location', (payload: PassengerLocationPayload) => {
        this.notifyPassengerLocationListeners(payload);
      });

      socket.on(
        'passenger_locations',
        (payload: { locations?: PassengerLocationPayload[] } | PassengerLocationPayload[]) => {
          const locations = Array.isArray(payload) ? payload : payload?.locations ?? [];
          locations.forEach((location) => this.notifyPassengerLocationListeners(location));
        },
      );

      socket.on('booking_auto_progress', (payload: BookingAutoProgressPayload) => {
        this.notifyBookingAutoProgressListeners(payload);
      });

      socket.on('error', (payload: { message?: string }) => {
        const message = payload?.message ?? 'Erreur de suivi';
        this.notifyErrorListeners(message);
      });

      socket.on('connect_error', (error: { message?: string }) => {
        this.notifyConnectionState(false);
        const message = error?.message ?? 'Connexion tracking impossible';
        this.notifyErrorListeners(message);
      });

      return this.waitForConnected(socket);
    })();

    this.connecting = connection;
    try {
      return await connection;
    } finally {
      if (this.connecting === connection) {
        this.connecting = null;
      }
    }
  }

  subscribeToDriverLocation(listener: LocationListener) {
    this.locationListeners.add(listener);
    return () => this.locationListeners.delete(listener);
  }

  subscribeToBookingAutoProgress(listener: BookingAutoProgressListener) {
    this.bookingAutoProgressListeners.add(listener);
    return () => this.bookingAutoProgressListeners.delete(listener);
  }

  subscribeToPassengerLocation(listener: PassengerLocationListener) {
    this.passengerLocationListeners.add(listener);
    return () => this.passengerLocationListeners.delete(listener);
  }

  subscribeToErrors(listener: ErrorListener) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  async joinTrip(tripId: string) {
    if (!tripId) return;
    const generation = this.generation;
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    this.idleTimeout = null;
    const currentCount = this.tripJoinCounts.get(tripId) ?? 0;
    this.tripJoinCounts.set(tripId, currentCount + 1);

    try {
      const socket = await this.connect();
      if (currentCount === 0 && (this.tripJoinCounts.get(tripId) ?? 0) > 0 && socket.connected) {
        socket.emit('join_trip', { tripId });
      }
    } catch (error) {
      if (generation !== this.generation) throw error;
      // The screen still owns this room until leaveTrip, even while offline.
      // Keep it for Socket.IO's reconnect event instead of losing tracking updates.
      throw error;
    }
  }

  async leaveTrip(tripId: string) {
    if (!tripId) return;
    const currentCount = this.tripJoinCounts.get(tripId) ?? 0;
    if (currentCount > 1) {
      this.tripJoinCounts.set(tripId, currentCount - 1);
      return;
    }

    this.tripJoinCounts.delete(tripId);
    if (this.socket) {
      this.socket.emit('leave_trip', { tripId });
    }
    if (this.tripJoinCounts.size === 0 && !this.idleTimeout) {
      this.idleTimeout = setTimeout(() => {
        this.idleTimeout = null;
        if (this.tripJoinCounts.size === 0) this.disconnect(false);
      }, 5000);
    }
  }

  disconnect(clearListeners = true) {
    this.generation += 1;
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    this.idleTimeout = null;
    this.socket?.disconnect();
    this.socket?.removeAllListeners();
    this.socket = null;
    this.connecting = null;
    this.tripJoinCounts.clear();
    if (clearListeners) {
      this.locationListeners.clear();
      this.passengerLocationListeners.clear();
      this.bookingAutoProgressListeners.clear();
      this.errorListeners.clear();
      this.connectionListeners.clear();
    }
  }

  refreshAuthentication() {
    if (!this.socket) return;
    const generation = this.generation;
    void getValidAccessToken().then((token) => {
      if (!this.socket || generation !== this.generation) return;
      this.socket.auth = { token };
      this.socket.disconnect().connect();
    }).catch(() => undefined);
  }

  async updateDriverLocation(
    tripId: string,
    coordinates: [number, number],
    metadata: TrackingLocationMetadata = {},
  ) {
    if (!tripId || !coordinates) return;
    if (wasLocationDeliveredRecently(`driver:${tripId}`, 4000, 'socket')) return;
    const socket = await this.connect();
    socket.emit('driver_location_update', { tripId, coordinates, ...metadata });
  }

  async requestDriverLocation(tripId: string) {
    if (!tripId) return;
    const socket = await this.connect();
    socket.emit('get_driver_location', { tripId });
  }

  async updatePassengerLocation(
    tripId: string,
    bookingId: string,
    coordinates: [number, number],
    metadata: TrackingLocationMetadata = {},
  ) {
    if (!tripId || !bookingId || !coordinates) return;
    if (wasLocationDeliveredRecently(`passenger:${bookingId}`, 6000, 'socket')) return;
    const socket = await this.connect();
    const payload = {
      tripId,
      bookingId,
      coordinates,
      ...metadata,
    };

    await new Promise<void>((resolve, reject) => {
      socket.timeout(SOCKET_LOCATION_ACK_TIMEOUT_MS).emit(
        'passenger_location_update',
        payload,
        (error: Error | null, acknowledgement?: LocationUpdateAcknowledgement) => {
          if (error) {
            reject(new Error('Confirmation WebSocket de la position passager expirée'));
            return;
          }
          if (acknowledgement?.success === false || acknowledgement?.ok === false) {
            reject(
              new Error(
                acknowledgement.error ||
                  acknowledgement.message ||
                  'Position passager refusée par le serveur',
              ),
            );
            return;
          }
          if (acknowledgement?.success === true || acknowledgement?.ok === true) {
            recordLocationDelivery(`passenger:${bookingId}`, 'socket');
          }
          resolve();
        },
      );
    });
  }

  async resumeBoardingDetection(tripId: string) {
    if (!tripId) return;
    const socket = await this.connect();
    socket.emit('resume_boarding_detection', { tripId });
  }

  async requestPassengerLocations(tripId: string) {
    if (!tripId) return;
    const socket = await this.connect();
    socket.emit('get_passenger_locations', { tripId });
  }

  async signalPassengerReady(bookingId: string) {
    if (!bookingId) return;
    const socket = await this.connect();
    socket.emit('passenger_pickup_signal', { bookingId });
  }
}

export const trackingSocket = new TrackingSocketClient();
