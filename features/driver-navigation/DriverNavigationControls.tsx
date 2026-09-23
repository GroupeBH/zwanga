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
import { getDriverPendingBookingLayout } from './driverPendingBookingLayout';

interface DriverNavigationControlsProps {
  foundation: ReturnType<typeof useDriverNavigationFoundation>;
  tripActions: { handleEditTripFromNavigation: () => void; handlePauseTripFromNavigation: () => void; handleShareTrip: () => Promise<void>; };
  voice: { speakNavigationMessage: (message: string, options?: { force?: boolean; }) => Promise<void>; buildInstructionSpeech: (step: RouteStep, intro?: string) => string; buildWaypointSpeech: (waypoint: Waypoint) => string; toggleVoiceGuidance: () => void; };
  passengerPresentation: { passengerStats: { totalPassengers: number; pendingPickups: number; pendingDropoffs: number; completedPickups: number; completedDropoffs: number; inVehicle: number; passengers: { name: string; pickedUp: boolean; droppedOff: boolean; id: string; }[]; }; fitVehicleAndPassengers: () => void; };
  forceRecalculateRoute: () => void;
}

export function DriverNavigationControls({
  foundation,
  tripActions,
  voice,
  passengerPresentation,
  forceRecalculateRoute,
}: DriverNavigationControlsProps) {
  const [optionsVisible, setOptionsVisible] = useState(false);
  const { bookings, tripId, isScreenActive } = foundation.data;
  const completed = useMemo(() => getConfirmedDropoffs(bookings ?? [], tripId), [bookings, tripId]);
  const [receiptsTrip, setReceiptsTrip] = useState<string | null>(null);
  const closeReceipts = useCallback(() => setReceiptsTrip(null), []);
  useEffect(closeReceipts, [isScreenActive, tripId, closeReceipts]);
  const receiptsVisible = isScreenActive && receiptsTrip === tripId && completed.length > 0;
  const { width, height } = useWindowDimensions();
  const pendingBookingVisible = foundation.data.isTripOngoing && Boolean(foundation.passengers.activePendingBooking)
    && !foundation.passengers.activePassengerInterruptionBooking;
  const pendingLayout = getDriverPendingBookingLayout(height, foundation.data.insets.top, foundation.data.insets.bottom);
  const menuWidth = Math.min(240, width - foundation.data.insets.left - foundation.data.insets.right - 96);
  const menuMaxHeight = height * 0.35;
  useEffect(() => { if (!foundation.data.isScreenActive) setOptionsVisible(false); }, [foundation.data.isScreenActive]);
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
  const options: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; action: () => void; disabled?: boolean }[] = [
    { label: 'Prévenir mes proches', icon: 'shield-checkmark', action: () => foundation.mapState.setSecurityModalVisible(true) },
    { label: 'Modifier le trajet', icon: 'create-outline', action: tripActions.handleEditTripFromNavigation },
    { label: 'Partager le trajet', icon: 'share-social-outline', action: () => void tripActions.handleShareTrip(), disabled: foundation.data.isCreatingTripShareLink },
    ...(foundation.passengers.passengerMapLocations.length > 0 ? [{ label: 'Voir les passagers', icon: 'people' as const, action: passengerPresentation.fitVehicleAndPassengers }] : []),
    ...(completed.length > 0 ? [{ label: 'Gains des passagers', icon: 'receipt-outline' as const,
      action: () => { if (isScreenActive) setReceiptsTrip(tripId); }, disabled: !isScreenActive }] : []),
    { label: 'Ma position', icon: 'locate', action: recenterOnMyPosition },
  ];
  return (
    <View pointerEvents="box-none" style={[styles.floatingButtons, {
      right: Math.max(foundation.data.insets.right, 16), alignItems: 'flex-end', justifyContent: 'flex-end',
      // Keep the popup within its parent's touch bounds, especially on Android.
      width: optionsVisible ? menuWidth + 58 : 48, minHeight: optionsVisible ? menuMaxHeight : undefined,
    }, pendingBookingVisible && {
      flexDirection: 'row', gap: 8, bottom: pendingLayout.controlsBottom,
      width: optionsVisible ? Math.max(menuWidth, pendingLayout.controlsWidth) : pendingLayout.controlsWidth,
      minHeight: optionsVisible ? menuMaxHeight + pendingLayout.menuBottom : undefined,
    }]}>
      {optionsVisible && <View style={[menuStyles.menu, { width: menuWidth, maxHeight: menuMaxHeight },
        pendingBookingVisible && { right: 0, bottom: pendingLayout.menuBottom }]}>
        <ScrollView bounces={false} contentContainerStyle={menuStyles.content}>
          {options.map(option => <TouchableOpacity key={option.label} style={[menuStyles.option, option.disabled && styles.floatingButtonDisabled]}
            disabled={option.disabled} onPress={() => { setOptionsVisible(false); option.action(); }}
            accessibilityRole="button" accessibilityLabel={option.label}>
            <Ionicons name={option.icon} size={21} color={Colors.primary} />
            <Text style={menuStyles.label}>{option.label}</Text>
          </TouchableOpacity>)}
        </ScrollView>
      </View>}

      <TouchableOpacity
        style={[
          styles.floatingButton,
          styles.interruptTripButton,
          (foundation.data.isPausingTrip ||
            foundation.data.isRequestingDriverInterruption ||
            foundation.data.isCancellingDriverInterruption) &&
            styles.floatingButtonDisabled,
        ]}
        onPress={tripActions.handlePauseTripFromNavigation}
        disabled={foundation.data.isPausingTrip || foundation.data.isRequestingDriverInterruption || foundation.data.isCancellingDriverInterruption}
        accessibilityRole="button"
        accessibilityLabel={
          foundation.passengers.activeDriverInterruptionRequest
            ? "Voir la demande d'interruption"
            : 'Demander une interruption du trajet'
        }
      >
        {foundation.data.isPausingTrip || foundation.data.isRequestingDriverInterruption || foundation.data.isCancellingDriverInterruption ? (
          <ActivityIndicator size="small" color={Colors.white} />
        ) : (
          <Ionicons
            name={foundation.passengers.activeDriverInterruptionRequest ? 'hourglass' : 'stop-circle'}
            size={24}
            color={Colors.white}
          />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.floatingButton, !foundation.mapState.isVoiceGuidanceEnabled && styles.voiceButtonMuted]}
        onPress={voice.toggleVoiceGuidance}
        accessibilityRole="button"
        accessibilityLabel={foundation.mapState.isVoiceGuidanceEnabled ? 'Désactiver le guidage vocal' : 'Activer le guidage vocal'}
      >
        <Ionicons
          name={foundation.mapState.isVoiceGuidanceEnabled ? 'volume-high' : 'volume-mute'}
          size={22}
          color={foundation.mapState.isVoiceGuidanceEnabled ? Colors.primary : Colors.gray[500]}
        />
      </TouchableOpacity>

      <TouchableOpacity style={styles.floatingButton} onPress={() => setOptionsVisible(value => !value)}
        accessibilityRole="button" accessibilityLabel={optionsVisible ? 'Fermer les options' : 'Options de navigation'}
        accessibilityState={{ expanded: optionsVisible }}>
        <Ionicons name={optionsVisible ? 'close' : 'ellipsis-horizontal'} size={22} color={Colors.primary} />
        <Text style={menuStyles.caption}>Options</Text>
      </TouchableOpacity>

      {/* Recalcul direct ; le recentrage reste dans les options. */}
      <TouchableOpacity
        style={[styles.floatingButton, foundation.mapState.isLoadingRoute && styles.floatingButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Recalculer l’itinéraire"
        accessibilityState={{ busy: foundation.mapState.isLoadingRoute, disabled: foundation.mapState.isLoadingRoute || !foundation.data.isScreenActive }}
        disabled={foundation.mapState.isLoadingRoute || !foundation.data.isScreenActive}
        onPress={() => {
          if (foundation.mapState.isLoadingRoute || !foundation.data.isScreenActive) return;
          setOptionsVisible(false);
          forceRecalculateRoute();
        }}
      >
        {foundation.mapState.isLoadingRoute
          ? <ActivityIndicator size="small" color={Colors.primary} />
          : <Ionicons name="refresh" size={22} color={Colors.primary} />}
      </TouchableOpacity>
      <RideModal inApp visible={receiptsVisible} transparent animationType="none" onRequestClose={closeReceipts}>
        {receiptsVisible && <DriverDropoffReceiptsSheet bookings={completed} active={isScreenActive} onClose={closeReceipts} />}
      </RideModal>
    </View>
  );
}

const menuStyles = StyleSheet.create({
  menu: { position: 'absolute', right: 58, bottom: 0, backgroundColor: Colors.white, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.gray[200], overflow: 'hidden', elevation: 4 },
  content: { padding: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 48 },
  label: { color: Colors.gray[800], fontSize: 13, fontWeight: '600', flex: 1 },
  caption: { color: Colors.primaryDark, fontSize: 9, fontWeight: '700' },
});
