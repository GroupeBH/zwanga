import { Ionicons } from '@expo/vector-icons';

export type FavoriteLocationType = 'home' | 'work' | 'other';

export const TYPE_LABELS: Record<FavoriteLocationType, string> = {
  home: 'Domicile',
  work: 'Bureau',
  other: 'Autre',
};

export const TYPE_ICONS: Record<FavoriteLocationType, keyof typeof Ionicons.glyphMap> = {
  home: 'home',
  work: 'briefcase',
  other: 'location',
};
