// ==================== Safety Types ====================

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship?: string | null;
  isActive: boolean;
  createdAt: string;
}

export type TripSafetyParticipantRole = 'driver' | 'passenger';

export type TripSafetyStatus =
  | 'pending'
  | 'boarded'
  | 'in_transit'
  | 'dropped_off'
  | 'arrived'
  | 'completed'
  | 'arrival_unconfirmed'
  | 'dropoff_unconfirmed'
  | 'alerted_contacts';

export type TripSafetyChannel = 'whatsapp' | 'push' | 'sms' | 'email';

export type TripSecurityStartAction = 'im_boarded' | 'trip_started';

export type TripSecurityConfirmationOutcome = 'arrived' | 'dropped_off' | 'trip_ended';

export type TripSafetyEventType =
  | 'tracking_created'
  | 'boarded'
  | 'in_transit'
  | 'trusted_contacts_notified'
  | 'status_changed'
  | 'confirmation_received'
  | 'estimated_end_reached'
  | 'auto_trip_end_detected'
  | 'reminder_sent'
  | 'escalation_triggered'
  | 'late_confirmation'
  | 'monitoring_cancelled';

export type TripSafetyNotificationType =
  | 'boarding_shared'
  | 'reminder'
  | 'escalation'
  | 'confirmation'
  | 'incident_signal';

export type TripSafetyNotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface TripSafetyTrustedContact {
  id: string;
  emergencyContactId: string;
  name: string;
  phone: string;
  email: string | null;
  channels: TripSafetyChannel[];
  lastNotifiedAt: string | null;
}

export interface TripSafetyParticipant {
  id: string;
  tripId: string;
  bookingId: string | null;
  userId: string;
  role: TripSafetyParticipantRole;
  status: TripSafetyStatus;
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
  trustedContacts: TripSafetyTrustedContact[];
  createdAt: string;
  updatedAt: string;
}

export interface TripSafetyNotificationDispatchStats {
  sent: number;
  failed: number;
  skipped: number;
}

export interface TripSafetyEvent {
  id: string;
  type: TripSafetyEventType;
  previousStatus: TripSafetyStatus | null;
  nextStatus: TripSafetyStatus | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
}

export interface TripSafetyNotification {
  id: string;
  notificationType: TripSafetyNotificationType;
  channel: TripSafetyChannel;
  recipient: string;
  status: TripSafetyNotificationStatus;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface TripSafetyParticipantHistory {
  participant: TripSafetyParticipant;
  events: TripSafetyEvent[];
  notifications: TripSafetyNotification[];
}

export interface TripSafetyTripHistory {
  tripId: string;
  participants: TripSafetyParticipant[];
  events: {
    id: string;
    participantId: string;
    userId: string;
    type: TripSafetyEventType;
    previousStatus: TripSafetyStatus | null;
    nextStatus: TripSafetyStatus | null;
    metadata: Record<string, unknown> | null;
    occurredAt: string;
  }[];
}
