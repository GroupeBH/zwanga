import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { styles } from '@/features/screen-styles/app/requests';
import type { RequestTab } from './requestsListModel';

type Props = {
  loading: boolean; error: boolean; searching: boolean; busy: boolean;
  tab: RequestTab; onRetry: () => void; onClearSearch: () => void;
};

export function RequestsListState({ loading, error, searching, busy, tab, onRetry, onClearSearch }: Props) {
  if (loading) return <View style={styles.emptyContainer}>
    <ActivityIndicator size="large" color={Colors.primary} />
    <Text style={styles.emptyText}>Chargement des demandes…</Text>
  </View>;

  const title = error ? 'Impossible de charger les demandes' : searching ? 'Aucun résultat'
    : tab === 'available' ? 'Aucune demande pour le moment' : 'Votre première demande ?';
  const description = error ? 'Vérifiez votre connexion puis réessayez.'
    : searching ? 'Essayez un autre lieu ou un autre nom.'
      : tab === 'available' ? 'Les nouvelles demandes des passagers apparaîtront ici.'
        : 'Indiquez votre trajet et votre horaire pour trouver un conducteur.';
  return <View style={styles.emptyContainer}>
    <View style={styles.emptyIcon}>
      <Ionicons name={error ? 'cloud-offline-outline' : searching ? 'search-outline' : 'navigate-outline'} size={28} color={Colors.gray[600]} />
    </View>
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptyText}>{description}</Text>
    {(error || searching || tab === 'available') && <TouchableOpacity accessibilityRole="button"
      disabled={busy} accessibilityState={{ disabled: busy }} activeOpacity={0.7}
      onPress={error || !searching ? onRetry : onClearSearch} style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>{error ? 'Réessayer' : searching ? 'Effacer la recherche' : 'Actualiser'}</Text>
    </TouchableOpacity>}
  </View>;
}
