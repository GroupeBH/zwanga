import { styles } from '../screen-styles/app/trip/detail/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface TripBookingSuccessModalProps {
  bookingSuccess: { visible: boolean; seats: number; };
  insets: EdgeInsets;
  closeBookingSuccessModal: () => void;
  handleViewBookings: () => void;
}

export function TripBookingSuccessModal({
  bookingSuccess,
  insets,
  closeBookingSuccessModal,
  handleViewBookings,
}: TripBookingSuccessModalProps) {
  return (
    <Modal animationType="fade" transparent visible={bookingSuccess.visible}>
      <View style={styles.feedbackModalOverlay}>
        <View style={[styles.feedbackModalCard, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
          <View style={styles.feedbackModalIcon}>
            <Ionicons name="checkmark-circle" size={32} color={Colors.white} />
          </View>
          <Text style={styles.feedbackModalTitle}>Demande envoyée</Text>
          <Text style={styles.feedbackModalText}>
            Votre réservation de {bookingSuccess.seats} place
            {bookingSuccess.seats > 1 ? 's' : ''} est en attente de confirmation du conducteur.
          </Text>
          <View style={styles.feedbackModalActions}>
            <TouchableOpacity
              style={[
                styles.feedbackModalButton,
                styles.feedbackModalSecondary,
                styles.feedbackModalButton,
              ]}
              onPress={closeBookingSuccessModal}
            >
              <Text style={styles.feedbackModalSecondaryText}>Fermer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.feedbackModalButton, styles.feedbackModalPrimary]}
              onPress={handleViewBookings}
            >
              <Text style={styles.feedbackModalPrimaryText}>Mes réservations</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
