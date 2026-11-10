import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGetFavoriteLocationsQuery } from '@/store/api/userApi';
import { useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { HOME_DASHBOARD_COLORS, styles } from '@/features/home/HomeTripsSheet.styles';
import type { Location } from '@/types';
import LocationPickerModal, { type MapLocationSelection } from '@/components/LocationPickerModal';
import { getPickerCoordinate } from '@/features/location-picker/locationPickerModel';
import { getTripRequestCreateHref } from '@/utils/requestNavigation';
import { getTokenSessionVersion } from '@/services/tokenSession';

export const HomeDestinationShortcuts = React.memo(function HomeDestinationShortcuts({ active, recentDestinations }: {
  active: boolean; recentDestinations: Location[];
}) {
  const router = useRouter();
  const enabled = useDisplayReadsEnabled(active);
  const { data: favorites } = useGetFavoriteLocationsQuery(undefined, {
    skip: !enabled, refetchOnMountOrArgChange: 60,
  });
  const [recentOpen, setRecentOpen] = useState(false);
  const [picker, setPicker] = useState<{ location: MapLocationSelection | null; query: string } | null>(null);
  const confirmed = useRef<MapLocationSelection | null>(null);
  const session = useRef(getTokenSessionVersion());
  const accepting = useRef(false);
  useEffect(() => {
    if (!active) { accepting.current = false; confirmed.current = null; setPicker(null); setRecentOpen(false); }
    return () => { accepting.current = false; confirmed.current = null; };
  }, [active]);
  const chooseDestination = (name: string, latitude?: number, longitude?: number) => {
    if (!active) return;
    setRecentOpen(false);
    const point = typeof latitude === 'number' && typeof longitude === 'number' ? getPickerCoordinate(latitude, longitude) : null;
    session.current = getTokenSessionVersion();
    confirmed.current = null; accepting.current = true;
    setPicker({ location: point ? { ...point, title: name, address: name } : null, query: point ? '' : name });
  };
  const openFavorite = (type: 'home' | 'work') => {
    const matches = favorites?.filter(place => place.type === type);
    const favorite = matches?.find(place => place.isDefault) ?? matches?.[0];
    if (favorite) chooseDestination(favorite.address || favorite.name, favorite.coordinates?.latitude, favorite.coordinates?.longitude);
    else router.push('/favorite-locations');
  };
  return <>
    <View style={styles.shortcuts}>
      <TouchableOpacity style={styles.shortcut} onPress={() => openFavorite('home')} accessibilityRole="button"
        accessibilityLabel="Maison" accessibilityHint="Choisir votre domicile comme destination sur la carte, ou enregistrer cette adresse.">
        <Text style={styles.shortcutText}>Maison</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.shortcut} onPress={() => openFavorite('work')} accessibilityRole="button"
        accessibilityLabel="Travail" accessibilityHint="Choisir votre travail comme destination sur la carte, ou enregistrer cette adresse.">
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
          onPress={() => chooseDestination(place.name || place.address, place.hasCoordinates === false ? undefined : place.lat, place.hasCoordinates === false ? undefined : place.lng)}>
          <Ionicons name="time-outline" size={18} color={HOME_DASHBOARD_COLORS.muted} />
          <Text style={styles.recentText} numberOfLines={2}>{place.name || place.address}</Text>
          <Ionicons name="arrow-forward" size={16} color={HOME_DASHBOARD_COLORS.rust} />
        </TouchableOpacity>
      )) : <Text style={styles.recentText}>Vos prochaines destinations apparaîtront ici.</Text>}
    </View>}
    <LocationPickerModal visible={active && picker !== null} title="Où allez-vous ?" confirmLabel="Confirmer cette destination"
      initialLocation={picker?.location} initialSearchQuery={picker?.query} autoLocateOnOpen={false}
      onClose={() => { accepting.current = false; setPicker(null); }}
      onSelect={location => {
        if (!active || !accepting.current || session.current !== getTokenSessionVersion()) return;
        if (!getPickerCoordinate(location.latitude, location.longitude)) return;
        accepting.current = false; confirmed.current = location; setPicker(null);
      }}
      onDismiss={() => {
        const location = confirmed.current; confirmed.current = null;
        if (location && active && session.current === getTokenSessionVersion()) {
          router.push(getTripRequestCreateHref({ entry: 'home', arrivalLocation: location }));
        }
      }} />
  </>;
});
