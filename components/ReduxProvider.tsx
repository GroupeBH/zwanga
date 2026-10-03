import { DialogProvider } from '@/components/ui/DialogProvider';
import { RideOutboxCoordinator } from '@/components/RideOutboxCoordinator';
import { ActiveRideLocationCoordinator } from '@/components/ActiveRideLocationCoordinator';
import { AccountActivityCoordinator } from '@/components/AccountActivityCoordinator';
import { StoreReviewCoordinator } from '@/components/StoreReviewCoordinator';
import { DriverPaymentNoticeCoordinator } from '@/components/DriverPaymentNoticeCoordinator';
import { PassengerArrivalPaymentCoordinator } from '@/components/PassengerArrivalPaymentCoordinator';
import { Colors } from '@/constants/styles';
import { IdentityProvider } from '@/contexts/IdentityContext';
import { TutorialProvider } from '@/contexts/TutorialContext';
import { store } from '@/store';
import { initializeAuth } from '@/store/slices/authSlice';
import { useAuthBootstrap } from '@/hooks/auth/useAuthBootstrap';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Provider } from 'react-redux';
import { AuthGuard } from './AuthGuard';
import { NotificationHandler } from './NotificationHandler';
import { ReferralAttributionHandler } from './ReferralAttributionHandler';

interface ReduxProviderProps {
  children: React.ReactNode;
}

const restoreSession = () => store.dispatch(initializeAuth()).unwrap();

export function ReduxProvider({ children }: ReduxProviderProps) {
  const { status, retry } = useAuthBootstrap(restoreSession);

  return (
    <Provider store={store}>
      <View style={styles.appContainer}>
        {status !== 'ready' ? (
          // Ecran de chargement pendant la restauration du state
          <View style={styles.loadingContainer}>
            <Text style={styles.brand}>ZWANGA</Text>
            {status === 'error' ? <>
              <Text style={styles.error} accessibilityRole="alert">
                Votre session n’a pas pu être restaurée. Déverrouillez votre téléphone, puis réessayez.
              </Text>
              <TouchableOpacity style={styles.retry} accessibilityRole="button" onPress={retry}>
                <Text style={styles.retryText}>Réessayer</Text>
              </TouchableOpacity>
            </> : <ActivityIndicator size="large" color={Colors.white} accessibilityLabel="Restauration de votre session" />}
          </View>
        ) : (
          <View style={styles.appContent}>
            <DialogProvider>
              <ReferralAttributionHandler />
              <AccountActivityCoordinator />
              <ActiveRideLocationCoordinator />
              <RideOutboxCoordinator />
              <NotificationHandler />
              <AuthGuard>
                <PassengerArrivalPaymentCoordinator />
                <DriverPaymentNoticeCoordinator />
                <StoreReviewCoordinator />
                <TutorialProvider>
                  <IdentityProvider>{children}</IdentityProvider>
                </TutorialProvider>
              </AuthGuard>
            </DialogProvider>
          </View>
        )}
      </View>
    </Provider>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    padding: 24,
    gap: 24,
  },
  brand: { fontSize: 30, fontWeight: '800', color: Colors.white },
  error: { maxWidth: 360, fontSize: 16, lineHeight: 24, textAlign: 'center', color: Colors.white },
  retry: { minHeight: 48, paddingHorizontal: 28, justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.white },
  retryText: { fontSize: 16, fontWeight: '700', color: Colors.gray[900] },
  appContent: {
    flex: 1,
  },
});
