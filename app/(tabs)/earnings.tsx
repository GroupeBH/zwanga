import React from 'react';
import { Platform } from 'react-native';
import { Redirect } from 'expo-router';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useAppSelector } from '@/store/hooks';
import { getTabContentOverlay, selectUsesEarningsTab } from '@/features/navigation/accountTabPolicy';
import DriverEarningsScreen from '../driver-earnings';

export default function EarningsTab() {
  const usesEarnings = useAppSelector(selectUsesEarningsTab);
  const tabBarHeight = useBottomTabBarHeight();
  // Hiding the tab alone would leave its mounted content active after a category change.
  if (!usesEarnings) return <Redirect href="/(tabs)/trips" />;
  return <DriverEarningsScreen embedded bottomOverlay={getTabContentOverlay(Platform.OS, tabBarHeight)} />;
}
