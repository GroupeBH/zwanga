import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { ReduxProvider } from '@/components/ReduxProvider';
import { useColorScheme } from '@/hooks/use-color-scheme';
// Importer les handlers de fond pour qu'ils soient enregistres au demarrage
import '@/services/backgroundNotificationTask';
import '@/services/notifeeBackgroundHandler';
import '@/services/notifeeForegroundService';

export const unstable_settings = {
  initialRouteName: 'splash',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics} collapsable={false}>
      <View style={styles.appRoot} collapsable={false}>
        <ReduxProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="splash" options={{ headerShown: false }} />
              <Stack.Screen name="auth-entry" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="background-location-disclosure" options={{ headerShown: false }} />
              <Stack.Screen name="auth" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="publish" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="search" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="settings" options={{ headerShown: false }} />
              <Stack.Screen name="support" options={{ headerShown: false }} />
              <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="trip/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="verification" options={{ headerShown: false }} />
              <Stack.Screen name="rate/[id]" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="invite" options={{ headerShown: false, presentation: 'modal' }} />
            </Stack>
            <StatusBar style="auto" />
          </ThemeProvider>
        </ReduxProvider>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
});
