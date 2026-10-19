import type { Middleware } from '@reduxjs/toolkit';

/** Shared by Home, trip management, navigation and native notification actions. */
export const rideAlertAcknowledgement: Middleware = api => next => action => {
  const result = next(action);
  const value = action as { type?: string; payload?: { status?: string; selectedDriverId?: string }; meta?: {
    arg?: { endpointName?: string; originalArgs?: unknown };
  } };
  if (value.type === 'auth/logout' || value.type === 'auth/performLogout/pending') {
    void import('@/services/foregroundRideAnnouncement').then(speech => speech.clearRideAnnouncementSession()).catch(() => {});
    void import('@/services/foregroundRideSound').then(sound => sound.stopForegroundRideSound()).catch(() => {});
    void import('@/services/rideAlertSession').then(session => session.clearRideAlertSession()).catch(() => {});
    return result;
  }
  if (!value.type?.endsWith('/fulfilled')) return result;
  const endpoint = value.meta?.arg?.endpointName;
  const args = value.meta?.arg?.originalArgs as string | { id?: string; tripRequestId?: string; status?: string } | undefined;
  const userId = (api.getState() as { auth: { user?: { id: string } } }).auth.user?.id;
  if (!userId || !endpoint) return result;
  if (['getTripBookings', 'getMyActivityBookings'].includes(endpoint) && Array.isArray(value.payload)) {
    const resolved = value.payload.filter((booking: { id?: string; status?: string }) =>
      booking.id && booking.status && booking.status !== 'pending');
    if (resolved.length) void import('@/services/driverNotifications')
      .then(service => service.dismissResolvedDriverBookings(userId, resolved.map(booking => booking.id))).catch(() => {});
  }
  if (!args) return result;
  let kind: 'booking' | 'dispatch' | 'nearby' | undefined;
  if (['acceptBooking', 'rejectBooking', 'respondToBookingInvitation'].includes(endpoint) ||
      (endpoint === 'updateBookingStatus' && typeof args !== 'string' && ['accepted', 'rejected'].includes(args.status ?? '')) ||
      (endpoint === 'getBookingById' && value.payload?.status && value.payload.status !== 'pending')) kind = 'booking';
  if (endpoint === 'respondToDispatchOffer' || (endpoint === 'getDispatchOffer' && value.payload?.status && value.payload.status !== 'pending')) kind = 'dispatch';
  if (endpoint === 'acceptTripRequest' || endpoint === 'createDriverOffer' ||
      (endpoint === 'getTripRequestById' && value.payload?.selectedDriverId)) kind = 'nearby';
  const id = typeof args === 'string' ? args : args.tripRequestId ?? args.id;
  if (kind && id) void import('@/services/driverNotifications')
    .then(service => service.dismissDriverDecision(userId, kind!, id)).catch(() => {});
  return result;
};
