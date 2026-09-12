import { type AddressSectionStep } from '@/components/AddressSectionSlider';
import { useDialog } from '@/components/ui/DialogProvider';
import { MUTATION_RECONCILIATION_DELAYS_MS } from '@/constants/network';
import { clampRequestPrice, getLocationCoordinates, RequestFormStep } from '@/features/trip-request/requestFormModel';
import { trackEvent } from '@/services/analytics';
import {
  useCreateTripRequestMutation,
  useLazyGetMyTripRequestsQuery
} from '@/store/api/tripRequestApi';
import { getApiErrorMessage, isAmbiguousTransportError } from '@/utils/errorHelpers';
import { getTripRequestDetailHref } from '@/utils/requestNavigation';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { useRequestDraft } from './useRequestDraft';
import type { useRequestSchedule } from './useRequestSchedule';

type Props = Pick<ReturnType<typeof useRequestDraft>, 'arrivalLocation' | 'departureLocation' | 'timePreset' | 'setDepartureDateMin' | 'setFlexibilityMinutes' | 'hasEditedBudget' | 'description' | 'departureReference' | 'arrivalReference' | 'hasSpecifiedNumberOfSeats' | 'numberOfSeats' | 'selectedVehicleType' | 'requestPaymentMode'> & {
  departureAddress: string; arrivalAddress: string; hasDepartureAddress: boolean; hasArrivalAddress: boolean;
  canSubmitRequestDetails: boolean; parsedManualBudget: number | undefined; selectedVehicleOptionUnavailable: boolean;
  getCurrentDepartureWindow: ReturnType<typeof useRequestSchedule>['getCurrentDepartureWindow'];
  setRequestFormStep: React.Dispatch<React.SetStateAction<RequestFormStep>>;
  setAddressSectionStep: React.Dispatch<React.SetStateAction<AddressSectionStep>>;
};

export function useRequestSubmission({
  arrivalLocation,
  departureLocation,
  timePreset,
  setDepartureDateMin,
  setFlexibilityMinutes,
  hasEditedBudget,
  description,
  departureReference,
  arrivalReference,
  hasSpecifiedNumberOfSeats,
  numberOfSeats,
  selectedVehicleType,
  requestPaymentMode,
  departureAddress,
  arrivalAddress,
  hasDepartureAddress,
  hasArrivalAddress,
  canSubmitRequestDetails,
  parsedManualBudget,
  selectedVehicleOptionUnavailable,
  getCurrentDepartureWindow,
  setRequestFormStep,
  setAddressSectionStep
}: Props) {
  const router = useRouter();
  const { showDialog } = useDialog();
  const createRequestInFlightRef = useRef(false);

  const [createTripRequest, { isLoading: isCreating }] = useCreateTripRequestMutation();

  const [getMyTripRequests] = useLazyGetMyTripRequestsQuery();

  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);

  const [submissionRecoveryMessage, setSubmissionRecoveryMessage] = useState<string | null>(null);

  const [requestSentWithoutDetail, setRequestSentWithoutDetail] = useState(false);

  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const validate = (departureWindow = getCurrentDepartureWindow()) => {
    if (!hasDepartureAddress) {
      setRequestFormStep('route');
      setAddressSectionStep('departure');
      showDialog({
        title: 'Départ requis',
        message: 'Indiquez une adresse de départ ou choisissez un point sur la carte.',
        variant: 'warning',
      });
      return false;
    }
    if (!hasArrivalAddress) {
      setRequestFormStep('route');
      setAddressSectionStep('arrival');
      showDialog({
        title: 'Destination requise',
        message: 'Indiquez une adresse d’arrivée ou choisissez un point sur la carte.',
        variant: 'warning',
      });
      return false;
    }
    if (
      departureLocation &&
      arrivalLocation &&
      departureLocation.latitude === arrivalLocation.latitude &&
      departureLocation.longitude === arrivalLocation.longitude
    ) {
      showDialog({
        title: 'Trajet incomplet',
        message: 'Choisissez deux lieux différents pour le départ et la destination.',
        variant: 'warning',
      });
      return false;
    }
    if (
      departureWindow.min.getTime() >= departureWindow.max.getTime() ||
      departureWindow.min.getTime() < Date.now() - 60000
    ) {
      showDialog({
        title: 'Heure invalide',
        message: 'Choisissez une heure de départ à venir.',
        variant: 'warning',
      });
      return false;
    }
    return true;
  };

  const handleCreateRequest = async () => {
    if (createRequestInFlightRef.current || isCreating) return;
    setSubmissionError(null);
    setCreatedRequestId(null);
    setSubmissionRecoveryMessage(null);
    setRequestSentWithoutDetail(false);

    const departureWindow = getCurrentDepartureWindow();
    if (timePreset !== 'custom') {
      setDepartureDateMin(departureWindow.min);
      setFlexibilityMinutes(departureWindow.flex);
    }
    if (!validate(departureWindow)) return;
    const parsedBudget = hasEditedBudget && parsedManualBudget !== undefined
      ? clampRequestPrice(parsedManualBudget)
      : undefined;
    if (parsedBudget !== undefined && (!Number.isFinite(parsedBudget) || parsedBudget <= 0)) {
      showDialog({
        title: 'Budget invalide',
        message: "Indiquez le montant que vous avez prévu pour la course avant d'envoyer la demande.",
        variant: 'warning',
      });
      return;
    }
    if (selectedVehicleOptionUnavailable) {
      showDialog({
        title: 'Véhicule requis',
        message: 'Ce type de véhicule ne peut pas prendre le nombre de places demandé. Choisissez un autre type de véhicule.',
        variant: 'warning',
      });
      return;
    }
    if (!canSubmitRequestDetails) {
      showDialog({
        title: 'Budget requis',
        message: "Le tarif automatique n'est pas disponible pour le moment. Fixez votre budget maximum par place, puis envoyez la demande.",
        variant: 'warning',
      });
      return;
    }
    createRequestInFlightRef.current = true;
    const submissionStartedAt = Date.now();

    const showRequestSuccess = (requestId: string) => {
      setSubmissionRecoveryMessage(null);
      setRequestSentWithoutDetail(false);
      setCreatedRequestId(requestId);
    };

    try {
      const departureCoordinates = getLocationCoordinates(departureLocation);
      const arrivalCoordinates = getLocationCoordinates(arrivalLocation);
      const requestNotes = description.trim();
      const createdRequest = await createTripRequest({
        departureLocation: departureAddress,
        departureReference: departureReference.trim() || undefined,
        departureCoordinates,
        arrivalLocation: arrivalAddress,
        arrivalReference: arrivalReference.trim() || undefined,
        arrivalCoordinates,
        departureDateMin: departureWindow.min.toISOString(),
        departureDateMax: departureWindow.max.toISOString(),
        ...(hasSpecifiedNumberOfSeats ? { numberOfSeats } : {}),
        vehicleType: selectedVehicleType,
        ...(parsedBudget !== undefined ? { maxPricePerSeat: parsedBudget } : {}),
        paymentMode: requestPaymentMode,
        description: requestNotes || undefined,
      }).unwrap();
      void trackEvent('trip_request_created', {
        seats: numberOfSeats,
        seat_count_specified: hasSpecifiedNumberOfSeats,
        vehicle_type: selectedVehicleType,
        max_price_per_seat: parsedBudget ?? null,
        payment_mode: requestPaymentMode,
        has_description: Boolean(description.trim()),
        flexibility_minutes: departureWindow.flex,
      });
      showRequestSuccess(String(createdRequest.id));
    } catch (error: any) {
      if (isAmbiguousTransportError(error)) {
        setCreatedRequestId(null);
        setRequestSentWithoutDetail(false);
        setSubmissionRecoveryMessage(
          'Demande envoyée. Récupération du détail en cours…',
        );

        let recoveredRequestId: string | null = null;
        for (const delayMs of MUTATION_RECONCILIATION_DELAYS_MS) {
          if (recoveredRequestId) break;
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          try {
            const requests = await getMyTripRequests(undefined, false).unwrap();
            const normalizedDeparture = departureAddress.trim().toLowerCase();
            const normalizedArrival = arrivalAddress.trim().toLowerCase();
            const matchingRequest = [...requests]
              .filter((request) => {
                const createdAt = new Date(request.createdAt).getTime();
                return (
                  Number.isFinite(createdAt) &&
                  createdAt >= submissionStartedAt - 10_000 &&
                  request.departure.name.trim().toLowerCase() === normalizedDeparture &&
                  request.arrival.name.trim().toLowerCase() === normalizedArrival
                );
              })
              .sort(
                (left, right) =>
                  new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
              )[0];
            recoveredRequestId = matchingRequest?.id ? String(matchingRequest.id) : null;
          } catch {
            // Retry: the POST may be committed before the list endpoint catches up.
          }
        }

        if (recoveredRequestId) {
          showRequestSuccess(recoveredRequestId);
        } else {
          setSubmissionRecoveryMessage(null);
          setRequestSentWithoutDetail(true);
        }
      } else {
        setSubmissionError(
          getApiErrorMessage(
            error,
            'Impossible de créer la demande pour le moment. Vérifiez les informations puis réessayez.',
          ),
        );
      }
    } finally {
      createRequestInFlightRef.current = false;
    }
  };

  const isRequestSuccessVisible = Boolean(
    createdRequestId || submissionRecoveryMessage || requestSentWithoutDetail,
  );

  const isResolvingSentRequest = Boolean(
    submissionRecoveryMessage && !createdRequestId && !requestSentWithoutDetail,
  );

  const requestSuccessDetailLabel = createdRequestId
    ? 'Voir la demande'
    : 'Voir mes demandes';

  const requestSuccessText = isResolvingSentRequest
    ? 'Votre demande est envoyée. Nous retrouvons son détail avant de vous proposer la suite.'
    : createdRequestId
      ? 'Votre demande est prête. Vous pouvez suivre les réponses des conducteurs ou revenir à l’accueil.'
      : 'Votre demande a été envoyée, mais le détail n’a pas pu être ouvert automatiquement. Retrouvez-la dans vos demandes.';

  const goToRequestSuccessDetail = () => {
    if (createdRequestId) {
      router.replace(getTripRequestDetailHref(createdRequestId));
      return;
    }
    router.replace('/my-requests');
  };

  const goHomeAfterRequestSuccess = () => {
    router.replace('/(tabs)');
  };
  return {
    createdRequestId,
    submissionRecoveryMessage,
    submissionError,
    isCreating,
    handleCreateRequest,
    isRequestSuccessVisible,
    isResolvingSentRequest,
    requestSuccessDetailLabel,
    requestSuccessText,
    goToRequestSuccessDetail,
    goHomeAfterRequestSuccess
  };
}
