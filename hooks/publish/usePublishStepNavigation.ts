import type { AddressSectionStep } from '@/components/AddressSectionSlider';
import { PublishStep, PUBLISH_STEP_ORDER } from '../../features/publish/publishModel';
import { useDialog } from '@/components/ui/DialogProvider';
import React, { startTransition } from 'react';

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

  const handleNextStep = () => {
    if (step === 'route') {
      if (!hasDepartureAddress || !hasArrivalAddress) {
        setAddressSectionStep(!hasDepartureAddress ? 'departure' : 'arrival');
        showDialog({
          variant: 'warning',
          title: 'Itinéraire incomplet',
          message: 'Indiquez une adresse de départ et une destination, ou choisissez-les sur la carte.',
        });
        return;
      }
      if (!isPublishIdentityVerified) {
        openKycModal();
        return;
      }
      goToStep('datetime');
    } else if (step === 'datetime') {
      if (!departureDateTime) {
        showDialog({
          variant: 'warning',
          title: 'Informations manquantes',
          message: 'Merci de renseigner la date et l heure de départ.',
        });
        return;
      }
      if (isRecurringTrip && recurringWeekdays.length === 0) {
        showDialog({
          variant: 'warning',
          title: 'Jours manquants',
          message: 'Sélectionnez au moins un jour pour ce trajet habituel.',
        });
        return;
      }
      if (isRecurringTrip && recurringEndDate) {
        const startDate = new Date(departureDateTime);
        startDate.setHours(0, 0, 0, 0);
        if (recurringEndDate < startDate) {
          showDialog({
            variant: 'warning',
            title: 'Date de fin invalide',
            message: 'La date de fin doit être posterieure au debut.',
          });
          return;
        }
      }
      goToStep('vehicle');
    } else if (step === 'vehicle') {
      if (!selectedVehicleId) {
        showDialog({
          variant: 'warning',
          title: 'Véhicule requis',
          message: 'Veuillez sélectionner un véhicule pour continuer.',
        });
        return;
      }
      goToStep('pricing');
    } else if (step === 'pricing') {
      if (!isFreeTrip && !price) {
        showDialog({
          variant: 'warning',
          title: 'Informations manquantes',
          message: 'Merci de renseigner le prix ou de sélectionner Gratuit.',
        });
        return;
      }
      goToStep('confirm');
    }
  };

  return {
    handleNextStep,
    goToStep,
    getStepNumber,
    isStepActive,
    isStepCompleted,
  };
}
