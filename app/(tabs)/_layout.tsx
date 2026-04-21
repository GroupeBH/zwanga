import { getTabBarMetrics } from '@/constants/navigation';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useAppSelector } from '@/store/hooks';
import { selectUnreadMessagesCount } from '@/store/selectors';
import { OngoingTripBanner } from '@/components/OngoingTripBanner';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Animated import removed to fix Android crash with New Architecture

type TabIconName = keyof typeof Ionicons.glyphMap;

export default function TabLayout() {
  const unreadMessagesCount = useAppSelector(selectUnreadMessagesCount);
  const insets = useSafeAreaInsets();
  const tabBarMetrics = getTabBarMetrics(insets.bottom);

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
            <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <Tabs
        detachInactiveScreens={Platform.OS !== 'android'}
        screenOptions={{
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.gray[600],
          headerShown: false,
          freezeOnBlur: Platform.OS !== 'android',
          tabBarStyle: [
            styles.tabBar,
            Platform.OS === 'ios' ? styles.tabBarIOS : styles.tabBarAndroid,
            tabBarMetrics,
          ],
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarItemStyle: styles.tabBarItem,
          tabBarHideOnKeyboard: true,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Accueil',
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
          name="search"
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
          name="messages"
          options={{
            title: 'Messages',
            tabBarIcon: ({ color, focused, size }) => (
              renderTabIcon({
                activeIcon: 'chatbubbles',
                inactiveIcon: 'chatbubbles-outline',
                color,
                focused,
                size,
                badgeCount: unreadMessagesCount,
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
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
  },
  tabBarAndroid: {
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
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
