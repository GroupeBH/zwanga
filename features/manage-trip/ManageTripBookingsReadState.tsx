import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/styles';

export function ManageTripBookingsReadState({ loading, failed, offline, partial, canRetry, onRetry }: {
  loading?: boolean; failed?: boolean; offline?: boolean; partial?: boolean; canRetry?: boolean;
  onRetry: () => unknown;
}) {
  if (!loading && !failed && !offline && !partial) return null;
  const message = offline ? 'Vous êtes hors connexion. Les réservations seront actualisées au retour du réseau.'
    : failed ? 'Impossible de charger toutes les réservations. Réessayez.'
      : partial ? 'Réservation sélectionnée affichée. Mise à jour des autres réservations…'
        : 'Chargement des réservations…';
  return <View style={styles.container} accessibilityLiveRegion="polite">
    <View style={styles.row}>
      {loading && !offline && <ActivityIndicator size="small" color={Colors.primary} />}
      <Text style={styles.message}>{message}</Text>
    </View>
    {failed && !offline && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Réessayer le chargement des réservations"
      accessibilityState={{ disabled: !canRetry, busy: loading }} disabled={!canRetry}
      style={styles.retry} onPress={() => { void onRetry(); }}>
      <Text style={styles.retryLabel}>{loading ? 'Chargement…' : 'Réessayer'}</Text>
    </TouchableOpacity>}
  </View>;
}

const styles = StyleSheet.create({
  container: { paddingVertical: 12, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  message: { flex: 1, color: Colors.gray[600], fontSize: 14, lineHeight: 20 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 12 },
  retryLabel: { color: Colors.primary, fontWeight: '600', fontSize: 15 },
});
