import type { Trip, TripRequest } from '@/types';
import type { ImageRequireSource } from 'react-native';

export const androidTripMarkerImages: Record<Trip['vehicleType'], ImageRequireSource> = {
  car: require('@/assets/images/map-markers/trip-marker-car.png'),
  moto: require('@/assets/images/map-markers/trip-marker-moto-v2.png'),
  tricycle: require('@/assets/images/map-markers/trip-marker-tricycle-v2.png'),
};

export const tripRequestMarkerImages = {
  male: require('@/assets/images/map-markers/trip-request-marker-male.png'),
  female: require('@/assets/images/map-markers/trip-request-marker-female.png'),
  neutral: require('@/assets/images/map-markers/trip-request-marker-neutral.png'),
} satisfies Record<'male' | 'female' | 'neutral', ImageRequireSource>;

export const selectedTripMarkerImages: Record<Trip['vehicleType'], ImageRequireSource> = {
  car: require('@/assets/images/map-markers/trip-marker-car-selected.png'),
  moto: require('@/assets/images/map-markers/trip-marker-moto-v2-selected.png'),
  tricycle: require('@/assets/images/map-markers/trip-marker-tricycle-v2-selected.png'),
};

export const userLocationMarkerImage: ImageRequireSource = require('@/assets/images/map-markers/user-location-marker.png');

export function getTripMarkerImage(trip: Trip, isSelected: boolean) {
  const tripVehicleType = trip.vehicleType || 'car';

  if (isSelected) {
    return selectedTripMarkerImages[tripVehicleType];
  }

  return androidTripMarkerImages[tripVehicleType];
}

export function getTripRequestMarkerImage(gender?: TripRequest['passengerGender']): ImageRequireSource {
  if (gender === 'male' || gender === 'female') {
    return tripRequestMarkerImages[gender];
  }

  return tripRequestMarkerImages.neutral;
}
