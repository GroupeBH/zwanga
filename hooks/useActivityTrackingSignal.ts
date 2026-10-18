import { accountActivityApi } from '@/store/api/accountActivityApi';
import { useAppSelector } from '@/store/hooks';

/** Cache-only consumer: reaching the pre-arm window must work even when booking data is unchanged. */
export function useActivityTrackingSignal() {
  const userId = useAppSelector(state => state.auth.user?.id);
  return accountActivityApi.endpoints.getAccountActivity.useQueryState(userId ?? '', {
    selectFromResult: result => ({ bookingId: result.data?.passengerTrackingBookingId ?? null }),
  }).bookingId;
}
