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
      providesTags: [{ type: 'ProServices', id: 'FLEET' }],
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
      invalidatesTags: [{ type: 'ProServices', id: 'FLEET' }],
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
      providesTags: [{ type: 'ProServices', id: 'FLEET' }],
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
      invalidatesTags: [{ type: 'ProServices', id: 'FLEET' }],
    }),
  }),
});
export const {
  useGetMyFleetAssignmentsQuery,
  useDecideFleetAssignmentMutation,
  useGetMyFleetOrganizationsQuery,
  useCreateFleetOrganizationMutation,
} = fleetRegistryApi;
