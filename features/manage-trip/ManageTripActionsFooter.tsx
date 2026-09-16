import { useManageTripState } from '../../hooks/manage-trip/useManageTripState';
import { styles } from '../screen-styles/app/trip/manage/detail/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

interface ManageTripActionsFooterProps {
  state: ReturnType<typeof useManageTripState>;
  actions: { handleOpenNavigation: () => void; handleStartTrip: () => Promise<void>; handleOpenTripEdit: () => void; handleCancelTrip: () => void; handlePauseTrip: () => Promise<void>; };
  canCompleteTrip: boolean;
}

export function ManageTripActionsFooter({
  state,
  actions,
  canCompleteTrip,
}: ManageTripActionsFooterProps) {
  const trip = state.trip;
  if (!trip) return null;
  return (
    <View style={[styles.stickyFooter, { paddingBottom: Math.max(state.insets.bottom, 16) + 16 }]}>
      {trip.status === 'upcoming' && (
        <>
          <View style={styles.upcomingActionsRow}>
            <TouchableOpacity
              style={[styles.primaryButton, styles.startTripButton, styles.footerPrimaryAction]}
              onPress={actions.handleStartTrip}
              disabled={state.isStartingTrip}
              activeOpacity={0.8}
            >
              {state.isStartingTrip ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="play" size={20} color={Colors.white} />
                  <Text style={styles.primaryButtonText}>Démarrer</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerSecondaryAction, styles.editTripFooterButton]}
              onPress={actions.handleOpenTripEdit}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Modifier le trajet"
            >
              <Ionicons name="create-outline" size={20} color={Colors.primary} />
              <Text style={styles.footerSecondaryActionText} numberOfLines={1}>Modifier</Text>
            </TouchableOpacity>
          </View>
          {!trip.tripRequestId && (
            <TouchableOpacity
              style={[styles.secondaryButton, styles.footerFullWidthButton, styles.cancelTripFooterButton]}
              onPress={actions.handleCancelTrip}
              disabled={state.isUpdatingTripStatus}
              activeOpacity={0.8}
            >
              {state.isUpdatingTripStatus ? (
                <ActivityIndicator color={Colors.danger} />
              ) : (
                <Text style={[styles.secondaryButtonText, { color: Colors.danger }]}>Annuler</Text>
              )}
            </TouchableOpacity>
          )}
        </>
      )}

      {canCompleteTrip && (
        <View style={[styles.primaryButton, styles.completeTripButton, styles.footerFullWidthButton]}>
          <Ionicons name="checkmark-done" size={20} color={Colors.white} />
          <Text style={styles.primaryButtonText}>Finalisation automatique</Text>
        </View>
      )}

      {trip.status === 'ongoing' && !canCompleteTrip && (
        <View style={styles.ongoingActionsRow}>
          <TouchableOpacity
            style={[styles.primaryButton, styles.navigationButton, styles.footerPrimaryAction]}
            onPress={actions.handleOpenNavigation}
            activeOpacity={0.8}
          >
            <Ionicons name="navigate" size={20} color={Colors.white} />
            <Text style={styles.primaryButtonText} numberOfLines={1}>Navigation</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.footerSecondaryAction, styles.editTripFooterButton]}
            onPress={actions.handleOpenTripEdit}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Modifier le trajet"
          >
            <Ionicons name="create-outline" size={20} color={Colors.primary} />
            <Text style={styles.footerSecondaryActionText} numberOfLines={1}>Modifier</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.footerSecondaryAction, styles.pauseTripFooterButton]}
            onPress={actions.handlePauseTrip}
            disabled={state.isPausingTrip || state.isRequestingDriverInterruption}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Interrompre le trajet"
          >
            {state.isPausingTrip || state.isRequestingDriverInterruption ? (
              <ActivityIndicator color={Colors.warning} />
            ) : (
              <>
                <Ionicons name="pause" size={20} color={Colors.warning} />
                <Text style={[styles.footerSecondaryActionText, styles.pauseTripFooterButtonText]} numberOfLines={1}>
                  Pause
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {trip.status === 'completed' && (
        <TouchableOpacity
          style={[styles.primaryButton, styles.footerFullWidthButton, { backgroundColor: Colors.secondary }]}
          onPress={() => state.router.push(`/rate/${trip.id}`)}
          activeOpacity={0.8}
        >
          <Ionicons name="star" size={20} color={Colors.white} />
          <Text style={styles.primaryButtonText}>Évaluer les passagers</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
