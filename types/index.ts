export type UserRole = 'driver' | 'passenger' | 'both';
export type VehicleType = 'car' | 'moto' | 'tricycle';
export type TripStatus = 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
export type BookingStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed';
export type PaymentMethod = 'orange_money' | 'm_pesa' | 'airtel_money' | 'cash';

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
  selectedVehicleId?: string | null; // Véhicule du driver sélectionné
  selectedPricePerSeat?: number | null; // Prix accepté pour le driver sélectionné
  selectedAt?: string | null; // Date de sélection du driver
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
  vehicleId?: string | null;
  vehicleType?: VehicleType;
  vehicleInfo?: string;
  proposedDepartureDate: string; // ISO string date - Date/heure de départ proposée par le driver
  pricePerSeat: number; // Prix proposé par place
  availableSeats: number; // Nombre de places disponibles
  message?: string | null; // Message optionnel du driver
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
    arrivalLocation: string;
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
  contacts: Array<{ id: string; name: string; phone: string }>;
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

