import { styles } from '../screen-styles/app/trip/detail/index';
import { FormModal } from '@/components/forms/FormLayout';
import TripSecurityPanel from '@/components/trip/TripSecurityPanel';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Trip } from '@/types';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface TripRelativesModalProps {
  securityModalVisible: boolean;
  closeTripSecurityModal: () => void;
  insets: EdgeInsets;
  trip: Trip | undefined;
  tripSecurityRole: "driver" | "passenger";
  tripSecurityBookingId: string | undefined;
}

export function TripRelativesModal({
  securityModalVisible,
  closeTripSecurityModal,
  insets,
  trip,
  tripSecurityRole,
  tripSecurityBookingId,
}: TripRelativesModalProps) {
  return (
    <FormModal
      visible={securityModalVisible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={closeTripSecurityModal}
    >
      <View style={styles.securityModalOverlay}>
        <TouchableOpacity
          style={styles.securityModalBackdrop}
          activeOpacity={1}
          onPress={closeTripSecurityModal}
        />
        <View
          style={[
            styles.securityModalContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 16 },
          ]}
        >
          <KeyboardAvoidingView
            style={styles.securityModalKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
          >
            <View style={styles.securityModalHeader}>
              <View style={styles.securityModalHeaderCopy}>
                <Text style={styles.securityModalTitle}>Notifier mes proches</Text>
                <Text style={styles.securityModalSubtitle}>
                  Ajoutez un proche ou choisissez les personnes à prévenir pendant ce trajet.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.securityModalCloseButton}
                onPress={closeTripSecurityModal}
              >
                <Ionicons name="close" size={22} color={Colors.gray[700]} />
              </TouchableOpacity>
            </View>
            {trip ? (
              <ScrollView
                style={styles.securityModalBody}
                contentContainerStyle={styles.securityModalBodyContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <TripSecurityPanel
                  tripId={trip.id}
                  role={tripSecurityRole}
                  tripStatus={trip.status}
                  bookingId={tripSecurityBookingId}
                  openSelectorByDefault={securityModalVisible}
                  compact
                />
              </ScrollView>
            ) : (
              <View style={styles.securityModalLoading}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.securityModalLoadingText}>Chargement sécurité...</Text>
              </View>
            )}
          </KeyboardAvoidingView>
        </View>
      </View>
    </FormModal>
  );
}
