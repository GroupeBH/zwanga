import { LatLng, RoutePointStatus } from '../../features/publish/publishModel';
import { type AddressSectionStep } from '@/components/AddressSectionSlider';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import { useState } from 'react';



export function usePublishFormState() {
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
  const [seats, setSeats] = useState('4');
  const [isFreeTrip, setIsFreeTrip] = useState(false);
  const [requiresPassengerKyc, setRequiresPassengerKyc] = useState(false);
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [isRecurringTrip, setIsRecurringTrip] = useState(false);
  const [recurringWeekdays, setRecurringWeekdays] = useState<number[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState<Date | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);
  const [isRouteLoading, setIsRouteLoading] = useState(false);

  return {
    setDepartureLocation,
    setArrivalLocation,
    setDeparturePointStatus,
    setArrivalPointStatus,
    setActiveLocationType,
    setDepartureDateTime,
    setIosPickerMode,
    setIosPickerTarget,
    setSeats,
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
