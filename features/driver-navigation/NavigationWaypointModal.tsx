import { Waypoint, PickupNotice, PickupBypassConfirmation, TripEndNotice } from './navigationModel';
import { styles } from '../screen-styles/app/trip/navigate/detail/index';
import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface NavigationWaypointModalProps {
  waypointModalVisible: boolean;
  activeWaypoint: Waypoint | null;
  backgroundDisclosureVisible: boolean;
  securityModalVisible: boolean;
  tripEndNotice: TripEndNotice | null;
  pickupNotice: PickupNotice | null;
  pickupBypassConfirmation: PickupBypassConfirmation | null;
  handleDismissWaypointModal: () => void;
  insets: EdgeInsets;
  handleReportPassenger: () => void;
}

export function NavigationWaypointModal({
  waypointModalVisible,
  activeWaypoint,
  backgroundDisclosureVisible,
  securityModalVisible,
  tripEndNotice,
  pickupNotice,
  pickupBypassConfirmation,
  handleDismissWaypointModal,
  insets,
  handleReportPassenger,
}: NavigationWaypointModalProps) {
  return (
    <Modal
      visible={
        waypointModalVisible &&
        Boolean(activeWaypoint) &&
        !backgroundDisclosureVisible &&
        !securityModalVisible &&
        !tripEndNotice &&
        !pickupNotice &&
        !pickupBypassConfirmation
      }
      transparent
      animationType="slide"
      onRequestClose={handleDismissWaypointModal}
    >
      <View style={styles.waypointModalOverlay}>
        <View style={[styles.waypointModalContent, { paddingBottom: Math.max(insets.bottom, Spacing.xl) + Spacing.lg }]}>
          {/* Indicateur de slide */}
          <View style={styles.waypointModalHandle} />
          
          {/* Icône du type de waypoint */}
          <View style={[
            styles.waypointModalIcon,
            { backgroundColor: activeWaypoint?.type === 'pickup' ? Colors.secondary : Colors.info }
          ]}>
            <Ionicons 
              name={activeWaypoint?.type === 'pickup' ? 'person-add' : 'person-remove'} 
              size={32} 
              color={Colors.white} 
            />
          </View>

          {/* Titre */}
          <Text style={styles.waypointModalTitle}>
            {activeWaypoint?.type === 'pickup' ? 'Lieu de prise en charge' : "Point d'arrivée"}
          </Text>

          {/* Nom du passager */}
          <Text style={styles.waypointModalPassenger}>
            {activeWaypoint?.passenger?.name}
          </Text>

          {/* Adresse */}
          <View style={styles.waypointModalAddressContainer}>
            <Ionicons name="location" size={18} color={Colors.gray[500]} />
            <Text style={styles.waypointModalAddress}>
              {activeWaypoint?.address}
            </Text>
          </View>

          {activeWaypoint && (
            <Text style={styles.waypointModalWaitingText}>
              {activeWaypoint.type === 'pickup'
                ? `Vous êtes arrivé au point de récupération de ${activeWaypoint.passenger.name || 'ce passager'}.`
                : `Nous sommes arrivés au point de destination de ${activeWaypoint.passenger.name || 'ce passager'}. La dépose se confirme automatiquement.`}
            </Text>
          )}

          {activeWaypoint && (
            <View
              style={[
                styles.waypointGpsStatus,
                {
                  backgroundColor:
                    activeWaypoint.type === 'pickup'
                      ? Colors.secondary + '15'
                      : Colors.success + '15',
                  borderColor:
                    activeWaypoint.type === 'pickup'
                      ? Colors.secondary
                      : Colors.success,
                },
              ]}
            >
              <Ionicons
                name="locate"
                size={18}
                color={activeWaypoint.type === 'pickup' ? Colors.secondary : Colors.success}
              />
              <Text
                style={[
                  styles.waypointGpsStatusText,
                  {
                    color: activeWaypoint.type === 'pickup' ? Colors.secondary : Colors.success,
                  },
                ]}
              >
                Confirmation automatique activée
              </Text>
            </View>
          )}

          {/* Fermeture du détail */}
          <View style={styles.waypointModalActions}>
            <TouchableOpacity
              style={styles.waypointModalSecondaryButton}
              onPress={handleDismissWaypointModal}
            >
              <Text style={styles.waypointModalSecondaryButtonText}>
                Fermer
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.waypointModalReportButton}
            onPress={handleReportPassenger}
            activeOpacity={0.9}
          >
            <Ionicons name="warning-outline" size={18} color={Colors.white} />
            <Text style={styles.waypointModalReportButtonText}>Signaler ce passager</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
