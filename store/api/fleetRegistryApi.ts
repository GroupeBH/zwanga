import { baseApi } from "./baseApi";
import type { BaseEndpointBuilder } from "./types";
export interface FleetAssignment {
  id: string;
  status: "PENDING" | "ACTIVE" | "ENDED" | "CANCELLED";
  terms: string;
  plate: string;
  brand: string;
  model: string;
  organizationName: string;
  periodicAmountMinor: string | null;
  paymentPeriod: "DAILY" | "WEEKLY" | "MONTHLY" | null;
}
export const fleetRegistryApi = baseApi.injectEndpoints({
  endpoints: (b: BaseEndpointBuilder) => ({
    getMyFleetAssignments: b.query<
      { items: FleetAssignment[]; nextCursor: string | null },
      { before?: string } | void
    >({
      query: (args) => ({
        url: "/partners/fleet-assignments/history",
        params: args || undefined,
      }),
      providesTags: ["ProServices"],
    }),
    decideFleetAssignment: b.mutation<
      { id: string },
      { id: string; accept: boolean; paymentTermsConfirmed?: true }
    >({
      query: ({ id, ...body }) => ({
        url: `/partners/fleet-assignments/${encodeURIComponent(id)}/decide`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["ProServices"],
    }),
    getMyFleetOrganizations: b.query<
      {
        items: {
          id: string;
          displayName: string;
          status: string;
          partnerTypes: { type: string; status: string }[];
        }[];
      },
      void
    >({
      query: () => "/partners/me/organizations",
      providesTags: ["ProServices"],
    }),
    createFleetOrganization: b.mutation<
      { id: string },
      { displayName: string }
    >({
      query: (body) => ({
        url: "/partners/organizations",
        method: "POST",
        body: {
          ...body,
          legalType: "INDIVIDUAL",
          partnerTypes: ["FLEET_OWNER"],
        },
      }),
      invalidatesTags: ["ProServices"],
    }),
  }),
});
export const {
  useGetMyFleetAssignmentsQuery,
  useDecideFleetAssignmentMutation,
  useGetMyFleetOrganizationsQuery,
  useCreateFleetOrganizationMutation,
} = fleetRegistryApi;
