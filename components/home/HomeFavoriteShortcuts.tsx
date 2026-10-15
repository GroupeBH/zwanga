import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useHomeFavoriteShortcut } from '@/hooks/home/useHomeFavoriteShortcut';
import { homePalette, styles } from '@/features/home/HomeDashboard.styles';

export function HomeFavoriteShortcuts(props: Parameters<typeof useHomeFavoriteShortcut>[0]) {
  const { pending, error, openFavorite } = useHomeFavoriteShortcut(props);
  return <>
    <View style={styles.shortcuts}>
      {(['home', 'work'] as const).map(type => <TouchableOpacity key={type} style={styles.chip}
        accessibilityRole="button" accessibilityLabel={type === 'home' ? 'Trajets vers ma maison' : 'Trajets vers mon travail'}
        accessibilityHint="Choisir une adresse enregistrée. Sinon, ouvrir mes adresses."
        accessibilityState={{ disabled: Boolean(pending), busy: pending === type }}
        disabled={Boolean(pending)} onPress={() => void openFavorite(type)} activeOpacity={0.75}>
        {pending === type && <ActivityIndicator size="small" color={homePalette.accent} />}
        <Text style={styles.chipText}>{type === 'home' ? 'Maison' : 'Travail'}</Text>
      </TouchableOpacity>)}
      <TouchableOpacity style={styles.chip} accessibilityRole="button" activeOpacity={0.75}
        disabled={Boolean(pending)} accessibilityState={{ disabled: Boolean(pending) }}
        onPress={() => props.router.push('/favorite-locations')}>
        <Text style={styles.chipText}>Mes adresses</Text>
      </TouchableOpacity>
    </View>
    {error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
  </>;
}
