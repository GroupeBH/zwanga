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
  const { width, height, fontScale } = useWindowDimensions();
  const layout = getDriverNavigationLayout(height, foundation.data.insets.top, foundation.data.insets.bottom, fontScale);
  const controlsWidth = width - Math.max(foundation.data.insets.left, 12) - Math.max(foundation.data.insets.right, 12);
  const commandSize = { width: (controlsWidth - 8) / 2, minHeight: layout.controlsHeight, height: 'auto' as const, borderRadius: 18 };
  const menuWidth = Math.min(320, controlsWidth);
  const menuMaxHeight = Math.max(80, height - layout.controlsBottom - layout.menuBottom - layout.guidanceTop - 12);
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
  const options: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; action: () => void; disabled?: boolean; selected?: boolean; busy?: boolean; danger?: boolean; hint?: string }[] = [
    { label: foundation.mapState.isVoiceGuidanceEnabled ? 'Couper le son' : 'Activer le son',
      icon: foundation.mapState.isVoiceGuidanceEnabled ? 'volume-high' : 'volume-mute', action: voice.toggleVoiceGuidance },
    { label: 'Les arrêts', icon: 'people-outline', action: () => foundation.mapState.setPassengersPanelVisible(true) },
    { label: 'Partager le trajet', icon: 'share-social-outline', disabled: foundation.data.isCreatingTripShareLink,
      busy: foundation.data.isCreatingTripShareLink, hint: 'Envoyer le lien de ce trajet à un proche.',
      action: () => { if (!foundation.data.isCreatingTripShareLink) void tripActions.handleShareTrip(); } },
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
    { label: interruptionPending ? 'Voir la demande d’arrêt' : 'Arrêter le trajet', icon: 'stop-circle-outline',
      disabled: pausing, busy: pausing, danger: true,
      hint: interruptionPending ? 'Voir la réponse des passagers.' : 'Une confirmation sera demandée avant de mettre en pause ou demander un arrêt.',
      action: () => {
        if (!foundation.data.isPausingTrip && !foundation.data.isRequestingDriverInterruption && !foundation.data.isCancellingDriverInterruption) {
          tripActions.handlePauseTripFromNavigation();
        }
      } },
  ];
  return (
    <View pointerEvents="box-none" style={[styles.floatingButtons, {
      right: Math.max(foundation.data.insets.right, 12), alignItems: 'flex-end', justifyContent: 'flex-end',
      // Keep the popup within its parent's touch bounds, especially on Android.
      flexDirection: 'row', gap: 8, bottom: layout.controlsBottom, zIndex: 45,
      width: optionsVisible ? Math.max(menuWidth, controlsWidth) : controlsWidth,
      minHeight: optionsVisible ? menuMaxHeight + layout.menuBottom : undefined,
    }]}>
      {optionsVisible && <View style={[menuStyles.menu, { width: menuWidth, maxHeight: menuMaxHeight, bottom: layout.menuBottom }]}>
        <ScrollView bounces={false} contentContainerStyle={menuStyles.content}>
          {options.map(option => <TouchableOpacity key={option.label} style={[menuStyles.option, option.disabled && styles.floatingButtonDisabled]}
            disabled={Boolean(option.disabled || !isScreenActive)} onPress={() => { if (!foundation.data.isScreenActive || option.disabled) return; setOptionsVisible(false); option.action(); }}
            accessibilityRole="button" accessibilityLabel={option.label} accessibilityHint={option.hint} accessibilityState={{ selected: option.selected, disabled: Boolean(option.disabled || !isScreenActive), busy: option.busy }}>
            {option.busy ? <ActivityIndicator size="small" color={Colors.primaryDark} /> : <Ionicons name={option.icon} size={21} color={option.danger ? Colors.dangerDark : Colors.gray[700]} />}
            <Text style={[menuStyles.label, option.danger && menuStyles.dangerLabel]}>{option.label}</Text>
            {option.selected && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
          </TouchableOpacity>)}
        </ScrollView>
      </View>}

      <TouchableOpacity style={[menuStyles.command, commandSize]} onPress={recenterOnMyPosition}
        disabled={!isScreenActive} accessibilityRole="button" accessibilityLabel="Ma position">
        <Ionicons name="locate" size={22} color={Colors.primaryDark} />
        <Text style={menuStyles.caption}>Ma position</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[menuStyles.command, commandSize]} onPress={() => { if (foundation.data.isScreenActive) setOptionsVisible(value => !value); }} disabled={!isScreenActive}
        accessibilityRole="button" accessibilityLabel={optionsVisible ? 'Fermer les options' : 'Options de navigation'}
        accessibilityState={{ expanded: optionsVisible }}>
        <Ionicons name={optionsVisible ? 'close' : 'ellipsis-horizontal'} size={22} color={Colors.primary} />
        <Text style={menuStyles.caption}>{optionsVisible ? 'Fermer' : 'Plus'}</Text>
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
  caption: { color: Colors.gray[800], fontSize: 13, fontWeight: '600', flexShrink: 1 },
  command: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white, gap: 8, paddingHorizontal: 8, paddingVertical: 8 },
  dangerLabel: { color: Colors.dangerDark },
});
