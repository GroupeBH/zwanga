export type AddressComponent = { longName: string; types: readonly string[] };
export type ReadableLocation = { title: string; address: string };

export const UNKNOWN_LOCATION_ADDRESS = 'Position exacte enregistrée sur la carte';

// Google short/global Plus Codes, including padded global codes. Keep road numbers,
// acronyms and actual names (RN1, UPN, Avenue du 24 Novembre, etc.).
const PLUS_CODE = /(^|[\s,;])(?:[23456789CFGHJMPQRVWX0]{2}){1,4}\+[23456789CFGHJMPQRVWX]{0,7}(?=$|[\s,;])/gi;
const UNNAMED = /^(?:unnamed (?:road|street)|(?:route|rue|avenue) sans nom|sans nom)$/i;
const compactCode = (value: string) => value.length >= 7 && value.length <= 12 &&
  /^(?:[A-Z]{1,3}\d{1,3}){2,}[A-Z0-9]*$/.test(value);

/** Display only: never use this to rewrite a search query, place ID or GPS point. */
export function cleanLocationText(value?: string | null): string {
  const parts = (value ?? '').replace(PLUS_CODE, '$1').split(/[,;]/).map(part => {
    const words = part.trim().split(/\s+/);
    // Some historical labels contain a compact identifier without the '+'.
    while (words.length && compactCode(words[0])) words.shift();
    return words.join(' ');
  }).filter(part => part && !UNNAMED.test(part));
  return uniqueParts(parts).join(', ');
}

function uniqueParts(parts: string[]): string[] {
  const seen = new Set<string>();
  return parts.filter(part => {
    const key = part.toLocaleLowerCase('fr');
    if (!part || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const firstName = (value: string) => {
  const first = value.split(',')[0].trim();
  return /^\d+[a-z]?$/i.test(first) ? '' : first;
};

// Address fragments only: don't mistake "Église de l'Avenue" for a street.
const STREET_FRAGMENT = /^(?:(?:n[°o]\.?\s*)?\d+[a-z]?(?:\s*(?:bis|ter))?\s+)?(?:(?:avenue|boulevard|rue|route|chaussée|chaussee|chemin|allée|allee|impasse)\s+|(?:av|bd|bld|blvd|rte)(?:\.\s*|\s+))\S/i;
const AREA_PREFIX = /^(?:q(?:\s*\/\s*|\.\s*)|quartier\b|commune\b)/i;
const labelKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const streetKey = (value: string) => labelKey(value)
  .replace(/^(?:n[°o]\.?\s*)?\d+[a-z]?(?:\s*(?:bis|ter))?\s+/, '')
  .replace(/^av(?:\.\s*|\s+)/, 'avenue ')
  .replace(/^(?:bd|bld|blvd)(?:\.\s*|\s+)/, 'boulevard ')
  .replace(/^rte(?:\.\s*|\s+)/, 'route ');

/** Prefer a supplied landmark, then a street (structured or formatted), then an area.
 * Provider names that merely repeat a neighborhood aren't treated as landmarks.
 * No nearby landmark is guessed: coordinates remain the authoritative location.
 * Component order in provider responses is not significant.
 */
export function readableLocation({ name, formattedAddress, addressComponents = [], fallbackTitle = 'Point sélectionné' }: {
  name?: string | null;
  formattedAddress?: string | null;
  addressComponents?: readonly AddressComponent[];
  fallbackTitle?: string;
}): ReadableLocation {
  const component = (...types: string[]) => {
    for (const type of types) {
      const match = addressComponents.find(value => value.types.includes(type) &&
        !value.types.includes('plus_code') && cleanLocationText(value.longName));
      if (match) return cleanLocationText(match.longName);
    }
    return '';
  };
  const cleanedName = cleanLocationText(name);
  const named = firstName(cleanedName) ? cleanedName : '';
  const areaNames = addressComponents.filter(value => value.types.some(type =>
    ['neighborhood', 'locality', 'postal_town', 'country', 'sublocality'].includes(type) ||
    type.startsWith('sublocality_level_') || type.startsWith('administrative_area_level_')))
    .map(value => labelKey(cleanLocationText(value.longName)));
  const isArea = (value: string) => AREA_PREFIX.test(value) || areaNames.includes(labelKey(value));
  const place = firstName(component('point_of_interest', 'establishment', 'premise', 'airport', 'park', 'natural_feature'));
  const landmark = isArea(place) ? '' : place;
  const formatted = cleanLocationText(formattedAddress);
  const parts = formatted ? formatted.split(', ') : [];
  const formattedStreet = parts.find(part => STREET_FRAGMENT.test(part)) || '';
  const route = component('route');
  const streetNumber = component('street_number');
  const street = route
    ? !streetNumber && streetKey(formattedStreet) === streetKey(route) ? formattedStreet
      : [streetNumber, route].filter(Boolean).join(' ')
    : formattedStreet;
  const district = component('neighborhood', 'sublocality_level_5', 'sublocality_level_4',
    'sublocality_level_3', 'sublocality_level_2', 'sublocality_level_1', 'sublocality', 'administrative_area_level_3');
  const city = component('locality', 'postal_town');
  const province = component('administrative_area_level_1');
  const country = component('country');
  const firstAddress = firstName(formatted);
  const title = (isArea(named) ? '' : named) || landmark || street || named || district ||
    (firstAddress !== country ? firstAddress : '') || city || province;
  // The second line also starts with the street; keep the neighborhood as context.
  const addressParts = parts.length ? parts : [landmark, street, district, city, province, country];
  const streetIndex = street ? addressParts.findIndex(part => streetKey(part) === streetKey(street)) : -1;
  if (street && streetIndex >= 0) addressParts.unshift(...addressParts.splice(streetIndex, 1));
  else if (street) addressParts.unshift(street);
  const address = uniqueParts(addressParts).join(', ');
  return {
    title: title || firstName(cleanLocationText(fallbackTitle)) || 'Point sélectionné',
    address: address || title || UNKNOWN_LOCATION_ADDRESS,
  };
}
