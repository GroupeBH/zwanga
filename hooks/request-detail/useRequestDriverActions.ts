import { getLocationCoordinates } from '../../features/request-detail/requestLocation';
import { TRIP_REQUEST_VEHICLE_LABELS } from '../../features/request-detail/requestDetailModel';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { hasTripRequestExpired } from '@/features/trip-request/requestExpiration';
import { useTripStartTransition } from '@/hooks/navigation/useTripStartTransition';
import { useStartTripMutation } from '@/store/api/tripApi';
import {
  useAcceptTripRequestMutation,
  useGetTripRequestByIdQuery,
  useStartTripFromRequestMutation,
} from '@/store/api/tripRequestApi';
import type { TripRequest, TripRequestVehicleType, Vehicle } from '@/types';
import {
  createBecomeDriverAction,
  createSubscribeToZwangaProAction,
  getApiErrorMessage,
  isDailyPublicationLimitError,
  isDriverRequiredError,
  isPassengerKycRequiredError,
} from '@/utils/errorHelpers';
import React from 'react';
import type { Router } from 'expo-router';

interface Params {
  tripRequest: TripRequest | undefined;
  id: string | undefined;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  startTripFromRequest: ReturnType<typeof useStartTripFromRequestMutation>[0];
  refetch: ReturnType<typeof useGetTripRequestByIdQuery>['refetch'];
  router: Router;
  directAcceptDepartureDate: Date | null;
  canAcceptRequest: boolean;
  setShowDirectAcceptModal: React.Dispatch<React.SetStateAction<boolean>>;
  compatibleActiveVehicles: Vehicle[];
  requestedVehicleType: TripRequestVehicleType;
  directAcceptVehicle: Vehicle | null;
  directAcceptRequiresPassengerKyc: boolean;
  directAcceptDepartureLocation: MapLocationSelection | null;
  directAcceptArrivalLocation: MapLocationSelection | null;
  directAcceptDepartureReference: string;
  directAcceptArrivalReference: string;
  acceptTripRequest: ReturnType<typeof useAcceptTripRequestMutation>[0];
  startTrip: ReturnType<typeof useStartTripMutation>[0];
  setAreDirectOptionsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  isCurrentDriverAssigned: boolean;
  showDirectAcceptModal: boolean;
}

export function useRequestDriverActions({
  tripRequest,
  id,
  showDialog,
  startTripFromRequest,
  refetch,
  router,
  directAcceptDepartureDate,
  canAcceptRequest,
  setShowDirectAcceptModal,
  compatibleActiveVehicles,
  requestedVehicleType,
  directAcceptVehicle,
  directAcceptRequiresPassengerKyc,
  directAcceptDepartureLocation,
  directAcceptArrivalLocation,
  directAcceptDepartureReference,
  directAcceptArrivalReference,
  acceptTripRequest,
  startTrip,
  setAreDirectOptionsExpanded,
  isCurrentDriverAssigned,
  showDirectAcceptModal,
}: Params) {
  const transition = useTripStartTransition(id, router, showDirectAcceptModal);
  const handleStartTripFromRequest = async () => {
    if (!tripRequest || !id || !transition.isCurrent()) return;

    showDialog({
      title: 'Démarrer le trajet',
      message: 'Vous allez créer un trajet et une réservation automatique pour le passager. Le trajet démarrera immédiatement. Continuer ?',
      variant: 'info',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Démarrer',
          variant: 'primary',
          onPress: async () => {
            if (!transition.begin()) return;
            try {
              const result = await startTripFromRequest(id).unwrap();
              transition.openNavigation(result.trip);
            } catch (error: any) {
              if (!transition.isCurrent()) return;
              const isQuotaError = isDailyPublicationLimitError(error);

              showDialog({
                title: isQuotaError ? 'Abonnement conducteur requis' : 'Erreur',
                actions: isQuotaError
                  ? [
                      { label: 'Plus tard', variant: 'ghost' },
                      createSubscribeToZwangaProAction(router),
                    ]
                  : undefined,
                message: getApiErrorMessage(error, 'Impossible de démarrer le trajet.'),
                variant: 'danger',
              });
            } finally {
              transition.finish();
            }
          },
        },
      ],
    });
  };

  const handleDirectAcceptTripRequest = async (startImmediately: boolean) => {
    if (!tripRequest || !id || !directAcceptDepartureDate || !transition.isCurrent()) return;
    if (!canAcceptRequest || hasTripRequestExpired(tripRequest)) {
      setShowDirectAcceptModal(false);
      showDialog({
        title: 'Demande indisponible',
        message: "Cette demande n'est plus disponible. Consultez les autres demandes de trajet.",
        variant: 'info',
      });
      return;
    }
    if (compatibleActiveVehicles.length === 0) {
      setShowDirectAcceptModal(false);
      showDialog({
        title: 'Véhicule non disponible',
        message: `Cette demande nécessite le type ${TRIP_REQUEST_VEHICLE_LABELS[requestedVehicleType]}. Aucun de vos véhicules actifs ne correspond pour le moment.`,
        variant: 'warning',
        actions: [{ label: 'Fermer', variant: 'ghost' }],
      });
      return;
    }
    if (!directAcceptVehicle) {
      showDialog({
        title: 'Choisissez un véhicule',
        message: 'Sélectionnez le véhicule que vous utiliserez pour transporter le passager.',
        variant: 'warning',
      });
      return;
    }

    const payload: {
      vehicleId: string;
      departureDate?: string;
      departureReference?: string;
      departureCoordinates?: [number, number];
      arrivalReference?: string;
      arrivalCoordinates?: [number, number];
      requiresPassengerKyc?: boolean;
    } = {
      vehicleId: directAcceptVehicle.id,
      departureDate: directAcceptDepartureDate.toISOString(),
      requiresPassengerKyc: directAcceptRequiresPassengerKyc,
    };

    const directDepartureCoordinates = getLocationCoordinates(directAcceptDepartureLocation);
    const directArrivalCoordinates = getLocationCoordinates(directAcceptArrivalLocation);
    if (directAcceptDepartureReference.trim()) {
      payload.departureReference = directAcceptDepartureReference.trim();
    }
    if (directDepartureCoordinates) {
      payload.departureCoordinates = directDepartureCoordinates;
    }
    if (directAcceptArrivalReference.trim()) {
      payload.arrivalReference = directAcceptArrivalReference.trim();
    }
    if (directArrivalCoordinates) {
      payload.arrivalCoordinates = directArrivalCoordinates;
    }

    if (!transition.begin()) return;
    try {
      const result = await acceptTripRequest({
        tripRequestId: id,
        payload,
      }).unwrap();
      if (transition.isCurrent()) setShowDirectAcceptModal(false);

      if (startImmediately) {
        try {
          const startedTrip = await startTrip(result.trip.id).unwrap();
          transition.openNavigation(startedTrip);
        } catch (startError: any) {
          if (!transition.isCurrent()) return;
          const startErrorMessage = getApiErrorMessage(
            startError,
            'La demande est accept\u00E9e, mais le trajet n\u2019a pas pu d\u00E9marrer tout de suite.',
          );

          showDialog({
            title: 'Demande accept\u00E9e',
            message: `${startErrorMessage} Vous pouvez ouvrir le trajet pour le lancer depuis son \u00E9cran de gestion.`,
            variant: 'warning',
            actions: [
              {
                label: 'Ouvrir le trajet',
                variant: 'primary',
                onPress: () => {
                  refetch();
                  router.push(`/trip/manage/${result.trip.id}`);
                },
              },
              {
                label: 'Rester ici',
                variant: 'ghost',
                onPress: () => refetch(),
              },
            ],
          });
        }

        return;
      }

      if (!transition.isCurrent()) return;
      showDialog({
        title: 'Demande accept\u00E9e',
        message: 'Le trajet a \u00E9t\u00E9 cr\u00E9\u00E9 imm\u00E9diatement et le passager a d\u00E9j\u00E0 \u00E9t\u00E9 r\u00E9serv\u00E9. Vous pouvez maintenant ouvrir le trajet quand vous \u00EAtes pr\u00EAt.',
        variant: 'success',
        actions: [
          {
            label: 'Ouvrir le trajet',
            variant: 'primary',
            onPress: () => {
              refetch();
              router.push(`/trip/manage/${result.trip.id}`);
            },
          },
          {
            label: 'Plus tard',
            variant: 'ghost',
            onPress: () => refetch(),
          },
        ],
      });
    } catch (error: any) {
      if (!transition.isCurrent()) return;
      setShowDirectAcceptModal(false);
      const resolvedMessage = getApiErrorMessage(
        error,
        'Impossible d\u2019accepter cette demande pour le moment.',
      );
      const isQuotaError = isDailyPublicationLimitError(error);
      const isDriverError = isDriverRequiredError(error);
      const isPassengerKycError = isPassengerKycRequiredError(error);

      showDialog({
        title: isQuotaError
          ? 'Abonnement conducteur requis'
          : isPassengerKycError
            ? 'Identité du passager à vérifier'
            : 'Erreur',
        message: isPassengerKycError
          ? "L'identité de ce passager n'est pas encore vérifiée. Acceptez sans cette exigence, ou demandez-lui de terminer sa vérification avant de continuer."
          : resolvedMessage,
        variant: isQuotaError || isPassengerKycError ? 'warning' : 'danger',
        actions: isQuotaError
          ? [
              { label: 'Plus tard', variant: 'ghost' },
              createSubscribeToZwangaProAction(router),
            ]
          : isPassengerKycError
          ? [{ label: 'Fermer', variant: 'ghost' }]
          : isDriverError
          ? [
              { label: 'Fermer', variant: 'ghost' },
              createBecomeDriverAction(router),
            ]
          : undefined,
      });
    } finally {
      transition.finish();
    }
  };

  const handleOpenDirectAcceptModal = () => {
    if (!tripRequest || !directAcceptDepartureDate) return;
    if (!canAcceptRequest || hasTripRequestExpired(tripRequest)) return;
    if (compatibleActiveVehicles.length === 0) {
      showDialog({
        title: 'Véhicule non disponible',
        message: `Cette demande nécessite le type ${TRIP_REQUEST_VEHICLE_LABELS[requestedVehicleType]}. Aucun de vos véhicules actifs ne correspond pour le moment.`,
        variant: 'warning',
        actions: [{ label: 'Fermer', variant: 'ghost' }],
      });
      return;
    }
    setAreDirectOptionsExpanded(false);
    setShowDirectAcceptModal(true);
  };

  const handleViewTrip = (tripId: string) => {
    if (!tripId) return;

    const targetRoute = isCurrentDriverAssigned ? `/trip/manage/${tripId}` as const : `/trip/${tripId}` as const;
    router.push(targetRoute);
  };

  return {
    onDirectAcceptModalDismiss: transition.onModalDismiss,
    handleViewTrip,
    handleStartTripFromRequest,
    handleOpenDirectAcceptModal,
    handleDirectAcceptTripRequest,
  };
}
