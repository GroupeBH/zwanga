export type UserRole = 'driver' | 'passenger' | 'both';

export type UserGender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

export type VehicleType = 'car' | 'moto' | 'tricycle';

export type TripRequestVehicleType =
  | 'car'
  | 'motorcycle_2_wheels'
  | 'motorcycle_3_wheels';

export type TripStatus = 'upcoming' | 'ongoing' | 'completed' | 'cancelled';

export type RecurringTripStatus = 'active' | 'paused';

export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'no_show'
  | 'boarding_uncertain'
  | 'completed'
  | 'expired';

export type TripInterruptionReason =
  | 'emergency'
  | 'health'
  | 'safety'
  | 'route_issue'
  | 'personal'
  | 'other';

export type TripInterruptionStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'completed';

export type TripInterruptionRequesterRole = 'driver' | 'passenger';

export type TripInterruptionConfirmationStatus = 'pending' | 'confirmed' | 'rejected';

export type PaymentMethod = 'orange_money' | 'm_pesa' | 'airtel_money' | 'cash';

export type SubscriptionPaymentMethod = 'mobile_money' | 'card';

export type TripPaymentMode = 'electronic' | 'cash' | 'points';

export type SubscriptionPaymentStatus =
  | 'pending'
  | 'initiated'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type TripPaymentStatus =
  | 'not_required'
  | 'pending'
  | 'initiated'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type SubscriptionPlan = 'pro' | 'monthly' | 'yearly';

export type SubscriptionStatus = 'pending' | 'active' | 'expired' | 'cancelled' | 'payment_failed';
