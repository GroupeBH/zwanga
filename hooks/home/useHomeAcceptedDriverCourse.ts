import { useEffect, useMemo, useState } from 'react';
import type { Trip } from '@/types';
import { acceptedRequestEntryKey, selectAcceptedRequestTrip } from '@/features/navigation/acceptedRequestEntry';
import { acceptedCoursePoints, resolveHomeAcceptedDriverCourse } from '@/features/home/homeAcceptedDriverCourse';
import { homePickupRegion } from '@/features/home/homeRequestPickup';
import { displayReadOptions, useDisplayReadData, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import { useGetTripRequestByIdQuery } from '@/store/api/tripRequestApi';
import { getTokenSessionVersion } from '@/services/tokenSession';

/** Reuses shared activity discovery and the existing participant detail caches. No list polling or navigation side effect. */
export function useHomeAcceptedDriverCourse({ trips = [], userId, isDriver, occupied, active }: {
  trips?: readonly Trip[]; userId?: string; isDriver: boolean; occupied: boolean; active: boolean;
}) {
  const session = getTokenSessionVersion();
  const [rejected, setRejected] = useState<{ userId?: string; session?: number; keys: Set<string> }>({ keys: new Set() });
  const candidate = useMemo(() => isDriver && userId && !occupied
    ? selectAcceptedRequestTrip(trips, userId, rejected.userId === userId && rejected.session === session ? rejected.keys : new Set()) : undefined,
  [trips, userId, isDriver, occupied, rejected, session]);
  const enabled = useDisplayReadsEnabled(active && !!candidate && !!userId);
  const tripQuery = useGetTripByIdQuery(candidate?.id ?? '', displayReadOptions(enabled, 30_000));
  const requestQuery = useGetTripRequestByIdQuery(candidate?.tripRequestId ?? '', displayReadOptions(enabled, 30_000));
  const scope = `${userId}:${candidate?.id}:${candidate?.tripRequestId}`;
  // currentData never represents the previous argument; the scoped fallback survives offline/blur only.
  const trip = useDisplayReadData(scope, tripQuery.currentData);
  const request = useDisplayReadData(scope, requestQuery.currentData);
  const denied = (query: typeof tripQuery | typeof requestQuery, id?: string | null) => query.originalArgs === id
    && query.isError && query.error && 'status' in query.error && [401, 403, 404, 410].includes(Number(query.error.status));
  const unavailable = denied(tripQuery, candidate?.id) || denied(requestQuery, candidate?.tripRequestId);
  const acceptedDriverCourse = useMemo(() => unavailable ? null : resolveHomeAcceptedDriverCourse(candidate, userId, request, trip),
    [unavailable, candidate, userId, request, trip]);
  const rejectedKey = candidate && !acceptedDriverCourse ? acceptedRequestEntryKey(candidate) : null;
  useEffect(() => {
    if (!rejectedKey) return;
    // A stale cancelled/reassigned first item must not hide the next accepted course.
    setRejected(previous => ({ userId, session,
      keys: new Set([...(previous.userId === userId && previous.session === session ? previous.keys : []), rejectedKey]) }));
  }, [rejectedKey, userId, session]);
  const acceptedCourseRegion = useMemo(() => {
    const { departure, arrival } = acceptedCoursePoints(acceptedDriverCourse);
    return homePickupRegion([departure, arrival]);
  }, [acceptedDriverCourse]);
  return { acceptedDriverCourse, acceptedCourseRegion };
}
