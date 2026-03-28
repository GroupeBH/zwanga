import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LayoutAnimationConfig, ReduceMotion, ReducedMotionConfig } from 'react-native-reanimated';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
  const isAndroid = Platform.OS === 'android';

  const appTree = (
    <ReduxProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={styles.appRoot}>
          <Stack
            screenOptions={{
              headerShown: false,
              ...(isAndroid ? ({ animation: 'none' } as const) : {}),
            }}
          >
            <Stack.Screen name="splash" options={{ headerShown: false }} />
            <Stack.Screen name="auth-entry" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen name="background-location-disclosure" options={{ headerShown: false }} />
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="publish" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="request-create" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="request/index" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="request/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="request-details/[id]" options={{ headerShown: false }} />
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
        </View>
      </ThemeProvider>
    </ReduxProvider>
  );

  return (
    <SafeAreaProvider>
      <ReducedMotionConfig mode={isAndroid ? ReduceMotion.Always : ReduceMotion.System} />
      {isAndroid ? (
        <LayoutAnimationConfig skipEntering skipExiting>
          {appTree}
        </LayoutAnimationConfig>
      ) : (
        appTree
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
});
