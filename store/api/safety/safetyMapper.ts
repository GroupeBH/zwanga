import {
  ServerEmergencyContact,
  ServerSafetyAlert,
  ServerUserReport,
  ServerTripSafetyParticipant,
} from './serverTypes';
import type { EmergencyContact, SafetyAlert, UserReport, TripSafetyParticipant } from '@/types';

export const mapServerEmergencyContact = (contact: ServerEmergencyContact): EmergencyContact => ({
  id: contact.id,
  name: contact.name,
  phone: contact.phone,
  relationship: contact.relationship,
  isActive: contact.isActive,
  createdAt: contact.createdAt,
});

export const mapServerSafetyAlert = (alert: ServerSafetyAlert): SafetyAlert => ({
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

export const mapServerUserReport = (report: ServerUserReport): UserReport => ({
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

export const mapServerTripSafetyParticipant = (
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
