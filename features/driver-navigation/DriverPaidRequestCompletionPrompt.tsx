import React from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { RideModal } from '@/features/navigation/RideModal';
import { RIDE_OVERLAY_PRIORITY } from '@/features/navigation/rideOverlayStore';
import { usePaidRequestCompletion } from '@/hooks/driver-navigation/usePaidRequestCompletion';
import type { useDriverNavigationController } from '@/hooks/driver-navigation/useDriverNavigationController';
import { styles } from './paidRequestCompletion.styles';

export function DriverPaidRequestCompletionPrompt({ model, blocked }: {
  model: ReturnType<typeof useDriverNavigationController>; blocked: boolean;
}) {
  const { foundation, completion } = model.session;
  const { data, refs, mapState } = foundation;
  const prompt = usePaidRequestCompletion({
    trip: data.trip, bookings: data.bookings, driverId: data.driverId,
    active: data.isScreenActive, blocked: blocked || data.offlineTrip || data.offlineBookings || Boolean(mapState.tripEndNotice),
    completingRef: refs.autoCompletingTripRef, completeTrip: data.completeTrip,
    reconcileTripStatus: data.reconcileTripStatus, onCompleted: completion.presentCompletedTripFromServerSync,
    refresh: () => { void data.refetchTrip(); void data.refetchBookings(); },
  });
  return <RideModal inApp visible={prompt.visible} transparent animationType="fade"
    priority={RIDE_OVERLAY_PRIORITY.information} onRequestClose={prompt.dismiss}>
    <View style={[styles.overlay, { paddingTop: Math.max(data.insets.top || 0, 24), paddingBottom: Math.max(data.insets.bottom, 24) }]}>
      <View testID="paid-request-completion-panel" style={styles.panel} accessibilityViewIsModal>
        <ScrollView bounces={false} style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.status}>
            <Ionicons name="checkmark-circle-outline" size={20} color={styles.statusText.color} />
            <Text style={styles.statusText}>Arrivée et paiement confirmés</Text>
          </View>
          <Text accessibilityRole="header" style={styles.title}>Terminer le trajet ?</Text>
          <Text style={styles.message}>Vous pourrez ensuite noter votre passager.</Text>
          {prompt.error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
            style={styles.error}>{prompt.error}</Text>}
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: prompt.busy, busy: prompt.busy }}
            disabled={prompt.busy} onPress={() => { void prompt.confirm(); }}
            style={styles.primaryButton}>
            {prompt.busy && <ActivityIndicator color={Colors.white} />}
            <Text style={styles.primaryText}>{prompt.busy ? 'Finalisation…' : 'Terminer le trajet'}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: prompt.busy }} disabled={prompt.busy}
            onPress={prompt.dismiss} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Pas maintenant</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  </RideModal>;
}
