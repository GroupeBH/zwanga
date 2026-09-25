import type { UserGender, UserRole } from './common';
import type { Vehicle } from './trips';

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  gender?: UserGender | null;
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
  driverOnboardingRequestedAt?: string | null;
  driverActivatedAt?: string | null;
  isPremium?: boolean;
  premiumBadge?: boolean;
  premiumBadgeEnabled?: boolean;
  createdAt: string; // ISO string date
  updatedAt?: string;
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
