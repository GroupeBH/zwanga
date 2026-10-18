import { type AddressSectionStep } from '@/components/AddressSectionSlider';
import { useDialog } from '@/components/ui/DialogProvider';
import { recoverRequest, type RequestAttempt } from '@/features/trip-request/recoverRequest';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { getLocationCoordinates, RequestFormStep } from '@/features/trip-request/requestFormModel';
import { trackEvent } from '@/services/analytics';
import {
  useCreateTripRequestMutation,
  useLazyGetMyTripRequestsQuery
} from '@/store/api/tripRequestApi';
import { getApiErrorMessage, isAmbiguousTransportError, isPassengerKycRequiredError, isExtraSeatsIdentityError } from '@/utils/errorHelpers';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { getPassengerSeatValidation, getPassengerVehicleSeatCapacity } from '@/utils/passengerSeats';
import { getTripRequestDetailHref } from '@/utils/requestNavigation';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useRequestDraft } from './useRequestDraft';
import type { useRequestSchedule } from './useRequestSchedule';

type Props = Pick<ReturnType<typeof useRequestDraft>, 'arrivalLocation' | 'departureLocation' | 'timePreset' | 'hasChosenDepartureTime' | 'setDepartureDateMin' | 'setFlexibilityMinutes' | 'description' | 'departureReference' | 'arrivalReference' | 'hasSpecifiedNumberOfSeats' | 'numberOfSeats' | 'selectedVehicleType' | 'requestPaymentMode'> & {
  departureAddress: string; arrivalAddress: string; hasDepartureAddress: boolean; hasArrivalAddress: boolean;
  canSubmitRequestDetails: boolean; budgetValue: number; selectedVehicleOptionUnavailable: boolean;
  getCurrentDepartureWindow: ReturnType<typeof useRequestSchedule>['getCurrentDepartureWindow'];
  setRequestFormStep: React.Dispatch<React.SetStateAction<RequestFormStep>>;
  setAddressSectionStep: React.Dispatch<React.SetStateAction<AddressSectionStep>>;
};

export function useRequestSubmission({
  arrivalLocation,
  departureLocation,
  timePreset,
  hasChosenDepartureTime,
  setDepartureDateMin,
  setFlexibilityMinutes,
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
  budgetValue,
  selectedVehicleOptionUnavailable,
  getCurrentDepartureWindow,
  setRequestFormStep,
  setAddressSectionStep
}: Props) {
  const router = useRouter();
  const { showDialog } = useDialog();
  const { isIdentityVerified, checkIdentity, refreshKycStatus } = useIdentityCheck();
  const createRequestInFlightRef = useRef(false);
  const pendingAttempt = useRef<RequestAttempt | null>(null);
  const confirmed = useRef(false);
  const leaving = useRef(false);
  const lifetime = useRef({ mounted: true, version: getTokenSessionVersion() });
  useEffect(() => {
    lifetime.current.mounted = true;
    return () => { lifetime.current.mounted = false; };
  }, []);
  const current = () => lifetime.current.mounted && !leaving.current && lifetime.current.version === getTokenSessionVersion();

  const [createTripRequest, { isLoading: isCreating }] = useCreateTripRequestMutation();

  const [getMyTripRequests] = useLazyGetMyTripRequestsQuery();

  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);

  const [submissionRecoveryMessage, setSubmissionRecoveryMessage] = useState<string | null>(null);

  const [requestSentWithoutDetail, setRequestSentWithoutDetail] = useState(false);

  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const verifyPendingRequest = async () => {
    const attempt = pendingAttempt.current;
    if (!attempt || !current()) return;
    setRequestSentWithoutDetail(false);
    setSubmissionRecoveryMessage('Vérification de l’envoi…');
    const id = await recoverRequest(attempt, () => getMyTripRequests(undefined, false).unwrap(), current);
    if (!current()) return;
    setSubmissionRecoveryMessage(null);
    if (id) { confirmed.current = true; pendingAttempt.current = null; setCreatedRequestId(id); }
    else setRequestSentWithoutDetail(true);
  };

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
    if (!hasChosenDepartureTime) {
      showDialog({ title: 'Départ souhaité', message: 'Choisissez votre date et votre heure de départ.', variant: 'warning' });
      return false;
    }
    if (
      !Number.isFinite(departureWindow.min.getTime()) || !Number.isFinite(departureWindow.max.getTime()) ||
      departureWindow.min.getTime() >= departureWindow.max.getTime() ||
      departureWindow.min.getTime() <= Date.now()
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
    if (!current() || createRequestInFlightRef.current || isCreating || confirmed.current) return;
    if (pendingAttempt.current) {
      createRequestInFlightRef.current = true;
      try { await verifyPendingRequest(); } finally { createRequestInFlightRef.current = false; }
      return;
    }
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
    const seatError = getPassengerSeatValidation(
      hasSpecifiedNumberOfSeats ? numberOfSeats : 1,
      isIdentityVerified,
      getPassengerVehicleSeatCapacity(selectedVehicleType),
    );
    if (seatError) {
      if (seatError.reason === 'identity') checkIdentity('extra_seats');
      else showDialog({ title: 'Nombre de places invalide', message: seatError.message, variant: 'warning' });
      return;
    }
    // Snapshot the amount actually displayed, including an untouched recommendation.
    const confirmedPricePerSeat = budgetValue;
    if (!Number.isFinite(confirmedPricePerSeat) || confirmedPricePerSeat <= 0) {
      showDialog({
        title: 'Budget invalide',
        message: "Indiquez le montant que vous avez prévu pour la course avant d'envoyer la commande.",
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
        message: "Le tarif automatique n'est pas disponible pour le moment. Fixez votre budget maximum par place, puis envoyez la commande.",
        variant: 'warning',
      });
      return;
    }
    createRequestInFlightRef.current = true;
    const submissionStartedAt = Date.now();
    pendingAttempt.current = { startedAt: submissionStartedAt,
      departure: departureAddress.trim().toLowerCase(), arrival: arrivalAddress.trim().toLowerCase(),
      departureDateMin: departureWindow.min.toISOString(), departureDateMax: departureWindow.max.toISOString(),
      seats: hasSpecifiedNumberOfSeats ? numberOfSeats : 1, price: confirmedPricePerSeat, vehicleType: selectedVehicleType };

    const showRequestSuccess = (requestId: string) => {
      confirmed.current = true;
      pendingAttempt.current = null;
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
        // Send the passenger's intent, not a possibly missing/stale feature-status read.
        // The server owns activation; scheduled orders retain their normal acceptance flow.
        immediateDispatch: timePreset === 'now',
        ...(hasSpecifiedNumberOfSeats ? { numberOfSeats } : {}),
        vehicleType: selectedVehicleType,
        maxPricePerSeat: confirmedPricePerSeat,
        paymentMode: requestPaymentMode,
        description: requestNotes || undefined,
      }).unwrap();
      void trackEvent('trip_request_created', {
        seats: numberOfSeats,
        seat_count_specified: hasSpecifiedNumberOfSeats,
        vehicle_type: selectedVehicleType,
        max_price_per_seat: confirmedPricePerSeat,
        payment_mode: requestPaymentMode,
        has_description: Boolean(description.trim()),
        flexibility_minutes: departureWindow.flex,
      });
      if (!current()) return;
      if (createdRequest?.id) showRequestSuccess(String(createdRequest.id));
      else await verifyPendingRequest();
    } catch (error: any) {
      if (!current()) return;
      if (isPassengerKycRequiredError(error)) {
        pendingAttempt.current = null;
        refreshKycStatus();
        checkIdentity(isExtraSeatsIdentityError(error) ? 'extra_seats' : 'request', { force: true });
        setSubmissionError(getApiErrorMessage(error, 'Vérifiez votre identité avant de continuer.'));
      } else if (isAmbiguousTransportError(error)) {
        await verifyPendingRequest();
      } else {
        pendingAttempt.current = null;
        setSubmissionError(
          getApiErrorMessage(
            error,
            'Impossible de créer la commande pour le moment. Vérifiez les informations puis réessayez.',
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
    ? 'Voir la commande'
    : 'Vérifier à nouveau';

  const requestSuccessText = isResolvingSentRequest
    ? 'Nous vérifions si votre commande a bien été enregistrée.'
    : createdRequestId
      ? 'Votre commande est prête. Vous pouvez suivre les réponses des conducteurs ou revenir à l’accueil.'
      : 'La connexion a été interrompue. Vérifiez l’envoi ou consultez vos commandes avant de recommencer.';

  const goToRequestSuccessDetail = () => {
    if (!current()) return;
    if (createdRequestId) {
      leaving.current = true;
      router.replace(getTripRequestDetailHref(createdRequestId));
      return;
    }
    void handleCreateRequest();
  };

  const goHomeAfterRequestSuccess = () => {
    if (!current() || createRequestInFlightRef.current) return;
    leaving.current = true;
    router.replace(createdRequestId ? '/(tabs)' : '/my-requests');
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
