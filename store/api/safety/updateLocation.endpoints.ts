import {
  UpdateSafetyAlertStatusPayload,
  UpdateLocationPayload,
  CreateUserReportPayload,
  UpdateReportStatusPayload,
} from './contracts';
import { mapServerSafetyAlert, mapServerUserReport } from './safetyMapper';
import { ServerSafetyAlert, ServerUserReport } from './serverTypes';
import type { SafetyAlert, UserReport } from '@/types';
import type { BaseEndpointBuilder } from '../types';

export function buildUpdateLocationEndpoints(builder: BaseEndpointBuilder) {
  return {
// Mettre à jour la position
    updateLocation: builder.mutation<void, UpdateLocationPayload>({
      query: (payload: UpdateLocationPayload) => ({
        url: '/safety/location/update',
        method: 'POST',
        body: payload,
      }),
      invalidatesTags: ['SafetyAlert'],
    }),
// Récupérer toutes les alertes de sécurité
    getSafetyAlerts: builder.query<SafetyAlert[], void>({
      query: () => '/safety/alerts',
      transformResponse: (response: ServerSafetyAlert[]) => response.map(mapServerSafetyAlert),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'SafetyAlert' as const, id })), 'SafetyAlert']
          : ['SafetyAlert'],
    }),
// Récupérer une alerte de sécurité spécifique
    getSafetyAlertById: builder.query<SafetyAlert, string>({
      query: (id: string) => `/safety/alerts/${id}`,
      transformResponse: (response: ServerSafetyAlert) => mapServerSafetyAlert(response),
      providesTags: (_result, _error, id) => [{ type: 'SafetyAlert', id }],
    }),
// Mettre à jour le statut d'une alerte
    updateSafetyAlertStatus: builder.mutation<
      SafetyAlert,
      { id: string; payload: UpdateSafetyAlertStatusPayload }
    >({
      query: ({ id, payload }: { id: string; payload: UpdateSafetyAlertStatusPayload }) => ({
        url: `/safety/alerts/${id}/status`,
        method: 'PUT',
        body: payload,
      }),
      transformResponse: (response: ServerSafetyAlert) => mapServerSafetyAlert(response),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'SafetyAlert', id }],
    }),
// ==================== User Reports ====================

    // Créer un signalement
    createUserReport: builder.mutation<UserReport, CreateUserReportPayload>({
      query: (payload: CreateUserReportPayload) => ({
        url: '/safety/reports',
        method: 'POST',
        body: payload,
      }),
      transformResponse: (response: ServerUserReport) => mapServerUserReport(response),
      invalidatesTags: ['UserReport'],
    }),
// Récupérer tous les signalements
    getUserReports: builder.query<UserReport[], void>({
      query: () => '/safety/reports',
      transformResponse: (response: ServerUserReport[]) => response.map(mapServerUserReport),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'UserReport' as const, id })), 'UserReport']
          : ['UserReport'],
    }),
// Récupérer un signalement spécifique
    getUserReportById: builder.query<UserReport, string>({
      query: (id: string) => `/safety/reports/${id}`,
      transformResponse: (response: ServerUserReport) => mapServerUserReport(response),
      providesTags: (_result, _error, id) => [{ type: 'UserReport', id }],
    }),
// Mettre à jour le statut d'un signalement (admin)
    updateReportStatus: builder.mutation<UserReport, { id: string; payload: UpdateReportStatusPayload }>({
      query: ({ id, payload }: { id: string; payload: UpdateReportStatusPayload }) => ({
        url: `/safety/reports/${id}/status`,
        method: 'PUT',
        body: payload,
      }),
      transformResponse: (response: ServerUserReport) => mapServerUserReport(response),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'UserReport', id }],
    })
  };
}
