import React, { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import type { useDriverTripWorkspace } from '@/hooks/trip-detail/useDriverTripWorkspace';
import { TripDriverWithdrawal } from '@/features/request-detail/WithdrawRequestDriverButton';
import { driverTripStyles as s } from './DriverTripWorkspace.styles';

export function DriverTripActionsBar({ workspace: w, bottomInset, goHome }: {
  workspace: ReturnType<typeof useDriverTripWorkspace>; bottomInset: number; goHome: () => void;
}) {
  const [withdrawing, setWithdrawing] = useState(false);
  const trip = w.state.trip;
  if (!trip) return null;
  const busy = w.busy || withdrawing;
  const active = w.state.isScreenActive && w.state.isOwner;
  // Keep the existing management policy: only the server asks for reprogramming.
  const upcoming = trip.status === 'upcoming' && !trip.canReprogram;
  const ongoing = trip.status === 'ongoing';
  const primary = trip.canReprogram ? { label: 'Reprogrammer le trajet', icon: 'calendar-outline' as const, press: w.actions.handleOpenTripEdit }
    : upcoming ? { label: w.isStartingTrip ? 'Démarrage…' : 'Démarrer le trajet', icon: 'play' as const, press: w.actions.handleStartTrip }
    : ongoing ? { label: 'Reprendre la navigation', icon: 'navigate' as const, press: w.actions.handleOpenNavigation }
    : trip.status === 'completed' ? { label: 'Évaluer les passagers', icon: 'star-outline' as const,
      press: () => w.state.router.push(`/rate/${trip.id}`) } : null;
  const primaryDisabled = busy || !active || (upcoming && !w.ready && !trip.canReprogram);
  if (!primary && !trip.tripRequestId) return null;
  return <View testID="driver-trip-actions" style={[s.footer, { paddingBottom: Math.max(bottomInset, 8) }]}>
    {primary && <TouchableOpacity style={[s.primary, primaryDisabled && s.disabled]} accessibilityRole="button"
      accessibilityLabel={primary.label} disabled={primaryDisabled} onPress={primary.press}>
      {w.isStartingTrip ? <ActivityIndicator color={Colors.white} /> : <Ionicons name={primary.icon} size={19} color={Colors.white} />}
      <Text style={s.primaryText}>{primary.label}</Text>
    </TouchableOpacity>}
    {trip.tripRequestId && <TripDriverWithdrawal trip={trip} bookings={w.state.bookings}
      active={active && w.ready && !busy} onWithdrawn={goHome} onPendingChange={setWithdrawing} />}
  </View>;
}
