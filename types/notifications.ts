export interface WhatsAppNotificationData {
  message: string;
  contacts: { id: string; name: string; phone: string }[];
  tripDetails: {
    departureLocation: string;
    arrivalLocation: string;
    departureDate: string;
    vehicleColor: string;
    licensePlate: string;
    driverName: string;
    driverPhone: string;
  };
}

export enum NotificationStatus {
  SENT = 'sent',
  FAILED = 'failed',
  PENDING = 'pending',
}

export interface Notification {
  id: string;
  userId: string | null;
  fcmToken: string;
  title: string;
  body: string;
  data: Record<string, any> | null;
  status: NotificationStatus;
  errorMessage: string | null;
  messageId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  total: number;
  unreadCount: number;
}

export interface MarkNotificationsResponse {
  updated: number;
}
