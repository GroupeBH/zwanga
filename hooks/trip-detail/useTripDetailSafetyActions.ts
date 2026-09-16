import { useDialog } from '@/components/ui/DialogProvider';
import { useGetMyBookingsQuery, useGetTripBookingsQuery } from '@/store/api/bookingApi';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import React from 'react';

interface Params {
  sosModalTimerRef: React.RefObject<NodeJS.Timeout | null>;
  setIsDetailMapReady: React.Dispatch<React.SetStateAction<boolean>>;
  setSosModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isFocused: boolean;
  securityModalVisible: boolean;
  canAccessTripSecurity: boolean;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  refetchTrip: ReturnType<typeof useGetTripByIdQuery>['refetch'];
  refetchMyBookings: ReturnType<typeof useGetMyBookingsQuery>['refetch'];
  refetchTripBookings: ReturnType<typeof useGetTripBookingsQuery>['refetch'];
  securityModalTransitionRef: React.RefObject<boolean>;
  securityModalTimerRef: React.RefObject<NodeJS.Timeout | null>;
  setSecurityModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useTripDetailSafetyActions({
  sosModalTimerRef,
  setIsDetailMapReady,
  setSosModalVisible,
  isFocused,
  securityModalVisible,
  canAccessTripSecurity,
  showDialog,
  refetchTrip,
  refetchMyBookings,
  refetchTripBookings,
  securityModalTransitionRef,
  securityModalTimerRef,
  setSecurityModalVisible,
}: Params) {
  const openSosModal = () => {
    if (sosModalTimerRef.current) {
      clearTimeout(sosModalTimerRef.current);
      sosModalTimerRef.current = null;
    }
    setIsDetailMapReady(false);
    setSosModalVisible(true);
  };

  const closeSosModal = () => {
    setSosModalVisible(false);
    if (sosModalTimerRef.current) {
      clearTimeout(sosModalTimerRef.current);
    }
    sosModalTimerRef.current = setTimeout(() => {
      if (isFocused && !securityModalVisible) setIsDetailMapReady(true);
      sosModalTimerRef.current = null;
    }, 300);
  };

  const openTripSecurityModal = () => {
    if (!canAccessTripSecurity) {
      showDialog({
        variant: 'info',
        title: 'Sécurité indisponible',
        message: 'Connectez-vous pour gérer vos proches et le suivi de sécurité.',
      });
      return;
    }
    void refetchTrip();
    void refetchMyBookings();
    void refetchTripBookings();
    if (securityModalTransitionRef.current) return;

    securityModalTransitionRef.current = true;
    setIsDetailMapReady(false);
    securityModalTimerRef.current = setTimeout(() => {
      setSecurityModalVisible(true);
      securityModalTransitionRef.current = false;
      securityModalTimerRef.current = null;
    }, 100);
  };

  const closeTripSecurityModal = () => {
    if (securityModalTransitionRef.current) return;

    securityModalTransitionRef.current = true;
    setSecurityModalVisible(false);
    securityModalTimerRef.current = setTimeout(() => {
      if (isFocused) setIsDetailMapReady(true);
      securityModalTransitionRef.current = false;
      securityModalTimerRef.current = null;
    }, 400);
  };

  return {
    openTripSecurityModal,
    openSosModal,
    closeSosModal,
    closeTripSecurityModal,
  };
}
