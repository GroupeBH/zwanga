import { useDriverNavigationController } from '../../../hooks/driver-navigation/useDriverNavigationController';
import { DriverNavigationControls } from '../../../features/driver-navigation/DriverNavigationControls';
import { DriverNavigationTopPanel } from '@/features/driver-navigation/DriverNavigationTopPanel';
import { DriverNavigationMap } from '../../../features/driver-navigation/DriverNavigationMap';
import { NavigationLocationDisclosure } from '../../../features/driver-navigation/NavigationLocationDisclosure';
import { NavigationPassengersModal } from '../../../features/driver-navigation/NavigationPassengersModal';
import { NavigationPickupBypassModal } from '../../../features/driver-navigation/NavigationPickupBypassModal';
import { NavigationSecurityModal } from '../../../features/driver-navigation/NavigationSecurityModal';
import { NavigationWaypointModal } from '../../../features/driver-navigation/NavigationWaypointModal';
import { NavigationPickupNoticeModal } from '../../../features/driver-navigation/NavigationPickupNoticeModal';
import { NavigationTripEndModal } from '../../../features/driver-navigation/NavigationTripEndModal';
import { cleanHtmlInstructions } from '../../../features/driver-navigation/navigationPresentation';
import { KINSHASA_FALLBACK_MAP_COORDINATE } from '../../../features/driver-navigation/navigationModel';
import { styles } from '../../../features/screen-styles/app/trip/navigate/detail/index';
import { NavigationAssistanceModals } from '@/features/navigation/NavigationAssistanceModals';
import { useNavigationAssistance } from '@/hooks/navigation/useNavigationAssistance';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { RideOverlayScope } from '@/features/navigation/RideOverlayProvider';
import { ActivityIndicator, StatusBar, Text, TouchableOpacity, View } from 'react-native';

export default function NavigationScreen() {
  const model = useDriverNavigationController();
  const assistance = useNavigationAssistance({
    role: 'driver', trip: model.session.foundation.data.trip,
    bookings: model.session.foundation.data.bookings,
    isScreenActive: model.session.foundation.data.isScreenActive,
  });
  const assistanceOrSecurityVisible = assistance.isOpen || model.session.foundation.mapState.securityModalVisible;

  if ((model.session.foundation.data.isLoading && !model.session.foundation.data.trip) || (model.session.foundation.data.bookingsLoading && !model.session.foundation.data.bookings) || !model.session.foundation.data.trip) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Chargement de la navigation...</Text>
      </View>
    );
  }

  if (!model.presentation.hasValidTripCoordinates) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="warning" size={48} color={Colors.warning} />
        <Text style={styles.loadingText}>Coordonnées du trajet invalides</Text>
        <TouchableOpacity
          style={styles.backButtonAlt}
          onPress={model.session.foundation.exitActions.navigateBackSafely}
        >
          <Text style={styles.backButtonAltText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentStep = model.session.foundation.mapState.steps[model.session.foundation.mapState.currentStepIndex];
  const initialMapCoordinate =
    model.presentation.currentDriverCoordinate ??
    model.session.foundation.data.tripDepartureCoordinate ??
    KINSHASA_FALLBACK_MAP_COORDINATE;

  return (
    <RideOverlayScope scopeKey={`driver:${model.session.foundation.data.tripId}`} active={model.session.foundation.data.isScreenActive}>
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* La carte native est libérée avant les changements d'écran. */}
      {model.session.foundation.mapState.shouldRenderMap ? (
      <DriverNavigationMap
        foundation={model.session.foundation}
        initialMapCoordinate={initialMapCoordinate}
        presentation={model.presentation}
      />
      ) : <View style={[styles.map, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>}

      {!model.session.foundation.data.isTripOngoing && (
        <View style={styles.preStartOverlay}>
          <View style={styles.preStartCard}>
            <View style={styles.preStartIconWrap}>
              <Ionicons
                name={model.session.foundation.data.trip?.status === 'completed' ? 'flag' : model.session.foundation.data.trip?.status === 'cancelled' ? 'close-circle' : 'time-outline'}
                size={26}
                color={Colors.primary}
              />
            </View>
            <Text style={styles.preStartTitle}>
              {model.session.foundation.data.trip?.status === 'upcoming'
                ? 'Trajet pas encore démarré'
                : model.session.foundation.data.trip?.status === 'completed'
                  ? 'Trajet terminé'
                  : model.session.foundation.data.trip?.status === 'cancelled'
                    ? 'Trajet annulé'
                    : 'Navigation en pause'}
            </Text>
            <Text style={styles.preStartText}>
              {model.session.foundation.data.trip?.status === 'upcoming'
                ? 'Le trajet doit être demarré avant d\'activer la navigation en direct.'
                : 'La navigation en direct est disponible uniquement pour un trajet en cours.'}
            </Text>
            <View style={styles.preStartActions}>
              <TouchableOpacity
                style={[styles.preStartButton, styles.preStartButtonPrimary]}
                onPress={
                  model.presentation.canRestartTripFromOverlay
                    ? () => void model.interruptionActions.handleRestartTripFromNavigation()
                    : () => model.session.foundation.data.refetchTrip()
                }
                disabled={model.presentation.isRestartOverlayActionLoading}
              >
                {model.presentation.isRestartOverlayActionLoading ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.preStartButtonPrimaryText}>
                    {model.presentation.canRestartTripFromOverlay ? 'Redemarrer' : 'Actualiser'}
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.preStartButton, styles.preStartButtonSecondary]}
                onPress={model.handleExitNavigation}
              >
                <Text style={styles.preStartButtonSecondaryText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <DriverNavigationTopPanel model={model} assistance={assistance} />

      {/* Instructions de navigation */}
      {model.session.foundation.data.isTripOngoing && !model.session.foundation.mapState.isLoadingRoute && currentStep && (
        <View style={styles.instructionCard}>
          <View style={styles.instructionHeader}>
            <View style={styles.maneuverIcon}>
              <Ionicons 
                name={model.routeFormatting.getManeuverIcon(currentStep.maneuver) as any}
                size={36} 
                color={Colors.white} 
              />
            </View>
            <View style={styles.instructionInfo}>
              <Text style={styles.instructionText}>
                {cleanHtmlInstructions(currentStep.html_instructions)}
              </Text>
              <Text style={styles.instructionDistance}>{currentStep.distance.text}</Text>
            </View>
          </View>

          {/* Prochaine instruction */}
          {model.session.foundation.mapState.currentStepIndex < model.session.foundation.mapState.steps.length - 1 && (
            <View style={styles.nextInstruction}>
              <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
              <Text style={styles.nextInstructionText}>
                Ensuite : {cleanHtmlInstructions(model.session.foundation.mapState.steps[model.session.foundation.mapState.currentStepIndex + 1].html_instructions)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Loading route indicator */}
      {model.session.foundation.data.isTripOngoing && model.session.foundation.mapState.isLoadingRoute && (
        <View style={styles.loadingRouteCard}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingRouteText}>
            {model.session.foundation.mapState.isReroutingRoute ? "Recalcul de l'itinéraire..." : "Calcul de l'itinéraire..."}
          </Text>
        </View>
      )}

      {/* Boutons d'action flottants */}
      {model.session.foundation.data.isTripOngoing && (
      <DriverNavigationControls
        foundation={model.session.foundation}
        tripActions={model.tripActions}
        voice={model.voice}
        passengerPresentation={model.passengerPresentation}
        forceRecalculateRoute={model.forceRecalculateRoute}
      />
      )}

      {/* Disclosure localisation arrière-plan */}
      <NavigationLocationDisclosure
        backgroundDisclosureVisible={model.session.foundation.mapState.backgroundDisclosureVisible}
        resolveBackgroundDisclosure={model.session.foundation.resolveBackgroundDisclosure}
      />

      <NavigationSecurityModal
        securityModalVisible={model.session.foundation.mapState.securityModalVisible && !assistance.isOpen}
        backgroundDisclosureVisible={model.session.foundation.mapState.backgroundDisclosureVisible}
        setSecurityModalVisible={model.session.foundation.mapState.setSecurityModalVisible}
        insets={model.session.foundation.data.insets}
        trip={model.session.foundation.data.trip}
      />

      <NavigationTripEndModal
        tripEndNotice={model.session.foundation.mapState.tripEndNotice}
        backgroundDisclosureVisible={model.session.foundation.mapState.backgroundDisclosureVisible}
        securityModalVisible={assistanceOrSecurityVisible}
        dismissTripEndNotice={model.pickupActions.dismissTripEndNotice}
        insets={model.session.foundation.data.insets}
        trip={model.session.foundation.data.trip}
        handleRatePassengersFromTripEnd={model.handleRatePassengersFromTripEnd}
      />

      <NavigationPickupBypassModal
        pickupBypassConfirmation={model.session.foundation.mapState.pickupBypassConfirmation}
        backgroundDisclosureVisible={model.session.foundation.mapState.backgroundDisclosureVisible}
        securityModalVisible={assistanceOrSecurityVisible}
        tripEndNotice={model.session.foundation.mapState.tripEndNotice}
        insets={model.session.foundation.data.insets}
        trip={model.session.foundation.data.trip}
        pauseTripWithoutPassengerConfirmation={model.interruptionActions.pauseTripWithoutPassengerConfirmation}
        pickupBypassAction={model.session.foundation.mapState.pickupBypassAction}
        isPausingTrip={model.session.foundation.data.isPausingTrip}
        handleCancelBypassedPickup={model.pickupActions.handleCancelBypassedPickup}
        isCancellingPickupBypassBooking={model.session.foundation.data.isCancellingPickupBypassBooking}
        handleConfirmBypassedPickup={model.pickupActions.handleConfirmBypassedPickup}
      />

      <NavigationPickupNoticeModal
        pickupNotice={model.session.foundation.mapState.pickupNotice}
        backgroundDisclosureVisible={model.session.foundation.mapState.backgroundDisclosureVisible}
        securityModalVisible={assistanceOrSecurityVisible}
        tripEndNotice={model.session.foundation.mapState.tripEndNotice}
        pickupBypassConfirmation={model.session.foundation.mapState.pickupBypassConfirmation}
        dismissPickupNotice={model.pickupActions.dismissPickupNotice}
        insets={model.session.foundation.data.insets}
        pickupNoticeCountdown={model.session.foundation.mapState.pickupNoticeCountdown}
      />

      {/* Modal de waypoint stylise */}
      <NavigationWaypointModal
        waypointModalVisible={model.session.foundation.mapState.waypointModalVisible}
        activeWaypoint={model.session.foundation.mapState.activeWaypoint}
        backgroundDisclosureVisible={model.session.foundation.mapState.backgroundDisclosureVisible}
        securityModalVisible={assistanceOrSecurityVisible}
        tripEndNotice={model.session.foundation.mapState.tripEndNotice}
        pickupNotice={model.session.foundation.mapState.pickupNotice}
        pickupBypassConfirmation={model.session.foundation.mapState.pickupBypassConfirmation}
        handleDismissWaypointModal={model.pickupActions.handleDismissWaypointModal}
        insets={model.session.foundation.data.insets}
        handleReportPassenger={model.pickupActions.handleReportPassenger}
      />

      {/* Panneau des passagers */}
      <NavigationPassengersModal
        passengersPanelVisible={model.session.foundation.mapState.passengersPanelVisible}
        backgroundDisclosureVisible={model.session.foundation.mapState.backgroundDisclosureVisible}
        securityModalVisible={assistanceOrSecurityVisible}
        tripEndNotice={model.session.foundation.mapState.tripEndNotice}
        pickupNotice={model.session.foundation.mapState.pickupNotice}
        pickupBypassConfirmation={model.session.foundation.mapState.pickupBypassConfirmation}
        waypointModalVisible={model.session.foundation.mapState.waypointModalVisible}
        setPassengersPanelVisible={model.session.foundation.mapState.setPassengersPanelVisible}
        insets={model.session.foundation.data.insets}
        passengerStats={model.passengerPresentation.passengerStats}
        waypoints={model.session.foundation.mapState.waypoints}
        currentWaypointIndex={model.session.foundation.mapState.currentWaypointIndex}
        waypointModalVisibleRef={model.session.foundation.refs.waypointModalVisibleRef}
        setActiveWaypoint={model.session.foundation.mapState.setActiveWaypoint}
        setWaypointModalVisible={model.session.foundation.mapState.setWaypointModalVisible}
        openReportForWaypoint={model.pickupActions.openReportForWaypoint}
      />
      <NavigationAssistanceModals assistance={assistance} role="driver" insets={model.session.foundation.data.insets}
        blocked={model.session.foundation.mapState.backgroundDisclosureVisible} />
    </View>
    </RideOverlayScope>
  );
}
