import type {
  EmergencyContact,
  SafetyAlert,
  SafetyAlertType,
  SafetyAlertStatus,
  UserReport,
  ReportReason,
  ReportStatus,
  TripSafetyChannel,
  TripSafetyParticipant,
  TripSafetyParticipantHistory,
  TripSafetyTripHistory,
  TripSecurityConfirmationOutcome,
  TripSecurityStartAction,
  TripSafetyNotificationDispatchStats,
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

type ServerTripSafetyTrustedContact = {
  id: string;
  emergencyContactId: string;
  name: string;
  phone: string;
  email: string | null;
  channels: TripSafetyChannel[];
  lastNotifiedAt: string | null;
};

type ServerTripSafetyParticipant = {
  id: string;
  tripId: string;
  bookingId: string | null;
  userId: string;
  role: 'driver' | 'passenger';
  status:
    | 'pending'
    | 'boarded'
    | 'in_transit'
    | 'dropped_off'
    | 'arrived'
    | 'completed'
    | 'arrival_unconfirmed'
    | 'dropoff_unconfirmed'
    | 'alerted_contacts';
  startedAt: string | null;
  boardedAt: string | null;
  inTransitAt: string | null;
  estimatedEndAt: string | null;
  tripEndedDetectedAt: string | null;
  droppedOffAt: string | null;
  arrivedAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  reminderSentAt: string | null;
  reminderCount: number;
  escalatedAt: string | null;
  isEscalated: boolean;
  reminderDelayMinutes: number;
  escalationDelayMinutes: number;
  notificationChannels: TripSafetyChannel[];
  trackingCode: string;
  cancelledAt: string | null;
  trustedContacts: ServerTripSafetyTrustedContact[];
  createdAt: string;
  updatedAt: string;
};

type ServerTripSafetyParticipantHistory = {
  participant: ServerTripSafetyParticipant;
  events: TripSafetyParticipantHistory['events'];
  notifications: TripSafetyParticipantHistory['notifications'];
};

type ServerTripSafetyTripHistory = {
  tripId: string;
  participants: ServerTripSafetyParticipant[];
  events: TripSafetyTripHistory['events'];
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

const mapServerTripSafetyParticipant = (
  participant: ServerTripSafetyParticipant,
): TripSafetyParticipant => ({
  id: participant.id,
  tripId: participant.tripId,
  bookingId: participant.bookingId,
  userId: participant.userId,
  role: participant.role,
  status: participant.status,
  startedAt: participant.startedAt,
  boardedAt: participant.boardedAt,
  inTransitAt: participant.inTransitAt,
  estimatedEndAt: participant.estimatedEndAt,
  tripEndedDetectedAt: participant.tripEndedDetectedAt,
  droppedOffAt: participant.droppedOffAt,
  arrivedAt: participant.arrivedAt,
  confirmedAt: participant.confirmedAt,
  completedAt: participant.completedAt,
  reminderSentAt: participant.reminderSentAt,
  reminderCount: participant.reminderCount,
  escalatedAt: participant.escalatedAt,
  isEscalated: participant.isEscalated,
  reminderDelayMinutes: participant.reminderDelayMinutes,
  escalationDelayMinutes: participant.escalationDelayMinutes,
  notificationChannels: participant.notificationChannels,
  trackingCode: participant.trackingCode,
  cancelledAt: participant.cancelledAt,
  trustedContacts: (participant.trustedContacts ?? []).map((contact) => ({
    id: contact.id,
    emergencyContactId: contact.emergencyContactId,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    channels: contact.channels,
    lastNotifiedAt: contact.lastNotifiedAt,
  })),
  createdAt: participant.createdAt,
  updatedAt: participant.updatedAt,
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

type StartTripSecurityPayload = {
  tripId: string;
  bookingId?: string;
  action?: TripSecurityStartAction;
  trustedContactIds?: string[];
  estimatedEndAt?: string;
  reminderDelayMinutes?: number;
  escalationDelayMinutes?: number;
  channels?: TripSafetyChannel[];
  notifyTrustedContacts?: boolean;
};

type NotifyTripSecurityTrustedContactsPayload = {
  trustedContactIds?: string[];
  channels?: TripSafetyChannel[];
  customMessage?: string;
};

type ConfirmTripSecurityPayload = {
  outcome: TripSecurityConfirmationOutcome;
  note?: string;
};

type UpdateTripSecurityConfigurationPayload = {
  reminderDelayMinutes?: number;
  escalationDelayMinutes?: number;
  channels?: TripSafetyChannel[];
};

type ManualTripSecurityEscalationPayload = {
  reason?: string;
  channels?: TripSafetyChannel[];
};

type CancelTripSecurityPayload = {
  reason?: string;
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

    // ==================== Trip Security ====================

    startTripSecurityTracking: builder.mutation<TripSafetyParticipant, StartTripSecurityPayload>({
      query: (payload: StartTripSecurityPayload) => ({
        url: '/safety/trip-security/start',
        method: 'POST',
        body: payload,
      }),
      transformResponse: (response: ServerTripSafetyParticipant) =>
        mapServerTripSafetyParticipant(response),
      invalidatesTags: (result) =>
        result
          ? [
              { type: 'TripSafetyParticipant' as const, id: result.id },
              { type: 'TripSafetyTrip' as const, id: result.tripId },
            ]
          : ['TripSafetyParticipant'],
    }),

    notifyTripSecurityTrustedContacts: builder.mutation<
      { participant: TripSafetyParticipant; notificationStats: TripSafetyNotificationDispatchStats },
      { participantId: string; payload: NotifyTripSecurityTrustedContactsPayload }
    >({
      query: ({
        participantId,
        payload,
      }: {
        participantId: string;
        payload: NotifyTripSecurityTrustedContactsPayload;
      }) => ({
        url: `/safety/trip-security/${participantId}/notify-trusted-contacts`,
        method: 'POST',
        body: payload,
      }),
      transformResponse: (response: {
        participant: ServerTripSafetyParticipant;
        notificationStats: TripSafetyNotificationDispatchStats;
      }) => ({
        participant: mapServerTripSafetyParticipant(response.participant),
        notificationStats: response.notificationStats,
      }),
      invalidatesTags: (_result, _error, { participantId }) => [
        { type: 'TripSafetyParticipant', id: participantId },
      ],
    }),

    confirmTripSecurityParticipant: builder.mutation<
      TripSafetyParticipant,
      { participantId: string; payload: ConfirmTripSecurityPayload }
    >({
      query: ({
        participantId,
        payload,
      }: {
        participantId: string;
        payload: ConfirmTripSecurityPayload;
      }) => ({
        url: `/safety/trip-security/${participantId}/confirm`,
        method: 'POST',
        body: payload,
      }),
      transformResponse: (response: ServerTripSafetyParticipant) =>
        mapServerTripSafetyParticipant(response),
      invalidatesTags: (result, _error, { participantId }) => [
        { type: 'TripSafetyParticipant', id: participantId },
        ...(result ? [{ type: 'TripSafetyTrip' as const, id: result.tripId }] : []),
      ],
    }),

    updateTripSecurityConfiguration: builder.mutation<
      TripSafetyParticipant,
      { participantId: string; payload: UpdateTripSecurityConfigurationPayload }
    >({
      query: ({
        participantId,
        payload,
      }: {
        participantId: string;
        payload: UpdateTripSecurityConfigurationPayload;
      }) => ({
        url: `/safety/trip-security/${participantId}/configuration`,
        method: 'PUT',
        body: payload,
      }),
      transformResponse: (response: ServerTripSafetyParticipant) =>
        mapServerTripSafetyParticipant(response),
      invalidatesTags: (_result, _error, { participantId }) => [
        { type: 'TripSafetyParticipant', id: participantId },
      ],
    }),

    escalateTripSecurityParticipant: builder.mutation<
      { participant: TripSafetyParticipant; notificationStats: TripSafetyNotificationDispatchStats },
      { participantId: string; payload: ManualTripSecurityEscalationPayload }
    >({
      query: ({
        participantId,
        payload,
      }: {
        participantId: string;
        payload: ManualTripSecurityEscalationPayload;
      }) => ({
        url: `/safety/trip-security/${participantId}/escalate`,
        method: 'POST',
        body: payload,
      }),
      transformResponse: (response: {
        participant: ServerTripSafetyParticipant;
        notificationStats: TripSafetyNotificationDispatchStats;
      }) => ({
        participant: mapServerTripSafetyParticipant(response.participant),
        notificationStats: response.notificationStats,
      }),
      invalidatesTags: (_result, _error, { participantId }) => [
        { type: 'TripSafetyParticipant', id: participantId },
      ],
    }),

    cancelTripSecurityTracking: builder.mutation<
      TripSafetyParticipant,
      { participantId: string; payload?: CancelTripSecurityPayload }
    >({
      query: ({
        participantId,
        payload,
      }: {
        participantId: string;
        payload?: CancelTripSecurityPayload;
      }) => ({
        url: `/safety/trip-security/${participantId}/cancel`,
        method: 'POST',
        body: payload ?? {},
      }),
      transformResponse: (response: ServerTripSafetyParticipant) =>
        mapServerTripSafetyParticipant(response),
      invalidatesTags: (result, _error, { participantId }) => [
        { type: 'TripSafetyParticipant', id: participantId },
        ...(result ? [{ type: 'TripSafetyTrip' as const, id: result.tripId }] : []),
      ],
    }),

    getTripSecurityParticipant: builder.query<TripSafetyParticipant, string>({
      query: (participantId: string) => `/safety/trip-security/participants/${participantId}`,
      transformResponse: (response: ServerTripSafetyParticipant) =>
        mapServerTripSafetyParticipant(response),
      providesTags: (_result, _error, participantId) => [
        { type: 'TripSafetyParticipant', id: participantId },
      ],
    }),

    getTripSecurityParticipantHistory: builder.query<TripSafetyParticipantHistory, string>({
      query: (participantId: string) =>
        `/safety/trip-security/participants/${participantId}/history`,
      transformResponse: (
        response: ServerTripSafetyParticipantHistory,
      ): TripSafetyParticipantHistory => ({
        participant: mapServerTripSafetyParticipant(response.participant),
        events: response.events,
        notifications: response.notifications,
      }),
      providesTags: (_result, _error, participantId) => [
        { type: 'TripSafetyHistory', id: participantId },
      ],
    }),

    getTripSecurityTripParticipants: builder.query<TripSafetyParticipant[], string>({
      query: (tripId: string) => `/safety/trip-security/trips/${tripId}`,
      transformResponse: (response: ServerTripSafetyParticipant[]) =>
        response.map(mapServerTripSafetyParticipant),
      providesTags: (result, _error, tripId) =>
        result
          ? [
              ...result.map((participant) => ({
                type: 'TripSafetyParticipant' as const,
                id: participant.id,
              })),
              { type: 'TripSafetyTrip' as const, id: tripId },
            ]
          : [{ type: 'TripSafetyTrip' as const, id: tripId }],
    }),

    getTripSecurityTripHistory: builder.query<TripSafetyTripHistory, string>({
      query: (tripId: string) => `/safety/trip-security/trips/${tripId}/history`,
      transformResponse: (response: ServerTripSafetyTripHistory): TripSafetyTripHistory => ({
        tripId: response.tripId,
        participants: response.participants.map(mapServerTripSafetyParticipant),
        events: response.events,
      }),
      providesTags: (_result, _error, tripId) => [{ type: 'TripSafetyTrip', id: tripId }],
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

