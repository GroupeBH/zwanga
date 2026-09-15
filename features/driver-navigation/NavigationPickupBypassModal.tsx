import { PickupBypassConfirmation, TripEndNotice } from './navigationModel';
import { styles } from '../screen-styles/app/trip/navigate/detail/index';
import { Colors, Spacing } from '@/constants/styles';
import type { Trip } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface NavigationPickupBypassModalProps {
  pickupBypassConfirmation: PickupBypassConfirmation | null;
  backgroundDisclosureVisible: boolean;
  securityModalVisible: boolean;
  tripEndNotice: TripEndNotice | null;
  insets: EdgeInsets;
  trip: Trip | undefined;
  pauseTripWithoutPassengerConfirmation: () => Promise<void>;
  pickupBypassAction: "cancel" | "confirm" | null;
  isPausingTrip: boolean;
  handleCancelBypassedPickup: () => Promise<void>;
  isCancellingPickupBypassBooking: boolean;
  handleConfirmBypassedPickup: () => Promise<void>;
}

export function NavigationPickupBypassModal({
  pickupBypassConfirmation,
  backgroundDisclosureVisible,
  securityModalVisible,
  tripEndNotice,
  insets,
  trip,
  pauseTripWithoutPassengerConfirmation,
  pickupBypassAction,
  isPausingTrip,
  handleCancelBypassedPickup,
  isCancellingPickupBypassBooking,
  handleConfirmBypassedPickup,
}: NavigationPickupBypassModalProps) {
  return (
    <Modal
      visible={
        Boolean(pickupBypassConfirmation) &&
        !backgroundDisclosureVisible &&
        !securityModalVisible &&
        !tripEndNotice
      }
      transparent
      animationType="slide"
      onRequestClose={() => undefined}
    >
      <View style={styles.waypointModalOverlay}>
        <View
          style={[
            styles.waypointModalContent,
            { paddingBottom: Math.max(insets.bottom, Spacing.xl) + Spacing.lg },
          ]}
        >
          <View style={styles.waypointModalHandle} />
          <View style={[styles.waypointModalIcon, { backgroundColor: Colors.warning }]}>
            <Ionicons name="help-circle" size={32} color={Colors.white} />
          </View>
          <Text style={styles.waypointModalTitle}>Embarquement a confirmer</Text>
          <Text style={styles.waypointModalPassenger}>
            {pickupBypassConfirmation?.waypoint.passenger.name || 'Passager'}
          </Text>
          <View style={styles.waypointModalAddressContainer}>
            <Ionicons name="location" size={18} color={Colors.gray[500]} />
            <Text style={styles.waypointModalAddress}>
              {pickupBypassConfirmation?.waypoint.address ||
                'Point de prise en charge du passager'}
            </Text>
          </View>
          <Text style={styles.waypointModalWaitingText}>
            Vous avez depasse le point de prise en charge sans confirmation automatique.
            Le passager est-il deja a bord ?
          </Text>
          <View style={[styles.waypointGpsStatus, styles.pickupBypassStatus]}>
            <Ionicons name="navigate-circle" size={18} color={Colors.warningDark} />
            <Text style={[styles.waypointGpsStatusText, { color: Colors.warningDark }]}>
              {pickupBypassConfirmation?.distanceMeters !== undefined
                ? `Point depasse, distance actuelle ${Math.max(
                    1,
                    pickupBypassConfirmation.distanceMeters,
                  )} m`
                : 'Point de prise en charge depasse'}
            </Text>
          </View>
          <View style={styles.waypointModalActions}>
            {trip?.tripRequestId ? (
              <TouchableOpacity
                style={[
                  styles.waypointModalSecondaryButton,
                  styles.pickupBypassDecisionButton,
                ]}
                onPress={() => void pauseTripWithoutPassengerConfirmation()}
                disabled={
                  Boolean(pickupBypassAction) ||
                  isPausingTrip
                }
              >
                {isPausingTrip ? (
                  <ActivityIndicator size="small" color={Colors.warningDark} />
                ) : (
                  <>
                    <Ionicons name="pause-circle" size={20} color={Colors.warningDark} />
                    <Text style={styles.waypointModalSecondaryButtonText}>
                      Arrêter le trajet
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.waypointModalSecondaryButton,
                  styles.pickupBypassDecisionButton,
                  styles.pickupBypassCancelButton,
                ]}
                onPress={() => void handleCancelBypassedPickup()}
                disabled={
                  Boolean(pickupBypassAction) ||
                  isCancellingPickupBypassBooking
                }
              >
                {pickupBypassAction === 'cancel' ? (
                  <ActivityIndicator size="small" color={Colors.danger} />
                ) : (
                  <>
                    <Ionicons name="close-circle" size={20} color={Colors.danger} />
                    <Text
                      style={[
                        styles.waypointModalSecondaryButtonText,
                        styles.pickupBypassCancelButtonText,
                      ]}
                    >
                      Annuler reservation
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.waypointModalPrimaryButton,
                styles.pickupBypassDecisionButton,
                styles.pickupBypassConfirmButton,
              ]}
              onPress={() => void handleConfirmBypassedPickup()}
              disabled={
                Boolean(pickupBypassAction) ||
                isCancellingPickupBypassBooking
              }
            >
              {pickupBypassAction === 'confirm' ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
                  <Text style={styles.waypointModalPrimaryButtonText}>Pris en charge</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
