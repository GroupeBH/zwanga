import type { Socket } from 'socket.io-client';
import { beginPendingLocationDelivery, recordLocationDelivery } from './locationDelivery';

type Payload = {
  tripId: string;
  bookingId?: string;
  coordinates: [number, number];
  recordedAt?: string;
};
type Echo = {
  tripId?: string;
  bookingId?: string;
  coordinates?: [number, number] | null;
  updatedAt?: string | null;
};
type LocationAck = {
  success?: boolean; ok?: boolean; status?: 'accepted' | 'superseded';
  tripId?: string; bookingId?: string; recordedAt?: string;
};

/** The deployed gateway echoes locations but older versions don't acknowledge emits. */
export function sendConfirmedTrackingLocation(socket: Socket, payload: Payload) {
  const passenger = Boolean(payload.bookingId);
  const key = passenger ? `passenger:${payload.bookingId}` : `driver:${payload.tripId}`;
  const event = passenger ? 'passenger_location_update' : 'driver_location_update';
  const echoEvent = passenger ? 'passenger_location' : 'driver_location';
  const sentTimestamp = payload.recordedAt ? Date.parse(payload.recordedAt) : Date.now();
  const releasePending = beginPendingLocationDelivery(key);

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.off(echoEvent, onEcho);
      socket.off('disconnect', onDisconnect);
      releasePending();
      if (error) reject(error);
      else { recordLocationDelivery(key, 'socket'); resolve(); }
    };
    const onDisconnect = () => finish(new Error('Le suivi en temps réel a été interrompu.'));
    const onEcho = (echo: Echo) => {
      if (!echo || echo.tripId !== payload.tripId || (passenger && echo.bookingId !== payload.bookingId)) return;
      if (!echo.coordinates || echo.coordinates.length !== 2 || echo.coordinates.some((value, i) =>
        !Number.isFinite(value) || Math.abs(value - payload.coordinates[i]) > 0.000001)) return;
      // Never interpret an old room snapshot as confirmation of the new GPS sample.
      const timestamp = echo.updatedAt ? Date.parse(echo.updatedAt) : NaN;
      if (!Number.isFinite(timestamp) || timestamp < sentTimestamp) return;
      finish();
    };
    const timeout = setTimeout(() => finish(new Error('La confirmation de la position tarde à arriver.')), 2500);
    socket.on(echoEvent, onEcho);
    socket.on('disconnect', onDisconnect);
    try {
      // The callback belongs to this emit. A positive ack confirms processing even
      // when the server corrected recordedAt or already holds a newer sample.
      // Legacy gateways may only echo; keep the strict timestamp check above.
      socket.timeout(2500).emit(event, payload, (error: Error | null, ack?: LocationAck) => {
        if (ack?.tripId !== undefined && ack.tripId !== payload.tripId) return;
        if (ack?.bookingId !== undefined && ack.bookingId !== payload.bookingId) return;
        if (ack?.recordedAt !== undefined && ack.recordedAt !== payload.recordedAt) return;
        if (!error && (ack?.success === true || ack?.ok === true)) finish();
        else if (!error && (ack?.success === false || ack?.ok === false)) finish(new Error('La position n’a pas pu être enregistrée.'));
      });
    } catch (error) {
      finish(error instanceof Error ? error : new Error('Envoi de la position impossible.'));
    }
  });
}
