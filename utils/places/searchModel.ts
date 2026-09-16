

/* =====================================================
   CONFIG
===================================================== */

export const DEFAULT_PROXIMITY = {
  latitude: -4.325,
  longitude: 15.322,
};

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
    center: { latitude: -2.49, longitude: 28.86 },
    bbox: { minLng: 28.8, maxLng: 28.95, minLat: -2.55, maxLat: -2.45 },
    aliases: ['bukavu', 'costermansville'],
  },
  matadi: {
    name: 'Matadi',
    center: { latitude: -5.817, longitude: 13.45 },
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

export type MajorCityConfig = typeof MAJOR_CITIES[keyof typeof MAJOR_CITIES];

export const RDC_BBOX = { minLng: 12.0, maxLng: 31.3, minLat: -13.5, maxLat: 5.4 };

export const GENERIC_ADDRESS_TERMS = new Set([
  'avenue',
  'av',
  'rue',
  'route',
  'boulevard',
  'bd',
  'place',
  'quartier',
  'q',
  'commune',
  'cite',
  'camp',
]);

export const CONNECTOR_TERMS = new Set([
  'a',
  'au',
  'aux',
  'chez',
  'de',
  'des',
  'du',
  'en',
  'la',
  'le',
  'les',
  'sur',
]);

export const KINSHASA_ADMIN_PHRASES = [
  'bandalungwa',
  'barumbu',
  'bumbu',
  'gombe',
  'kalamu',
  'kasa vubu',
  'kasavubu',
  'kimbanseke',
  'kinshasa',
  'kintambo',
  'kisenso',
  'lemba',
  'limete',
  'lingwala',
  'makala',
  'maluku',
  'masina',
  'matete',
  'mont ngafula',
  'mont ngaf',
  'ndjili',
  'n djili',
  'ngaba',
  'ngaliema',
  'ngiri ngiri',
  'nsele',
  'selembao',
];

/* =====================================================
   TYPES
===================================================== */

export interface GoogleMapsSearchSuggestion {
  id: string;
  name: string;
  fullAddress: string;
  placeType: string[];
  coordinates: {
    latitude: number | null;
    longitude: number | null;
  };
  context?: {
    country?: string;
    region?: string;
    district?: string;
    locality?: string;
    neighborhood?: string;
    postcode?: string;
  };
}

export type QueryAnalysis = {
  normalizedQuery: string;
  allTerms: string[];
  specificTerms: string[];
  contextTerms: string[];
  genericTerms: string[];
  hasAddressIndicator: boolean;
  hasAdminQualifier: boolean;
};
