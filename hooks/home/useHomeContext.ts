import { useDialog } from '@/components/ui/DialogProvider';
import { getCurrentTripInfo } from '@/services/ongoingTripNotification';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectAvailableTrips, selectLocationRadius } from '@/store/selectors';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
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
  const isScreenActive = isFocused && isAppActive;

  const dispatch = useAppDispatch();

  const insets = useSafeAreaInsets();

  const { width, height } = useWindowDimensions();

  const storedTrips = useAppSelector(selectAvailableTrips);

  const locationRadiusKm = useAppSelector(selectLocationRadius);

  const trackedTripInfo = getCurrentTripInfo();

  const { data: currentUser } = useGetCurrentUserQuery();

  const isDriver = useMemo(() => {
    const role = currentUser?.role;
    return role === 'driver' || role === 'both' || Boolean(currentUser?.isDriver);
  }, [currentUser?.isDriver, currentUser?.role]);
  return {
    isDriver,
    isFocused,
    isScreenActive,
    currentUser,
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
