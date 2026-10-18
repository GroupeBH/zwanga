import { useDialog } from '@/components/ui/DialogProvider';
import { getCurrentTripInfo } from '@/services/ongoingTripNotification';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectAvailableTrips, selectLocationRadius } from '@/store/selectors';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { isDriverAccount } from '@/utils/accountRole';
import { isHomeProfileReady } from '@/features/home/homeRolePolicy';
import { useAppEntryPending } from '@/features/navigation/appEntryContext';
import { useCallback } from 'react';
import {
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


export function useHomeContext() {
  const router = useRouter();

  const { showDialog } = useDialog();

  // Route visibility must not toggle when a native permission dialog pauses the app.
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const entryPending = useAppEntryPending();
  const isScreenActive = isFocused && isAppActive && !entryPending;

  const dispatch = useAppDispatch();

  const insets = useSafeAreaInsets();

  const { width, height } = useWindowDimensions();

  const storedTrips = useAppSelector(selectAvailableTrips);

  const locationRadiusKm = useAppSelector(selectLocationRadius);

  const trackedTripInfo = getCurrentTripInfo();

  const sessionUserId = useAppSelector(state =>
    state.auth.tokenPayload?.sub ?? state.auth.tokenPayload?.userId ?? state.auth.user?.id);
  const profile = useGetCurrentUserQuery();
  const currentUser = profile.data?.id === sessionUserId ? profile.data : undefined;
  const isHomeRoleReady = isHomeProfileReady(currentUser);
  const homeRoleFetching = Boolean(profile.isFetching);
  const homeRoleError = !isHomeRoleReady && !homeRoleFetching &&
    (profile.isError || profile.isSuccess);
  const refetchProfile = profile.refetch;
  const canRetryRole = isScreenActive && !profile.isUninitialized && !homeRoleFetching;
  const retryHomeRole = useCallback(async () => {
    if (!canRetryRole) return;
    // RTK shares an in-flight profile read; a failure stays in the inline loader.
    try {
      await refetchProfile();
    } catch {
      // The query state owns the error; never open another modal for this retry.
    }
  }, [canRetryRole, refetchProfile]);

  const isDriver = isDriverAccount(currentUser);
  return {
    entryPending,
    isDriver,
    isFocused,
    isScreenActive,
    currentUser,
    isHomeRoleReady,
    homeRoleError: Boolean(homeRoleError),
    homeRoleFetching,
    retryHomeRole,
    trackedTripInfo,
    locationRadiusKm,
    storedTrips,
    dispatch,
    showDialog,
    router,
    width,
    insets,
    height,
  };
}
