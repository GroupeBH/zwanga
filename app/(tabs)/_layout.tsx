import { OngoingTripBanner } from '@/components/OngoingTripBanner';
import { getTabBarMetrics } from '@/constants/navigation';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { selectUsesEarningsTab } from '@/features/navigation/accountTabPolicy';
import { useAppSelector } from '@/store/hooks';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Animated import removed to fix Android crash with New Architecture

type TabIconName = keyof typeof Ionicons.glyphMap;

export default function TabLayout() {
  const usesEarnings = useAppSelector(selectUsesEarningsTab);
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const tabBarMetrics = getTabBarMetrics(insets.bottom, fontScale);

  const renderTabIcon = ({
    activeIcon,
    inactiveIcon,
    color,
    focused,
    size,
    badgeCount,
  }: {
    activeIcon: TabIconName;
    inactiveIcon: TabIconName;
    color: string;
    focused: boolean;
    size?: number;
    badgeCount?: number;
  }) => (
    <View style={styles.iconContainer}>
      <View style={[styles.iconSurface, focused && styles.iconSurfaceActive]}>
        <Ionicons
          name={focused ? activeIcon : inactiveIcon}
          size={(size || 24) - 1}
          color={focused ? Colors.primary : color}
        />
      </View>
      {badgeCount ? (
        <View style={styles.badgeContainer}>
          <View style={styles.badge}>
            <Text maxFontSizeMultiplier={1} style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <Tabs
        initialRouteName="index"
        backBehavior="initialRoute"
        detachInactiveScreens={Platform.OS !== 'android'}
        screenOptions={{
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.gray[600],
          headerShown: false,
          lazy: true,
          freezeOnBlur: Platform.OS !== 'android',
          tabBarStyle: [
            styles.tabBar,
            Platform.OS === 'ios' && styles.tabBarIOS,
            tabBarMetrics,
          ],
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarAllowFontScaling: true,
          tabBarLabel: ({ children, color }) => <Text maxFontSizeMultiplier={1.35}
            style={[styles.tabBarLabel, { color, textAlign: 'center' }]}>{children}</Text>,
          tabBarItemStyle: styles.tabBarItem,
          tabBarHideOnKeyboard: true,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Accueil',
            freezeOnBlur: false,
            tabBarIcon: ({ color, focused, size }) => (
              renderTabIcon({
                activeIcon: 'home',
                inactiveIcon: 'home-outline',
                color,
                focused,
                size,
              })
            ),
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Recherche',
            tabBarIcon: ({ color, focused, size }) => (
              renderTabIcon({
                activeIcon: 'search',
                inactiveIcon: 'search-outline',
                color,
                focused,
                size,
              })
            ),
          }}
        />
        <Tabs.Screen
          name="trips"
          options={{
            title: 'Mes trajets',
            href: usesEarnings ? null : '/(tabs)/trips',
            tabBarIcon: ({ color, focused, size }) => (
              renderTabIcon({
                activeIcon: 'car',
                inactiveIcon: 'car-outline',
                color,
                focused,
                size,
              })
            ),
          }}
        />
        <Tabs.Screen
          name="earnings"
          options={{
            title: 'Revenus',
            href: usesEarnings ? '/(tabs)/earnings' : null,
            tabBarIcon: ({ color, focused, size }) => (
              renderTabIcon({
                activeIcon: 'wallet',
                inactiveIcon: 'wallet-outline',
                color,
                focused,
                size,
              })
            ),
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: 'Services',
            tabBarIcon: ({ color, focused, size }) => (
              renderTabIcon({
                activeIcon: 'briefcase',
                inactiveIcon: 'briefcase-outline',
                color,
                focused,
                size,
              })
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profil',
            tabBarIcon: ({ color, focused, size }) => (
              renderTabIcon({
                activeIcon: 'person',
                inactiveIcon: 'person-outline',
                color,
                focused,
                size,
              })
            ),
          }}
        />
        <Tabs.Screen name="messages" options={{ href: null }} />
      </Tabs>
      <OngoingTripBanner />
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
    elevation: 14,
    shadowColor: Colors.black,
    shadowOffset: {
      width: 0,
      height: -6,
    },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  tabBarIOS: {
    position: 'absolute',
  },
  tabBarLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    marginTop: 2,
  },
  tabBarItem: {
    paddingVertical: 0,
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 42,
  },
  iconSurface: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSurfaceActive: {
    backgroundColor: Colors.primary + '14',
  },
  badgeContainer: {
    position: 'absolute',
    top: -2,
    right: -2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    backgroundColor: Colors.danger,
    borderRadius: BorderRadius.full,
    minWidth: 18,
    height: 18,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    ...Platform.select({
      ios: {
        shadowColor: Colors.danger,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  badgeText: {
    color: Colors.white,
    fontSize: FontSizes.xs - 2,
    fontWeight: FontWeights.bold,
    lineHeight: 14,
    textAlign: 'center',
  },
});
