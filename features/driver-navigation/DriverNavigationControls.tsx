import { useDriverNavigationFoundation } from '../../hooks/driver-navigation/useDriverNavigationFoundation';
import { normalizeDriverLocationObject } from './navigationBooking';
import { styles } from '../screen-styles/app/trip/navigate/detail/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';

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
  return (
    <View style={styles.floatingButtons}>
      <TouchableOpacity
        style={styles.floatingButton}
        onPress={() => foundation.mapState.setSecurityModalVisible(true)}
      >
        <Ionicons name="shield-checkmark" size={22} color={Colors.primary} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.floatingButton}
        onPress={tripActions.handleEditTripFromNavigation}
        accessibilityRole="button"
        accessibilityLabel="Modifier le trajet"
      >
        <Ionicons name="create-outline" size={22} color={Colors.primary} />
      </TouchableOpacity>

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

      <TouchableOpacity
        style={[
          styles.floatingButton,
          foundation.data.isCreatingTripShareLink && styles.floatingButtonDisabled,
        ]}
        onPress={() => void tripActions.handleShareTrip()}
        disabled={foundation.data.isCreatingTripShareLink}
        accessibilityRole="button"
        accessibilityLabel="Partager le trajet"
      >
        {foundation.data.isCreatingTripShareLink ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Ionicons name="share-social-outline" size={22} color={Colors.primary} />
        )}
      </TouchableOpacity>

      {/* Bouton recalculer l'itinéraire */}
      {foundation.passengers.passengerMapLocations.length > 0 && (
        <TouchableOpacity
          style={styles.floatingButton}
          onPress={passengerPresentation.fitVehicleAndPassengers}
          accessibilityRole="button"
          accessibilityLabel="Voir le véhicule et les passagers"
        >
          <Ionicons name="people" size={22} color={Colors.primary} />
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.floatingButton, foundation.mapState.isLoadingRoute && styles.floatingButtonDisabled]}
        onPress={forceRecalculateRoute}
        disabled={foundation.mapState.isLoadingRoute}
      >
        <Ionicons name="refresh" size={22} color={foundation.mapState.isLoadingRoute ? Colors.gray[400] : Colors.primary} />
      </TouchableOpacity>

      {/* Bouton recentrer */}
      <TouchableOpacity
        style={styles.floatingButton}
        onPress={() => {
          const loc = foundation.refs.currentLocationRef.current || foundation.mapState.currentLocation;
          const normalizedLocation = normalizeDriverLocationObject(loc);
          if (normalizedLocation) {
            foundation.focusMapOnCoordinates(
              [
                {
                  latitude: normalizedLocation.coords.latitude,
                  longitude: normalizedLocation.coords.longitude,
                },
              ],
              {
                durationMs: 300,
                edgePadding: { top: 150, right: 50, bottom: 300, left: 50 },
                logContext: 'recenter-driver',
                singleCoordinateDelta: 0.005,
              },
            );
          }
        }}
      >
        <Ionicons name="locate" size={24} color={Colors.primary} />
      </TouchableOpacity>
    </View>
  );
}
import type { RouteStep, Waypoint } from './navigationModel';
