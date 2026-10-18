import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '@/constants/styles';
import { styles } from '../screen-styles/app/trip/detail/index';
import type { TripDetailFeedback } from './tripDetailAvailability';

export function TripUnavailableState({ feedback, loading, fetching, onRetry, onHome }: {
  feedback: TripDetailFeedback | null; loading: boolean; fetching: boolean;
  onRetry: () => void; onHome: () => void;
}) {
  return <SafeAreaView style={[styles.container, { backgroundColor: Colors.white }]}>
    <View style={styles.emptyStateContainer}>
      {loading ? <ActivityIndicator size="large" color={Colors.primary} /> :
        <View style={styles.emptyStateIcon}>
          <Ionicons name="information-circle-outline" size={32} color={Colors.primary} />
        </View>}
      <Text style={styles.emptyStateTitle} accessibilityLiveRegion="polite">
        {loading ? 'Chargement du trajet…' : feedback?.title}
      </Text>
      {!loading && <>
        <Text style={styles.emptyStateText}>{feedback?.message}</Text>
        {feedback?.retry && <TouchableOpacity accessibilityRole="button" disabled={fetching}
          accessibilityState={{ disabled: fetching, busy: fetching }} style={styles.primaryButton} onPress={onRetry}>
          <Text style={styles.primaryButtonText}>{fetching ? 'Chargement…' : 'Réessayer'}</Text>
        </TouchableOpacity>}
        <TouchableOpacity accessibilityRole="button" style={[styles.primaryButton, { marginTop: Spacing.md }]} onPress={onHome}>
          <Ionicons name="arrow-back" size={16} color={Colors.white} />
          <Text style={styles.primaryButtonText}>Retour à l’accueil</Text>
        </TouchableOpacity>
      </>}
    </View>
  </SafeAreaView>;
}
