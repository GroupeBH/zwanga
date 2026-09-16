import { useMemo } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { useGetRouteLocationAddressQuery } from '@/store/api/googleMapsApi';
import { readableLocation } from '@/utils/readableLocation';
import { getRouteLocationCoordinates, getRouteStopLabel, type RouteLocationSource } from '@/utils/routeLocationLabels';

/** Resolve only missing names, using the saved endpoint (never the user's GPS). */
export function useRouteStopLabel(location: RouteLocationSource | null | undefined, fallbackTitle: string, active: boolean) {
  const { name, address, reference } = location ?? {};
  const stored = useMemo(() => getRouteStopLabel({ name, address, reference }, fallbackTitle),
    [name, address, reference, fallbackTitle]);
  const point = stored.isResolved ? null : getRouteLocationCoordinates(location);
  const lat = point?.lat;
  const lng = point?.lng;
  const args = useMemo(() => lat === undefined || lng === undefined ? skipToken
    : { lat, lng, language: 'fr', region: 'cd' }, [lat, lng]);
  const { currentData, isFetching } = useGetRouteLocationAddressQuery(args, {
    skip: !active,
    refetchOnMountOrArgChange: false,
    refetchOnFocus: false,
    refetchOnReconnect: true,
    pollingInterval: 0,
  });

  return useMemo(() => {
    if (stored.isResolved) return stored;
    // `currentData`, not `data`: an older point's response must never rename this one.
    if (args !== skipToken && currentData) {
      const resolved = readableLocation(currentData);
      const label = getRouteStopLabel({ name: resolved.title, address: resolved.address, reference }, fallbackTitle);
      if (label.isResolved) return label;
    }
    const loading = args !== skipToken && active && isFetching;
    const title = loading ? 'Recherche de l’adresse…' : 'Nom du lieu indisponible';
    return {
      ...stored,
      title,
      address: title,
      context: loading ? '' : args === skipToken ? 'Aucune adresse renseignée.' : 'La position du lieu est conservée.',
    };
  }, [stored, args, currentData, reference, fallbackTitle, active, isFetching]);
}
