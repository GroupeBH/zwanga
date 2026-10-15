import type { RootState } from "@/store";
import { isDriverAccount } from '@/utils/accountRole';

// Account capability, not the role played in the current trip or KYC status.
export function usesDriverTabLabels(
  user?: { role?: string; isDriver?: boolean } | null,
) {
  return isDriverAccount(user);
}

// A primitive selector avoids redrawing the navigator on GPS, wallet or profile-photo updates.
export const selectUsesDriverTabLabels = (state: RootState) =>
  usesDriverTabLabels(state.auth?.user);

// Keep the existing standalone Services access from Profile as well as the tab.
export const getServicesEntryHref = () => "/services" as const;

export const getPersonalTripsTabTitle = (driver: boolean) =>
  driver ? 'Mes trajets' : 'Trajets';

export function getTabContentOverlay(platform: string, tabBarHeight: number) {
  // Android's relative tab bar already reserves its own space. iOS overlays the content.
  return platform === "ios" ? Math.max(0, tabBarHeight) : 0;
}
