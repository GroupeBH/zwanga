import type { useDriverNavigationFoundation } from '../../hooks/driver-navigation/useDriverNavigationFoundation';
import { normalizeDriverLocationObject } from './navigationBooking';
import { styles } from '../screen-styles/app/trip/navigate/detail/index';
import { Colors } from '@/constants/styles';
import { RideModal } from '@/features/navigation/RideModal';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import type { RouteStep, Waypoint } from './navigationModel';
import { getConfirmedDropoffs } from './driverDropoffReceiptsModel';
import { DriverDropoffReceiptsSheet } from './DriverDropoffReceiptsSheet';
import { getDriverNavigationLayout } from './driverNavigationLayout';

interface DriverNavigationControlsProps {
  foundation: ReturnType<typeof useDriverNavigationFoundation>;
  tripActions: { handleEditTripFromNavigation: () => void; handlePauseTripFromNavigation: () => void; handleShareTrip: () => Promise<void>; };
  voice: { speakNavigationMessage: (message: string, options?: { force?: boolean; }) => Promise<void>; buildInstructionSpeech: (step: RouteStep, intro?: string) => string; buildWaypointSpeech: (waypoint: Waypoint) => string; toggleVoiceGuidance: () => void; };
  passengerPresentation: { passengerStats: { totalPassengers: number; pendingPickups: number; pendingDropoffs: number; completedPickups: number; completedDropoffs: number; inVehicle: number; passengers: { name: string; pickedUp: boolean; droppedOff: boolean; id: string; }[]; }; fitVehicleAndPassengers: () => void; };
  forceRecalculateRoute: () => void;
  canToggleRouteSections?: boolean;
}

export function DriverNavigationControls({
  foundation,
  tripActions,
  voice,
  passengerPresentation,
  forceRecalculateRoute,
  canToggleRouteSections = false,
}: DriverNavigationControlsProps) {
  const [optionsVisible, setOptionsVisible] = useState(false);
  const { bookings, tripId, isScreenActive } = foundation.data;
  const completed = useMemo(() => getConfirmedDropoffs(bookings ?? [], tripId), [bookings, tripId]);
  const [receiptsTrip, setReceiptsTrip] = useState<string | null>(null);
  const closeReceipts = useCallback(() => setReceiptsTrip(null), []);
  useEffect(closeReceipts, [isScreenActive, tripId, closeReceipts]);
  const receiptsVisible = isScreenActive && receiptsTrip === tripId && completed.length > 0;
  const { width, height } = useWindowDimensions();
  const layout = getDriverNavigationLayout(height, foundation.data.insets.top, foundation.data.insets.bottom);
  const controlsWidth = Math.min(340, width - Math.max(foundation.data.insets.left, 16) - Math.max(foundation.data.insets.right, 16));
  const commandSize = { width: (controlsWidth - 24 - 96) / 3, minHeight: layout.controlsHeight, height: 'auto' as const, borderRadius: 16 };
  const menuWidth = Math.min(240, width - foundation.data.insets.left - foundation.data.insets.right - 96);
  const menuMaxHeight = height * 0.35;
  useEffect(() => { setOptionsVisible(false); }, [isScreenActive, tripId]);
  const recenterOnMyPosition = () => {
    if (!foundation.data.isScreenActive) return;
    const location = normalizeDriverLocationObject(foundation.refs.currentLocationRef.current)
      ?? normalizeDriverLocationObject(foundation.mapState.currentLocation);
    if (!location) return;
    foundation.focusMapOnCoordinates(
      [{ latitude: location.coords.latitude, longitude: location.coords.longitude }],
      {
        durationMs: 300,
        edgePadding: { top: 150, right: 50, bottom: 300, left: 50 },
        logContext: 'recenter-driver',
        singleCoordinateDelta: 0.005,
      },
    );
  };
  const pausing = foundation.data.isPausingTrip || foundation.data.isRequestingDriverInterruption || foundation.data.isCancellingDriverInterruption;
  const interruptionPending = Boolean(foundation.passengers.activeDriverInterruptionRequest);
  const options: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; action: () => void; disabled?: boolean; selected?: boolean; busy?: boolean }[] = [
    { label: foundation.mapState.isVoiceGuidanceEnabled ? 'Couper le son' : 'Activer le son',
      icon: foundation.mapState.isVoiceGuidanceEnabled ? 'volume-high' : 'volume-mute', action: voice.toggleVoiceGuidance },
    { label: 'Les arrêts', icon: 'people-outline', action: () => foundation.mapState.setPassengersPanelVisible(true) },
    { label: 'Actualiser la route', icon: 'refresh', disabled: foundation.mapState.isLoadingRoute, busy: foundation.mapState.isLoadingRoute,
      action: () => { if (!foundation.mapState.isLoadingRoute && foundation.data.isScreenActive) forceRecalculateRoute(); } },
    { label: 'Modifier le trajet', icon: 'create-outline', action: tripActions.handleEditTripFromNavigation },
    ...(foundation.passengers.passengerMapLocations.length > 0 ? [{ label: 'Passagers sur la carte', icon: 'people' as const, action: passengerPresentation.fitVehicleAndPassengers }] : []),
    ...(completed.length > 0 ? [{ label: 'Mes gains', icon: 'receipt-outline' as const,
      action: () => { if (isScreenActive) setReceiptsTrip(tripId); }, disabled: !isScreenActive }] : []),
    ...(canToggleRouteSections ? (['next', 'remaining'] as const).map(section => ({
      label: section === 'next' ? 'Prochain arrêt' : 'Reste du trajet', icon: 'map-outline' as const,
      selected: foundation.mapState.routeSectionFocus === section,
      action: () => foundation.mapState.setRouteSectionFocus(section),
    })) : []),
  ];
  return (
    <View pointerEvents="box-none" style={[styles.floatingButtons, {
      right: Math.max(foundation.data.insets.right, 16), alignItems: 'flex-end', justifyContent: 'flex-end',
      // Keep the popup within its parent's touch bounds, especially on Android.
      flexDirection: 'row', gap: 8, bottom: layout.controlsBottom, zIndex: 45,
      width: optionsVisible ? Math.max(menuWidth, controlsWidth) : controlsWidth,
      minHeight: optionsVisible ? menuMaxHeight + layout.menuBottom : undefined,
    }]}>
      {optionsVisible && <View style={[menuStyles.menu, { width: menuWidth, maxHeight: menuMaxHeight, bottom: layout.menuBottom }]}>
        <ScrollView bounces={false} contentContainerStyle={menuStyles.content}>
          {options.map(option => <TouchableOpacity key={option.label} style={[menuStyles.option, option.disabled && styles.floatingButtonDisabled]}
            disabled={Boolean(option.disabled || !isScreenActive)} onPress={() => { if (!foundation.data.isScreenActive || option.disabled) return; setOptionsVisible(false); option.action(); }}
            accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ selected: option.selected, disabled: Boolean(option.disabled || !isScreenActive), busy: option.busy }}>
            {option.busy ? <ActivityIndicator size="small" color={Colors.primaryDark} /> : <Ionicons name={option.icon} size={21} color={Colors.gray[700]} />}
            <Text style={menuStyles.label}>{option.label}</Text>
            {option.selected && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
          </TouchableOpacity>)}
        </ScrollView>
      </View>}

      <TouchableOpacity style={[styles.floatingButton, commandSize]} onPress={recenterOnMyPosition}
        disabled={!isScreenActive} accessibilityRole="button" accessibilityLabel="Ma position">
        <Ionicons name="locate" size={22} color={Colors.primaryDark} />
        <Text style={menuStyles.caption}>Ma position</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.floatingButton, commandSize, foundation.data.isCreatingTripShareLink && styles.floatingButtonDisabled]}
        accessibilityRole="button" accessibilityLabel="Partager le trajet"
        accessibilityHint="Envoyer le lien de ce trajet à un proche."
        disabled={Boolean(!isScreenActive || foundation.data.isCreatingTripShareLink)}
        accessibilityState={{ disabled: Boolean(!isScreenActive || foundation.data.isCreatingTripShareLink), busy: Boolean(foundation.data.isCreatingTripShareLink) }}
        onPress={() => {
          if (!foundation.data.isScreenActive || foundation.data.isCreatingTripShareLink) return;
          setOptionsVisible(false);
          void tripActions.handleShareTrip();
        }}>
        {foundation.data.isCreatingTripShareLink ? <ActivityIndicator size="small" color={Colors.primaryDark} />
          : <Ionicons name="share-social-outline" size={22} color={Colors.primaryDark} />}
        <Text style={menuStyles.caption}>Partager le trajet</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.floatingButton, commandSize, menuStyles.stopButton, (pausing || !isScreenActive) && styles.floatingButtonDisabled]}
        onPress={() => {
          if (!foundation.data.isScreenActive || foundation.data.isPausingTrip
            || foundation.data.isRequestingDriverInterruption || foundation.data.isCancellingDriverInterruption) return;
          setOptionsVisible(false);
          tripActions.handlePauseTripFromNavigation();
        }} disabled={Boolean(pausing || !isScreenActive)}
        accessibilityRole="button"
        accessibilityLabel={interruptionPending ? 'Voir la demande d’arrêt' : 'Arrêter le trajet'}
        accessibilityHint={interruptionPending ? 'Voir la réponse des passagers.' : 'Une confirmation sera demandée avant de mettre en pause ou demander un arrêt.'}
        accessibilityState={{ disabled: Boolean(pausing || !isScreenActive), busy: Boolean(pausing) }}
      >
        {pausing ? <ActivityIndicator size="small" color={Colors.white} />
          : <Ionicons name={interruptionPending ? 'hourglass-outline' : 'stop-circle-outline'} size={22} color={Colors.white} />}
        <Text style={[menuStyles.caption, menuStyles.stopLabel]}>{interruptionPending ? 'Arrêt demandé' : 'Arrêter le trajet'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.floatingButton, commandSize]} onPress={() => { if (foundation.data.isScreenActive) setOptionsVisible(value => !value); }} disabled={!isScreenActive}
        accessibilityRole="button" accessibilityLabel={optionsVisible ? 'Fermer les options' : 'Options de navigation'}
        accessibilityState={{ expanded: optionsVisible }}>
        <Ionicons name={optionsVisible ? 'close' : 'ellipsis-horizontal'} size={22} color={Colors.primary} />
        <Text style={menuStyles.caption}>Plus</Text>
      </TouchableOpacity>

      <RideModal inApp visible={receiptsVisible} transparent animationType="none" onRequestClose={closeReceipts}>
        {receiptsVisible && <DriverDropoffReceiptsSheet bookings={completed} active={isScreenActive} onClose={closeReceipts} />}
      </RideModal>
    </View>
  );
}

const menuStyles = StyleSheet.create({
  menu: { position: 'absolute', right: 0, backgroundColor: Colors.white, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.gray[200], overflow: 'hidden', elevation: 4 },
  content: { padding: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 48 },
  label: { color: Colors.gray[800], fontSize: 13, fontWeight: '600', flex: 1 },
  caption: { color: Colors.gray[800], fontSize: 12, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  stopButton: { width: 96, paddingHorizontal: 6, paddingVertical: 6, backgroundColor: Colors.dangerDark },
  stopLabel: { color: Colors.white, fontWeight: '700' },
});
