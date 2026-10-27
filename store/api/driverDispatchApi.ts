import { baseApi } from './baseApi';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { inviteAcceptedRequestContact } from '@/store/slices/rideEntrySlice';
import type { RootState } from '@/store';
import { offerClock, offerDeadline, type OfferDeadline } from '@/features/notifications/offerDeadline';

export interface DriverDispatchStatus {
  enabled: boolean;
  available: boolean;
  presence?: { vehicleId: string; leaseId: string; seats: number; expiresAt: string } | null;
  pendingOfferId: string | null;
  responseSeconds?: number;
  automatic?: boolean;
  positionFreshSeconds?: number;
  locationPolicy?: 'last_known';
  positionExpires?: boolean;
}
export type PresenceInput = { available: false } | {
  available: true; vehicleId: string; seats: number; latitude: number; longitude: number; leaseId?: string;
};
export interface DispatchOffer {
  id: string; driverId: string; requestId: string; status: string; expiresAt: string;
  serverNow: string; actionable: boolean;
  localDeadline?: OfferDeadline;
  vehicleName?: string | null;
  request: { id: string; passengerName: string; departure: string; arrival: string;
    seats: number; pricePerSeat: number | null; paymentMode: string; vehicleType: string };
}

export interface NearbyRingingStatus {
  missedCount: number;
  mutedUntil: string | null;
  serverNow: string;
}

export const driverDispatchApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    declineNearbyRequest: builder.mutation<NearbyRingingStatus, string>({
      query: id => ({ url: `/driver-dispatch/nearby-requests/${id}/decline`, method: 'PUT', timeout: 10000 }),
      invalidatesTags: ['DriverDispatch'],
    }),
    respondToBookingInvitation: builder.mutation<unknown, { id: string; accept: boolean }>({
      query: ({ id, accept }) => ({ url: `/bookings/${id}/respond-invitation`, method: 'PUT', body: { accept }, timeout: 10000 }),
      invalidatesTags: ['Booking', 'Trip', 'MyTrips', 'AccountActivity'],
    }),
    driverDispatchStatus: builder.query<DriverDispatchStatus, void>({
      query: () => '/driver-dispatch/status', keepUnusedDataFor: 15,
      providesTags: ['DriverDispatch'],
    }),
    recordRideNotificationReceipt: builder.mutation<{ received: boolean }, { notificationId: string; stage: 'received' | 'displayed'; observedAt?: string; source?: 'native' | 'javascript'; failureCode?: string }>({
      query: ({ notificationId, ...body }) => ({ url: `/driver-dispatch/notifications/${notificationId}/received`,
        method: 'POST', body, timeout: 4000 }),
    }),
    registerDriverNotifications: builder.mutation<{ registered: boolean }, 2 | 3 | 4 | 5 | 6 | void>({
      query: (version = 2) => ({ url: '/driver-dispatch/notifications', method: 'POST', body: { version } }),
    }),
    setDriverPresence: builder.mutation<DriverDispatchStatus, PresenceInput>({
      query: body => ({ url: '/driver-dispatch/presence', method: 'PUT', body, timeout: 10000 }),
      async onQueryStarted(_body, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(driverDispatchApi.util.upsertQueryData('driverDispatchStatus', undefined, data));
        } catch { /* Keep the last server deadline, never optimistic availability. */ }
      },
    }),
    recordDriverPosition: builder.mutation<DriverDispatchStatus, {
      latitude: number; longitude: number; accuracy: number; recordedAt: string;
    }>({
      query: body => ({ url: '/driver-dispatch/position', method: 'PUT', body, timeout: 10000 }),
      async onQueryStarted(_body, { dispatch, queryFulfilled }) {
        const sessionVersion = getTokenSessionVersion();
        try {
          const { data } = await queryFulfilled;
          if (sessionVersion !== getTokenSessionVersion()) return;
          dispatch(driverDispatchApi.util.upsertQueryData('driverDispatchStatus', undefined, data));
        } catch { /* A failed update never extends the last server deadline. */ }
      },
    }),
    getDispatchOffer: builder.query<DispatchOffer, string>({
      async queryFn(id, _api, _extra, baseQuery) {
        const started = offerClock();
        const result = await baseQuery(`/driver-dispatch/offers/${id}`);
        if (result.error) return { error: result.error };
        const data = result.data as DispatchOffer;
        return { data: { ...data, localDeadline: offerDeadline(data.expiresAt, data.serverNow, started) } };
      },
      keepUnusedDataFor: 0,
      providesTags: ['DriverDispatch'],
    }),
    respondToDispatchOffer: builder.mutation<{ status: string; requestId: string }, { id: string; decision: 'accept' | 'decline' }>({
      query: ({ id, decision }) => ({ url: `/driver-dispatch/offers/${id}/respond`, method: 'PUT', body: { decision }, timeout: 10000 }),
      async onQueryStarted({ decision }, { dispatch, getState, queryFulfilled }) {
        const version = getTokenSessionVersion();
        const userId = (getState() as unknown as RootState).auth.user?.id;
        try {
          const { data } = await queryFulfilled;
          if (decision === 'accept' && data.status === 'accepted' && userId && version === getTokenSessionVersion() &&
            (getState() as unknown as RootState).auth.user?.id === userId) {
            dispatch(inviteAcceptedRequestContact({ userId, requestId: data.requestId }));
          }
        } catch { /* Never prompt after a refused or ambiguous response. */ }
      },
      invalidatesTags: ['DriverDispatch', 'TripRequest', 'MyTripRequests', 'MyDriverOffers', 'AccountActivity', 'Wallet'],
    }),
  }),
});
export const { useDriverDispatchStatusQuery, useSetDriverPresenceMutation,
  useRecordDriverPositionMutation,
  useRespondToBookingInvitationMutation,
  useGetDispatchOfferQuery, useRespondToDispatchOfferMutation,
  useRegisterDriverNotificationsMutation } = driverDispatchApi;
