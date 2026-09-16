import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

export type CreateTripShareLinkPayload = {
  tripId: string;
  bookingId?: string;
  recipientEmail?: string;
  recipientName?: string;
  message?: string;
  expiresInHours?: number;
};

export type TripShareLinkResponse = {
  id: string;
  token: string;
  tripId: string;
  bookingId: string | null;
  publicUrl: string;
  expiresAt: string;
  email: {
    recipientEmail: string | null;
    subject: string;
    body: string;
    mailtoUrl: string;
  };
};

export const trackingApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
    createTripShareLink: builder.mutation<TripShareLinkResponse, CreateTripShareLinkPayload>({
      query: ({ tripId, ...body }) => ({
        url: `/tracking/trips/${tripId}/share-links`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { tripId }) => [
        { type: 'TripShareLink' as const, id: tripId },
      ],
    }),
  }),
});

export const { useCreateTripShareLinkMutation } = trackingApi;