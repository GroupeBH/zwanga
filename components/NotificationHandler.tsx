import { useDialog } from '@/components/ui/DialogProvider';
import { ensureAndroidChannel } from '@/services/pushNotifications';
import { registerBackgroundNotificationTask } from '@/services/backgroundNotificationTask';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import {
  useGetMyTripRequestsQuery,
  useReleaseOverdueDriverMutation,
} from '@/store/api/tripRequestApi';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import type { TripRequest } from '@/types';
import {
  extractTripRequestId,
  getTripUrl,
  handleNotificationNavigation,
} from '@/utils/notificationNavigation';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { getTripRequestDetailHref } from '@/utils/requestNavigation';
import * as Notifications from 'expo-notifications';
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { InteractionManager, Linking } from 'react-native';

export function NotificationHandler() {
  const router = useRouter();
  const { showDialog, hideDialog } = useDialog();
  const pathname = usePathname();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const { data: currentUser } = useGetCurrentUserQuery(undefined, {
    skip: !isAuthenticated,
  });
  const {
    data: myTripRequests = [],
    refetch: refetchMyTripRequests,
  } = useGetMyTripRequestsQuery(undefined, {
    skip: !isAuthenticated,
    pollingInterval: isAuthenticated ? 60_000 : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const [releaseOverdueDriver] = useReleaseOverdueDriverMutation();
  const currentUserRef = useRef(currentUser);
  const myTripRequestsRef = useRef(myTripRequests);
  const pathnameRef = useRef(pathname);
  const shownOverdueRequestsRef = useRef(new Set<string>());
  const activeOverdueAccountIdRef = useRef<string | null>(null);

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

      let accountRequests = myTripRequestsRef.current;
      try {
        accountRequests = await refetchMyTripRequests().unwrap();
      } catch (error) {
        console.warn(
          '[NotificationHandler] Impossible de confirmer la demande en retard:',
          error,
        );
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

  useEffect(() => {
    const nextUser = isAuthenticated ? currentUser : undefined;
    const nextAccountId = nextUser?.id ?? null;
    const previousAccountId = currentUserRef.current?.id ?? null;

    if (previousAccountId !== nextAccountId) {
      shownOverdueRequestsRef.current.clear();
      if (
        activeOverdueAccountIdRef.current &&
        activeOverdueAccountIdRef.current !== nextAccountId
      ) {
        activeOverdueAccountIdRef.current = null;
        hideDialog();
      }
    }

    currentUserRef.current = nextUser;
  }, [currentUser, hideDialog, isAuthenticated]);

  useEffect(() => {
    myTripRequestsRef.current = myTripRequests;
  }, [myTripRequests]);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const accountId = currentUserRef.current?.id;
    if (!accountId) {
      return;
    }

    const overdueRequest = myTripRequests.find(
      (request) => isOverdueRequestForAccount(request, accountId),
    );

    if (!overdueRequest?.driverPickupOverdueNotifiedAt) {
      return;
    }

    presentPassengerOverdueModal(overdueRequest);
  }, [isOverdueRequestForAccount, myTripRequests, presentPassengerOverdueModal]);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const type = notification.request.content.data?.type;
        const tripRevenueModalAlreadyOwnsForeground =
          type === 'driver_trip_revenue' &&
          pathnameRef.current.startsWith('/trip/navigate/');

        return {
          shouldShowAlert: !tripRevenueModalAlreadyOwnsForeground,
          shouldPlaySound: !tripRevenueModalAlreadyOwnsForeground,
          shouldSetBadge: !tripRevenueModalAlreadyOwnsForeground,
          shouldShowBanner: !tripRevenueModalAlreadyOwnsForeground,
          shouldShowList: !tripRevenueModalAlreadyOwnsForeground,
        };
      },
    });

    const startupTask = InteractionManager.runAfterInteractions(() => {
      void ensureAndroidChannel();
      registerBackgroundNotificationTask().catch((error) => {
        console.warn('Background task registration failed:', error);
      });
    });

    const formatAmount = (value: unknown, currency: string) => {
      const amount = Number(value);
      const safeAmount = Number.isFinite(amount) ? amount : 0;
      return `${safeAmount.toLocaleString('fr-FR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })} ${currency}`;
    };

    const presentDriverFinancialModal = (
      data: Record<string, any>,
      fallbackBody?: string | null,
      allowOnNavigationScreen = false,
    ): boolean => {
      const type = data.type;

      if (type === 'driver_trip_revenue') {
        // L'écran de navigation possède son propre modal, alimenté par Socket.IO
        // avec un repli REST. Ne pas ouvrir deux modals pour la même clôture.
        if (
          !allowOnNavigationScreen &&
          pathnameRef.current.startsWith('/trip/navigate/')
        ) {
          return false;
        }

        const currency = typeof data.currency === 'string' ? data.currency : 'CDF';
        const total = Number(data.totalExpectedAmount) || 0;
        const confirmed = Number(data.confirmedAmount) || 0;
        const cash = Number(data.cashToCollectAmount) || 0;
        const electronicPending = Number(data.electronicPendingAmount) || 0;
        const details: string[] = [];

        if (total > 0) {
          details.push(`Total du trajet : ${formatAmount(total, currency)}`);
        }
        if (confirmed > 0) {
          details.push(`Acquis dans vos gains : ${formatAmount(confirmed, currency)}`);
        }
        if (cash > 0) {
          details.push(`À encaisser en liquide : ${formatAmount(cash, currency)}`);
        }
        if (electronicPending > 0) {
          details.push(
            `Paiement électronique attendu : ${formatAmount(electronicPending, currency)}`,
          );
        }

        showDialog({
          title: 'Votre gain du trajet',
          message:
            details.length > 0
              ? details.join('\n')
              : fallbackBody || 'Aucun montant à encaisser pour ce trajet.',
          variant: 'success',
          icon: 'wallet',
          dismissible: true,
          actions: [
            {
              label: 'Voir mes gains',
              variant: 'primary',
              onPress: () => router.push('/driver-earnings'),
            },
            { label: 'Fermer', variant: 'secondary' },
          ],
        });
        return true;
      }

      if (type === 'driver_booking_earning_confirmed') {
        const currency = typeof data.currency === 'string' ? data.currency : 'CDF';
        showDialog({
          title: 'Gain maintenant disponible',
          message: `${formatAmount(data.amount, currency)} sont disponibles et peuvent être retirés depuis votre espace gains.`,
          variant: 'success',
          icon: 'wallet',
          actions: [
            {
              label: 'Voir mes gains',
              variant: 'primary',
              onPress: () => router.push('/driver-earnings'),
            },
            { label: 'Fermer', variant: 'secondary' },
          ],
        });
        return true;
      }

      return false;
    };

    const handleNotificationPress = async (
      data: Record<string, any>,
      fallbackBody?: string | null,
    ) => {
      if (await handlePassengerOverdueNotification(data, fallbackBody)) {
        return;
      }

      // Un appui depuis l'arrière-plan doit d'abord restituer le détail
      // financier. Le bouton du modal laisse ensuite le conducteur choisir
      // d'ouvrir ses gains, au lieu de perdre l'information dans une redirection.
      if (presentDriverFinancialModal(data, fallbackBody, true)) {
        return;
      }
      handleNotificationNavigation(data, router, currentUserRef.current);
    };

    const foregroundListener = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      const data = (content.data || {}) as Record<string, any>;
      if (data.type === 'trip_request_driver_overdue') {
        void handlePassengerOverdueNotification(data, content.body);
      } else {
        presentDriverFinancialModal(data, content.body);
      }
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('[NotificationHandler] Notification pressed from background.');
      const data = response.notification.request.content.data || {};
      void handleNotificationPress(data, response.notification.request.content.body);
    });

    const linkingListener = Linking.addEventListener('url', (event) => {
      const { url } = event;
      try {
        const route = url.replace('zwanga://', '').replace(/^\/+/, '');

        const parseQueryParams = (queryString: string): Record<string, string> => {
          const params: Record<string, string> = {};
          if (queryString) {
            queryString.split('&').forEach((param) => {
              const [key, value] = param.split('=');
              if (key && value) {
                params[key] = decodeURIComponent(value);
              }
            });
          }
          return params;
        };

        if (route.startsWith('subscriptions/payment')) {
          const parts = route.split('?');
          const params = parseQueryParams(parts[1] || '');
          InteractionManager.runAfterInteractions(() => {
            router.replace({
              pathname: '/subscriptions/payment',
              params: {
                paymentStatus: params.status || 'returned',
              },
            } as any);
          });
        } else if (route.startsWith('booking/payment')) {
          const parts = route.split('?');
          const params = parseQueryParams(parts[1] || '');
          InteractionManager.runAfterInteractions(() => {
            router.replace({
              pathname: '/booking/payment',
              params: {
                bookingId: params.bookingId,
                status: params.status || 'returned',
              },
            } as any);
          });
        } else if (route.startsWith('trip/manage/')) {
          const tripId = route.replace('trip/manage/', '').split('?')[0];
          router.push({
            pathname: '/trip/manage/[id]',
            params: { id: tripId },
          });
        } else if (route.startsWith('trip/')) {
          const parts = route.replace('trip/', '').split('?');
          const tripId = parts[0];
          const params = parseQueryParams(parts[1] || '');

          const linkData = {
            tripId,
            driverId: params.driverId,
            ...params,
          };

          const targetUrl = getTripUrl(tripId, linkData, currentUserRef.current);

          if (targetUrl.includes('/trip/manage/')) {
            router.push({
              pathname: '/trip/manage/[id]',
              params: { id: tripId, ...params },
            });
          } else {
            router.push({
              pathname: '/trip/[id]',
              params: { id: tripId, ...params },
            });
          }
        } else if (route.startsWith('chat/')) {
          const conversationId = route.replace('chat/', '').split('?')[0];
          router.push({
            pathname: '/chat/[id]',
            params: { id: conversationId },
          });
        } else if (route.startsWith('request/')) {
          const requestId = route.replace('request/', '').split('?')[0];
          router.push(getTripRequestDetailHref(requestId));
        } else if (route.startsWith('bookings')) {
          router.push('/bookings');
        } else if (route.startsWith('rate/')) {
          const tripId = route.replace('rate/', '').split('?')[0];
          router.push({
            pathname: '/rate/[id]',
            params: { id: tripId },
          });
        }
      } catch (error) {
        console.warn('Deep link handling failed:', error);
      }
    });

    return () => {
      startupTask.cancel();
      foregroundListener.remove();
      responseListener.remove();
      linkingListener.remove();
    };
  }, [handlePassengerOverdueNotification, router, showDialog]);

  return null;
}
