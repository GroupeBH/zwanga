import { getTabBarMetrics } from '@/constants/navigation';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useAppSelector } from '@/store/hooks';
import { selectUnreadMessagesCount } from '@/store/selectors';
import { getPersonalTripsTabTitle, selectUsesDriverTabLabels } from '@/features/navigation/accountTabPolicy';
import { OngoingTripBanner } from '@/components/OngoingTripBanner';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Animated import removed to fix Android crash with New Architecture

type TabIconName = keyof typeof Ionicons.glyphMap;
const activeTabColor = '#BC4008';
const inactiveTabColor = '#66615B';

export default function TabLayout() {
  const unreadMessagesCount = useAppSelector(selectUnreadMessagesCount);
  const isDriver = useAppSelector(selectUsesDriverTabLabels);
  const insets = useSafeAreaInsets();
  const tabBarMetrics = getTabBarMetrics(insets.bottom);

  const renderTabIcon = ({
    icon,
    color,
    focused,
    size,
    badgeCount,
  }: {
    icon: TabIconName;
    color: string;
    focused: boolean;
    size?: number;
    badgeCount?: number;
  }) => (
    <View style={styles.iconContainer}>
      <View style={styles.iconSurface}>
        <Ionicons
          name={icon}
          size={size || 24}
          color={focused ? activeTabColor : color}
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
        initialRouteName="index"
        backBehavior="initialRoute"
        detachInactiveScreens={Platform.OS !== 'android'}
        screenOptions={{
          tabBarActiveTintColor: activeTabColor,
          tabBarInactiveTintColor: inactiveTabColor,
          headerShown: false,
          lazy: true,
          freezeOnBlur: Platform.OS !== 'android',
          tabBarStyle: [
            styles.tabBar,
            Platform.OS === 'ios' && styles.tabBarIOS,
            tabBarMetrics,
          ],
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarLabelPosition: 'below-icon',
          tabBarAllowFontScaling: false,
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
                icon: 'home-outline',
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
              renderTabIcon({ icon: 'briefcase-outline', color, focused, size })
            ),
          }}
        />
        <Tabs.Screen
          name="trips"
          options={{
            title: getPersonalTripsTabTitle(isDriver),
            tabBarIcon: ({ color, focused, size }) => (
              renderTabIcon({
                icon: 'car-outline',
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
            freezeOnBlur: false,
            tabBarIcon: ({ color, focused, size }) => (
              renderTabIcon({
                icon: 'chatbubble-outline',
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
                icon: 'person-outline',
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
    borderTopColor: '#E7E2DC',
    elevation: 0,
    shadowOpacity: 0,
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
    minHeight: 48,
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
  },
  badgeText: {
    color: Colors.white,
    fontSize: FontSizes.xs - 2,
    fontWeight: FontWeights.bold,
    lineHeight: 14,
    textAlign: 'center',
  },
});
