import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useAppSelector } from '@/store/hooks';
import { selectUnreadMessagesCount } from '@/store/selectors';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

export default function TabLayout() {
  const unreadMessagesCount = useAppSelector(selectUnreadMessagesCount);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.gray[600],
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          Platform.OS === 'ios' ? styles.tabBarIOS : styles.tabBarAndroid,
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
            <View style={styles.iconContainer}>
              <Ionicons 
                name={focused ? 'home' : 'home-outline'} 
                size={size || 24} 
                color={color} 
              />
              {focused && <View style={styles.activeIndicator} />}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trajets',
          tabBarIcon: ({ color, focused, size }) => (
            <View style={styles.iconContainer}>
              <Ionicons 
                name={focused ? 'car' : 'car-outline'} 
                size={size || 24} 
                color={color} 
              />
              {focused && <View style={styles.activeIndicator} />}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Carte',
          tabBarIcon: ({ color, focused, size }) => (
            <View style={styles.iconContainer}>
              <Ionicons
                name={focused ? 'map' : 'map-outline'}
                size={size || 24}
                color={color}
              />
              {focused && <View style={styles.activeIndicator} />}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, focused, size }) => (
            <View style={styles.iconContainer}>
              <Ionicons 
                name={focused ? 'chatbubbles' : 'chatbubbles-outline'} 
                size={size || 24} 
                color={color} 
              />
              {unreadMessagesCount > 0 && (
                <Animated.View 
                  entering={FadeIn.duration(200).springify()}
                  style={styles.badgeContainer}
                >
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                    </Text>
                  </View>
                </Animated.View>
              )}
              {focused && <View style={styles.activeIndicator} />}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, focused, size }) => (
            <View style={styles.iconContainer}>
              <Ionicons 
                name={focused ? 'person' : 'person-outline'} 
                size={size || 24} 
                color={color} 
              />
              {focused && <View style={styles.activeIndicator} />}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.white,
    borderTopWidth: 0,
    elevation: 8,
    shadowColor: Colors.black,
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    paddingTop: Spacing.sm,
  },
  tabBarIOS: {
    position: 'absolute',
    height: 88,
    paddingBottom: 28,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  tabBarAndroid: {
    height: 95,
    paddingBottom: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  tabBarLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    marginTop: Spacing.xs,
  },
  tabBarItem: {
    paddingVertical: Spacing.xs,
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -2,
    width: 4,
    height: 4,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
  },
  badgeContainer: {
    position: 'absolute',
    top: -4,
    right: -8,
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
