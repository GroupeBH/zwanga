import { usePublishVehicleState } from './usePublishVehicleState';
import { usePublishFormState } from './usePublishFormState';
import { PublishStep, PublicationSuccess } from '../../features/publish/publishModel';
import React from 'react';
import { Platform } from 'react-native';
import type { Router } from 'expo-router';

interface Params {
  departureAutoFillStartedRef: React.RefObject<boolean>;
  departureTouchedRef: React.RefObject<boolean>;
  setStep: React.Dispatch<React.SetStateAction<PublishStep>>;
  form: ReturnType<typeof usePublishFormState>;
  vehicle: ReturnType<typeof usePublishVehicleState>;
  publicationSuccessActionRef: React.RefObject<boolean>;
  publicationSuccess: PublicationSuccess;
  setPublicationSuccess: React.Dispatch<React.SetStateAction<PublicationSuccess>>;
  router: Router;
}

export function usePublishSuccessActions({
  departureAutoFillStartedRef,
  departureTouchedRef,
  setStep,
  form,
  vehicle,
  publicationSuccessActionRef,
  publicationSuccess,
  setPublicationSuccess,
  router,
}: Params) {
  const resetForm = () => {
    departureAutoFillStartedRef.current = false;
    departureTouchedRef.current = false;
    setStep('route');
    form.setDepartureLocation(null);
    form.setArrivalLocation(null);
    form.setDeparturePointStatus(null);
    form.setArrivalPointStatus(null);
    form.setActiveLocationType(null);
    form.setDepartureDateTime(null);
    form.setIosPickerMode(null);
    form.setIosPickerTarget('departure');
    form.setSeats('4');
    form.setIsFreeTrip(false);
    form.setPrice('');
    form.setDescription('');
    form.setIsRecurringTrip(false);
    form.setRecurringWeekdays([]);
    form.setRecurringEndDate(null);
    form.setDepartureManualAddress('');
    form.setDepartureReference('');
    form.setArrivalManualAddress('');
    form.setArrivalReference('');
    form.setShowDepartureReference(false);
    form.setShowArrivalReference(false);
    form.setManualAddressTarget(null);
    form.setAddressSectionStep('method');
    form.setLocationPickerInitialQuery('');
    form.setShowQuickLandmarks(false);
    vehicle.setSelectedVehicleId(null);
    vehicle.setCreatedVehicle(null);
    vehicle.setShowVehicleForm(false);
    vehicle.setVehicleType(null);
    vehicle.setVehicleBrand('');
    vehicle.setVehicleModel('');
    vehicle.setVehicleColor('');
    vehicle.setVehicleLicensePlate('');
    vehicle.setVehicleFormError(null);
    vehicle.setVehicleCreationMessage(null);
    vehicle.setIsFinalizingVehicleCreation(false);
  };

  const finishPublicationSuccess = (action: 'home' | 'trips' | 'another') => {
    if (publicationSuccessActionRef.current) return;

    publicationSuccessActionRef.current = true;
    const wasRecurring = publicationSuccess?.recurring ?? false;
    setPublicationSuccess(null);

    // Let React Native finish removing the success overlay before changing the
    // navigation stack or remounting maps on the destination screen.
    setTimeout(() => {
      if (action === 'another') {
        resetForm();
        publicationSuccessActionRef.current = false;
        return;
      }

      if (action === 'trips') {
        router.replace(wasRecurring ? '/recurring-trips' : '/trips');
        return;
      }

      router.replace('/(tabs)');
    }, Platform.OS === 'ios' ? 180 : 80);
  };

  return {
    finishPublicationSuccess,
  };
}
