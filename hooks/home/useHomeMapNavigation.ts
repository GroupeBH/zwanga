import { getTripRequestDetailHref } from '@/utils/requestNavigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform
} from 'react-native';

import type { useHomeContext } from '@/hooks/home/useHomeContext';
type Props = Pick<ReturnType<typeof useHomeContext>, 'isFocused' | 'router'>
  & Partial<Pick<ReturnType<typeof useHomeContext>, 'isScreenActive'>>;
export function useHomeMapNavigation({ isFocused, isScreenActive = isFocused, router }: Props) {
  const canNavigate = isFocused && isScreenActive;
  const openingMapDetailRef = useRef(false);

  const openingMapDetailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openingMapDetailRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [openingMapDetailKey, setOpeningMapDetailKey] = useState<string | null>(null);

  const shouldRenderHomeMap = isFocused && !openingMapDetailKey;

  const scheduleMapDetailNavigation = useCallback((key: string, navigate: () => void) => {
    if (!canNavigate || openingMapDetailRef.current) return;

    openingMapDetailRef.current = true;
    setOpeningMapDetailKey(key);
    // Give MapKit time to release native marker views before changing screens.
    openingMapDetailTimerRef.current = setTimeout(() => {
      openingMapDetailRecoveryTimerRef.current = setTimeout(() => {
        openingMapDetailRef.current = false;
        setOpeningMapDetailKey(null);
        openingMapDetailRecoveryTimerRef.current = null;
      }, 1500);
      navigate();
      openingMapDetailTimerRef.current = null;
    }, Platform.OS === 'ios' ? 260 : 40);
  }, [canNavigate]);

  const openTripDetail = useCallback((tripId: string) => {
    scheduleMapDetailNavigation(`trip:${tripId}`, () => {
      router.replace(`/trip/${tripId}`);
    });
  }, [router, scheduleMapDetailNavigation]);

  const openTripRequestDetail = useCallback((requestId: string) => {
    scheduleMapDetailNavigation(`request:${requestId}`, () => {
      router.push(getTripRequestDetailHref(requestId));
    });
  }, [router, scheduleMapDetailNavigation]);

  useEffect(() => {
    if (!canNavigate) {
      if (openingMapDetailTimerRef.current) {
        clearTimeout(openingMapDetailTimerRef.current);
        openingMapDetailTimerRef.current = null;
      }
      if (openingMapDetailRecoveryTimerRef.current) {
        clearTimeout(openingMapDetailRecoveryTimerRef.current);
        openingMapDetailRecoveryTimerRef.current = null;
      }
      openingMapDetailRef.current = false;
      setOpeningMapDetailKey(null);
    }
  }, [canNavigate]);

  useEffect(() => () => {
    if (openingMapDetailTimerRef.current) clearTimeout(openingMapDetailTimerRef.current);
    if (openingMapDetailRecoveryTimerRef.current) {
      clearTimeout(openingMapDetailRecoveryTimerRef.current);
    }
  }, []);
  return { openingMapDetailKey, openTripRequestDetail, shouldRenderHomeMap, openTripDetail };
}
