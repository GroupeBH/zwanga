import { buildCreateBookingEndpoints } from './booking/createBooking.endpoints';
import { buildBookingHistory } from './booking/history';
import { buildConfirmDropoffByPassengerEndpoints } from './booking/confirmDropoffByPassenger.endpoints';
import {
  bookingListTag,
  tripListTag,
  myTripsListTag,
  asAcceptedBooking,
  mergeAcceptedBooking,
  patchAcceptedBookingInList,
} from './booking/cachePolicy';
import { mapServerBookingToClient } from './booking/bookingMapper';
import { ServerBooking } from './booking/serverTypes';
import type { Booking } from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';
import { CRITICAL_MUTATION_TIMEOUT_MS } from '@/constants/network';

export const bookingApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
    ...buildCreateBookingEndpoints(builder),
    ...buildBookingHistory(builder),
    acceptBooking: builder.mutation<Booking, string>({
      query: (id: string) => ({
        url: `/bookings/${id}/accept`,
        method: 'PUT',
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const acceptedAt = new Date().toISOString();

        try {
          const { data } = await queryFulfilled;
          const acceptedBooking = asAcceptedBooking(data, acceptedAt);

          dispatch(
            bookingApi.util.updateQueryData('getTripBookings', acceptedBooking.tripId, (draft) => {
              patchAcceptedBookingInList(draft, acceptedBooking, acceptedAt);
            }),
          );
          dispatch(
            bookingApi.util.updateQueryData('getMyBookings', undefined, (draft) => {
              patchAcceptedBookingInList(draft, acceptedBooking, acceptedAt);
            }),
          );
          dispatch(
            bookingApi.util.updateQueryData('getMyActivityBookings', undefined, (draft) => {
              patchAcceptedBookingInList(draft, acceptedBooking, acceptedAt);
            }),
          );
          dispatch(
            bookingApi.util.updateQueryData('getBookingById', id, (draft) => {
              Object.assign(draft, mergeAcceptedBooking(draft, acceptedBooking, acceptedAt));
            }),
          );
        } catch {
          // L'erreur est traitée dans l'écran appelant; aucun patch cache si l'API refuse.
        }
      },
      invalidatesTags: (result) =>
        result
          ? [
              { type: 'Booking', id: result.id },
              { type: 'Trip', id: result.tripId },
              bookingListTag,
              tripListTag,
              myTripsListTag,
            ]
          : [bookingListTag, tripListTag, myTripsListTag],
    }),
    ...buildConfirmDropoffByPassengerEndpoints(builder),
  }),
});

export const {
  useGetMyBookingHistoryInfiniteQuery,
  useGetMyActivityBookingsQuery,
  useCreateBookingMutation,
  useGetMyBookingsQuery,
  useGetTripBookingsQuery,
  useInitiateBookingPaymentMutation,
  useLazyCheckBookingPaymentStatusQuery,
  useUpdateBookingPaymentModeMutation,
  useGetBookingByIdQuery,
  useUpdateBookingStatusMutation,
  useCancelBookingMutation,
  useAcceptBookingMutation,
  useRejectBookingMutation,
  useGetWhatsAppNotificationDataMutation,
  useSetBookingEmergencyContactsMutation,
  useConfirmPickupMutation,
  useConfirmPickupByPassengerMutation,
  useConfirmDropoffMutation,
  useConfirmDropoffByPassengerMutation,
  useRequestPassengerTripInterruptionMutation,
  useGetPassengerInterruptionFarePreviewQuery,
  useCancelPassengerTripInterruptionMutation,
  useConfirmPassengerTripInterruptionMutation,
  useRejectPassengerTripInterruptionMutation,
  useUpdatePassengerLocationMutation,
} = bookingApi;
