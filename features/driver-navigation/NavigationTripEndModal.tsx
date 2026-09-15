import { formatTripRevenueAmount } from './navigationPresentation';
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
            <View style={styles.tripRevenueSummary}>
              {tripEndNotice.revenueSummary.confirmedAmount > 0 ? (
                <View style={styles.tripRevenueRow}>
                  <View style={[styles.tripRevenueIcon, { backgroundColor: Colors.success + '18' }]}>
                    <Ionicons name="wallet-outline" size={20} color={Colors.successDark} />
                  </View>
                  <View style={styles.tripRevenueCopy}>
                    <Text style={styles.tripRevenueLabel}>Gain ajouté</Text>
                    <Text style={styles.tripRevenueHint}>Disponible dans vos gains conducteur</Text>
                  </View>
                  <Text style={[styles.tripRevenueAmount, { color: Colors.successDark }]}>
                    {formatTripRevenueAmount(
                      tripEndNotice.revenueSummary.confirmedAmount,
                      tripEndNotice.revenueSummary.currency,
                    )}
                  </Text>
                </View>
              ) : null}
              {tripEndNotice.revenueSummary.cashToCollectAmount > 0 ? (
                <View style={styles.tripRevenueRow}>
                  <View style={[styles.tripRevenueIcon, { backgroundColor: Colors.warning + '18' }]}>
                    <Ionicons name="cash-outline" size={20} color={Colors.warningDark} />
                  </View>
                  <View style={styles.tripRevenueCopy}>
                    <Text style={styles.tripRevenueLabel}>À encaisser en liquide</Text>
                    <Text style={styles.tripRevenueHint}>À recevoir directement du passager</Text>
                  </View>
                  <Text style={[styles.tripRevenueAmount, { color: Colors.warningDark }]}>
                    {formatTripRevenueAmount(
                      tripEndNotice.revenueSummary.cashToCollectAmount,
                      tripEndNotice.revenueSummary.currency,
                    )}
                  </Text>
                </View>
              ) : null}
              {tripEndNotice.revenueSummary.electronicPendingAmount > 0 ? (
                <View style={styles.tripRevenueRow}>
                  <View style={[styles.tripRevenueIcon, { backgroundColor: Colors.info + '18' }]}>
                    <Ionicons name="time-outline" size={20} color={Colors.infoDark} />
                  </View>
                  <View style={styles.tripRevenueCopy}>
                    <Text style={styles.tripRevenueLabel}>Paiement électronique attendu</Text>
                    <Text style={styles.tripRevenueHint}>Ajouté après confirmation FlexPay</Text>
                  </View>
                  <Text style={[styles.tripRevenueAmount, { color: Colors.infoDark }]}>
                    {formatTripRevenueAmount(
                      tripEndNotice.revenueSummary.electronicPendingAmount,
                      tripEndNotice.revenueSummary.currency,
                    )}
                  </Text>
                </View>
              ) : null}
              {tripEndNotice.revenueSummary.totalExpectedAmount <= 0 ? (
                <View style={styles.tripRevenueEmpty}>
                  <Ionicons name="checkmark-circle-outline" size={20} color={Colors.gray[500]} />
                  <Text style={styles.tripRevenueHint}>Aucun montant à encaisser pour ce trajet.</Text>
                </View>
              ) : null}
            </View>
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
                ? `Arrivée détectée a ${Math.max(1, Math.round(tripEndNotice.distanceMeters))} m`
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
