import type { MapLocationSelection } from '@/components/LocationPickerModal';
import { getPickerCoordinate } from '@/features/location-picker/locationPickerModel';
import type { PickerTarget } from '@/features/trip-request/requestFormModel';
import type { RequestTripController } from './useRequestTripController';
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useHomeRequestPickup } from './useHomeRequestPickup';

/** Home has only an inline location workspace and a quote, never a route-only intermediary. */
export function useHomeRequestFlow(form: RequestTripController) {
  const pickup = useHomeRequestPickup(form);
  const { status: pickupStatus, chooseManually } = pickup;
  const locked = Boolean(form.isCreating || form.createdRequestId || form.isRequestSuccessVisible || form.submissionRecoveryMessage);
  const pickerTarget: PickerTarget | null = locked ? null : form.activePicker ??
    (!form.arrivalLocation ? 'arrival' : !form.departureLocation && pickupStatus === 'unavailable' ? 'departure' : null);
  const latest = useRef({ form, pickerTarget }); latest.current = { form, pickerTarget };
  const entered = useRef(false), mounted = useRef(false);
  const selection = useRef({ target: pickerTarget, committed: false });
  if (selection.current.target !== pickerTarget) selection.current = { target: pickerTarget, committed: false };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (entered.current || !form.isScreenActive || !form.hasAppliedRoutePrefill || locked) return;
    entered.current = true;
    if (!latest.current.form.hasChosenDepartureTime) latest.current.form.applyPreset('now');
  }, [form.isScreenActive, form.hasAppliedRoutePrefill, locked]);
  useEffect(() => {
    if (!form.isScreenActive || pickerTarget !== 'departure') return;
    chooseManually();
    latest.current.form.departureTouchedRef.current = true;
  }, [form.isScreenActive, pickerTarget, chooseManually]);
  useEffect(() => {
    if (!form.isScreenActive || pickerTarget || locked || !form.arrivalLocation || !form.departureLocation) return;
    const current = latest.current.form;
    current.departureTouchedRef.current = true;
    if (current.requestFormStep !== 'details') current.setRequestFormStep('details');
  }, [form.isScreenActive, form.arrivalLocation, form.departureLocation, form.requestFormStep, pickerTarget, locked]);

  const openPicker = (target: PickerTarget) => {
    if (!mounted.current || !form.isScreenActive || locked || pickerTarget) return;
    if (target === 'departure') chooseManually();
    form.openPickerFor(target);
  };
  const onSelect = (location: MapLocationSelection) => {
    if (!mounted.current || !latest.current.form.isScreenActive || locked || !pickerTarget ||
        latest.current.pickerTarget !== pickerTarget || selection.current.committed) return;
    if (!getPickerCoordinate(location.latitude, location.longitude)) return;
    selection.current.committed = true;
    form.setAddressInputMode('map');
    if (pickerTarget === 'departure') {
      form.departureTouchedRef.current = true;
      form.setDepartureLocation(location);
      form.setDepartureManualAddress(location.title || location.address);
      pickup.confirmManual();
    } else {
      form.setArrivalLocation(location);
      form.setArrivalManualAddress(location.title || location.address);
    }
    form.setActivePicker(null);
    if ((pickerTarget === 'departure' && form.arrivalLocation) || (pickerTarget === 'arrival' && form.departureLocation)) {
      form.departureTouchedRef.current = true;
      form.setRequestFormStep('details');
    }
  };
  const handleBack = () => {
    if (!mounted.current || locked) return;
    if (pickerTarget && form.arrivalLocation && form.departureLocation) form.setActivePicker(null);
    else form.router.back(); // An incomplete order returns Home, not an empty route screen.
  };
  const closePicker = () => {
    // The shared picker calls onClose after onSelect. A successful selection is
    // not a cancellation, including before React has rendered the new draft.
    if (selection.current.target !== pickerTarget || selection.current.committed) return;
    handleBack();
  };
  const submit = async () => {
    if (!mounted.current || !form.isScreenActive || locked || pickerTarget || !form.departureLocation || !form.arrivalLocation) return;
    if (!form.hasChosenDepartureTime) { form.openCustomPicker('time'); return; }
    await form.handleCreateRequest(); // Same validation/idempotency as the legacy form, without a hidden route step.
  };
  const back = useRef(handleBack); back.current = handleBack;
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!latest.current.form.isScreenActive) return false;
      back.current(); return true;
    });
    return () => subscription.remove();
  }, []));
  return { locked, pickerTarget, openPicker, onSelect, closePicker, handleBack, submit, pickup };
}
