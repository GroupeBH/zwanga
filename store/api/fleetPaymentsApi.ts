import { baseApi } from "./baseApi";
import type { BaseEndpointBuilder } from "./types";
import type { FleetAssignment } from "./fleetRegistryApi";
export interface FleetPayment {
  id: string;
  amountMinor: string;
  paidOn: string;
  reference: string;
  periodLabel: string;
  status: "DECLARED" | "CONFIRMED" | "REJECTED";
  decisionNote: string | null;
}
export interface FleetPaymentIntent {
  mutationId: string;
  amountMinor: number;
  paidOn: string;
  reference: string;
  periodLabel: string;
}
export const fleetPaymentsApi = baseApi.injectEndpoints({
  endpoints: (b: BaseEndpointBuilder) => ({
    getFleetPayments: b.query<
      {
        assignment: FleetAssignment;
        items: FleetPayment[];
        nextCursor: string | null;
        confirmedMinor: string;
        declaredMinor: string;
      },
      { id: string; before?: string }
    >({
      query: ({ id, ...params }) => ({
        url: `/partners/fleet-assignments/${encodeURIComponent(id)}/payments`,
        params,
      }),
      providesTags: ["ProServices"],
    }),
    declareFleetPayment: b.mutation<
      { id: string; status: string },
      FleetPaymentIntent & { id: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/partners/fleet-assignments/${encodeURIComponent(id)}/payments`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["ProServices"],
    }),
  }),
});
export const { useGetFleetPaymentsQuery, useDeclareFleetPaymentMutation } =
  fleetPaymentsApi;
