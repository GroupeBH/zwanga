import { useRef } from 'react';
import { useAppSelector } from '@/store/hooks';
import { selectUserCoordinates } from '@/store/selectors';
import { normalizeTripMapCoordinate, type MapCoordinate } from '@/utils/tripCoordinates';

/** Read an already-known position, never start GPS or prompt for permission.
 * Keep this origin stable while paging so movement cannot invalidate cursors. */
export function useSearchSortOrigin(userId: string | undefined, active: boolean) {
  const snapshot = useRef<{ userId?: string; coordinate: MapCoordinate | null }>({ userId, coordinate: null });
  if (snapshot.current.userId !== userId) snapshot.current = { userId, coordinate: null };
  const known = useAppSelector(state => active && !snapshot.current.coordinate ? selectUserCoordinates(state) : null);
  if (active && known && !snapshot.current.coordinate) {
    snapshot.current.coordinate = normalizeTripMapCoordinate(known.latitude, known.longitude);
  }
  return snapshot.current.coordinate;
}
