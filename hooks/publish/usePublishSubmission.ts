import { PublicationSuccess, getLocationCoordinates, isUserDriver } from '../../features/publish/publishModel';
import { isPublicationPhotoRequired, publicationPhotoDialog } from '@/features/publish/publicationPhotoPolicy';
import { type AddressSectionStep } from '@/components/AddressSectionSlider';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { trackEvent } from '@/services/analytics';
import {
  useCreateRecurringTripMutation,
  useCreateTripMutation,
  useLazyGetMyRecurringTripsQuery,
  useLazyGetMyTripsQuery,
} from '@/store/api/tripApi';
import { useGetProfileSummaryQuery } from '@/store/api/userApi';
import type { Vehicle } from '@/types';
import {
  createBecomeDriverAction,
  createSubscribeToZwangaProAction,
  getApiErrorMessage,
  isDailyPublicationLimitError,
  isDriverRequiredError,
} from '@/utils/errorHelpers';
import { reconcileAmbiguousMutation } from '@/utils/mutationReconciliation';
import React from 'react';
import type { User } from '@/types';
import type { Router } from 'expo-router';

interface Params {
  publishInFlightRef: React.RefObject<boolean>;
  isSubmittingTrip: boolean;
  hasDepartureAddress: boolean;
  hasArrivalAddress: boolean;
  setAddressSectionStep: React.Dispatch<React.SetStateAction<AddressSectionStep>>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  seats: string;
  isFreeTrip: boolean;
  price: string;
  departureDateTime: Date | null;
  isRecurringTrip: boolean;
  recurringWeekdays: number[];
  isDriver: boolean;
  createdVehicle: Vehicle | null;
  isLoadingProfile: boolean;
  isFetchingProfile: boolean;
  user: User | undefined;
  refetchProfile: ReturnType<typeof useGetProfileSummaryQuery>['refetch'];
  setShowDriverRequiredModal: React.Dispatch<React.SetStateAction<boolean>>;
  selectedVehicleId: string | null;
  isPublishIdentityVerified: boolean;
  openKycModal: () => void;
  departureLocation: MapLocationSelection | null;
  arrivalLocation: MapLocationSelection | null;
  createRecurringTrip: ReturnType<typeof useCreateRecurringTripMutation>[0];
  departureAddress: string;
  departureReference: string;
  arrivalAddress: string;
  arrivalReference: string;
  formatDateOnlyValue: (date: Date) => string;
  recurringEndDate: Date | null;
  formatTimeOnlyValue: (date: Date) => string;
  description: string;
  requiresPassengerKyc: boolean;
  createTrip: ReturnType<typeof useCreateTripMutation>[0];
  setPublicationSuccess: React.Dispatch<React.SetStateAction<PublicationSuccess>>;
  getMyRecurringTrips: ReturnType<typeof useLazyGetMyRecurringTripsQuery>[0];
  getMyTrips: ReturnType<typeof useLazyGetMyTripsQuery>[0];
  router: Router;
}

export function usePublishSubmission({
  publishInFlightRef,
  isSubmittingTrip,
  hasDepartureAddress,
  hasArrivalAddress,
  setAddressSectionStep,
  showDialog,
  seats,
  isFreeTrip,
  price,
  departureDateTime,
  isRecurringTrip,
  recurringWeekdays,
  isDriver,
  createdVehicle,
  isLoadingProfile,
  isFetchingProfile,
  user,
  refetchProfile,
  setShowDriverRequiredModal,
  selectedVehicleId,
  isPublishIdentityVerified,
  openKycModal,
  departureLocation,
  arrivalLocation,
  createRecurringTrip,
  departureAddress,
  departureReference,
  arrivalAddress,
  arrivalReference,
  formatDateOnlyValue,
  recurringEndDate,
  formatTimeOnlyValue,
  description,
  requiresPassengerKyc,
  createTrip,
  setPublicationSuccess,
  getMyRecurringTrips,
  getMyTrips,
  router,
}: Params) {
  const handlePublish = async () => {
    // RTK Query's isLoading is updated on the next render. The ref also blocks
    // two taps occurring in the same frame from creating duplicate trips.
    if (publishInFlightRef.current || isSubmittingTrip) return;

    if (!hasDepartureAddress || !hasArrivalAddress) {
      setAddressSectionStep(!hasDepartureAddress ? 'departure' : 'arrival');
      showDialog({
        variant: 'warning',
        title: 'Itinéraire incomplet',
        message: "Indiquez vos adresses de départ et d’arrivée, ou choisissez-les sur la carte.",
      });
      return;
    }

    const seatsValue = parseInt(seats, 10);
    const priceValue = isFreeTrip ? 0 : parseFloat(price);
    const departureDate = departureDateTime;

    if (
      Number.isNaN(seatsValue) ||
      (!isFreeTrip && (Number.isNaN(priceValue) || priceValue <= 0)) ||
      !departureDate ||
      Number.isNaN(departureDate.getTime())
    ) {
      showDialog({
        variant: 'warning',
        title: 'Vérification requise',
        message: 'Veuillez vérifier les valeurs numériques et la date de départ.',
      });
      return;
    }

    if (isRecurringTrip && recurringWeekdays.length === 0) {
      showDialog({
        variant: 'warning',
        title: 'Jours manquants',
        message: 'Sélectionnez au moins un jour pour publier ce trajet habituel.',
      });
      return;
    }

    if (!isDriver && !createdVehicle) {
      const refreshedProfile =
        isLoadingProfile || isFetchingProfile || !user ? await refetchProfile() : null;
      const refreshedUser = refreshedProfile?.data?.user;

      if (!isUserDriver(refreshedUser ?? user)) {
        setShowDriverRequiredModal(true);
        return;
      }
    }

    if (!selectedVehicleId) {
      showDialog({
        variant: 'warning',
        title: 'Véhicule requis',
        message: 'Veuillez sélectionner un véhicule pour publier votre trajet.',
      });
      return;
    }

    if (!isPublishIdentityVerified) {
      openKycModal();
      return;
    }

    publishInFlightRef.current = true;
    const publicationStartedAt = Date.now();

    try {
      const departureCoordinates = getLocationCoordinates(departureLocation);
      const arrivalCoordinates = getLocationCoordinates(arrivalLocation);

      if (isRecurringTrip) {
        await createRecurringTrip({
          departureLocation: departureAddress,
          departureReference: departureReference.trim() || undefined,
          departureCoordinates,
          arrivalLocation: arrivalAddress,
          arrivalReference: arrivalReference.trim() || undefined,
          arrivalCoordinates,
          startDate: formatDateOnlyValue(departureDate),
          endDate: recurringEndDate ? formatDateOnlyValue(recurringEndDate) : undefined,
          departureTime: formatTimeOnlyValue(departureDate),
          weekdays: recurringWeekdays,
          totalSeats: seatsValue,
          pricePerSeat: priceValue,
          isFree: isFreeTrip,
          description: description.trim() || undefined,
          vehicleId: selectedVehicleId,
          requiresPassengerKyc,
        }).unwrap();
        void trackEvent('recurring_trip_created', {
          seats: seatsValue,
          is_free: isFreeTrip,
          has_description: Boolean(description.trim()),
          requires_passenger_kyc: requiresPassengerKyc,
          weekdays_count: recurringWeekdays.length,
        });
      } else {
        await createTrip({
          departureLocation: departureAddress,
          departureReference: departureReference.trim() || undefined,
          departureCoordinates,
          arrivalLocation: arrivalAddress,
          arrivalReference: arrivalReference.trim() || undefined,
          arrivalCoordinates,
          departureDate: departureDate.toISOString(),
          totalSeats: seatsValue,
          pricePerSeat: priceValue,
          isFree: isFreeTrip,
          description: description.trim() || undefined,
          vehicleId: selectedVehicleId,
          requiresPassengerKyc,
        }).unwrap();
        void trackEvent('trip_published', {
          seats: seatsValue,
          price_per_seat: priceValue,
          is_free: isFreeTrip,
          has_description: Boolean(description.trim()),
          requires_passenger_kyc: requiresPassengerKyc,
        });
      }

      // Keep the confirmation screen mounted behind the success feedback. On iOS,
      // opening a native Modal above a stack screen that already contains a
      // MapView can crash during the publication transition, so the feedback is
      // rendered as an in-screen overlay instead of a React Native Modal.
      setPublicationSuccess({ recurring: isRecurringTrip });
    } catch (error: any) {
      if (isPublicationPhotoRequired(error)) {
        showDialog(publicationPhotoDialog(router));
        return;
      }
      const normalizedDeparture = departureAddress.trim().toLowerCase();
      const normalizedArrival = arrivalAddress.trim().toLowerCase();
      const recoveredPublication = isRecurringTrip
        ? await reconcileAmbiguousMutation({
            error,
            loadSnapshot: async () => getMyRecurringTrips(undefined, false).unwrap(),
            isApplied: (templates) =>
              templates.some((template) => {
                const createdAt = new Date(template.createdAt).getTime();
                return (
                  Number.isFinite(createdAt) &&
                  createdAt >= publicationStartedAt - 10_000 &&
                  template.departure.name.trim().toLowerCase() === normalizedDeparture &&
                  template.arrival.name.trim().toLowerCase() === normalizedArrival
                );
              }),
          })
        : await reconcileAmbiguousMutation({
            error,
            loadSnapshot: async () => getMyTrips(undefined, false).unwrap(),
            isApplied: (latestTrips) =>
              latestTrips.some((latestTrip) => {
                const latestDepartureAt = new Date(latestTrip.departureTime).getTime();
                return (
                  Number.isFinite(latestDepartureAt) &&
                  Math.abs(latestDepartureAt - departureDate.getTime()) < 60_000 &&
                  latestTrip.departure.name.trim().toLowerCase() === normalizedDeparture &&
                  latestTrip.arrival.name.trim().toLowerCase() === normalizedArrival &&
                  (latestTrip.vehicle?.id ?? latestTrip.vehicleId) === selectedVehicleId
                );
              }),
          });

      if (recoveredPublication) {
        setPublicationSuccess({ recurring: isRecurringTrip });
        return;
      }

      const message = getApiErrorMessage(
        error,
        'Impossible de publier le trajet pour le moment. Veuillez réessayer.',
      );

      const isDriverError = isDriverRequiredError(error);
      const isQuotaError = isDailyPublicationLimitError(error);

      showDialog({
        variant: isQuotaError ? 'warning' : 'danger',
        title: isQuotaError ? 'Abonnement conducteur requis' : 'Erreur',
        message,
        actions: isQuotaError
          ? [
              { label: 'Plus tard', variant: 'ghost' },
              createSubscribeToZwangaProAction(router),
            ]
          : isDriverError
          ? [
              { label: 'Fermer', variant: 'ghost' },
              createBecomeDriverAction(router),
            ]
          : undefined,
      });
    } finally {
      publishInFlightRef.current = false;
    }
  };

  return {
    handlePublish,
  };
}
