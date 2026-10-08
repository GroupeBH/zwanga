import { baseApi } from './baseApi';

export interface DriverDispatchStatus {
  enabled: boolean;
  available: boolean;
  presence?: { vehicleId: string; leaseId: string; seats: number; expiresAt: string } | null;
  pendingOfferId: string | null;
  responseSeconds?: number;
  automatic?: boolean;
  positionFreshSeconds?: number;
}
export type PresenceInput = { available: false } | {
  available: true; vehicleId: string; seats: number; latitude: number; longitude: number; leaseId?: string;
};
export interface DispatchOffer {
  id: string; driverId: string; requestId: string; status: string; expiresAt: string;
  serverNow: string; actionable: boolean;
  vehicleName?: string | null;
  request: { id: string; passengerName: string; departure: string; arrival: string;
    seats: number; pricePerSeat: number; paymentMode: string; vehicleType: string };
}

export const driverDispatchApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    respondToBookingInvitation: builder.mutation<unknown, { id: string; accept: boolean }>({
      query: ({ id, accept }) => ({ url: `/bookings/${id}/respond-invitation`, method: 'PUT', body: { accept }, timeout: 10000 }),
      invalidatesTags: ['Booking', 'Trip', 'MyTrips', 'AccountActivity'],
    }),
    driverDispatchStatus: builder.query<DriverDispatchStatus, void>({
      query: () => '/driver-dispatch/status', keepUnusedDataFor: 15,
      providesTags: ['DriverDispatch'],
    }),
    registerDriverNotifications: builder.mutation<{ registered: boolean }, void>({
      query: () => ({ url: '/driver-dispatch/notifications', method: 'POST', body: { version: 2 } }),
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
        try {
          const { data } = await queryFulfilled;
          dispatch(driverDispatchApi.util.upsertQueryData('driverDispatchStatus', undefined, data));
        } catch { /* A failed update never extends the last server deadline. */ }
      },
    }),
    getDispatchOffer: builder.query<DispatchOffer, string>({
      query: id => `/driver-dispatch/offers/${id}`, keepUnusedDataFor: 0,
      providesTags: ['DriverDispatch'],
    }),
    respondToDispatchOffer: builder.mutation<{ status: string; requestId: string }, { id: string; decision: 'accept' | 'decline' }>({
      query: ({ id, decision }) => ({ url: `/driver-dispatch/offers/${id}/respond`, method: 'PUT', body: { decision }, timeout: 10000 }),
      invalidatesTags: ['DriverDispatch', 'TripRequest', 'MyTripRequests', 'MyDriverOffers', 'AccountActivity', 'Wallet'],
    }),
  }),
});
export const { useDriverDispatchStatusQuery, useSetDriverPresenceMutation,
  useRecordDriverPositionMutation,
  useRespondToBookingInvitationMutation,
  useGetDispatchOfferQuery, useRespondToDispatchOfferMutation,
  useRegisterDriverNotificationsMutation } = driverDispatchApi;
