import { selectHasAuthenticatedSession } from '@/store/selectors';
import { useAppSelector } from '@/store/hooks';
import { Stack } from 'expo-router';
import { Platform } from 'react-native';

/** Keep private screens out of the navigator until a recoverable session exists. */
export function ProtectedAppStack() {
  const hasSession = useAppSelector(selectHasAuthenticatedSession);
  const isAndroid = Platform.OS === 'android';
  const modalPresentation = isAndroid ? 'card' : 'modal';

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        freezeOnBlur: false,
        ...(isAndroid ? ({ animation: 'none' } as const) : {}),
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="splash" options={{ headerShown: false }} />
      <Stack.Screen name="auth-entry" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="background-location-disclosure" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />

      <Stack.Protected guard={hasSession}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="booking/navigate/[id]" />
        <Stack.Screen name="booking/payment" />
        <Stack.Screen name="bookings" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="driver/[id]" />
        <Stack.Screen name="driver-earnings" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="favorite-locations" />
        <Stack.Screen name="invite" options={{ presentation: modalPresentation }} />
        <Stack.Screen name="my-requests" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="passenger/[id]" />
        <Stack.Screen name="payment-history" />
        <Stack.Screen name="publish" options={{ presentation: 'card' }} />
        <Stack.Screen name="rate/[id]" options={{ presentation: modalPresentation }} />
        <Stack.Screen name="recurring-trips" />
        <Stack.Screen name="referrals" />
        <Stack.Screen name="report" />
        <Stack.Screen name="request/[id]" />
        <Stack.Screen name="request/index" options={{ presentation: 'card' }} />
        <Stack.Screen name="request-create" options={{ presentation: 'card' }} />
        <Stack.Screen name="request-details/[id]" />
        <Stack.Screen name="requests" />
        <Stack.Screen name="search" options={{ presentation: 'card' }} />
        <Stack.Screen name="security" />
        <Stack.Screen name="services/[id]" />
        <Stack.Screen name="services/index" />
        <Stack.Screen name="services/new" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="subscriptions/payment" />
        <Stack.Screen name="support" />
        <Stack.Screen name="trip/[id]" />
        <Stack.Screen name="trip/manage/[id]" />
        <Stack.Screen name="trip/navigate/[id]" />
        <Stack.Screen name="verification" />
        <Stack.Screen name="wallet" />
      </Stack.Protected>
    </Stack>
  );
}
