import type { RootState } from "@/store";
import { isDriverAccount } from '@/utils/accountRole';

// Account capability, not the role played in the current trip or KYC status.
export function usesServicesTab(
  user?: { role?: string; isDriver?: boolean } | null,
) {
  return isDriverAccount(user);
}

// A primitive selector avoids redrawing the navigator on GPS, wallet or profile-photo updates.
export const selectUsesServicesTab = (state: RootState) =>
  usesServicesTab(state.auth?.user);

export const getServicesEntryHref = (driver: boolean) =>
  driver ? ("/(tabs)/discover" as const) : ("/services" as const);

export function getTabContentOverlay(platform: string, tabBarHeight: number) {
  // Android's relative tab bar already reserves its own space. iOS overlays the content.
  return platform === "ios" ? Math.max(0, tabBarHeight) : 0;
}
