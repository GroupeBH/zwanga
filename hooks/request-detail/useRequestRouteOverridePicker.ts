import { useEffect, useRef } from 'react';
import { Keyboard, Platform } from 'react-native';
import type { MapLocationSelection } from '@/components/LocationPickerModal';
import type { RouteOverridePickerTarget } from '@/features/request-detail/requestDetailModel';
import type { useRequestDetailFormState } from './useRequestDetailFormState';

type Form = ReturnType<typeof useRequestDetailFormState>;
type PickerSession = { target: RouteOverridePickerTarget; restoreModal: boolean; closing: boolean };

export function useRequestRouteOverridePicker(form: Form, scopeKey: string, enabled: boolean) {
  const sessionRef = useRef<PickerSession | null>(null);
  const { directPickerTransitionTimerRef: timer, directPickerRestorePendingRef: restoring,
    setRouteOverridePickerTarget } = form;

  useEffect(() => {
    setRouteOverridePickerTarget(null);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      restoring.current = false;
      sessionRef.current = null;
    };
  }, [scopeKey, timer, restoring, setRouteOverridePickerTarget]);

  const clearTransition = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const openDirectRouteOverridePicker = (target: RouteOverridePickerTarget, inline = false) => {
    if (!enabled) return;
    Keyboard.dismiss();
    clearTransition();
    restoring.current = false;
    const session = { target, restoreModal: !inline && form.showDirectAcceptModal, closing: false };
    sessionRef.current = session;
    form.setShowDirectAcceptModal(false);
    const open = () => {
      timer.current = null;
      if (sessionRef.current === session && !session.closing) setRouteOverridePickerTarget(target);
    };
    // Inline options have no acceptance modal to dismiss before showing the picker.
    if (session.restoreModal) timer.current = setTimeout(open, Platform.OS === 'ios' ? 350 : 80);
    else open();
  };

  const restoreDirectAcceptModalAfterLocationPicker = () => {
    const session = sessionRef.current;
    if (!session || session.closing) return;
    session.closing = true;
    clearTransition();
    setRouteOverridePickerTarget(null);
    if (!session.restoreModal) {
      sessionRef.current = null;
      return;
    }
    restoring.current = true;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (sessionRef.current !== session) return;
      form.setShowDirectAcceptModal(true);
      restoring.current = false;
      sessionRef.current = null;
    }, Platform.OS === 'ios' ? 350 : 80);
  };

  const handleRouteOverrideSelected = (location: MapLocationSelection) => {
    const session = sessionRef.current;
    if (!session || session.closing) return;
    if (enabled) {
      if (session.target === 'directDeparture') form.setDirectAcceptDepartureLocation(location);
      else if (session.target === 'directArrival') form.setDirectAcceptArrivalLocation(location);
    }
    restoreDirectAcceptModalAfterLocationPicker();
  };
  return { openDirectRouteOverridePicker, restoreDirectAcceptModalAfterLocationPicker, handleRouteOverrideSelected };
}
