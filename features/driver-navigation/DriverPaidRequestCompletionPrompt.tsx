import React from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { RideModal } from '@/features/navigation/RideModal';
import { RIDE_OVERLAY_PRIORITY } from '@/features/navigation/rideOverlayStore';
import type { useDriverPaidTripCompletion } from '@/hooks/driver-navigation/useDriverPaidTripCompletion';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { styles } from './paidRequestCompletion.styles';

export function DriverPaidRequestCompletionPrompt({ prompt, insets }: {
  prompt: ReturnType<typeof useDriverPaidTripCompletion>; insets: EdgeInsets;
}) {
  return <RideModal inApp visible={prompt.visible} transparent animationType="fade"
    priority={RIDE_OVERLAY_PRIORITY.information} onRequestClose={prompt.dismiss}>
    <View style={[styles.overlay, { paddingTop: Math.max(insets.top || 0, 24), paddingBottom: Math.max(insets.bottom, 24) }]}>
      <View testID="paid-request-completion-panel" style={styles.panel} accessibilityViewIsModal>
        <ScrollView bounces={false} style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.status}>
            <Ionicons name="checkmark-circle-outline" size={20} color={styles.statusText.color} />
            <Text style={styles.statusText}>{prompt.autoComplete ? 'Arrivée et paiement confirmés' : 'Passagers déposés · Paiements réglés'}</Text>
          </View>
          <Text accessibilityRole="header" style={styles.title}>{prompt.busy ? 'Finalisation du trajet' : 'Terminer le trajet ?'}</Text>
          <Text style={styles.message}>{prompt.autoComplete ? 'Vous pourrez ensuite noter votre passager.' : 'Vous pouvez terminer ici ou continuer votre trajet.'}</Text>
          {prompt.error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
            style={styles.error}>{prompt.error}</Text>}
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: prompt.busy, busy: prompt.busy }}
            disabled={prompt.busy} onPress={() => { void prompt.confirm(); }}
            style={styles.primaryButton}>
            {prompt.busy && <ActivityIndicator color={Colors.white} />}
            <Text style={styles.primaryText}>{prompt.busy ? 'Finalisation…' : prompt.error ? 'Réessayer' : 'Terminer le trajet'}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: prompt.busy }} disabled={prompt.busy}
            onPress={prompt.dismiss} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>{prompt.autoComplete ? 'Fermer' : 'Continuer'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  </RideModal>;
}
