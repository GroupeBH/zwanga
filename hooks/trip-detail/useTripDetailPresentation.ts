import { getRegisteredVehicleTypeLabel } from '@/constants/vehicleTypes';
import { formatDateTime } from '@/utils/dateHelpers';
import { type RouteInfo } from '@/utils/routeApi';
import { Ionicons } from '@expo/vector-icons';
import type { Trip } from '@/types';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useRouteLocationLabels } from '@/hooks/useRouteLocationLabels';

interface Params {
  trip: Trip | undefined;
  calculatedArrivalTime: Date | null;
  availableSeats: number;
  routeInfo: RouteInfo | null;
  insets: EdgeInsets;
}

export function useTripDetailPresentation({
  trip,
  calculatedArrivalTime,
  availableSeats,
  routeInfo,
  insets,
}: Params) {
  const routeLabels = useRouteLocationLabels(trip);
  const tripDepartureName = routeLabels.departure.title;
  const tripArrivalName = routeLabels.arrival.title;
  const tripDepartureTimeLabel = trip?.departureTime ? formatDateTime(trip.departureTime) : '--:--';
  const tripArrivalTimeLabel = calculatedArrivalTime
    ? formatDateTime(calculatedArrivalTime.toISOString())
    : trip?.arrivalTime
      ? formatDateTime(trip.arrivalTime)
      : '--:--';
  const tripPriceLabel = trip?.price === 0 ? 'Gratuit' : `${trip?.price ?? 0} FC`;
  const tripSeatsLabel =
    availableSeats <= 0 ? 'Complet' : `${availableSeats} place${availableSeats > 1 ? 's' : ''}`;
  const tripRouteDistanceLabel = routeInfo?.distance
    ? `${Math.max(routeInfo.distance / 1000, 0.1).toFixed(1)} km`
    : 'Trajet';
  const tripVehicleTypeLabel = trip?.vehicle
    ? getRegisteredVehicleTypeLabel(trip.vehicle.type)
    : trip?.vehicleType === 'moto'
      ? 'Moto'
      : trip?.vehicleType === 'tricycle'
        ? 'Tricycle'
        : 'Voiture';
  const tripVehicleLabel = trip?.vehicle
    ? `${trip.vehicle.brand} ${trip.vehicle.model}`.trim() || tripVehicleTypeLabel
    : tripVehicleTypeLabel;
  const tripVehicleMetaLabel = trip?.vehicle
    ? [trip.vehicle.color, trip.vehicle.licensePlate].filter(Boolean).join(' • ')
    : trip?.vehicleInfo && trip.vehicleInfo !== 'Informations véhicule fournies par le conducteur'
      ? trip.vehicleInfo
      : 'Véhicule confirmé après réservation';
  const tripVehicleIconName: keyof typeof Ionicons.glyphMap =
    trip?.vehicle?.type === 'motorcycle_2_wheels' || trip?.vehicleType === 'moto'
      ? 'bicycle'
      : trip?.vehicle?.type === 'motorcycle_3_wheels' || trip?.vehicleType === 'tricycle'
        ? 'car-sport'
        : 'car';
  const tripVehicleSeatLabel = trip
    ? `${trip.totalSeats} place${trip.totalSeats > 1 ? 's' : ''} au total`
    : null;
  const tripVehicleLicensePlate = trip?.vehicle?.licensePlate?.trim() || null;
  const tripVehicleStatusLabel = trip?.vehicle
    ? trip.vehicle.isActive === false
      ? 'Indisponible'
      : 'Actif'
    : null;
  const tripVehicleDetailRows: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value?: string | null;
  }[] = [
    { icon: 'business-outline', label: 'Marque', value: trip?.vehicle?.brand },
    { icon: 'car-outline', label: 'Modèle', value: trip?.vehicle?.model },
    { icon: 'color-palette-outline', label: 'Couleur', value: trip?.vehicle?.color },
    { icon: 'people-outline', label: 'Places', value: tripVehicleSeatLabel },
    {
      icon: 'information-circle-outline',
      label: 'Information',
      value: !trip?.vehicle && trip?.vehicleInfo ? trip.vehicleInfo : null,
    },
  ];
  const visibleTripVehicleDetailRows = tripVehicleDetailRows.filter(
    (row): row is { icon: keyof typeof Ionicons.glyphMap; label: string; value: string } =>
      Boolean(row.value),
  );
  const headerFloatingOffset = Math.max(insets.top, 12) + 10;

  return {
    routeLabels,
    headerFloatingOffset,
    tripDepartureTimeLabel,
    tripDepartureName,
    tripArrivalName,
    tripPriceLabel,
    tripArrivalTimeLabel,
    tripSeatsLabel,
    tripRouteDistanceLabel,
    tripVehicleIconName,
    tripVehicleLabel,
    tripVehicleMetaLabel,
    tripVehicleTypeLabel,
    tripVehicleStatusLabel,
    tripVehicleLicensePlate,
    visibleTripVehicleDetailRows,
  };
}
