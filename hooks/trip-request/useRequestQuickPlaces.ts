import { type AddressInputMode } from '@/components/AddressEntryModeSelector';
import { type AddressSectionStep } from '@/components/AddressSectionSlider';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import { PickerTarget } from '@/features/trip-request/requestFormModel';
import { useGeocodeMutation } from '@/store/api/googleMapsApi';
import { buildManualGeocodeQuery, mapGeocodeResponseToSelection } from '@/utils/manualAddressGeocode';

interface Params {
  addressSectionStep: AddressSectionStep;
  hasDepartureAddress: boolean;
  setAddressInputMode: React.Dispatch<React.SetStateAction<AddressInputMode>>;
  departureTouchedRef: React.RefObject<boolean>;
  setDepartureLocation: (next: React.SetStateAction<MapLocationSelection | null>) => void;
  setDepartureManualAddress: (next: React.SetStateAction<string>) => void;
  setAddressSectionStep: React.Dispatch<React.SetStateAction<AddressSectionStep>>;
  setArrivalLocation: (next: React.SetStateAction<MapLocationSelection | null>) => void;
  setArrivalManualAddress: (next: React.SetStateAction<string>) => void;
  quickPlaceRequestSeqRef: React.RefObject<Record<PickerTarget, number>>;
  setQuickPlaceResolvingKey: React.Dispatch<React.SetStateAction<string | null>>;
  setDepartureManualGeocodeStatus: React.Dispatch<React.SetStateAction<ManualGeocodeStatus>>;
  setArrivalManualGeocodeStatus: React.Dispatch<React.SetStateAction<ManualGeocodeStatus>>;
  geocodeManualAddress: ReturnType<typeof useGeocodeMutation>[0];
  screenMountedRef: React.RefObject<boolean>;
}

export function useRequestQuickPlaces({
  addressSectionStep,
  hasDepartureAddress,
  setAddressInputMode,
  departureTouchedRef,
  setDepartureLocation,
  setDepartureManualAddress,
  setAddressSectionStep,
  setArrivalLocation,
  setArrivalManualAddress,
  quickPlaceRequestSeqRef,
  setQuickPlaceResolvingKey,
  setDepartureManualGeocodeStatus,
  setArrivalManualGeocodeStatus,
  geocodeManualAddress,
  screenMountedRef,
}: Params) {
  const getQuickSelectionTarget = (): PickerTarget => {
    if (addressSectionStep === 'departure' || addressSectionStep === 'arrival') {
      return addressSectionStep;
    }

    return !hasDepartureAddress ? 'departure' : 'arrival';
  };

  const applySelectionToSlot = (target: PickerTarget, selection: MapLocationSelection) => {
    setAddressInputMode('map');
    if (target === 'departure') {
      departureTouchedRef.current = true;
      setDepartureLocation(selection);
      setDepartureManualAddress(selection.title || selection.address);
      setAddressSectionStep('arrival');
      return;
    }

    setArrivalLocation(selection);
    setArrivalManualAddress(selection.title || selection.address);
    setAddressSectionStep('arrival');
  };

  const applySelectionToNextSlot = (selection: MapLocationSelection) => {
    applySelectionToSlot(getQuickSelectionTarget(), selection);
  };

  const applyQuickPlaceToNextSlot = async (place: string) => {
    const target = getQuickSelectionTarget();
    const requestSeq = quickPlaceRequestSeqRef.current[target] + 1;
    quickPlaceRequestSeqRef.current[target] = requestSeq;
    setQuickPlaceResolvingKey(place);
    setAddressInputMode('map');

    if (target === 'departure') {
      departureTouchedRef.current = true;
      setDepartureLocation(null);
      setDepartureManualAddress(place);
      setDepartureManualGeocodeStatus('searching');
      setAddressSectionStep('arrival');
    } else {
      setArrivalLocation(null);
      setArrivalManualAddress(place);
      setArrivalManualGeocodeStatus('searching');
      setAddressSectionStep('arrival');
    }

    try {
      const response = await geocodeManualAddress({
        address: buildManualGeocodeQuery(place),
        region: 'cd',
      }).unwrap();
      if (!screenMountedRef.current || quickPlaceRequestSeqRef.current[target] !== requestSeq) {
        return;
      }

      const selection = mapGeocodeResponseToSelection(place, response);
      if (!selection) {
        throw new Error('Lieu rapide introuvable');
      }

      setAddressInputMode('map');
      if (target === 'departure') {
        setDepartureLocation(selection);
        setDepartureManualAddress(selection.title || selection.address);
        setDepartureManualGeocodeStatus('found');
        setAddressSectionStep('arrival');
        return;
      }

      setArrivalLocation(selection);
      setArrivalManualAddress(selection.title || selection.address);
      setArrivalManualGeocodeStatus('found');
      setAddressSectionStep('arrival');
    } catch (error) {
      if (!screenMountedRef.current || quickPlaceRequestSeqRef.current[target] !== requestSeq) {
        return;
      }

      console.warn('Quick place geocode failed', error);
      setAddressInputMode('manual');
      if (target === 'departure') {
        setDepartureManualGeocodeStatus('missing');
      } else {
        setArrivalManualGeocodeStatus('missing');
      }
    } finally {
      if (screenMountedRef.current && quickPlaceRequestSeqRef.current[target] === requestSeq) {
        setQuickPlaceResolvingKey(null);
      }
    }
  };

  return {
    applyQuickPlaceToNextSlot,
    applySelectionToNextSlot,
  };
}
import type { ManualGeocodeStatus } from '@/utils/manualAddressGeocode';
