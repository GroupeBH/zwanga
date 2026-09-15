import type {
  SafetyAlertType,
  ReportReason,
  TripSafetyChannel,
  TripSecurityConfirmationOutcome,
  TripSecurityStartAction,
} from '@/types';

export type CreateEmergencyContactPayload = {
  name: string;
  phone: string;
  relationship?: string;
};

export type UpdateEmergencyContactPayload = {
  name?: string;
  phone?: string;
  relationship?: string;
  isActive?: boolean;
};

export type CreateSafetyAlertPayload = {
  type: SafetyAlertType;
  message?: string;
  latitude?: number;
  longitude?: number;
  batteryLevel?: number;
  tripId?: string;
  bookingId?: string;
};

export type UpdateSafetyAlertStatusPayload = {
  status: 'resolved' | 'false_alarm';
};

export type UpdateLocationPayload = {
  latitude: number;
  longitude: number;
  batteryLevel?: number;
  tripId?: string;
  bookingId?: string;
};

export type CreateUserReportPayload = {
  reportedUserId: string;
  reason: ReportReason;
  description: string;
  tripId?: string;
  bookingId?: string;
};

export type UpdateReportStatusPayload = {
  status: 'under_review' | 'resolved' | 'dismissed';
  adminNotes?: string;
};

export type StartTripSecurityPayload = {
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

export type NotifyTripSecurityTrustedContactsPayload = {
  trustedContactIds?: string[];
  channels?: TripSafetyChannel[];
  customMessage?: string;
};

export type ConfirmTripSecurityPayload = {
  outcome: TripSecurityConfirmationOutcome;
  note?: string;
};

export type UpdateTripSecurityConfigurationPayload = {
  reminderDelayMinutes?: number;
  escalationDelayMinutes?: number;
  channels?: TripSafetyChannel[];
};

export type ManualTripSecurityEscalationPayload = {
  reason?: string;
  channels?: TripSafetyChannel[];
};

export type CancelTripSecurityPayload = {
  reason?: string;
};
