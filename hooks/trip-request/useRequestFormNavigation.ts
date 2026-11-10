import type { RequestTripController } from './useRequestTripController';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Keyboard, ScrollView } from 'react-native';

type Props = Pick<RequestTripController, 'requestFormStep' | 'setRequestFormStep' | 'router' |
  'isCreating' | 'createdRequestId' | 'isRequestSuccessVisible' | 'submissionRecoveryMessage'> & { isHomeEntry?: boolean };

/** Step navigation keeps the mounted draft; a sent/uncertain request stays in its recovery flow. */
export function useRequestFormNavigation(form: Props) {
  const { requestFormStep, setRequestFormStep, router } = form;
  const scrollRef = useRef<ScrollView>(null);
  const backDisabled = Boolean(form.isCreating || form.createdRequestId ||
    form.isRequestSuccessVisible || form.submissionRecoveryMessage);
  const returnToRoute = useCallback(() => {
    if (backDisabled || form.isHomeEntry || requestFormStep !== 'details') return;
    Keyboard.dismiss();
    setRequestFormStep('route');
  }, [backDisabled, form.isHomeEntry, requestFormStep, setRequestFormStep]);
  const handleBack = useCallback(() => {
    if (backDisabled) return;
    if (!form.isHomeEntry && requestFormStep === 'details') returnToRoute();
    else router.back();
  }, [backDisabled, form.isHomeEntry, requestFormStep, returnToRoute, router]);

  useFocusEffect(useCallback(() => {
    if (form.isHomeEntry) return; // The inline Home workspace owns back navigation.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (backDisabled) return true;
      if (requestFormStep !== 'details') return false;
      returnToRoute();
      return true;
    });
    return () => subscription.remove();
  }, [backDisabled, form.isHomeEntry, requestFormStep, returnToRoute]));
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [requestFormStep]);

  return { scrollRef, backDisabled, handleBack, returnToRoute };
}
