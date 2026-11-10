import type { MapLocationSelection } from '@/features/location-picker/locationPickerModel';
import { cleanLocationText } from '@/utils/readableLocation';

type Location = Pick<MapLocationSelection, 'placeTypes' | 'addressComponents'> | null;
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[’'\-]/g, ' ').replace(/\s+/g, ' ').trim();
// Fallback for saved addresses and older API responses without Google place types.
const areas = new Set(('Bandalungwa|Barumbu|Bumbu|Gombe|Kalamu|Kasa Vubu|Kasavubu|Kimbanseke|Kinshasa|'
  + 'Kintambo|Kisenso|Kinsenso|Lemba|Limete|Lingwala|Makala|Maluku|Masina|Matete|Mont Ngafula|'
  + 'Montngafula|Ndjili|N djili|Nsele|N sele|Ngaba|Ngaliema|Ngiri Ngiri|Ngiringiri|Selembao|'
  + 'Lubumbashi|Goma|Bukavu|Matadi|Kisangani|Kananga|Mbuji Mayi|Kolwezi|Likasi|'
  + 'RDC|RD Congo|Congo|Congo Kinshasa|République démocratique du Congo|Democratic Republic of the Congo')
  .split('|').map(normalize));
const areaType = /^(?:locality|sublocality(?:_level_\d+)?|administrative_area_level_\d+|neighborhood|country|postal_code)$/;
const street = /\b(?:avenue|av\.?|boulevard|bd\.?|bld|blvd|rue|route|rte\.?|chauss[eé]e|chemin|all[eé]e|impasse|street|road)\s+\S/i;
const genericPoint = /^(?:ma position|votre position|position actuelle|localisation actuelle|point (?:de d[eé]part|d.arriv[eé]e|s[eé]lectionn[eé])|destination|position exacte enregistr[eé]e)/i;

/** Validate the label actually shared with the driver, not coordinates alone. */
export function requiresRequestReference(address: string | null | undefined, location?: Location): boolean {
  const text = cleanLocationText(address || '');
  if (!text) return Boolean(address?.trim());
  if (street.test(text) || /^\d+\s+\S/.test(text)) return false;
  if (genericPoint.test(text)) return true;
  const names = new Set(areas);
  for (const part of location?.addressComponents ?? []) {
    if (part.types.some(type => areaType.test(type))) names.add(normalize(part.longName));
  }
  const fragments = text.split(/[,;·]/).map(normalize).filter(Boolean);
  if (fragments.length && fragments.every(part => names.has(part) || /^(?:commune|quartier|ville|province|territoire)\s+(?:de\s+|du\s+|d\s+)?\S/.test(part))) return true;
  return Boolean(location?.placeTypes?.some(type => areaType.test(type)) &&
    !location.placeTypes.some(type => ['street_address', 'route', 'premise', 'establishment', 'point_of_interest'].includes(type)));
}

export function missingRequestReference(address: string, reference: string, location?: Location) {
  return requiresRequestReference(address, location) && !reference?.trim();
}

export const requestReferenceMessage = (target: 'departure' | 'arrival') =>
  `Ajoutez un repère ${target === 'departure' ? 'au départ' : 'à l’arrivée'} : bâtiment, commerce ou avenue.`;
