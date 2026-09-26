import React from "react";
import { Platform } from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useAppSelector } from "@/store/hooks";
import {
  getTabContentOverlay,
  selectUsesServicesTab,
} from "@/features/navigation/accountTabPolicy";
import ServicesScreen from "@/features/pro-services/ServicesScreen";
import SearchScreen from "../search";

// One stable route keeps five tabs and avoids colliding with the public /search URL.
export default function DiscoverTab() {
  const driver = useAppSelector(selectUsesServicesTab);
  const tabBarHeight = useBottomTabBarHeight();
  const bottomOverlay = getTabContentOverlay(Platform.OS, tabBarHeight);
  return driver ? (
    <ServicesScreen embedded bottomOverlay={bottomOverlay} />
  ) : (
    <SearchScreen embedded bottomOverlay={bottomOverlay} />
  );
}
