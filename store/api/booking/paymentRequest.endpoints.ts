import type { BaseEndpointBuilder } from '../types';
import { CRITICAL_MUTATION_TIMEOUT_MS } from '@/constants/network';

export type BookingPaymentRequest = { bookingId: string; requestedAt: string | null };
export const buildPaymentRequestEndpoints = (builder: BaseEndpointBuilder) => ({
  getBookingPaymentRequest: builder.query<BookingPaymentRequest, string>({
    query: id => `/bookings/${id}/payment-request`,
    providesTags: (_result, _error, id) => [{ type: 'Booking', id }],
  }),
  requestBookingPayment: builder.mutation<BookingPaymentRequest, string>({
    query: id => ({ url: `/bookings/${id}/payment-request`, method: 'POST', timeout: CRITICAL_MUTATION_TIMEOUT_MS }),
    invalidatesTags: (_result, error, id) => error ? [] : [{ type: 'Booking', id }],
  }),
});
