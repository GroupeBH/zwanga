import { useCallback } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { userApi } from '@/store/api/userApi';
import { vehicleApi } from '@/store/api/vehicleApi';
import { referralApi } from '@/store/api/referralApi';
import { driverSettlementsApi } from '@/store/api/driverSettlementsApi';

const READ_ONCE = { subscribe: false, forceRefetch: true } as const;

/** Explicit refreshes may finish after blur (identity SDK, vehicle mutation).
 * Unlike a skipped hook's refetch(), these RTK Query reads remain valid without
 * keeping a hidden screen subscribed. Do not abort business actions on blur.
 */
export function useProfileRefresh() {
  const dispatch = useAppDispatch();
  const refetchProfile = useCallback(() =>
    dispatch(userApi.endpoints.getProfileSummary.initiate(undefined, READ_ONCE)), [dispatch]);
  const refetchKycStatus = useCallback(() =>
    dispatch(userApi.endpoints.getKycStatus.initiate(undefined, READ_ONCE)), [dispatch]);
  const refetchVehicles = useCallback(() =>
    dispatch(vehicleApi.endpoints.getVehicles.initiate(undefined, READ_ONCE)), [dispatch]);
  const refetchReferralSummary = useCallback(() =>
    dispatch(referralApi.endpoints.getMyReferralSummary.initiate(undefined, READ_ONCE)), [dispatch]);
  const refetchDriverSettlement = useCallback(() =>
    dispatch(driverSettlementsApi.endpoints.getMyDriverSettlement.initiate(undefined, READ_ONCE)), [dispatch]);

  return { refetchProfile, refetchKycStatus, refetchVehicles, refetchReferralSummary, refetchDriverSettlement };
}
