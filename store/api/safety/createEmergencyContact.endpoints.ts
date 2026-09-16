import {
  CreateEmergencyContactPayload,
  UpdateEmergencyContactPayload,
  CreateSafetyAlertPayload,
  StartTripSecurityPayload,
  NotifyTripSecurityTrustedContactsPayload,
  ConfirmTripSecurityPayload,
  UpdateTripSecurityConfigurationPayload,
  ManualTripSecurityEscalationPayload,
  CancelTripSecurityPayload,
} from './contracts';
import { mapServerEmergencyContact, mapServerSafetyAlert, mapServerTripSafetyParticipant } from './safetyMapper';
import {
  ServerEmergencyContact,
  ServerSafetyAlert,
  ServerTripSafetyParticipant,
  ServerTripSafetyParticipantHistory,
  ServerTripSafetyTripHistory,
} from './serverTypes';
import type {
  EmergencyContact,
  SafetyAlert,
  TripSafetyParticipant,
  TripSafetyParticipantHistory,
  TripSafetyTripHistory,
  TripSafetyNotificationDispatchStats,
} from '@/types';
import type { BaseEndpointBuilder } from '../types';

export function buildCreateEmergencyContactEndpoints(builder: BaseEndpointBuilder) {
  return {
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
    })
  };
}
