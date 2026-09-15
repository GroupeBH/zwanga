

/* =====================================================
   CONFIG
===================================================== */

// Proximité par défaut : Kinshasa
export const DEFAULT_PROXIMITY = {
  latitude: -4.325,
  longitude: 15.322,
};

// Bounding box de la République Démocratique du Congo
// Format: [longitude ouest, latitude sud, longitude est, latitude nord]
export const RDC_BBOX = '12.0,-13.5,31.3,5.4';

// Code ISO du pays pour la RDC
export const RDC_COUNTRY_CODE = 'cd';

// Configuration des villes principales de la RDC pour améliorer la précision
export const MAJOR_CITIES = {
  kinshasa: {
    name: 'Kinshasa',
    center: { latitude: -4.325, longitude: 15.322 },
    bbox: { minLng: 15.0, maxLng: 15.5, minLat: -4.6, maxLat: -4.2 },
    aliases: ['kinshasa', 'kin', 'kinsasa'],
  },
  lubumbashi: {
    name: 'Lubumbashi',
    center: { latitude: -11.664, longitude: 27.482 },
    bbox: { minLng: 27.3, maxLng: 27.7, minLat: -11.8, maxLat: -11.5 },
    aliases: ['lubumbashi', 'lubum', 'elizabethville'],
  },
  goma: {
    name: 'Goma',
    center: { latitude: -1.679, longitude: 29.228 },
    bbox: { minLng: 29.1, maxLng: 29.3, minLat: -1.75, maxLat: -1.6 },
    aliases: ['goma'],
  },
  bukavu: {
    name: 'Bukavu',
    center: { latitude: -2.490, longitude: 28.860 },
    bbox: { minLng: 28.8, maxLng: 28.95, minLat: -2.55, maxLat: -2.45 },
    aliases: ['bukavu', 'costermansville'],
  },
  matadi: {
    name: 'Matadi',
    center: { latitude: -5.817, longitude: 13.450 },
    bbox: { minLng: 13.3, maxLng: 13.6, minLat: -5.9, maxLat: -5.7 },
    aliases: ['matadi'],
  },
  kolwezi: {
    name: 'Kolwezi',
    center: { latitude: -10.716, longitude: 25.467 },
    bbox: { minLng: 25.3, maxLng: 25.6, minLat: -10.8, maxLat: -10.6 },
    aliases: ['kolwezi', 'kolwesi'],
  },
} as const;

// Fonction pour détecter si une suggestion appartient à une ville majeure
export function detectCity(suggestion: MapboxSearchSuggestion): string | null {
  const locality = suggestion.context?.locality?.toLowerCase() || '';
  const region = suggestion.context?.region?.toLowerCase() || '';
  const name = suggestion.name?.toLowerCase() || '';
  const fullAddress = suggestion.fullAddress?.toLowerCase() || '';
  
  const searchText = `${locality} ${region} ${name} ${fullAddress}`;
  
  for (const [cityKey, cityConfig] of Object.entries(MAJOR_CITIES)) {
    // Vérifier les alias et le nom de la ville
    if (cityConfig.aliases.some(alias => searchText.includes(alias))) {
      return cityKey;
    }
    
    // Vérifier les coordonnées dans la bounding box de la ville
    if (suggestion.coordinates.latitude !== null && suggestion.coordinates.longitude !== null) {
      const lat = suggestion.coordinates.latitude;
      const lng = suggestion.coordinates.longitude;
      const bbox = cityConfig.bbox;
      
      if (
        lng >= bbox.minLng &&
        lng <= bbox.maxLng &&
        lat >= bbox.minLat &&
        lat <= bbox.maxLat
      ) {
        return cityKey;
      }
    }
  }
  
  return null;
}
