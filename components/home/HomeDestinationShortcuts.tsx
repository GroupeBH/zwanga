import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGetFavoriteLocationsQuery } from '@/store/api/userApi';
import { useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { HOME_DASHBOARD_COLORS, styles } from '@/features/home/HomeTripsSheet.styles';
import type { Location } from '@/types';

export const HomeDestinationShortcuts = React.memo(function HomeDestinationShortcuts({ active, recentDestinations }: {
  active: boolean; recentDestinations: Location[];
}) {
  const router = useRouter();
  const enabled = useDisplayReadsEnabled(active);
  const { data: favorites } = useGetFavoriteLocationsQuery(undefined, {
    skip: !enabled, refetchOnMountOrArgChange: 60,
  });
  const [recentOpen, setRecentOpen] = useState(false);
  const search = (name: string, latitude?: number, longitude?: number) => {
    setRecentOpen(false);
    const coordinates = typeof latitude === 'number' && typeof longitude === 'number'
      && Number.isFinite(latitude) && Math.abs(latitude) <= 90
      && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
    router.push({ pathname: '/search', params: {
      arrival: name,
      ...(coordinates ? { mode: 'map', arrivalLat: String(latitude), arrivalLng: String(longitude), arrivalRadiusKm: '5' } : {}),
    } });
  };
  const openFavorite = (type: 'home' | 'work') => {
    const matches = favorites?.filter(place => place.type === type);
    const favorite = matches?.find(place => place.isDefault) ?? matches?.[0];
    if (favorite) search(favorite.address || favorite.name, favorite.coordinates?.latitude, favorite.coordinates?.longitude);
    else router.push('/favorite-locations');
  };
  return <>
    <View style={styles.shortcuts}>
      <TouchableOpacity style={styles.shortcut} onPress={() => openFavorite('home')} accessibilityRole="button"
        accessibilityLabel="Maison" accessibilityHint="Chercher un trajet vers votre domicile, ou enregistrer cette adresse.">
        <Text style={styles.shortcutText}>Maison</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.shortcut} onPress={() => openFavorite('work')} accessibilityRole="button"
        accessibilityLabel="Travail" accessibilityHint="Chercher un trajet vers votre travail, ou enregistrer cette adresse.">
        <Text style={styles.shortcutText}>Travail</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.shortcut, recentOpen && styles.shortcutSelected]} onPress={() => setRecentOpen(value => !value)}
        accessibilityRole="button" accessibilityState={{ expanded: recentOpen }} accessibilityLabel="Destinations récentes">
        <Text style={styles.shortcutText}>Récents</Text>
      </TouchableOpacity>
    </View>
    {recentOpen && <View style={styles.recentList}>
      {recentDestinations.length ? recentDestinations.map((place, index) => (
        <TouchableOpacity key={`${place.name}:${index}`} style={styles.recentRow} accessibilityRole="button"
          onPress={() => search(place.name || place.address, place.hasCoordinates === false ? undefined : place.lat, place.hasCoordinates === false ? undefined : place.lng)}>
          <Ionicons name="time-outline" size={18} color={HOME_DASHBOARD_COLORS.muted} />
          <Text style={styles.recentText} numberOfLines={2}>{place.name || place.address}</Text>
          <Ionicons name="arrow-forward" size={16} color={HOME_DASHBOARD_COLORS.rust} />
        </TouchableOpacity>
      )) : <Text style={styles.recentText}>Vos prochaines destinations apparaîtront ici.</Text>}
    </View>}
  </>;
});
