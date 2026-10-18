import { cleanLocationText, readableLocation, UNKNOWN_LOCATION_ADDRESS } from './readableLocation';

export type RouteLocationSource = {
  name?: string | null; address?: string | null; reference?: string | null;
  lat?: number | null; lng?: number | null; hasCoordinates?: boolean;
};
export type RouteStopLabel = {
  title: string; address: string; context: string; reference: string;
  isResolved: boolean;
};
export type RouteLocationLabels = { departure: RouteStopLabel; arrival: RouteStopLabel };

// Older offline selections may have stored UI placeholders instead of an address.
const PLACEHOLDERS = new Set([
  'Point sélectionné', 'Position sélectionnée', 'Ma position', 'Lieu sélectionné',
  'Point de départ', 'Départ', 'Destination', 'Arrivée', 'Point du trajet',
  'Adresse non disponible', 'Nom du lieu indisponible', UNKNOWN_LOCATION_ADDRESS,
].map(value => value.toLocaleLowerCase('fr')));
const storedText = (value?: string | null) => {
  const cleaned = cleanLocationText(value);
  return PLACEHOLDERS.has(cleaned.toLocaleLowerCase('fr')) ? '' : cleaned;
};

/** Display adapter for stored trips/requests. Never write these derived labels back
 * into the API cache or an editing form: coordinates and original values stay intact.
 */
export function getRouteStopLabel(location: RouteLocationSource | null | undefined, fallbackTitle = 'Point du trajet'): RouteStopLabel {
  const name = storedText(location?.name);
  const address = storedText(location?.address);
  // The API mappers put the complete address in BOTH fields. It isn't a custom name.
  const label = readableLocation({
    name: name.toLocaleLowerCase('fr') === address.toLocaleLowerCase('fr') ? undefined : name,
    formattedAddress: address || name,
    fallbackTitle,
  });
  const readableAddress = label.address === UNKNOWN_LOCATION_ADDRESS ? 'Adresse non disponible' : label.address;
  const context = readableAddress === label.title ? ''
    : readableAddress.startsWith(`${label.title}, `) ? readableAddress.slice(label.title.length + 2) : readableAddress;
  // A reference is a user-entered instruction, not a geocoder name (e.g. gate code).
  const reference = location?.reference?.trim() || '';
  return {
    isResolved: label.address !== UNKNOWN_LOCATION_ADDRESS,
    title: label.title,
    address: readableAddress,
    context,
    reference: reference === label.title || reference === readableAddress ? '' : reference,
  };
}

/** Never present a fallback such as "Destination" as an actual place name. */
export function getRouteTitle({ departure, arrival }: RouteLocationLabels): string {
  if (departure.isResolved && arrival.isResolved) return `${departure.title} vers ${arrival.title}`;
  if (departure.isResolved) return `Départ : ${departure.title}`;
  if (arrival.isResolved) return `Destination : ${arrival.title}`;
  return 'Itinéraire du trajet';
}

export function getRouteLocationCoordinates(location?: RouteLocationSource | null): { lat: number; lng: number } | null {
  const { lat, lng, hasCoordinates } = location ?? {};
  if (hasCoordinates === false || typeof lat !== 'number' || typeof lng !== 'number' ||
    !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 ||
    (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

export function getRouteLocationLabels(route?: { departure?: RouteLocationSource | null; arrival?: RouteLocationSource | null } | null): RouteLocationLabels {
  return {
    departure: getRouteStopLabel(route?.departure, 'Point de départ'),
    arrival: getRouteStopLabel(route?.arrival, 'Destination'),
  };
}
