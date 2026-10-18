import { useMemo } from 'react';
import type { RouteLocationSource } from '@/utils/routeLocationLabels';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useRouteStopLabel } from './useRouteStopLabel';

/** Display-only enrichment, shared by trip/request details and their maps. */
export function useRouteLocationLabels(
  route?: { departure?: RouteLocationSource | null; arrival?: RouteLocationSource | null } | null,
  enabled = true,
) {
  const active = useScreenIsActive();
  const departure = useRouteStopLabel(route?.departure, 'Point de départ', enabled && active);
  const arrival = useRouteStopLabel(route?.arrival, 'Destination', enabled && active);
  return useMemo(() => ({ departure, arrival }), [departure, arrival]);
}
