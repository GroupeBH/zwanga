import { NavigationTripRevenueSummary } from './NavigationTripRevenueSummary';
import { TripEndNotice } from './navigationModel';
import { styles } from '../screen-styles/app/trip/navigate/detail/index';
import { Colors, Spacing } from '@/constants/styles';
import type { Trip } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface NavigationTripEndModalProps {
  tripEndNotice: TripEndNotice | null;
  backgroundDisclosureVisible: boolean;
  securityModalVisible: boolean;
  dismissTripEndNotice: () => void;
  insets: EdgeInsets;
  trip: Trip | undefined;
  handleRatePassengersFromTripEnd: () => void;
}

export function NavigationTripEndModal({
  tripEndNotice,
  backgroundDisclosureVisible,
  securityModalVisible,
  dismissTripEndNotice,
  insets,
  trip,
  handleRatePassengersFromTripEnd,
}: NavigationTripEndModalProps) {
  return (
    <Modal
      visible={
        Boolean(tripEndNotice) &&
        !backgroundDisclosureVisible &&
        !securityModalVisible
      }
      transparent
      animationType="slide"
      onRequestClose={dismissTripEndNotice}
    >
      <View style={styles.waypointModalOverlay}>
        <View style={[styles.waypointModalContent, { paddingBottom: Math.max(insets.bottom, Spacing.xl) + Spacing.lg }]}>
          <View style={styles.waypointModalHandle} />
          <View style={[styles.waypointModalIcon, { backgroundColor: Colors.success }]}>
            <Ionicons name="flag" size={32} color={Colors.white} />
          </View>
          <Text style={styles.waypointModalTitle}>Trajet terminé</Text>
          <Text style={styles.waypointModalPassenger}>
            {trip?.arrival?.name ?? 'Destination finale'}
          </Text>
          <View style={styles.waypointModalAddressContainer}>
            <Ionicons name="location" size={18} color={Colors.gray[500]} />
            <Text style={styles.waypointModalAddress}>
              {trip?.arrival?.address ?? trip?.arrival?.name ?? 'Arrivée du trajet'}
            </Text>
          </View>
          <Text style={styles.waypointModalWaitingText}>
            {tripEndNotice?.completedWhileAppInactive
              ? "Le trajet s'est terminé pendant que le téléphone était en veille ou hors de l'application. Il est maintenant clôturé. Vous pouvez noter les passagers."
              : 'Vous avez atteint la destination finale. Le trajet est terminé automatiquement. Vous pouvez noter les passagers.'}
          </Text>
          {tripEndNotice?.revenueSummary ? (
            <NavigationTripRevenueSummary summary={tripEndNotice.revenueSummary} />
          ) : tripEndNotice?.revenueSummaryUnavailable ? (
            <View style={styles.tripRevenueLoading}>
              <Ionicons name="cloud-offline-outline" size={18} color={Colors.gray[500]} />
              <Text style={styles.tripRevenueHint}>
                Le détail du gain reste disponible dans l&apos;espace conducteur.
              </Text>
            </View>
          ) : (
            <View style={styles.tripRevenueLoading}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.tripRevenueHint}>Calcul du montant du trajet…</Text>
            </View>
          )}
          <View
            style={[
              styles.waypointGpsStatus,
              {
                backgroundColor: Colors.success + '15',
                borderColor: Colors.success,
              },
            ]}
          >
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <Text style={[styles.waypointGpsStatusText, { color: Colors.success }]}>
              {tripEndNotice?.distanceMeters !== undefined
                ? `Arrivée détectée à ${Math.max(1, Math.round(tripEndNotice.distanceMeters))} m`
                : 'Arrivée détectée'}
            </Text>
          </View>
          <Text style={styles.waypointModalWaitingText}>
            L&apos;embarquement est validé automatiquement lorsque les deux téléphones se déplacent ensemble.
          </Text>
          <View style={styles.waypointModalActions}>
            <TouchableOpacity
              style={styles.waypointModalSecondaryButton}
              onPress={dismissTripEndNotice}
            >
              <Text style={styles.waypointModalSecondaryButtonText}>Plus tard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.waypointModalPrimaryButton}
              onPress={() => void handleRatePassengersFromTripEnd()}
            >
              <Ionicons name="star" size={20} color={Colors.white} />
              <Text style={styles.waypointModalPrimaryButtonText}>Noter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
