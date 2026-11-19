import { useGetFavoriteLocationsQuery } from '@/store/api/userApi';
import { useGetMyDriverSettlementQuery } from '@/store/api/driverSettlementsApi';
import { useDisplayReadsEnabled } from '@/hooks/useDisplayReads';

/** Prime the same bounded caches used by Home's shortcuts/earnings. A first tap
 * on Maison must not mistake an unrequested favorites cache for an empty list. */
export function useHomeSupportingData({ active, isDriver }: { active: boolean; isDriver: boolean }) {
  const enabled = useDisplayReadsEnabled(active);
  const favorites = useGetFavoriteLocationsQuery(undefined, {
    skip: !enabled || isDriver, refetchOnMountOrArgChange: 60,
  });
  const earnings = useGetMyDriverSettlementQuery(undefined, {
    skip: !enabled || !isDriver, refetchOnMountOrArgChange: 60,
  });
  const selected = isDriver ? earnings : favorites;
  return selected.isSuccess || selected.isError;
}
