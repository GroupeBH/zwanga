import { PickupNotice, PickupBypassConfirmation, TripEndNotice } from './navigationModel';
import { styles } from '../screen-styles/app/trip/navigate/detail/index';
import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { RideModal as Modal } from '@/features/navigation/RideModal';
import { Text, TouchableOpacity, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface NavigationPickupNoticeModalProps {
  pickupNotice: PickupNotice | null;
  backgroundDisclosureVisible: boolean;
  securityModalVisible: boolean;
  tripEndNotice: TripEndNotice | null;
  pickupBypassConfirmation: PickupBypassConfirmation | null;
  dismissPickupNotice: () => void;
  insets: EdgeInsets;
  pickupNoticeCountdown: number | null;
}

export function NavigationPickupNoticeModal({
  pickupNotice,
  backgroundDisclosureVisible,
  securityModalVisible,
  tripEndNotice,
  pickupBypassConfirmation,
  dismissPickupNotice,
  insets,
  pickupNoticeCountdown,
}: NavigationPickupNoticeModalProps) {
  return (
    <Modal
      visible={
        Boolean(pickupNotice) &&
        !backgroundDisclosureVisible &&
        !securityModalVisible &&
        !tripEndNotice &&
        !pickupBypassConfirmation
      }
      transparent
      animationType="slide"
      onRequestClose={dismissPickupNotice}
    >
      <View style={styles.waypointModalOverlay}>
        <View style={[styles.waypointModalContent, { paddingBottom: Math.max(insets.bottom, Spacing.xl) + Spacing.lg }]}>
          <View style={styles.waypointModalHandle} />
          <View
            style={[
              styles.waypointModalIcon,
              {
                backgroundColor:
                  pickupNotice?.type === 'passenger_ready_pickup'
                    ? Colors.success
                    : pickupNotice?.type === 'parties_nearby'
                      ? Colors.primary
                      : Colors.secondary,
              },
            ]}
          >
            <Ionicons
              name={
                pickupNotice?.type === 'passenger_ready_pickup'
                  ? 'hand-left'
                  : pickupNotice?.type === 'parties_nearby'
                    ? 'people'
                    : 'time'
              }
              size={32}
              color={Colors.white}
            />
          </View>
          <Text style={styles.waypointModalTitle}>
            {pickupNotice?.type === 'passenger_ready_pickup'
              ? "Le passager s'est signalé"
              : pickupNotice?.type === 'parties_nearby'
                ? 'Passager prêt à embarquer'
                : 'Arrivé au point de récupération'}
          </Text>
          <Text style={styles.waypointModalPassenger}>
            {pickupNotice?.waypoint.passenger.name || 'Passager'}
          </Text>
          <View style={styles.waypointModalAddressContainer}>
            <Ionicons name="location" size={18} color={Colors.gray[500]} />
            <Text style={styles.waypointModalAddress}>
              {pickupNotice?.waypoint.address}
            </Text>
          </View>
          <Text style={styles.waypointModalWaitingText}>
            {pickupNotice?.type === 'passenger_ready_pickup'
              ? "Le passager indique qu'il est présent au point de récupération."
              : pickupNotice?.type === 'parties_nearby'
                ? `${pickupNotice?.waypoint.passenger.name || 'Le passager'} est là et prêt à être embarqué.`
                : `Vous êtes arrivé au point de récupération de ${pickupNotice?.waypoint.passenger.name || 'ce passager'}. Le passager est notifié.`}
          </Text>
          {pickupNotice?.type === 'driver_arrived_pickup' && pickupNoticeCountdown !== null && (
            <View style={styles.waypointGpsStatus}>
              <Ionicons name="timer" size={18} color={Colors.secondary} />
              <Text style={[styles.waypointGpsStatusText, { color: Colors.secondary }]}>
                {pickupNoticeCountdown > 0
                  ? `Temps restant ${Math.floor(pickupNoticeCountdown / 60)
                      .toString()
                      .padStart(2, '0')}:${(pickupNoticeCountdown % 60)
                      .toString()
                      .padStart(2, '0')}`
                  : 'Les 10 minutes sont écoulées'}
              </Text>
            </View>
          )}
          <View style={styles.waypointModalActions}>
            <TouchableOpacity
              style={styles.waypointModalSecondaryButton}
              onPress={dismissPickupNotice}
            >
              <Text style={styles.waypointModalSecondaryButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
