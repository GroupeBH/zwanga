import * as Location from 'expo-location';
import { readableLocation } from '@/utils/readableLocation';

type Coordinate = {
  latitude: number;
  longitude: number;
};

function formatAddress(address?: Location.LocationGeocodedAddress) {
  if (!address) {
    return '';
  }

  const street = [address.streetNumber, address.street].filter(Boolean).join(' ').trim();

  return [address.name, street, address.district, address.city || address.subregion, address.region]
    .map((value) => value?.toString().trim())
    .filter(Boolean)
    .join(', ');
}

export async function buildCurrentLocationSelection(coordinate: Coordinate) {
  let address: Location.LocationGeocodedAddress | undefined;

  try {
    [address] = await Location.reverseGeocodeAsync(coordinate);
  } catch (error) {
    console.warn("Impossible de resoudre l'adresse de la position actuelle", error);
  }

  return {
    ...readableLocation({
      name: address?.name,
      formattedAddress: formatAddress(address),
      addressComponents: [
        { longName: address?.streetNumber ?? '', types: ['street_number'] },
        { longName: address?.street ?? '', types: ['route'] },
        { longName: address?.district ?? '', types: ['neighborhood'] },
        { longName: address?.city || address?.subregion || '', types: ['locality'] },
        { longName: address?.region ?? '', types: ['administrative_area_level_1'] },
      ],
      fallbackTitle: 'Ma position',
    }),
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  };
}
