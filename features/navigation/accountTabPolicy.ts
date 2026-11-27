import type { RootState } from "@/store";
import { isDriverAccount } from '@/utils/accountRole';

// Driver-only actions must not depend on access to the Services tab, shared by all accounts.
export const selectIsDriverAccount = (state: RootState) =>
  isDriverAccount(state.auth?.user);

export function usesEarningsTab(
  user?: { role?: string; driverCategory?: string | null } | null,
) {
  return isDriverAccount(user) && user?.driverCategory === 'transport';
}

export const selectUsesEarningsTab = (state: RootState) =>
  usesEarningsTab(state.auth?.user);

export const getServicesEntryHref = () => "/(tabs)/discover" as const;

export function getTabContentOverlay(platform: string, tabBarHeight: number) {
  // Android's relative tab bar already reserves its own space. iOS overlays the content.
  return platform === "ios" ? Math.max(0, tabBarHeight) : 0;
}
