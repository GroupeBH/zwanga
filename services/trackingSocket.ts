import { API_BASE_URL } from '@/config/env';
import { getValidAccessToken } from '@/services/tokenRefresh';
import { io, Socket } from 'socket.io-client';

export interface DriverLocationPayload {
  tripId: string;
  coordinates: [number, number] | null;
  updatedAt?: string | null;
}

export interface PassengerLocationPayload {
  tripId: string;
  bookingId: string;
  passengerId?: string;
  coordinates: [number, number] | null;
  updatedAt?: string | null;
}

export interface BookingAutoProgressPayload {
  tripId: string;
  events: Array<{
    type:
      | 'driver_near_pickup'
      | 'driver_arrived_pickup'
      | 'parties_nearby'
      | 'passenger_ready_pickup'
      | 'pickup_confirmed'
      | 'dropoff_confirmed';
    bookingId: string;
    tripId: string;
    passengerId: string;
    distanceMeters?: number;
    detectedAt?: string;
    expiresAt?: string;
    pickupWaitSeconds?: number;
  }>;
}

type LocationListener = (payload: DriverLocationPayload) => void;
type PassengerLocationListener = (payload: PassengerLocationPayload) => void;
type BookingAutoProgressListener = (payload: BookingAutoProgressPayload) => void;
type ErrorListener = (message: string) => void;

function resolveSocketBaseUrl() {
  if (!API_BASE_URL) {
    return '';
  }
  return API_BASE_URL.replace(/\/(?:api\/)?v1\/?$/, '');
}

class TrackingSocketClient {
  private socket: Socket | null = null;
  private connecting: Promise<Socket> | null = null;
  private tripJoinCounts = new Map<string, number>();
  private locationListeners = new Set<LocationListener>();
  private passengerLocationListeners = new Set<PassengerLocationListener>();
  private bookingAutoProgressListeners = new Set<BookingAutoProgressListener>();
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

  private async connect(): Promise<Socket> {
    if (this.socket) {
      if (!this.socket.connected) {
        this.socket.connect();
      }
      return this.socket;
    }

    if (this.connecting) {
      return this.connecting;
    }

    const connection = (async () => {
      const token = await getValidAccessToken();
      const baseUrl = resolveSocketBaseUrl();
      const socket = io(`${baseUrl}/tracking`, {
        transports: ['websocket'],
        auth: { token },
      });
      this.socket = socket;

      socket.on('connect', () => {
        console.log('[TrackingSocket] connecte');
        this.tripJoinCounts.forEach((_count, tripId) => {
          socket.emit('join_trip', { tripId });
        });
      });

      socket.on('disconnect', () => {
        console.log('[TrackingSocket] deconnecte');
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
        const message = error?.message ?? 'Connexion tracking impossible';
        this.notifyErrorListeners(message);
      });

      return socket;
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
    const currentCount = this.tripJoinCounts.get(tripId) ?? 0;
    this.tripJoinCounts.set(tripId, currentCount + 1);

    try {
      const socket = await this.connect();
      if (currentCount === 0 && (this.tripJoinCounts.get(tripId) ?? 0) > 0 && socket.connected) {
        socket.emit('join_trip', { tripId });
      }
    } catch (error) {
      const pendingCount = this.tripJoinCounts.get(tripId) ?? 0;
      if (pendingCount <= 1) {
        this.tripJoinCounts.delete(tripId);
      } else {
        this.tripJoinCounts.set(tripId, pendingCount - 1);
      }
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

  async updatePassengerLocation(
    tripId: string,
    bookingId: string,
    coordinates: [number, number],
  ) {
    if (!tripId || !bookingId || !coordinates) return;
    const socket = await this.connect();
    socket.emit('passenger_location_update', { tripId, bookingId, coordinates });
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
