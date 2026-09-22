import type { Booking } from '@/types';
import type { BaseEndpointBuilder } from '../types';
import { CRITICAL_MUTATION_TIMEOUT_MS } from '@/constants/network';
import { mapServerBookingToClient } from './bookingMapper';
import type { ServerBooking } from './serverTypes';
import { bookingListTag, myTripsListTag, tripListTag } from './cachePolicy';

export function buildCashReceiptEndpoints(builder: BaseEndpointBuilder) {
  return { confirmCashReceipt: builder.mutation<Booking, { bookingId: string; amount: number; currency: string }>({
    query: ({ bookingId, amount, currency }) => ({
      url: `/bookings/${bookingId}/cash-receipt`, method: 'PUT', body: { amount, currency },
      timeout: CRITICAL_MUTATION_TIMEOUT_MS,
    }),
    transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
    invalidatesTags: (result) => result ? [bookingListTag, myTripsListTag, tripListTag, 'AccountActivity',
      { type: 'Booking', id: result.id }, { type: 'Trip', id: result.tripId }] : [],
  }) };
}
