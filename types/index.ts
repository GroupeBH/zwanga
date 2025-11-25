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
  fromUserId: string;
  fromUserName: string;
  fromUserAvatar?: string;
  toUserId: string;
  rating: number;
  comment: string;
  tags: string[];
  tripId: string;
  createdAt: string; // ISO string date
}

