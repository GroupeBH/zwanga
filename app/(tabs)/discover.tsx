import React from "react";
import { Platform } from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { getTabContentOverlay } from "@/features/navigation/accountTabPolicy";
import ServicesScreen from "@/features/pro-services/ServicesScreen";

// Keep the existing route: Services is now available to both account roles.
export default function DiscoverTab() {
  const tabBarHeight = useBottomTabBarHeight();
  const bottomOverlay = getTabContentOverlay(Platform.OS, tabBarHeight);
  return <ServicesScreen embedded bottomOverlay={bottomOverlay} />;
}
