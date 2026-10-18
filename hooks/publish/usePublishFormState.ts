import { LatLng, RoutePointStatus } from '../../features/publish/publishModel';
import { type AddressSectionStep } from '@/components/AddressSectionSlider';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import { getDefaultPublishSeats, getPublishSeats } from '@/features/publish/publishSeatPolicy';
import type { TripRequestVehicleType, TripPaymentMode } from '@/types';
import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';



export function usePublishFormState(selectedVehicleType: TripRequestVehicleType | null | undefined) {
  const [departureLocation, setDepartureLocation] = useState<MapLocationSelection | null>(null);
  const [arrivalLocation, setArrivalLocation] = useState<MapLocationSelection | null>(null);
  const [departurePointStatus, setDeparturePointStatus] = useState<RoutePointStatus>(null);
  const [arrivalPointStatus, setArrivalPointStatus] = useState<RoutePointStatus>(null);
  const [departureManualAddress, setDepartureManualAddress] = useState('');
  const [departureReference, setDepartureReference] = useState('');
  const [arrivalManualAddress, setArrivalManualAddress] = useState('');
  const [arrivalReference, setArrivalReference] = useState('');
  const [showDepartureReference, setShowDepartureReference] = useState(false);
  const [showArrivalReference, setShowArrivalReference] = useState(false);
  const [showQuickLandmarks, setShowQuickLandmarks] = useState(false);
  const [manualAddressTarget, setManualAddressTarget] = useState<'departure' | 'arrival' | null>(null);
  const [, setAddressSectionStep] = useState<AddressSectionStep>('method');
  const [activeLocationType, setActiveLocationType] = useState<'departure' | 'arrival' | null>(null);
  const [locationPickerInitialQuery, setLocationPickerInitialQuery] = useState('');
  const [departureDateTime, setDepartureDateTime] = useState<Date | null>(null);
  const [iosPickerMode, setIosPickerMode] = useState<'date' | 'time' | null>(null);
  const [iosPickerTarget, setIosPickerTarget] = useState<'departure' | 'recurringEndDate'>('departure');
  const [iosPickerValue, setIosPickerValue] = useState<Date>(new Date());
  const [seatsByType, setSeatsByType] = useState<Partial<Record<TripRequestVehicleType, string>>>({});
  const seatType = selectedVehicleType ?? 'car';
  const resetSeats = useCallback(() => setSeatsByType({}), []);
  const seats = getPublishSeats(seatsByType[seatType] ?? getDefaultPublishSeats(seatType), seatType);
  // Remember an explicit adjustment per vehicle type, without leaking a car count into a motorcycle.
  const setSeats: Dispatch<SetStateAction<string>> = useCallback((update) => {
    setSeatsByType((previous) => {
      const current = getPublishSeats(previous[seatType] ?? getDefaultPublishSeats(seatType), seatType);
      const requested = typeof update === 'function' ? update(current) : update;
      return { ...previous, [seatType]: getPublishSeats(requested, seatType) };
    });
  }, [seatType]);
  const [isFreeTrip, setIsFreeTrip] = useState(false);
  const [acceptedPaymentModes, setAcceptedPaymentModes] = useState<TripPaymentMode[]>(['electronic', 'points']);
  const [requiresPassengerKyc, setRequiresPassengerKyc] = useState(false);
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [isRecurringTrip, setIsRecurringTrip] = useState(false);
  const [recurringWeekdays, setRecurringWeekdays] = useState<number[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState<Date | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);
  const [isRouteLoading, setIsRouteLoading] = useState(false);

  return {
    acceptedPaymentModes, setAcceptedPaymentModes,
    setDepartureLocation,
    setArrivalLocation,
    setDeparturePointStatus,
    setArrivalPointStatus,
    setActiveLocationType,
    setDepartureDateTime,
    setIosPickerMode,
    setIosPickerTarget,
    setSeats,
    resetSeats,
    setIsFreeTrip,
    setPrice,
    setDescription,
    setIsRecurringTrip,
    setRecurringWeekdays,
    setRecurringEndDate,
    setDepartureManualAddress,
    setDepartureReference,
    setArrivalManualAddress,
    setArrivalReference,
    setShowDepartureReference,
    setShowArrivalReference,
    setManualAddressTarget,
    setAddressSectionStep,
    setLocationPickerInitialQuery,
    setShowQuickLandmarks,
    manualAddressTarget,
    departureManualAddress,
    departureLocation,
    arrivalManualAddress,
    arrivalLocation,
    departurePointStatus,
    arrivalPointStatus,
    showDepartureReference,
    departureReference,
    showArrivalReference,
    arrivalReference,
    routeCoordinates,
    activeLocationType,
    departureDateTime,
    recurringEndDate,
    setIosPickerValue,
    iosPickerMode,
    iosPickerTarget,
    iosPickerValue,
    recurringWeekdays,
    setRouteCoordinates,
    setIsRouteLoading,
    isRecurringTrip,
    isFreeTrip,
    price,
    seats,
    description,
    requiresPassengerKyc,
    showQuickLandmarks,
    setRequiresPassengerKyc,
    isRouteLoading,
    locationPickerInitialQuery,
  };
}
