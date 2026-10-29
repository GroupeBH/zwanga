import type { RideRealtimeEvent } from './rideRealtime';

type Tag = { type: 'AccountActivity' | 'DriverDispatch' | 'Booking' | 'TripRequest' | 'MyTripRequests' | 'Notification' | 'DriverSettlement'; id?: string };

/** Lists must refresh for newly created rows; unrelated detail caches need not. */
export function rideRealtimeTags(event: RideRealtimeEvent): Tag[] {
  if (event.kind === 'payment') return [{ type: 'Notification', id: 'DRIVER_PAYMENTS' },
    { type: 'AccountActivity' }, { type: 'DriverSettlement' }];
  if (event.kind === 'reconnected') return [
    { type: 'Notification', id: 'DRIVER_PAYMENTS' },
    { type: 'AccountActivity' }, { type: 'DriverDispatch' }, { type: 'Booking' },
    { type: 'TripRequest' }, { type: 'MyTripRequests' },
  ];
  const data = event.kind === 'incoming' ? event.data : event;
  const bookingId = data.bookingId;
  const requestId = event.kind === 'incoming' ? event.data.tripRequestId ?? event.data.requestId : event.requestId;
  const tags: Tag[] = [{ type: 'AccountActivity' }, { type: 'DriverDispatch' }];
  if (typeof bookingId === 'string') tags.push({ type: 'Booking', id: bookingId }, { type: 'Booking', id: 'LIST' });
  if (typeof requestId === 'string') tags.push({ type: 'TripRequest', id: requestId },
    { type: 'TripRequest', id: 'LIST' }, { type: 'MyTripRequests', id: 'LIST' });
  return tags;
}
