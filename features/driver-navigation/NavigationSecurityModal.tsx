import { styles } from '../screen-styles/app/trip/navigate/detail/index';
import TripSecurityPanel from '@/components/trip/TripSecurityPanel';
import { Colors, Spacing } from '@/constants/styles';
import type { Trip } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { RideModal as Modal } from '@/features/navigation/RideModal';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface NavigationSecurityModalProps {
  securityModalVisible: boolean;
  backgroundDisclosureVisible: boolean;
  setSecurityModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  insets: EdgeInsets;
  trip: Trip | undefined;
}

export function NavigationSecurityModal({
  securityModalVisible,
  backgroundDisclosureVisible,
  setSecurityModalVisible,
  insets,
  trip,
}: NavigationSecurityModalProps) {
  return (
    <Modal
      visible={securityModalVisible && !backgroundDisclosureVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setSecurityModalVisible(false)}
    >
      <View style={styles.securityModalOverlay}>
        <TouchableOpacity
          style={styles.securityModalBackdrop}
          activeOpacity={1}
          onPress={() => setSecurityModalVisible(false)}
        />
        <View
          style={[
            styles.securityModalContent,
            { paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.md },
          ]}
        >
          <View style={styles.securityModalHeader}>
            <Text style={styles.securityModalTitle}>Securité du trajet</Text>
            <TouchableOpacity
              style={styles.securityModalCloseButton}
              onPress={() => setSecurityModalVisible(false)}
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
                role="driver"
                tripStatus={trip.status}
                openSelectorByDefault={securityModalVisible}
                compact
              />
            </ScrollView>
          ) : (
            <View style={styles.securityModalLoading}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.securityModalLoadingText}>Chargement securité...</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
