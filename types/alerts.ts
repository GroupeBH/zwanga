export type SafetyAlertType =
  | 'phone_shutdown'
  | 'low_battery'
  | 'manual_alert'
  | 'no_response'
  | 'emergency';

export type SafetyAlertStatus = 'active' | 'resolved' | 'false_alarm';

export interface SafetyAlert {
  id: string;
  userId: string;
  tripId?: string | null;
  bookingId?: string | null;
  type: SafetyAlertType;
  status: SafetyAlertStatus;
  message?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  batteryLevel?: number | null;
  lastLocationUpdate?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export type ReportReason =
  | 'inappropriate_behavior'
  | 'harassment'
  | 'safety_concern'
  | 'fraud'
  | 'other';

export type ReportStatus = 'pending' | 'under_review' | 'resolved' | 'dismissed';

export interface UserReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reason: ReportReason;
  description: string;
  status: ReportStatus;
  tripId?: string | null;
  bookingId?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
}
