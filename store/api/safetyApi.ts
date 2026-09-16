import { buildCreateEmergencyContactEndpoints } from './safety/createEmergencyContact.endpoints';
import { buildUpdateLocationEndpoints } from './safety/updateLocation.endpoints';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

export const safetyApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
    ...buildCreateEmergencyContactEndpoints(builder),
    ...buildUpdateLocationEndpoints(builder),
  }),
});

export const {
  useCreateEmergencyContactMutation,
  useGetEmergencyContactsQuery,
  useUpdateEmergencyContactMutation,
  useDeleteEmergencyContactMutation,
  useStartTripSecurityTrackingMutation,
  useNotifyTripSecurityTrustedContactsMutation,
  useConfirmTripSecurityParticipantMutation,
  useUpdateTripSecurityConfigurationMutation,
  useEscalateTripSecurityParticipantMutation,
  useCancelTripSecurityTrackingMutation,
  useGetTripSecurityParticipantQuery,
  useGetTripSecurityParticipantHistoryQuery,
  useGetTripSecurityTripParticipantsQuery,
  useGetTripSecurityTripHistoryQuery,
  useCreateSafetyAlertMutation,
  useUpdateLocationMutation,
  useGetSafetyAlertsQuery,
  useGetSafetyAlertByIdQuery,
  useUpdateSafetyAlertStatusMutation,
  useCreateUserReportMutation,
  useGetUserReportsQuery,
  useGetUserReportByIdQuery,
  useUpdateReportStatusMutation,
} = safetyApi;

