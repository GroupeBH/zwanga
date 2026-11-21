import { Colors } from '@/constants/styles';
import { NavigationAssistanceButtons } from '@/features/navigation/NavigationAssistanceButtons';
import { RideRecoveryControl } from '@/features/ride-recovery/RideRecoveryControl';
import type { useNavigationAssistance } from '@/hooks/navigation/useNavigationAssistance';
import type { useDriverNavigationController } from '@/hooks/driver-navigation/useDriverNavigationController';
import React from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { DriverNavigationPassengersBar } from './DriverNavigationPassengersBar';
import { DriverDropoffReceipts } from './DriverDropoffReceipts';
import { getDriverPendingBookingLayout } from './driverPendingBookingLayout';
import { getDriverNavigationLayout } from './driverNavigationLayout';
import { TripDriverWithdrawal } from '@/features/request-detail/WithdrawRequestDriverButton';
import { usePassengerPanelVisibility } from '@/hooks/driver-navigation/usePassengerPanelVisibility';
import { LocationAccessBanner } from '@/components/location/LocationAccessBanner';

const EMPTY_BOOKINGS: NonNullable<Props['model']['session']['foundation']['data']['bookings']> = [];

interface Props {
  model: ReturnType<typeof useDriverNavigationController>;
  assistance: ReturnType<typeof useNavigationAssistance>;
}

export function DriverNavigationTopPanel({ model, assistance }: Props) {
  const { height, fontScale } = useWindowDimensions();
  const { data, mapState, passengers } = model.session.foundation;
  const offline = data.offlineTrip || data.offlineBookings;
  const hasUrgentDropoff = Boolean(passengers.activePassengerInterruptionBooking);
  const hasPendingBooking = data.isTripOngoing && !hasUrgentDropoff && Boolean(passengers.activePendingBooking);
  const pendingLayout = getDriverPendingBookingLayout(height, data.insets.top, data.insets.bottom, fontScale);
  const layout = getDriverNavigationLayout(height, data.insets.top, data.insets.bottom, fontScale);
  const nextStop = mapState.waypoints[mapState.currentWaypointIndex];
  const hidePassengerPanel = usePassengerPanelVisibility(data.tripId, nextStop, mapState.currentLocation,
    data.isTripOngoing && data.isScreenActive && !offline && !hasPendingBooking && !hasUrgentDropoff &&
    !passengers.activeDriverInterruptionRequest);
  const nextPassengerId = !nextStop?.completed ? nextStop?.booking?.passengerId : undefined;
  const contactActions = <NavigationAssistanceButtons inline showSos={false} role="driver"
    onContact={nextPassengerId && !hasPendingBooking && !hasUrgentDropoff ? () => assistance.openContact(nextPassengerId) : assistance.openContacts}
    onSos={assistance.openSos} disabled={!assistance.enabled} />;
  const recovery = data.isTripOngoing && !hasUrgentDropoff && Boolean(data.bookings?.length) ? <View style={styles.confirmation}>
    <RideRecoveryControl tripId={data.tripId} bookings={data.bookings} actor="driver"
      condensed driverNavigation mapCompact hideWhenCruising={hidePassengerPanel} secondaryActions={contactActions} driverOverviewOnly={hasPendingBooking}
      preferredBookingId={!nextStop?.completed ? nextStop?.booking?.id : undefined}
      preferredStage={!nextStop?.completed ? nextStop?.type : undefined}
      fix={mapState.currentLocation ? { ...mapState.currentLocation.coords, recordedAt: mapState.currentLocation.timestamp, accuracy: mapState.currentLocation.coords.accuracy ?? undefined } : null}
      destination={data.tripArrivalCoordinate} />
  </View> : null;
  const urgent = data.isTripOngoing && (hasUrgentDropoff || hasPendingBooking) ? <DriverNavigationPassengersBar
    onContact={assistance.openContact} foundation={model.session.foundation}
    passengerPresentation={model.passengerPresentation} bookingActions={model.bookingActions} /> : null;
  return <View testID="driver-navigation-top-panel" pointerEvents="box-none" style={[styles.panel, {
    bottom: layout.panelBottom, left: Math.max(data.insets.left, 12), right: Math.max(data.insets.right, 12),
    maxHeight: hasPendingBooking || hasUrgentDropoff ? pendingLayout.panelMaxHeight : layout.panelMaxHeight,
  }]}>
    <View style={styles.journey}>
    <LocationAccessBanner active={data.isScreenActive && data.isTripOngoing} background="ride" />
    {urgent && (fontScale > 1.3 ? <ScrollView style={styles.urgentScroll} bounces={false} showsVerticalScrollIndicator>{urgent}</ScrollView> : urgent)}
    <ScrollView style={[styles.bodyScroll, (hasUrgentDropoff || hasPendingBooking) && styles.priorityFooter]}
      contentContainerStyle={styles.journeyContent} showsVerticalScrollIndicator bounces={false}>
    {model.session.locationTracking?.backgroundTrackingUnavailable && data.isTripOngoing &&
      <Text accessibilityLiveRegion="polite" style={styles.gpsWarning}>Suivi en veille à vérifier. Gardez Zwanga ouvert et vérifiez l’autorisation de localisation « Toujours ».</Text>}
    {data.trip?.tripRequestId && <TripDriverWithdrawal trip={data.trip} bookings={data.bookings}
      active={data.isScreenActive && !offline && !data.isRestartingTrip && !data.isPausingTrip &&
        !data.isCancellingPickupBypassBooking && !data.isRequestingDriverInterruption && !data.isCancellingDriverInterruption}
      onWithdrawn={model.session.foundation.exitActions.navigateHomeSafely} />}
    {(data.isTripOngoing || data.trip?.status === 'completed') && !hasUrgentDropoff && !hasPendingBooking && <View style={styles.details}>
      {data.trip?.status === 'completed' && <DriverDropoffReceipts bookings={data.bookings ?? EMPTY_BOOKINGS} tripId={data.tripId} active={data.isScreenActive} />}
      {data.isTripOngoing && !hidePassengerPanel && <DriverNavigationPassengersBar
        compact
        onContact={assistance.openContact}
        foundation={model.session.foundation} passengerPresentation={model.passengerPresentation} bookingActions={model.bookingActions} />}
    </View>}
    {recovery}
    {!recovery && <View style={styles.actions}>{contactActions}</View>}
    </ScrollView>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', zIndex: 40 },
  journey: { flexGrow: 0, flexShrink: 1, minHeight: 0, backgroundColor: Colors.white, borderRadius: 22, padding: 12 },
  journeyContent: { gap: 6 },
  bodyScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  priorityFooter: { flexShrink: 1, minHeight: 56 },
  urgentScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexShrink: 0 },
  confirmation: { flexShrink: 0, minWidth: 130 },
  details: { gap: 6, paddingBottom: 2 },
  gpsWarning: { color: Colors.dangerDark, fontSize: 12, lineHeight: 17 },
});
