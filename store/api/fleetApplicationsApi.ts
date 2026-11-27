import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';
export type FleetApplicationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
export interface MyFleetApplication {
  id: string; organizationId: string; organizationName: string; message: string;
  status: FleetApplicationStatus; decisionNote: string | null; createdAt: string;
}
export interface FleetPage<T> { items: T[]; page: number; limit: number; total: number }
export const fleetApplicationsApi = baseApi.injectEndpoints({
  endpoints: (b: BaseEndpointBuilder) => ({
    getFleetDirectory: b.query<FleetPage<{ id: string; displayName: string }>, { page?: number; search?: string }>({
      query: params => ({ url: '/partners/fleets/directory', params: { ...params, limit: 20 } }),
      providesTags: [{ type: 'ProServices', id: 'FLEET' }],
    }),
    getMyFleetApplications: b.query<FleetPage<MyFleetApplication>, { page?: number }>({
      query: params => ({ url: '/partners/fleet-applications/mine', params: { ...params, limit: 20 } }),
      providesTags: [{ type: 'ProServices', id: 'FLEET' }],
    }),
    applyToFleet: b.mutation<{ id: string; status: FleetApplicationStatus }, { organizationId: string; message: string }>({
      query: ({ organizationId, ...body }) => ({ url: `/partners/fleets/${encodeURIComponent(organizationId)}/applications`, method: 'POST', body }),
      invalidatesTags: [{ type: 'ProServices', id: 'FLEET' }],
    }),
    withdrawFleetApplication: b.mutation<{ id: string; status: FleetApplicationStatus }, { id: string }>({
      query: ({ id }) => ({ url: `/partners/fleet-applications/${encodeURIComponent(id)}/withdraw`, method: 'POST', body: {} }),
      invalidatesTags: [{ type: 'ProServices', id: 'FLEET' }],
    }),
  }),
});
export const { useGetFleetDirectoryQuery, useGetMyFleetApplicationsQuery, useApplyToFleetMutation, useWithdrawFleetApplicationMutation } = fleetApplicationsApi;
