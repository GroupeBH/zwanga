import type {
  SafetyAlertType,
  SafetyAlertStatus,
  ReportReason,
  ReportStatus,
  TripSafetyChannel,
  TripSafetyParticipantHistory,
  TripSafetyTripHistory,
} from '@/types';

export type ServerEmergencyContact = {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
  isActive: boolean;
  createdAt: string;
};

export type ServerSafetyAlert = {
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

export type ServerUserReport = {
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

export type ServerTripSafetyTrustedContact = {
  id: string;
  emergencyContactId: string;
  name: string;
  phone: string;
  email: string | null;
  channels: TripSafetyChannel[];
  lastNotifiedAt: string | null;
};

export type ServerTripSafetyParticipant = {
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

export type ServerTripSafetyParticipantHistory = {
  participant: ServerTripSafetyParticipant;
  events: TripSafetyParticipantHistory['events'];
  notifications: TripSafetyParticipantHistory['notifications'];
};

export type ServerTripSafetyTripHistory = {
  tripId: string;
  participants: ServerTripSafetyParticipant[];
  events: TripSafetyTripHistory['events'];
};
