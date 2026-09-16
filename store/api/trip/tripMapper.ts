import {
  mapServerVehicleTypeToClient,
  ServerRecurringTripTemplate,
  fallbackCoordinate,
  formatFullName,
  resolveUserAverageRating,
  mapTripStatus,
  mapRecurringTripStatus,
  mapBookingStatus,
  mapDriverInterruptionRequest,
} from './mappingHelpers';
import { ServerUser, ServerBooking, ServerVehicle, ServerTrip } from './serverTypes';
import type { RecurringTripTemplate, Trip, Vehicle } from '../../../types';

export const mapPassengers = (bookings?: ServerBooking[]): Trip['passengers'] => {
  if (!bookings?.length) {
    return [];
  }

  return bookings
    .filter((booking): booking is ServerBooking & { passenger: ServerUser } => Boolean(booking.passenger))
    .map((booking) => ({
      bookingId: booking.id,
      bookingStatus: mapBookingStatus(booking.status),
      id: booking.passenger.id,
      name: formatFullName(booking.passenger),
      avatar: booking.passenger?.profilePicture ?? undefined,
      rating: resolveUserAverageRating(booking.passenger),
      phone: booking.passenger?.phone ?? '',
      seats: booking.seats ?? 1,
    }));
};

export const mapServerVehicleToClient = (vehicle: ServerVehicle | null | undefined): Vehicle | undefined => {
  if (!vehicle) {
    return undefined;
  }
  return {
    id: vehicle.id,
    ownerId: vehicle.ownerId,
    type: vehicle.type ?? 'car',
    brand: vehicle.brand ?? '',
    model: vehicle.model ?? '',
    color: vehicle.color ?? '',
    licensePlate: vehicle.licensePlate ?? '',
    photoUrl: vehicle.photoUrl ?? null,
    isActive: vehicle.isActive ?? true,
    createdAt: vehicle.createdAt ?? new Date().toISOString(),
    updatedAt: vehicle.updatedAt ?? new Date().toISOString(),
  };
};

export const mapServerTripToClient = (trip: ServerTrip): Trip => {
  const departureCoords = fallbackCoordinate(trip.departureCoordinates);
  const arrivalCoords = fallbackCoordinate(trip.arrivalCoordinates);
  const parsedDriverRating = resolveUserAverageRating(trip.driver);
  
  // Compter uniquement les réservations acceptées pour calculer le nombre initial de places
  const acceptedBookedSeats =
    trip.bookings
      ?.filter((booking) => {
        const status = (booking.status ?? '').toLowerCase();
        return status === 'accepted' || status === 'completed';
      })
      .reduce((total, booking) => total + (booking.seats ?? 0), 0) ?? 0;

  // Le nombre initial de places disponibles lors de la publication
  // Si totalSeats est fourni par le backend, l'utiliser, sinon calculer
  const totalSeats = trip.totalSeats ?? (trip.availableSeats + acceptedBookedSeats);

  return {
    id: trip.id,
    driverId: trip.driverId,
    driverName: formatFullName(trip.driver),
    driverAvatar: trip.driver?.profilePicture ?? undefined,
    driverRating: Number.isFinite(parsedDriverRating) && parsedDriverRating > 0 ? parsedDriverRating : 0,
    driver: trip.driver
      ? {
          id: trip.driver.id,
          firstName: trip.driver.firstName,
          lastName: trip.driver.lastName,
          phone: trip.driver.phone,
          profilePicture: trip.driver.profilePicture ?? null,
          role: trip.driver.role as any,
          status: trip.driver.status,
          isDriver: trip.driver.isDriver ?? false,
          isPremium: Boolean(trip.driver.isPremium),
          premiumBadge: Boolean(trip.driver.premiumBadge),
          premiumBadgeEnabled: Boolean(trip.driver.premiumBadge),
          averageRating:
            Number.isFinite(Number(trip.driver.averageRating))
              ? Number(trip.driver.averageRating)
              : undefined,
          totalRatings:
            Number.isFinite(Number(trip.driver.totalRatings))
              ? Number(trip.driver.totalRatings)
              : undefined,
        }
      : null,
    vehicleType: mapServerVehicleTypeToClient(
      trip.vehicle?.type ?? trip.vehicleType,
    ),
    vehicleInfo: trip.description?.trim() || 'Informations véhicule fournies par le conducteur',
    departure: {
      name: trip.departureLocation,
      address: trip.departureLocation,
      lat: departureCoords?.lat ?? 0,
      lng: departureCoords?.lng ?? 0,
      reference: trip.departureReference ?? null,
      hasCoordinates: Boolean(departureCoords),
    },
    arrival: {
      name: trip.arrivalLocation,
      address: trip.arrivalLocation,
      lat: arrivalCoords?.lat ?? 0,
      lng: arrivalCoords?.lng ?? 0,
      reference: trip.arrivalReference ?? null,
      hasCoordinates: Boolean(arrivalCoords),
    },
    departureTime: trip.departureDate,
    arrivalTime: trip.departureDate,
    price: Number(trip.pricePerSeat),
    isFree: trip.isFree ?? Number(trip.pricePerSeat) === 0,
    availableSeats: trip.availableSeats,
    // totalSeats représente le nombre initial de places disponibles lors de la publication
    totalSeats: Math.max(totalSeats, trip.availableSeats),
    status: mapTripStatus(trip.status),
    passengers: mapPassengers(trip.bookings),
    currentLocation: trip.currentLocation ?? null,
    lastLocationUpdateAt: trip.lastLocationUpdateAt ?? null,
    startedAt: trip.startedAt ?? null,
    completedAt: trip.completedAt ?? null,
    vehicleId: trip.vehicleId ?? null,
    description: trip.description ?? null,
    vehicle: mapServerVehicleToClient(trip.vehicle),
    driverSafetyEmergencyContactIds: Array.isArray(trip.driverSafetyEmergencyContactIds)
      ? trip.driverSafetyEmergencyContactIds
      : [],
    tripRequestId: trip.tripRequestId ?? null,
    recurringTemplateId: trip.recurringTemplateId ?? null,
    recurringOccurrenceDate: trip.recurringOccurrenceDate ?? null,
    isFeatured: Boolean(trip.isFeatured),
    requiresPassengerKyc: Boolean(trip.requiresPassengerKyc),
    interruptionRequest: mapDriverInterruptionRequest(
      trip.interruptionRequest ??
        trip.activeInterruptionRequest ??
        trip.currentInterruptionRequest,
    ),
  };
};

export const mapServerRecurringTripToClient = (
  template: ServerRecurringTripTemplate,
): RecurringTripTemplate => {
  const departureCoords = fallbackCoordinate(template.departureCoordinates);
  const arrivalCoords = fallbackCoordinate(template.arrivalCoordinates);

  return {
    id: template.id,
    driverId: template.driverId,
    departure: {
      name: template.departureLocation,
      address: template.departureLocation,
      lat: departureCoords?.lat ?? 0,
      lng: departureCoords?.lng ?? 0,
      reference: template.departureReference ?? null,
      hasCoordinates: Boolean(departureCoords),
    },
    arrival: {
      name: template.arrivalLocation,
      address: template.arrivalLocation,
      lat: arrivalCoords?.lat ?? 0,
      lng: arrivalCoords?.lng ?? 0,
      reference: template.arrivalReference ?? null,
      hasCoordinates: Boolean(arrivalCoords),
    },
    departureTime: template.departureTime,
    weekdays: Array.isArray(template.weekdays) ? template.weekdays : [],
    startDate: template.startDate,
    endDate: template.endDate ?? null,
    totalSeats: Number(template.totalSeats ?? 0),
    pricePerSeat: Number(template.pricePerSeat ?? 0),
    isFree: template.isFree ?? Number(template.pricePerSeat) === 0,
    description: template.description ?? null,
    status: mapRecurringTripStatus(template.status),
    vehicleId: template.vehicleId,
    vehicle: mapServerVehicleToClient(template.vehicle) ?? null,
    nextOccurrenceDate: template.nextOccurrenceDate ?? null,
    upcomingGeneratedTripsCount: Number(template.upcomingGeneratedTripsCount ?? 0),
    requiresPassengerKyc: Boolean(template.requiresPassengerKyc),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
};
