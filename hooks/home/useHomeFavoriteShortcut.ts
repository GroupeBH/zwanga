import { useCallback, useEffect, useRef, useState } from 'react';
import { useLazyGetFavoriteLocationsQuery } from '@/store/api/userApi';
import type { useHomeContext } from './useHomeContext';

type Props = Pick<ReturnType<typeof useHomeContext>, 'router' | 'isScreenActive'> & { userId?: string };
export function useHomeFavoriteShortcut({ router, isScreenActive, userId }: Props) {
  const [loadFavorites] = useLazyGetFavoriteLocationsQuery();
  const [pending, setPending] = useState<'home' | 'work' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    active.current = isScreenActive && Boolean(userId);
    busy.current = false;
    setPending(null);
    setError(null);
    return () => { active.current = false; generation.current += 1; };
  }, [isScreenActive, userId]);
  const openFavorite = useCallback(async (type: 'home' | 'work') => {
    if (!active.current || busy.current) return;
    busy.current = true;
    const requestGeneration = generation.current;
    const current = () => active.current && generation.current === requestGeneration;
    setPending(type);
    setError(null);
    try {
      // Read only on tap; no extra HTTP request during login/Home startup.
      const favorites = await loadFavorites(undefined, true).unwrap();
      if (!current()) return;
      const matches = favorites.filter(item => item.type === type);
      const favorite = matches.find(item => item.isDefault) ?? matches[0];
      if (!favorite) { router.push('/favorite-locations'); return; }
      const { latitude, longitude } = favorite.coordinates;
      const hasCoordinates = Number.isFinite(latitude) && Math.abs(latitude) <= 90
        && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
      router.push({ pathname: '/search', params: { arrival: favorite.address || favorite.name,
        ...(hasCoordinates ? { mode: 'map', arrivalLat: String(latitude), arrivalLng: String(longitude), arrivalRadiusKm: '5' } : {}) } });
    } catch {
      if (current()) setError('Adresses indisponibles. Réessayez ou ouvrez « Mes adresses ».');
    } finally {
      if (current()) { busy.current = false; setPending(null); }
    }
  }, [loadFavorites, router]);
  return { pending, error, openFavorite };
}
