import React from "react";
import { Platform } from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { getTabContentOverlay } from "@/features/navigation/accountTabPolicy";
import ServicesScreen from "@/features/pro-services/ServicesScreen";

// Services are shared by passengers and drivers; passenger search lives in trips.
export default function DiscoverTab() {
  const tabBarHeight = useBottomTabBarHeight();
  const bottomOverlay = getTabContentOverlay(Platform.OS, tabBarHeight);
  return <ServicesScreen embedded bottomOverlay={bottomOverlay} />;
}
