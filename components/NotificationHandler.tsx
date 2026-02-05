import {
  ensureAndroidChannel,
} from '@/services/pushNotifications';
import { registerBackgroundNotificationTask } from '@/services/backgroundNotificationTask';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { getTripUrl, handleNotificationNavigation } from '@/utils/notificationNavigation';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Linking } from 'react-native';

export function NotificationHandler() {
  const router = useRouter();
  const { data: currentUser } = useGetCurrentUserQuery();

  useEffect(() => {
    // Keep startup independent from Notifee.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    ensureAndroidChannel();

    registerBackgroundNotificationTask().catch((error) => {
      console.warn('Background task registration failed:', error);
    });

    const handleNotificationPress = (data: Record<string, any>) => {
      handleNotificationNavigation(data, router, currentUser);
    };

    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('[NotificationHandler] Notification pressed from background.');
      const data = response.notification.request.content.data || {};
      handleNotificationPress(data);
    });

    const linkingListener = Linking.addEventListener('url', (event) => {
      const { url } = event;
      try {
        const route = url.replace('zwanga://', '');

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

        if (route.startsWith('trip/manage/')) {
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

          const targetUrl = getTripUrl(tripId, linkData, currentUser);

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
          router.push({
            pathname: '/request/[id]',
            params: { id: requestId },
          });
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
      responseListener.remove();
      linkingListener.remove();
    };
  }, [router, currentUser]);

  return null;
}
