import { useDialog } from '@/components/ui/DialogProvider';
import { useGetMyTripRequestsQuery, useReleaseOverdueDriverMutation } from '@/store/api/tripRequestApi';
import type { TripRequest } from '@/types';
import { extractTripRequestId } from '@/utils/notificationNavigation';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { getTripRequestDetailHref } from '@/utils/requestNavigation';
import { useCallback } from 'react';
import type { User } from '@/types';
import type { Router } from 'expo-router';

interface Params {
  activeOverdueAccountIdRef: React.RefObject<string | null>;
  activeOverdueRequestIdRef: React.RefObject<string | null>;
  releaseOverdueDriver: ReturnType<typeof useReleaseOverdueDriverMutation>[0];
  router: Router;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  currentUserRef: React.RefObject<User | undefined>;
  shownOverdueRequestsRef: React.RefObject<Set<string>>;
  refetchMyTripRequests: ReturnType<typeof useGetMyTripRequestsQuery>['refetch'];
}

export function useOverdueRequestNotification({
  activeOverdueAccountIdRef,
  activeOverdueRequestIdRef,
  releaseOverdueDriver,
  router,
  showDialog,
  currentUserRef,
  shownOverdueRequestsRef,
  refetchMyTripRequests,
}: Params) {
  const isOverdueRequestForAccount = useCallback(
    (request: TripRequest, accountId: string, expectedRequestId?: string) => {
      const latestPickupAt = Date.parse(request.departureDateMax);

      return (
        (!expectedRequestId || request.id === expectedRequestId) &&
        request.passengerId === accountId &&
        request.status === 'driver_selected' &&
        Boolean(request.selectedDriverId) &&
        Boolean(request.driverPickupOverdueNotifiedAt) &&
        Number.isFinite(latestPickupAt) &&
        latestPickupAt <= Date.now()
      );
    },
    [],
  );

  const releaseDriverAndOpenRequest = useCallback(
    async (requestId: string, editSchedule: boolean) => {
      activeOverdueAccountIdRef.current = null;
      activeOverdueRequestIdRef.current = null;
      try {
        await releaseOverdueDriver(requestId).unwrap();
        router.push(
          getTripRequestDetailHref(requestId, {
            editSchedule,
          }),
        );
      } catch (error) {
        showDialog({
          title: 'Changement de conducteur impossible',
          message: getApiErrorMessage(
            error,
            'Impossible de rendre la demande disponible pour le moment. Réessayez dans un instant.',
          ),
          variant: 'danger',
          icon: 'alert-circle',
        });
      }
    },
    [releaseOverdueDriver, router, showDialog],
  );

  const presentPassengerOverdueModal = useCallback(
    (request: TripRequest, fallbackBody?: string | null): boolean => {
      const accountId = currentUserRef.current?.id;
      if (!accountId || !isOverdueRequestForAccount(request, accountId)) {
        return false;
      }

      const notificationKey = `${accountId}:${request.id}:${request.driverPickupOverdueNotifiedAt}`;
      if (shownOverdueRequestsRef.current.has(notificationKey)) {
        return true;
      }
      shownOverdueRequestsRef.current.add(notificationKey);
      activeOverdueAccountIdRef.current = accountId;
      activeOverdueRequestIdRef.current = request.id;

      showDialog({
        title: 'Prise en charge en retard',
        message:
          fallbackBody ||
          "L'heure maximale souhaitée est dépassée et le conducteur ne vous a pas encore pris en charge. Vous pouvez attendre ou choisir un autre conducteur. Nous vous conseillons aussi d'ajuster la date et l'heure de la demande.",
        variant: 'warning',
        icon: 'time-outline',
        dismissible: false,
        actions: [
          {
            label: 'Attendre',
            variant: 'ghost',
            onPress: () => {
              activeOverdueAccountIdRef.current = null;
              activeOverdueRequestIdRef.current = null;
            },
          },
          {
            label: 'Autre conducteur',
            variant: 'secondary',
            onPress: () => releaseDriverAndOpenRequest(request.id, false),
          },
          {
            label: 'Modifier date/heure',
            variant: 'primary',
            onPress: () => releaseDriverAndOpenRequest(request.id, true),
          },
        ],
      });
      return true;
    },
    [isOverdueRequestForAccount, releaseDriverAndOpenRequest, showDialog],
  );

  const handlePassengerOverdueNotification = useCallback(
    async (data: Record<string, any>, fallbackBody?: string | null): Promise<boolean> => {
      if (data.type !== 'trip_request_driver_overdue') {
        return false;
      }

      const requestId = extractTripRequestId(data);
      const accountId = currentUserRef.current?.id;
      const recipientUserId =
        typeof data.recipientUserId === 'string' ? data.recipientUserId.trim() : '';

      // Le token FCM ne prouve ni l'identité du compte ouvert ni la propriété
      // de la demande. Un ancien token peut encore recevoir un push après un
      // changement de compte : dans ce cas, ne jamais ouvrir la modale.
      if (!requestId || !accountId || (recipientUserId && recipientUserId !== accountId)) {
        return true;
      }

      let accountRequests: TripRequest[];
      try {
        accountRequests = await refetchMyTripRequests().unwrap();
      } catch (error) {
        console.warn(
          '[NotificationHandler] Impossible de confirmer la demande en retard:',
          error,
        );
        return true;
      }

      const request = accountRequests.find((candidate) =>
        isOverdueRequestForAccount(candidate, accountId, requestId),
      );

      if (request) {
        presentPassengerOverdueModal(request, fallbackBody);
      }

      // Cette notification est consommée même si elle est obsolète ou destinée
      // à un autre compte, afin d'empêcher toute navigation fondée sur le token.
      return true;
    },
    [isOverdueRequestForAccount, presentPassengerOverdueModal, refetchMyTripRequests],
  );

  return {
    isOverdueRequestForAccount,
    presentPassengerOverdueModal,
    handlePassengerOverdueNotification,
  };
}
