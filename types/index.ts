export type UserRole = 'driver' | 'passenger' | 'both';
export type VehicleType = 'car' | 'moto' | 'tricycle';
export type TripStatus = 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
export type PaymentMethod = 'orange_money' | 'm_pesa' | 'airtel_money' | 'cash';

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: UserRole;
  avatar?: string;
  rating: number;
  totalTrips: number;
  verified: boolean;
  identityVerified: boolean; // Vérification d'identité (carte + visage)
  vehicle?: Vehicle;
  createdAt: string; // ISO string date
}

export interface Vehicle {
  type: VehicleType;
  brand: string;
  model: string;
  year: string;
  color: string;
  plateNumber: string;
  seats: number;
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
}

export interface Passenger {
  id: string;
  name: string;
  avatar?: string;
  rating: number;
  phone: string;
}

export interface Message {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  text: string;
  timestamp: string; // ISO string date
  read: boolean;
}

export interface Conversation {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  lastMessage: string;
  timestamp: string; // ISO string date
  unreadCount: number;
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

