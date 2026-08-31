import { useDialog } from '@/components/ui/DialogProvider';
import { ensureAndroidChannel } from '@/services/pushNotifications';
import { registerBackgroundNotificationTask } from '@/services/backgroundNotificationTask';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import { getTripUrl, handleNotificationNavigation } from '@/utils/notificationNavigation';
import { getTripRequestDetailHref } from '@/utils/requestNavigation';
import * as Notifications from 'expo-notifications';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { InteractionManager, Linking } from 'react-native';

export function NotificationHandler() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const pathname = usePathname();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const { data: currentUser } = useGetCurrentUserQuery(undefined, {
    skip: !isAuthenticated,
  });
  const currentUserRef = useRef(currentUser);
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

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

    const handleNotificationPress = (
      data: Record<string, any>,
      fallbackBody?: string | null,
    ) => {
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
      presentDriverFinancialModal(data, content.body);
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('[NotificationHandler] Notification pressed from background.');
      const data = response.notification.request.content.data || {};
      handleNotificationPress(data, response.notification.request.content.body);
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
  }, [router, showDialog]);

  return null;
}
