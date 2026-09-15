import { ServerTripRequest, ServerDriverOffer, ServerDriverOfferWithTripRequest } from './serverTypes';
import type {
  DriverOffer,
  DriverOfferStatus,
  DriverOfferWithTripRequest,
  TripRequest,
  TripRequestStatus,
} from '@/types';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';

export const mapServerCoordinateTupleToClient = (coordinates?: [number, number] | null) => {
  if (!coordinates || coordinates.length < 2) {
    return null;
  }

  const coordinate = normalizeTripMapCoordinate(coordinates[1], coordinates[0]);
  if (!coordinate) {
    return null;
  }

  return {
    lat: coordinate.latitude,
    lng: coordinate.longitude,
  };
};

export const normalizeServerCoordinateTuple = (
  coordinates?: [number, number] | null,
): [number, number] | undefined => {
  const coordinate = mapServerCoordinateTupleToClient(coordinates);
  return coordinate ? [coordinate.lng, coordinate.lat] : undefined;
};

export const mapServerTripRequestToClient = (request: ServerTripRequest): TripRequest => {
  const departureCoords = mapServerCoordinateTupleToClient(request.departureCoordinates);
  const arrivalCoords = mapServerCoordinateTupleToClient(request.arrivalCoordinates);

  const formatFullName = (user: { firstName: string; lastName: string }) => {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return fullName || 'Utilisateur';
  };

  const mapStatus = (status: string): TripRequestStatus => {
    switch ((status ?? '').toLowerCase()) {
      case 'pending':
        return 'pending';
      case 'offers_received':
        return 'offers_received';
      case 'driver_selected':
        return 'driver_selected';
      case 'cancelled':
      case 'canceled':
        return 'cancelled';
      case 'expired':
        return 'expired';
      default:
        return 'pending';
    }
  };

  return {
    id: request.id,
    passengerId: request.passenger.id,
    passengerName: formatFullName(request.passenger),
    passengerAvatar: request.passenger.profilePicture ?? undefined,
    passengerGender: request.passenger.gender ?? null,
    departure: {
      name: request.departureLocation,
      address: request.departureLocation,
      lat: departureCoords?.lat ?? 0,
      lng: departureCoords?.lng ?? 0,
      reference: request.departureReference ?? null,
      hasCoordinates: Boolean(departureCoords),
    },
    arrival: {
      name: request.arrivalLocation,
      address: request.arrivalLocation,
      lat: arrivalCoords?.lat ?? 0,
      lng: arrivalCoords?.lng ?? 0,
      reference: request.arrivalReference ?? null,
      hasCoordinates: Boolean(arrivalCoords),
    },
    departureDateMin: request.departureDateMin,
    departureDateMax: request.departureDateMax,
    numberOfSeats: request.numberOfSeats,
    vehicleType: request.vehicleType ?? 'car',
    maxPricePerSeat: request.maxPricePerSeat ?? undefined,
    paymentMode: request.paymentMode ?? undefined,
    description: request.description ?? undefined,
    status: mapStatus(request.status),
    selectedDriverId: request.selectedDriver?.id ?? undefined,
    selectedDriverName: request.selectedDriver ? formatFullName(request.selectedDriver) : undefined,
    selectedDriverAvatar: request.selectedDriver?.profilePicture ?? undefined,
    selectedVehicleId: request.selectedVehicle?.id ?? undefined,
    selectedVehicle: request.selectedVehicle ? {
      id: request.selectedVehicle.id,
      brand: request.selectedVehicle.brand,
      model: request.selectedVehicle.model,
      color: request.selectedVehicle.color,
      licensePlate: request.selectedVehicle.licensePlate,
      photoUrl: request.selectedVehicle.photoUrl ?? undefined,
    } : undefined,
    selectedPricePerSeat: request.selectedPricePerSeat ?? undefined,
    selectedDriverRequiresPassengerKyc: Boolean(request.selectedDriverRequiresPassengerKyc),
    selectedAt: request.selectedAt ?? undefined,
    tripId: request.tripId ?? undefined,
    driverPickupOverdueNotifiedAt:
      request.driverPickupOverdueNotifiedAt ?? undefined,
    offers: request.driverOffers?.map(mapServerDriverOfferToClient),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
};

export const mapServerDriverOfferToClient = (offer: ServerDriverOffer): DriverOffer => {
  const formatFullName = (user: { firstName: string; lastName: string }) => {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return fullName || 'Conducteur';
  };

  const mapStatus = (status: string): DriverOfferStatus => {
    switch ((status ?? '').toLowerCase()) {
      case 'pending':
        return 'pending';
      case 'accepted':
        return 'accepted';
      case 'rejected':
        return 'rejected';
      case 'cancelled':
      case 'canceled':
        return 'cancelled';
      default:
        return 'pending';
    }
  };

  const vehicleInfo = offer.vehicle
    ? `${offer.vehicle.brand} ${offer.vehicle.model} - ${offer.vehicle.color} (${offer.vehicle.licensePlate})`
    : undefined;

  return {
    id: offer.id,
    tripRequestId: offer.tripRequestId,
    driverId: offer.driver.id,
    driverName: formatFullName(offer.driver),
    driverAvatar: offer.driver.profilePicture ?? undefined,
    driverRating: 0, // Backend ne retourne pas le rating dans l'offre
    driverIsPremium: Boolean(offer.driver.isPremium),
    driverPremiumBadge: Boolean(offer.driver.premiumBadge),
    vehicleId: offer.vehicle?.id ?? undefined,
    vehicleInfo,
    proposedDepartureDate: offer.proposedDepartureDate,
    pricePerSeat: typeof offer.pricePerSeat === 'string' ? parseFloat(offer.pricePerSeat) : offer.pricePerSeat,
    availableSeats: offer.availableSeats,
    message: offer.message ?? undefined,
    departureReference: offer.departureReference ?? undefined,
    departureCoordinates: normalizeServerCoordinateTuple(offer.departureCoordinates),
    arrivalReference: offer.arrivalReference ?? undefined,
    arrivalCoordinates: normalizeServerCoordinateTuple(offer.arrivalCoordinates),
    requiresPassengerKyc: Boolean(offer.requiresPassengerKyc),
    status: mapStatus(offer.status),
    acceptedAt: offer.acceptedAt ?? undefined,
    rejectedAt: offer.rejectedAt ?? undefined,
    rejectionReason: offer.rejectionReason ?? undefined,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };
};

export const mapServerDriverOfferWithTripRequestToClient = (offer: ServerDriverOfferWithTripRequest): DriverOfferWithTripRequest => {
  const baseOffer = mapServerDriverOfferToClient({
    id: offer.id,
    tripRequestId: offer.tripRequestId,
    driver: offer.driver,
    vehicle: offer.vehicle,
    proposedDepartureDate: offer.proposedDepartureDate,
    pricePerSeat: offer.pricePerSeat,
    availableSeats: offer.availableSeats,
    message: offer.message,
    departureReference: offer.departureReference,
    departureCoordinates: offer.departureCoordinates,
    arrivalReference: offer.arrivalReference,
    arrivalCoordinates: offer.arrivalCoordinates,
    requiresPassengerKyc: offer.requiresPassengerKyc,
    status: offer.status,
    acceptedAt: offer.acceptedAt,
    rejectedAt: offer.rejectedAt,
    rejectionReason: offer.rejectionReason,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  });

  const mapTripRequestStatus = (status: string): TripRequestStatus => {
    switch ((status ?? '').toLowerCase()) {
      case 'pending':
        return 'pending';
      case 'offers_received':
        return 'offers_received';
      case 'driver_selected':
        return 'driver_selected';
      case 'cancelled':
      case 'canceled':
        return 'cancelled';
      case 'expired':
        return 'expired';
      default:
        return 'pending';
    }
  };

  return {
    ...baseOffer,
    tripRequest: {
      id: offer.tripRequest.id,
      departureLocation: offer.tripRequest.departureLocation,
      departureReference: offer.tripRequest.departureReference ?? undefined,
      arrivalLocation: offer.tripRequest.arrivalLocation,
      arrivalReference: offer.tripRequest.arrivalReference ?? undefined,
      departureDateMin: offer.tripRequest.departureDateMin,
      departureDateMax: offer.tripRequest.departureDateMax,
      numberOfSeats: offer.tripRequest.numberOfSeats,
      maxPricePerSeat: typeof offer.tripRequest.maxPricePerSeat === 'string' 
        ? parseFloat(offer.tripRequest.maxPricePerSeat) 
        : offer.tripRequest.maxPricePerSeat,
      paymentMode: offer.tripRequest.paymentMode ?? undefined,
      status: mapTripRequestStatus(offer.tripRequest.status),
      passenger: {
        id: offer.tripRequest.passenger.id,
        firstName: offer.tripRequest.passenger.firstName,
        lastName: offer.tripRequest.passenger.lastName,
        phone: offer.tripRequest.passenger.phone,
        profilePicture: offer.tripRequest.passenger.profilePicture,
      },
    },
  };
};
