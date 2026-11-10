import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import type { useDriverTripWorkspace } from '@/hooks/trip-detail/useDriverTripWorkspace';
import { isPendingTripInterruption } from '@/utils/tripInterruption';
import { driverTripStyles as s } from './DriverTripWorkspace.styles';

/** Secondary owner actions live beside Share; destructive actions still confirm. */
export function DriverTripHeaderActions({ workspace: w }: { workspace: ReturnType<typeof useDriverTripWorkspace> }) {
  const trip = w.state.trip;
  if (!trip) return null;
  const upcoming = trip.status === 'upcoming' && !trip.canReprogram;
  const ongoing = trip.status === 'ongoing';
  const disabled = w.busy || !w.state.isScreenActive || !w.state.isOwner;
  const cancelDisabled = disabled || !w.ready;
  const pauseDisabled = disabled || !w.ready || isPendingTripInterruption(trip.interruptionRequest?.status);
  return <>
    {!trip.canReprogram && (upcoming || ongoing) && <TouchableOpacity style={[s.headerIcon, disabled && s.disabled]}
      accessibilityRole="button" accessibilityLabel="Modifier le trajet" accessibilityHint="Ouvre le formulaire de modification"
      disabled={disabled} onPress={w.actions.handleOpenTripEdit}>
      <Ionicons name="create-outline" size={22} color={Colors.gray[700]} />
    </TouchableOpacity>}
    {upcoming && !trip.tripRequestId && <TouchableOpacity style={[s.headerIcon, cancelDisabled && s.disabled]}
      accessibilityRole="button" accessibilityLabel="Annuler le trajet" accessibilityHint="Une confirmation sera demandée"
      disabled={cancelDisabled} onPress={w.actions.handleCancelTrip}>
      <Ionicons name="close-circle-outline" size={23} color={Colors.danger} />
    </TouchableOpacity>}
    {ongoing && <TouchableOpacity style={[s.headerIcon, pauseDisabled && s.disabled]}
      accessibilityRole="button" accessibilityLabel="Interrompre le trajet" accessibilityHint="Une confirmation sera demandée"
      disabled={pauseDisabled} onPress={w.actions.handlePauseTrip}>
      <Ionicons name="pause-circle-outline" size={23} color={Colors.gray[700]} />
    </TouchableOpacity>}
  </>;
}
