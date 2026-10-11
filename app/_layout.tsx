import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { LayoutAnimationConfig } from '@/utils/reanimated';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { configureFontScaling } from '@/utils/configureFontScaling';
import { initializeDiagnostics } from '@/services/diagnostics';

import { AnalyticsTracker } from '@/components/AnalyticsTracker';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { ReduxProvider } from '@/components/ReduxProvider';
import { ProtectedAppStack } from '@/components/ProtectedAppStack';
// Importer les handlers de fond pour qu'ils soient enregistres au demarrage
import '@/services/backgroundNotificationTask';
import '@/services/driverBackgroundLocationTask';
import '@/services/passengerBackgroundLocationTask';
import '@/services/notifeeBackgroundHandler';
import '@/services/notifeeForegroundService';

configureFontScaling();
initializeDiagnostics();

export default function RootLayout() {
  const isAndroid = Platform.OS === 'android';

  const appTree = (
    <ReduxProvider>
      <ThemeProvider value={DefaultTheme}>
        <View style={styles.appRoot}>
          <AnalyticsTracker />
          <ProtectedAppStack />
          <StatusBar style="dark" />
        </View>
      </ThemeProvider>
    </ReduxProvider>
  );

  return (
    <GestureHandlerRootView style={styles.appRoot}>
      <AppErrorBoundary>
        <SafeAreaProvider>
          {isAndroid ? (
            <LayoutAnimationConfig skipEntering skipExiting>
              {appTree}
            </LayoutAnimationConfig>
          ) : (
            appTree
          )}
        </SafeAreaProvider>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
});
