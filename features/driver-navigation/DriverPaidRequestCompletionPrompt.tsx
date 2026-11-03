import React from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '@/constants/styles';
import { RideModal } from '@/features/navigation/RideModal';
import { RIDE_OVERLAY_PRIORITY } from '@/features/navigation/rideOverlayStore';
import { usePaidRequestCompletion } from '@/hooks/driver-navigation/usePaidRequestCompletion';
import type { useDriverNavigationController } from '@/hooks/driver-navigation/useDriverNavigationController';
import { styles } from '../screen-styles/app/trip/navigate/detail/index';

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
    <View style={styles.waypointModalOverlay}>
      <View style={[styles.waypointModalContent, { maxHeight: '90%', paddingBottom: Math.max(data.insets.bottom, Spacing.xl) }]}>
        <ScrollView bounces={false} style={{ width: '100%', flexGrow: 0 }}>
          <Text style={styles.waypointModalTitle}>Terminer le trajet ?</Text>
          <Text style={styles.waypointModalWaitingText}>
            Le passager est arrivé et le règlement est confirmé. Vous pouvez maintenant terminer cette course.
          </Text>
          {prompt.error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
            style={[styles.waypointModalWaitingText, { color: Colors.dangerDark }]}>{prompt.error}</Text>}
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: prompt.busy, busy: prompt.busy }}
            disabled={prompt.busy} onPress={() => { void prompt.confirm(); }}
            style={[styles.waypointModalPrimaryButton, { flex: 0, backgroundColor: Colors.primary, minHeight: 52, height: undefined, padding: Spacing.md }]}>
            {prompt.busy ? <ActivityIndicator color={Colors.white} /> : <Ionicons name="flag-outline" size={20} color={Colors.white} />}
            <Text style={styles.waypointModalPrimaryButtonText}>{prompt.busy ? 'Finalisation…' : 'Terminer le trajet'}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: prompt.busy }} disabled={prompt.busy}
            onPress={prompt.dismiss} style={[styles.waypointModalSecondaryButton, { flex: 0, marginTop: Spacing.sm, minHeight: 52, height: undefined, padding: Spacing.md }]}>
            <Text style={styles.waypointModalSecondaryButtonText}>Pas maintenant</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  </RideModal>;
}
