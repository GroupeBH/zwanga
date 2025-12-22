import type {
  EmergencyContact,
  SafetyAlert,
  SafetyAlertType,
  SafetyAlertStatus,
  UserReport,
  ReportReason,
  ReportStatus,
} from '@/types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

type ServerEmergencyContact = {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
  isActive: boolean;
  createdAt: string;
};

type ServerSafetyAlert = {
  id: string;
  userId: string;
  tripId: string | null;
  bookingId: string | null;
  type: SafetyAlertType;
  status: SafetyAlertStatus;
  message: string | null;
  latitude: number | null;
  longitude: number | null;
  batteryLevel: number | null;
  lastLocationUpdate: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

type ServerUserReport = {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reason: ReportReason;
  description: string;
  status: ReportStatus;
  tripId: string | null;
  bookingId: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

const mapServerEmergencyContact = (contact: ServerEmergencyContact): EmergencyContact => ({
  id: contact.id,
  name: contact.name,
  phone: contact.phone,
  relationship: contact.relationship,
  isActive: contact.isActive,
  createdAt: contact.createdAt,
});

const mapServerSafetyAlert = (alert: ServerSafetyAlert): SafetyAlert => ({
  id: alert.id,
  userId: alert.userId,
  tripId: alert.tripId,
  bookingId: alert.bookingId,
  type: alert.type,
  status: alert.status,
  message: alert.message,
  latitude: alert.latitude,
  longitude: alert.longitude,
  batteryLevel: alert.batteryLevel,
  lastLocationUpdate: alert.lastLocationUpdate,
  createdAt: alert.createdAt,
  resolvedAt: alert.resolvedAt,
});

const mapServerUserReport = (report: ServerUserReport): UserReport => ({
  id: report.id,
  reporterId: report.reporterId,
  reportedUserId: report.reportedUserId,
  reason: report.reason,
  description: report.description,
  status: report.status,
  tripId: report.tripId,
  bookingId: report.bookingId,
  createdAt: report.createdAt,
  reviewedAt: report.reviewedAt,
});

type CreateEmergencyContactPayload = {
  name: string;
  phone: string;
  relationship?: string;
};

type UpdateEmergencyContactPayload = {
  name?: string;
  phone?: string;
  relationship?: string;
  isActive?: boolean;
};

type CreateSafetyAlertPayload = {
  type: SafetyAlertType;
  message?: string;
  latitude?: number;
  longitude?: number;
  batteryLevel?: number;
  tripId?: string;
  bookingId?: string;
};

type UpdateSafetyAlertStatusPayload = {
  status: 'resolved' | 'false_alarm';
};

type UpdateLocationPayload = {
  latitude: number;
  longitude: number;
  batteryLevel?: number;
  tripId?: string;
  bookingId?: string;
};

type CreateUserReportPayload = {
  reportedUserId: string;
  reason: ReportReason;
  description: string;
  tripId?: string;
  bookingId?: string;
};

type UpdateReportStatusPayload = {
  status: 'under_review' | 'resolved' | 'dismissed';
  adminNotes?: string;
};

export const safetyApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
    // ==================== Emergency Contacts ====================

    // Créer un contact d'urgence
    createEmergencyContact: builder.mutation<EmergencyContact, CreateEmergencyContactPayload>({
      query: (payload: CreateEmergencyContactPayload) => ({
        url: '/safety/emergency-contacts',
        method: 'POST',
        body: payload,
      }),
      transformResponse: (response: ServerEmergencyContact) => mapServerEmergencyContact(response),
      invalidatesTags: ['EmergencyContact'],
    }),

    // Récupérer tous les contacts d'urgence
    getEmergencyContacts: builder.query<EmergencyContact[], void>({
      query: () => '/safety/emergency-contacts',
      transformResponse: (response: ServerEmergencyContact[]) =>
        response.map(mapServerEmergencyContact),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'EmergencyContact' as const, id })),
              'EmergencyContact',
            ]
          : ['EmergencyContact'],
    }),

    // Mettre à jour un contact d'urgence
    updateEmergencyContact: builder.mutation<
      EmergencyContact,
      { id: string; payload: UpdateEmergencyContactPayload }
    >({
      query: ({ id, payload }: { id: string; payload: UpdateEmergencyContactPayload }) => ({
        url: `/safety/emergency-contacts/${id}`,
        method: 'PUT',
        body: payload,
      }),
      transformResponse: (response: ServerEmergencyContact) => mapServerEmergencyContact(response),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'EmergencyContact', id }],
    }),

    // Supprimer un contact d'urgence
    deleteEmergencyContact: builder.mutation<void, string>({
      query: (id: string) => ({
        url: `/safety/emergency-contacts/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [{ type: 'EmergencyContact', id }],
    }),

    // ==================== Safety Alerts ====================

    // Créer une alerte de sécurité
    createSafetyAlert: builder.mutation<SafetyAlert, CreateSafetyAlertPayload>({
      query: (payload: CreateSafetyAlertPayload) => ({
        url: '/safety/alerts',
        method: 'POST',
        body: payload,
      }),
      transformResponse: (response: ServerSafetyAlert) => mapServerSafetyAlert(response),
      invalidatesTags: ['SafetyAlert'],
    }),

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
    }),
  }),
});

export const {
  useCreateEmergencyContactMutation,
  useGetEmergencyContactsQuery,
  useUpdateEmergencyContactMutation,
  useDeleteEmergencyContactMutation,
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

