import * as Location from 'expo-location';

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
    title: address?.name || address?.street || 'Ma position',
    address:
      formatAddress(address) ||
      `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  };
}
