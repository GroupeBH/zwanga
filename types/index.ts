export type UserRole = 'driver' | 'passenger' | 'both';
export type VehicleType = 'car' | 'moto' | 'tricycle';
export type TripStatus = 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
export type RecurringTripStatus = 'active' | 'paused';
export type BookingStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed' | 'expired';
export type PaymentMethod = 'orange_money' | 'm_pesa' | 'airtel_money' | 'cash';
export type SubscriptionPaymentMethod = 'mobile_money' | 'card';
export type SubscriptionPaymentStatus =
  | 'pending'
  | 'initiated'
  | 'succeeded'
  | 'failed'
  | 'cancelled';
export type SubscriptionPlan = 'pro' | 'monthly' | 'yearly';
export type SubscriptionStatus = 'pending' | 'active' | 'expired' | 'cancelled' | 'payment_failed';

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: UserRole;
  avatar?: string;
  profilePicture?: string | null;
  firstName?: string;
  lastName?: string;
  rating: number;
  totalTrips: number;
  verified: boolean;
  identityVerified: boolean; // Vérification d'identité (carte + visage)
  vehicle?: Vehicle;
  isDriver?: boolean;
  isPremium?: boolean;
  premiumBadge?: boolean;
  premiumBadgeEnabled?: boolean;
  createdAt: string; // ISO string date
  status?: string;
}

export interface TripDriverInfo {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  profilePicture?: string | null;
  role?: UserRole;
  status?: string;
  isDriver?: boolean;
  isPremium?: boolean;
  premiumBadge?: boolean;
  premiumBadgeEnabled?: boolean;
  averageRating?: number | null;
  totalRatings?: number;
}

export interface SubscriptionPlanSummary {
  plan: SubscriptionPlan;
  amount: number | string;
  currency: string;
  premiumBadgeEnabled: boolean;
  featuredTripsEnabled: boolean;
  documentFundingEnabled: boolean;
  documentFundingLimit: number | null;
  documentFundingCurrency?: string;
  paymentMethods?: SubscriptionPaymentMethod[];
  eligibleDocumentTypes: string[];
}

export interface PremiumOverview {
  isActive: boolean;
  isPremium: boolean;
  premiumBadgeEnabled: boolean;
  featuredTripsEnabled: boolean;
  documentFundingEnabled: boolean;
  documentFundingLimit: number | null;
  documentFundingCurrency: string;
  subscriptionId: string | null;
  plan: SubscriptionPlan | null;
  endDate: string | null;
}

export interface Subscription {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  amount: number | string;
  currency: string;
  premiumBadgeEnabled: boolean;
  featuredTripsEnabled: boolean;
  documentFundingEnabled: boolean;
  documentFundingLimit: number | null;
  documentFundingCurrency: string;
  paymentReference?: string | null;
  paymentTransactionId?: string | null;
  isTrial: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPayment {
  transactionId: string | null;
  method: SubscriptionPaymentMethod | null;
  reference: string | null;
  orderNumber: string | null;
  status: SubscriptionPaymentStatus | null;
  statusCode: string | null;
  message: string | null;
  paymentUrl: string | null;
  amount: number;
  currency: string;
}

export interface SubscriptionPaymentResponse {
  subscription: Subscription;
  payment: SubscriptionPayment;
}

export interface SubscribeToProPayload {
  paymentMethod: SubscriptionPaymentMethod;
  phone?: string;
  approveUrl?: string;
  cancelUrl?: string;
  declineUrl?: string;
}

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface Vehicle {
  id: string;
  ownerId: string;
  brand: string;
  model: string;
  color: string;
  licensePlate: string;
  photoUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  name: string;
  address: string;
  lat: number;
  lng: number;
  reference?: string | null;
  hasCoordinates?: boolean;
}

export interface Trip {
  id: string;
  driverId: string;
  driverName: string;
  driverAvatar?: string;
  driverRating: number;
  driver?: TripDriverInfo | null;
  vehicleType: VehicleType;
  vehicleInfo: string;
  departure: Location;
  arrival: Location;
  departureTime: string; // ISO string date
  arrivalTime: string; // ISO string date
  price: number;
  isFree?: boolean;
  availableSeats: number;
  totalSeats: number;
  status: TripStatus;
  passengers?: Passenger[];
  progress?: number;
  currentLocation?: GeoPoint | null;
  lastLocationUpdateAt?: string | null;
  completedAt?: string | null; // ISO string date - Date de complétion du trajet
  vehicleId?: string | null; // ID du véhicule associé
  description?: string | null; // Description du trajet
  vehicle?: Vehicle; // Informations complètes du véhicule
  driverSafetyEmergencyContactIds?: string[];
  recurringTemplateId?: string | null;
  recurringOccurrenceDate?: string | null;
  isFeatured?: boolean;
}

export interface RecurringTripTemplate {
  id: string;
  driverId: string;
  departure: Location;
  arrival: Location;
  departureTime: string;
  weekdays: number[];
  startDate: string;
  endDate?: string | null;
  totalSeats: number;
  pricePerSeat: number;
  isFree: boolean;
  description?: string | null;
  status: RecurringTripStatus;
  vehicleId: string;
  vehicle?: Vehicle | null;
  nextOccurrenceDate?: string | null;
  upcomingGeneratedTripsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Passenger {
  id: string;
  name: string;
  avatar?: string;
  rating: number;
  phone: string;
}

export interface Booking {
  id: string;
  tripId: string;
  passengerId: string;
  passengerName?: string;
  passengerAvatar?: string;
  passengerPhone?: string;
  numberOfSeats: number;
  status: BookingStatus;
  rejectionReason?: string;
  acceptedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
  trip?: Trip;
  // Point de récupération personnalisé du passager
  passengerOrigin?: string | null;
  passengerOriginReference?: string | null;
  passengerOriginCoordinates?: { latitude: number; longitude: number } | null;
  // Destination personnalisée du passager
  passengerDestination?: string | null;
  passengerDestinationReference?: string | null;
  passengerDestinationCoordinates?: { latitude: number; longitude: number } | null;
  // Confirmation de récupération
  pickedUp?: boolean;
  pickedUpAt?: string | null;
  pickedUpConfirmedByPassenger?: boolean;
  pickedUpConfirmedAt?: string | null;
  // Confirmation de dépose
  droppedOff?: boolean;
  droppedOffAt?: string | null;
  droppedOffConfirmedByPassenger?: boolean;
  droppedOffConfirmedAt?: string | null;
  safetyEmergencyContactIds?: string[];
}

export interface BasicUserInfo {
  id: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string | null;
  phone?: string;
}

export interface ConversationParticipant {
  id: string;
  conversationId?: string;
  userId: string;
  user: BasicUserInfo | null;
  lastReadAt?: string | null;
  isMuted: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  bookingId?: string | null;
  senderId: string;
  sender?: BasicUserInfo | null;
  content: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  title?: string | null;
  bookingId?: string | null;
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
  participants: ConversationParticipant[];
  lastMessage?: Message | null;
  unreadCount: number;
}

export type KycStatus = 'pending' | 'approved' | 'rejected';

export interface KycDocument {
  id: string;
  userId: string;
  cniFrontUrl: string;
  cniBackUrl: string;
  selfieUrl: string;
  status: KycStatus;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileStats {
  vehicles: number;
  tripsAsDriver: number;
  bookingsAsPassenger: number;
  bookingsAsDriver: number;
  messagesSent: number;
}

export interface ProfileSummary {
  user: User;
  stats: ProfileStats;
}

export interface Review {
  id: string;
  ratedUserId: string;
  raterId: string;
  fromUserName?: string;
  fromUserAvatar?: string;
  rating: number;
  comment?: string;
  tripId?: string | null;
  createdAt: string; // ISO string date
}

export type TripRequestStatus = 'pending' | 'offers_received' | 'driver_selected' | 'cancelled' | 'expired';

export interface TripRequest {
  id: string;
  passengerId: string;
  passengerName?: string;
  passengerAvatar?: string;
  departure: Location;
  arrival: Location;
  departureDateMin: string; // ISO string date - Date/heure de départ minimum souhaitée
  departureDateMax: string; // ISO string date - Date/heure de départ maximum acceptée
  numberOfSeats: number;
  maxPricePerSeat?: number | null; // Prix maximum par place accepté (optionnel)
  description?: string | null;
  status: TripRequestStatus;
  selectedDriverId?: string | null; // Driver sélectionné par le passager
  selectedDriverName?: string; // Nom du driver sélectionné
  selectedDriverAvatar?: string; // Avatar du driver sélectionné
  selectedVehicleId?: string | null; // Véhicule du driver sélectionné
  selectedVehicle?: { // Informations du véhicule sélectionné
    id: string;
    brand: string;
    model: string;
    color: string;
    licensePlate: string;
    photoUrl?: string;
  } | null;
  selectedPricePerSeat?: number | null; // Prix accepté pour le driver sélectionné
  selectedAt?: string | null; // Date de sélection du driver
  tripId?: string | null; // ID du trip créé à partir de cette demande
  createdAt: string;
  updatedAt: string;
  offers?: DriverOffer[]; // Offres reçues des drivers
}

export type DriverOfferStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface DriverOffer {
  id: string;
  tripRequestId: string;
  driverId: string;
  driverName?: string;
  driverAvatar?: string;
  driverRating?: number;
  driverIsPremium?: boolean;
  driverPremiumBadge?: boolean;
  vehicleId?: string | null;
  vehicleType?: VehicleType;
  vehicleInfo?: string;
  proposedDepartureDate: string; // ISO string date - Date/heure de départ proposée par le driver
  pricePerSeat: number; // Prix proposé par place
  availableSeats: number; // Nombre de places disponibles
  message?: string | null; // Message optionnel du driver
  departureReference?: string | null;
  departureCoordinates?: [number, number] | null;
  arrivalReference?: string | null;
  arrivalCoordinates?: [number, number] | null;
  status: DriverOfferStatus;
  acceptedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriverOfferWithTripRequest extends DriverOffer {
  tripRequest: {
    id: string;
    departureLocation: string;
    departureReference?: string | null;
    arrivalLocation: string;
    arrivalReference?: string | null;
    departureDateMin: string; // ISO string date
    departureDateMax: string; // ISO string date
    numberOfSeats: number;
    maxPricePerSeat: number | null;
    status: TripRequestStatus;
    passenger: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      profilePicture: string | null;
    };
  };
}

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

export type FavoriteLocationType = 'home' | 'work' | 'other';

export interface FavoriteLocation {
  id: string;
  name: string;
  address: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  type: FavoriteLocationType;
  isDefault: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportFaqEntry {
  id: string;
  question: string;
  answer: string;
  category?: string | null;
  locale?: string | null;
  audience?: string | null;
  keywords?: string | null;
  isPublished?: boolean;
  order?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupportPaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface SupportFaqListResponse {
  data: SupportFaqEntry[];
  meta: SupportPaginationMeta;
}

export interface SupportConfigScheduleEntry {
  label: string;
  value: string;
}

export interface SupportConfig {
  locale: string;
  faq?: {
    locale?: string;
    audience?: string;
  };
  title: string;
  subtitle: string;
  contact: {
    phone?: string | null;
    whatsapp?: string | null;
    email?: string | null;
  };
  hours: SupportConfigScheduleEntry[];
  channels: {
    ticket: boolean;
    phone: boolean;
    whatsapp: boolean;
    email: boolean;
  };
}

export type SupportTicketStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_user'
  | 'resolved'
  | 'closed';

export type SupportTicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export type SupportTicketCategory =
  | 'general'
  | 'account'
  | 'payment'
  | 'booking'
  | 'safety'
  | 'technical'
  | 'other';

export interface SupportActorSummary {
  id: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
  sender: SupportActorSummary | null;
}

export interface SupportTicketSummary {
  id: string;
  userId: string;
  assignedAdminId: string | null;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionSummary: string | null;
  user: SupportActorSummary | null;
  assignedAdmin: SupportActorSummary | null;
}

export interface SupportTicketDetails extends SupportTicketSummary {
  messages: SupportTicketMessage[];
}

export interface SupportTicketListResponse {
  data: SupportTicketSummary[];
  meta: SupportPaginationMeta;
}

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


