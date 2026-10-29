import { sharedLocationLabel } from '@/utils/sharedLocationLabel';
import { getRouteLocationCoordinates, storedLocationText } from '@/utils/routeLocationLabels';
import { readableLocation } from '@/utils/readableLocation';

type Point = { latitude: number; longitude: number; title?: string; address?: string } | null;
type Endpoint = { text: string; point: Point };

/** Resolve only placeholder labels, never replace a real manually entered place.
 * Bounded, cached RTK read; release our subscription, not another screen's request.
 */
async function resolveEndpoint({ text, point }: Endpoint, fallback: string): Promise<string> {
  const stored = sharedLocationLabel(point, text);
  if (stored) return stored;
  const coordinate = getRouteLocationCoordinates({ lat: point?.latitude, lng: point?.longitude });
  if (!coordinate) return fallback;
  let release: (() => void) | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const lookup = (async () => {
      const [{ store }, { googleMapsApi }] = await Promise.all([import('@/store'), import('@/store/api/googleMapsApi')]);
      if (expired) return fallback;
      const request = store.dispatch(googleMapsApi.endpoints.getRouteLocationAddress.initiate({ ...coordinate, language: 'fr', region: 'cd' }));
      release = () => request.unsubscribe();
      const result = await request.unwrap();
      return storedLocationText(readableLocation(result).address) || fallback;
    })();
    return await Promise.race([lookup, new Promise<string>(resolve => {
      timer = setTimeout(() => { expired = true; resolve(fallback); }, 3000);
    })]);
  } catch { return fallback; }
  finally { expired = true; clearTimeout(timer); release?.(); }
}

export async function resolveSharedRouteAddresses(departure: Endpoint, arrival: Endpoint) {
  const [departureAddress, arrivalAddress] = await Promise.all([
    resolveEndpoint(departure, 'Point de départ (voir la carte)'),
    resolveEndpoint(arrival, 'Destination (voir la carte)'),
  ]);
  return { departureAddress, arrivalAddress };
}
