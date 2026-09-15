export type FavoriteLocationType = 'home' | 'work' | 'other';

export interface FavoriteLocation {
  id: string;
  name: string;
  address: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  type: FavoriteLocationType;
  isDefault: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}
