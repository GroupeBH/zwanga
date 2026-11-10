import type { AddressSectionStep } from '@/components/AddressSectionSlider';
import { PublishStep, PUBLISH_STEP_ORDER } from '../../features/publish/publishModel';
import { useDialog } from '@/components/ui/DialogProvider';
import React, { startTransition } from 'react';
import type { TripPaymentMode } from '@/types';
import { MIN_REQUEST_PRICE } from '@/features/trip-request/requestFormModel';

interface Params {
  stepNumber: number;
  step: PublishStep;
  setStep: React.Dispatch<React.SetStateAction<PublishStep>>;
  hasDepartureAddress: boolean;
  hasArrivalAddress: boolean;
  setAddressSectionStep: React.Dispatch<React.SetStateAction<AddressSectionStep>>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  isPublishIdentityVerified: boolean;
  openKycModal: () => void;
  departureDateTime: Date | null;
  isRecurringTrip: boolean;
  recurringWeekdays: number[];
  recurringEndDate: Date | null;
  selectedVehicleId: string | null;
  isFreeTrip: boolean;
  price: string;
  acceptedPaymentModes: TripPaymentMode[];
}

export function usePublishStepNavigation({
  stepNumber,
  step,
  setStep,
  hasDepartureAddress,
  hasArrivalAddress,
  setAddressSectionStep,
  showDialog,
  isPublishIdentityVerified,
  openKycModal,
  departureDateTime,
  isRecurringTrip,
  recurringWeekdays,
  recurringEndDate,
  selectedVehicleId,
  isFreeTrip,
  price,
  acceptedPaymentModes,
}: Params) {
  const getStepNumber = () => {
    return stepNumber;
  };

  const isStepCompleted = (checkStep: PublishStep) => {
    const currentIndex = PUBLISH_STEP_ORDER.indexOf(step);
    const checkIndex = PUBLISH_STEP_ORDER.indexOf(checkStep);
    return checkIndex < currentIndex;
  };

  const isStepActive = (checkStep: PublishStep) => step === checkStep;
  const goToStep = (nextStep: PublishStep) => {
    if (nextStep === step) return;
    startTransition(() => {
      setStep(nextStep);
    });
  };

  const validateRoute = () => {
      if (!hasDepartureAddress || !hasArrivalAddress) {
        setAddressSectionStep(!hasDepartureAddress ? 'departure' : 'arrival');
        showDialog({
          variant: 'warning',
          title: 'Itinéraire incomplet',
          message: 'Indiquez une adresse de départ et une destination, ou choisissez-les sur la carte.',
        });
        return false;
      }
      if (!isPublishIdentityVerified) {
        openKycModal();
        return false;
      }
      if (!departureDateTime || !Number.isFinite(departureDateTime.getTime())) {
        showDialog({
          variant: 'warning',
          title: 'Informations manquantes',
          message: 'Choisissez votre heure de départ.',
        });
        return false;
      }
      if (isRecurringTrip && recurringWeekdays.length === 0) {
        showDialog({
          variant: 'warning',
          title: 'Jours manquants',
          message: 'Sélectionnez au moins un jour pour ce trajet habituel.',
        });
        return false;
      }
      if (isRecurringTrip && recurringEndDate) {
        const startDate = new Date(departureDateTime);
        startDate.setHours(0, 0, 0, 0);
        if (recurringEndDate < startDate) {
          showDialog({
            variant: 'warning',
            title: 'Date de fin invalide',
            message: 'La date de fin doit être postérieure au début.',
          });
          return false;
        }
      }
      return true;
  };
  const validatePricing = () => {
      if (!selectedVehicleId) {
        showDialog({
          variant: 'warning',
          title: 'Véhicule requis',
          message: 'Veuillez sélectionner un véhicule pour continuer.',
        });
        return false;
      }
      if (!isFreeTrip && (!price.trim() || !Number.isFinite(Number(price)) ||
          Number(price) < MIN_REQUEST_PRICE || Number(price) !== parseFloat(price))) {
        showDialog({
          variant: 'warning',
          title: 'Informations manquantes',
          message: 'Indiquez au moins 2 500 FC par place ou sélectionnez Gratuit.',
        });
        return false;
      }
      if (!isFreeTrip && acceptedPaymentModes?.length === 0) {
        showDialog({ variant: 'warning', title: 'Choisissez un paiement',
          message: 'Activez Électronique ou Jetons, ou rechargez vos jetons pour accepter le cash.' });
        return false;
      }
      return true;
  };
  const handleNextStep = () => {
    if (step === 'route' && validateRoute()) goToStep('pricing');
  };

  return {
    handleNextStep,
    validateForPublish: () => validateRoute() && validatePricing(),
    goToStep,
    getStepNumber,
    isStepActive,
    isStepCompleted,
  };
}
